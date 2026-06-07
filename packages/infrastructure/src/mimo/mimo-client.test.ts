import { describe, expect, it } from "vitest";
import type {
  SubtitleTranslationRequest,
} from "@simulcast/application";
import { MimoClient, type FetchInit, type FetchLike } from "./mimo-client";

describe("MimoClient", () => {
  it("sends a self-contained OpenAI-compatible request with thinking disabled", async () => {
    const calls: FetchCall[] = [];
    const client = new MimoClient({
      baseUrl: "https://mimo.example",
      apiKey: "test-key",
      fetch: createFetch(calls, [
        okResponse({
          requestId: 1,
          subtitles: [
            {
              sourceText: "The model runs locally.",
              translatedText: "该模型在本地运行。",
              revised: false,
            },
          ],
        }),
      ]),
    });

    await client.translate(request());

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("https://mimo.example/v1/chat/completions");
    expect(calls[0]?.init.headers.authorization).toBe("Bearer test-key");
    const body = JSON.parse(calls[0]?.init.body ?? "{}");
    expect(body).toMatchObject({
      model: "mimo-v2.5",
      thinking: { type: "disabled" },
    });
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].content).toContain("从英语翻译为日语");
    expect(body.messages[0].content).not.toContain("简体中文字幕");
    const userPayload = JSON.parse(body.messages[1].content);
    expect(userPayload).toMatchObject({
      requestId: 1,
      rawTranscriptWindows: [
        { text: "The model runs locally." },
      ],
      contextSubtitles: [
        { translatedText: "该模型在本地运行。" },
      ],
    });
  });

  it("retries once when MiMo returns invalid JSON content", async () => {
    const calls: FetchCall[] = [];
    const client = new MimoClient({
      baseUrl: "https://mimo.example/v1/",
      apiKey: "test-key",
      fetch: createFetch(calls, [
        chatResponse("not json"),
        okResponse({
          requestId: 1,
          subtitles: [
            {
              sourceText: "Hello",
              translatedText: "你好",
              revised: true,
              revisionReason: "补全语义",
            },
          ],
        }),
      ]),
    });

    const snapshot = await client.translate(request());

    expect(calls).toHaveLength(2);
    expect(calls[0]?.input).toBe("https://mimo.example/v1/chat/completions");
    expect(snapshot.subtitles[0]).toMatchObject({
      translatedText: "你好",
      revised: true,
      revisionReason: "补全语义",
    });
  });

  it("does not retry HTTP failures", async () => {
    const calls: FetchCall[] = [];
    const client = new MimoClient({
      baseUrl: "https://mimo.example",
      apiKey: "test-key",
      fetch: createFetch(calls, [
        {
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          async json() {
            return {};
          },
        },
      ]),
    });

    await expect(client.translate(request())).rejects.toThrow(
      "MiMo request failed with 429 Too Many Requests",
    );
    expect(calls).toHaveLength(1);
  });
});

interface FetchCall {
  readonly input: string;
  readonly init: FetchInit;
}

function createFetch(
  calls: FetchCall[],
  responses: readonly Awaited<ReturnType<FetchLike>>[],
): FetchLike {
  return async (input, init) => {
    calls.push({ input, init });
    const response = responses[calls.length - 1];
    if (!response) {
      throw new Error("No fake response configured");
    }
    return response;
  };
}

function okResponse(snapshot: unknown): Awaited<ReturnType<FetchLike>> {
  return chatResponse(JSON.stringify(snapshot));
}

function chatResponse(content: string): Awaited<ReturnType<FetchLike>> {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async json() {
      return {
        choices: [
          {
            message: {
              content,
            },
          },
        ],
      };
    },
  };
}

function request(): SubtitleTranslationRequest {
  return {
    requestId: 1,
    sessionId: "session-1",
    sourceLanguage: "en",
    targetLanguage: "ja",
    rawTranscriptWindows: [
      {
        sequence: 1,
        text: "The model runs locally.",
        confidence: 0.9,
        startMs: 0,
        endMs: 1_000,
        isFinal: false,
      },
    ],
    contextSubtitles: [
      {
        id: "segment-1",
        sequence: 1,
        sourceText: "The model runs locally.",
        translatedText: "该模型在本地运行。",
        startMs: 0,
        endMs: 1_000,
        state: "revisable",
        sourceVersion: 1,
        translationVersion: 1,
      },
    ],
  };
}
