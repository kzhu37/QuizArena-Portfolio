(function bootstrapGameStateAdapter(ns) {
  function normalizePlayers(playerNames) {
    return playerNames.map((name, index) => ({
      id: index,
      name: String(name || "").trim() || `Player ${index + 1}`,
      score: 0
    }));
  }

  function salvageLegacyContinuity(rawLegacy) {
    const playerNames = Array.isArray(rawLegacy?.players)
      ? rawLegacy.players.map((player, index) => player?.name || `Player ${index + 1}`)
      : [];
    return {
      playerNames: playerNames.length ? playerNames : ["Player 1", "Player 2"],
      difficultyMode: "tv",
      categoryMode: "random"
    };
  }

  function normalizeFinalOption(option) {
    return {
      id: option?.id,
      categoryTitle: option?.categoryTitle || option?.cat || "",
      clue: option?.clue || option?.q || "",
      canonicalResponse: option?.canonicalResponse || option?.a || "",
      answerKey: option?.answerKey || ns.normalizeAnswer(option?.canonicalResponse || option?.a || ""),
      fingerprint: option?.fingerprint || ns.fingerprintQA(option?.clue || option?.q || "", option?.canonicalResponse || option?.a || ""),
      difficulty: Number.isFinite(option?.difficulty) ? option.difficulty : ns.getDifficultyBand("final")[0]
    };
  }

  class GameStateAdapter {
    constructor(deps) {
      this.sourceAdapter = deps.sourceAdapter;
      this.usageTracker = deps.usageTracker;
      this.repository = deps.repository;
      this.validator = deps.validator;
      this.answerMatcher = deps.answerMatcher;
    }

    createFreshState({ playerNames, difficultyMode = "tv", categoryMode = "random", seed = null }) {
      const actualSeed = Number.isFinite(seed) ? seed : ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
      const rng = ns.mulberry32(actualSeed);
      const gamePackage = this.sourceAdapter.buildGamePackage({
        rng,
        difficultyMode,
        categoryMode,
        categorySelection: {
          r1: { confirmed: categoryMode !== "custom", selectedIds: [] },
          r2: { confirmed: categoryMode !== "custom", selectedIds: [] }
        },
        playerCount: playerNames.length
      });

      return {
        version: ns.LOCAL_RUNTIME_VERSION,
        seed: actualSeed,
        difficultyMode,
        categoryMode,
        categorySelection: {
          r1: { confirmed: categoryMode !== "custom", selectedIds: [] },
          r2: { confirmed: categoryMode !== "custom", selectedIds: [] }
        },
        roundIndex: 0,
        turnId: 0,
        rounds: gamePackage.rounds.map((round) => ({
          ...round,
          categories: round.categories.map((category) => ({
            ...category,
            clues: category.clues.map((clue) => ({
              id: clue.id,
              value: clue.value,
              clue: clue.clue,
              response: clue.canonicalResponse,
              canonicalResponse: clue.canonicalResponse,
              acceptedResponses: clue.acceptedResponses,
              answerKey: clue.answerKey,
              fingerprint: clue.fingerprint,
              difficulty: clue.difficulty,
              used: false,
              dd: clue.dd
            }))
          }))
        })),
        doubles: gamePackage.doubles,
        final: {
          options: gamePackage.finalOptions.map((option) => ({
            ...option,
            cat: option.categoryTitle,
            q: option.clue,
            a: option.canonicalResponse
          })),
          chosen: null,
          wagers: {},
          answers: {},
          suggestions: {},
          judged: {},
          stage: ns.FINAL_STAGE.CHOOSE
        },
        players: normalizePlayers(playerNames),
        opened: null,
        modal: { mode: "main", stealId: null, revealed: false },
        runtime: {
          source: "local-bank",
          builtAt: Date.now(),
          repositoryStats: this.repository.stats,
          usageCommitted: false
        }
      };
    }

    saveState(state) {
      const waitingForCustomCategories = state?.categoryMode === "custom" && (
        state.categorySelection?.r1?.confirmed !== true ||
        state.categorySelection?.r2?.confirmed !== true
      );
      if (state?.runtime && state.runtime.usageCommitted !== true && !waitingForCustomCategories) {
        this.usageTracker.markState(state);
        state.runtime.usageCommitted = true;
      }
      window.localStorage.setItem(ns.LOCAL_STATE_KEY, JSON.stringify(state));
    }

    validateLoadedState(state) {
      if (!state || state.version !== ns.LOCAL_RUNTIME_VERSION) {
        throw new Error("Saved state version does not match the local runtime.");
      }
      if (!Array.isArray(state.players) || state.players.length < 1 || state.players.length > 4) {
        throw new Error("Saved state has an invalid player list.");
      }
      if (!Array.isArray(state.rounds) || state.rounds.length !== 2) {
        throw new Error("Saved state must contain exactly two standard rounds.");
      }

      for (const round of state.rounds) {
        this.validator.validateBoard(round);
      }

      const finalOptions = Array.isArray(state.final?.options)
        ? state.final.options.map(normalizeFinalOption)
        : [];
      if (finalOptions.length) {
        this.validator.validateFinalOptions(finalOptions);
      }
    }

    loadState() {
      const rawCurrent = ns.safeParseJson(window.localStorage.getItem(ns.LOCAL_STATE_KEY), null);
      if (rawCurrent?.version === ns.LOCAL_RUNTIME_VERSION) {
        try {
          this.validateLoadedState(rawCurrent);
          return { state: rawCurrent, salvagedLegacy: false, regeneratedCurrent: false };
        } catch {
          const continuity = salvageLegacyContinuity(rawCurrent);
          window.localStorage.removeItem(ns.LOCAL_STATE_KEY);
          const state = this.createFreshState(continuity);
          this.saveState(state);
          return { state, salvagedLegacy: false, regeneratedCurrent: true };
        }
      }

      for (const key of ns.LEGACY_STATE_KEYS) {
        const rawLegacy = ns.safeParseJson(window.localStorage.getItem(key), null);
        if (!rawLegacy) continue;
        const continuity = salvageLegacyContinuity(rawLegacy);
        const state = this.createFreshState(continuity);
        this.saveState(state);
        return { state, salvagedLegacy: true, regeneratedCurrent: false };
      }

      return null;
    }

    resetAll() {
      window.localStorage.removeItem(ns.LOCAL_STATE_KEY);
      for (const key of ns.LEGACY_STATE_KEYS) {
        window.localStorage.removeItem(key);
      }
      [
        "turn_based_jeopardy_cat_history_v2",
        "turn_based_jeopardy_clue_history_v2",
        "turn_based_jeopardy_final_history_v2",
        "turn_based_jeopardy_answer_history_v1",
        "sj_used_ids_ultra_v1",
        "turn_based_jeopardy_ai_recent_fingerprints_v1",
        "turn_based_jeopardy_ai_recent_answers_v1",
        "turn_based_jeopardy_ai_recent_categories_v1"
      ].forEach((key) => window.localStorage.removeItem(key));
      this.usageTracker.reset();
    }
  }

  ns.GameStateAdapter = GameStateAdapter;
})(window.Jeopardy = window.Jeopardy || {});
