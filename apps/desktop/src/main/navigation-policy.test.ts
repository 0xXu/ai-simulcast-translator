import { describe, expect, it } from "vitest";

import { decideNavigation, isAllowedExternalUrl } from "./navigation-policy";

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

describe("decideNavigation", () => {
  it("allows navigation outside the main frame", () => {
    expect(
      decideNavigation(
        "http://example.com/frame",
        "file:///app/index.html#control",
        false,
      ),
    ).toBe("allow-current");
  });

  it("allows the same page with a different hash", () => {
    expect(
      decideNavigation(
        "file:///app/index.html#overlay",
        "file:///app/index.html#control",
        true,
      ),
    ).toBe("allow-current");
  });

  it("opens cross-origin HTTPS navigation externally", () => {
    expect(
      decideNavigation(
        "https://example.com/docs",
        "https://app.example.test/",
        true,
      ),
    ).toBe("open-external");
  });

  it("opens same-origin HTTPS navigation to another path externally", () => {
    expect(
      decideNavigation(
        "https://app.example.test/settings",
        "https://app.example.test/",
        true,
      ),
    ).toBe("open-external");
  });

  it.each([
    "http://example.com",
    "file:///tmp/other.html",
    "javascript:alert(1)",
    "not a valid URL",
  ])("blocks %s", (targetUrl) => {
    expect(
      decideNavigation(targetUrl, "file:///app/index.html#control", true),
    ).toBe("block");
  });
});
