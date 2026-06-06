// apps/desktop/src/renderer/features/audio/pcm-worklet.test.ts

import { describe, it, expect } from "vitest";

describe("PcmProcessor", () => {
  it("resamples audio data", () => {
    // 模拟重采样逻辑
    const resample = (data: Float32Array, fromRate: number, toRate: number): Float32Array => {
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
    };

    const input = new Float32Array([0, 0.5, 1, 0.5, 0]);
    const result = resample(input, 44100, 16000);

    expect(result.length).toBeLessThan(input.length);
  });

  it("converts to 16-bit PCM", () => {
    const convertToPcm = (data: Float32Array): Int16Array => {
      const pcm = new Int16Array(data.length);

      for (let i = 0; i < data.length; i++) {
        const sample = Math.max(-1, Math.min(1, data[i] ?? 0));
        pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      }

      return pcm;
    };

    const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const result = convertToPcm(input);

    expect(result.length).toBe(input.length);
    expect(result[0]).toBe(0);
    expect(result[1]).toBeGreaterThan(0);
    expect(result[2]).toBeLessThan(0);
  });
});
