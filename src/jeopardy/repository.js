(function bootstrapRepository(ns) {
  const MIN_SLOT_POOL_SIZE = ns.MIN_CLUES_PER_VALUE || 8;

  const FAMILY_HINTS = {
    stem: /(chemistry|physics|biology|earth science|astronomy|medicine|technology|computer science|famous scientists|inventors|engineering|ecology|anatomy|oceanography|agriculture|space exploration)/i,
    history_civics: /(history|government|law|economics|business|world leaders|canada|exploration)/i,
    geography: /(geography)/i,
    literature_language: /(literature|vocabulary|language|logic|journalism)/i,
    arts_music: /(art|music|classical music|architecture|theater)/i,
    sports: /(sports)/i,
    mythology_ancient: /(mythology|ancient civilizations)/i,
    film_television: /(film|television)/i
  };

  function familyFromPack(rawFamily, title, tags) {
    const normalized = String(rawFamily || "").trim().toLowerCase();
    if (ns.MACRO_FAMILIES.includes(normalized)) return normalized;
    const combined = `${title} ${(tags || []).join(" ")}`;
    for (const [family, pattern] of Object.entries(FAMILY_HINTS)) {
      if (pattern.test(combined)) return family;
    }
    return "general";
  }

  function sanitizeClueText(value) {
    const cleaned = ns.repairMojibake(value)
      .replace(/\s+/g, " ")
      .replace(ns.CLUE_PREFIX_BLACKLIST_RE, "")
      .replace(ns.CLUE_RESIDUAL_BLACKLIST_RE, "")
      .replace(/([0-9.]+)\?-\s*10\^?([0-9]+)/g, "$1 x 10^$2")
      .replace(/^[,;:.\-]+\s*/, "")
      .replace(/\s*\?+\s*$/, "")
      .trim();
    return cleaned.replace(/^[a-z]/, (match) => match.toUpperCase());
  }

  function sanitizeAnswerText(value) {
    const cleaned = ns.repairMojibake(value)
      .replace(/\s+/g, " ")
      .trim();
    return cleaned
      .replace(/^What is antibodies\?/i, "What are antibodies?")
      .replace(/^What is platelets\?/i, "What are platelets?")
      .replace(/^What is maria\?/i, "What are maria?");
  }

  function extractAcceptedResponses(answer) {
    const accepted = new Set();
    const raw = sanitizeAnswerText(answer);
    if (!raw) return [];
    accepted.add(raw);
    accepted.add(raw.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim());
    for (const match of raw.matchAll(/\(([^)]*)\)/g)) {
      const inner = match[1]
        .split(/\bor\b|,|;/i)
        .map((part) => part.replace(/^accept:?\s*/i, "").trim())
        .filter(Boolean);
      for (const part of inner) accepted.add(part);
    }
    return [...accepted].filter(Boolean);
  }

  function legacyDifficulty(rawClue, value, roundType) {
    const [min, max] = ns.getDifficultyBand(roundType, value);
    const authored = Number(rawClue?.difficulty);
    if (Number.isFinite(authored)) return authored;
    const level = Number(rawClue?.lvl);
    if (!Number.isFinite(level)) return min;
    const span = max - min;
    const ratio = Math.max(0, Math.min(1, (level - 1) / 4));
    return Math.round(min + (span * ratio));
  }

  function normalizeRegularClue(rawClue, context) {
    if (!rawClue) return null;
    const clue = sanitizeClueText(rawClue.q || rawClue.clue || "");
    const canonicalResponse = sanitizeAnswerText(rawClue.a || rawClue.answer || rawClue.canonicalResponse || "");
    const answerKey = ns.normalizeAnswer(canonicalResponse);
    const difficulty = legacyDifficulty(rawClue, context.value, context.roundType);
    if (!clue || !canonicalResponse || !answerKey) return null;
    if (ns.COMPUTE_CONTENT_RE.test(clue)) return null;
    return {
      id: String(rawClue.id || `${context.packId}|${context.value}|${ns.hashString(`${clue}|${canonicalResponse}`)}`),
      clue,
      canonicalResponse,
      acceptedResponses: extractAcceptedResponses(canonicalResponse),
      difficulty,
      answerKey,
      fingerprint: ns.fingerprintQA(clue, canonicalResponse),
      nearFingerprint: ns.nearDuplicateFingerprint(clue, canonicalResponse),
      tags: context.tags.slice(),
      value: context.value,
      roundType: context.roundType,
      family: context.family
    };
  }

  function normalizeFinalClue(rawFinal) {
    if (!rawFinal) return null;
    const categoryTitle = ns.normalizeDisplayTitle(rawFinal.cat || rawFinal.categoryTitle || rawFinal.category || "");
    const clue = sanitizeClueText(rawFinal.q || rawFinal.clue || "");
    const canonicalResponse = sanitizeAnswerText(rawFinal.a || rawFinal.answer || rawFinal.canonicalResponse || "");
    const answerKey = ns.normalizeAnswer(canonicalResponse);
    const difficulty = Number(rawFinal.difficulty);
    if (!categoryTitle || !clue || !canonicalResponse || !answerKey) return null;
    if (ns.COMPUTE_CONTENT_RE.test(clue)) return null;
    return {
      id: String(rawFinal.id || `final|${ns.slugify(categoryTitle)}|${ns.hashString(`${clue}|${canonicalResponse}`)}`),
      family: familyFromPack(rawFinal.family, categoryTitle, rawFinal.tags || []),
      categoryTitle,
      clue,
      canonicalResponse,
      acceptedResponses: extractAcceptedResponses(canonicalResponse),
      difficulty: Number.isFinite(difficulty) ? difficulty : ns.getDifficultyBand("final")[0],
      tags: [...new Set(rawFinal.tags || [])],
      fingerprint: ns.fingerprintQA(clue, canonicalResponse),
      nearFingerprint: ns.nearDuplicateFingerprint(clue, canonicalResponse),
      answerKey
    };
  }

  function normalizePack(rawPack, roundTypeFallback) {
    const roundType = String(rawPack.roundType || roundTypeFallback || "").trim();
    const displayTitle = ns.normalizeDisplayTitle(rawPack.displayTitle || rawPack.title || rawPack.t || "");
    const tags = [...new Set((rawPack.tags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))];
    const family = familyFromPack(rawPack.family, displayTitle, tags);
    const slots = rawPack.slots || rawPack.values || rawPack.b || {};
    const packId = String(rawPack.packId || `${roundType}|${ns.slugify(displayTitle)}|${ns.hashString(JSON.stringify(Object.keys(slots)))}`);

    return {
      packId,
      displayTitle,
      family,
      roundType,
      tags: [...new Set([...tags, family])],
      slots
    };
  }

  class LocalQuestionRepository {
    constructor() {
      this.categorySets = [];
      this.categorySetsById = new Map();
      this.categorySetsByRound = { r1: [], r2: [] };
      this.categorySetsByFamily = new Map();
      this.clueRecords = [];
      this.clueRecordsById = new Map();
      this.finalClues = [];
      this.finalCluesById = new Map();
      this.indexes = {
        byTag: new Map(),
        byTitle: new Map(),
        byDifficulty: new Map()
      };

      this.buildRegularBank();
      this.buildFinalBank();
      this.stats = this.buildStats();
    }

    buildRegularBank() {
      const rawByRound = { r1: ns.ROUND1_BANK, r2: ns.ROUND2_BANK };

      for (const [roundType, rawPacks] of Object.entries(rawByRound)) {
        for (const rawPack of rawPacks || []) {
          const pack = normalizePack(rawPack, roundType);
          if (!pack.displayTitle || !pack.packId) continue;
          if (ns.CATEGORY_TITLE_COMPUTE_RE.test(pack.displayTitle)) continue;

          const normalizedByValue = new Map();
          let invalidPack = false;

          for (const value of ns.ROUND_VALUES[roundType]) {
            const rawCandidates = Array.isArray(pack.slots?.[value]) ? pack.slots[value] : [];
            const slotCandidates = [];
            const seenAnswers = new Set();
            const seenFingerprints = new Set();
            const seenNearFingerprints = new Set();

            for (const rawClue of rawCandidates) {
              const candidate = normalizeRegularClue(rawClue, {
                packId: pack.packId,
                value,
                roundType,
                family: pack.family,
                tags: pack.tags
              });
              if (!candidate) continue;
              if (seenAnswers.has(candidate.answerKey)) continue;
              if (seenFingerprints.has(candidate.fingerprint)) continue;
              if (seenNearFingerprints.has(candidate.nearFingerprint)) continue;
              seenAnswers.add(candidate.answerKey);
              seenFingerprints.add(candidate.fingerprint);
              seenNearFingerprints.add(candidate.nearFingerprint);
              slotCandidates.push(candidate);
            }

            slotCandidates.sort((left, right) => {
              if (left.difficulty !== right.difficulty) return left.difficulty - right.difficulty;
              return left.id.localeCompare(right.id);
            });

            if (slotCandidates.length < MIN_SLOT_POOL_SIZE) {
              invalidPack = true;
              break;
            }

            normalizedByValue.set(value, slotCandidates);
          }

          if (invalidPack) continue;

          const setId = `category-set|${pack.packId}`;
          const valueSlots = [];
          const pendingClueRecords = [];
          const slotGroups = [];

          for (const value of ns.ROUND_VALUES[roundType]) {
            const candidates = normalizedByValue.get(value);
            if (!Array.isArray(candidates) || candidates.length < MIN_SLOT_POOL_SIZE) {
              invalidPack = true;
              break;
            }

            const candidateIds = [];
            for (const candidate of candidates) {
              const clueId = `clue|${candidate.id}`;
              const clueRecord = {
                id: clueId,
                categorySetId: setId,
                sourceCategoryId: pack.packId,
                sourceTitle: pack.displayTitle,
                family: pack.family,
                categoryTitle: pack.displayTitle,
                roundType,
                value,
                clue: candidate.clue,
                canonicalResponse: candidate.canonicalResponse,
                acceptedResponses: candidate.acceptedResponses,
                difficulty: candidate.difficulty,
                tags: candidate.tags.slice(),
                fingerprint: candidate.fingerprint,
                nearFingerprint: candidate.nearFingerprint,
                answerKey: candidate.answerKey
              };
              pendingClueRecords.push(clueRecord);
              candidateIds.push(clueRecord.id);
            }

            valueSlots.push({ value, candidateIds });
            slotGroups.push(candidates);
          }

          if (invalidPack) continue;
          if (!ns.findPlayableCluePath(slotGroups, {
            getDifficulty: (candidate) => candidate.difficulty,
            getAnswerKey: (candidate) => candidate.answerKey,
            getFingerprint: (candidate) => candidate.fingerprint,
            getId: (candidate) => candidate.id
          })) {
            continue;
          }

          for (const clueRecord of pendingClueRecords) {
            this.clueRecords.push(clueRecord);
            this.clueRecordsById.set(clueRecord.id, clueRecord);
          }

          const categorySet = {
            id: setId,
            packId: pack.packId,
            sourceCategoryId: pack.packId,
            sourceTitle: pack.displayTitle,
            family: pack.family,
            title: pack.displayTitle,
            displayTitle: pack.displayTitle,
            roundSupport: [roundType],
            roundType,
            tags: pack.tags.slice(),
            computeWeight: 0,
            valueSlots
          };

          this.categorySets.push(categorySet);
          this.categorySetsById.set(setId, categorySet);
          this.categorySetsByRound[roundType].push(categorySet);
          if (!this.categorySetsByFamily.has(pack.family)) this.categorySetsByFamily.set(pack.family, []);
          this.categorySetsByFamily.get(pack.family).push(categorySet);

          if (!this.indexes.byTitle.has(pack.displayTitle)) this.indexes.byTitle.set(pack.displayTitle, []);
          this.indexes.byTitle.get(pack.displayTitle).push(categorySet);

          for (const tag of pack.tags) {
            if (!this.indexes.byTag.has(tag)) this.indexes.byTag.set(tag, []);
            this.indexes.byTag.get(tag).push(pack.displayTitle);
          }
        }
      }

      for (const clueRecord of this.clueRecords) {
        if (!this.indexes.byDifficulty.has(clueRecord.difficulty)) {
          this.indexes.byDifficulty.set(clueRecord.difficulty, []);
        }
        this.indexes.byDifficulty.get(clueRecord.difficulty).push(clueRecord);
      }
    }

    buildFinalBank() {
      const seenIds = new Set();
      const seenFingerprints = new Set();
      const seenNearFingerprints = new Set();

      for (const rawFinal of ns.FINAL_BANK || []) {
        const finalClue = normalizeFinalClue(rawFinal);
        if (!finalClue) continue;
        if (ns.CATEGORY_TITLE_COMPUTE_RE.test(finalClue.categoryTitle)) continue;
        if (ns.COMPUTE_CONTENT_RE.test(finalClue.clue)) continue;
        if (
          seenIds.has(finalClue.id) ||
          seenFingerprints.has(finalClue.fingerprint) ||
          seenNearFingerprints.has(finalClue.nearFingerprint)
        ) continue;
        seenIds.add(finalClue.id);
        seenFingerprints.add(finalClue.fingerprint);
        seenNearFingerprints.add(finalClue.nearFingerprint);
        this.finalClues.push(finalClue);
        this.finalCluesById.set(finalClue.id, finalClue);
      }
    }

    buildStats() {
      const round1Clues = this.clueRecords.filter((clue) => clue.roundType === "r1").length;
      const round2Clues = this.clueRecords.filter((clue) => clue.roundType === "r2").length;
      const round1Categories = this.categorySets.filter((set) => set.roundSupport.includes("r1")).length;
      const round2Categories = this.categorySets.filter((set) => set.roundSupport.includes("r2")).length;
      return {
        totalCategorySets: this.categorySets.length,
        uniqueCategoryTitles: new Set(this.categorySets.map((set) => set.displayTitle)).size,
        totalRegularClues: this.clueRecords.length,
        round1Clues,
        round2Clues,
        round1Categories,
        round2Categories,
        totalFinalClues: this.finalClues.length,
        uniqueFinalCategories: new Set(this.finalClues.map((finalClue) => finalClue.categoryTitle)).size
      };
    }

    getCategorySetsForRound(roundType) {
      return this.categorySetsByRound[roundType] || [];
    }

    getFinalPool() {
      return this.finalClues.slice();
    }

    getClueRecord(id) {
      return this.clueRecordsById.get(id) || null;
    }
  }

  ns.LocalQuestionRepository = LocalQuestionRepository;
})(window.Jeopardy = window.Jeopardy || {});
