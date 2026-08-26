(function bootstrapFinalSelector(ns) {
  function finalFreshnessScore(option, usageSnapshot, sessionContext, difficultyMode) {
    let score = ns.FINAL_FAMILY_WEIGHTS[option.family] || ns.FINAL_FAMILY_WEIGHTS.general;
    if (!usageSnapshot.finalIds.has(option.id)) score += 1.4;
    if (!usageSnapshot.answerKeys.has(option.answerKey)) score += 0.9;
    if (!sessionContext.usedAnswerKeys.has(option.answerKey)) score += 0.9;
    if (!sessionContext.usedFingerprints.has(option.fingerprint)) score += 0.8;
    if (!usageSnapshot.finalCategories.has(option.categoryTitle)) score += 0.7;

    score -= ns.recencyPenalty(usageSnapshot.finalCategoryHistory, option.categoryTitle, [1.8, 1.4, 1.0, 0.7, 0.5]);
    const target = 90;
    score -= Math.abs(option.difficulty - target) * 0.8;
    if (option.difficulty >= 88) score += 0.4;

    return Math.max(0.01, score);
  }

  class FinalSelector {
    constructor(repository, validator) {
      this.repository = repository;
      this.validator = validator;
    }

    selectFinalOptions({ rng, usageSnapshot, sessionContext, difficultyMode }) {
      const pool = this.repository
        .getFinalPool()
        .filter((option) => !ns.CATEGORY_TITLE_COMPUTE_RE.test(option.categoryTitle))
        .filter((option) => !sessionContext.usedFingerprints.has(option.fingerprint))
        .filter((option) => !sessionContext.usedAnswerKeys.has(option.answerKey));

      const categories = new Map();
      for (const option of pool) {
        if (!categories.has(option.categoryTitle)) categories.set(option.categoryTitle, []);
        categories.get(option.categoryTitle).push(option);
      }

      const categoryEntries = [...categories.entries()].map(([categoryTitle, options]) => ({
        categoryTitle,
        options
      }));

      const chosen = [];
      const usedCategories = new Set();
      const usedAnswers = new Set(sessionContext.usedAnswerKeys);
      const usedFingerprints = new Set(sessionContext.usedFingerprints);

      while (chosen.length < 5 && categoryEntries.length) {
        const availableCategories = categoryEntries.filter((entry) => !usedCategories.has(entry.categoryTitle));
        const categoryEntry = ns.weightedPick(rng, availableCategories, (entry) => {
          const bestOption = entry.options
            .filter((option) => !usedAnswers.has(option.answerKey))
            .filter((option) => !usedFingerprints.has(option.fingerprint))
            .sort((left, right) => finalFreshnessScore(right, usageSnapshot, sessionContext, difficultyMode) - finalFreshnessScore(left, usageSnapshot, sessionContext, difficultyMode))[0];
          return bestOption ? finalFreshnessScore(bestOption, usageSnapshot, sessionContext, difficultyMode) : 0;
        });
        if (!categoryEntry) break;

        const option = categoryEntry.options
          .filter((candidate) => !usedAnswers.has(candidate.answerKey))
          .filter((candidate) => !usedFingerprints.has(candidate.fingerprint))
          .sort((left, right) => finalFreshnessScore(right, usageSnapshot, sessionContext, difficultyMode) - finalFreshnessScore(left, usageSnapshot, sessionContext, difficultyMode))[0];
        if (!option) {
          usedCategories.add(categoryEntry.categoryTitle);
          continue;
        }

        chosen.push({
          ...option,
          cat: option.categoryTitle,
          q: option.clue,
          a: option.canonicalResponse
        });
        usedCategories.add(option.categoryTitle);
        usedAnswers.add(option.answerKey);
        usedFingerprints.add(option.fingerprint);
      }

      this.validator.validateFinalOptions(chosen);
      return chosen;
    }
  }

  ns.FinalSelector = FinalSelector;
})(window.Jeopardy = window.Jeopardy || {});
