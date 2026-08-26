import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./platform/App";
import { PlatformErrorBoundary } from "./platform/PlatformErrorBoundary";
import "./platform/styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PlatformErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </PlatformErrorBoundary>
  </React.StrictMode>
);
