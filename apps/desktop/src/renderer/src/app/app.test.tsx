import { render, screen } from "@testing-library/react";
import { App } from "./app";

describe("App", () => {
  it("renders the control window", () => {
    render(<App windowKind="control" />);

    expect(
      screen.getByRole("heading", { name: "AI 同声传译助手" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "开始演示" }),
    ).toBeInTheDocument();
    expect(screen.getByText("等待接入系统音频")).toBeInTheDocument();
  });

  it("renders the subtitle overlay", () => {
    render(<App windowKind="overlay" />);

    expect(screen.getByText("字幕演示")).toBeInTheDocument();
    expect(
      screen.getByText("上下文会让实时翻译逐步变得更准确。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Context helps real-time translation become more accurate.",
      ),
    ).toBeInTheDocument();
  });
});
