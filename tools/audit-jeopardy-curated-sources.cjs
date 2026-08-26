const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const bankDirectory = path.join(root, 'data/jeopardy-bank');
const reportNearProtected = process.argv.includes('--near-protected');

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

function protectedAnswers(fileName) {
  const payload = JSON.parse(fs.readFileSync(path.join(bankDirectory, fileName), 'utf8'));
  return (payload.answers || []).map((entry) => normalizeAnswer(entry.examples?.[0] || entry.key));
}

function reservedTsvAnswers(fileName) {
  return fs.readFileSync(path.join(bankDirectory, fileName), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => line.split('\t'))
    .filter((parts) => parts.length === 6)
    .map((parts) => normalizeAnswer(parts[5]));
}

function reservedTsvClues(fileName) {
  return fs.readFileSync(path.join(bankDirectory, fileName), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => line.split('\t'))
    .filter((parts) => parts.length === 6)
    .map((parts) => normalizeClue(parts[4]));
}

const historicalProtectedKeys = new Set([
  ...protectedAnswers('original-answer-blacklist.json'),
  ...protectedAnswers('pre-expansion-tracking.json')
]);
const protectedKeys = new Set([
  ...historicalProtectedKeys,
  ...reservedTsvAnswers('manual-existing-category-topoff.tsv')
]);
const preExpansionPayload = JSON.parse(fs.readFileSync(path.join(bankDirectory, 'pre-expansion-tracking.json'), 'utf8'));
const trackedPairKeys = new Set((preExpansionPayload.entries || []).map((entry) => `${normalizeClue(entry.q)}|${normalizeAnswer(entry.a)}`));
const trackedClueKeys = new Set((preExpansionPayload.clues || []).map((entry) => normalizeClue(entry.examples?.[0] || entry.key)));
const reservedClueKeys = new Set(reservedTsvClues('manual-existing-category-topoff.tsv'));
const protectedByWordCount = new Map();
if (reportNearProtected) {
  for (const key of protectedKeys) {
    if (key.length < 7) continue;
    const wordCount = key.split(' ').length;
    if (wordCount < 2) continue;
    if (!protectedByWordCount.has(wordCount)) protectedByWordCount.set(wordCount, []);
    protectedByWordCount.get(wordCount).push(key);
  }
}
const files = fs.readdirSync(bankDirectory)
  .filter((name) => /^researched-expansion-\d+\.tsv$/u.test(name))
  .sort();
const expectedFiles = Array.from(
  { length: 14 },
  (_, index) => `researched-expansion-${String(index + 1).padStart(2, '0')}.tsv`
);
const answers = new Map();
const clues = new Map();
const authoredResponses = new Map();
const clueOpenings = new Map();
const authoredCategories = new Map();
const problems = [];
const nearProtectedCandidates = [];
if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
  problems.push(`expected authored packs ${expectedFiles.join(', ')}; found ${files.join(', ') || 'none'}`);
}
let rowCount = 0;
const values = { r1: [200, 400, 600, 800, 1000], r2: [400, 800, 1200, 1600, 2000] };
const bands = {
  r1: { 200: [15, 25], 400: [26, 40], 600: [41, 55], 800: [56, 72], 1000: [73, 88] },
  r2: { 400: [30, 45], 800: [46, 58], 1200: [59, 70], 1600: [71, 84], 2000: [85, 97] }
};
const jeopardyResponseRe = /^(What|Who|Where|When)\s+(?:is|are|was|were)\s+.+\?$/u;
const bannedContentRe = /\b(?:undefined|null|[QP]\d{3,}|is the answer|title sought here|this is described as|scientific article|journal article|U\.S\. patent)\b/iu;
const malformedTextRe = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/u;

