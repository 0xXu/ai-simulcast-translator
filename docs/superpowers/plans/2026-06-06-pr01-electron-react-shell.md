# Electron 与 React 桌面应用骨架实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建可安装、可测试、可构建的 Electron + React 桌面应用骨架，同时展示控制窗口和静态悬浮字幕窗口。

**Architecture:** 使用 pnpm workspace 管理桌面应用，Electron Main 只负责窗口生命周期，preload 暴露最小只读运行时信息，React Renderer 根据 URL hash 渲染控制窗口或字幕窗口。此 PR 使用静态演示字幕，不引入业务 IPC、音频、ASR、MiMo 或字幕领域逻辑。

**Tech Stack:** Node.js 22、pnpm 11.5.2、Electron 42.3.3、electron-vite 5.0.0、Vite 7.3.5、React 19.2.7、TypeScript 6.0.3、Vitest 4.1.8、Testing Library。

---

## 文件结构

本 PR 创建或修改以下文件：

```text
.
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── apps/desktop
    ├── electron.vite.config.ts
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    └── src
        ├── main/index.ts
        ├── preload/index.ts
        ├── preload/types.d.ts
        └── renderer
            ├── index.html
            ├── src/app/app.test.tsx
            ├── src/app/app.tsx
            ├── src/app/demo-subtitles.ts
            ├── src/app/styles.css
            ├── src/main.tsx
            └── src/test/setup.ts
```

职责边界：

- `src/main/index.ts`：创建控制窗口和字幕窗口，不包含翻译业务。
- `src/preload/index.ts`：只暴露平台与版本信息，不暴露完整 Electron API。
- `src/renderer/src/app/app.tsx`：根据窗口类型组合纯展示组件。
- `src/renderer/src/app/demo-subtitles.ts`：静态演示数据，后续 PR 将由 Store 替换。
- `src/renderer/src/app/app.test.tsx`：验证两种窗口可独立渲染。

### Task 1: 建立 pnpm workspace 和统一工具链

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Modify: `.gitignore`

- [ ] **Step 1: 写入根目录 package.json**

```json
{
  "name": "ai-simulcast-translator",
  "version": "0.1.0",
  "private": true,
  "description": "具备语义回溯能力的 AI 同声传译桌面应用",
  "packageManager": "pnpm@11.5.2",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "dev": "pnpm --filter @simulcast/desktop dev",
    "build": "pnpm --filter @simulcast/desktop build",
    "typecheck": "pnpm --filter @simulcast/desktop typecheck",
    "test": "pnpm --filter @simulcast/desktop test",
    "test:run": "pnpm --filter @simulcast/desktop test:run"
  }
}
```

- [ ] **Step 2: 写入 workspace 定义**

```yaml
packages:
  - apps/*
  - packages/*

allowBuilds:
  electron: true
  esbuild: true
```

- [ ] **Step 3: 写入共享 TypeScript 配置**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: 确认忽略项完整**

`.gitignore` 至少保留以下规则：

```gitignore
/.codegraph/
.env
.env.*
!.env.example
node_modules/
dist/
out/
coverage/
.DS_Store
*.log
```

- [ ] **Step 5: 验证 workspace 文件可被 pnpm 读取**

Run:

```bash
corepack enable
pnpm --version
pnpm list --depth -1
```

Expected:

```text
11.5.2
Legend: production dependency, optional only, dev only
```

`pnpm list` 不应报告 YAML 或 package.json 解析错误。

- [ ] **Step 6: 提交工具链配置**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore
git commit -m "工程：配置项目工作区与基础工具链"
```

### Task 2: 为桌面应用编写失败的渲染测试

**Files:**

- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/vitest.config.ts`
- Create: `apps/desktop/src/renderer/src/test/setup.ts`
- Create: `apps/desktop/src/renderer/src/app/app.test.tsx`

- [ ] **Step 1: 定义桌面应用依赖和脚本**

```json
{
  "name": "@simulcast/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "react": "19.2.7",
    "react-dom": "19.2.7"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@types/node": "22.19.20",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "5.1.4",
    "electron": "42.3.3",
    "electron-vite": "5.0.0",
    "jsdom": "28.1.0",
    "typescript": "6.0.3",
    "vite": "7.3.5",
    "vitest": "4.1.8"
  }
}
```

