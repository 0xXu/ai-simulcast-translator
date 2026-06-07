import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_LANGUAGES,
  LANGUAGE_OPTIONS,
  getLanguageOption,
  isLanguageCode,
  isSourceLanguageCode,
} from "./language";

describe("language catalog", () => {
  it("uses automatic source detection and Chinese as defaults", () => {
    expect(DEFAULT_SESSION_LANGUAGES).toEqual({
      sourceLanguage: "auto",
      targetLanguage: "zh",
    });
  });

  it("contains unique stable language codes", () => {
    const codes = LANGUAGE_OPTIONS.map((option) => option.code);

    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual([
      "zh",
      "en",
      "ja",
      "ko",
      "fr",
      "de",
      "es",
      "it",
      "pt",
      "ru",
      "ar",
      "hi",
    ]);
  });

  it("validates source and target language codes", () => {
    expect(isLanguageCode("ja")).toBe(true);
    expect(isLanguageCode("auto")).toBe(false);
    expect(isLanguageCode("xx")).toBe(false);
    expect(isSourceLanguageCode("auto")).toBe(true);
    expect(isSourceLanguageCode("ja")).toBe(true);
  });

  it("resolves display metadata by code", () => {
    expect(getLanguageOption("en")).toEqual({
      code: "en",
      label: "英语",
      promptName: "英语",
    });
  });
});
