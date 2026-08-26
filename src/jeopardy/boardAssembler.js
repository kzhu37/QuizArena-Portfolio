(function bootstrapBoardAssembler(ns) {
  function emptyFamilyCounts() {
    return {
      stem: 0,
      history_civics: 0,
      geography: 0,
      literature_language: 0,
      arts_music: 0,
      sports: 0,
      mythology_ancient: 0,
      film_television: 0,
      general: 0
    };
  }

  function addFamilyCount(counts, family) {
    const key = Object.prototype.hasOwnProperty.call(counts, family) ? family : "general";
    counts[key] += 1;
  }

  function createSessionPlan() {
    return {
      familyCap: ns.MAX_CATEGORYS_PER_FAMILY_ON_BOARD
    };
  }

  function createSessionContext() {
    return {
      usedClueIds: new Set(),
      usedAnswerKeys: new Set(),
      usedFingerprints: new Set(),
      usedSourceCategoryIds: new Set(),
      usedCategoryTitles: new Set(),
      usedBoardHashes: new Set(),
      usedBoardTitleHashes: new Set(),
      usedBoardFamilyPatterns: new Set(),
      familyCounts: emptyFamilyCounts(),
      familyHistory: [],
      titleHistory: [],
      previousRoundFamilies: new Set()
    };
  }

  function scoreClueCandidate(candidate, usageSnapshot, sessionContext, difficultyMode) {
    let score = 100;
    if (!usageSnapshot.clueIds.has(candidate.id)) score += 40;
    if (!sessionContext.usedClueIds.has(candidate.id)) score += 20;
    if (!usageSnapshot.answerKeys.has(candidate.answerKey)) score += 18;
    if (!sessionContext.usedAnswerKeys.has(candidate.answerKey)) score += 16;
    if (!sessionContext.usedFingerprints.has(candidate.fingerprint)) score += 12;

    const target = ns.pickDifficultyTarget(candidate.roundType, candidate.value, difficultyMode);
    score -= Math.abs(candidate.difficulty - target) * 3;

    if (difficultyMode === "tv" && candidate.difficulty >= target) score += 6;

    return score;
  }

  function findCategoryCluePath(categorySet, repository, usageSnapshot, sessionContext, takenState, difficultyMode) {
    const slots = categorySet.valueSlots || [];
    const path = [];

    function walk(slotIndex, lastDifficulty) {
      if (slotIndex >= slots.length) return path.slice();
      const slot = slots[slotIndex];
      const candidates = slot.candidateIds
        .map((id) => repository.getClueRecord(id))
        .filter(Boolean)
        .filter((record) => !takenState.usedClueIds.has(record.id))
        .filter((record) => !takenState.usedAnswerKeys.has(record.answerKey))
        .filter((record) => !takenState.usedFingerprints.has(record.fingerprint))
        .filter((record) => record.difficulty > lastDifficulty);

      const orderedCandidates = candidates
        .slice()
        .sort((left, right) => {
          const scopedSession = {
            ...sessionContext,
            usedAnswerKeys: takenState.usedAnswerKeys,
            usedFingerprints: takenState.usedFingerprints,
            usedClueIds: takenState.usedClueIds
          };
          const leftScore = scoreClueCandidate(left, usageSnapshot, scopedSession, difficultyMode);
          const rightScore = scoreClueCandidate(right, usageSnapshot, scopedSession, difficultyMode);
          if (rightScore !== leftScore) return rightScore - leftScore;
          if (left.difficulty !== right.difficulty) return left.difficulty - right.difficulty;
          return left.id.localeCompare(right.id);
        });

      for (const candidate of orderedCandidates) {
        path.push(candidate);
        takenState.usedClueIds.add(candidate.id);
        takenState.usedAnswerKeys.add(candidate.answerKey);
        takenState.usedFingerprints.add(candidate.fingerprint);

        const result = walk(slotIndex + 1, candidate.difficulty);
        if (result) return result;

        path.pop();
        takenState.usedClueIds.delete(candidate.id);
        takenState.usedAnswerKeys.delete(candidate.answerKey);
        takenState.usedFingerprints.delete(candidate.fingerprint);
      }

      return null;
    }

    return walk(0, -Infinity);
  }

  function categoryFreshnessScore(categorySet, usageSnapshot, sessionContext, roundFamilyCounts) {
    const family = categorySet.family || "general";
    if ((roundFamilyCounts[family] || 0) >= ns.MAX_CATEGORYS_PER_FAMILY_ON_BOARD) return 0;

    let score = ns.FAMILY_WEIGHTS[family] || ns.FAMILY_WEIGHTS.general;
    if (!usageSnapshot.categoryIds.has(categorySet.id)) score += 1.25;
    if (!sessionContext.usedSourceCategoryIds.has(categorySet.sourceCategoryId)) score += 0.8;
    if (!usageSnapshot.categoryTitles.has(categorySet.title)) score += 0.55;
    if (!sessionContext.usedCategoryTitles.has(categorySet.title)) score += 0.7;

    score -= ns.recencyPenalty(usageSnapshot.titleHistory, categorySet.title, [1.9, 1.5, 1.2, 1.0, 0.8, 0.6, 0.4]);
    score -= ns.recencyPenalty(sessionContext.titleHistory, categorySet.title, [2.6, 2.1, 1.6, 1.1, 0.7, 0.4]);
    score -= ns.recencyPenalty(usageSnapshot.familyHistory, family, [1.1, 0.95, 0.8, 0.6, 0.5, 0.35, 0.2]);
    score -= ns.recencyPenalty(sessionContext.familyHistory, family, [1.4, 1.2, 0.95, 0.75, 0.55, 0.35]);

    if (sessionContext.previousRoundFamilies.has(family)) score -= 0.45;
    if ((roundFamilyCounts[family] || 0) === 1) score -= 0.95;

    return Math.max(0.01, score);
  }

  class BoardAssembler {
    constructor(repository, validator) {
      this.repository = repository;
      this.validator = validator;
    }

    assembleRound(options) {
      const { roundType, rng, usageSnapshot, sessionContext, difficultyMode } = options;
      for (let attempt = 0; attempt < ns.MAX_ROUND_ASSEMBLY_ATTEMPTS; attempt += 1) {
        const board = this.tryAssembleRound({
          roundType,
          rng,
          usageSnapshot,
          sessionContext,
          difficultyMode
        });
        if (!board) continue;
        this.validator.validateBoard(board);
        return board;
      }
      throw new Error(`Unable to assemble a valid ${ns.ROUND_LABELS[roundType]} board from the local bank.`);
    }

    assembleCustomRound(options) {
      const { roundType, categorySetIds, rng, usageSnapshot, sessionContext, difficultyMode } = options;
      const ids = Array.isArray(categorySetIds) ? categorySetIds : [];
      if (ids.length !== 6) throw new Error("Custom category selection must include exactly six categories.");

      const chosenSets = ids.map((id) => this.repository.categorySetsById.get(id));
      if (chosenSets.some((set) => !set || set.roundType !== roundType)) {
        throw new Error("Custom category selection includes a category unavailable for this round.");
      }

      const chosenSourceIds = new Set();
      const chosenTitles = new Set();
      const roundFamilyCounts = emptyFamilyCounts();
      for (const categorySet of chosenSets) {
        if (chosenSourceIds.has(categorySet.sourceCategoryId) || chosenTitles.has(categorySet.title)) {
          throw new Error("Custom category selection cannot repeat a category.");
        }
        if (sessionContext.usedSourceCategoryIds.has(categorySet.sourceCategoryId) || sessionContext.usedCategoryTitles.has(categorySet.title)) {
          throw new Error(`Custom category "${categorySet.title}" was already used in this game.`);
        }
        addFamilyCount(roundFamilyCounts, categorySet.family);
        if ((roundFamilyCounts[categorySet.family] || 0) > ns.MAX_CATEGORYS_PER_FAMILY_ON_BOARD) {
          throw new Error(`Custom selection has too many categories from ${categorySet.family}.`);
        }
        chosenSourceIds.add(categorySet.sourceCategoryId);
        chosenTitles.add(categorySet.title);
      }

      const boardCategories = [];
      const tempAnswers = new Set(sessionContext.usedAnswerKeys);
      const tempFingerprints = new Set(sessionContext.usedFingerprints);
      const tempClueIds = new Set(sessionContext.usedClueIds);

      for (const categorySet of chosenSets) {
        const takenState = {
          usedClueIds: new Set(tempClueIds),
          usedAnswerKeys: new Set(tempAnswers),
          usedFingerprints: new Set(tempFingerprints)
        };
        const chosenPath = findCategoryCluePath(
          categorySet,
          this.repository,
          usageSnapshot,
          sessionContext,
          takenState,
          difficultyMode
        );
        if (!chosenPath) throw new Error(`Custom category "${categorySet.title}" does not have enough valid fresh clues.`);

        const clues = chosenPath.map((clue) => ({
          id: clue.id,
          value: clue.value,
          clue: clue.clue,
          canonicalResponse: clue.canonicalResponse,
          acceptedResponses: clue.acceptedResponses,
          difficulty: clue.difficulty,
          answerKey: clue.answerKey,
          fingerprint: clue.fingerprint,
          used: false,
          dd: false
        }));

        for (const clue of chosenPath) {
          tempClueIds.add(clue.id);
          tempAnswers.add(clue.answerKey);
          tempFingerprints.add(clue.fingerprint);
        }

        boardCategories.push({
          setId: categorySet.id,
          sourceCategoryId: categorySet.sourceCategoryId,
          family: categorySet.family,
          title: categorySet.title,
          tags: categorySet.tags.slice(),
          clues
        });
      }

      const boardHash = ns.hashString(
        boardCategories
          .map((category) => `${category.setId}|${category.clues.map((clue) => clue.id).join("|")}`)
          .join("::")
      );
      const boardTitleHash = ns.hashString(boardCategories.map((category) => category.title).sort().join("|"));
      const boardFamilyPattern = ns.hashString(boardCategories.map((category) => category.family || "general").sort().join("|"));
      const board = { roundType, boardHash, boardTitleHash, boardFamilyPattern, categories: boardCategories };
      this.validator.validateBoard(board);
      return board;
    }

    tryAssembleRound({ roundType, rng, usageSnapshot, sessionContext, difficultyMode }) {
      const available = this.repository
        .getCategorySetsForRound(roundType)
        .filter((set) => !sessionContext.usedSourceCategoryIds.has(set.sourceCategoryId))
        .filter((set) => !sessionContext.usedCategoryTitles.has(set.title));

      const chosen = [];
      const chosenIds = new Set();
      const chosenSourceIds = new Set();
      const chosenTitles = new Set();
      const boardCategories = [];
      const roundFamilyCounts = emptyFamilyCounts();
      const tempAnswers = new Set(sessionContext.usedAnswerKeys);
      const tempFingerprints = new Set(sessionContext.usedFingerprints);
      const tempClueIds = new Set(sessionContext.usedClueIds);

      const rankPool = () => ns.shuffleWith(
        rng,
        available
          .filter((set) => !chosenIds.has(set.id))
          .filter((set) => !chosenSourceIds.has(set.sourceCategoryId))
          .filter((set) => !chosenTitles.has(set.title))
      )
        .map((categorySet) => ({
          categorySet,
          score: categoryFreshnessScore(categorySet, usageSnapshot, sessionContext, roundFamilyCounts)
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return left.categorySet.id.localeCompare(right.categorySet.id);
        })
        .map((entry) => entry.categorySet);

      const commitCategorySet = (categorySet) => {
        const takenState = {
          usedClueIds: new Set(tempClueIds),
          usedAnswerKeys: new Set(tempAnswers),
          usedFingerprints: new Set(tempFingerprints)
        };
        const chosenPath = findCategoryCluePath(
          categorySet,
          this.repository,
          usageSnapshot,
          sessionContext,
          takenState,
          difficultyMode
        );
        if (!chosenPath) return null;

        const clues = chosenPath.map((clue) => ({
          id: clue.id,
          value: clue.value,
          clue: clue.clue,
          canonicalResponse: clue.canonicalResponse,
          acceptedResponses: clue.acceptedResponses,
          difficulty: clue.difficulty,
          answerKey: clue.answerKey,
          fingerprint: clue.fingerprint,
          used: false,
          dd: false
        }));

        for (const clue of chosenPath) {
          tempClueIds.add(clue.id);
          tempAnswers.add(clue.answerKey);
          tempFingerprints.add(clue.fingerprint);
        }

        boardCategories.push({
          setId: categorySet.id,
          sourceCategoryId: categorySet.sourceCategoryId,
          family: categorySet.family,
          title: categorySet.title,
          tags: categorySet.tags.slice(),
          clues
        });

        chosen.push(categorySet);
        chosenIds.add(categorySet.id);
        chosenSourceIds.add(categorySet.sourceCategoryId);
        chosenTitles.add(categorySet.title);
        addFamilyCount(roundFamilyCounts, categorySet.family);

        return {
          categorySet,
          chosenPath
        };
      };

      const rollbackCategorySet = (committed) => {
        if (!committed) return;
        boardCategories.pop();
        chosen.pop();
        chosenIds.delete(committed.categorySet.id);
        chosenSourceIds.delete(committed.categorySet.sourceCategoryId);
        chosenTitles.delete(committed.categorySet.title);
        roundFamilyCounts[committed.categorySet.family] -= 1;
        for (const clue of committed.chosenPath) {
          tempClueIds.delete(clue.id);
          tempAnswers.delete(clue.answerKey);
          tempFingerprints.delete(clue.fingerprint);
        }
      };

      const search = () => {
        if (boardCategories.length === 6) return true;
        const rankedPool = rankPool();
        const candidatePool = ns.shuffleWith(rng, rankedPool.slice(0, ns.MAX_CATEGORY_SEARCH_WIDTH));

        for (const categorySet of candidatePool) {
          const committed = commitCategorySet(categorySet);
          if (!committed) continue;
          if (search()) return true;
          rollbackCategorySet(committed);
        }

        return false;
      };

      if (!search()) return null;

      const boardHash = ns.hashString(
        boardCategories
          .map((category) => `${category.setId}|${category.clues.map((clue) => clue.id).join("|")}`)
          .join("::")
      );
      const boardTitleHash = ns.hashString(boardCategories.map((category) => category.title).sort().join("|"));
      const boardFamilyPattern = ns.hashString(boardCategories.map((category) => category.family || "general").sort().join("|"));
      if (
        sessionContext.usedBoardHashes.has(boardHash) ||
        usageSnapshot.boardHashes.has(boardHash) ||
        sessionContext.usedBoardTitleHashes.has(boardTitleHash) ||
        usageSnapshot.boardTitleHashes.has(boardTitleHash) ||
        sessionContext.usedBoardFamilyPatterns.has(boardFamilyPattern) ||
        usageSnapshot.boardFamilyPatterns.has(boardFamilyPattern)
      ) {
        return null;
      }

      return {
        roundType,
        boardHash,
        boardTitleHash,
        boardFamilyPattern,
        categories: boardCategories
      };
    }
  }

  function absorbBoardIntoSession(sessionContext, board) {
    sessionContext.usedBoardHashes.add(board.boardHash);
    if (board.boardTitleHash) sessionContext.usedBoardTitleHashes.add(board.boardTitleHash);
    if (board.boardFamilyPattern) sessionContext.usedBoardFamilyPatterns.add(board.boardFamilyPattern);
    const roundFamilies = new Set();
    for (const category of board.categories) {
      sessionContext.usedSourceCategoryIds.add(category.sourceCategoryId);
      sessionContext.usedCategoryTitles.add(category.title);
      sessionContext.titleHistory.push(category.title);
      sessionContext.familyHistory.push(category.family);
      roundFamilies.add(category.family);
      addFamilyCount(sessionContext.familyCounts, category.family);
      for (const clue of category.clues) {
        sessionContext.usedClueIds.add(clue.id);
        sessionContext.usedAnswerKeys.add(clue.answerKey);
        sessionContext.usedFingerprints.add(clue.fingerprint);
      }
    }
    sessionContext.previousRoundFamilies = roundFamilies;
  }

  ns.BoardAssembler = BoardAssembler;
  ns.createSessionPlan = createSessionPlan;
  ns.createSessionContext = createSessionContext;
  ns.absorbBoardIntoSession = absorbBoardIntoSession;
})(window.Jeopardy = window.Jeopardy || {});
