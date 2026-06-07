import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load environment variables from a .env file into process.env.
 * Values in the file override existing process.env entries, so the
 * project-level .env always wins over any shell-level leftovers.
 *
 * Only intended for use in development (app.isPackaged === false).
 * In packaged builds, env vars must be supplied by the system.
 */
export function loadDotEnv(appPath: string): void {
  // In dev, appPath is apps/desktop. Monorepo root is two levels up.
  const envPath = resolve(appPath, "../../.env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    // Strip optional surrounding quotes from the value
    const raw = trimmed.slice(eqIdx + 1).trim();
    const value = raw.replace(/^(["'])(.*)\1$/, "$2");

    process.env[key] = value;
  }
}
