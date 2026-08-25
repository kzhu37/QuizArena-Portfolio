(function bootstrapUtils(ns) {
  ns.repairMojibake = function repairMojibake(value) {
    let text = String(value || "");

    if (/[ÃÂâ]/.test(text)) {
      try {
        const repaired = decodeURIComponent(escape(text));
        if (repaired && repaired !== text) {
          text = repaired;
        }
      } catch (error) {
        // Keep the original text and continue through the explicit repair map below.
      }
    }

    return text
      .replace(/\u00e2\u20ac\u201d/g, "-")
      .replace(/\u00e2\u20ac\u201c/g, "-")
      .replace(/\u00e2\u20ac\u2018/g, "-")
      .replace(/\u00e2\u20ac\u02dc/g, "'")
      .replace(/\u00e2\u20ac\u2122/g, "'")
      .replace(/\u00e2\u20ac\u0153/g, '"')
      .replace(/\u00e2\u20ac\u009d/g, '"')
      .replace(/\u00e2\u201a\u00ac\u00c5\u201c|\u00e2\u201a\u00ac\u00c2\u009d/g, '"')
      .replace(/\u00e2\u201a\u00ac\u00c5\u2019|\u00e2\u201a\u00ac\u00c2\u0099/g, "'")
      .replace(/\u00e2\u201a\u00ac\u00c2\u009d/g, '"')
      .replace(/\u00e2\u20ac\u00a6/g, "...")
      .replace(/\u00e2\u20ac\u00a2/g, "-")
      .replace(/\u00c2\u00b0/g, " degrees")
      .replace(/\u00c2\u0081\u00c2\u00ba/g, "+")
      .replace(/\u00c2/g, "")
      .replace(/\u00c3\u00a1|\u00c3\u00a0|\u00c3\u00a2|\u00c3\u00a4|\u00c3\u00a3|\u00c3\u00a5/g, "a")
      .replace(/\u00c3\u00a9|\u00c3\u00a8|\u00c3\u00aa|\u00c3\u00ab/g, "e")
      .replace(/\u00c3\u00ad|\u00c3\u00ac|\u00c3\u00ae|\u00c3\u00af/g, "i")
      .replace(/\u00c3\u00b3|\u00c3\u00b2|\u00c3\u00b4|\u00c3\u00b6|\u00c3\u00b5|\u00c3\u00b8/g, "o")
      .replace(/\u00c3\u00ba|\u00c3\u00b9|\u00c3\u00bb|\u00c3\u00bc/g, "u")
      .replace(/\u00c3\u00b1/g, "n")
      .replace(/\u00c3\u00a7/g, "c")
      .replace(/\u00c3\u00a6/g, "ae")
      .replace(/\u00c3\u0178/g, "ss");
  };

  ns.clamp = function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  };

  ns.mulberry32 = function mulberry32(seed) {
    return function next() {
      let t = seed += 0x6d2b79f5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  ns.shuffleWith = function shuffleWith(rng, items) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  };

  ns.weightedPick = function weightedPick(rng, items, getWeight) {
    const weighted = items
      .map((item) => ({ item, weight: Math.max(0, Number(getWeight(item)) || 0) }))
      .filter((entry) => entry.weight > 0);
    if (!weighted.length) return null;
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = rng() * total;
    for (const entry of weighted) {
      cursor -= entry.weight;
      if (cursor <= 0) return entry.item;
    }
    return weighted[weighted.length - 1].item;
  };

  ns.slugify = function slugify(value) {
    return ns.normalizeText(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-");
  };

  ns.normalizeText = function normalizeText(value) {
    return ns.repairMojibake(value)
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, "\"")
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/[\u00A0]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/ß/g, "ss")
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .replace(/ł/g, "l")
      .replace(/ð/g, "d")
      .replace(/þ/g, "th");
  };

  ns.normalizeDisplayTitle = function normalizeDisplayTitle(value) {
    return ns.repairMojibake(value)
      .replace(/\s+/g, " ")
      .trim();
  };

  ns.normalizeAnswer = function normalizeAnswer(value) {
    return ns.normalizeText(value)
      .replace(/^(what|who|where|when|why|how)\s+(is|are|was|were|am|be)\s+/, "")
      .replace(/^(what|who|where|when|why|how)\s+(do|does|did)\s+/, "")
      .replace(/\?+$/g, "")
      .replace(/(?:\s*\([^)]*\)\s*)+$/g, " ")
      .replace(/^(?:(?:the|a|an)\s+)+/, "")
      .replace(/&/g, " and ")
      .replace(/-/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  ns.normalizeForGiveawayCheck = function normalizeForGiveawayCheck(value) {
    return ns.normalizeAnswer(value)
      .replace(/-/g, " ")
      .replace(/\b(the|a|an)\b/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  ns.answerAppearsInClue = function answerAppearsInClue(clue, answer) {
    const answerKey = ns.normalizeForGiveawayCheck(answer);
    const clueKey = ns.normalizeForGiveawayCheck(clue);
    if (!answerKey || !clueKey) return false;

    const words = answerKey.split(" ").filter(Boolean);
    if (words.length === 1 && answerKey.length < 4) return false;

    const escaped = answerKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(clueKey);
  };

  ns.fingerprintQA = function fingerprintQA(clue, answer) {
    const cleanClue = ns.normalizeText(clue)
      .replace(/-/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `${cleanClue}|${ns.normalizeAnswer(answer)}`;
  };

  ns.nearDuplicateFingerprint = function nearDuplicateFingerprint(clue, answer) {
    const cleanClue = ns.normalizeText(clue)
      .replace(/\b(this|these|the|a|an)\b/g, " ")
      .replace(/-/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const clueTail = cleanClue.split(" ").slice(-14).join(" ");
    return `${clueTail}|${ns.normalizeAnswer(answer)}`;
  };

  ns.hashString = function hashString(value) {
    let hash = 0x811c9dc5;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return `h${(hash >>> 0).toString(16)}`;
  };

  ns.chunkArray = function chunkArray(items, chunkSize) {
    const output = [];
    for (let index = 0; index < items.length; index += chunkSize) {
      const chunk = items.slice(index, index + chunkSize);
      if (chunk.length === chunkSize) output.push(chunk);
    }
    return output;
  };

  ns.uniqueBy = function uniqueBy(items, getKey) {
    const seen = new Set();
    const output = [];
    for (const item of items) {
      const key = getKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(item);
    }
    return output;
  };

  ns.findStrictAscendingDifficultyPath = function findStrictAscendingDifficultyPath(slotGroups, getDifficulty) {
    const groups = (slotGroups || []).map((group) => (group || []).slice());
    const readDifficulty = typeof getDifficulty === "function"
      ? getDifficulty
      : (item) => item?.difficulty;

    function walk(index, lastDifficulty, path) {
      if (index >= groups.length) return path.slice();
      const candidates = groups[index]
        .filter(Boolean)
        .slice()
        .sort((left, right) => readDifficulty(left) - readDifficulty(right));

      for (const candidate of candidates) {
        const difficulty = Number(readDifficulty(candidate));
        if (!Number.isFinite(difficulty) || difficulty <= lastDifficulty) continue;
        path.push(candidate);
        const result = walk(index + 1, difficulty, path);
        if (result) return result;
        path.pop();
      }
      return null;
    }

    return walk(0, -Infinity, []);
  };

  ns.findPlayableCluePath = function findPlayableCluePath(slotGroups, options) {
    const settings = options || {};
    const groups = (slotGroups || []).map((group) => (group || []).slice());
    const readDifficulty = typeof settings.getDifficulty === "function"
      ? settings.getDifficulty
      : (item) => item?.difficulty;
    const readId = typeof settings.getId === "function"
      ? settings.getId
      : (item) => item?.id;
    const readAnswerKey = typeof settings.getAnswerKey === "function"
      ? settings.getAnswerKey
      : (item) => item?.answerKey;
    const readFingerprint = typeof settings.getFingerprint === "function"
      ? settings.getFingerprint
      : (item) => item?.fingerprint;

    function walk(index, lastDifficulty, path, usedIds, usedAnswers, usedFingerprints) {
      if (index >= groups.length) return path.slice();
      const candidates = groups[index]
        .filter(Boolean)
        .slice()
        .sort((left, right) => readDifficulty(left) - readDifficulty(right));

      for (const candidate of candidates) {
        const difficulty = Number(readDifficulty(candidate));
        const clueId = readId(candidate);
        const answerKey = readAnswerKey(candidate);
        const fingerprint = readFingerprint(candidate);

        if (!Number.isFinite(difficulty) || difficulty <= lastDifficulty) continue;
        if (clueId && usedIds.has(clueId)) continue;
        if (answerKey && usedAnswers.has(answerKey)) continue;
        if (fingerprint && usedFingerprints.has(fingerprint)) continue;

        path.push(candidate);
        if (clueId) usedIds.add(clueId);
        if (answerKey) usedAnswers.add(answerKey);
        if (fingerprint) usedFingerprints.add(fingerprint);

        const result = walk(index + 1, difficulty, path, usedIds, usedAnswers, usedFingerprints);
        if (result) return result;

        path.pop();
        if (clueId) usedIds.delete(clueId);
        if (answerKey) usedAnswers.delete(answerKey);
        if (fingerprint) usedFingerprints.delete(fingerprint);
      }

      return null;
    }

    return walk(0, -Infinity, [], new Set(), new Set(), new Set());
  };

  ns.fmtMoney = function fmtMoney(value) {
    const sign = value < 0 ? "-$" : "$";
    return `${sign}${Math.abs(value)}`;
  };

  ns.average = function average(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  ns.getDifficultyBand = function getDifficultyBand(roundType, value) {
    if (roundType === "final") return ns.DIFFICULTY_BANDS.final.slice();
    const roundBands = ns.DIFFICULTY_BANDS[roundType] || {};
    const band = roundBands[value];
    return Array.isArray(band) ? band.slice() : [1, 100];
  };

  ns.isDifficultyInBand = function isDifficultyInBand(roundType, value, difficulty) {
    const [min, max] = ns.getDifficultyBand(roundType, value);
    return Number.isFinite(difficulty) && difficulty >= min && difficulty <= max;
  };

  ns.pickDifficultyTarget = function pickDifficultyTarget(roundType, value, difficultyMode) {
    const [min, max] = ns.getDifficultyBand(roundType, value);
    const bias = ns.DIFFICULTY_MODE_BIAS[difficultyMode] ?? ns.DIFFICULTY_MODE_BIAS.tv;
    return min + ((max - min) * bias);
  };

  ns.readHistoryWindow = function readHistoryWindow(items, limit) {
    const source = Array.isArray(items) ? items : [];
    return source.slice(Math.max(0, source.length - limit));
  };

  ns.recencyPenalty = function recencyPenalty(history, value, pointsByAge) {
    if (!value) return 0;
    const source = Array.isArray(history) ? history : [];
    for (let offset = 0; offset < source.length; offset += 1) {
      const historyIndex = source.length - 1 - offset;
      if (source[historyIndex] !== value) continue;
      const penalty = pointsByAge[offset];
      return Number.isFinite(penalty) ? penalty : pointsByAge[pointsByAge.length - 1] || 0;
    }
    return 0;
  };

  ns.romanNumeral = function romanNumeral(value) {
    const numerals = [
      ["M", 1000],
      ["CM", 900],
      ["D", 500],
      ["CD", 400],
      ["C", 100],
      ["XC", 90],
      ["L", 50],
      ["XL", 40],
      ["X", 10],
      ["IX", 9],
      ["V", 5],
      ["IV", 4],
      ["I", 1]
    ];
    let remaining = Math.max(1, Math.floor(value));
    let output = "";
    for (const [symbol, amount] of numerals) {
      while (remaining >= amount) {
        output += symbol;
        remaining -= amount;
      }
    }
    return output;
  };

  ns.deepClone = function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  };

  ns.safeParseJson = function safeParseJson(raw, fallback) {
    if (!raw) return fallback ?? null;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback ?? null;
    }
  };
})(window.Jeopardy = window.Jeopardy || {});

