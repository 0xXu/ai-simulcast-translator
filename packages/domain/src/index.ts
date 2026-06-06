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
