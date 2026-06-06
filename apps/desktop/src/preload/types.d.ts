export {};

declare global {
  interface Window {
    runtimeInfo: Readonly<{
      platform: NodeJS.Platform;
      versions: Readonly<{
        chrome: string;
        electron: string;
        node: string;
      }>;
    }>;
  }
}
