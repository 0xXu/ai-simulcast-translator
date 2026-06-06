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
    ).toBeDisabled();
    expect(screen.getByText("等待接入系统音频")).toBeInTheDocument();
    expect(screen.queryByText("字幕演示")).not.toBeInTheDocument();
  });

  it("renders the subtitle overlay", () => {
    render(<App windowKind="overlay" />);

    expect(
      screen.queryByRole("heading", { name: "AI 同声传译助手" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("字幕演示")).toBeInTheDocument();

    const status = screen.getByRole("status");
    const translation = screen.getByText(
      "上下文会让实时翻译逐步变得更准确。",
    );
    const source = screen.getByText(
      "Context helps real-time translation become more accurate.",
    );

    expect(status).toHaveClass("state-revisable");
    expect(translation).toHaveAttribute("lang", "zh-CN");
    expect(source).toHaveAttribute("lang", "en");
  });
});
