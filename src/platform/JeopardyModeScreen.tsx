import { Link } from "react-router-dom";
import { AssetLayer } from "./AssetLayer";
import { quizzlerPoses, screenBackgrounds } from "./assets";
import { getLegacyJeopardyUrl } from "./links";
import { FLAGSHIP_BOARD_MODE_NAME } from "./product";
import { useFullscreenTarget } from "./useFullscreenTarget";

export function JeopardyModeScreen() {
  const legacyPath = getLegacyJeopardyUrl();
  const { targetRef, isFullscreen, toggleFullscreen } = useFullscreenTarget<HTMLElement>();

  return (
    <main className="platform-shell platform-shell-flagship">
      <section className={`jeopardy-shell${isFullscreen ? " is-fullscreen" : ""}`} ref={targetRef}>
        <AssetLayer asset={screenBackgrounds.flagship} className="hero-backdrop hero-backdrop-jeopardy">
          <div className="hero-scrim hero-scrim-jeopardy" />
        </AssetLayer>

        <header className="glass-panel jeopardy-header">
          <div>
            <h1>{FLAGSHIP_BOARD_MODE_NAME}</h1>
            <p className="muted">Round 1, Double Jeopardy, then Final Jeopardy with wagers.</p>
          </div>
          <div className="header-actions">
            <Link className="platform-button" to="/">
              Back To Lobby
            </Link>
            <a className="platform-button platform-button-primary" href={legacyPath} target="_blank" rel="noreferrer">
              Open Standalone
            </a>
            <button
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className="fullscreen-btn"
              onClick={toggleFullscreen}
              type="button"
            >
              {isFullscreen ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              )}
            </button>
          </div>
        </header>

        <section className="jeopardy-layout">
          <aside className="glass-panel jeopardy-sidecar">
            <AssetLayer asset={quizzlerPoses.spark} className="quizzler-host-panel">
              <div className="quizzler-glow" />
            </AssetLayer>
            <div className="sidecar-copy">
              <h2>How The Game Flows</h2>
              <ul className="feature-list compact">
                <li><strong>Round 1:</strong> pick clues by value, answer cleanly, and build momentum.</li>
                <li><strong>Double Jeopardy:</strong> values rise, so swings in score get much larger.</li>
                <li><strong>Final Jeopardy:</strong> wager first, then answer one final category clue.</li>
                <li><strong>Structure:</strong> play both main rounds before the final wager decides the winner.</li>
              </ul>
            </div>
          </aside>

          <div className="glass-panel jeopardy-stage">
            <iframe className="legacy-jeopardy-frame" title={FLAGSHIP_BOARD_MODE_NAME} src={legacyPath} />
          </div>
        </section>
      </section>
    </main>
  );
}
