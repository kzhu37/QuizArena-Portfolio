(function bootstrapUsageTracker(ns) {
  function emptyUsage() {
    return {
      version: ns.LOCAL_RUNTIME_VERSION,
      usedClueIds: [],
      usedCategoryIds: [],
      usedCategoryTitles: [],
      usedFamilies: [],
      usedFinalIds: [],
      usedFinalCategories: [],
      usedAnswerKeys: [],
      boardHashes: [],
      boardTitleHashes: [],
      boardFamilyPatterns: []
    };
  }

  class UsageTracker {
    constructor(storage) {
      this.storage = storage || window.localStorage;
      this.state = this.load();
    }

    load() {
      const raw = ns.safeParseJson(this.storage.getItem(ns.LOCAL_USAGE_KEY), emptyUsage());
      return {
        ...emptyUsage(),
        ...(raw || {})
      };
    }

    save() {
      this.storage.setItem(ns.LOCAL_USAGE_KEY, JSON.stringify(this.state));
    }

    snapshot() {
      return {
        clueIds: new Set(this.state.usedClueIds),
        categoryIds: new Set(this.state.usedCategoryIds),
        categoryTitles: new Set(this.state.usedCategoryTitles),
        familySet: new Set(this.state.usedFamilies),
        finalIds: new Set(this.state.usedFinalIds),
        finalCategories: new Set(this.state.usedFinalCategories),
        answerKeys: new Set(this.state.usedAnswerKeys),
        boardHashes: new Set(this.state.boardHashes),
        boardTitleHashes: new Set(this.state.boardTitleHashes),
        boardFamilyPatterns: new Set(this.state.boardFamilyPatterns),
        titleHistory: this.state.usedCategoryTitles.slice(),
        familyHistory: this.state.usedFamilies.slice(),
        finalCategoryHistory: this.state.usedFinalCategories.slice()
      };
    }

    reset() {
      this.state = emptyUsage();
      this.storage.removeItem(ns.LOCAL_USAGE_KEY);
    }

    markGamePackage(gamePackage) {
      const clueIds = new Set(this.state.usedClueIds);
      const categoryIds = new Set(this.state.usedCategoryIds);
      const answerKeys = new Set(this.state.usedAnswerKeys);
      const boardHashes = new Set(this.state.boardHashes);
      const boardTitleHashes = this.state.boardTitleHashes.slice();
      const boardFamilyPatterns = this.state.boardFamilyPatterns.slice();
      const finalIds = new Set(this.state.usedFinalIds);

      const categoryTitleHistory = this.state.usedCategoryTitles.slice();
      const familyHistory = this.state.usedFamilies.slice();
      const finalCategoryHistory = this.state.usedFinalCategories.slice();

      for (const round of gamePackage.rounds || []) {
        if (!round) continue;
        if (round.boardHash) boardHashes.add(round.boardHash);
        const categoryTitles = (round.categories || []).map((category) => category.title).filter(Boolean);
        const familyPattern = (round.categories || []).map((category) => category.family || "general").sort().join("|");
        if (categoryTitles.length) {
          boardTitleHashes.push(ns.hashString(categoryTitles.slice().sort().join("|")));
        }
        if (familyPattern) {
          boardFamilyPatterns.push(ns.hashString(familyPattern));
        }
        for (const category of round.categories || []) {
          if (category.setId) categoryIds.add(category.setId);
          if (category.title) categoryTitleHistory.push(category.title);
          if (category.family) familyHistory.push(category.family);
          for (const clue of category.clues || []) {
            clueIds.add(clue.id);
            if (clue.answerKey) answerKeys.add(clue.answerKey);
          }
        }
      }

      for (const option of gamePackage.finalOptions || []) {
        finalIds.add(option.id);
        if (option.answerKey) answerKeys.add(option.answerKey);
        if (option.categoryTitle) finalCategoryHistory.push(option.categoryTitle);
      }

      this.state.usedClueIds = [...clueIds];
      this.state.usedCategoryIds = [...categoryIds];
      this.state.usedCategoryTitles = categoryTitleHistory;
      this.state.usedFamilies = familyHistory;
      this.state.usedFinalIds = [...finalIds];
      this.state.usedFinalCategories = finalCategoryHistory;
      this.state.usedAnswerKeys = [...answerKeys];
      this.state.boardHashes = [...boardHashes];
      this.state.boardTitleHashes = boardTitleHashes.slice(-ns.RECENT_BOARD_TITLE_HASH_WINDOW);
      this.state.boardFamilyPatterns = boardFamilyPatterns.slice(-ns.RECENT_BOARD_FAMILY_HASH_WINDOW);
      this.save();
    }

    markState(state) {
      if (!state) return;

      const gamePackage = {
        rounds: Array.isArray(state.rounds) ? state.rounds.map((round) => ({
          boardHash: round.boardHash,
          categories: Array.isArray(round.categories) ? round.categories.map((category) => ({
            setId: category.setId,
            title: category.title,
            family: category.family,
            clues: Array.isArray(category.clues) ? category.clues.map((clue) => ({
              id: clue.id,
              answerKey: clue.answerKey
            })) : []
          })) : []
        })) : [],
        finalOptions: Array.isArray(state.final?.options) ? state.final.options.map((option) => ({
          id: option.id,
          answerKey: option.answerKey,
          categoryTitle: option.categoryTitle || option.cat
        })) : []
      };

      this.markGamePackage(gamePackage);
    }
  }

  ns.UsageTracker = UsageTracker;
})(window.Jeopardy = window.Jeopardy || {});
