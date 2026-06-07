import { useEffect, useRef, useState } from "react";
import type {
  AudioCaptureStatus,
  AsrEvent,
  AsrSessionResponse,
  SubtitleSnapshotEvent,
} from "@simulcast/contracts";
import { AudioCapture } from "../../features/audio/audio-capture";
import { demoSubtitles } from "./demo-subtitles";
import { SubtitleLine } from "../../features/subtitles/subtitle-line";
import {
  SubtitleStore,
  type SubtitleLineView,
  type SubtitleStoreSegment,
} from "../../entities/subtitle/subtitle-store";
import "./styles.css";

export type WindowKind = "control" | "overlay";

export interface AudioCaptureController {
  setOnStatusChange(
    callback: (status: AudioCaptureStatus) => void,
  ): void;
  setOnPcmData(callback: (data: Int16Array) => void): void;
  start(): Promise<void>;
  stop(): void;
}

export interface AsrSessionClient {
  readonly startSession: (
    sessionId: string,
  ) => Promise<AsrSessionResponse>;
  readonly sendAudio: (sessionId: string, audio: Int16Array) => void;
  readonly stopSession: (
    sessionId: string,
  ) => Promise<AsrSessionResponse>;
}

export type SubtitleSnapshotSubscriber = (
  listener: (event: SubtitleSnapshotEvent) => void,
) => () => void;

export type AsrEventSubscriber = (
  listener: (event: AsrEvent) => void,
) => () => void;

interface AppProps {
  windowKind: WindowKind;
  createAudioCapture?: () => AudioCaptureController;
  asrClient?: AsrSessionClient;
  createSessionId?: () => string;
  subscribeToAsrEvents?: AsrEventSubscriber;
  subscribeToSubtitleSnapshots?: SubtitleSnapshotSubscriber;
  now?: () => number;
}

const initialAudioStatus: AudioCaptureStatus = {
  state: "idle",
  level: null,
  error: null,
};

function createDefaultAudioCapture(): AudioCaptureController {
  return new AudioCapture();
}

const noopAsrSessionClient: AsrSessionClient = {
  async startSession(sessionId) {
    return { sessionId, state: "ready" };
  },
  sendAudio() {
    return undefined;
  },
  async stopSession(sessionId) {
    return { sessionId, state: "idle" };
  },
};

function createDefaultAsrSessionClient(): AsrSessionClient {
  if (typeof window === "undefined" || !window.api) {
    return noopAsrSessionClient;
  }

  return {
    startSession: window.api.startAsrSession,
    sendAudio: window.api.sendAsrAudio,
    stopSession: window.api.stopAsrSession,
  };
}

function createDefaultSessionId(): string {
  return `session-${Date.now()}`;
}

function createDefaultSubtitleSnapshotSubscriber(
  listener: (event: SubtitleSnapshotEvent) => void,
): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.api?.onSubtitleSnapshot !== "function"
  ) {
    return () => undefined;
  }

  return window.api.onSubtitleSnapshot(listener);
}

function createDefaultAsrEventSubscriber(
  listener: (event: AsrEvent) => void,
): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.api?.onAsrEvent !== "function"
  ) {
    return () => undefined;
  }

  return window.api.onAsrEvent(listener);
}

function toSubtitleStoreSegment(
  segment: SubtitleSnapshotEvent["segments"][number],
): SubtitleStoreSegment {
  return {
    id: segment.id,
    sequence: segment.sequence,
    sourceText: segment.sourceText,
    translatedText: segment.translatedText,
    state: segment.state,
  };
}

function createDemoSubtitleLines(): readonly SubtitleLineView[] {
  return demoSubtitles.slice(-3).map((subtitle, index) => ({
    id: subtitle.id,
    sequence: index + 1,
    sourceText: subtitle.sourceText,
    translatedText: subtitle.translatedText,
    state: subtitle.state,
    highlighted: subtitle.highlighted ?? false,
    revisionReason: subtitle.revisionReason ?? null,
  }));
}

