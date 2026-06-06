import { pathToFileURL } from "node:url";

export type WindowKind = "control" | "overlay";

interface CreateRendererUrlOptions {
  windowKind: WindowKind;
  isPackaged: boolean;
  devServerUrl: string | undefined;
  productionHtmlPath: string;
}

const allowedDevelopmentHosts = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

export function createRendererUrl({
  windowKind,
  isPackaged,
  devServerUrl,
  productionHtmlPath,
}: CreateRendererUrlOptions): string {
  let url: URL;

  if (isPackaged || !devServerUrl) {
    url = pathToFileURL(productionHtmlPath);
  } else {
    try {
      url = new URL(devServerUrl);
    } catch {
      throw new Error(`开发服务器 URL 无效: ${devServerUrl}`);
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`开发服务器 URL 协议不受支持: ${url.protocol}`);
    }

    if (!allowedDevelopmentHosts.has(url.hostname)) {
      throw new Error(`开发服务器 URL 主机不受信任: ${url.hostname}`);
    }
  }

  url.hash = windowKind;
  return url.toString();
}
