// apps/desktop/src/renderer/features/audio/pcm-worklet.ts

/**
 * PCM AudioWorklet 处理器
 * 将音频数据转换为 16kHz 单声道 PCM
 */
class PcmProcessor extends AudioWorkletProcessor {
  private sampleRate: number;
  private targetSampleRate: number;
  private buffer: Float32Array;
  private bufferIndex: number;

  constructor() {
    super();
    this.sampleRate = sampleRate;
    this.targetSampleRate = 16000;
    this.buffer = new Float32Array(1024);
    this.bufferIndex = 0;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input[0];
    if (!channelData) {
      return true;
    }

    // 重采样到 16kHz
    const resampled = this.resample(channelData, this.sampleRate, this.targetSampleRate);

    // 转换为 16-bit PCM
    const pcm = this.convertToPcm(resampled);

    // 发送到主线程
    this.port.postMessage({
      type: "pcm",
      data: pcm,
      sampleRate: this.targetSampleRate,
      channels: 1,
    });

    return true;
  }

  private resample(data: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) {
      return data;
    }

    const ratio = fromRate / toRate;
    const newLength = Math.round(data.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const index = i * ratio;
      const low = Math.floor(index);
      const high = Math.ceil(index);
      const fraction = index - low;

      if (high >= data.length) {
        result[i] = data[low] ?? 0;
      } else {
        result[i] = (data[low] ?? 0) * (1 - fraction) + (data[high] ?? 0) * fraction;
      }
    }

    return result;
  }

  private convertToPcm(data: Float32Array): Int16Array {
    const pcm = new Int16Array(data.length);

    for (let i = 0; i < data.length; i++) {
      const sample = Math.max(-1, Math.min(1, data[i] ?? 0));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }

    return pcm;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
