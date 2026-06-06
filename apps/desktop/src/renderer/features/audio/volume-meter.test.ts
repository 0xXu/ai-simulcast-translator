// apps/desktop/src/renderer/features/audio/volume-meter.test.ts

import { describe, it, expect } from "vitest";
import { VolumeMeter } from "./volume-meter";

describe("VolumeMeter", () => {
  it("calculates level from PCM data", () => {
    const meter = new VolumeMeter();
    const pcmData = new Int16Array([0, 16384, -16384, 32767, -32768]);

    const level = meter.update(pcmData);

    expect(level).toBeGreaterThanOrEqual(0);
    expect(level).toBeLessThanOrEqual(100);
  });

  it("returns 0 for empty data", () => {
    const meter = new VolumeMeter();
    const pcmData = new Int16Array([]);

    const level = meter.update(pcmData);

    expect(level).toBe(0);
  });

  it("smooths level over time", () => {
    const meter = new VolumeMeter();

    // 连续更新多次
    for (let i = 0; i < 10; i++) {
      const pcmData = new Int16Array([16384, 16384, 16384]);
      meter.update(pcmData);
    }

    const level = meter.getLevel();
    expect(level).toBeGreaterThan(0);
  });

  it("resets level", () => {
    const meter = new VolumeMeter();

    // 更新几次
    const pcmData = new Int16Array([16384, 16384]);
    meter.update(pcmData);
    meter.update(pcmData);

    meter.reset();

    expect(meter.getLevel()).toBe(0);
  });
});
