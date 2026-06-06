import { demoSubtitles } from "./demo-subtitles";
// @ts-expect-error Vite handles CSS side-effect imports at bundle time.
import "./styles.css";

export type WindowKind = "control" | "overlay";

interface AppProps {
  windowKind: WindowKind;
}

function ControlWindow() {
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
          <span className="status-dot" aria-hidden="true" />
          <strong>准备就绪</strong>
        </div>
        <p>等待接入系统音频</p>
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

      <button className="primary-action" type="button" disabled>
        开始演示
      </button>
      <p className="action-note">系统音频将在后续独立 PR 中接入</p>
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
      <section className={`subtitle-card state-${subtitle.state}`}>
        <p className="translation">{subtitle.translatedText}</p>
        <p className="source">{subtitle.sourceText}</p>
      </section>
    </main>
  );
}

export function App({ windowKind }: AppProps) {
  return windowKind === "overlay" ? <OverlayWindow /> : <ControlWindow />;
}