安装后生成的 `pnpm-lock.yaml` 必须提交，不得删除或手工修改 lockfile。

- [ ] **Step 2: 配置桌面 TypeScript**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": [
    "electron.vite.config.ts",
    "vitest.config.ts",
    "src/**/*.ts",
    "src/**/*.tsx"
  ]
}
```

- [ ] **Step 3: 配置 Vitest**

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/renderer/src/test/setup.ts"],
  },
});
```

- [ ] **Step 4: 配置测试断言**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: 编写控制窗口和字幕窗口测试**

```tsx
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
```

- [ ] **Step 6: 安装依赖并验证测试失败**

Run:

```bash
pnpm install
pnpm test:run
```

Expected:

```text
FAIL  src/renderer/src/app/app.test.tsx
Error: Failed to resolve import "./app"
```

- [ ] **Step 7: 提交失败测试**

```bash
git add apps/desktop/package.json apps/desktop/tsconfig.json \
  apps/desktop/vitest.config.ts apps/desktop/src/renderer/src/test/setup.ts \
  apps/desktop/src/renderer/src/app/app.test.tsx pnpm-lock.yaml
git commit -m "测试：定义桌面应用基础界面行为"
```

### Task 3: 实现静态控制窗口和字幕窗口

**Files:**

- Create: `apps/desktop/src/renderer/src/app/demo-subtitles.ts`
- Create: `apps/desktop/src/renderer/src/app/app.tsx`
- Create: `apps/desktop/src/renderer/src/app/styles.css`

- [ ] **Step 1: 创建静态演示字幕**

```ts
export interface DemoSubtitle {
  id: string;
  sourceText: string;
  translatedText: string;
  state: "live" | "revisable" | "locked";
}

export const demoSubtitles: DemoSubtitle[] = [
  {
    id: "demo-001",
    sourceText:
      "Context helps real-time translation become more accurate.",
    translatedText: "上下文会让实时翻译逐步变得更准确。",
    state: "revisable",
  },
];
```

- [ ] **Step 2: 实现 App 组件**

```tsx
import { demoSubtitles } from "./demo-subtitles";
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
```

- [ ] **Step 3: 添加基础样式**

```css
:root {
  color: #172033;
  background: #f4f7fb;
  font-family:
    Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  font-synthesis: none;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  min-height: 100%;
  margin: 0;
}

button,
input {
  font: inherit;
}

.control-shell {
  min-height: 100vh;
  padding: 40px;
  background:
    radial-gradient(circle at 90% 5%, #dce8ff 0, transparent 34%),
    #f4f7fb;
}

.hero {
  max-width: 640px;
}

.eyebrow {
  margin: 0 0 12px;
  color: #3568d4;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

h1 {
  margin: 0;
  font-size: 42px;
  letter-spacing: -0.04em;
}

.intro {
  color: #5b6578;
  font-size: 17px;
  line-height: 1.7;
}

.status-card,
.capability-grid article {
  border: 1px solid rgba(126, 145, 177, 0.22);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 16px 40px rgba(45, 69, 108, 0.08);
}

.status-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 32px 0 18px;
  padding: 18px 20px;
}

.status-card div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-card p {
  margin: 0;
  color: #738096;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f0a93b;
  box-shadow: 0 0 0 5px rgba(240, 169, 59, 0.14);
}

.capability-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.capability-grid article {
  padding: 20px;
}

.capability-grid span {
  color: #3568d4;
  font-size: 12px;
  font-weight: 800;
}

.capability-grid h2 {
  margin: 12px 0 8px;
  font-size: 18px;
}

.capability-grid p {
  margin: 0;
  color: #68748a;
  font-size: 14px;
  line-height: 1.6;
}

.primary-action {
  width: 100%;
  margin-top: 24px;
  padding: 15px 20px;
  border: 0;
  border-radius: 14px;
  color: #fff;
  background: #315ec4;
  font-weight: 750;
}

.primary-action:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.action-note {
  margin: 10px 0 0;
  color: #7a8598;
  text-align: center;
  font-size: 12px;
}

.overlay-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 24px;
  background: transparent;
}

.overlay-label {
  align-self: flex-start;
  margin: 0 0 8px 12px;
  padding: 5px 10px;
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.76);
  background: rgba(10, 15, 27, 0.72);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.subtitle-card {
  padding: 18px 22px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 18px;
  color: #fff;
  background: rgba(9, 14, 25, 0.84);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(18px);
}

.translation {
  margin: 0;
  font-size: 25px;
  font-weight: 720;
  line-height: 1.45;
}

.source {
  margin: 8px 0 0;
  color: rgba(255, 255, 255, 0.64);
  font-size: 14px;
  line-height: 1.45;
}

@media (max-width: 720px) {
  .control-shell {
    padding: 24px;
  }

  .capability-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run:

```bash
pnpm test:run
```

Expected:

```text
Test Files  1 passed
Tests       2 passed
```

- [ ] **Step 5: 提交静态界面**

```bash
git add apps/desktop/src/renderer/src/app
git commit -m "功能：新增控制窗口与字幕演示界面"
```

### Task 4: 创建 Electron 主进程、preload 和 renderer 入口

**Files:**

- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/preload/types.d.ts`
- Create: `apps/desktop/src/renderer/index.html`
- Create: `apps/desktop/src/renderer/src/main.tsx`

