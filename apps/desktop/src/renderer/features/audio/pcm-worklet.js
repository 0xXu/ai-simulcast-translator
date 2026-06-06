class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sourceSampleRate = sampleRate;
    this.targetSampleRate = 16000;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input[0];
    if (!channelData) {
      return true;
    }

    const resampled = this.resample(
      channelData,
      this.sourceSampleRate,
      this.targetSampleRate,
    );
    const pcm = this.convertToPcm(resampled);

    this.port.postMessage({
      type: "pcm",
      data: pcm,
      sampleRate: this.targetSampleRate,
      channels: 1,
    });

    return true;
  }

  resample(data, fromRate, toRate) {
    if (fromRate === toRate) {
      return data;
    }

    const ratio = fromRate / toRate;
    const newLength = Math.round(data.length / ratio);
    const result = new Float32Array(newLength);

    for (let index = 0; index < newLength; index += 1) {
      const sourceIndex = index * ratio;
      const low = Math.floor(sourceIndex);
      const high = Math.ceil(sourceIndex);
      const fraction = sourceIndex - low;

      if (high >= data.length) {
        result[index] = data[low] ?? 0;
      } else {
        result[index] =
          (data[low] ?? 0) * (1 - fraction)
          + (data[high] ?? 0) * fraction;
      }
    }

    return result;
  }

  convertToPcm(data) {
    const pcm = new Int16Array(data.length);

    for (let index = 0; index < data.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, data[index] ?? 0));
      pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    return pcm;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
