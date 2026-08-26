import type { ReactNode } from "react";

interface ActionConfig {
  label: string;
  onClick: () => void;
  tone?: "primary" | "secondary" | "danger";
}

interface GameEndOverlayProps {
  open: boolean;
  title: string;
  subtitle: string;
  tone?: "win" | "loss";
  stats?: ReactNode;
  primaryAction: ActionConfig;
  secondaryAction: ActionConfig;
  tertiaryAction?: ActionConfig;
}

function actionClassName(action: ActionConfig) {
  if (action.tone === "danger") return "platform-button platform-button-danger";
  if (action.tone === "primary") return "platform-button platform-button-primary";
  return "platform-button";
}

export function GameEndOverlay({
  open,
  title,
  subtitle,
  tone = "win",
  stats,
  primaryAction,
  secondaryAction,
  tertiaryAction
}: GameEndOverlayProps) {
  if (!open) return null;

  return (
    <div className="game-end-overlay" role="presentation">
      <div
        aria-modal="true"
        className={`game-end-card game-end-card-${tone}`}
        role="dialog"
      >
        <div className="eyebrow">{tone === "win" ? "Victory" : "Round Complete"}</div>
        <h2>{title}</h2>
        <p className="muted">{subtitle}</p>
        {stats ? <div className="game-end-stats">{stats}</div> : null}
        <div className="game-end-actions">
          <button className={actionClassName(primaryAction)} onClick={primaryAction.onClick} type="button">
            {primaryAction.label}
          </button>
          <button className={actionClassName(secondaryAction)} onClick={secondaryAction.onClick} type="button">
            {secondaryAction.label}
          </button>
          {tertiaryAction ? (
            <button className={actionClassName(tertiaryAction)} onClick={tertiaryAction.onClick} type="button">
              {tertiaryAction.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
