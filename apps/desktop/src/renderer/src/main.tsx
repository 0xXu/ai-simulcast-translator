import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import { getWindowKind, getWindowTitle } from "./window-kind";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("找不到 React 根节点");
}

const windowKind = getWindowKind(window.location.hash);

document.title = getWindowTitle(windowKind);

createRoot(rootElement).render(
  <StrictMode>
    <App windowKind={windowKind} />
  </StrictMode>,
);
