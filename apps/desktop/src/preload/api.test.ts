// apps/desktop/src/preload/api.test.ts

import { describe, it, expectTypeOf } from "vitest";
import type { PreloadApi } from "./api";
import type {
  AppStatus,
  AsrEvent,
  AsrSessionResponse,
} from "@simulcast/contracts";

describe("PreloadApi Types", () => {
  it("getAppStatus returns Promise<AppStatus>", () => {
    expectTypeOf<PreloadApi["getAppStatus"]>().returns.toMatchTypeOf<
      Promise<AppStatus>
    >();
  });

  it("getRuntimeInfo returns readonly object", () => {
    const returnType = expectTypeOf<PreloadApi["getRuntimeInfo"]>().returns;
    returnType.toHaveProperty("platform");
    returnType.toHaveProperty("versions");
  });

  it("exposes exact ASR method types", () => {
    expectTypeOf<PreloadApi["startAsrSession"]>().toEqualTypeOf<
      (sessionId: string) => Promise<AsrSessionResponse>
    >();
    expectTypeOf<PreloadApi["sendAsrAudio"]>().toEqualTypeOf<
      (
        sessionId: string,
        audio: Int16Array,
        sampleRate?: 16000,
        channels?: 1,
      ) => void
    >();
    expectTypeOf<PreloadApi["stopAsrSession"]>().toEqualTypeOf<
      (sessionId: string) => Promise<AsrSessionResponse>
    >();
    expectTypeOf<PreloadApi["onAsrEvent"]>().toEqualTypeOf<
      (listener: (event: AsrEvent) => void) => () => void
    >();
  });
});
