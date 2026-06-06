// apps/desktop/src/main/ipc/app-status.ts

import { app } from "electron";
import type { AppStatus } from "@simulcast/contracts";

/**
 * 获取应用状态
 */
export function getAppStatus(): AppStatus {
  return {
    isRunning: true,
    version: app.getVersion(),
    platform: process.platform,
    uptime: process.uptime(),
  };
}
