const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const bankFiles = [
  'data/jeopardy-bank/round1-bank.js',
  'data/jeopardy-bank/round2-bank.js',
  'data/jeopardy-bank/final-bank.js'
];
const publicBankFiles = bankFiles.map((file) => `public/legacy/${file}`);
const runtimeModuleFiles = fs.readdirSync(path.join(root, 'src/jeopardy'))
  .filter((name) => name.endsWith('.js'))
  .sort()
  .map((name) => `src/jeopardy/${name}`);
const publicRuntimeModuleFiles = runtimeModuleFiles.map((file) => `public/legacy/${file}`);
const oldAnswerPath = 'data/jeopardy-bank/original-answer-blacklist.json';
const preExpansionTrackingPath = 'data/jeopardy-bank/pre-expansion-tracking.json';
const expandedBankPath = 'data/jeopardy-bank/expanded-bank.tsv';
const generatorPath = 'tools/generate-jeopardy-classroom-bank.cjs';
const builderPath = 'tools/build-jeopardy-bank.ps1';
const blueprintPath = 'data/jeopardy-bank/bank-blueprint.ps1';
const manualTopoffPath = 'data/jeopardy-bank/manual-existing-category-topoff.tsv';
const approvedCorrectionsPath = 'data/jeopardy-bank/approved-pre-expansion-corrections.json';
const initialStatsPath = 'data/jeopardy-bank/pre-major-expansion-stats.json';
const initialSnapshot = JSON.parse(fs.readFileSync(path.join(root, initialStatsPath), 'utf8'));
const initialCounts = {
  regularClues: initialSnapshot.totals.regularClues,
  round1Clues: initialSnapshot.totals.round1Clues,
  round2Clues: initialSnapshot.totals.round2Clues,
  regularCategories: initialSnapshot.totals.regularCategories,
  finalClues: initialSnapshot.totals.finalClues,
  finalCategories: initialSnapshot.totals.finalCategories,
  uniqueNormalizedAnswers: initialSnapshot.totals.uniqueNormalizedAnswers
};
const initialCategoryCounts = new Map(
  Object.values(initialSnapshot.rounds || {}).flatMap((categories) =>
    categories.map((entry) => [entry.category, entry.clues])
  )
);
const targetRegularClues = Math.max(5000, Math.ceil(initialCounts.regularClues * 1.5));
const minimumRoundGrowth = 1.1;
const minimumCluesPerValue = 8;
const minimumRegularCategories = 70;
const minimumRoundCategories = 35;
const values = {
  r1: [200, 400, 600, 800, 1000],
  r2: [400, 800, 1200, 1600, 2000]
};
const bands = {
  r1: { 200: [15, 25], 400: [26, 40], 600: [41, 55], 800: [56, 72], 1000: [73, 88] },
  r2: { 400: [30, 45], 800: [46, 58], 1200: [59, 70], 1600: [71, 84], 2000: [85, 97] },
  final: [75, 95]
};
const lazyNumberedCategoryRe = /\s(?:\d+|part\s+(?:i{1,3}|iv|v)|round\s+\d+|category\s+\d+)$/i;
const bannedCategoryRe = /\b(iso|i\.?s\.?o\.?|iatas?|abbreviations?|codes?|two-letter country codes?|language codes?|currency codes?|script codes?|airport codes?|airport cities?|world airports?|time zones?|cities by time zone|constellation abbreviations?|element symbols?|atomic numbers?|periodic table names?|measuring units?|measurement units?)\b/i;
const bannedClueTemplateRe = /\b(iso alpha-?2|iata code|language code|currency code|script code|code phrase|country code|airport code|time zone|unit identifier|chemical-symbol phrase|atomic-number phrase|constellation abbreviation)\b/i;
const lowInformationTemplateRe = /\b(is the answer|title sought here|this is described as|scientific article|journal article|U\.S\. patent|National Archives and Records Administration's holdings|known as an automobile model|this automaker produced|this manufacturer built)\b/i;
const unresolvedIdentifierRe = /\b[QP]\d{3,}\b/u;
const jeopardyResponseRe = /^(What|Who|Where|When)\s+(?:is|are|was|were)\s+.+\?$/u;
const malformedTextRe = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]|\b(?:undefined|null)\b/iu;

