# Multilingual Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic or manually selected source-language recognition and selectable target-language translation while preserving semantic rewind and the existing English-to-Chinese default.

**Architecture:** Define language values once in the contracts package and pass immutable language settings through session start, ASR launch, transcript events, subtitle coordination, and MiMo requests. Use multilingual faster-whisper for recognition, stabilize automatic language detection in the desktop session, and bypass MiMo through a same-language translator when source and target match.

**Tech Stack:** TypeScript 6, Electron 42, React 19, Vitest, Python 3.12, pytest, faster-whisper, MiMo chat completions

---

### Task 1: Shared language catalog and session contracts

**Files:**
- Create: `packages/contracts/src/language.ts`
- Create: `packages/contracts/src/language.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/asr.ts`
- Modify: `packages/contracts/src/asr-schemas.ts`
- Modify: `packages/contracts/src/asr.test.ts`
- Modify: `packages/contracts/src/ipc.ts`
- Modify: `packages/contracts/src/ipc.test.ts`

- [ ] **Step 1: Write failing language-catalog and IPC tests**

Define expectations for `LANGUAGE_OPTIONS`, `isLanguageCode`, defaults
`auto -> zh`, session-start language fields, and optional transcript detection fields.

- [ ] **Step 2: Verify the contracts tests fail**

Run:

```bash
corepack pnpm --filter @simulcast/contracts test:run
```

Expected: failure because language exports and new fields do not exist.

- [ ] **Step 3: Implement the catalog and protocol fields**

Add:

```ts
export type LanguageCode =
  | "zh" | "en" | "ja" | "ko" | "fr" | "de"
  | "es" | "it" | "pt" | "ru" | "ar" | "hi";
export type SourceLanguageCode = LanguageCode | "auto";

export interface TranslationSessionLanguages {
  readonly sourceLanguage: SourceLanguageCode;
  readonly targetLanguage: LanguageCode;
}
```

Add `languages` to ASR session start and optional `detectedLanguage` /
`languageProbability` to transcript events. Validate all values at the schema boundary.

- [ ] **Step 4: Verify contracts tests pass**

Run:

```bash
corepack pnpm --filter @simulcast/contracts test:run
```

Expected: all contracts tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat: 新增多语言会话协议"
```

### Task 2: Multilingual faster-whisper worker

**Files:**
- Modify: `workers/asr/src/asr_worker/protocol.py`
- Modify: `workers/asr/src/asr_worker/faster_whisper_engine.py`
- Modify: `workers/asr/src/asr_worker/main.py`
- Modify: `workers/asr/src/asr_worker/test_protocol.py`
- Modify: `workers/asr/src/asr_worker/test_faster_whisper_engine.py`
- Modify: `workers/asr/src/asr_worker/test_main.py`
- Modify: `workers/asr/scripts/smoke_faster_whisper.py`

- [ ] **Step 1: Write failing worker tests**

Cover:

```python
FasterWhisperConfig(model_name="small", language=None)
FasterWhisperConfig(model_name="small", language="ja")
```

Assert automatic mode omits the transcribe language, manual mode passes it,
results contain `detected_language` and `language_probability`, and `.en`
models reject `None` or non-English languages.

- [ ] **Step 2: Verify worker tests fail**

Run:

```bash
cd workers/asr && uv run pytest -q
```

Expected: failures for absent optional language and result fields.

- [ ] **Step 3: Implement multilingual recognition**

Use `small` and `language=None` defaults. Parse `--language auto` as `None`.
Read faster-whisper transcription info and include:

```python
detected_language=info.language
language_probability=info.language_probability
```

in result messages.

- [ ] **Step 4: Verify worker tests pass**

Run:

```bash
cd workers/asr && uv run pytest -q
```

Expected: all Python tests pass.

- [ ] **Step 5: Commit**

```bash
git add workers/asr
git commit -m "feat: 支持多语言语音识别"
```

### Task 3: Desktop ASR launch and language detection propagation

**Files:**
- Modify: `packages/infrastructure/src/asr/whisper-worker-adapter.ts`
- Modify: `packages/infrastructure/src/asr/whisper-worker-adapter.test.ts`
- Modify: `apps/desktop/src/main/asr/asr-session-controller.ts`
- Modify: `apps/desktop/src/main/asr/asr-session-controller.test.ts`
- Modify: `apps/desktop/src/main/asr/register-asr-handlers.ts`
- Modify: `apps/desktop/src/main/asr/register-asr-handlers.test.ts`
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: Write failing launch and propagation tests**

Assert the adapter adds:

```text
--language auto
```

or a manual code, session start forwards languages, and transcript events publish
valid detection metadata without requiring it from mock workers.

- [ ] **Step 2: Verify focused tests fail**

Run:

```bash
corepack pnpm --filter @simulcast/infrastructure test:run
corepack pnpm --filter @simulcast/desktop test:run -- src/main/asr
```

Expected: failures because launch options and session requests lack language fields.

- [ ] **Step 3: Implement desktop ASR language flow**

Add `language` to `WhisperWorkerLaunchOptions`, pass it to the Python process,
make `startSession` accept immutable session languages, and propagate optional
detection fields. Change the default model fallback from `small.en` to `small`.

- [ ] **Step 4: Verify focused tests pass**

Run the focused commands from Step 2.

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/src/asr apps/desktop/src/main/asr apps/desktop/src/main/index.ts
git commit -m "feat: 贯通ASR语言配置与检测结果"
```

