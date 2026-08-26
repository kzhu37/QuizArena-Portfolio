const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const bankDirectory = path.join(root, 'data', 'jeopardy-bank');
const expandedBankPath = path.join(bankDirectory, 'expanded-bank.tsv');
const generatorPath = path.join(root, 'tools', 'generate-jeopardy-source-bank.cjs');
const legacyBuilderPath = path.join(root, 'tools', 'build-jeopardy-bank.ps1');
const blueprintPath = path.join(bankDirectory, 'bank-blueprint.ps1');

const values = {
  r1: [200, 400, 600, 800, 1000],
  r2: [400, 800, 1200, 1600, 2000]
};
const bands = {
  r1: { 200: [15, 25], 400: [26, 40], 600: [41, 55], 800: [56, 72], 1000: [73, 88] },
  r2: { 400: [30, 45], 800: [46, 58], 1200: [59, 70], 1600: [71, 84], 2000: [85, 97] },
  final: [75, 95]
};
const minimumCluesPerValue = 8;
const minimumRegularCategories = 70;
const minimumRoundCategories = 35;
const initialCounts = { regular: 5348, r1: 2945, r2: 2403 };
const targetRegularClues = Math.max(5000, Math.ceil(initialCounts.regular * 1.5));
const minimumRoundGrowth = 1.1;

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

