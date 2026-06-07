import type { SubtitleLineView } from "../../entities/subtitle/subtitle-store";

export interface SubtitleLineProps {
  readonly line: SubtitleLineView;
  readonly showSource?: boolean;
}

export function SubtitleLine({
  line,
  showSource = true,
}: SubtitleLineProps) {
  return (
    <article
      className={[
        "subtitle-line",
        `state-${line.state}`,
        line.highlighted ? "is-highlighted" : "",
      ].filter(Boolean).join(" ")}
      data-revision-reason={line.revisionReason ?? undefined}
    >
      <p className="translation" lang="zh-CN">
        {line.translatedText || line.sourceText}
      </p>
      {showSource && line.sourceText ? (
        <p className="source" lang="en">
          {line.sourceText}
        </p>
      ) : null}
    </article>
  );
}