- [ ] **Step 1: 配置 electron-vite**

```ts
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
});
```

- [ ] **Step 2: 实现 Electron 主进程**

```ts
import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";

function rendererUrl(windowKind: "control" | "overlay"): string {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;

  if (devServerUrl) {
    return `${devServerUrl}#${windowKind}`;
  }

  return `file://${join(__dirname, "../renderer/index.html")}#${windowKind}`;
}

function createWindow(
  windowKind: "control" | "overlay",
  options: Electron.BrowserWindowConstructorOptions,
): BrowserWindow {
  const window = new BrowserWindow({
    ...options,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void window.loadURL(rendererUrl(windowKind));
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  return window;
}

function createApplicationWindows(): void {
  createWindow("control", {
    title: "AI 同声传译助手",
    width: 920,
    height: 720,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: "#f4f7fb",
  });

  const overlay = createWindow("overlay", {
    title: "同声传译字幕",
    width: 900,
    height: 220,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
  });

  overlay.setAlwaysOnTop(true, "floating");
  overlay.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });
}

app.whenReady().then(() => {
  createApplicationWindows();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createApplicationWindows();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
```

- [ ] **Step 3: 实现最小 preload API**

```ts
import { contextBridge } from "electron";

const runtimeInfo = Object.freeze({
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  }),
});

contextBridge.exposeInMainWorld("runtimeInfo", runtimeInfo);
```

- [ ] **Step 4: 声明 renderer 类型**

```ts
export {};

declare global {
  interface Window {
    runtimeInfo: Readonly<{
      platform: NodeJS.Platform;
      versions: Readonly<{
        chrome: string;
        electron: string;
        node: string;
      }>;
    }>;
  }
}
```

- [ ] **Step 5: 创建 HTML 入口**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI 同声传译助手</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: 创建 React 入口**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, type WindowKind } from "./app/app";

function currentWindowKind(): WindowKind {
  return window.location.hash === "#overlay" ? "overlay" : "control";
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("找不到 React 根节点");
}

createRoot(root).render(
  <StrictMode>
    <App windowKind={currentWindowKind()} />
  </StrictMode>,
);
```

- [ ] **Step 7: 运行类型检查和构建**

Run:

```bash
pnpm typecheck
pnpm build
```

Expected:

```text
Process exited with code 0
out/main/index.js
out/preload/index.js
out/renderer/index.html
```

- [ ] **Step 8: 提交 Electron 入口**

```bash
git add apps/desktop/electron.vite.config.ts apps/desktop/src/main \
  apps/desktop/src/preload apps/desktop/src/renderer/index.html \
  apps/desktop/src/renderer/src/main.tsx
git commit -m "功能：创建 Electron 双窗口启动入口"
```

### Task 5: 补充环境样例和真实启动文档

**Files:**

- Create: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: 创建环境变量样例**