function normalizeText(value) {
  return String(value || '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAnswer(value) {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/ł/g, 'l')
    .replace(/ð/g, 'd')
    .replace(/þ/g, 'th')
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
  return normalizeText(value)
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

function normalizeGiveaway(value) {
  return normalizeAnswer(value)
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function answerAppearsInClue(clue, response) {
  const answerKey = normalizeGiveaway(response);
  const clueKey = normalizeGiveaway(clue);
  if (!answerKey || !clueKey) return false;
  if (!answerKey.includes(' ') && answerKey.length < 4) return false;
  const escaped = answerKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(clueKey);
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function shortHash(value) {
  return crypto.createHash('md5').update(String(value)).digest('hex').slice(0, 12);
}

function fileHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function validateText(category, clue, response) {
  if (!clue || !response) fail(`${category}: clue and response are required`);
  if (malformedTextRe.test(`${clue} ${response}`)) fail(`${category}: malformed text`);
  if (/^(what|which|who|where|when|why|how)\b/i.test(clue)) fail(`${category}: worksheet-style clue opening`);
  if (!jeopardyResponseRe.test(response)) fail(`${category}: response lacks Jeopardy phrasing: ${response}`);
  if (bannedClueTemplateRe.test(`${clue} ${response}`)) fail(`${category}: banned clue template`);
  if (lowInformationTemplateRe.test(clue)) fail(`${category}: low-information clue template`);
  if (unresolvedIdentifierRe.test(`${clue} ${response}`)) fail(`${category}: unresolved source identifier`);
  if (answerAppearsInClue(clue, response)) fail(`${category}: clue contains its response: ${response}`);
}

function parseExpandedBank() {
  if (!fs.existsSync(expandedBankPath)) fail(`Missing generated source: ${expandedBankPath}`);
  const regular = [];
  const finals = [];
  let current = null;

  for (const rawLine of fs.readFileSync(expandedBankPath, 'utf8').split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = rawLine.split('\t');

    if (parts[0] === 'REGULAR') {
      current = {
        kind: 'regular',
        roundType: parts[1],
        displayTitle: normalizeText(parts[2]),
        family: normalizeText(parts[3]) || 'general',
        tags: String(parts[4] || '').split(',').map((tag) => tag.trim()).filter(Boolean),
        packKey: normalizeText(parts[5] || ''),
        slots: new Map()
      };
      regular.push(current);
      continue;
    }

    if (parts[0] === 'FINAL') {
      current = { kind: 'final', category: normalizeText(parts[1]), clues: [] };
      finals.push(current);
      continue;
    }

    if (parts[0] === 'END') {
      current = null;
      continue;
    }

    if (!current) fail(`Row appears outside a category block: ${rawLine}`);

    if (current.kind === 'regular') {
      if (parts.length !== 4) fail(`Malformed regular row: ${rawLine}`);
      const value = Number(parts[0]);
      const difficulty = Number(parts[1]);
      if (!current.slots.has(value)) current.slots.set(value, []);
      current.slots.get(value).push({
        q: normalizeText(parts[2]),
        a: normalizeText(parts[3]),
        difficulty
      });
    } else {
      if (parts.length !== 3) fail(`Malformed Final row: ${rawLine}`);
      current.clues.push({
        difficulty: Number(parts[0]),
        q: normalizeText(parts[1]),
        a: normalizeText(parts[2])
      });
    }
  }

  return { regular, finals };
}

function buildBanks(parsed) {
  const output = { r1: [], r2: [], final: [] };
  const seenAnswers = new Map();
  const seenClues = new Map();

  for (const category of parsed.regular) {
    if (!values[category.roundType]) fail(`Unknown round: ${category.roundType}`);
    if (!category.displayTitle) fail('Regular category is missing a title');
    if (lazyNumberedCategoryRe.test(category.displayTitle) || bannedCategoryRe.test(category.displayTitle)) {
      fail(`Rejected category title: ${category.displayTitle}`);
    }

    const slugSource = category.packKey ? `${category.displayTitle} ${category.packKey}` : category.displayTitle;
    const packId = `${category.roundType}|${slugify(slugSource)}`;
    const slots = {};

    for (const value of values[category.roundType]) {
      const candidates = category.slots.get(value) || [];
      if (candidates.length < minimumCluesPerValue) {
        fail(`${category.displayTitle} $${value} has only ${candidates.length} clues`);
      }

      slots[value] = candidates
        .slice()
        .sort((left, right) => left.difficulty - right.difficulty || left.q.localeCompare(right.q))
        .map((candidate, index) => {
          const [minimum, maximum] = bands[category.roundType][value];
          if (!Number.isInteger(candidate.difficulty) || candidate.difficulty < minimum || candidate.difficulty > maximum) {
            fail(`${category.displayTitle} $${value}: difficulty ${candidate.difficulty} is outside ${minimum}-${maximum}`);
          }
          validateText(category.displayTitle, candidate.q, candidate.a);

          const answerKey = normalizeAnswer(candidate.a);
          const clueKey = normalizeClue(candidate.q);
          if (!answerKey || !clueKey) fail(`${category.displayTitle}: empty normalized clue or response`);
          if (seenAnswers.has(answerKey)) fail(`Duplicate response ${candidate.a} also used in ${seenAnswers.get(answerKey)}`);
          if (seenClues.has(clueKey)) fail(`Duplicate clue text also used in ${seenClues.get(clueKey)}`);
          seenAnswers.set(answerKey, `${category.displayTitle} $${value}`);
          seenClues.set(clueKey, `${category.displayTitle} $${value}`);

          const fingerprint = `${clueKey}|${answerKey}`;
          return {
            id: `${packId}|manual|${value}|${index}|${shortHash(fingerprint)}`,
            q: candidate.q,
            a: candidate.a,
            difficulty: candidate.difficulty
          };
        });
    }

    output[category.roundType].push({
      packId,
      displayTitle: category.displayTitle,
      family: category.family,
      roundType: category.roundType,
      tags: category.tags,
      slots
    });
  }

  for (const category of parsed.finals) {
    if (!category.category) fail('Final category is missing a title');
    if (lazyNumberedCategoryRe.test(category.category) || bannedCategoryRe.test(category.category)) {
      fail(`Rejected Final category title: ${category.category}`);
    }

    category.clues.forEach((candidate, index) => {
      const [minimum, maximum] = bands.final;
      if (!Number.isInteger(candidate.difficulty) || candidate.difficulty < minimum || candidate.difficulty > maximum) {
        fail(`${category.category}: Final difficulty ${candidate.difficulty} is outside ${minimum}-${maximum}`);
      }
      validateText(category.category, candidate.q, candidate.a);

      const answerKey = normalizeAnswer(candidate.a);
      const clueKey = normalizeClue(candidate.q);
      if (!answerKey || !clueKey) fail(`${category.category}: empty normalized Final clue or response`);
      if (seenAnswers.has(answerKey)) fail(`Duplicate Final response ${candidate.a} also used in ${seenAnswers.get(answerKey)}`);
      if (seenClues.has(clueKey)) fail(`Duplicate Final clue text also used in ${seenClues.get(clueKey)}`);
      seenAnswers.set(answerKey, `Final: ${category.category}`);
      seenClues.set(clueKey, `Final: ${category.category}`);

      output.final.push({
        id: `final|${slugify(category.category)}|${index}|${shortHash(`${clueKey}|${answerKey}`)}`,
        cat: category.category,
        q: candidate.q,
        a: candidate.a,
        difficulty: candidate.difficulty
      });
    });
  }

  const roundCounts = {
    r1: output.r1.reduce((sum, category) => sum + Object.values(category.slots).reduce((slotSum, clues) => slotSum + clues.length, 0), 0),
    r2: output.r2.reduce((sum, category) => sum + Object.values(category.slots).reduce((slotSum, clues) => slotSum + clues.length, 0), 0)
  };
  const regularClues = roundCounts.r1 + roundCounts.r2;
  const regularCategories = output.r1.length + output.r2.length;
  const finalCategoryCount = new Set(output.final.map((clue) => clue.cat)).size;

  if (regularCategories < minimumRegularCategories) fail(`Built ${regularCategories} regular categories, expected at least ${minimumRegularCategories}`);
  if (output.r1.length < minimumRoundCategories || output.r2.length < minimumRoundCategories) {
    fail(`Each round must have at least ${minimumRoundCategories} categories`);
  }
  if (regularClues < targetRegularClues) fail(`Built ${regularClues} regular clues, expected at least ${targetRegularClues}`);
  if (roundCounts.r1 < Math.ceil(initialCounts.r1 * minimumRoundGrowth)) fail(`Round One built only ${roundCounts.r1} clues`);
  if (roundCounts.r2 < Math.ceil(initialCounts.r2 * minimumRoundGrowth)) fail(`Double Jeopardy built only ${roundCounts.r2} clues`);
  if (output.final.length < 200) fail(`Built ${output.final.length} Final clues, expected at least 200`);
  if (finalCategoryCount < 20) fail(`Built ${finalCategoryCount} Final categories, expected at least 20`);

  return { output, regularClues, regularCategories, roundCounts, finalCategoryCount };
}

function writeBank(fileName, variableName, data, buildFingerprint) {
  const filePath = path.join(bankDirectory, fileName);
  const content = `// Build inputs: ${buildFingerprint}\n(function bootstrapBank(ns) {\n  ns.${variableName} = ${JSON.stringify(data)};\n})(window.Jeopardy = window.Jeopardy || {});\n`;
  fs.writeFileSync(filePath, content, 'utf8');
}

const generation = spawnSync(process.execPath, [generatorPath], {
  cwd: root,
  stdio: 'inherit'
});
if (generation.error) throw generation.error;
if (generation.status !== 0) fail(`Jeopardy source bank generator failed with exit code ${generation.status}`);

const parsed = parseExpandedBank();
const built = buildBanks(parsed);
const buildFingerprint = [legacyBuilderPath, blueprintPath, expandedBankPath].map(fileHash).join(':');

writeBank('round1-bank.js', 'ROUND1_BANK', built.output.r1, buildFingerprint);
writeBank('round2-bank.js', 'ROUND2_BANK', built.output.r2, buildFingerprint);
writeBank('final-bank.js', 'FINAL_BANK', built.output.final, buildFingerprint);

console.log(JSON.stringify({
  regularCategories: built.regularCategories,
  round1Categories: built.output.r1.length,
  round2Categories: built.output.r2.length,
  regularClues: built.regularClues,
  round1Clues: built.roundCounts.r1,
  round2Clues: built.roundCounts.r2,
  finalClues: built.output.final.length,
  finalCategories: built.finalCategoryCount
}, null, 2));
