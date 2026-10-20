import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { bridge } from "./bridge";
import { selectLanguage } from "./i18n";
try {
  selectLanguage((await bridge.preferences()).language);
} catch {
  // The workspace presents preference-loading failures after mounting.
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