```dotenv
# 后续 MiMo PR 会读取这些变量；当前静态演示不需要填写。
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
MIMO_API_KEY=
MIMO_MODEL=

# 后续 Whisper PR 会读取该配置。
WHISPER_MODEL=small.en
```

- [ ] **Step 2: 将 README 当前状态更新为可运行**

将“应用代码尚未开始实现”替换为：

```markdown
> 当前状态：已完成 Electron + React 静态演示壳。控制窗口和悬浮字幕窗口可以启动；
> 系统音频、Whisper、MiMo 和语义回溯将在后续独立 PR 中接入。
```

将“没有可执行的安装和启动命令”章节替换为：

```markdown
## 环境要求

- macOS 13 或更高版本
- Node.js 22.12 或更高版本
- pnpm 11.5.2

## 安装与启动

```bash
corepack enable
pnpm install
pnpm dev
```

启动后会出现控制窗口和透明置顶字幕演示窗口。

## 验证

```bash
pnpm test:run
pnpm typecheck
pnpm build
```
```

- [ ] **Step 3: 验证 README 中的全部命令**

Run:

```bash
pnpm test:run
pnpm typecheck
pnpm build
```

Expected:

```text
所有命令退出码均为 0
```

- [ ] **Step 4: 人工启动冒烟测试**

Run:

```bash
pnpm dev
```

Expected:

- 出现标题为“AI 同声传译助手”的控制窗口。
- 出现透明、置顶、无边框的字幕窗口。
- 控制窗口显示“等待接入系统音频”。
- 字幕窗口显示中英文静态演示字幕。
- 关闭控制窗口不会导致渲染错误。

完成验证后按 `Ctrl+C` 停止开发进程。

- [ ] **Step 5: 提交文档和配置**

```bash
git add .env.example README.md
git commit -m "文档：补充桌面应用启动与验证说明"
```

### Task 6: 执行 PR 合并前检查

**Files:**

- Verify only; no source changes expected.

- [ ] **Step 1: 检查工作区变更**

Run:

```bash
git status --short
git diff --check
```

Expected:

```text
git diff --check 无输出
```

- [ ] **Step 2: 执行完整自动化验证**

Run:

```bash
pnpm test:run
pnpm typecheck
pnpm build
```

Expected:

```text
测试、类型检查和构建全部通过
```

- [ ] **Step 3: 检查安全边界**

Run:

```bash
rg "nodeIntegration:\\s*true|contextIsolation:\\s*false" apps/desktop/src
```

Expected:

```text
无输出
```

- [ ] **Step 4: 检查敏感信息**

Run:

```bash
git grep -nE "(MIMO_API_KEY=.+|sk-[A-Za-z0-9]{16,})" -- \
  ':!.env.example'
```

Expected:

```text
无输出
```

- [ ] **Step 5: 准备 PR**

PR 标题：

```text
创建可运行的 Electron 与 React 桌面应用骨架
```

PR 描述：

```markdown
## 功能描述

创建 AI 同声传译助手的首个可运行桌面版本。启动后展示控制窗口和透明置顶字幕窗口，
使用静态字幕说明后续同传效果。

## 实现思路

使用 pnpm workspace、Electron、electron-vite、React 和 TypeScript。
Electron Main 只负责双窗口生命周期，preload 仅暴露只读运行时信息，
Renderer 根据 URL hash 渲染对应界面。

## 测试方式

1. 执行 `pnpm install`。
2. 执行 `pnpm test:run`，确认 2 个组件测试通过。
3. 执行 `pnpm typecheck` 和 `pnpm build`。
4. 执行 `pnpm dev`，确认控制窗口与字幕窗口同时出现。

## 风险与限制

当前字幕为静态演示内容，尚未接入系统音频、Whisper、MiMo 和语义回溯。
这些能力将在后续单功能 PR 中实现。
```

## PR 01 完成定义

- `pnpm dev` 可以同时启动控制窗口和悬浮字幕窗口。
- `pnpm test:run`、`pnpm typecheck`、`pnpm build` 全部通过。
- Electron Renderer 未开启 Node 集成。
- 静态演示明确标注尚未接入系统音频。
- README 中的安装、启动和验证命令已在干净环境验证。
- 所有提交信息均为中文。
- PR 只交付桌面应用骨架，不包含后续业务能力。