function ControlWindow({
  createAudioCapture,
  asrClient,
  createSessionId,
  subscribeToAsrEvents,
}: {
  createAudioCapture: () => AudioCaptureController;
  asrClient: AsrSessionClient;
  createSessionId: () => string;
  subscribeToAsrEvents: AsrEventSubscriber;
}) {
  const captureRef = useRef<AudioCaptureController | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const [audioStatus, setAudioStatus] =
    useState<AudioCaptureStatus>(initialAudioStatus);
  const [asrStatus, setAsrStatus] = useState<{
    readonly state: "idle" | "starting" | "ready" | "error";
    readonly message: string | null;
  }>({
    state: "idle",
    message: null,
  });

  if (!captureRef.current) {
    captureRef.current = createAudioCapture();
    captureRef.current.setOnStatusChange(setAudioStatus);
    captureRef.current.setOnPcmData((pcmData) => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) {
        return;
      }

      try {
        asrClient.sendAudio(sessionId, pcmData);
      } catch (error) {
        setAudioStatus({
          state: "error",
          level: null,
          error: error instanceof Error ? error.message : "ASR 音频发送失败",
        });
      }
    });
  }

  useEffect(() => {
    const capture = captureRef.current;
    return () => {
      const sessionId = activeSessionIdRef.current;
      activeSessionIdRef.current = null;
      capture?.stop();
      if (sessionId) {
        void asrClient.stopSession(sessionId);
      }
    };
  }, [asrClient]);

  useEffect(() => {
    return subscribeToAsrEvents((event) => {
      if (event.type === "status") {
        setAsrStatus({ state: event.state, message: event.message });
        return;
      }

      if (event.type === "error") {
        setAsrStatus({ state: "error", message: event.message });
      }
    });
  }, [subscribeToAsrEvents]);

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
  const asrStatusTitle = asrStatus.state === "starting"
    ? "本地识别启动中"
    : asrStatus.state === "ready"
      ? "本地识别已就绪"
      : asrStatus.state === "error"
        ? "本地识别异常"
        : "本地识别待启动";
  const asrStatusDetail = asrStatus.message ?? "等待开始 ASR 会话";

  async function toggleCapture(): Promise<void> {
    const capture = captureRef.current;
    if (!capture) {
      return;
    }

    if (isCapturing) {
      const sessionId = activeSessionIdRef.current;
      activeSessionIdRef.current = null;
      capture.stop();
      if (sessionId) {
        await asrClient.stopSession(sessionId);
      }
      return;
    }

    const sessionId = createSessionId();
    activeSessionIdRef.current = sessionId;
    setAudioStatus({ state: "requesting", level: null, error: null });

    try {
      await asrClient.startSession(sessionId);
      await capture.start();
    } catch (error) {
      activeSessionIdRef.current = null;
      void asrClient.stopSession(sessionId);
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

      <section className="status-card status-card-secondary" aria-label="识别状态">
        <div>
          <span
            className={`status-dot status-${asrStatus.state}`}
            aria-hidden="true"
          />
          <strong>{asrStatusTitle}</strong>
        </div>
        <p>{asrStatusDetail}</p>
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

function OverlayWindow({
  now,
  subscribeToSubtitleSnapshots,
}: {
  now: () => number;
  subscribeToSubtitleSnapshots: SubtitleSnapshotSubscriber;
}) {
  const storeRef = useRef<SubtitleStore | null>(null);
  const [subtitles, setSubtitles] = useState(createDemoSubtitleLines);

  if (!storeRef.current) {
    storeRef.current = new SubtitleStore();
  }

  useEffect(() => {
    return subscribeToSubtitleSnapshots((event) => {
      const store = storeRef.current;
      if (!store) {
        return;
      }

      store.replaceSegments(event.segments.map(toSubtitleStoreSegment));
      store.applyChanges(event.changes);
      setSubtitles(store.getVisibleLines({ nowMs: now(), maxLines: 3 }));
    });
  }, [now, subscribeToSubtitleSnapshots]);

  if (subtitles.length === 0) {
    return null;
  }

  return (
    <main className="overlay-shell">
      <div className="overlay-label">SEMANTIC REWIND</div>
      <section className="subtitle-card" role="status" aria-live="polite">
        {subtitles.map((subtitle) => (
          <SubtitleLine key={subtitle.id} line={subtitle} />
        ))}
      </section>
    </main>
  );
}

export function App({
  windowKind,
  createAudioCapture = createDefaultAudioCapture,
  asrClient = createDefaultAsrSessionClient(),
  createSessionId = createDefaultSessionId,
  subscribeToAsrEvents = createDefaultAsrEventSubscriber,
  subscribeToSubtitleSnapshots = createDefaultSubtitleSnapshotSubscriber,
  now = Date.now,
}: AppProps) {
  return windowKind === "overlay"
    ? (
      <OverlayWindow
        now={now}
        subscribeToSubtitleSnapshots={subscribeToSubtitleSnapshots}
      />
    )
    : (
      <ControlWindow
        createAudioCapture={createAudioCapture}
        asrClient={asrClient}
        createSessionId={createSessionId}
        subscribeToAsrEvents={subscribeToAsrEvents}
      />
    );
}
