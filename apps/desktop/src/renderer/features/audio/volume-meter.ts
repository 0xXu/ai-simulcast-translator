// apps/desktop/src/renderer/features/audio/volume-meter.ts

/**
 * 音量电平计算器
 */
export class VolumeMeter {
  private level: number = 0;
  private smoothing: number = 0.8;

  /**
   * 更新音量电平
   */
  update(pcmData: Int16Array): number {
    if (pcmData.length === 0) {
      this.level = 0;
      return 0;
    }

    // 计算 RMS
    let sum = 0;
    for (let i = 0; i < pcmData.length; i++) {
      const sample = (pcmData[i] ?? 0) / 32768; // 归一化到 -1 到 1
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / pcmData.length);

    // 转换为 dB
    const db = 20 * Math.log10(Math.max(rms, 1e-10));

    // 归一化到 0-100
    const normalized = Math.max(0, Math.min(100, (db + 60) * (100 / 60)));

    // 平滑处理
    this.level = this.level * this.smoothing + normalized * (1 - this.smoothing);

    return Math.round(this.level);
  }

  /**
   * 获取当前电平
   */
  getLevel(): number {
    return Math.round(this.level);
  }

  /**
   * 重置电平
   */
  reset(): void {
    this.level = 0;
  }
}