function fail(message) {
  throw new Error(message);
}

function validateInitialSnapshot() {
  if (initialSnapshot.version !== 1) fail(`${initialStatsPath} must be a version-1 snapshot`);
  const expected = {
    round1Categories: 35,
    round1Clues: 2945,
    round2Categories: 32,
    round2Clues: 2403,
    regularCategories: 67,
    regularClues: 5348,
    finalCategories: 28,
    finalClues: 262,
    uniqueNormalizedAnswers: 5610
  };
  for (const [key, value] of Object.entries(expected)) {
    if (initialSnapshot.totals?.[key] !== value) {
      fail(`${initialStatsPath}: expected ${key}=${value}, found ${initialSnapshot.totals?.[key]}`);
    }
  }
  for (const round of ['r1', 'r2']) {
    const categories = initialSnapshot.rounds?.[round];
    if (!Array.isArray(categories)) fail(`${initialStatsPath}: missing ${round} category statistics`);
    for (const category of categories) {
      const sum = values[round].reduce((total, value) => total + Number(category.values?.[value] || 0), 0);
      if (sum !== category.clues) fail(`${initialStatsPath}: ${round} ${category.category} slot counts do not sum to ${category.clues}`);
    }
  }
}

function validateNormalizationRules() {
  const equivalentAnswers = [
    ['The Beatles', 'What are Beatles?'],
    ['Spider-Man', 'What is Spider Man?'],
    ['Søren Kierkegaard', 'Who is Soren Kierkegaard?'],
    ['Mötley Crüe', 'What is Motley Crue?'],
    ['The Odyssey (epic poem)', 'What is Odyssey?']
  ];
  for (const [left, right] of equivalentAnswers) {
    if (normalizeAnswer(left) !== normalizeAnswer(right)) {
      fail(`answer normalization regression: "${left}" and "${right}" must be equivalent`);
    }
  }
}

