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
  console.log("[AudioCapture] Registering display media request handler...");
  targetSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      console.log("[AudioCapture] DisplayMediaRequestHandler invoked! request:", request);
      void getSources({
        types: ["screen"],
        thumbnailSize: { width: 0, height: 0 },
      })
        .then((sources: DesktopCapturerSource[]) => {
          console.log("[AudioCapture] getSources returned sources count:", sources.length);
          const source = sources[0];
          if (!source) {
            console.warn("[AudioCapture] No screen source found, calling callback with empty object");
            callback({});
            return;
          }

          console.log("[AudioCapture] Selecting source:", source.name, "id:", source.id);
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
    { useSystemPicker: false },
  );
}
