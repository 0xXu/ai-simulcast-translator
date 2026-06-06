export function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).protocol === "https:";
  } catch {
    return false;
  }
}
