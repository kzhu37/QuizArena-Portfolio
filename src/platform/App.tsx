import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { HubScreen } from "./HubScreen";
import { JeopardyModeScreen } from "./JeopardyModeScreen";
import { HangmanModeScreen } from "./HangmanModeScreen";
import { RouteLoadingOverlay } from "./RouteLoadingOverlay";
import { WordleModeScreen } from "./WordleModeScreen";
import { CursorGlow } from "./CursorGlow";
import { ParticleCanvas } from "./ParticleCanvas";
import { criticalAssetPreloadList } from "./assets";
import { FLAGSHIP_BOARD_MODE_ROUTE, FLAGSHIP_BOARD_MODE_ROUTE_ALIASES } from "./product";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HubScreen />} />
      <Route path={FLAGSHIP_BOARD_MODE_ROUTE} element={<JeopardyModeScreen />} />
      {FLAGSHIP_BOARD_MODE_ROUTE_ALIASES.map((route) => (
        <Route key={route} path={route} element={<JeopardyModeScreen />} />
      ))}
      <Route path="/wordle" element={<WordleModeScreen />} />
      <Route path="/hangman" element={<HangmanModeScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function isPortfolioCaptureMode() {
  const hashQuery = window.location.hash.includes("?")
    ? window.location.hash.slice(window.location.hash.indexOf("?") + 1)
    : "";
  return new URLSearchParams(hashQuery).get("portfolioCapture") === "1";
}

export function App() {
  const location = useLocation();
  const captureMode = isPortfolioCaptureMode();
  const [loadingVisible, setLoadingVisible] = useState(!captureMode);
  const [transitioning, setTransitioning] = useState(!captureMode);

  useEffect(() => {
    const preloaders = criticalAssetPreloadList
      .filter((asset) => Boolean(asset.path))
      .map((asset) => {
        const image = new Image();
        image.decoding = "async";
        image.src = asset.path!;
        return image;
      });
    return () => {
      preloaders.splice(0, preloaders.length);
    };
  }, []);

  useEffect(() => {
    if (captureMode) {
      setLoadingVisible(false);
      setTransitioning(false);
      return;
    }

    setLoadingVisible(true);
    setTransitioning(true);
    const t1 = window.setTimeout(() => setLoadingVisible(false), 360);
    const t2 = window.setTimeout(() => setTransitioning(false), 480);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [captureMode, location.pathname]);

  return (
    <>
      <div className={transitioning ? "page-transition-enter page-transition-enter-active" : ""}>
        <AppRoutes />
      </div>
      <RouteLoadingOverlay visible={loadingVisible} />
      <CursorGlow />
      <ParticleCanvas />
    </>
  );
}
