// packages/contracts/src/audio.ts

/**
 * 音频采集状态
 */
export type AudioCaptureState = "idle" | "requesting" | "capturing" | "error";

/**
 * 音频电平数据
 */
export interface AudioLevel {
  readonly level: number; // 0-100
  readonly timestamp: number;
}

/**
 * 音频采集配置
 */
export interface AudioCaptureConfig {
  readonly sampleRate: number; // 16000
  readonly channels: number; // 1
  readonly bufferSize: number; // 200-500ms
}

/**
 * 默认音频配置
 */
export const DEFAULT_AUDIO_CONFIG: AudioCaptureConfig = {
  sampleRate: 16000,
  channels: 1,
  bufferSize: 400, // 400ms
};

/**
 * 音频采集状态接口
 */
export interface AudioCaptureStatus {
  readonly state: AudioCaptureState;
  readonly level: AudioLevel | null;
  readonly error: string | null;
}

/**
 * 创建音频电平
 */
export function createAudioLevel(level: number, timestamp: number = Date.now()): AudioLevel {
  return {
    level: Math.max(0, Math.min(100, level)),
    timestamp,
  };
}

/**
 * 验证音频配置
 */
export function validateAudioConfig(config: AudioCaptureConfig): boolean {
  if (config.sampleRate !== 16000) {
    return false;
  }

  if (config.channels !== 1) {
    return false;
  }

  if (config.bufferSize < 200 || config.bufferSize > 500) {
    return false;
  }

  return true;
}
