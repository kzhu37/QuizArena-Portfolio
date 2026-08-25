(function bootstrapPortfolioCapture() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("portfolioCapture") !== "1") return;

  window.setTimeout(() => {
    const setupScreen = document.getElementById("setupScreen");
    const playerCount = document.getElementById("playerCount");
    const quickStart = document.getElementById("quickBtn");

    if (!setupScreen || setupScreen.style.display === "none" || !quickStart) return;

    if (playerCount) {
      playerCount.value = "2";
      playerCount.dispatchEvent(new Event("change", { bubbles: true }));
    }

    quickStart.click();
  }, 250);
})();
