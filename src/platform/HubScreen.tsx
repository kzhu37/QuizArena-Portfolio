import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { AssetLayer } from "./AssetLayer";
import { modeRegistry } from "./modes";
import { quizzlerPoses, screenBackgrounds } from "./assets";
import { burstPortal } from "./ParticleCanvas";

const PORTAL_LAYOUT: Record<string, { className: string }> = {
  wordle: { className: "portal-hitbox portal-hitbox-wordle" },
  flagship: { className: "portal-hitbox portal-hitbox-flagship" },
  hangman: { className: "portal-hitbox portal-hitbox-hangman" }
};

const HUB_PARTICLES = [
  { left: "8%", top: "18%", size: 7, delay: "0s", duration: "11s" },
  { left: "18%", top: "72%", size: 5, delay: "1.2s", duration: "13s" },
  { left: "26%", top: "26%", size: 4, delay: "2.4s", duration: "10s" },
  { left: "39%", top: "14%", size: 6, delay: "0.8s", duration: "14s" },
  { left: "56%", top: "72%", size: 5, delay: "3.1s", duration: "12s" },
  { left: "66%", top: "30%", size: 4, delay: "1.6s", duration: "11s" },
  { left: "76%", top: "58%", size: 6, delay: "2.1s", duration: "15s" },
  { left: "86%", top: "20%", size: 7, delay: "4.3s", duration: "13s" }
];

export function HubScreen() {
  const [wordleMode, flagshipMode, hangmanMode] = modeRegistry;
  const stageRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const setCursorVars = (xPercent: number, yPercent: number) => {
      stage.style.setProperty("--cursor-x", `${xPercent}%`);
      stage.style.setProperty("--cursor-y", `${yPercent}%`);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      setCursorVars(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
    };

    const handlePointerLeave = () => setCursorVars(50, 54);

    setCursorVars(50, 54);
    stage.addEventListener("pointermove", handlePointerMove);
    stage.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      stage.removeEventListener("pointermove", handlePointerMove);
      stage.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  return (
    <main className="platform-shell hub-shell">
      <section className="hub-stage hub-stage-classic" ref={stageRef}>
        <AssetLayer asset={screenBackgrounds.hub} className="hub-scene-backdrop">
          <div className="hero-scrim hub-scene-scrim" />
        </AssetLayer>

        <div className="hub-ambient-layer" aria-hidden="true">
          <div className="hub-cursor-light" />
          {HUB_PARTICLES.map((particle, index) => (
            <span
              className="hub-particle"
              key={index}
              style={
                {
                  "--particle-left": particle.left,
                  "--particle-top": particle.top,
                  "--particle-size": `${particle.size}px`,
                  "--particle-delay": particle.delay,
                  "--particle-duration": particle.duration
                } as CSSProperties
              }
            />
          ))}
        </div>

        <header className="glass-panel hub-topbar">
          <div className="hub-title-wrap">
            <div className="eyebrow">Quizler Lobby</div>
            <h1>Quizler Arena</h1>
            <p className="hub-title-tag">Choose your portal.</p>
          </div>
          <AssetLayer asset={quizzlerPoses.welcome} className="hub-title-mascot" aria-hidden="true">
            <div className="quizzler-glow" />
          </AssetLayer>
        </header>

        <Link
          aria-label={`Enter ${wordleMode.title}`}
          className={PORTAL_LAYOUT.wordle.className}
          to={wordleMode.route ?? "/"}
          onClick={(e) => burstPortal(e.clientX, e.clientY)}
        >
          <div className="portal-glow" />
          <div className="portal-label">
            <span className="portal-letter">{wordleMode.shortLabel}</span>
            <strong>{wordleMode.title}</strong>
            <span className="portal-subtitle">{wordleMode.subtitle}</span>
          </div>
        </Link>

        <Link
          aria-label={`Enter ${flagshipMode.title}`}
          className={PORTAL_LAYOUT.flagship.className}
          to={flagshipMode.route ?? "/"}
          onClick={(e) => burstPortal(e.clientX, e.clientY)}
        >
          <div className="portal-glow portal-glow-flagship" />
          <div className="portal-label portal-label-flagship">
            <span className="portal-letter">{flagshipMode.shortLabel}</span>
            <strong>{flagshipMode.title}</strong>
            <span className="portal-subtitle">{flagshipMode.subtitle}</span>
          </div>
        </Link>

        <Link
          aria-label={`Enter ${hangmanMode.title}`}
          className={PORTAL_LAYOUT.hangman.className}
          to={hangmanMode.route ?? "/"}
          onClick={(e) => burstPortal(e.clientX, e.clientY)}
        >
          <div className="portal-glow" />
          <div className="portal-label">
            <span className="portal-letter">{hangmanMode.shortLabel}</span>
            <strong>{hangmanMode.title}</strong>
            <span className="portal-subtitle">{hangmanMode.subtitle}</span>
          </div>
        </Link>
      </section>
    </main>
  );
}
