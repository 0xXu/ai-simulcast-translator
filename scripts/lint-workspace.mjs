import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

await requireJson("package.json", (pkg) => {
  const requiredScripts = [
    "build",
    "ci",
    "dev",
    "format:check",
    "lint",
    "test:run",
    "typecheck",
    "verify:demo",
  ];
  for (const script of requiredScripts) {
    if (!pkg.scripts?.[script]) {
      failures.push(`package.json: missing script ${script}`);
    }
  }

  if (pkg.packageManager !== "pnpm@11.5.2") {
    failures.push("package.json: packageManager must stay pnpm@11.5.2");
  }
});

await requireText(".env.example", (text) => {
  for (const name of [
    "MIMO_BASE_URL",
    "MIMO_API_KEY",
    "MIMO_MODEL",
    "WHISPER_MODEL",
  ]) {
    if (!text.includes(`${name}=`)) {
      failures.push(`.env.example: missing ${name}`);
    }
  }
});

await requireText("README.md", (text) => {
  for (const phrase of [
    "pnpm run ci",
    "pnpm verify:demo",
    "MIMO_API_KEY",
    "Semantic Rewind",
  ]) {
    if (!text.includes(phrase)) {
      failures.push(`README.md: missing ${phrase}`);
    }
  }
});

for (const file of [
  ".github/workflows/ci.yml",
  "docs/demo.md",
  "scripts/verify-demo.mjs",
]) {
  if (!existsSync(join(root, file))) {
    failures.push(`${file}: missing required PR11 artifact`);
  }
}

if (failures.length > 0) {
  console.error("Workspace lint failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("Workspace lint passed.");
}

async function requireJson(path, validate) {
  const text = await readFile(join(root, path), "utf8");
  validate(JSON.parse(text));
}

async function requireText(path, validate) {
  const text = await readFile(join(root, path), "utf8");
  validate(text);
}
