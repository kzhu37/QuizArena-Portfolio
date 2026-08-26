import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { RippleButton } from "./RippleButton";
import {
  type DemoMultiplayerConfig,
  TROPHY_HELP_LINES,
  generateDemoPartyLink
} from "./demoMultiplayer";

type SocialPanel = "none" | "party-link" | "multiplayer";
type CopyStatus = "idle" | "copied" | "failed";

interface DemoSocialControlsProps {
  config: DemoMultiplayerConfig;
}

function copyWithFallback(value: string) {
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-10000px";
  textArea.style.top = "-10000px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  let success = false;
  try {
    success = document.execCommand("copy");
  } finally {
    document.body.removeChild(textArea);
  }

  return success;
}

export function DemoSocialControls({ config }: DemoSocialControlsProps) {
  const [activePanel, setActivePanel] = useState<SocialPanel>("none");
  const [partyLink, setPartyLink] = useState(() => generateDemoPartyLink());
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [showHelp, setShowHelp] = useState(false);
  const [pendingModeTitle, setPendingModeTitle] = useState<string | null>(null);
  const panelTitleId = useId();
  const notHostedTitleId = useId();

  useEffect(() => {
    if (activePanel === "none" && pendingModeTitle === null) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pendingModeTitle !== null) {
          setPendingModeTitle(null);
          return;
        }

        setActivePanel("none");
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [activePanel, pendingModeTitle]);

  useEffect(() => {
    if (activePanel === "none" && pendingModeTitle === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activePanel, pendingModeTitle]);

  useEffect(() => {
    if (copyStatus === "idle") return;

    const timeout = window.setTimeout(() => {
      setCopyStatus("idle");
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  function openPartyLinkPanel() {
    setPartyLink(generateDemoPartyLink());
    setCopyStatus("idle");
    setPendingModeTitle(null);
    setActivePanel("party-link");
  }

  function openMultiplayerPanel() {
    setShowHelp(false);
    setPendingModeTitle(null);
    setActivePanel("multiplayer");
  }

  async function handleCopyLink() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(partyLink);
        setCopyStatus("copied");
        return;
      }

      const copied = copyWithFallback(partyLink);
      setCopyStatus(copied ? "copied" : "failed");
    } catch {
      setCopyStatus("failed");
    }
  }

  function closePanels() {
    setPendingModeTitle(null);
    setActivePanel("none");
  }

  function openNotHostedNotice(modeTitle: string) {
    setPendingModeTitle(modeTitle);
  }

  function closeNotHostedNotice() {
    setPendingModeTitle(null);
  }

  const isPartyPanel = activePanel === "party-link";
  const isMultiplayerPanel = activePanel === "multiplayer";
  const portalTarget = typeof document === "undefined" ? null : document.body;

  const modalOverlay =
    activePanel !== "none" && portalTarget
      ? createPortal(
          <div className="demo-social-overlay" onClick={closePanels} role="presentation">
            <section
              aria-labelledby={panelTitleId}
              aria-modal="true"
              className={`glass-panel demo-social-modal ${isPartyPanel ? "demo-social-modal-party" : "demo-social-modal-multiplayer"}`}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <header className="demo-social-header">
                <div>
                  <div className="demo-social-badge">Demo Preview</div>
                  <h2 id={panelTitleId}>
                    {isPartyPanel ? "Demo Party Link" : `${config.gameTitle} Multiplayer Preview`}
                  </h2>
                </div>
                <button className="demo-social-close" onClick={closePanels} type="button">
                  Close
                </button>
              </header>

              <div className="demo-social-scroll">
                {isPartyPanel ? (
                  <>
                    <p className="demo-social-description">
                      Share this presentation link with friends for the demo flow. It does not create a live online room.
                    </p>
                    <div className="demo-party-link-card">
                      <span className="demo-party-link-label">Demo Party Link</span>
                      <code>{partyLink}</code>
                    </div>
                    <div className="demo-social-actions">
                      <RippleButton
                        className="platform-button platform-button-social"
                        onClick={handleCopyLink}
                        type="button"
                      >
                        Copy Demo Link
                      </RippleButton>
                      <RippleButton className="platform-button" onClick={openPartyLinkPanel} type="button">
                        Generate New Demo Link
                      </RippleButton>
                    </div>
                    <p className="demo-copy-feedback" role="status">
                      {copyStatus === "copied" ? "Demo link copied." : " "}
                      {copyStatus === "failed" ? "Copy failed on this browser. Select and copy manually." : ""}
                    </p>
                    <p className="demo-social-footnote">
                      Demo only: party links are visual placeholders and are not connected to real hosting.
                    </p>
                  </>
                ) : null}

                {isMultiplayerPanel ? (
                  <>
                    <p className="demo-social-description">{config.description}</p>
                    <div className="demo-multiplayer-meta">
                      <div className="demo-trophy-card">
                        <span>Trophies</span>
                        <strong>{config.trophyCount.toLocaleString()}</strong>
                      </div>
                      <button
                        aria-expanded={showHelp}
                        className="demo-help-button"
                        onClick={() => setShowHelp((current) => !current)}
                        type="button"
                      >
                        ?
                      </button>
                    </div>

                    {showHelp ? (
                      <div className="demo-help-panel">
                        <div className="eyebrow">Trophy Help</div>
                        <ul>
                          {TROPHY_HELP_LINES.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="demo-mode-grid">
                      {config.modeOptions.map((mode) => (
                        <article className="demo-mode-card" key={mode.title}>
                          <div>
                            <h3>{mode.title}</h3>
                            <p>{mode.description}</p>
                          </div>
                          <div className="demo-mode-actions">
                            <RippleButton
                              className="platform-button platform-button-social demo-mode-play"
                              onClick={() => openNotHostedNotice(mode.title)}
                              type="button"
                            >
                              Preview
                            </RippleButton>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </section>
          </div>,
          portalTarget
        )
      : null;

  const modeNoticeOverlay =
    pendingModeTitle !== null && portalTarget
      ? createPortal(
          <div className="demo-social-suboverlay" onClick={closeNotHostedNotice} role="presentation">
            <section
              aria-labelledby={notHostedTitleId}
              aria-modal="true"
              className="glass-panel demo-social-submodal"
              onClick={(event) => event.stopPropagation()}
              role="alertdialog"
            >
              <h3 id={notHostedTitleId}>Multiplayer Is Not Hosted Yet</h3>
              <p>
                <strong>{pendingModeTitle}</strong> is available as a demo preview only. Live hosting and matchmaking are not active yet in this build.
              </p>
              <div className="demo-social-actions">
                <RippleButton
                  className="platform-button platform-button-social"
                  onClick={closeNotHostedNotice}
                  type="button"
                >
                  Got It
                </RippleButton>
              </div>
            </section>
          </div>,
          portalTarget
        )
      : null;

  return (
    <>
      <div className="demo-social-inline">
        <RippleButton
          className="platform-button platform-button-social"
          onClick={openMultiplayerPanel}
          type="button"
        >
          Multiplayer Preview
        </RippleButton>
        <RippleButton
          className="platform-button platform-button-social"
          onClick={openPartyLinkPanel}
          type="button"
        >
          Demo Party Link
        </RippleButton>
      </div>
      {modalOverlay}
      {modeNoticeOverlay}
    </>
  );
}
