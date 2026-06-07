// packages/contracts/src/ipc.ts

import type { SubtitleSnapshotEvent } from "./subtitle";

/**
 * 协议版本号
 */
export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

/**
 * 基础消息结构
 */
export interface IpcMessage {
  readonly protocolVersion: ProtocolVersion;
  readonly timestamp: number;
}

/**
 * 应用状态查询响应
 */
export interface AppStatus {
  readonly isRunning: boolean;
  readonly version: string;
  readonly platform: NodeJS.Platform;
  readonly uptime: number;
}

/**
 * 前端到后端的命令
 */
export interface FrontendToBackendCommands {
  readonly "app.status": {
    readonly request: IpcMessage;
    readonly response: AppStatus;
  };
}

/**
 * 后端到前端的事件
 */
export interface BackendToFrontendEvents {
  readonly "app.ready": {
    readonly timestamp: number;
  };
  readonly "subtitle.snapshot": SubtitleSnapshotEvent;
}

/**
 * 命令名称类型
 */
export type CommandName = keyof FrontendToBackendCommands;

/**
 * 事件名称类型
 */
export type EventName = keyof BackendToFrontendEvents;
