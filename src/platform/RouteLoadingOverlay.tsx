import { AssetLayer } from "./AssetLayer";
import { quizzlerPoses, screenBackgrounds } from "./assets";
import { APP_PRODUCT_TITLE } from "./product";

interface RouteLoadingOverlayProps {
  visible: boolean;
}

export function RouteLoadingOverlay({ visible }: RouteLoadingOverlayProps) {
  return (
    <div
      aria-hidden={!visible}
      aria-live="polite"
      className={`route-loading-overlay ${visible ? "is-visible" : ""}`}
      role="status"
    >
      <AssetLayer asset={screenBackgrounds.loading} className="route-loading-backdrop">
        <div className="hero-scrim route-loading-scrim" />
      </AssetLayer>
      <div className="route-loading-content glass-panel">
        <AssetLayer asset={quizzlerPoses.portal} className="route-loading-quizzler">
          <div className="quizzler-glow" />
        </AssetLayer>
        <div className="arena-spinner" aria-hidden="true" />
        <div className="route-loading-copy">
          <div className="eyebrow">{APP_PRODUCT_TITLE} Is Preparing The Stage</div>
          <h2>Loading your next challenge</h2>
        </div>
      </div>
    </div>
  );
}
