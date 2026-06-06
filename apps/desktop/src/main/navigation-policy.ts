export function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).protocol === "https:";
  } catch {
    return false;
  }
}

export function decideNavigation(
  targetUrl: string,
  currentUrl: string,
  isMainFrame: boolean,
): "allow-current" | "open-external" | "block" {
  if (!isMainFrame) {
    return "allow-current";
  }

  try {
    const target = new URL(targetUrl);
    const current = new URL(currentUrl);

    target.hash = "";
    current.hash = "";

    if (target.href === current.href) {
      return "allow-current";
    }
  } catch {
    // Invalid URLs cannot be treated as current-page navigation.
  }

  return isAllowedExternalUrl(targetUrl) ? "open-external" : "block";
}
