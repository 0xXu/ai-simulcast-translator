# PR 10：新增字幕快照回溯与修订高亮实施记录

**Goal:** 将 MiMo 返回的最近字幕快照应用到字幕时间线，并为 renderer 提供 Semantic Rewind 所需的原位替换和轻量高亮展示模型。

**Architecture:** `@simulcast/application` 新增 `applySubtitleSnapshot`，以 `SubtitleTimeline` 的公开方法为端口应用快照，不依赖 Electron 或 React。Renderer 新增字幕视图 store 与 `SubtitleLine` 展示组件，基于应用层返回的 `highlightUntilMs` 显示 500 至 800 ms 的修订反馈。

**Scope:**

- 新增 `packages/application/src/revision/apply-subtitle-snapshot.ts`。
- 支持较小或相同 `requestId` 的旧快照被丢弃。
- 应用新快照前先执行修订窗口锁定。
- 只更新未锁定字幕；锁定字幕不参与快照替换。
- 支持快照比当前可编辑窗口更长时新增字幕段。
- 返回 `AppliedSubtitleChange`，包含修订类型、变更字段、原因和高亮截止时间。
- 新增 renderer `SubtitleStore`，把高亮元数据投影成 UI 行。
- 新增 `SubtitleLine` 组件，并在 overlay demo 中使用同一展示组件。

**Excluded:**

- 不在本 PR 将真实 MiMo 响应接入 Electron Main。
- 不实现跨窗口字幕事件广播。
- 不改变 ASR raw transcript 链路。
- 不解决现有 desktop 全量测试里的 Electron binary 下载和 Windows pathname 断言问题。

## Verification Record

- [x] `corepack pnpm --filter @simulcast/application test:run`
- [x] `corepack pnpm --filter @simulcast/application typecheck`
- [x] `corepack pnpm exec vitest run src/renderer/entities/subtitle/subtitle-store.test.ts --reporter verbose`
- [x] `corepack pnpm exec vitest run src/renderer/features/subtitles/subtitle-line.test.tsx --reporter verbose`
- [x] `corepack pnpm exec vitest run src/renderer/src/app/app.test.tsx --reporter verbose`
- [x] `corepack pnpm --filter @simulcast/desktop typecheck`

## PR Description Draft

### 功能描述

新增字幕快照应用器和 Semantic Rewind 展示模型。应用层可将 MiMo 字幕快照安全应用到 `SubtitleTimeline`，renderer 可根据返回的变更元数据在原位置显示短暂修订高亮。

### 实现思路

- 通过 `requestId` 阻止旧快照覆盖新字幕。
- 在应用快照前执行修订窗口锁定，保证超出 5 句或 20 秒的字幕不再被普通快照修改。
- 按可编辑字幕窗口顺序应用快照，新增内容生成稳定 segment id。
- Renderer store 只保存展示投影和高亮截止时间，不持有业务事实来源。

### 测试方式

1. `corepack pnpm --filter @simulcast/application test:run`
2. `corepack pnpm --filter @simulcast/application typecheck`
3. `corepack pnpm exec vitest run src/renderer/entities/subtitle/subtitle-store.test.ts --reporter verbose`
4. `corepack pnpm exec vitest run src/renderer/features/subtitles/subtitle-line.test.tsx --reporter verbose`
5. `corepack pnpm exec vitest run src/renderer/src/app/app.test.tsx --reporter verbose`
6. `corepack pnpm --filter @simulcast/desktop typecheck`

### 风险与限制

- 当前 overlay 仍使用演示字幕数据，真实字幕事件接入属于后续桌面集成工作。
- 快照与已有段落按可编辑窗口顺序对齐；若未来 MiMo 响应包含显式 segment id，可升级为 id 优先匹配。
