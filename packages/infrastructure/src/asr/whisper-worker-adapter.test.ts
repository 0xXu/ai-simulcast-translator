// packages/infrastructure/src/asr/whisper-worker-adapter.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WhisperWorkerAdapter } from "./whisper-worker-adapter";

describe("WhisperWorkerAdapter", () => {
  let adapter: WhisperWorkerAdapter;

  beforeEach(() => {
    adapter = new WhisperWorkerAdapter();
  });

  afterEach(() => {
    adapter.stop();
  });

  it("initializes with not ready state", () => {
    expect(adapter.getIsReady()).toBe(false);
  });

  it("emits ready event", () => {
    const readyCallback = vi.fn();
    adapter.on("ready", readyCallback);

    // 模拟 ready 消息
    adapter["_handleMessage"]('{"type": "status", "status": "ready"}');

    expect(readyCallback).toHaveBeenCalled();
    expect(adapter.getIsReady()).toBe(true);
  });

  it("emits result event", () => {
    const resultCallback = vi.fn();
    adapter.on("result", resultCallback);

    // 模拟 result 消息
    adapter["_handleMessage"]('{"type": "result", "session_id": "session-001", "sequence": 1, "text": "Hello", "confidence": 0.95, "start_ms": 0, "end_ms": 1000, "is_final": true}');

    expect(resultCallback).toHaveBeenCalled();
    expect(resultCallback.mock.calls[0][0].text).toBe("Hello");
  });

  it("emits error event", () => {
    const errorCallback = vi.fn();
    adapter.on("error", errorCallback);

    // 模拟 error 消息
    adapter["_handleMessage"]('{"type": "error", "session_id": "session-001", "error_code": "INVALID_AUDIO", "error_message": "Invalid audio format"}');

    expect(errorCallback).toHaveBeenCalled();
  });

  it("throws when sending audio before ready", () => {
    expect(() => {
      adapter.sendAudio("session-001", "base64data");
    }).toThrow("ASR Worker is not ready");
  });
});
