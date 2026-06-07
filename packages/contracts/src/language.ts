export const LANGUAGE_OPTIONS = Object.freeze([
  { code: "zh", label: "简体中文", promptName: "简体中文" },
  { code: "en", label: "英语", promptName: "英语" },
  { code: "ja", label: "日语", promptName: "日语" },
  { code: "ko", label: "韩语", promptName: "韩语" },
  { code: "fr", label: "法语", promptName: "法语" },
  { code: "de", label: "德语", promptName: "德语" },
  { code: "es", label: "西班牙语", promptName: "西班牙语" },
  { code: "it", label: "意大利语", promptName: "意大利语" },
  { code: "pt", label: "葡萄牙语", promptName: "葡萄牙语" },
  { code: "ru", label: "俄语", promptName: "俄语" },
  { code: "ar", label: "阿拉伯语", promptName: "阿拉伯语" },
  { code: "hi", label: "印地语", promptName: "印地语" },
] as const);

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]["code"];
export type SourceLanguageCode = LanguageCode | "auto";

export interface TranslationSessionLanguages {
  readonly sourceLanguage: SourceLanguageCode;
  readonly targetLanguage: LanguageCode;
}

export const DEFAULT_SESSION_LANGUAGES: TranslationSessionLanguages =
  Object.freeze({
    sourceLanguage: "auto",
    targetLanguage: "zh",
  });

const LANGUAGE_CODES = new Set<string>(
  LANGUAGE_OPTIONS.map((option) => option.code),
);

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && LANGUAGE_CODES.has(value);
}

export function isSourceLanguageCode(
  value: unknown,
): value is SourceLanguageCode {
  return value === "auto" || isLanguageCode(value);
}

export function getLanguageOption(code: LanguageCode) {
  return LANGUAGE_OPTIONS.find((option) => option.code === code);
}