function normalizeAnswer(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/ł/g, 'l')
    .replace(/ð/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\bwhat\s*'s\s+/g, '')
    .replace(/^(what|who|where|when|why|how)\s+(is|are|was|were|am|be)\s+/g, '')
    .replace(/^(what|who|where|when|why|how)\s+(do|does|did)\s+/g, '')
    .replace(/\?+$/g, '')
    .replace(/(?:\s*\([^)]*\)\s*)+$/g, ' ')
    .replace(/^(?:(?:the|a|an)\s+)+/g, '')
    .replace(/&/g, ' and ')
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeClue(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/ł/g, 'l')
    .replace(/ð/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeGeneratedText(value) {
  return String(value || '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForGiveawayCheck(value) {
  return normalizeAnswer(value)
    .replace(/-/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function answerAppearsInClue(clue, answer) {
  const answerKey = normalizeForGiveawayCheck(answer);
  const clueKey = normalizeForGiveawayCheck(clue);
  if (!answerKey || !clueKey) return false;
  const words = answerKey.split(' ').filter(Boolean);
  if (words.length === 1 && answerKey.length < 4) return false;
  const escaped = answerKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(clueKey);
}

function loadBank(files) {
  const sandbox = { window: { Jeopardy: {} } };
  vm.createContext(sandbox);
  for (const file of files) {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) fail(`Missing bank file: ${file}`);
    vm.runInContext(fs.readFileSync(fullPath, 'utf8'), sandbox, { filename: file });
  }
  return sandbox.window.Jeopardy;
}

function fileHash(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(root, file)))
    .digest('hex');
}

function loadApprovedCorrections(tracking) {
  const fullPath = path.join(root, approvedCorrectionsPath);
  if (!fs.existsSync(fullPath)) fail(`missing reviewed correction manifest ${approvedCorrectionsPath}`);
  const payload = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (payload.version !== 1 || !Array.isArray(payload.entries)) {
    fail(`${approvedCorrectionsPath} must contain a version-1 entries array`);
  }
  const corrections = new Map();
  for (const [index, entry] of payload.entries.entries()) {
    if (!entry?.q || !entry?.a || !entry?.reason) {
      fail(`${approvedCorrectionsPath}: entry ${index + 1} needs q, a, and reason fields`);
    }
    const answerKey = normalizeAnswer(entry.a);
    const pairKey = `${normalizeClue(entry.q)}|${answerKey}`;
    if (!tracking.answers.has(answerKey)) {
      fail(`${approvedCorrectionsPath}: entry ${index + 1} does not correct a protected pre-expansion answer`);
    }
    if (tracking.pairs.has(pairKey)) {
      fail(`${approvedCorrectionsPath}: entry ${index + 1} is already an unchanged pre-expansion pair`);
    }
    if (corrections.has(pairKey)) fail(`${approvedCorrectionsPath}: duplicate approved pair at entry ${index + 1}`);
    corrections.set(pairKey, entry.reason);
  }
  return corrections;
}

function upstreamDigest(files) {
  const hash = crypto.createHash('sha256');
  for (const file of files.map((entry) => path.resolve(root, entry)).sort()) {
    hash.update(path.relative(root, file).replace(/\\/g, '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function researchedExpansionFiles() {
  const directory = path.join(root, 'data/jeopardy-bank');
  const names = fs.readdirSync(directory)
    .filter((name) => /^researched-expansion-\d+\.tsv$/u.test(name))
    .sort();
  const expectedNames = Array.from(
    { length: 14 },
    (_, index) => `researched-expansion-${String(index + 1).padStart(2, '0')}.tsv`
  );
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    fail(`expected researched packs ${expectedNames.join(', ')}; found ${names.join(', ') || 'none'}`);
  }
  return names.map((name) => `data/jeopardy-bank/${name}`);
}

function validateExpandedSourceFreshness() {
  const expandedFullPath = path.join(root, expandedBankPath);
  if (!fs.existsSync(expandedFullPath)) fail(`missing generated source ${expandedBankPath}`);
  const firstLines = fs.readFileSync(expandedFullPath, 'utf8').split(/\r?\n/, 5);
  const hashLine = firstLines.find((line) => line.startsWith('# Upstream SHA-256: '));
  if (!hashLine) fail(`${expandedBankPath} is missing its upstream source hash; regenerate the classroom bank`);
  const expected = upstreamDigest([
    generatorPath,
    oldAnswerPath,
    preExpansionTrackingPath,
    manualTopoffPath,
    ...researchedExpansionFiles()
  ]);
  const actual = hashLine.slice('# Upstream SHA-256: '.length).trim();
  if (actual !== expected) fail(`${expandedBankPath} is stale relative to its upstream authored sources; rerun the classroom generator`);
}

function sourceSignatures() {
  const signatures = [];
  let current = null;
  for (const rawLine of fs.readFileSync(path.join(root, expandedBankPath), 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = rawLine.split('\t');
    if (parts[0] === 'REGULAR') {
      current = { kind: 'regular', round: parts[1], category: parts[2] };
      continue;
    }
    if (parts[0] === 'FINAL') {
      current = { kind: 'final', category: parts[1] };
      continue;
    }
    if (parts[0] === 'END') {
      current = null;
      continue;
    }
    if (!current) fail(`${expandedBankPath}: row appears outside a category block: ${rawLine}`);
    if (current.kind === 'regular') {
      if (parts.length !== 4) fail(`${expandedBankPath}: malformed regular row: ${rawLine}`);
      signatures.push(['regular', current.round, current.category, Number(parts[0]), Number(parts[1]), normalizeGeneratedText(parts[2]), normalizeGeneratedText(parts[3])].join('\t'));
    } else {
      if (parts.length !== 3) fail(`${expandedBankPath}: malformed Final row: ${rawLine}`);
      signatures.push(['final', current.category, Number(parts[0]), normalizeGeneratedText(parts[1]), normalizeGeneratedText(parts[2])].join('\t'));
    }
  }
  return signatures.sort();
}

function bankSignatures(ns) {
  const signatures = [];
  for (const [round, bank] of [['r1', ns.ROUND1_BANK], ['r2', ns.ROUND2_BANK]]) {
    for (const pack of bank || []) {
      for (const value of values[round]) {
        for (const clue of pack.slots?.[value] || []) {
          signatures.push(['regular', round, pack.displayTitle, value, clue.difficulty, clue.q, clue.a].join('\t'));
        }
      }
    }
  }
  for (const clue of ns.FINAL_BANK || []) {
    signatures.push(['final', clue.cat, clue.difficulty, clue.q, clue.a].join('\t'));
  }
  return signatures.sort();
}

function validateExpandedSourceParity(ns) {
  const sourceRows = sourceSignatures();
  const bankRows = bankSignatures(ns);
  if (sourceRows.length !== bankRows.length) {
    fail(`generated JS banks contain ${bankRows.length} rows but ${expandedBankPath} contains ${sourceRows.length}`);
  }
  for (let index = 0; index < sourceRows.length; index += 1) {
    if (sourceRows[index] !== bankRows[index]) {
      fail(`generated JS banks are stale or differ from ${expandedBankPath}; rerun bank:build`);
    }
  }
}

function validateGeneratedBankFingerprint() {
  const expected = [builderPath, blueprintPath, expandedBankPath].map(fileHash).join(':');
  for (const bankFile of bankFiles) {
    const firstLine = fs.readFileSync(path.join(root, bankFile), 'utf8').split(/\r?\n/, 1)[0];
    if (firstLine !== `// Build inputs: ${expected}`) {
      fail(`${bankFile} is stale relative to the builder, blueprint, or expanded TSV; rerun bank:build`);
    }
  }
}

function validateLoaded(ns, label, oldKeys) {
  const seenAnswers = new Map();
  const seenClues = new Map();
  const regularTitles = new Set();
  const roundTitleCounts = { r1: 0, r2: 0 };
  const roundClueCounts = { r1: 0, r2: 0 };
  const slotCounts = [];
  const categoryClueCounts = new Map();
  let regularClues = 0;
  const tracking = loadPreExpansionTracking();
  const approvedCorrections = loadApprovedCorrections(tracking);
  const usedApprovedCorrections = new Set();
  let newRegularClues = 0;

  for (const [round, bank] of [['r1', ns.ROUND1_BANK], ['r2', ns.ROUND2_BANK]]) {
      if (!Array.isArray(bank)) fail(`${label}: ${round} bank is not an array`);
      if (bank.length < minimumRoundCategories) fail(`${label}: ${round} needs at least ${minimumRoundCategories} approved playable categories, found ${bank.length}`);
      roundTitleCounts[round] = bank.length;
      for (const pack of bank) {
      if (!pack.packId || !pack.displayTitle || pack.roundType !== round) fail(`${label}: malformed pack metadata`);
      if (lazyNumberedCategoryRe.test(pack.displayTitle)) fail(`${label}: lazy numbered category remains: ${pack.displayTitle}`);
      if (bannedCategoryRe.test(pack.displayTitle)) fail(`${label}: banned category remains: ${pack.displayTitle}`);
      regularTitles.add(pack.displayTitle);
      for (const value of values[round]) {
        const clues = pack.slots?.[value];
        if (!Array.isArray(clues) || clues.length < minimumCluesPerValue) {
          fail(`${label}: ${pack.displayTitle} has fewer than ${minimumCluesPerValue} clues at $${value}`);
        }
        slotCounts.push({ round, category: pack.displayTitle, value, count: clues.length });
        categoryClueCounts.set(pack.displayTitle, (categoryClueCounts.get(pack.displayTitle) || 0) + clues.length);
        for (const clue of clues) {
          regularClues += 1;
          if (!clue.q || !clue.a) fail(`${label}: missing clue or answer in ${pack.displayTitle}`);
          if (malformedTextRe.test(clue.q) || malformedTextRe.test(clue.a)) fail(`${label}: malformed text in ${pack.displayTitle}`);
          if (/^(what|which|who|where|when|why|how)\b/i.test(clue.q)) fail(`${label}: worksheet-style clue starts with a question word: ${clue.q}`);
          if (!jeopardyResponseRe.test(clue.a)) fail(`${label}: response lacks Jeopardy phrasing in ${pack.displayTitle}: ${clue.a}`);
          if (bannedClueTemplateRe.test(clue.q) || bannedClueTemplateRe.test(clue.a)) fail(`${label}: banned code/abbreviation clue remains in ${pack.displayTitle}: ${clue.q}`);
          if (lowInformationTemplateRe.test(clue.q)) fail(`${label}: low-information generated clue remains in ${pack.displayTitle}: ${clue.q}`);
          if (unresolvedIdentifierRe.test(clue.q) || unresolvedIdentifierRe.test(clue.a)) fail(`${label}: unresolved database identifier remains in ${pack.displayTitle}: ${clue.a}`);
          const answerKey = normalizeAnswer(clue.a);
          const clueKey = normalizeClue(clue.q);
          const pairKey = `${clueKey}|${answerKey}`;
          if (!answerKey) fail(`${label}: empty normalized answer`);
          if (answerAppearsInClue(clue.q, clue.a)) fail(`${label}: clue contains its own answer in ${pack.displayTitle}: ${clue.q} / ${clue.a}`);
          if (seenAnswers.has(answerKey)) fail(`${label}: duplicate answer ${clue.a} also seen in ${seenAnswers.get(answerKey)}`);
          if (seenClues.has(clueKey)) fail(`${label}: duplicate clue text: ${clue.q}`);
          if (!tracking.pairs.has(pairKey)) {
            newRegularClues += 1;
            if (approvedCorrections.has(pairKey)) {
              usedApprovedCorrections.add(pairKey);
            } else {
              if (tracking.answers.has(answerKey)) fail(`${label}: new clue reuses pre-expansion answer ${clue.a}`);
              if (oldKeys.has(answerKey)) fail(`${label}: new clue reuses original-blacklist answer ${clue.a}`);
              if (tracking.clues.has(clueKey)) fail(`${label}: new clue duplicates pre-expansion clue text: ${clue.q}`);
            }
          }
          seenAnswers.set(answerKey, `${pack.displayTitle} $${value}`);
          seenClues.set(clueKey, `${pack.displayTitle} $${value}`);
          roundClueCounts[round] += 1;
          const [min, max] = bands[round][value];
          if (!Number.isFinite(clue.difficulty) || clue.difficulty < min || clue.difficulty > max) {
            fail(`${label}: ${pack.displayTitle} clue difficulty ${clue.difficulty} outside $${value} band`);
          }
        }
      }
    }
  }

  if (regularTitles.size < minimumRegularCategories) fail(`${label}: expected at least ${minimumRegularCategories} approved regular categories, found ${regularTitles.size}`);
  if (roundTitleCounts.r1 < minimumRoundCategories) fail(`${label}: expected at least ${minimumRoundCategories} Round One categories, found ${roundTitleCounts.r1}`);
  if (roundTitleCounts.r2 < minimumRoundCategories) fail(`${label}: expected at least ${minimumRoundCategories} Double Jeopardy categories, found ${roundTitleCounts.r2}`);
  if (regularClues < targetRegularClues) fail(`${label}: expected at least ${targetRegularClues} approved regular clues, found ${regularClues}`);
  if (roundClueCounts.r1 < Math.ceil(initialCounts.round1Clues * minimumRoundGrowth)) {
    fail(`${label}: Round One did not increase substantially above the initial ${initialCounts.round1Clues} clues`);
  }
  if (roundClueCounts.r2 < Math.ceil(initialCounts.round2Clues * minimumRoundGrowth)) {
    fail(`${label}: Double Jeopardy did not increase substantially above the initial ${initialCounts.round2Clues} clues`);
  }

  if (!Array.isArray(ns.FINAL_BANK)) fail(`${label}: final bank is not an array`);
  const finalCategoryCounts = new Map();
  for (const final of ns.FINAL_BANK) {
    if (!final.cat || !final.q || !final.a) fail(`${label}: malformed Final clue`);
    if (malformedTextRe.test(final.q) || malformedTextRe.test(final.a)) fail(`${label}: malformed text in Final clue`);
    if (/^(what|which|who|where|when|why|how)\b/i.test(final.q)) fail(`${label}: worksheet-style Final clue: ${final.q}`);
    if (!jeopardyResponseRe.test(final.a)) fail(`${label}: Final response lacks Jeopardy phrasing: ${final.a}`);
    if (lazyNumberedCategoryRe.test(final.cat)) fail(`${label}: lazy numbered Final category remains: ${final.cat}`);
    if (bannedCategoryRe.test(final.cat)) fail(`${label}: banned Final category remains: ${final.cat}`);
    if (bannedClueTemplateRe.test(final.q) || bannedClueTemplateRe.test(final.a)) fail(`${label}: banned code/abbreviation Final clue remains: ${final.q}`);
    if (lowInformationTemplateRe.test(final.q)) fail(`${label}: low-information generated Final clue remains: ${final.q}`);
    if (unresolvedIdentifierRe.test(final.q) || unresolvedIdentifierRe.test(final.a)) fail(`${label}: unresolved identifier in Final clue: ${final.a}`);
    const answerKey = normalizeAnswer(final.a);
    const clueKey = normalizeClue(final.q);
    const pairKey = `${clueKey}|${answerKey}`;
    if (answerAppearsInClue(final.q, final.a)) fail(`${label}: Final clue contains its own answer: ${final.q} / ${final.a}`);
    if (seenAnswers.has(answerKey)) fail(`${label}: duplicate Final answer ${final.a}`);
    if (seenClues.has(clueKey)) fail(`${label}: duplicate Final clue text: ${final.q}`);
    if (!tracking.pairs.has(pairKey)) {
      if (approvedCorrections.has(pairKey)) {
        usedApprovedCorrections.add(pairKey);
      } else {
        if (tracking.answers.has(answerKey)) fail(`${label}: new Final clue reuses pre-expansion answer ${final.a}`);
        if (oldKeys.has(answerKey)) fail(`${label}: new Final clue reuses original-blacklist answer ${final.a}`);
        if (tracking.clues.has(clueKey)) fail(`${label}: new Final clue duplicates pre-expansion clue text: ${final.q}`);
      }
    }
    seenAnswers.set(answerKey, `Final: ${final.cat}`);
    seenClues.set(clueKey, `Final: ${final.cat}`);
    finalCategoryCounts.set(final.cat, (finalCategoryCounts.get(final.cat) || 0) + 1);
    const [min, max] = bands.final;
    if (!Number.isFinite(final.difficulty) || final.difficulty < min || final.difficulty > max) {
      fail(`${label}: Final difficulty ${final.difficulty} outside band`);
    }
  }
  if (ns.FINAL_BANK.length < 200) fail(`${label}: expected at least 200 Final clues, found ${ns.FINAL_BANK.length}`);
  if (finalCategoryCounts.size < 20) fail(`${label}: expected at least 20 Final categories, found ${finalCategoryCounts.size}`);
  for (const [category, count] of finalCategoryCounts) {
    if (count < 6) fail(`${label}: Final category "${category}" is too thin with only ${count} clues`);
  }
  const largestFinalCategory = Math.max(...finalCategoryCounts.values());
  if (largestFinalCategory > Math.ceil(ns.FINAL_BANK.length * 0.08)) {
    fail(`${label}: one Final category is overly dominant with ${largestFinalCategory} clues`);
  }
  for (const pairKey of approvedCorrections.keys()) {
    if (!usedApprovedCorrections.has(pairKey)) {
      fail(`${label}: reviewed pre-expansion correction is missing from the built bank: ${pairKey}`);
    }
  }

  const sortedSlotCounts = slotCounts.map((entry) => entry.count).sort((left, right) => left - right);
  const slotTotal = sortedSlotCounts.reduce((sum, count) => sum + count, 0);
  const categorySizes = [...categoryClueCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => left.count - right.count || left.category.localeCompare(right.category));
  const mostExpandedCategories = categorySizes
    .map(({ category, count }) => ({
      category,
      before: initialCategoryCounts.get(category) || 0,
      after: count,
      added: count - (initialCategoryCounts.get(category) || 0)
    }))
    .sort((left, right) => right.added - left.added || left.category.localeCompare(right.category))
    .slice(0, 12);

  return {
    regularCategories: regularTitles.size,
    regularClues,
    round1Clues: roundClueCounts.r1,
    round2Clues: roundClueCounts.r2,
    newRegularClues,
    finalClues: ns.FINAL_BANK.length,
    finalCategories: finalCategoryCounts.size,
    uniqueAnswers: seenAnswers.size,
    duplicateAnswers: 0,
    duplicateClues: 0,
    cluesPerValue: {
      minimum: sortedSlotCounts[0],
      average: Number((slotTotal / sortedSlotCounts.length).toFixed(2)),
      maximum: sortedSlotCounts[sortedSlotCounts.length - 1]
    },
    thinnestCategories: categorySizes.slice(0, 8),
    largestCategories: categorySizes.slice(-8).reverse(),
    mostExpandedCategories
  };
}

const oldPayload = JSON.parse(fs.readFileSync(path.join(root, oldAnswerPath), 'utf8'));
const oldKeys = new Set(oldPayload.answers.map((entry) => normalizeAnswer(entry.examples?.[0] || entry.key)));

function loadPreExpansionTracking() {
  const fullPath = path.join(root, preExpansionTrackingPath);
  if (!fs.existsSync(fullPath)) return { answers: new Set(), clues: new Set(), pairs: new Set(), baseline: {} };
  const payload = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  return {
    answers: new Set((payload.answers || []).map((entry) => normalizeAnswer(entry.examples?.[0] || entry.key))),
    clues: new Set((payload.clues || []).map((entry) => normalizeClue(entry.examples?.[0] || entry.key))),
    pairs: new Set((payload.entries || []).map((entry) => `${normalizeClue(entry.q)}|${normalizeAnswer(entry.a)}`)),
    baseline: payload.baseline || {}
  };
}
validateInitialSnapshot();
validateNormalizationRules();
validateExpandedSourceFreshness();
validateGeneratedBankFingerprint();
const sourceBank = loadBank(bankFiles);
validateExpandedSourceParity(sourceBank);
const sourceStats = validateLoaded(sourceBank, 'source', oldKeys);

let publicStats = null;
if (!publicBankFiles.every((file) => fs.existsSync(path.join(root, file)))) {
  fail('one or more public legacy runtime bank copies are missing; run sync:legacy after rebuilding the bank');
}
publicStats = validateLoaded(loadBank(publicBankFiles), 'public legacy runtime', oldKeys);
if (JSON.stringify(sourceStats) !== JSON.stringify(publicStats)) {
  fail('public legacy runtime bank stats differ from source; run sync:legacy after rebuilding the bank');
}
for (let index = 0; index < bankFiles.length; index += 1) {
  if (fileHash(bankFiles[index]) !== fileHash(publicBankFiles[index])) {
    fail(`public legacy runtime copy is stale for ${bankFiles[index]}; run sync:legacy after rebuilding the bank`);
  }
}
if (!publicRuntimeModuleFiles.every((file) => fs.existsSync(path.join(root, file)))) {
  fail('one or more public legacy Jeopardy runtime modules are missing; run sync:legacy');
}
for (let index = 0; index < runtimeModuleFiles.length; index += 1) {
  if (fileHash(runtimeModuleFiles[index]) !== fileHash(publicRuntimeModuleFiles[index])) {
    fail(`public legacy runtime module is stale for ${runtimeModuleFiles[index]}; run sync:legacy`);
  }
}
if (fileHash('jeopardy-gameNewQuestionsV3.html') !== fileHash('public/legacy/jeopardy-gameNewQuestionsV3.html')) {
  fail('public legacy Jeopardy HTML is stale; run sync:legacy');
}

console.log(JSON.stringify({ initialCounts, targetRegularClues, sourceStats, publicStats }, null, 2));
