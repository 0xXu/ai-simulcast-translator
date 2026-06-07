import {
  SubtitleTranslationCoordinator,
  applySubtitleSnapshot,
  type AppliedSubtitleChange,
  type RawTranscriptWindow,
  type SubtitleCoordinatorResult,
  type SubtitleTranslationRequest,
  type TranslatorPort,
} from "@simulcast/application";
import { SubtitleTimeline, type SubtitleSegment } from "@simulcast/domain";
import type {
  AsrEvent,
  AsrTranscriptEvent,
  SubtitleSnapshotChange,
  SubtitleSnapshotEvent,
  SubtitleSnapshotSegment,
} from "@simulcast/contracts";

export const SUBTITLE_IPC_CHANNELS = Object.freeze({
  snapshot: "subtitle.snapshot",
} as const);

export interface SubtitleSnapshotWindow {
  isDestroyed(): boolean;
  readonly webContents: {
    send(channel: string, event: SubtitleSnapshotEvent): void;
  };
}

export interface SubtitleSessionBridgeOptions {
  readonly translator: TranslatorPort;
  readonly publish: (event: SubtitleSnapshotEvent) => void;
  readonly now?: () => number;
  readonly minRequestIntervalMs?: number;
  readonly highlightDurationMs?: number;
}

interface SubtitleSessionState {
  readonly timeline: SubtitleTimeline;
  readonly coordinator: SubtitleTranslationCoordinator;
  rawTranscriptWindows: RawTranscriptWindow[];
  lastAppliedRequestId: number;
  currentAudioTimeMs: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

export class SubtitleSessionBridge {
  private readonly translator: TranslatorPort;
  private readonly publish: (event: SubtitleSnapshotEvent) => void;
  private readonly now: () => number;
  private readonly minRequestIntervalMs: number | undefined;
  private readonly highlightDurationMs: number | undefined;
  private readonly sessions = new Map<string, SubtitleSessionState>();

  constructor(options: SubtitleSessionBridgeOptions) {
    this.translator = options.translator;
    this.publish = options.publish;
    this.now = options.now ?? Date.now;
    this.minRequestIntervalMs = options.minRequestIntervalMs;
    this.highlightDurationMs = options.highlightDurationMs;
  }

  async handleAsrEvent(event: AsrEvent): Promise<void> {
    if (event.type === "status" && event.state === "starting") {
      this.resetSession(event.sessionId);
      return;
    }

    if (event.type !== "transcript") {
      return;
    }

    await this.handleTranscript(event);
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      if (session.flushTimer) {
        clearTimeout(session.flushTimer);
      }
    }
    this.sessions.clear();
  }

  private async handleTranscript(event: AsrTranscriptEvent): Promise<void> {
    const text = event.text.trim();
    if (!text) {
      return;
    }

    const session = this.getSession(event.sessionId);
    const rawWindow = toRawTranscriptWindow(event, text);
    session.currentAudioTimeMs = Math.max(
      session.currentAudioTimeMs,
      event.endMs,
    );
    session.rawTranscriptWindows = [
      ...session.rawTranscriptWindows.filter(
        (existing) => existing.sequence !== rawWindow.sequence,
      ),
      rawWindow,
    ].sort((a, b) => a.sequence - b.sequence);

    const submission = session.coordinator.submit({
      sessionId: event.sessionId,
      rawTranscriptWindows: session.rawTranscriptWindows,
      currentSubtitles: session.timeline.getSegments(),
      currentAudioTimeMs: session.currentAudioTimeMs,
    });

    if (submission.status === "started") {
      await this.applyCoordinatorResult(
        event.sessionId,
        session,
        submission.result,
      );
      await this.flushQueued(event.sessionId, session);
      return;
    }

    if (submission.status === "queued") {
      this.scheduleFlush(event.sessionId, session, submission.retryAfterMs);
    }
  }

