import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checks = [];

checkExists("apps/desktop/out/main/index.js", "desktop main bundle");
checkExists("apps/desktop/out/preload/index.js", "desktop preload bundle");
checkExists("apps/desktop/out/renderer/index.html", "desktop renderer html");
checkExists("docs/demo.md", "demo guide");
checkExists(".env.example", "environment template");

await checkContains(
  "apps/desktop/src/main/subtitle/subtitle-session-bridge.ts",
  "SubtitleSessionBridge",
  "main subtitle bridge",
);
await checkContains(
  "apps/desktop/src/main/subtitle/translator-factory.ts",
  "SourceTextFallbackTranslator",
  "MiMo fallback translator",
);
await checkContains(
  "apps/desktop/src/preload/index.ts",
  "onSubtitleSnapshot",
  "subtitle preload API",
);
await checkContains(
  "apps/desktop/src/renderer/src/app/app.tsx",
  "subscribeToSubtitleSnapshots",
  "overlay snapshot subscription",
);
await checkContains(
  ".env.example",
  "MIMO_BASE_URL=",
  "MiMo base URL template",
);

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  console.error("Demo verification failed:");
  for (const check of failed) {
    console.error(`- ${check.label}`);
  }
  process.exitCode = 1;
} else {
  console.log("Demo verification passed.");
  for (const check of checks) {
    console.log(`- ${check.label}`);
  }
}

function checkExists(path, label) {
  checks.push({
    label,
    ok: existsSync(join(root, path)),
  });
}

async function checkContains(path, needle, label) {
  const fullPath = join(root, path);
  const ok = existsSync(fullPath)
    && (await readFile(fullPath, "utf8")).includes(needle);
  checks.push({ label, ok });
}
