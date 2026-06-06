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

  it("captures display audio and stops the unused video track", async () => {
    const videoTrack = { stop: vi.fn() };
    const audioTrack = { stop: vi.fn() };
    const stream = {
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [audioTrack],
      getTracks: () => [videoTrack, audioTrack],
    } as unknown as MediaStream;
    const getDisplayMedia = vi.fn().mockResolvedValue(stream);
    const addModule = vi.fn().mockResolvedValue(undefined);
    const connect = vi.fn();
    const audioContext = {
      audioWorklet: { addModule },
      createMediaStreamSource: vi.fn(() => ({ connect })),
      close: vi.fn(),
    } as unknown as AudioContext;
    const workletNode = {
      port: { onmessage: null },
    } as unknown as AudioWorkletNode;
    const capture = new AudioCapture({
      getDisplayMedia,
      createAudioContext: () => audioContext,
      createWorkletNode: () => workletNode,
    });

    await capture.start();

    expect(getDisplayMedia).toHaveBeenCalledWith({
      audio: true,
      video: true,
    });
    expect(videoTrack.stop).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledWith(workletNode);
    expect(capture.getState()).toBe("capturing");
  });
});
