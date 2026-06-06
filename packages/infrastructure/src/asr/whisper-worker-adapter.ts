// packages/infrastructure/src/asr/whisper-worker-adapter.ts

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { StringDecoder } from "string_decoder";

/**
 * ASR Worker 消息类型
 */
export interface AsrMessage {
  readonly type: string;
  readonly session_id?: string;
  readonly sequence?: number;
  readonly text?: string;
  readonly confidence?: number;
  readonly start_ms?: number;
  readonly end_ms?: number;
  readonly is_final?: boolean;
  readonly error_code?: string;
  readonly error_message?: string;
  readonly status?: string;
  readonly message?: string;
}

/**
 * ASR Worker 适配器
 */
export class WhisperWorkerAdapter extends EventEmitter {
  private process: ChildProcess | null = null;
  private isReady: boolean = false;
  private sequenceCounter: number = 0;
  private stdoutBuffer: string = "";
  private stdoutDecoder: StringDecoder = new StringDecoder("utf8");

  /**
   * 启动 Worker
   */
  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.process = spawn("uv", ["run", "python", "-m", "asr_worker.main"], {
        cwd: "workers/asr",
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.process.stdout?.on("data", (data: Buffer) => {
        this._handleStdoutChunk(data);
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        console.error("ASR Worker stderr:", data.toString());
      });

      this.process.on("error", (error: Error) => {
        this.emit("error", error);
        reject(error);
      });

      this.process.on("exit", (code: number | null) => {
        this.emit("exit", code);
        this.process = null;
        this.isReady = false;
        this.resetStdoutBuffer();
      });

      // 等待 ready 状态
      this.once("ready", () => {
        resolve();
      });

      // 超时处理
      setTimeout(() => {
        if (!this.isReady) {
          reject(new Error("ASR Worker startup timeout"));
        }
      }, 5000);
    });
  }

  /**
   * 停止 Worker
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.isReady = false;
    }
    this.resetStdoutBuffer();
  }

  /**
   * 发送音频数据
   */
  sendAudio(sessionId: string, audioData: string, sampleRate: number = 16000, channels: number = 1): void {
    if (!this.process || !this.isReady) {
      throw new Error("ASR Worker is not ready");
    }

    this.sequenceCounter++;
    const message = {
      type: "audio",
      session_id: sessionId,
      sequence: this.sequenceCounter,
      audio_data: audioData,
      sample_rate: sampleRate,
      channels: channels,
    };

    this.process.stdin?.write(JSON.stringify(message) + "\n");
  }

  /**
   * 检查是否就绪
   */
  getIsReady(): boolean {
    return this.isReady;
  }

  private _handleStdoutChunk(data: Buffer): void {
    this.stdoutBuffer += this.stdoutDecoder.write(data);
    const lines = this.stdoutBuffer.split("\n");
    this.stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) {
        this._handleMessage(line);
      }
    }
  }

  private resetStdoutBuffer(): void {
    this.stdoutBuffer = "";
    this.stdoutDecoder = new StringDecoder("utf8");
  }

  /**
   * 处理消息
   */
  private _handleMessage(line: string): void {
    try {
      const message: AsrMessage = JSON.parse(line);

      if (message.type === "status" && message.status === "ready") {
        this.isReady = true;
        this.emit("ready");
      } else if (message.type === "result") {
        this.emit("result", message);
      } else if (message.type === "error") {
        this.emit("error", new Error(message.error_message || "Unknown error"));
      }
    } catch (error) {
      this.emit("error", new Error(`Failed to parse message: ${line}`));
    }
  }
}
