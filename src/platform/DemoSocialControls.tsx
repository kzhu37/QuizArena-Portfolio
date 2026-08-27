import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { RippleButton } from "./RippleButton";
import type { DemoMultiplayerConfig } from "./demoMultiplayer";

interface DemoSocialControlsProps {
  config: DemoMultiplayerConfig;
}

export function DemoSocialControls({ config }: DemoSocialControlsProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const portalTarget = typeof document === "undefined" ? null : document.body;

  useEffect(() => {
    if (!open) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const modal =
    open && portalTarget
      ? createPortal(
          <div className="demo-social-overlay" onClick={() => setOpen(false)} role="presentation">
            <section
              aria-labelledby={titleId}
              aria-modal="true"
              className="glass-panel demo-social-modal demo-social-modal-multiplayer"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <header className="demo-social-header">
                <div>
                  <div className="demo-social-badge">Concept only</div>
                  <h2 id={titleId}>{config.gameTitle} multiplayer concept</h2>
                </div>
                <button className="demo-social-close" onClick={() => setOpen(false)} type="button">
                  Close
                </button>
              </header>

              <div className="demo-social-scroll">
                <p className="demo-social-description">
                  Quizler Arena is currently a local-first, shared-screen platform. Hosted rooms,
                  remote synchronization, rankings, and matchmaking are not implemented.
                </p>
                <p className="demo-social-description">{config.conceptSummary}</p>

                <div className="demo-help-panel">
                  <div className="eyebrow">What a real implementation would require</div>
                  <ul>
                    {config.requiredSystems.map((system) => (
                      <li key={system}>{system}</li>
                    ))}
                  </ul>
                </div>

                <p className="demo-social-footnote">
                  This panel documents a possible extension. It does not simulate a live service.
                </p>
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
          onClick={() => setOpen(true)}
          type="button"
        >
          Multiplayer concept
        </RippleButton>
      </div>
      {modal}
    </>
  );
}
