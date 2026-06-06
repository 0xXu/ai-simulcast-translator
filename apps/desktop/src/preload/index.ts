// apps/desktop/src/preload/index.ts

import { contextBridge, ipcRenderer } from "electron";
import type { PreloadApi } from "./api";
import type { AppStatus } from "@simulcast/contracts";

const runtimeInfo = Object.freeze({
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  }),
});

const api: PreloadApi = {
  async getAppStatus(): Promise<AppStatus> {
    return ipcRenderer.invoke("app.status");
  },

  getRuntimeInfo() {
    return runtimeInfo;
  },
};

contextBridge.exposeInMainWorld("api", api);
contextBridge.exposeInMainWorld("runtimeInfo", runtimeInfo);
