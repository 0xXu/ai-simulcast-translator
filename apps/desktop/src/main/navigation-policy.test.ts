import { describe, expect, it } from "vitest";

import { isAllowedExternalUrl } from "./navigation-policy";

describe("isAllowedExternalUrl", () => {
  it("allows HTTPS URLs", () => {
    expect(isAllowedExternalUrl("https://example.com/path?q=1")).toBe(true);
  });

  it.each([
    "http://example.com",
    "file:///tmp/index.html",
    "javascript:alert(1)",
    "custom://example.com",
    "not a valid URL",
  ])("rejects %s", (url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });
});
