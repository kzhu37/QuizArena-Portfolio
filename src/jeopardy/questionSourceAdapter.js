(function bootstrapQuestionSourceAdapter(ns) {
  function dailyDoubleCountForRound(round, roundIndex) {
    return (round?.roundType || (roundIndex === 0 ? "r1" : "r2")) === "r2" ? 2 : 1;
  }

  function assignDailyDoubles(rounds, playerCount, rng) {
    const positions = [];
    rounds.forEach((round, roundIndex) => {
      const eligible = [];
      round.categories.forEach((category, categoryIndex) => {
        category.clues.forEach((clue, clueIndex) => {
          clue.dd = false;
          if (clue.value >= 1000) {
            eligible.push({ roundIndex, categoryIndex, clueIndex });
          }
        });
      });

      const shuffled = ns.shuffleWith(rng, eligible).slice(0, dailyDoubleCountForRound(round, roundIndex));
      for (const pick of shuffled) {
        round.categories[pick.categoryIndex].clues[pick.clueIndex].dd = true;
        positions.push(pick);
      }
    });

    return {
      total: positions.length,
      positions
    };
  }

  class LocalQuestionSourceAdapter {
    constructor(deps) {
      this.repository = deps.repository;
      this.boardAssembler = deps.boardAssembler;
      this.finalSelector = deps.finalSelector;
      this.validator = deps.validator;
      this.usageTracker = deps.usageTracker;
    }

    buildGamePackage({ rng, playerCount, difficultyMode }) {
      const usageSnapshot = this.usageTracker.snapshot();
      const sessionPlan = ns.createSessionPlan(rng);

      for (let attempt = 0; attempt < ns.MAX_GAME_ASSEMBLY_ATTEMPTS; attempt += 1) {
        const sessionContext = ns.createSessionContext();
        const round1 = this.boardAssembler.assembleRound({
          roundType: "r1",
          rng,
          usageSnapshot,
          sessionPlan,
          sessionContext,
          difficultyMode
        });
        ns.absorbBoardIntoSession(sessionContext, round1);

        const round2 = this.boardAssembler.assembleRound({
          roundType: "r2",
          rng,
          usageSnapshot,
          sessionPlan,
          sessionContext,
          difficultyMode
        });
        ns.absorbBoardIntoSession(sessionContext, round2);

        const finalOptions = this.finalSelector.selectFinalOptions({
          rng,
          usageSnapshot,
          sessionContext,
          difficultyMode
        });

        const rounds = [round1, round2];
        const doubles = assignDailyDoubles(rounds, playerCount, rng);
        return { rounds, finalOptions, doubles };
      }

      throw new Error("Unable to assemble a fresh Jeopardy game package from the local bank.");
    }
  }

  class DisabledRemoteQuestionSourceAdapter {
    buildGamePackage() {
      throw new Error("Remote question generation is disabled in this build.");
    }
  }

  function createQuestionSourceAdapter(deps) {
    return new LocalQuestionSourceAdapter(deps);
  }

  function enablePortfolioCaptureMode() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("portfolioCapture") !== "1") return;

    window.addEventListener("load", () => {
      window.setTimeout(() => {
        const setupScreen = document.getElementById("setupScreen");
        const playerCount = document.getElementById("playerCount");
        const quickStart = document.getElementById("quickBtn");
        if (!setupScreen || !quickStart || window.getComputedStyle(setupScreen).display === "none") return;

        if (playerCount) {
          playerCount.value = "2";
          playerCount.dispatchEvent(new Event("change", { bubbles: true }));
        }
        quickStart.click();
      }, 250);
    }, { once: true });
  }

  ns.LocalQuestionSourceAdapter = LocalQuestionSourceAdapter;
  ns.DisabledRemoteQuestionSourceAdapter = DisabledRemoteQuestionSourceAdapter;
  ns.createQuestionSourceAdapter = createQuestionSourceAdapter;
  enablePortfolioCaptureMode();
})(window.Jeopardy = window.Jeopardy || {});
