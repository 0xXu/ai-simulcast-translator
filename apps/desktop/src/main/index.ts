import { app, BrowserWindow, screen, shell } from "electron";
import type { BrowserWindowConstructorOptions } from "electron";
import { join } from "node:path";
import { WhisperWorkerAdapter } from "@simulcast/infrastructure";
import { loadDotEnv } from "./load-dot-env";

// In development, load .env from the monorepo root so process.env is
// populated before any code reads WHISPER_* or MIMO_* variables.
// In a packaged build, env vars must be supplied by the OS / launcher.
if (!app.isPackaged) {
  loadDotEnv(app.getAppPath());
}

import { decideNavigation, isAllowedExternalUrl } from "./navigation-policy";
import { createRendererUrl } from "./renderer-url";
import type { WindowKind } from "./renderer-url";
import { registerIpcHandlers } from "./ipc/register-handlers";
import { registerDisplayMediaHandler } from "./audio/register-display-media";
import { AsrSessionController } from "./asr/asr-session-controller";
import {
  createAsrCleanup,
  publishAsrEventToWindows,
  registerAsrHandlers,
  resolveAsrLaunchOptions,
} from "./asr/register-asr-handlers";
import { resolveAsrWorkerCwd } from "./asr/resolve-worker-cwd";
import {
  SubtitleSessionBridge,
  publishSubtitleSnapshotToWindows,
} from "./subtitle/subtitle-session-bridge";
import { createTranslatorFromEnv } from "./subtitle/translator-factory";

let controlWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

function openExternalUrl(url: string): void {
  void shell.openExternal(url).catch((error: unknown) => {
    console.error("打开外部链接失败", { url, error });
  });
}

function handleStartupFailure(context: string, error: unknown): void {
  console.error(context, error);
  process.exitCode = 1;
  app.quit();
}

function createWindow(
  windowKind: WindowKind,
  options: BrowserWindowConstructorOptions,
): BrowserWindow {
  const window = new BrowserWindow({
    ...options,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, "../preload/index.js"),
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      openExternalUrl(url);
    }

    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event) => {
    const decision = decideNavigation(
      event.url,
      window.webContents.getURL(),
      event.isMainFrame,
    );

    if (decision === "allow-current") {
      return;
    }

    event.preventDefault();

    if (decision === "open-external") {
      openExternalUrl(event.url);
    }
  });

  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error("页面加载失败", {
        errorCode,
        errorDescription,
        url: validatedURL,
      });
    },
  );

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("渲染进程退出", {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });

  void window
    .loadURL(
      createRendererUrl({
        windowKind,
        isPackaged: app.isPackaged,
        devServerUrl: process.env.ELECTRON_RENDERER_URL,
        productionHtmlPath: join(__dirname, "../renderer/index.html"),
      }),
    )
    .catch((error: unknown) => {
      console.error("加载渲染页面失败", { windowKind, error });
    });

  return window;
}

function createControlWindow(x?: number, y?: number): BrowserWindow {
  const window = createWindow("control", {
    title: "AI 同声传译助手",
    width: 680,
    height: 480,
    minWidth: 560,
    minHeight: 440,
    backgroundColor: "#f5f5f7",
    ...(x !== undefined && y !== undefined ? { x, y } : {}),
  });

  window.on("close", () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }
  });

  window.on("closed", () => {
    if (controlWindow === window) {
      controlWindow = null;
    }
  });

  return window;
}

function createOverlayWindow(
  x: number,
  y: number,
  width: number,
  height: number,
): BrowserWindow {
  const window = createWindow("overlay", {
    title: "同声传译字幕",
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
  });

  window.setAlwaysOnTop(true, "floating");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  window.on("closed", () => {
    if (overlayWindow === window) {
      overlayWindow = null;
    }
  });

  return window;
}

function isWindowAvailable(window: BrowserWindow | null): window is BrowserWindow {
  return window !== null && !window.isDestroyed();
}

function createApplicationWindows(): void {
  const OVERLAY_WIDTH = 900;
  const OVERLAY_HEIGHT = 260;
  const BOTTOM_MARGIN = 16;
  const GAP = 12; // gap between control window bottom and overlay top

  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

  // Overlay: horizontally centered, pinned near the bottom of the work area
  const overlayX = Math.round((screenWidth - OVERLAY_WIDTH) / 2);
  const overlayY = screenHeight - OVERLAY_HEIGHT - BOTTOM_MARGIN;

  // Control window: horizontally centered, sitting just above the overlay
  const controlWidth = 680;
  const controlHeight = 480;
  const controlX = Math.round((screenWidth - controlWidth) / 2);
  const controlY = Math.max(0, overlayY - GAP - controlHeight);

  if (!isWindowAvailable(controlWindow)) {
    controlWindow = createControlWindow(controlX, controlY);
  }

  if (!isWindowAvailable(overlayWindow)) {
    overlayWindow = createOverlayWindow(overlayX, overlayY, OVERLAY_WIDTH, OVERLAY_HEIGHT);
  }
}

function showAndFocusControlWindow(): void {
  createApplicationWindows();
  controlWindow?.show();
  controlWindow?.focus();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (app.isReady()) {
      showAndFocusControlWindow();
      return;
    }

    void app
      .whenReady()
      .then(showAndFocusControlWindow)
      .catch((error: unknown) => {
        handleStartupFailure("处理第二实例失败", error);
      });
  });

  void app
    .whenReady()
    .then(() => {
      console.log("=== Main Process whenReady starts ===");
      registerIpcHandlers();
      registerDisplayMediaHandler();
      const workerDirOverride = process.env.ASR_WORKER_DIR;
      const isPackaged = app.isPackaged;
      const resourcesPath = process.resourcesPath;
      const workerCwd = resolveAsrWorkerCwd({
        appPath: app.getAppPath(),
        resourcesPath,
        isPackaged,
        ...(workerDirOverride ? { override: workerDirOverride } : {}),
      });
      console.log("[Main] workerCwd resolved to:", workerCwd);
      const pythonBin = isPackaged
        ? join(workerCwd, ".venv/bin/python")
        : undefined;
      console.log("[Main] pythonBin resolved to:", pythonBin);

      const worker = new WhisperWorkerAdapter({
        workerCwd,
        pythonBin,
      });
      const subtitleBridge = new SubtitleSessionBridge({
        translator: createTranslatorFromEnv(process.env),
        publish: (event) => {
          publishSubtitleSnapshotToWindows(BrowserWindow.getAllWindows(), event);
        },
      });
      const controller = new AsrSessionController({
        worker,
        publish: (event) => {
          publishAsrEventToWindows(BrowserWindow.getAllWindows(), event);
          void subtitleBridge.handleAsrEvent(event).catch((error: unknown) => {
            console.error("字幕事件处理失败", error);
          });
        },
        launch: resolveAsrLaunchOptions(process.env),
      });
      const unregisterAsr = registerAsrHandlers(controller);
      const cleanupAsr = createAsrCleanup(controller, unregisterAsr);
      app.once("before-quit", () => {
        subtitleBridge.dispose();
        cleanupAsr();
      });
      createApplicationWindows();

      app.on("activate", () => {
        createApplicationWindows();
        controlWindow?.show();
        controlWindow?.focus();
      });
    })
    .catch((error: unknown) => {
      handleStartupFailure("应用启动失败", error);
    });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
