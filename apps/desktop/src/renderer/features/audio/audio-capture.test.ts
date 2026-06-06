// apps/desktop/src/renderer/features/audio/audio-capture.test.ts

import { describe, it, expect, vi } from "vitest";
import { AudioCapture } from "./audio-capture";

describe("AudioCapture", () => {
  it("initializes with idle state", () => {
    const capture = new AudioCapture();

    expect(capture.getState()).toBe("idle");
  });

  it("sets status callback", () => {
    const capture = new AudioCapture();
    const callback = vi.fn();

    capture.setOnStatusChange(callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it("sets pcm data callback", () => {
    const capture = new AudioCapture();
    const callback = vi.fn();

    capture.setOnPcmData(callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it("stops capture", () => {
    const capture = new AudioCapture();

    // 停止不应抛出错误
    capture.stop();

    expect(capture.getState()).toBe("idle");
  });
});
