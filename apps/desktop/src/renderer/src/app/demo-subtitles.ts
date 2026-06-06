export interface DemoSubtitle {
  id: string;
  sourceText: string;
  translatedText: string;
  state: "live" | "revisable" | "locked";
}

export const demoSubtitles: DemoSubtitle[] = [
  {
    id: "demo-001",
    sourceText:
      "Context helps real-time translation become more accurate.",
    translatedText: "上下文会让实时翻译逐步变得更准确。",
    state: "revisable",
  },
];
