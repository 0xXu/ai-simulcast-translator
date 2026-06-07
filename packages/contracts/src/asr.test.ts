import { describe, expect, expectTypeOf, it } from "vitest";
import {
  PROTOCOL_VERSION,
  AsrAudioRequestSchema,
  AsrSessionRequestSchema,
  validateAsrAudioRequest,
  validateAsrSessionRequest,
  type AsrEvent,
} from "./index";

const baseMessage = {
  protocolVersion: PROTOCOL_VERSION,
  timestamp: 100,
};

describe("ASR contracts", () => {
  it("accepts and trims a valid session request", () => {
    const request = {
      ...baseMessage,
      sessionId: " session-1 ",
      languages: {
        sourceLanguage: "auto",
        targetLanguage: "zh",
      },
    };

    expect(AsrSessionRequestSchema.parse(request)).toEqual({
      ...baseMessage,
      sessionId: "session-1",
      languages: {
        sourceLanguage: "auto",
        targetLanguage: "zh",
      },
    });
    expect(validateAsrSessionRequest(request).sessionId).toBe("session-1");
  });

  it.each([1, 128])(
    "accepts a sessionId with trimmed length %i",
    (length) => {
      const trimmedSessionId = "a".repeat(length);

      expect(
        AsrSessionRequestSchema.parse({
          ...baseMessage,
          sessionId: ` ${trimmedSessionId} `,
          languages: {
            sourceLanguage: "en",
            targetLanguage: "ja",
          },
        }).sessionId,
      ).toBe(trimmedSessionId);
    },
  );

  it.each(["", "   ", "a".repeat(129)])(
    "rejects invalid sessionId %j",
    (sessionId) => {
      expect(() =>
        AsrSessionRequestSchema.parse({
          ...baseMessage,
          sessionId,
          languages: {
            sourceLanguage: "auto",
            targetLanguage: "zh",
          },
        }),
      ).toThrow();
    },
  );

  it.each(["", "not base64!", "A", "AA=A", "AB==", "AAB="])(
    "rejects invalid base64 audio data %j",
    (audioData) => {
      expect(() =>
        AsrAudioRequestSchema.parse({
          ...baseMessage,
          sessionId: "session-1",
          audioData,
          sampleRate: 16_000,
          channels: 1,
        }),
      ).toThrow();
    },
  );

  it("rejects unsupported sample rates", () => {
    expect(() =>
      AsrAudioRequestSchema.parse({
        ...baseMessage,
        sessionId: "session-1",
        audioData: "AQIDBA==",
        sampleRate: 44_100,
        channels: 1,
      }),
    ).toThrow();
  });

  it("rejects unsupported channel counts", () => {
    expect(() =>
      AsrAudioRequestSchema.parse({
        ...baseMessage,
        sessionId: "session-1",
        audioData: "AQIDBA==",
        sampleRate: 16_000,
        channels: 2,
      }),
    ).toThrow();
  });

  it("accepts a valid audio request", () => {
    const request = validateAsrAudioRequest({
      ...baseMessage,
      sessionId: "session-1",
      audioData: "AQIDBA==",
      sampleRate: 16_000,
      channels: 1,
    });

    expect(request.sampleRate).toBe(16_000);
    expect(request.channels).toBe(1);
  });

  it("rejects unknown request fields", () => {
    expect(() =>
      AsrSessionRequestSchema.parse({
        ...baseMessage,
        sessionId: "session-1",
        languages: {
          sourceLanguage: "auto",
          targetLanguage: "zh",
        },
        unexpected: true,
      }),
    ).toThrow();
  });

  it.each([
    { sourceLanguage: "xx", targetLanguage: "zh" },
    { sourceLanguage: "auto", targetLanguage: "xx" },
    { sourceLanguage: "auto" },
  ])("rejects invalid session languages %j", (languages) => {
    expect(() =>
      AsrSessionRequestSchema.parse({
        ...baseMessage,
        sessionId: "session-1",
        languages,
      }),
    ).toThrow();
  });

  it("models transcript, status, and error events", () => {
    const events: AsrEvent[] = [
      {
        type: "status",
        sessionId: "session-1",
        state: "ready",
        message: null,
      },
      {
        type: "transcript",
        sessionId: "session-1",
        sequence: 4,
        text: "Hello world",
        confidence: 0.9,
        startMs: 0,
        endMs: 1_200,
        isFinal: false,
        detectedLanguage: "en",
        languageProbability: 0.96,
      },
      {
        type: "error",
        sessionId: "session-1",
        code: "WORKER_EXITED",
        message: "ASR Worker exited",
        recoverable: true,
      },
    ];

    expect(events.map((event) => event.type)).toEqual([
      "status",
      "transcript",
      "error",
    ]);

    for (const event of events) {
      if (event.type === "transcript") {
        expectTypeOf(event.sequence).toEqualTypeOf<number>();
        expect(event.detectedLanguage).toBe("en");
      }
    }
  });
});
