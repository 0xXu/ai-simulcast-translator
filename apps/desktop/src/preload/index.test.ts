import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, type AppStatus } from "@simulcast/contracts";
import type { PreloadApi } from "./api";

const invoke = vi.fn();
const exposeInMainWorld = vi.fn();

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke },
}));

describe("preload API", () => {
  beforeEach(() => {
    vi.resetModules();
    invoke.mockReset();
    exposeInMainWorld.mockReset();
  });

  it("sends a versioned request when querying app status", async () => {
    const status: AppStatus = {
      isRunning: true,
      version: "0.1.0",
      platform: "darwin",
      uptime: 10,
    };
    invoke.mockResolvedValue(status);

    await import("./index");

    const apiCall = exposeInMainWorld.mock.calls.find(
      ([key]) => key === "api",
    );
    const api = apiCall?.[1] as PreloadApi;

    await expect(api.getAppStatus()).resolves.toEqual(status);
    expect(invoke).toHaveBeenCalledWith(
      "app.status",
      expect.objectContaining({
        protocolVersion: PROTOCOL_VERSION,
        timestamp: expect.any(Number),
      }),
    );
  });
});
