import { describe, expect, it } from "vitest";
import { resolveAsrWorkerCwd } from "./resolve-worker-cwd";

describe("resolveAsrWorkerCwd", () => {
  it("uses an explicit override", () => {
    expect(
      resolveAsrWorkerCwd({
        appPath: "/repo/apps/desktop",
        resourcesPath: "/Applications/App/Contents/Resources",
        isPackaged: false,
        override: "/custom/asr",
      }),
    ).toBe("/custom/asr");
  });

  it("resolves the workspace Worker during development", () => {
    expect(
      resolveAsrWorkerCwd({
        appPath: "/repo/apps/desktop",
        resourcesPath: "/unused",
        isPackaged: false,
      }),
    ).toBe("/repo/workers/asr");
  });

  it("resolves packaged Worker resources", () => {
    expect(
      resolveAsrWorkerCwd({
        appPath: "/unused",
        resourcesPath: "/Applications/App/Contents/Resources",
        isPackaged: true,
      }),
    ).toBe("/Applications/App/Contents/Resources/workers/asr");
  });
});
