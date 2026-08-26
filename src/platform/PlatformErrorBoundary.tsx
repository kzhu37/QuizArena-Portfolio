import React from "react";

interface PlatformErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class PlatformErrorBoundary extends React.Component<React.PropsWithChildren, PlatformErrorBoundaryState> {
  state: PlatformErrorBoundaryState = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: unknown): PlatformErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown platform runtime error."
    };
  }

  componentDidCatch(error: unknown) {
    console.error("Platform shell render failed.", error);
  }

  handleReturnToLobby = () => {
    window.location.hash = "#/";
    window.location.reload();
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="platform-shell platform-shell-recovery">
        <section className="glass-panel recovery-panel">
          <div className="eyebrow">Recovery Mode</div>
          <h1>Quizler hit a runtime snag.</h1>
          <p className="muted">
            The app caught a render error instead of blanking the whole screen. You can head back to the lobby or reload the
            shell cleanly.
          </p>
          <div className="status-banner" role="alert">
            <div className="eyebrow">Error</div>
            <p>{this.state.message}</p>
          </div>
          <div className="game-end-actions">
            <button className="platform-button platform-button-primary" onClick={this.handleReturnToLobby} type="button">
              Back To Lobby
            </button>
            <button className="platform-button" onClick={this.handleReload} type="button">
              Reload App
            </button>
          </div>
        </section>
      </main>
    );
  }
}
