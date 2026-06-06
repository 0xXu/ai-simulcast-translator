import { describe, expect, it } from "vitest";

import { createRendererUrl } from "./renderer-url";

const productionHtmlPath = "/Applications/AI Simulcast Translator/index.html";

describe("createRendererUrl", () => {
  it("ignores a malicious development URL when the app is packaged", () => {
    const rendererUrl = createRendererUrl({
      windowKind: "control",
      isPackaged: true,
      devServerUrl: "data:text/html,<script>alert(1)</script>",
      productionHtmlPath,
    });

    const url = new URL(rendererUrl);
    expect(url.protocol).toBe("file:");
    expect(url.pathname).toBe(
      "/Applications/AI%20Simulcast%20Translator/index.html",
    );
    expect(url.hash).toBe("#control");
  });

  it.each([
    "http://localhost:5173",
    "https://localhost:5173",
    "http://127.0.0.1:5173",
    "https://127.0.0.1:5173/path?mode=test",
    "http://[::1]:5173",
    "https://[::1]:5173",
  ])("allows the local development server %s", (devServerUrl) => {
    const rendererUrl = createRendererUrl({
      windowKind: "overlay",
      isPackaged: false,
      devServerUrl,
      productionHtmlPath,
    });

    const url = new URL(rendererUrl);
    expect(url.origin).toBe(new URL(devServerUrl).origin);
    expect(url.hash).toBe("#overlay");
  });

  it.each([
    ["remote host", "https://example.com", /主机不受信任/],
    ["data URL", "data:text/html,malicious", /协议不受支持/],
    ["file URL", "file:///tmp/index.html", /协议不受支持/],
  ])(
    "rejects a %s development URL",
    (_description, devServerUrl, expectedError) => {
      expect(() =>
        createRendererUrl({
          windowKind: "control",
          isPackaged: false,
          devServerUrl,
          productionHtmlPath,
        }),
      ).toThrow(expectedError);
    },
  );

  it.each(["control", "overlay"] as const)(
    "sets the %s hash",
    (windowKind) => {
      const rendererUrl = createRendererUrl({
        windowKind,
        isPackaged: false,
        devServerUrl: "http://localhost:5173",
        productionHtmlPath,
      });

      expect(new URL(rendererUrl).hash).toBe(`#${windowKind}`);
    },
  );

  it("falls back to the production file when no development URL exists", () => {
    const rendererUrl = createRendererUrl({
      windowKind: "overlay",
      isPackaged: false,
      devServerUrl: undefined,
      productionHtmlPath,
    });

    const url = new URL(rendererUrl);
    expect(url.protocol).toBe("file:");
    expect(url.hash).toBe("#overlay");
  });
});
