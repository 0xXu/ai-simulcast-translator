import {
  DEFAULT_REVISION_WINDOW,
  shouldLockSegment,
  type RevisionWindowConfig,
  type SegmentState,
  type SubtitleSegment,
} from "@simulcast/domain";

export interface RawTranscriptWindow {
  readonly sequence: number;
  readonly text: string;
  readonly confidence: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly isFinal: boolean;
}

export interface TranslationContextSubtitle {
  readonly id: string;
  readonly sequence: number;
  readonly sourceText: string;
  readonly translatedText: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly state: SegmentState;
  readonly sourceVersion: number;
  readonly translationVersion: number;
}

export interface SubtitleSnapshotItem {
  readonly sourceText: string;
  readonly translatedText: string;
  readonly revised: boolean;
  readonly revisionReason?: string;
}

export interface SubtitleSnapshot {
  readonly requestId: number;
  readonly subtitles: readonly SubtitleSnapshotItem[];
}

export interface SubtitleTranslationRequest {
  readonly requestId: number;
  readonly sessionId: string;
  readonly rawTranscriptWindows: readonly RawTranscriptWindow[];
  readonly contextSubtitles: readonly TranslationContextSubtitle[];
}

export interface TranslatorPort {
  translate(request: SubtitleTranslationRequest): Promise<SubtitleSnapshot>;
}

export interface BuildTranslationRequestOptions {
  readonly requestId: number;
  readonly sessionId: string;
  readonly rawTranscriptWindows: readonly RawTranscriptWindow[];
  readonly currentSubtitles: readonly SubtitleSegment[];
  readonly maxRawContextMs?: number;
  readonly revisionWindow?: RevisionWindowConfig;
  readonly currentAudioTimeMs?: number;
}

export function selectRecentTranscriptWindows(
  windows: readonly RawTranscriptWindow[],
  maxContextMs: number = 20_000,
  currentAudioTimeMs: number = getLatestEndMs(windows),
): readonly RawTranscriptWindow[] {
  const minStartMs = Math.max(0, currentAudioTimeMs - maxContextMs);
  return [...windows]
    .filter((window) => window.text.trim().length > 0)
    .filter((window) => window.endMs >= minStartMs)
    .sort((a, b) => a.sequence - b.sequence);
}

export function toTranslationContextSubtitle(
  segment: SubtitleSegment,
): TranslationContextSubtitle {
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

export function selectRevisableContextSubtitles(
  segments: readonly SubtitleSegment[],
  revisionWindow: RevisionWindowConfig = DEFAULT_REVISION_WINDOW,
  currentAudioTimeMs: number = getLatestSubtitleEndMs(segments),
): readonly TranslationContextSubtitle[] {
  return [...segments]
    .sort((a, b) => a.sequence - b.sequence)
    .filter((segment) => segment.state !== "locked")
    .filter((segment, _index, allSegments) =>
      !shouldLockSegment(segment, allSegments, revisionWindow, currentAudioTimeMs)
    )
    .map(toTranslationContextSubtitle);
}

export function buildSubtitleTranslationRequest(
  options: BuildTranslationRequestOptions,
): SubtitleTranslationRequest {
  const currentAudioTimeMs =
    options.currentAudioTimeMs
    ?? Math.max(
      getLatestEndMs(options.rawTranscriptWindows),
      getLatestSubtitleEndMs(options.currentSubtitles),
    );

  return {
    requestId: options.requestId,
    sessionId: options.sessionId,
    rawTranscriptWindows: selectRecentTranscriptWindows(
      options.rawTranscriptWindows,
      options.maxRawContextMs ?? 20_000,
      currentAudioTimeMs,
    ),
    contextSubtitles: selectRevisableContextSubtitles(
      options.currentSubtitles,
      options.revisionWindow ?? DEFAULT_REVISION_WINDOW,
      currentAudioTimeMs,
    ),
  };
}

function getLatestEndMs(windows: readonly RawTranscriptWindow[]): number {
  return windows.reduce(
    (latest, window) => Math.max(latest, window.endMs),
    0,
  );
}

function getLatestSubtitleEndMs(segments: readonly SubtitleSegment[]): number {
  return segments.reduce(
    (latest, segment) => Math.max(latest, segment.endMs),
    0,
  );
}
