import { describe, expect, it } from "vitest";
import {
  MimoResponseFormatError,
  parseMimoSubtitleSnapshot,
  validateMimoSubtitleSnapshot,
} from "./response-schema";

describe("MiMo subtitle response schema", () => {
  it("accepts a valid subtitle snapshot", () => {
    expect(
      validateMimoSubtitleSnapshot({
        requestId: 18,
        subtitles: [
          {
            sourceText: "The model runs locally.",
            translatedText: "该模型在本地运行。",
            revised: false,
          },
        ],
      }),
    ).toEqual({
      requestId: 18,
      subtitles: [
        {
          sourceText: "The model runs locally.",
          translatedText: "该模型在本地运行。",
          revised: false,
        },
      ],
    });
  });

  it("rejects free text and malformed JSON", () => {
    expect(() => parseMimoSubtitleSnapshot("not json")).toThrow(
      MimoResponseFormatError,
    );
    expect(() =>
      validateMimoSubtitleSnapshot({
        requestId: 1,
        subtitles: [
          {
            sourceText: "Hello",
            translatedText: "你好",
            revised: "no",
          },
        ],
      }),
    ).toThrow(MimoResponseFormatError);
  });
});
