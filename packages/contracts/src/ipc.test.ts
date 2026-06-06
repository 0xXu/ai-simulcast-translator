// packages/contracts/src/ipc.test.ts

import { describe, it, expect } from "vitest";
import { PROTOCOL_VERSION } from "./ipc";

describe("IPC Protocol", () => {
  it("exports protocol version as a constant", () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(typeof PROTOCOL_VERSION).toBe("number");
  });

  it("protocol version is immutable", () => {
    expect(() => {
      // @ts-expect-error: Testing immutability
      (PROTOCOL_VERSION as any) = 2;
    }).toThrow();
  });
});