  private getSession(sessionId: string): SubtitleSessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const state: SubtitleSessionState = {
      timeline: new SubtitleTimeline(),
      coordinator: new SubtitleTranslationCoordinator({
        translator: this.translator,
        ...(this.minRequestIntervalMs === undefined
          ? {}
          : { minRequestIntervalMs: this.minRequestIntervalMs }),
        now: this.now,
      }),
      rawTranscriptWindows: [],
      lastAppliedRequestId: 0,
      currentAudioTimeMs: 0,
      flushTimer: null,
    };
    this.sessions.set(sessionId, state);
    return state;
  }

  private resetSession(sessionId: string): void {
    const existing = this.sessions.get(sessionId);
    if (existing?.flushTimer) {
      clearTimeout(existing.flushTimer);
    }
    this.sessions.delete(sessionId);
  }

  private async applyCoordinatorResult(
    sessionId: string,
    session: SubtitleSessionState,
    resultPromise: Promise<SubtitleCoordinatorResult>,
  ): Promise<void> {
    const result = await resultPromise;
    if (result.status === "applied") {
      this.applySnapshot(
        sessionId,
        session,
        result.snapshot,
      );
      return;
    }

    if (result.status === "failed") {
      this.applySnapshot(
        sessionId,
        session,
        createFallbackSnapshot(result.request),
      );
    }
  }

  private async flushQueued(
    sessionId: string,
    session: SubtitleSessionState,
  ): Promise<void> {
    const result = await session.coordinator.flush();
    if (result.status === "idle") {
      return;
    }

    if (result.status === "applied") {
      this.applySnapshot(
        sessionId,
        session,
        result.snapshot,
      );
      return;
    }

    if (result.status === "failed") {
      this.applySnapshot(
        sessionId,
        session,
        createFallbackSnapshot(result.request),
      );
    }
  }

  private scheduleFlush(
    sessionId: string,
    session: SubtitleSessionState,
    retryAfterMs: number | undefined,
  ): void {
    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
    }

    session.flushTimer = setTimeout(() => {
      session.flushTimer = null;
      void this.flushQueued(sessionId, session);
    }, Math.max(0, retryAfterMs ?? 0));
  }

  private applySnapshot(
    sessionId: string,
    session: SubtitleSessionState,
    snapshot: Parameters<typeof applySubtitleSnapshot>[0]["snapshot"],
  ): void {
    const result = applySubtitleSnapshot({
      sessionId,
      snapshot,
      timeline: session.timeline,
      lastAppliedRequestId: session.lastAppliedRequestId,
      currentAudioTimeMs: session.currentAudioTimeMs,
      nowMs: this.now(),
      ...(this.highlightDurationMs === undefined
        ? {}
        : { highlightDurationMs: this.highlightDurationMs }),
    });

    session.lastAppliedRequestId = result.lastAppliedRequestId;

    if (result.status !== "applied") {
      return;
    }

    this.publish({
      type: "snapshot",
      sessionId,
      requestId: result.requestId,
      lastAppliedRequestId: result.lastAppliedRequestId,
      segments: result.segments.map(toSnapshotSegment),
      changes: result.changes.map(toSnapshotChange),
    });
  }
}

export function publishSubtitleSnapshotToWindows(
  windows: readonly SubtitleSnapshotWindow[],
  event: SubtitleSnapshotEvent,
): void {
  for (const window of windows) {
    if (!window.isDestroyed()) {
      window.webContents.send(SUBTITLE_IPC_CHANNELS.snapshot, event);
    }
  }
}

function toRawTranscriptWindow(
  event: AsrTranscriptEvent,
  text: string,
): RawTranscriptWindow {
  return {
    sequence: event.sequence,
    text,
    confidence: event.confidence,
    startMs: event.startMs,
    endMs: event.endMs,
    isFinal: event.isFinal,
  };
}

function createFallbackSnapshot(
  request: SubtitleTranslationRequest,
): Parameters<typeof applySubtitleSnapshot>[0]["snapshot"] {
  return {
    requestId: request.requestId,
    subtitles: request.rawTranscriptWindows.map((window) => ({
      sourceText: window.text,
      translatedText: window.text,
      revised: false,
      revisionReason: "translator-fallback",
    })),
  };
}

function toSnapshotSegment(segment: SubtitleSegment): SubtitleSnapshotSegment {
  return {
    id: segment.id,
    sequence: segment.sequence,
    sourceText: segment.sourceText,
    translatedText: segment.translatedText,
    startMs: segment.startMs,
    endMs: segment.endMs,
    state: segment.state,
    sourceVersion: segment.sourceVersion,
    translationVersion: segment.translationVersion,
  };
}

function toSnapshotChange(change: AppliedSubtitleChange): SubtitleSnapshotChange {
  return {
    segmentId: change.segmentId,
    kind: change.kind,
    sourceTextChanged: change.sourceTextChanged,
    translatedTextChanged: change.translatedTextChanged,
    reason: change.reason,
    highlightUntilMs: change.highlightUntilMs,
  };
}
