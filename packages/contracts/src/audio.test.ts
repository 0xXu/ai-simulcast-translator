// packages/contracts/src/audio.test.ts

import { describe, it, expect } from "vitest";
import {
  createAudioLevel,
  validateAudioConfig,
  DEFAULT_AUDIO_CONFIG,
} from "./audio";

describe("Audio Types", () => {
  describe("createAudioLevel", () => {
    it("creates audio level with valid value", () => {
      const level = createAudioLevel(50);

      expect(level.level).toBe(50);
      expect(level.timestamp).toBeGreaterThan(0);
    });

    it("clamps level to 0-100 range", () => {
      expect(createAudioLevel(-10).level).toBe(0);
      expect(createAudioLevel(150).level).toBe(100);
    });

    it("uses provided timestamp", () => {
      const timestamp = 1234567890;
      const level = createAudioLevel(50, timestamp);

      expect(level.timestamp).toBe(timestamp);
    });
  });

  describe("validateAudioConfig", () => {
    it("validates correct config", () => {
      expect(validateAudioConfig(DEFAULT_AUDIO_CONFIG)).toBe(true);
    });

    it("rejects invalid sample rate", () => {
      const config = { ...DEFAULT_AUDIO_CONFIG, sampleRate: 44100 };
      expect(validateAudioConfig(config)).toBe(false);
    });

    it("rejects invalid channels", () => {
      const config = { ...DEFAULT_AUDIO_CONFIG, channels: 2 };
      expect(validateAudioConfig(config)).toBe(false);
    });

    it("rejects invalid buffer size", () => {
      const config = { ...DEFAULT_AUDIO_CONFIG, bufferSize: 100 };
      expect(validateAudioConfig(config)).toBe(false);
    });
  });
});
