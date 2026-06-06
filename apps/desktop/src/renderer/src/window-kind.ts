export type WindowKind = "control" | "overlay";

export function getWindowKind(hash: string): WindowKind {
  return hash === "#overlay" ? "overlay" : "control";
}

export function getWindowTitle(kind: WindowKind): string {
  return kind === "overlay" ? "同声传译字幕" : "AI 同声传译助手";
}
