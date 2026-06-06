// apps/desktop/src/renderer/features/audio/audio-capture.ts

import type { AudioCaptureState, AudioCaptureStatus } from "@simulcast/contracts";
import { createAudioLevel } from "@simulcast/contracts";
import { VolumeMeter } from "./volume-meter";

export interface AudioCaptureDependencies {
  readonly getDisplayMedia: (
    constraints: DisplayMediaStreamOptions,
  ) => Promise<MediaStream>;
  readonly createAudioContext: () => AudioContext;
  readonly createWorkletNode: (
    context: AudioContext,
    name: string,
  ) => AudioWorkletNode;
}

function createDefaultDependencies(): AudioCaptureDependencies {
  return {
    getDisplayMedia: (constraints) =>
      navigator.mediaDevices.getDisplayMedia(constraints),
    createAudioContext: () => new AudioContext({ sampleRate: 16000 }),
    createWorkletNode: (context, name) =>
      new AudioWorkletNode(context, name),
  };
}

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
  private readonly dependencies: AudioCaptureDependencies;

  constructor(dependencies: AudioCaptureDependencies = createDefaultDependencies()) {
    this.volumeMeter = new VolumeMeter();
    this.dependencies = dependencies;
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
      this.stream = await this.dependencies.getDisplayMedia({
        audio: true,
        video: true,
      });
      this.stream.getVideoTracks().forEach((track) => track.stop());

      if (this.stream.getAudioTracks().length === 0) {
        throw new Error("未获取到系统音频轨道");
      }

      // 创建 AudioContext
      this.audioContext = this.dependencies.createAudioContext();

      // 加载 AudioWorklet
      await this.audioContext.audioWorklet.addModule(
        new URL("./pcm-worklet.js", import.meta.url).href
      );

      // 创建 AudioWorkletNode
      this.workletNode = this.dependencies.createWorkletNode(
        this.audioContext,
        "pcm-processor",
      );

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
      this.releaseResources();
      this.setState("error", error instanceof Error ? error.message : "未知错误");
      throw error;
    }
  }

  /**
   * 停止采集
   */
  stop(): void {
    this.releaseResources();
    this.volumeMeter.reset();
    this.setState("idle");
  }

  private releaseResources(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.workletNode = null;
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
