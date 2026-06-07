import { describe, expect, it, vi } from "vitest";
import type {
  SubtitleSnapshot,
  SubtitleTranslationRequest,
  TranslatorPort,
} from "@simulcast/application";
import {
  LanguageAwareTranslator,
  SameLanguageTranslator,
} from "./same-language-translator";

describe("SameLanguageTranslator", () => {
  it("returns source text without calling a network translator", async () => {
    const downstream: TranslatorPort = {
      translate: vi.fn(async (): Promise<SubtitleSnapshot> => ({
        requestId: 1,
        subtitles: [],
      })),
    };
    const translator = new LanguageAwareTranslator(
      downstream,
      new SameLanguageTranslator(),
    );

    const snapshot = await translator.translate(request("en", "en"));

    expect(downstream.translate).not.toHaveBeenCalled();
    expect(snapshot).toEqual({
      requestId: 1,
      subtitles: [
        {
          sourceText: "Hello",
          translatedText: "Hello",
          revised: false,
          revisionReason: "same-language",
        },
      ],
    });
  });

  it("delegates unknown or different language requests", async () => {
    const downstream: TranslatorPort = {
      translate: vi.fn(async (input): Promise<SubtitleSnapshot> => ({
        requestId: input.requestId,
        subtitles: [],
      })),
    };
    const translator = new LanguageAwareTranslator(downstream);

    await translator.translate(request("unknown", "en"));
    await translator.translate(request("ja", "en"));

    expect(downstream.translate).toHaveBeenCalledTimes(2);
  });
});

function request(
  sourceLanguage: SubtitleTranslationRequest["sourceLanguage"],
  targetLanguage: SubtitleTranslationRequest["targetLanguage"],
): SubtitleTranslationRequest {
  return {
    requestId: 1,
    sessionId: "session-1",
    sourceLanguage,
    targetLanguage,
    rawTranscriptWindows: [
      {
        sequence: 1,
        text: "Hello",
        confidence: 0.9,
        startMs: 0,
        endMs: 1_000,
        isFinal: false,
      },
    ],
    contextSubtitles: [],
  };
}
