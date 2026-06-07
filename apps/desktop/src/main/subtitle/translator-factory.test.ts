import type { SubtitleTranslationRequest } from "@simulcast/application";
import { MimoClient } from "@simulcast/infrastructure";
import { describe, expect, it } from "vitest";
import {
  SourceTextFallbackTranslator,
  createTranslatorFromEnv,
} from "./translator-factory";

describe("createTranslatorFromEnv", () => {
  it("uses MiMo when an API key and base URL are configured", () => {
    expect(
      createTranslatorFromEnv({
        MIMO_API_KEY: "secret",
        MIMO_BASE_URL: "https://mimo.example/v1",
      }),
    ).toBeInstanceOf(MimoClient);
  });

  it("falls back to source text when MiMo config is incomplete", async () => {
    const translator = createTranslatorFromEnv({ MIMO_API_KEY: "secret" });

    expect(translator).toBeInstanceOf(SourceTextFallbackTranslator);
    await expect(translator.translate(request("hello"))).resolves.toEqual({
      requestId: 1,
      subtitles: [
        {
          sourceText: "hello",
          translatedText: "hello",
          revised: false,
          revisionReason: "mimo-unconfigured",
        },
      ],
    });
  });
});

function request(text: string): SubtitleTranslationRequest {
  return {
    requestId: 1,
    sessionId: "session-1",
    rawTranscriptWindows: [
      {
        sequence: 1,
        text,
        confidence: 0.9,
        startMs: 0,
        endMs: 100,
        isFinal: true,
      },
    ],
    contextSubtitles: [],
  };
}
