(function bootstrapQuestionValidator(ns) {
  function fail(message) {
    throw new Error(message);
  }

  function isCleanSentence(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    if (ns.TEXT_JUNK_RE.test(text)) return false;
    if (!/^[A-Z0-9"'(]/.test(text)) return false;
    const hasDomainName = /(?:[a-z0-9-]+\.)+[a-z]{2,}/i.test(text);
    if (/[a-z][.!?][a-z]/.test(text) && !hasDomainName) return false;
    if (ns.CLUE_PREFIX_BLACKLIST_RE.test(text)) return false;
    if (ns.CLUE_RESIDUAL_BLACKLIST_RE.test(text)) return false;
    return true;
  }

  class QuestionValidator {
    validateRepository(repository) {
      const clueIds = new Set();
      const finalIds = new Set();
      const categoryIds = new Set();
      const finalCategories = new Set();
      const normalizedAnswers = new Map();
      const normalizedClues = new Map();

      for (const categorySet of repository.categorySets) {
        if (categoryIds.has(categorySet.id)) {
          fail(`Duplicate category set id: ${categorySet.id}`);
        }
        categoryIds.add(categorySet.id);

        if (ns.CATEGORY_TITLE_BLACKLIST_RE.test(categorySet.title)) {
          fail(`Blacklisted category title pattern detected: ${categorySet.title}`);
        }
        if (ns.CATEGORY_TITLE_LAZY_NUMBER_RE.test(categorySet.title)) {
          fail(`Lazy numbered Jeopardy category detected: ${categorySet.title}`);
        }
        if (ns.CATEGORY_TITLE_BANNED_RE.test(categorySet.title)) {
          fail(`Banned Jeopardy category pattern detected: ${categorySet.title}`);
        }
        if (ns.CATEGORY_TITLE_COMPUTE_RE.test(categorySet.title)) {
          fail(`Mental-math category leaked into the repository: ${categorySet.title}`);
        }

        if (!Array.isArray(categorySet.valueSlots) || categorySet.valueSlots.length !== 5) {
          fail(`Category set ${categorySet.id} must expose exactly five value slots.`);
        }

        const expectedValues = ns.ROUND_VALUES[categorySet.roundSupport[0]];
        const actualValues = categorySet.valueSlots.map((slot) => slot.value);
        if (JSON.stringify(expectedValues) !== JSON.stringify(actualValues)) {
          fail(`Category set ${categorySet.id} uses invalid value slots.`);
        }

        const slotGroups = [];

        for (const slot of categorySet.valueSlots) {
          if (!Array.isArray(slot.candidateIds) || slot.candidateIds.length < ns.MIN_CLUES_PER_VALUE) {
            fail(`Category set ${categorySet.id} must provide at least ${ns.MIN_CLUES_PER_VALUE} candidates at $${slot.value}.`);
          }

          const candidates = slot.candidateIds.map((id) => repository.clueRecordsById.get(id)).filter(Boolean);
          if (candidates.length !== slot.candidateIds.length) {
            fail(`Category set ${categorySet.id} references a missing clue record.`);
          }

          for (const clue of candidates) {
            if (clueIds.has(clue.id)) {
              fail(`Duplicate clue id: ${clue.id}`);
            }
            clueIds.add(clue.id);

            if (!isCleanSentence(clue.clue)) fail(`Malformed clue text in ${clue.id}.`);
            if (!isCleanSentence(clue.canonicalResponse)) fail(`Malformed answer text in ${clue.id}.`);
            if (ns.CLUE_PREFIX_BLACKLIST_RE.test(clue.clue) || ns.CLUE_RESIDUAL_BLACKLIST_RE.test(clue.clue)) {
              fail(`Templated clue wording leaked into ${clue.id}.`);
            }
            if (ns.CLUE_BANNED_TEMPLATE_RE.test(clue.clue) || ns.CLUE_BANNED_TEMPLATE_RE.test(clue.canonicalResponse)) {
              fail(`Banned code/abbreviation clue pattern leaked into ${clue.id}.`);
            }
            if (ns.CLUE_LOW_INFORMATION_RE.test(clue.clue)) {
              fail(`Low-information generated wording leaked into ${clue.id}.`);
            }
            if (ns.UNRESOLVED_IDENTIFIER_RE.test(clue.clue) || ns.UNRESOLVED_IDENTIFIER_RE.test(clue.canonicalResponse)) {
              fail(`Unresolved database identifier leaked into ${clue.id}.`);
            }
            if (!ns.JEOPARDY_RESPONSE_RE.test(clue.canonicalResponse)) {
              fail(`Response lacks Jeopardy phrasing in ${clue.id}.`);
            }
            if (ns.answerAppearsInClue(clue.clue, clue.canonicalResponse)) {
              fail(`Giveaway clue contains its own answer in ${clue.id}.`);
            }
            if (ns.TEXT_JUNK_RE.test(clue.clue) || ns.TEXT_JUNK_RE.test(clue.canonicalResponse)) {
              fail(`Broken text leaked into ${clue.id}.`);
            }
            if (ns.COMPUTE_CONTENT_RE.test(clue.clue)) {
              fail(`Compute-heavy clue leaked into ${clue.id}.`);
            }
            if (!ns.isDifficultyInBand(clue.roundType, clue.value, clue.difficulty)) {
              fail(`Clue ${clue.id} has difficulty ${clue.difficulty} outside the allowed band for $${clue.value}.`);
            }

            if (normalizedAnswers.has(clue.answerKey)) {
              fail(`Duplicate normalized answer "${clue.canonicalResponse}" also seen in ${normalizedAnswers.get(clue.answerKey)}.`);
            }
            normalizedAnswers.set(clue.answerKey, clue.id);

            const clueKey = ns.normalizeForGiveawayCheck(clue.clue);
            if (normalizedClues.has(clueKey)) {
              fail(`Duplicate normalized clue text in ${clue.id}; also seen in ${normalizedClues.get(clueKey)}.`);
            }
            normalizedClues.set(clueKey, clue.id);
          }

          slotGroups.push(candidates);
        }

        if (!ns.findPlayableCluePath(slotGroups, {
          getDifficulty: (clue) => clue.difficulty,
          getAnswerKey: (clue) => clue.answerKey,
          getFingerprint: (clue) => clue.fingerprint,
          getId: (clue) => clue.id
        })) {
          fail(`Category set ${categorySet.id} has no strictly ascending unique playable clue path.`);
        }
      }

      const finalCategoryCounts = new Map();
      for (const finalClue of repository.finalClues) {
        if (finalIds.has(finalClue.id)) {
          fail(`Duplicate final clue id: ${finalClue.id}`);
        }
        finalIds.add(finalClue.id);
        finalCategories.add(finalClue.categoryTitle);
        finalCategoryCounts.set(finalClue.categoryTitle, (finalCategoryCounts.get(finalClue.categoryTitle) || 0) + 1);
        if (ns.CATEGORY_TITLE_COMPUTE_RE.test(finalClue.categoryTitle) || ns.COMPUTE_CONTENT_RE.test(finalClue.clue)) {
          fail(`Mental-math content leaked into Final Jeopardy: ${finalClue.id}`);
        }
        if (ns.CATEGORY_TITLE_LAZY_NUMBER_RE.test(finalClue.categoryTitle) || ns.CATEGORY_TITLE_BANNED_RE.test(finalClue.categoryTitle)) {
          fail(`Banned Final Jeopardy category pattern detected: ${finalClue.categoryTitle}`);
        }
        if (!isCleanSentence(finalClue.clue) || !isCleanSentence(finalClue.canonicalResponse)) {
          fail(`Malformed Final Jeopardy entry: ${finalClue.id}`);
        }
        if (ns.CLUE_BANNED_TEMPLATE_RE.test(finalClue.clue) || ns.CLUE_BANNED_TEMPLATE_RE.test(finalClue.canonicalResponse)) {
          fail(`Banned code/abbreviation Final clue pattern leaked into ${finalClue.id}.`);
        }
        if (ns.CLUE_LOW_INFORMATION_RE.test(finalClue.clue)) {
          fail(`Low-information generated wording leaked into ${finalClue.id}.`);
        }
        if (ns.UNRESOLVED_IDENTIFIER_RE.test(finalClue.clue) || ns.UNRESOLVED_IDENTIFIER_RE.test(finalClue.canonicalResponse)) {
          fail(`Unresolved database identifier leaked into ${finalClue.id}.`);
        }
        if (!ns.JEOPARDY_RESPONSE_RE.test(finalClue.canonicalResponse)) {
          fail(`Final response lacks Jeopardy phrasing in ${finalClue.id}.`);
        }
        if (ns.answerAppearsInClue(finalClue.clue, finalClue.canonicalResponse)) {
          fail(`Giveaway Final clue contains its own answer in ${finalClue.id}.`);
        }
        if (!ns.isDifficultyInBand("final", null, finalClue.difficulty)) {
          fail(`Final clue ${finalClue.id} has invalid difficulty ${finalClue.difficulty}.`);
        }

        if (normalizedAnswers.has(finalClue.answerKey)) {
          fail(`Duplicate normalized Final answer "${finalClue.canonicalResponse}" also seen in ${normalizedAnswers.get(finalClue.answerKey)}.`);
        }
        normalizedAnswers.set(finalClue.answerKey, finalClue.id);

        const finalClueKey = ns.normalizeForGiveawayCheck(finalClue.clue);
        if (normalizedClues.has(finalClueKey)) {
          fail(`Duplicate normalized Final clue text in ${finalClue.id}; also seen in ${normalizedClues.get(finalClueKey)}.`);
        }
        normalizedClues.set(finalClueKey, finalClue.id);
      }

      if (repository.stats.totalCategorySets < ns.MIN_REGULAR_CATEGORIES) {
        fail(`Expected at least ${ns.MIN_REGULAR_CATEGORIES} approved category sets after repository shaping; found ${repository.stats.totalCategorySets}.`);
      }
      if (repository.stats.uniqueCategoryTitles < ns.MIN_REGULAR_CATEGORIES) {
        fail(`Expected at least ${ns.MIN_REGULAR_CATEGORIES} clean display titles; found ${repository.stats.uniqueCategoryTitles}.`);
      }
      if (repository.stats.round1Categories < ns.MIN_ROUND_CATEGORIES || repository.stats.round2Categories < ns.MIN_ROUND_CATEGORIES) {
        fail(`Each regular round needs at least ${ns.MIN_ROUND_CATEGORIES} category sets.`);
      }
      if (repository.stats.totalRegularClues < ns.MIN_REGULAR_BANK_CLUES) {
        fail(`Expected at least ${ns.MIN_REGULAR_BANK_CLUES} approved regular clues; found ${repository.stats.totalRegularClues}.`);
      }
      if (repository.stats.round1Clues < ns.MIN_ROUND1_BANK_CLUES) {
        fail(`Round One needs at least ${ns.MIN_ROUND1_BANK_CLUES} clues; found ${repository.stats.round1Clues}.`);
      }
      if (repository.stats.round2Clues < ns.MIN_ROUND2_BANK_CLUES) {
        fail(`Double Jeopardy needs at least ${ns.MIN_ROUND2_BANK_CLUES} clues; found ${repository.stats.round2Clues}.`);
      }
      if (repository.stats.totalFinalClues < 200) {
        fail(`Expected at least 200 final clues; found ${repository.stats.totalFinalClues}.`);
      }
      if (repository.stats.uniqueFinalCategories < 20) {
        fail(`Expected at least 20 final categories; found ${repository.stats.uniqueFinalCategories}.`);
      }
      for (const [category, count] of finalCategoryCounts) {
        if (count < 6) fail(`Final category "${category}" is too thin with only ${count} clues.`);
      }
    }

    validateBoard(board) {
      if (!board || !Array.isArray(board.categories) || board.categories.length !== 6) {
        fail("Every board must contain exactly six categories.");
      }

      const titles = new Set();
      const clueIds = new Set();
      const answers = new Set();
      const fingerprints = new Set();
      const familyCounts = new Map();

      for (const category of board.categories) {
        if (titles.has(category.title)) {
          fail(`Board reuses category title "${category.title}".`);
        }
        titles.add(category.title);
        familyCounts.set(category.family, (familyCounts.get(category.family) || 0) + 1);
        if ((familyCounts.get(category.family) || 0) > ns.MAX_CATEGORYS_PER_FAMILY_ON_BOARD) {
          fail(`Board overuses macro family "${category.family}".`);
        }
        if (!Array.isArray(category.clues) || category.clues.length !== 5) {
          fail(`Category "${category.title}" must render five clues.`);
        }

        let lastDifficulty = -Infinity;
        for (const clue of category.clues) {
          if (clueIds.has(clue.id)) fail(`Board reuses clue id ${clue.id}.`);
          clueIds.add(clue.id);
          if (answers.has(clue.answerKey)) fail(`Board reuses canonical answer "${clue.canonicalResponse}".`);
          answers.add(clue.answerKey);
          if (fingerprints.has(clue.fingerprint)) fail(`Board reuses clue fingerprint ${clue.fingerprint}.`);
          fingerprints.add(clue.fingerprint);
          if (!ns.isDifficultyInBand(board.roundType, clue.value, clue.difficulty)) {
            fail(`Board placed clue ${clue.id} into the wrong dollar slot.`);
          }
          if (clue.difficulty <= lastDifficulty) {
            fail(`Category "${category.title}" is not strictly ascending in difficulty.`);
          }
          lastDifficulty = clue.difficulty;
        }
      }
    }

    validateFinalOptions(options) {
      if (!Array.isArray(options) || options.length !== 5) {
        fail("Final Jeopardy must present exactly five options.");
      }
      const categories = new Set();
      const answers = new Set();
      const fingerprints = new Set();
      for (const option of options) {
        if (ns.CATEGORY_TITLE_COMPUTE_RE.test(option.categoryTitle)) {
          fail(`Compute-heavy Final Jeopardy option detected: ${option.categoryTitle}`);
        }
        if (ns.CATEGORY_TITLE_LAZY_NUMBER_RE.test(option.categoryTitle) || ns.CATEGORY_TITLE_BANNED_RE.test(option.categoryTitle)) {
          fail(`Banned Final Jeopardy option detected: ${option.categoryTitle}`);
        }
        if (ns.answerAppearsInClue(option.clue, option.canonicalResponse)) {
          fail(`Giveaway Final Jeopardy option contains its own answer: ${option.id}`);
        }
        if (categories.has(option.categoryTitle)) {
          fail(`Duplicate Final Jeopardy category: ${option.categoryTitle}`);
        }
        if (answers.has(option.answerKey)) {
          fail(`Duplicate Final Jeopardy answer: ${option.canonicalResponse}`);
        }
        if (fingerprints.has(option.fingerprint)) {
          fail(`Duplicate Final Jeopardy fingerprint: ${option.id}`);
        }
        if (!ns.isDifficultyInBand("final", null, option.difficulty)) {
          fail(`Final option ${option.id} has invalid difficulty ${option.difficulty}.`);
        }
        categories.add(option.categoryTitle);
        answers.add(option.answerKey);
        fingerprints.add(option.fingerprint);
      }
    }
  }

  ns.QuestionValidator = QuestionValidator;
})(window.Jeopardy = window.Jeopardy || {});
