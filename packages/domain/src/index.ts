// packages/domain/src/index.ts

export {
  type SegmentState,
  type SubtitleSegment,
  createSegment,
  updateSourceText,
  updateTranslatedText,
  updateState,
} from "./subtitle/segment";

export {
  type RevisionWindowConfig,
  DEFAULT_REVISION_WINDOW,
  shouldLockSegment,
  calculateSegmentsToLock,
} from "./subtitle/revision-window";

export {
  SubtitleTimeline,
} from "./subtitle/timeline";

export {
  type RevisionOperationType,
  type RevisionOperation,
  type RevisionRequest,
  type RevisionResponse,
  createUpsertOperation,
  createReplaceOperation,
  createRevisionRequest,
  validateRevisionOperation,
} from "./revision/operation";

export {
  type RevisionEngineConfig,
  DEFAULT_REVISION_ENGINE_CONFIG,
  RevisionEngine,
} from "./revision/revision-engine";
