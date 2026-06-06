import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import type { WindowKind } from "./app/app";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("找不到 React 根节点");
}

const windowKind: WindowKind =
  window.location.hash === "#overlay" ? "overlay" : "control";

createRoot(rootElement).render(
  <StrictMode>
    <App windowKind={windowKind} />
  </StrictMode>,
);
