// apps/desktop/src/renderer/features/audio/audio-capture.ts

import type { AudioCaptureState, AudioCaptureStatus } from "@simulcast/contracts";
import { createAudioLevel } from "@simulcast/contracts";
import { VolumeMeter } from "./volume-meter";

/**
 * 音频采集管理器
 */
export class AudioCapture {
  private state: AudioCaptureState = "idle";
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private volumeMeter: VolumeMeter;
  private onStatusChange: ((status: AudioCaptureStatus) => void) | null = null;
  private onPcmData: ((data: Int16Array) => void) | null = null;

  constructor() {
    this.volumeMeter = new VolumeMeter();
  }

  /**
   * 设置状态回调
   */
  setOnStatusChange(callback: (status: AudioCaptureStatus) => void): void {
    this.onStatusChange = callback;
  }

  /**
   * 设置 PCM 数据回调
   */
  setOnPcmData(callback: (data: Int16Array) => void): void {
    this.onPcmData = callback;
  }

  /**
   * 开始采集
   */
  async start(): Promise<void> {
    if (this.state === "capturing") {
      return;
    }

    this.setState("requesting");

    try {
      // 请求系统音频
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // 创建 AudioContext
      this.audioContext = new AudioContext({ sampleRate: 16000 });

      // 加载 AudioWorklet
      await this.audioContext.audioWorklet.addModule(
        new URL("./pcm-worklet.ts", import.meta.url).href
      );

      // 创建 AudioWorkletNode
      this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-processor");

      // 连接音频流
      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.workletNode);

      // 监听 PCM 数据
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === "pcm") {
          const pcmData = event.data.data as Int16Array;
          const level = this.volumeMeter.update(pcmData);

          this.onPcmData?.(pcmData);
          this.onStatusChange?.({
            state: "capturing",
            level: createAudioLevel(level),
            error: null,
          });
        }
      };

      this.setState("capturing");
    } catch (error) {
      this.setState("error", error instanceof Error ? error.message : "未知错误");
      throw error;
    }
  }

  /**
   * 停止采集
   */
  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.workletNode = null;
    this.volumeMeter.reset();
    this.setState("idle");
  }

  /**
   * 获取当前状态
   */
  getState(): AudioCaptureState {
    return this.state;
  }

  /**
   * 设置状态
   */
  private setState(state: AudioCaptureState, error?: string): void {
    this.state = state;
    this.onStatusChange?.({
      state,
      level: state === "capturing" ? createAudioLevel(this.volumeMeter.getLevel()) : null,
      error: error ?? null,
    });
  }
}
