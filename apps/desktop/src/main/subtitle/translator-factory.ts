import type {
  SubtitleSnapshot,
  SubtitleTranslationRequest,
  TranslatorPort,
} from "@simulcast/application";
import { MimoClient } from "@simulcast/infrastructure";

export class SourceTextFallbackTranslator implements TranslatorPort {
  async translate(
    request: SubtitleTranslationRequest,
  ): Promise<SubtitleSnapshot> {
    return {
      requestId: request.requestId,
      subtitles: request.rawTranscriptWindows.map((window) => ({
        sourceText: window.text,
        translatedText: window.text,
        revised: false,
        revisionReason: "mimo-unconfigured",
      })),
    };
  }
}

export function createTranslatorFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): TranslatorPort {
  const apiKey = env.MIMO_API_KEY?.trim();
  const baseUrl = (env.MIMO_BASE_URL ?? env.MIMO_API_BASE_URL)?.trim();

  if (!apiKey || !baseUrl) {
    return new SourceTextFallbackTranslator();
  }

  return new MimoClient({
    apiKey,
    baseUrl,
    model: env.MIMO_MODEL?.trim() || "mimo-v2.5",
  });
}
