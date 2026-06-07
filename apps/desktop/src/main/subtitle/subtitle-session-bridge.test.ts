import type {
  AsrEvent,
  SubtitleSnapshotEvent,
} from "@simulcast/contracts";
import type {
  SubtitleTranslationRequest,
  TranslatorPort,
} from "@simulcast/application";
import { describe, expect, it, vi } from "vitest";
import {
  SUBTITLE_IPC_CHANNELS,
  SubtitleSessionBridge,
  publishSubtitleSnapshotToWindows,
} from "./subtitle-session-bridge";

describe("SubtitleSessionBridge", () => {
  it("publishes translated subtitle snapshots from transcript events", async () => {
    const translator: TranslatorPort = {
      translate: vi.fn(async (request: SubtitleTranslationRequest) => ({
        requestId: request.requestId,
        subtitles: request.rawTranscriptWindows.map((window) => ({
          sourceText: window.text,
          translatedText: `zh:${window.text}`,
          revised: true,
          revisionReason: "context",
        })),
      })),
    };
    const publish = vi.fn<(event: SubtitleSnapshotEvent) => void>();
    const bridge = new SubtitleSessionBridge({
      translator,
      publish,
      now: () => 1_000,
      minRequestIntervalMs: 0,
      highlightDurationMs: 700,
    });

    await bridge.handleAsrEvent(transcriptEvent({ text: "Hello world" }));

    expect(translator.translate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 1,
        sessionId: "session-1",
        rawTranscriptWindows: [
          expect.objectContaining({ text: "Hello world" }),
        ],
      }),
    );
    expect(publish).toHaveBeenCalledWith({
      type: "snapshot",
      sessionId: "session-1",
      requestId: 1,
      lastAppliedRequestId: 1,
      segments: [
        {
          id: "session-1-snapshot-1-1",
          sequence: 1,
          sourceText: "Hello world",
          translatedText: "zh:Hello world",
          startMs: 1_200,
          endMs: 1_200,
          state: "revisable",
          sourceVersion: 1,
          translationVersion: 1,
        },
      ],
      changes: [
        {
          segmentId: "session-1-snapshot-1-1",
          kind: "inserted",
          sourceTextChanged: true,
          translatedTextChanged: true,
          reason: "context",
          highlightUntilMs: 1_700,
        },
      ],
    });
  });

  it("falls back to source text when translation fails", async () => {
    const translator: TranslatorPort = {
      translate: vi.fn(async () => {
        throw new Error("MiMo unavailable");
      }),
    };
    const publish = vi.fn<(event: SubtitleSnapshotEvent) => void>();
    const bridge = new SubtitleSessionBridge({
      translator,
      publish,
      now: () => 2_000,
      minRequestIntervalMs: 0,
    });

    await bridge.handleAsrEvent(transcriptEvent({ text: "Keep the source" }));

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "snapshot",
        sessionId: "session-1",
        segments: [
          expect.objectContaining({
            sourceText: "Keep the source",
            translatedText: "Keep the source",
          }),
        ],
      }),
    );
  });
});

describe("publishSubtitleSnapshotToWindows", () => {
  it("publishes snapshots to every non-destroyed window", () => {
    const activeSend = vi.fn();
    const destroyedSend = vi.fn();
    const event: SubtitleSnapshotEvent = {
      type: "snapshot",
      sessionId: "session-1",
      requestId: 1,
      lastAppliedRequestId: 1,
      segments: [],
      changes: [],
    };

    publishSubtitleSnapshotToWindows(
      [
        { isDestroyed: () => false, webContents: { send: activeSend } },
        { isDestroyed: () => true, webContents: { send: destroyedSend } },
      ],
      event,
    );

    expect(activeSend).toHaveBeenCalledWith(
      SUBTITLE_IPC_CHANNELS.snapshot,
      event,
    );
    expect(destroyedSend).not.toHaveBeenCalled();
  });
});

function transcriptEvent(options: { readonly text: string }): AsrEvent {
  return {
    type: "transcript",
    sessionId: "session-1",
    sequence: 1,
    text: options.text,
    confidence: 0.95,
    startMs: 0,
    endMs: 1_200,
    isFinal: true,
  };
}
