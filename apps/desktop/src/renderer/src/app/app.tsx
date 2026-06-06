import { useEffect, useRef, useState } from "react";
import type { AudioCaptureStatus } from "@simulcast/contracts";
import { AudioCapture } from "../../features/audio/audio-capture";
import { demoSubtitles } from "./demo-subtitles";
import "./styles.css";

export type WindowKind = "control" | "overlay";

export interface AudioCaptureController {
  setOnStatusChange(
    callback: (status: AudioCaptureStatus) => void,
  ): void;
  start(): Promise<void>;
  stop(): void;
}

interface AppProps {
  windowKind: WindowKind;
  createAudioCapture?: () => AudioCaptureController;
}

const initialAudioStatus: AudioCaptureStatus = {
  state: "idle",
  level: null,
  error: null,
};

function createDefaultAudioCapture(): AudioCaptureController {
  return new AudioCapture();
}

function ControlWindow({
  createAudioCapture,
}: {
  createAudioCapture: () => AudioCaptureController;
}) {
  const captureRef = useRef<AudioCaptureController | null>(null);
  const [audioStatus, setAudioStatus] =
    useState<AudioCaptureStatus>(initialAudioStatus);

  if (!captureRef.current) {
    captureRef.current = createAudioCapture();
    captureRef.current.setOnStatusChange(setAudioStatus);
  }

  useEffect(() => {
    const capture = captureRef.current;
    return () => capture?.stop();
  }, []);

  const isCapturing = audioStatus.state === "capturing";
  const isRequesting = audioStatus.state === "requesting";
  const statusTitle = isCapturing
    ? "系统音频采集中"
    : audioStatus.state === "error"
      ? "系统音频采集失败"
      : isRequesting
        ? "等待系统授权"
        : "准备就绪";
  const statusDetail = audioStatus.error
    ?? (isCapturing
      ? `${audioStatus.level?.level ?? 0}%`
      : "等待采集系统音频");

  async function toggleCapture(): Promise<void> {
    const capture = captureRef.current;
    if (!capture) {
      return;
    }

    if (isCapturing) {
      capture.stop();
      return;
    }

    try {
      await capture.start();
    } catch (error) {
      setAudioStatus({
        state: "error",
        level: null,
        error: error instanceof Error ? error.message : "系统音频采集失败",
      });
    }
  }

  return (
    <main className="control-shell">
      <header className="hero">
        <p className="eyebrow">SEMANTIC REWIND</p>
        <h1>AI 同声传译助手</h1>
        <p className="intro">
          本地识别系统音频，由 MiMo 翻译并根据后文修正最近字幕。
        </p>
      </header>

      <section className="status-card" aria-label="运行状态">
        <div>
          <span
            className={`status-dot status-${audioStatus.state}`}
            aria-hidden="true"
          />
          <strong>{statusTitle}</strong>
        </div>
        <p>{statusDetail}</p>
      </section>

      <section className="capability-grid" aria-label="核心能力">
        <article>
          <span>01</span>
          <h2>本地识别</h2>
          <p>使用 faster-whisper 在设备上处理原始音频。</p>
        </article>
        <article>
          <span>02</span>
          <h2>上下文翻译</h2>
          <p>MiMo 保留最近 5 句或 20 秒语义上下文。</p>
        </article>
        <article>
          <span>03</span>
          <h2>回溯修订</h2>
          <p>后文消除歧义时，字幕会在原位置自动收敛。</p>
        </article>
      </section>

      <button
        className="primary-action"
        type="button"
        disabled={isRequesting}
        onClick={() => void toggleCapture()}
      >
        {isCapturing ? "停止采集" : isRequesting ? "请求授权中" : "开始采集"}
      </button>
      <p className="action-note">
        首次使用时，macOS 会请求屏幕与系统音频录制权限
      </p>
    </main>
  );
}

function OverlayWindow() {
  const subtitle = demoSubtitles[0];

  if (!subtitle) {
    return null;
  }

  return (
    <main className="overlay-shell">
      <div className="overlay-label">字幕演示</div>
      <section
        className={`subtitle-card state-${subtitle.state}`}
        role="status"
        aria-live="polite"
      >
        <p className="translation" lang="zh-CN">
          {subtitle.translatedText}
        </p>
        <p className="source" lang="en">
          {subtitle.sourceText}
        </p>
      </section>
    </main>
  );
}

export function App({
  windowKind,
  createAudioCapture = createDefaultAudioCapture,
}: AppProps) {
  return windowKind === "overlay"
    ? <OverlayWindow />
    : <ControlWindow createAudioCapture={createAudioCapture} />;
}
