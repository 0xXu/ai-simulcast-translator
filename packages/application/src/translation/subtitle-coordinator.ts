import type {
  RevisionWindowConfig,
  SubtitleSegment,
} from "@simulcast/domain";
import {
  buildSubtitleTranslationRequest,
  type RawTranscriptWindow,
  type SubtitleSnapshot,
  type SubtitleTranslationRequest,
  type TranslatorPort,
} from "./subtitle-snapshot";

export interface SubtitleTranslationCoordinatorOptions {
  readonly translator: TranslatorPort;
  readonly minRequestIntervalMs?: number;
  readonly maxRawContextMs?: number;
  readonly revisionWindow?: RevisionWindowConfig;
  readonly now?: () => number;
}

export interface SubtitleCoordinatorInput {
  readonly sessionId: string;
  readonly rawTranscriptWindows: readonly RawTranscriptWindow[];
  readonly currentSubtitles: readonly SubtitleSegment[];
  readonly currentAudioTimeMs?: number;
}

export interface SubtitleCoordinatorSkippedSubmission {
  readonly status: "skipped";
  readonly reason: "empty-transcript";
}

export interface SubtitleCoordinatorQueuedSubmission {
  readonly status: "queued";
  readonly reason: "in-flight" | "throttled";
  readonly retryAfterMs?: number;
}

export interface SubtitleCoordinatorStartedSubmission {
  readonly status: "started";
  readonly requestId: number;
  readonly result: Promise<SubtitleCoordinatorResult>;
}

export type SubtitleCoordinatorSubmission =
  | SubtitleCoordinatorSkippedSubmission
  | SubtitleCoordinatorQueuedSubmission
  | SubtitleCoordinatorStartedSubmission;

export interface SubtitleCoordinatorIdleResult {
  readonly status: "idle";
}

export interface SubtitleCoordinatorAppliedResult {
  readonly status: "applied";
  readonly requestId: number;
  readonly request: SubtitleTranslationRequest;
  readonly snapshot: SubtitleSnapshot;
}

export interface SubtitleCoordinatorStaleResult {
  readonly status: "stale";
  readonly requestId: number;
  readonly responseRequestId: number;
  readonly request: SubtitleTranslationRequest;
}

export interface SubtitleCoordinatorFailedResult {
  readonly status: "failed";
  readonly requestId: number;
  readonly request: SubtitleTranslationRequest;
  readonly error: Error;
}

export type SubtitleCoordinatorResult =
  | SubtitleCoordinatorIdleResult
  | SubtitleCoordinatorAppliedResult
  | SubtitleCoordinatorStaleResult
  | SubtitleCoordinatorFailedResult;

export class SubtitleTranslationCoordinator {
  private readonly translator: TranslatorPort;
  private readonly minRequestIntervalMs: number;
  private readonly maxRawContextMs: number;
  private readonly revisionWindow: RevisionWindowConfig | undefined;
  private readonly now: () => number;
  private requestCounter = 0;
  private latestAppliedRequestId = 0;
  private lastStartedAtMs = Number.NEGATIVE_INFINITY;
  private inFlight: Promise<SubtitleCoordinatorResult> | null = null;
  private queuedInput: SubtitleCoordinatorInput | null = null;

  constructor(options: SubtitleTranslationCoordinatorOptions) {
    this.translator = options.translator;
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? 1_200;
    this.maxRawContextMs = options.maxRawContextMs ?? 20_000;
    this.revisionWindow = options.revisionWindow;
    this.now = options.now ?? Date.now;
  }

  submit(input: SubtitleCoordinatorInput): SubtitleCoordinatorSubmission {
    if (!hasTranscriptText(input.rawTranscriptWindows)) {
      return { status: "skipped", reason: "empty-transcript" };
    }

    if (this.inFlight) {
      this.queuedInput = input;
      return { status: "queued", reason: "in-flight" };
    }

    const elapsedMs = this.now() - this.lastStartedAtMs;
    if (elapsedMs < this.minRequestIntervalMs) {
      this.queuedInput = input;
      return {
        status: "queued",
        reason: "throttled",
        retryAfterMs: this.minRequestIntervalMs - elapsedMs,
      };
    }

    return this.start(input);
  }

  async flush(): Promise<SubtitleCoordinatorResult> {
    if (this.inFlight) {
      await this.inFlight;
    }

    const input = this.queuedInput;
    if (!input) {
      return { status: "idle" };
    }

    const elapsedMs = this.now() - this.lastStartedAtMs;
    if (elapsedMs < this.minRequestIntervalMs) {
      return { status: "idle" };
    }

    this.queuedInput = null;
    const submission = this.submit(input);
    if (submission.status !== "started") {
      return { status: "idle" };
    }

    return submission.result;
  }

  private start(
    input: SubtitleCoordinatorInput,
  ): SubtitleCoordinatorStartedSubmission {
    const requestId = this.nextRequestId();
    const request = buildSubtitleTranslationRequest({
      requestId,
      sessionId: input.sessionId,
      rawTranscriptWindows: input.rawTranscriptWindows,
      currentSubtitles: input.currentSubtitles,
      maxRawContextMs: this.maxRawContextMs,
      ...(input.currentAudioTimeMs === undefined
        ? {}
        : { currentAudioTimeMs: input.currentAudioTimeMs }),
      ...(this.revisionWindow === undefined
        ? {}
        : { revisionWindow: this.revisionWindow }),
    });

    this.lastStartedAtMs = this.now();
    const result = this.translate(request);
    this.inFlight = result;
    void result.finally(() => {
      if (this.inFlight === result) {
        this.inFlight = null;
      }
    });

    return {
      status: "started",
      requestId,
      result,
    };
  }

  private async translate(
    request: SubtitleTranslationRequest,
  ): Promise<SubtitleCoordinatorResult> {
    try {
      const snapshot = await this.translator.translate(request);
      if (snapshot.requestId <= this.latestAppliedRequestId) {
        return {
          status: "stale",
          requestId: request.requestId,
          responseRequestId: snapshot.requestId,
          request,
        };
      }

      this.latestAppliedRequestId = snapshot.requestId;
      return {
        status: "applied",
        requestId: request.requestId,
        request,
        snapshot,
      };
    } catch (error) {
      return {
        status: "failed",
        requestId: request.requestId,
        request,
        error: normalizeError(error),
      };
    }
  }

  private nextRequestId(): number {
    this.requestCounter += 1;
    return this.requestCounter;
  }
}

function hasTranscriptText(
  windows: readonly RawTranscriptWindow[],
): boolean {
  return windows.some((window) => window.text.trim().length > 0);
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
