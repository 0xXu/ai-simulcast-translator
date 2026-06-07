import type {
  SubtitleSnapshot,
  SubtitleTranslationRequest,
  TranslatorPort,
} from "@simulcast/application";
import {
  MimoResponseFormatError,
  parseMimoSubtitleSnapshot,
} from "./response-schema";

export interface MimoClientOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly fetch?: FetchLike;
}

export type FetchLike = (
  input: string,
  init: FetchInit,
) => Promise<FetchResponseLike>;

export interface FetchInit {
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly signal?: AbortSignal;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
}

interface ChatCompletionResponse {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | null;
    };
  }[];
}

export class MimoClient implements TranslatorPort {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: MimoClientOptions) {
    this.endpoint = resolveChatCompletionsEndpoint(options.baseUrl);
    this.apiKey = options.apiKey;
    this.model = options.model ?? "mimo-v2.5";
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetch ?? globalFetch;
  }

  async translate(
    request: SubtitleTranslationRequest,
  ): Promise<SubtitleSnapshot> {
    try {
      return await this.translateOnce(request);
    } catch (error) {
      if (!(error instanceof MimoResponseFormatError)) {
        throw error;
      }
      return this.translateOnce(request);
    }
  }

  private async translateOnce(
    request: SubtitleTranslationRequest,
  ): Promise<SubtitleSnapshot> {
    const response = await this.postChatCompletion(request);
    const content = extractMessageContent(response);
    return parseMimoSubtitleSnapshot(content);
  }

  private async postChatCompletion(
    request: SubtitleTranslationRequest,
  ): Promise<ChatCompletionResponse> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(buildChatCompletionBody(this.model, request)),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(
          `MiMo request failed with ${response.status} ${response.statusText}`,
        );
      }

      return await response.json() as ChatCompletionResponse;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function resolveChatCompletionsEndpoint(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/v1")) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

function buildChatCompletionBody(
  model: string,
  request: SubtitleTranslationRequest,
): unknown {
  return {
    model,
    thinking: {
      type: "disabled",
    },
    messages: [
      {
        role: "system",
        content: [
          "你是 AI 同声传译字幕协调器。",
          "整理最近 faster-whisper 重叠英文窗口，生成自然简洁的简体中文字幕。",
          "只允许修订输入中 state 不是 locked 的最近上下文。",
          "必须返回严格 JSON，不要输出 Markdown、解释或额外文本。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          requestId: request.requestId,
          rawTranscriptWindows: request.rawTranscriptWindows,
          contextSubtitles: request.contextSubtitles,
          responseSchema: {
            requestId: "number",
            subtitles: [
              {
                sourceText: "string",
                translatedText: "string",
                revised: "boolean",
                revisionReason: "string | optional",
              },
            ],
          },
        }),
      },
    ],
  };
}

function extractMessageContent(response: ChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new MimoResponseFormatError("MiMo response content is empty");
  }
  return content;
}

const globalFetch: FetchLike = async (input, init) => {
  if (typeof fetch !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  return fetch(input, init);
};
