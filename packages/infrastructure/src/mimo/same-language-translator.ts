import type {
  SubtitleSnapshot,
  SubtitleTranslationRequest,
  TranslatorPort,
} from "@simulcast/application";

export class SameLanguageTranslator implements TranslatorPort {
  async translate(
    request: SubtitleTranslationRequest,
  ): Promise<SubtitleSnapshot> {
    return {
      requestId: request.requestId,
      subtitles: request.rawTranscriptWindows.map((window) => ({
        sourceText: window.text,
        translatedText: window.text,
        revised: false,
        revisionReason: "same-language",
      })),
    };
  }
}

export class LanguageAwareTranslator implements TranslatorPort {
  constructor(
    private readonly downstream: TranslatorPort,
    private readonly sameLanguage = new SameLanguageTranslator(),
  ) {}

  translate(request: SubtitleTranslationRequest): Promise<SubtitleSnapshot> {
    if (
      request.sourceLanguage !== "unknown"
      && request.sourceLanguage === request.targetLanguage
    ) {
      return this.sameLanguage.translate(request);
    }
    return this.downstream.translate(request);
  }
}
