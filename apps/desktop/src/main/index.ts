import { app, BrowserWindow, shell } from "electron";
import type { BrowserWindowConstructorOptions } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type WindowKind = "control" | "overlay";

function getRendererUrl(windowKind: WindowKind): string {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (rendererUrl) {
    const url = new URL(rendererUrl);
    url.hash = windowKind;
    return url.toString();
  }

  const url = pathToFileURL(join(__dirname, "../renderer/index.html"));
  url.hash = windowKind;
  return url.toString();
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
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void window.loadURL(getRendererUrl(windowKind));

  return window;
}

function createControlWindow(): BrowserWindow {
  return createWindow("control", {
    title: "AI 同声传译助手",
    width: 920,
    height: 720,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: "#f4f7fb",
  });
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

  return window;
}

function createWindows(): void {
  createControlWindow();
  createOverlayWindow();
}

app.whenReady().then(() => {
  createWindows();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindows();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
