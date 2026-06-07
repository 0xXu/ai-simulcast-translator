import { describe, expect, it } from "vitest";
import type { SubtitleSegment } from "@simulcast/domain";
import {
  SubtitleTranslationCoordinator,
  type SubtitleCoordinatorInput,
} from "./subtitle-coordinator";
import type {
  SubtitleSnapshot,
  SubtitleTranslationRequest,
  TranslatorPort,
} from "./subtitle-snapshot";

describe("SubtitleTranslationCoordinator", () => {
  it("starts a request with a monotonically increasing requestId", async () => {
    let now = 1_000;
    const translator = createTranslator((request) =>
      Promise.resolve(snapshot(request.requestId))
    );
    const coordinator = new SubtitleTranslationCoordinator({
      translator,
      now: () => now,
    });

    const first = coordinator.submit(input("first"));
    expect(first.status).toBe("started");
    if (first.status !== "started") {
      throw new Error("expected started");
    }

    const firstResult = await first.result;
    expect(firstResult.status).toBe("applied");
    expect(translator.requests[0]?.requestId).toBe(1);

    now = 3_000;
    const second = coordinator.submit(input("second"));
    expect(second.status).toBe("started");
    if (second.status !== "started") {
      throw new Error("expected started");
    }
    await second.result;
    expect(translator.requests[1]?.requestId).toBe(2);
  });

  it("drops stale MiMo responses instead of applying them", async () => {
    const translator = createTranslator((request) =>
      Promise.resolve(snapshot(request.requestId === 1 ? 1 : 1))
    );
    let now = 1_000;
    const coordinator = new SubtitleTranslationCoordinator({
      translator,
      now: () => now,
    });

    const first = coordinator.submit(input("first"));
    if (first.status !== "started") {
      throw new Error("expected started");
    }
    await first.result;

    now = 3_000;
    const second = coordinator.submit(input("second"));
    if (second.status !== "started") {
      throw new Error("expected started");
    }
    const secondResult = await second.result;

    expect(secondResult).toMatchObject({
      status: "stale",
      requestId: 2,
      responseRequestId: 1,
    });
  });

  it("keeps only the latest queued input while one request is in flight", async () => {
    let now = 1_000;
    const deferred = createDeferred<SubtitleSnapshot>();
    const translator = createTranslator((request) => {
      if (request.requestId === 1) {
        return deferred.promise;
      }
      return Promise.resolve(snapshot(request.requestId));
    });
    const coordinator = new SubtitleTranslationCoordinator({
      translator,
      now: () => now,
    });

    const started = coordinator.submit(input("first"));
    expect(started.status).toBe("started");
    expect(coordinator.submit(input("second")).status).toBe("queued");
    expect(coordinator.submit(input("third")).status).toBe("queued");

    deferred.resolve(snapshot(1));
    if (started.status !== "started") {
      throw new Error("expected started");
    }
    await started.result;

    now = 3_000;
    const flushed = await coordinator.flush();

    expect(flushed.status).toBe("applied");
    expect(translator.requests).toHaveLength(2);
    expect(translator.requests[1]?.rawTranscriptWindows.at(-1)?.text).toBe("third");
  });

  it("throttles requests until the minimum interval has elapsed", async () => {
    let now = 1_000;
    const translator = createTranslator((request) =>
      Promise.resolve(snapshot(request.requestId))
    );
    const coordinator = new SubtitleTranslationCoordinator({
      translator,
      minRequestIntervalMs: 1_200,
      now: () => now,
    });

    const first = coordinator.submit(input("first"));
    if (first.status !== "started") {
      throw new Error("expected started");
    }
    await first.result;

    now = 1_500;
    expect(coordinator.submit(input("second"))).toMatchObject({
      status: "queued",
      reason: "throttled",
      retryAfterMs: 700,
    });
    expect(await coordinator.flush()).toEqual({ status: "idle" });

    now = 2_200;
    const flushed = await coordinator.flush();
    expect(flushed.status).toBe("applied");
    expect(translator.requests[1]?.rawTranscriptWindows.at(-1)?.text).toBe("second");
  });

  it("returns a failed result when MiMo is unavailable", async () => {
    const translator = createTranslator(() => {
      throw new Error("MiMo timeout");
    });
    const coordinator = new SubtitleTranslationCoordinator({
      translator,
      now: () => 1_000,
    });

    const started = coordinator.submit(input("first"));
    if (started.status !== "started") {
      throw new Error("expected started");
    }
    const result = await started.result;

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error.message).toBe("MiMo timeout");
    }
  });
});

function createTranslator(
  handler: (request: SubtitleTranslationRequest) => Promise<SubtitleSnapshot>,
): TranslatorPort & {
  readonly requests: SubtitleTranslationRequest[];
} {
  const requests: SubtitleTranslationRequest[] = [];
  return {
    requests,
    async translate(request) {
      requests.push(request);
      return handler(request);
    },
  };
}

function snapshot(requestId: number): SubtitleSnapshot {
  return {
    requestId,
    subtitles: [
      {
        sourceText: "The model runs locally.",
        translatedText: "该模型在本地运行。",
        revised: false,
      },
    ],
  };
}

function input(text: string): SubtitleCoordinatorInput {
  return {
    sessionId: "session-1",
    rawTranscriptWindows: [
      {
        sequence: 1,
        text,
        confidence: 0.9,
        startMs: 0,
        endMs: 1_000,
        isFinal: false,
      },
    ],
    currentSubtitles: [
      segment(1),
    ],
  };
}

function segment(sequence: number): SubtitleSegment {
  return {
    id: `segment-${sequence}`,
    sequence,
    sourceText: `source ${sequence}`,
    translatedText: `译文 ${sequence}`,
    startMs: 0,
    endMs: 1_000,
    state: "revisable",
    sourceVersion: 1,
    translationVersion: 1,
    updatedAt: 100,
  };
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolveValue: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });
  return {
    promise,
    resolve: resolveValue,
  };
}
