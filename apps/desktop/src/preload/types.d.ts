export {};

import type { PreloadApi } from "./api";

declare global {
  interface Window {
    readonly api: PreloadApi;
    readonly runtimeInfo: Readonly<{
      platform: NodeJS.Platform;
      versions: Readonly<{
        chrome: string;
        electron: string;
        node: string;
      }>;
    }>;
  }
}
