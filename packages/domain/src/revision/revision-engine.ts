// packages/domain/src/revision/revision-engine.ts

import type { SubtitleSegment } from "../subtitle/segment";
import { updateTranslatedText, updateState } from "../subtitle/segment";
import type { SubtitleTimeline } from "../subtitle/timeline";
import type {
  RevisionRequest,
  RevisionResponse,
  RevisionOperation,
} from "./operation";
import { validateRevisionOperation } from "./operation";

/**
 * 修订引擎配置
 */
export interface RevisionEngineConfig {
  /**
   * 允许的最大版本差异
   * 如果 baseRevision 与当前 revision 差距超过此值，拒绝修订
   */
  readonly maxRevisionGap: number;
}

/**
 * 默认修订引擎配置
 */
export const DEFAULT_REVISION_ENGINE_CONFIG: RevisionEngineConfig = {
  maxRevisionGap: 10,
};

/**
 * 修订引擎类
 * 处理版本化的字幕修订操作
 */
export class RevisionEngine {
  private config: RevisionEngineConfig;

  constructor(config: RevisionEngineConfig = DEFAULT_REVISION_ENGINE_CONFIG) {
    this.config = config;
  }

  /**
   * 应用修订请求到时间线
   */
  applyRevisionRequest(
    request: RevisionRequest,
    timeline: SubtitleTimeline,
    currentSessionId: string,
  ): RevisionResponse {
    const appliedOperations: RevisionOperation[] = [];
    const rejectedOperations: { operation: RevisionOperation; reason: string }[] = [];

    // 检查 sessionId 是否匹配
    if (request.sessionId !== currentSessionId) {
      for (const operation of request.operations) {
        rejectedOperations.push({
          operation,
          reason: "会话 ID 不匹配",
        });
      }
      return {
        requestId: request.requestId,
        sessionId: request.sessionId,
        baseRevision: request.baseRevision,
        appliedOperations,
        rejectedOperations,
      };
    }

    // 检查 baseRevision 是否可接受
    const currentRevision = timeline.getRevision();
    const revisionGap = currentRevision - request.baseRevision;

    if (revisionGap < 0 || revisionGap > this.config.maxRevisionGap) {
      for (const operation of request.operations) {
        rejectedOperations.push({
          operation,
          reason: `修订版本过旧：当前版本 ${currentRevision}，请求基础版本 ${request.baseRevision}`,
        });
      }
      return {
        requestId: request.requestId,
        sessionId: request.sessionId,
        baseRevision: request.baseRevision,
        appliedOperations,
        rejectedOperations,
      };
    }

    // 逐个应用操作
    for (const operation of request.operations) {
      const result = this.applyOperation(operation, timeline);
      if (result.success) {
        appliedOperations.push(operation);
      } else {
        rejectedOperations.push({
          operation,
          reason: result.reason,
        });
      }
    }

    return {
      requestId: request.requestId,
      sessionId: request.sessionId,
      baseRevision: request.baseRevision,
      appliedOperations,
      rejectedOperations,
    };
  }

  /**
   * 应用单个操作
   */
  private applyOperation(
    operation: RevisionOperation,
    timeline: SubtitleTimeline,
  ): { success: boolean; reason: string } {
    // 验证操作格式
    if (!validateRevisionOperation(operation)) {
      return { success: false, reason: "操作格式无效" };
    }

    // 获取目标片段
    const segment = timeline.getSegment(operation.segmentId);
    if (!segment) {
      return { success: false, reason: `片段 ${operation.segmentId} 不存在` };
    }

    // 检查片段状态
    if (segment.state === "locked") {
      return { success: false, reason: `片段 ${operation.segmentId} 已锁定` };
    }

    // 检查版本匹配
    if (operation.type === "replace" && segment.translationVersion !== operation.expectedVersion) {
      return {
        success: false,
        reason: `版本不匹配：当前版本 ${segment.translationVersion}，期望版本 ${operation.expectedVersion}`,
      };
    }

    // 应用操作
    const updated = updateTranslatedText(segment, operation.translation);
    if (!updated) {
      return { success: false, reason: `更新片段 ${operation.segmentId} 失败` };
    }

    return { success: true, reason: "" };
  }
}
