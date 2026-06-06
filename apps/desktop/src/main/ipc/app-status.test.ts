// apps/desktop/src/main/ipc/app-status.test.ts

import { describe, it, expect, vi } from "vitest";
import { getAppStatus } from "./app-status";

// Mock electron app
vi.mock("electron", () => ({
  app: {
    getVersion: () => "0.1.0",
  },
}));

describe("getAppStatus", () => {
  it("returns valid app status", () => {
    const status = getAppStatus();

    expect(status.isRunning).toBe(true);
    expect(status.version).toBe("0.1.0");
    expect(status.platform).toBe(process.platform);
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });

  it("returns serializable data", () => {
    const status = getAppStatus();
    const serialized = JSON.stringify(status);
    const parsed = JSON.parse(serialized);

    expect(parsed).toEqual(status);
  });
});
