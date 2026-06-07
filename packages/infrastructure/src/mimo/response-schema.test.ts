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

  it("accepts a valid snapshot wrapped in a JSON markdown fence", () => {
    expect(
      parseMimoSubtitleSnapshot([
        "```json",
        JSON.stringify({
          requestId: 19,
          subtitles: [
            {
              sourceText: "The bank is next to the river.",
              translatedText: "河岸就在河边。",
              revised: true,
            },
          ],
        }),
        "```",
      ].join("\n")),
    ).toEqual({
      requestId: 19,
      subtitles: [
        {
          sourceText: "The bank is next to the river.",
          translatedText: "河岸就在河边。",
          revised: true,
        },
      ],
    });
  });
});
