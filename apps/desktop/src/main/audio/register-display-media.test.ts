import { describe, expect, it, vi } from "vitest";
import type { DesktopCapturerSource, Session } from "electron";
import { registerDisplayMediaHandler } from "./register-display-media";

describe("registerDisplayMediaHandler", () => {
  it("uses the system picker and grants loopback audio in the fallback handler", async () => {
    const handlers: Array<
      NonNullable<Parameters<Session["setDisplayMediaRequestHandler"]>[0]>
    > = [];
    const targetSession = {
      setDisplayMediaRequestHandler: vi.fn((nextHandler, options) => {
        if (nextHandler) {
          handlers.push(nextHandler);
        }
        expect(options).toEqual({ useSystemPicker: true });
      }),
    } as unknown as Session;
    const source = { id: "screen:1:0", name: "Main screen" } as DesktopCapturerSource;
    const getSources = vi.fn().mockResolvedValue([source]);

    registerDisplayMediaHandler(targetSession, getSources);

    const callback = vi.fn();
    handlers[0]?.(
      {
        frame: null,
        securityOrigin: "file://",
        videoRequested: true,
        audioRequested: true,
        userGesture: true,
      },
      callback,
    );
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledWith({
        video: source,
        audio: "loopback",
      });
    });
    expect(getSources).toHaveBeenCalledWith({
      types: ["screen"],
      thumbnailSize: { width: 0, height: 0 },
    });
  });
});
