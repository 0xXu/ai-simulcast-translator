// apps/desktop/src/preload/api.test.ts

import { describe, it, expectTypeOf } from "vitest";
import type { PreloadApi } from "./api";
import type { AppStatus } from "@simulcast/contracts";

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
});
