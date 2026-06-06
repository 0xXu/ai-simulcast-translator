// packages/domain/src/revision/operation.ts

/**
 * 修订操作类型
 */
export type RevisionOperationType = "upsert" | "replace";

/**
 * 修订操作接口
 */
export interface RevisionOperation {
  readonly type: RevisionOperationType;
  readonly segmentId: string;
  readonly expectedVersion: number;
  readonly translation: string;
  readonly reason?: string;
}

/**
 * 修订请求接口
 */
export interface RevisionRequest {
  readonly requestId: string;
  readonly sessionId: string;
  readonly baseRevision: number;
  readonly operations: readonly RevisionOperation[];
}

/**
 * 修订响应接口
 */
export interface RevisionResponse {
  readonly requestId: string;
  readonly sessionId: string;
  readonly baseRevision: number;
  readonly appliedOperations: readonly RevisionOperation[];
  readonly rejectedOperations: readonly {
    readonly operation: RevisionOperation;
    readonly reason: string;
  }[];
}

/**
 * 创建 upsert 操作
 */
export function createUpsertOperation(
  segmentId: string,
  translation: string,
  expectedVersion: number = 0,
  reason?: string,
): RevisionOperation {
  return {
    type: "upsert",
    segmentId,
    expectedVersion,
    translation,
    reason,
  };
}

/**
 * 创建 replace 操作
 */
export function createReplaceOperation(
  segmentId: string,
  translation: string,
  expectedVersion: number,
  reason?: string,
): RevisionOperation {
  return {
    type: "replace",
    segmentId,
    expectedVersion,
    translation,
    reason,
  };
}

/**
 * 创建修订请求
 */
export function createRevisionRequest(
  requestId: string,
  sessionId: string,
  baseRevision: number,
  operations: readonly RevisionOperation[],
): RevisionRequest {
  return {
    requestId,
    sessionId,
    baseRevision,
    operations,
  };
}

/**
 * 验证修订操作是否有效
 */
export function validateRevisionOperation(operation: RevisionOperation): boolean {
  if (operation.type !== "upsert" && operation.type !== "replace") {
    return false;
  }

  if (typeof operation.segmentId !== "string" || operation.segmentId.length === 0) {
    return false;
  }

  if (typeof operation.expectedVersion !== "number" || operation.expectedVersion < 0) {
    return false;
  }

  if (typeof operation.translation !== "string") {
    return false;
  }

  return true;
}
