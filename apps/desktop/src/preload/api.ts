// apps/desktop/src/preload/api.ts

import type {
  AppStatus,
  CommandName,
  FrontendToBackendCommands,
} from "@simulcast/contracts";

/**
 * 白名单 API 类型定义
 * 只暴露安全的、类型化的接口给渲染进程
 */
export interface PreloadApi {
  /**
   * 查询应用状态
   */
  readonly getAppStatus: () => Promise<AppStatus>;

  /**
   * 获取运行时信息
   */
  readonly getRuntimeInfo: () => Readonly<{
    platform: NodeJS.Platform;
    versions: Readonly<{
      chrome: string;
      electron: string;
      node: string;
    }>;
  }>;
}