### Task 4: Language-aware translation and same-language bypass

**Files:**
- Modify: `packages/application/src/translation/subtitle-snapshot.ts`
- Modify: `packages/application/src/translation/subtitle-snapshot.test.ts`
- Modify: `packages/application/src/translation/subtitle-coordinator.ts`
- Modify: `packages/application/src/translation/subtitle-coordinator.test.ts`
- Modify: `packages/infrastructure/src/mimo/mimo-client.ts`
- Modify: `packages/infrastructure/src/mimo/mimo-client.test.ts`
- Create: `packages/infrastructure/src/mimo/same-language-translator.ts`
- Create: `packages/infrastructure/src/mimo/same-language-translator.test.ts`
- Modify: `packages/infrastructure/src/index.ts`
- Modify: `apps/desktop/src/main/subtitle/subtitle-session-controller.ts`
- Modify: `apps/desktop/src/main/subtitle/subtitle-session-controller.test.ts`

- [ ] **Step 1: Write failing translation tests**

Cover dynamic target language names, unknown source-language instructions,
same-language source passthrough, no fetch call for bypass, and preservation of
request IDs and revision-window behavior.

- [ ] **Step 2: Verify focused tests fail**

Run:

```bash
corepack pnpm --filter @simulcast/application test:run
corepack pnpm --filter @simulcast/infrastructure test:run
corepack pnpm --filter @simulcast/desktop test:run -- src/main/subtitle
```

Expected: failures because translation requests are not language-aware.

- [ ] **Step 3: Implement language-aware translation**

Add:

```ts
readonly sourceLanguage: LanguageCode | "unknown";
readonly targetLanguage: LanguageCode;
```

to translation requests. Generate MiMo instructions using catalog display names.
Implement `SameLanguageTranslator` so each raw window maps to identical source and
translated text without network access.

The subtitle session stores configured languages, stabilizes automatic detection at
probability `>= 0.5`, chooses bypass only after a stable match, and resets detection
when stopped.

- [ ] **Step 4: Verify focused tests pass**

Run the commands from Step 2.

- [ ] **Step 5: Commit**

```bash
git add packages/application packages/infrastructure apps/desktop/src/main/subtitle
git commit -m "feat: 支持多语言翻译与同语种直出"
```

### Task 5: Language selectors and renderer state

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`
- Modify: `apps/desktop/src/renderer/features/asr/use-asr-session.ts`
- Modify: `apps/desktop/src/renderer/features/asr/use-asr-session.test.ts`
- Modify: `apps/desktop/src/renderer/features/subtitle/SubtitleOverlay.tsx`
- Modify: `apps/desktop/src/renderer/features/subtitle/SubtitleOverlay.test.tsx`

- [ ] **Step 1: Write failing renderer tests**

Assert defaults are “自动检测” and “简体中文”, options can be searched/selected,
controls disable during capture, selected languages reach session start, detected
language appears in status, and same-language overlay does not duplicate text.

- [ ] **Step 2: Verify renderer tests fail**

Run:

```bash
corepack pnpm --filter @simulcast/desktop test:run -- src/renderer
```

Expected: failures because language controls are absent.

- [ ] **Step 3: Implement renderer controls**

Use native accessible `<input list>`/`<datalist>` controls backed by the shared
catalog to provide search without adding a UI dependency. Resolve the entered label
to a language code before start, keep defaults `auto` and `zh`, and disable controls
while requesting/capturing.

- [ ] **Step 4: Verify renderer tests pass**

Run the command from Step 2.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer
git commit -m "feat: 新增源语言与目标语言选择"
```

### Task 6: Full verification and documentation alignment

**Files:**
- Modify: `docs/superpowers/specs/2026-06-06-ai-simulcast-translator-design.md`
- Modify: `docs/superpowers/plans/2026-06-06-ai-simulcast-translator-roadmap.md`
- Modify: `.env.example`

- [ ] **Step 1: Update configuration and legacy scope text**

Change examples to `WHISPER_MODEL=small` and replace statements that describe the
finished product as English-to-Chinese-only. Keep the multilingual design document
as the detailed source of truth.

- [ ] **Step 2: Run formatting, lint, types, unit tests, and build**

Run:

```bash
node scripts/check-format.mjs
node scripts/lint-workspace.mjs
corepack pnpm -r typecheck
corepack pnpm -r test:run
(cd workers/asr && uv run pytest -q)
corepack pnpm run build
```

Expected: every command exits zero.

- [ ] **Step 3: Run real multilingual smoke checks**

Verify at least one multilingual Whisper sample and inspect one real MiMo request
for a non-Chinese target. If suitable local audio is unavailable, record that manual
acceptance remains outstanding rather than claiming it passed.

- [ ] **Step 4: Commit**

```bash
git add docs .env.example
git commit -m "docs: 更新多语言演示配置与说明"
```

- [ ] **Step 5: Review the final diff**

Run:

```bash
git status --short
git diff main...HEAD --check
git log --oneline main..HEAD
```

Expected: clean worktree, no whitespace errors, and scoped bilingual commits.