function answerAppearsInClue(clue, response) {
  const answerKey = normalizeAnswer(response).replace(/\b(?:the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const clueKey = normalizeAnswer(clue).replace(/\b(?:the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!answerKey || !clueKey || (!answerKey.includes(' ') && answerKey.length < 4)) return false;
  const escaped = answerKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(clueKey);
}

function auditManualTopoff() {
  const fileName = 'manual-existing-category-topoff.tsv';
  const lines = fs.readFileSync(path.join(bankDirectory, fileName), 'utf8').split(/\r?\n/);
  const manualAnswers = new Map();
  const manualClues = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const location = `${fileName}:${index + 1}`;
    const parts = rawLine.split('\t');
    if (parts.length !== 6) {
      problems.push(`${location}: expected six fields; found ${parts.length}`);
      continue;
    }
    const [round, category, valueText, difficultyText, clue, response] = parts;
    const value = Number(valueText);
    const difficulty = Number(difficultyText);
    const band = bands[round]?.[value];
    if (!category.trim() || !clue.trim() || !response.trim()) problems.push(`${location}: category, clue, and response are required`);
    if (!values[round]?.includes(value)) problems.push(`${location}: invalid round/value ${round} $${valueText}`);
    if (!band || !Number.isInteger(difficulty) || difficulty < band[0] || difficulty > band[1]) {
      problems.push(`${location}: difficulty ${difficultyText} is outside its value band`);
    }
    if (/^(what|which|who|where|when|why|how)\b/i.test(clue)) problems.push(`${location}: worksheet-style clue opening`);
    if (!jeopardyResponseRe.test(response)) problems.push(`${location}: response lacks Jeopardy phrasing: ${response}`);
    if (bannedContentRe.test(`${clue} ${response}`)) problems.push(`${location}: banned generated wording or identifier`);
    if (malformedTextRe.test(`${clue} ${response}`)) problems.push(`${location}: malformed Unicode or control character`);
    if (answerAppearsInClue(clue, response)) problems.push(`${location}: answer appears in clue: ${response}`);
    const answerKey = normalizeAnswer(response);
    const clueKey = normalizeClue(clue);
    const pairKey = `${clueKey}|${answerKey}`;
    if (historicalProtectedKeys.has(answerKey) && !trackedPairKeys.has(pairKey)) {
      problems.push(`${location}: protected answer is not an exact retained pre-expansion pair: ${response}`);
    }
    if (trackedClueKeys.has(clueKey) && !trackedPairKeys.has(pairKey)) {
      problems.push(`${location}: clue text reuses a pre-expansion clue with a different answer`);
    }
    if (manualAnswers.has(answerKey)) problems.push(`${location}: duplicate manual answer also at ${manualAnswers.get(answerKey)}`);
    if (manualClues.has(clueKey)) problems.push(`${location}: duplicate manual clue also at ${manualClues.get(clueKey)}`);
    manualAnswers.set(answerKey, location);
    manualClues.set(clueKey, location);
  }
}

auditManualTopoff();

for (const fileName of files) {
  const lines = fs.readFileSync(path.join(bankDirectory, fileName), 'utf8').split(/\r?\n/);
  const fileSlots = new Map();
  const fileCategories = new Map();
  let fileRows = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    rowCount += 1;
    fileRows += 1;
    const parts = rawLine.split('\t');
    const location = `${fileName}:${index + 1}`;
    if (parts.length !== 6) {
      problems.push(`${location}: expected six fields; found ${parts.length}`);
      continue;
    }
    const [round, category, valueText, difficultyText, clue, response] = parts;
    const value = Number(valueText);
    const difficulty = Number(difficultyText);
    if (!category.trim()) problems.push(`${location}: category is required`);
    if (!clue.trim() || !response.trim()) problems.push(`${location}: clue and response are required`);
    if (!values[round]?.includes(value)) problems.push(`${location}: invalid round/value ${round} $${valueText}`);
    const band = bands[round]?.[value];
    if (!band || !Number.isInteger(difficulty) || difficulty < band[0] || difficulty > band[1]) {
      problems.push(`${location}: difficulty ${difficultyText} is outside its value band`);
    }
    if (/^(what|which|who|where|when|why|how)\b/i.test(clue)) problems.push(`${location}: worksheet-style clue opening`);
    if (!jeopardyResponseRe.test(response)) problems.push(`${location}: response lacks Jeopardy phrasing: ${response}`);
    if (bannedContentRe.test(`${clue} ${response}`)) problems.push(`${location}: banned generated wording or identifier`);
    if (malformedTextRe.test(`${clue} ${response}`)) problems.push(`${location}: malformed Unicode or control character`);
    if (answerAppearsInClue(clue, response)) problems.push(`${location}: answer appears in clue: ${response}`);
    const slotKey = `${round}\t${category}\t${value}`;
    fileSlots.set(slotKey, (fileSlots.get(slotKey) || 0) + 1);
    const categoryKey = `${round}\t${category}`;
    if (!fileCategories.has(categoryKey)) fileCategories.set(categoryKey, new Set());
    fileCategories.get(categoryKey).add(value);
    const answerKey = normalizeAnswer(response);
    const clueKey = normalizeClue(clue);
    if (protectedKeys.has(answerKey)) problems.push(`${location}: protected answer: ${response}`);
    if (reportNearProtected && !protectedKeys.has(answerKey)) {
      const answerWordCount = answerKey.split(' ').length;
      let nearProtected = null;
      for (let wordCount = Math.max(2, answerWordCount - 1); wordCount <= answerWordCount + 1 && !nearProtected; wordCount += 1) {
        for (const protectedKey of protectedByWordCount.get(wordCount) || []) {
          if (` ${answerKey} `.includes(` ${protectedKey} `) || ` ${protectedKey} `.includes(` ${answerKey} `)) {
            nearProtected = protectedKey;
            break;
          }
        }
      }
      if (nearProtected) nearProtectedCandidates.push({ location, response, protectedAnswerKey: nearProtected });
    }
    if (reservedClueKeys.has(clueKey)) problems.push(`${location}: clue duplicates the manual top-off source`);
    if (answers.has(answerKey)) problems.push(`${location}: duplicate answer also at ${answers.get(answerKey)}: ${response}`);
    if (clues.has(clueKey)) problems.push(`${location}: duplicate clue also at ${clues.get(clueKey)}`);
    answers.set(answerKey, location);
    clues.set(clueKey, location);
    authoredResponses.set(answerKey, { location, response });
    const opening = clueKey.split(' ').slice(0, 6).join(' ');
    if (!clueOpenings.has(opening)) clueOpenings.set(opening, []);
    clueOpenings.get(opening).push({ location, clue });
  }
  if (fileRows !== 400) problems.push(`${fileName}: expected 400 data rows; found ${fileRows}`);
  if (fileSlots.size !== 25) problems.push(`${fileName}: expected 25 category/value slots; found ${fileSlots.size}`);
  if (fileCategories.size !== 5) problems.push(`${fileName}: expected 5 categories; found ${fileCategories.size}`);
  for (const [categoryKey, presentValues] of fileCategories) {
    if (authoredCategories.has(categoryKey)) {
      problems.push(`${fileName}: ${categoryKey} is also authored in ${authoredCategories.get(categoryKey)}`);
    } else {
      authoredCategories.set(categoryKey, fileName);
    }
    const [round] = categoryKey.split('\t');
    const missing = (values[round] || []).filter((value) => !presentValues.has(value));
    if (missing.length) problems.push(`${fileName}: ${categoryKey} is missing values ${missing.join(', ')}`);
  }
  for (const [slotKey, count] of fileSlots) {
    if (count !== 16) problems.push(`${fileName}: ${slotKey} needs 16 rows; found ${count}`);
  }
}

const nearAuthoredCandidates = [];
const repeatedClueOpenings = [];
if (reportNearProtected) {
  const authoredByWordCount = new Map();
  for (const [key, details] of authoredResponses) {
    const wordCount = key.split(' ').length;
    if (!authoredByWordCount.has(wordCount)) authoredByWordCount.set(wordCount, []);
    authoredByWordCount.get(wordCount).push({ key, ...details });
  }
  for (const [longKey, longDetails] of authoredResponses) {
    const longWordCount = longKey.split(' ').length;
    if (longWordCount < 2) continue;
    for (const short of authoredByWordCount.get(longWordCount - 1) || []) {
      if (short.key.length < 7 || !` ${longKey} `.includes(` ${short.key} `)) continue;
      nearAuthoredCandidates.push({
        location: longDetails.location,
        response: longDetails.response,
        relatedLocation: short.location,
        relatedResponse: short.response
      });
    }
  }
  for (const [opening, entries] of clueOpenings) {
    if (opening.split(' ').length === 6 && entries.length > 1) {
      repeatedClueOpenings.push({ opening, entries });
    }
  }
}

console.log(JSON.stringify({
  files: files.length,
  rows: rowCount,
  authoredCategories: authoredCategories.size,
  uniqueAnswers: answers.size,
  uniqueClues: clues.size,
  ...(reportNearProtected ? { nearProtectedCandidates, nearAuthoredCandidates, repeatedClueOpenings } : {}),
  problems
}, null, 2));
if (problems.length) process.exitCode = 1;
