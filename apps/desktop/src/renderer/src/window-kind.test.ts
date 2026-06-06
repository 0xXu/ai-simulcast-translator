import { describe, expect, it } from "vitest";

import { getWindowKind, getWindowTitle } from "./window-kind";

describe("getWindowKind", () => {
  it("selects the overlay window for the overlay hash", () => {
    expect(getWindowKind("#overlay")).toBe("overlay");
  });

  it("selects the control window for other hashes", () => {
    expect(getWindowKind("#control")).toBe("control");
  });
});

describe("getWindowTitle", () => {
  it("returns the control window title", () => {
    expect(getWindowTitle("control")).toBe("AI 同声传译助手");
  });

  it("returns the overlay window title", () => {
    expect(getWindowTitle("overlay")).toBe("同声传译字幕");
  });
});
