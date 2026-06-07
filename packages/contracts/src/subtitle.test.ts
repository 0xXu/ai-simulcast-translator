import { describe, expect, expectTypeOf, it } from "vitest";
import {
  SubtitleSnapshotEventSchema,
  validateSubtitleSnapshotEvent,
  type BackendToFrontendEvents,
  type SubtitleSnapshotEvent,
} from "./index";

describe("subtitle contracts", () => {
  it("accepts a serializable subtitle snapshot event", () => {
    const event = validateSubtitleSnapshotEvent({
      type: "snapshot",
      sessionId: "session-1",
      requestId: 3,
      lastAppliedRequestId: 3,
      segments: [
        {
          id: "segment-1",
          sequence: 1,
          sourceText: "The model corrected the term.",
          translatedText: "模型修正了这个术语。",
          startMs: 400,
          endMs: 1_800,
          state: "revisable",
          sourceVersion: 1,
          translationVersion: 2,
        },
      ],
      changes: [
        {
          segmentId: "segment-1",
          kind: "revised",
          sourceTextChanged: false,
          translatedTextChanged: true,
          reason: "后文消除歧义",
          highlightUntilMs: 2_500,
        },
      ],
    });

    expect(event).toEqual({
      type: "snapshot",
      sessionId: "session-1",
      requestId: 3,
      lastAppliedRequestId: 3,
      segments: [
        {
          id: "segment-1",
          sequence: 1,
          sourceText: "The model corrected the term.",
          translatedText: "模型修正了这个术语。",
          startMs: 400,
          endMs: 1_800,
          state: "revisable",
          sourceVersion: 1,
          translationVersion: 2,
        },
      ],
      changes: [
        {
          segmentId: "segment-1",
          kind: "revised",
          sourceTextChanged: false,
          translatedTextChanged: true,
          reason: "后文消除歧义",
          highlightUntilMs: 2_500,
        },
      ],
    });
  });

  it("rejects invalid snapshot ordering and unknown fields", () => {
    expect(() =>
      SubtitleSnapshotEventSchema.parse({
        type: "snapshot",
        sessionId: "session-1",
        requestId: 1,
        lastAppliedRequestId: 1,
        segments: [
          {
            id: "segment-1",
            sequence: 1,
            sourceText: "source",
            translatedText: "译文",
            startMs: 2_000,
            endMs: 1_000,
            state: "live",
            sourceVersion: 1,
            translationVersion: 1,
          },
        ],
        changes: [],
      }),
    ).toThrow();

    expect(() =>
      SubtitleSnapshotEventSchema.parse({
        type: "snapshot",
        sessionId: "session-1",
        requestId: 1,
        lastAppliedRequestId: 1,
        segments: [],
        changes: [],
        unexpected: true,
      }),
    ).toThrow();
  });

  it("adds subtitle snapshot to backend-to-frontend events", () => {
    expectTypeOf<
      BackendToFrontendEvents["subtitle.snapshot"]
    >().toEqualTypeOf<SubtitleSnapshotEvent>();
  });
});
