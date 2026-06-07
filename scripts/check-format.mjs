import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([
  ".git",
  ".codegraph",
  "node_modules",
  "out",
  "dist",
  "coverage",
  ".venv",
  ".pytest_cache",
  "__pycache__",
  "blob-report",
  "playwright-report",
  "test-results",
]);
const checkedExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const failures = [];

for await (const file of walk(root)) {
  if (!shouldCheck(file)) {
    continue;
  }

  const text = await readFile(file, "utf8");
  const rel = toDisplayPath(file);

  if (text.length > 0 && !text.endsWith("\n")) {
    failures.push(`${rel}: missing final newline`);
  }

  const lines = text.split(/\n/);
  lines.forEach((line, index) => {
    if (/[ \t]$/.test(line.replace(/\r$/, ""))) {
      failures.push(`${rel}:${index + 1}: trailing whitespace`);
    }
  });
}

if (failures.length > 0) {
  console.error("Text format check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("Text format check passed.");
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        yield* walk(join(dir, entry.name));
      }
      continue;
    }

    if (entry.isFile()) {
      yield join(dir, entry.name);
    }
  }
}

function shouldCheck(file) {
  const lower = file.toLowerCase();
  return [...checkedExtensions].some((extension) => lower.endsWith(extension));
}

function toDisplayPath(file) {
  return relative(root, file).replaceAll("\\", "/");
}
