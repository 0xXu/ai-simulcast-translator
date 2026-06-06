// apps/desktop/src/main/ipc/register-handlers.ts

import { ipcMain } from "electron";
import { getAppStatus } from "./app-status";
import { validateIpcMessage } from "@simulcast/contracts";

/**
 * 注册所有 IPC 命令处理器
 */
export function registerIpcHandlers(): void {
  ipcMain.handle("app.status", (_event, request) => {
    // 验证请求格式
    validateIpcMessage(request);

    return getAppStatus();
  });
}
