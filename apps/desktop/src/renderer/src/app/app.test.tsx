import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { AsrEvent, SubtitleSnapshotEvent } from "@simulcast/contracts";
import { App, type AudioCaptureController } from "./app";

describe("App", () => {
  it("renders the control window", () => {
    render(<App windowKind="control" />);

    expect(
      screen.getByRole("heading", { name: "AI 同声传译助手" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "开始采集" }),
    ).toBeEnabled();
    expect(screen.getByText("等待采集系统音频")).toBeInTheDocument();
    expect(screen.queryByText("字幕演示")).not.toBeInTheDocument();
    expect(screen.getByLabelText("源语言")).toHaveValue("自动检测");
    expect(screen.getByLabelText("目标语言")).toHaveValue("简体中文");
  });

  it("starts the ASR session with selected languages and locks selectors", async () => {
    let onStatusChange:
      | Parameters<AudioCaptureController["setOnStatusChange"]>[0]
      | null = null;
    const controller: AudioCaptureController = {
      setOnStatusChange: vi.fn((callback) => {
        onStatusChange = callback;
      }),
      setOnPcmData: vi.fn(),
      start: vi.fn(async () => {
        onStatusChange?.({
          state: "capturing",
          level: { level: 10, timestamp: 1 },
          error: null,
        });
      }),
      stop: vi.fn(),
    };
    const asrClient = {
      startSession: vi.fn(async (sessionId: string) => ({
        sessionId,
        state: "ready" as const,
      })),
      sendAudio: vi.fn(),
      stopSession: vi.fn(async (sessionId: string) => ({
        sessionId,
        state: "idle" as const,
      })),
    };

    render(
      <App
        windowKind="control"
        createAudioCapture={() => controller}
        createSessionId={() => "session-language"}
        asrClient={asrClient}
      />,
    );

    fireEvent.change(screen.getByLabelText("源语言"), {
      target: { value: "日语" },
    });
    fireEvent.change(screen.getByLabelText("目标语言"), {
      target: { value: "英语" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始采集" }));

    await waitFor(() => {
      expect(asrClient.startSession).toHaveBeenCalledWith(
        "session-language",
        {
          sourceLanguage: "ja",
          targetLanguage: "en",
        },
      );
    });
    expect(screen.getByLabelText("源语言")).toBeDisabled();
    expect(screen.getByLabelText("目标语言")).toBeDisabled();
  });

  it("starts and stops system audio capture while displaying the level", async () => {
    let onStatusChange:
      | Parameters<AudioCaptureController["setOnStatusChange"]>[0]
      | null = null;
    const controller: AudioCaptureController = {
      setOnStatusChange: vi.fn((callback) => {
        onStatusChange = callback;
      }),
      setOnPcmData: vi.fn(),
      start: vi.fn(async () => {
        onStatusChange?.({
          state: "capturing",
          level: { level: 42, timestamp: Date.now() },
          error: null,
        });
      }),
      stop: vi.fn(() => {
        onStatusChange?.({ state: "idle", level: null, error: null });
      }),
    };

    render(
      <App
        windowKind="control"
        createAudioCapture={() => controller}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "开始采集" }));

    expect(await screen.findByText("系统音频采集中")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "停止采集" }));
    expect(controller.stop).toHaveBeenCalledOnce();
    expect(screen.getByText("等待采集系统音频")).toBeInTheDocument();
  });

  it("starts an ASR session and streams captured PCM", async () => {
    let onStatusChange:
      | Parameters<AudioCaptureController["setOnStatusChange"]>[0]
      | null = null;
    let onPcmData:
      | Parameters<AudioCaptureController["setOnPcmData"]>[0]
      | null = null;
    const controller: AudioCaptureController = {
      setOnStatusChange: vi.fn((callback) => {
        onStatusChange = callback;
      }),
      setOnPcmData: vi.fn((callback) => {
        onPcmData = callback;
      }),
      start: vi.fn(async () => {
        onStatusChange?.({
          state: "capturing",
          level: { level: 11, timestamp: Date.now() },
          error: null,
        });
      }),
      stop: vi.fn(() => {
        onStatusChange?.({ state: "idle", level: null, error: null });
      }),
    };
    const asrClient = {
      startSession: vi.fn(async (sessionId: string) => ({
        sessionId,
        state: "ready" as const,
      })),
      sendAudio: vi.fn(),
      stopSession: vi.fn(async (sessionId: string) => ({
        sessionId,
        state: "idle" as const,
      })),
    };

    render(
      <App
        windowKind="control"
        createAudioCapture={() => controller}
        createSessionId={() => "session-1"}
        asrClient={asrClient}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "开始采集" }));

    await waitFor(() => {
      expect(asrClient.startSession).toHaveBeenCalledWith("session-1", {
        sourceLanguage: "auto",
        targetLanguage: "zh",
      });
      expect(controller.start).toHaveBeenCalledOnce();
    });

    const samples = new Int16Array([1, -1]);
    act(() => {
      onPcmData?.(samples);
    });

    expect(asrClient.sendAudio).toHaveBeenCalledWith("session-1", samples);

    fireEvent.click(screen.getByRole("button", { name: "停止采集" }));

    await waitFor(() => {
      expect(asrClient.stopSession).toHaveBeenCalledWith("session-1");
    });
  });

  it("projects ASR runtime status events in the control window", () => {
    let publishAsrEvent: ((event: AsrEvent) => void) | null = null;
    const unsubscribe = vi.fn();

    const { unmount } = render(
      <App
        windowKind="control"
        subscribeToAsrEvents={(listener) => {
          publishAsrEvent = listener;
          return unsubscribe;
        }}
      />,
    );

    expect(screen.getByText("本地识别待启动")).toBeInTheDocument();

    act(() => {
      publishAsrEvent?.({
        type: "status",
        sessionId: "session-1",
        state: "starting",
        message: "正在启动本地语音识别",
      });
    });
    expect(screen.getByText("本地识别启动中")).toBeInTheDocument();
    expect(screen.getByText("正在启动本地语音识别")).toBeInTheDocument();

    act(() => {
      publishAsrEvent?.({
        type: "status",
        sessionId: "session-1",
        state: "ready",
        message: "本地语音识别已就绪",
      });
    });
    expect(screen.getByText("本地识别已就绪")).toBeInTheDocument();
    expect(screen.getByText("本地语音识别已就绪")).toBeInTheDocument();

    act(() => {
      publishAsrEvent?.({
        type: "error",
        sessionId: "session-1",
        code: "WORKER_START_FAILED",
        message: "ASR Worker 启动失败",
        recoverable: true,
      });
    });
    expect(screen.getByText("本地识别异常")).toBeInTheDocument();
    expect(screen.getByText("ASR Worker 启动失败")).toBeInTheDocument();

    unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("renders the subtitle overlay", () => {
    render(<App windowKind="overlay" />);

    expect(
      screen.queryByRole("heading", { name: "AI 同声传译助手" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("SEMANTIC REWIND")).toBeInTheDocument();

    const status = screen.getByRole("status");
    const translation = screen.getByText(
      "上下文会让实时翻译逐步变得更准确。",
    );
    const source = screen.getByText(
      "Context helps real-time translation become more accurate.",
    );

    expect(status.querySelector(".subtitle-line")).toHaveClass("state-revisable");
    expect(status.querySelector(".subtitle-line")).toHaveClass("is-highlighted");
    expect(translation).toHaveAttribute("lang", "zh-CN");
    expect(source).toHaveAttribute("lang", "en");
  });

  it("updates the subtitle overlay from snapshot events", () => {
    let publishSnapshot:
      | ((event: SubtitleSnapshotEvent) => void)
      | null = null;
    const unsubscribe = vi.fn();

    render(
      <App
        windowKind="overlay"
        now={() => 1_000}
        subscribeToSubtitleSnapshots={(listener) => {
          publishSnapshot = listener;
          return unsubscribe;
        }}
      />,
    );

    act(() => {
      publishSnapshot?.({
        type: "snapshot",
        sessionId: "session-1",
        requestId: 2,
        lastAppliedRequestId: 2,
        segments: [
          {
            id: "live-1",
            sequence: 1,
            sourceText: "The live transcript arrives.",
            translatedText: "Live translation arrived.",
            startMs: 0,
            endMs: 1_200,
            state: "revisable",
            sourceVersion: 1,
            translationVersion: 1,
          },
        ],
        changes: [
          {
            segmentId: "live-1",
            kind: "inserted",
            sourceTextChanged: true,
            translatedTextChanged: true,
            reason: "initial",
            highlightUntilMs: 1_500,
          },
        ],
      });
    });

    expect(screen.getByText("Live translation arrived.")).toBeInTheDocument();
    expect(screen.getByText("The live transcript arrives.")).toBeInTheDocument();
    expect(screen.getByRole("status").querySelector(".subtitle-line")).toHaveClass(
      "is-highlighted",
    );
    expect(
      screen.queryByText(
        "Context helps real-time translation become more accurate.",
      ),
    ).not.toBeInTheDocument();
  });
});
