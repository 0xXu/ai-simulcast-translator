import {
  desktopCapturer,
  session,
  type DesktopCapturerSource,
  type Session,
} from "electron";

type GetSources = typeof desktopCapturer.getSources;

export function registerDisplayMediaHandler(
  targetSession: Session = session.defaultSession,
  getSources: GetSources = desktopCapturer.getSources.bind(desktopCapturer),
): void {
  targetSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      void getSources({
        types: ["screen"],
        thumbnailSize: { width: 0, height: 0 },
      })
        .then((sources: DesktopCapturerSource[]) => {
          const source = sources[0];
          if (!source) {
            callback({});
            return;
          }

          callback({
            video: source,
            audio: "loopback",
          });
        })
        .catch((error: unknown) => {
          console.error("获取桌面音频源失败", error);
          callback({});
        });
    },
    { useSystemPicker: true },
  );
}
