import { render, screen } from "@testing-library/react";
import { SubtitleLine } from "./subtitle-line";
import type { SubtitleLineView } from "../../entities/subtitle/subtitle-store";

describe("SubtitleLine", () => {
  it("renders translated text with optional English source", () => {
    render(<SubtitleLine line={line()} />);

    expect(screen.getByText("该模型在本地运行。")).toHaveAttribute(
      "lang",
      "zh-CN",
    );
    expect(screen.getByText("The model runs locally.")).toHaveAttribute(
      "lang",
      "en",
    );
  });

  it("marks semantic rewind revisions with highlight styling", () => {
    render(
      <SubtitleLine
        line={line({
          highlighted: true,
          revisionReason: "后文补全术语",
        })}
      />,
    );

    const article = screen.getByText("该模型在本地运行。").closest("article");
    expect(article).toHaveClass("is-highlighted");
    expect(article).toHaveAttribute("data-revision-reason", "后文补全术语");
  });

  it("does not duplicate source text when translation equals source", () => {
    render(
      <SubtitleLine
        line={line({
          sourceText: "Same text",
          translatedText: "Same text",
        })}
      />,
    );

    expect(screen.getAllByText("Same text")).toHaveLength(1);
  });
});

function line(overrides: Partial<SubtitleLineView> = {}): SubtitleLineView {
  return {
    id: "segment-1",
    sequence: 1,
    sourceText: "The model runs locally.",
    translatedText: "该模型在本地运行。",
    state: "revisable",
    highlighted: false,
    revisionReason: null,
    ...overrides,
  };
}
