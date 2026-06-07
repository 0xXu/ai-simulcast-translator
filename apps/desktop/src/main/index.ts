import { app, BrowserWindow, shell } from "electron";
import type { BrowserWindowConstructorOptions } from "electron";
import { join } from "node:path";
import { WhisperWorkerAdapter } from "@simulcast/infrastructure";

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

function createControlWindow(): BrowserWindow {
  const window = createWindow("control", {
    title: "AI 同声传译助手",
    width: 920,
    height: 720,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: "#f4f7fb",
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

function createOverlayWindow(): BrowserWindow {
  const window = createWindow("overlay", {
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
  if (!isWindowAvailable(controlWindow)) {
    controlWindow = createControlWindow();
  }

  if (!isWindowAvailable(overlayWindow)) {
    overlayWindow = createOverlayWindow();
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
      registerIpcHandlers();
      registerDisplayMediaHandler();
      const workerDirOverride = process.env.ASR_WORKER_DIR;
      const worker = new WhisperWorkerAdapter({
        workerCwd: resolveAsrWorkerCwd({
          appPath: app.getAppPath(),
          resourcesPath: process.resourcesPath,
          isPackaged: app.isPackaged,
          ...(workerDirOverride ? { override: workerDirOverride } : {}),
        }),
      });
      const controller = new AsrSessionController({
        worker,
        publish: (event) => {
          publishAsrEventToWindows(BrowserWindow.getAllWindows(), event);
        },
        launch: resolveAsrLaunchOptions(process.env),
      });
      const unregisterAsr = registerAsrHandlers(controller);
      app.once(
        "before-quit",
        createAsrCleanup(controller, unregisterAsr),
      );
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
