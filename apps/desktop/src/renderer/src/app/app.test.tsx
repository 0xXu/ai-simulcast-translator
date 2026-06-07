import { fireEvent, render, screen } from "@testing-library/react";
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
  });

  it("starts and stops system audio capture while displaying the level", async () => {
    let onStatusChange:
      | Parameters<AudioCaptureController["setOnStatusChange"]>[0]
      | null = null;
    const controller: AudioCaptureController = {
      setOnStatusChange: vi.fn((callback) => {
        onStatusChange = callback;
      }),
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
});
