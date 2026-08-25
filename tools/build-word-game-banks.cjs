#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const randomWords = require("random-words");
const wordListPath = require("word-list").default;

const ROOT = path.resolve(__dirname, "..");
const COMMON_WORD_LIST_PATH = path.join(ROOT, "data", "word-lists", "google-10000-english-no-swears.txt");
const WORDS_ALPHA_PATH = path.join(ROOT, "data", "word-lists", "words_alpha.txt");
const PROFANITY_LIST_PATH = path.join(ROOT, "node_modules", "naughty-words", "en.json");
const ARRAY_WORDS_PATH = path.join(ROOT, "node_modules", "an-array-of-english-words", "index.json");
const WORDLE_WORDS_PATH = path.join(ROOT, "node_modules", "wordle-words", "index.mjs");

const OUTPUT_DIR = path.join(ROOT, "src", "platform", "data", "wordle");
const OUTPUT_GUESSES = path.join(OUTPUT_DIR, "allowed-guesses.json");
const OUTPUT_ANSWERS = path.join(OUTPUT_DIR, "answer-pool.json");
const OUTPUT_REPORT = path.join(OUTPUT_DIR, "build-report.json");

const MANUAL_ANSWER_BOOSTS = [
  "adore", "aisle", "angel", "ankle", "aptly", "aroma", "badge", "bagel", "basil", "beach",
  "belly", "berry", "bingo", "bison", "blaze", "bloom", "board", "briar", "brisk", "broad",
  "broth", "bunny", "cabin", "cacao", "candy", "cargo", "carol", "charm", "chess", "chime",
  "choir", "cider", "civic", "clasp", "clean", "clerk", "cliff", "climb", "clink", "cloud",
  "clove", "coral", "couch", "crisp", "crown", "daily", "dairy", "dance", "dandy", "deter",
  "dodge", "dough", "draft", "dream", "dress", "drift", "drill", "droid", "easel", "elbow",
  "elite", "ember", "enjoy", "epoch", "ether", "fable", "faith", "favor", "feast", "fence",
  "ferry", "fiber", "flair", "flame", "flock", "flora", "flute", "focal", "forge", "fresh",
  "frost", "gamer", "giant", "glade", "gleam", "glide", "gloom", "glory", "grace", "grain",
  "grand", "grape", "grasp", "grove", "habit", "haunt", "heart", "honey", "hound", "hover",
  "hurry", "ideal", "ivory", "jelly", "jolly", "joyful", "knack", "kneel", "label", "latch",
  "laugh", "layer", "lemon", "lobby", "lunar", "lyric", "macro", "magic", "maple", "medal",
  "mercy", "merry", "meter", "micro", "mirth", "modal", "moral", "motel", "motor", "mound",
  "movie", "music", "naive", "noble", "nylon", "ocean", "olive", "orbit", "outer", "overt",
  "paint", "panel", "pearl", "petal", "phone", "piano", "pilot", "pixel", "plaza", "plush",
  "poise", "polar", "porch", "pouch", "power", "pride", "prime", "prism", "proof", "pupil",
  "purse", "queen", "quest", "quiet", "radar", "rally", "raven", "reign", "relay", "reset",
  "rider", "ridge", "rival", "robot", "rough", "round", "route", "royal", "rugby", "ruler",
  "salad", "sauce", "scale", "scout", "sense", "serum", "shade", "shine", "shore", "siren",
  "skate", "skill", "slate", "slope", "smart", "smile", "snack", "solar", "spice", "spire",
  "spray", "squad", "stage", "stair", "stark", "steam", "stone", "straw", "style", "sugar",
  "sunny", "swirl", "swoop", "table", "taste", "tempo", "thank", "thorn", "tidal", "toast",
  "token", "torch", "tower", "track", "trail", "treat", "trend", "tribe", "trick", "trout",
  "truly", "trunk", "trust", "ultra", "unity", "urban", "vapor", "vault", "velvet", "vigor",
  "vinyl", "vital", "vivid", "vocal", "wagon", "weave", "whale", "wheat", "whirl", "widen",
  "wiser", "witty", "woven", "yacht", "yearn", "yield", "zesty"
];

const ANSWER_DENYLIST = new Set([
  "adsl", "ascii", "blvd", "codec", "debug", "dnses", "drmxx", "ebayx", "gifty", "htmls",
  "httpx", "https", "isbnx", "jpegx", "linux", "modem", "mp3xx", "nvidia", "proxy", "sqlxx",
  "tcpip", "usbxx", "vpnxx", "xhtml"
]);

function readLines(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeToken(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase()
    .trim();
}

function isFiveLetterWord(value) {
  return /^[a-z]{5}$/.test(value);
}

function hasVowelProfile(value) {
  return /[aeiou]/.test(value) || /y/.test(value);
}

function buildCommonWordRank(commonWords) {
  const rank = new Map();
  commonWords.forEach((word, index) => {
    if (!rank.has(word)) {
      rank.set(word, index + 1);
    }
  });
  return rank;
}

function scoreAnswerCandidate(word, context) {
  let score = 0;
  if (context.originalAnswerSet.has(word)) score += 10;
  if (context.randomWordSet.has(word)) score += 4;

  const rank = context.commonRank.get(word);
  if (rank !== undefined) {
    if (rank <= 1000) score += 6;
    else if (rank <= 3000) score += 5;
    else if (rank <= 6000) score += 3;
    else if (rank <= 9000) score += 1;
  }

  if (/[jqxz]/.test(word) && !context.originalAnswerSet.has(word)) {
    score -= 1;
  }

  if (/(.)\1\1/.test(word)) {
    score -= 2;
  }

  return score;
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function loadWordleModule() {
  const href = pathToFileURL(WORDLE_WORDS_PATH).href;
  return import(href);
}

async function main() {
  const wordle = await loadWordleModule();

  const sourceWordleAll = wordle.all ?? [];
  const sourceWordleAnswers = wordle.answers ?? [];
  const sourceArrayWords = JSON.parse(fs.readFileSync(ARRAY_WORDS_PATH, "utf8"));
  const sourceWordList = readLines(wordListPath);
  const sourceWordsAlpha = readLines(WORDS_ALPHA_PATH);
  const sourceCommonWords = readLines(COMMON_WORD_LIST_PATH);
  const sourceRandomWords = Array.isArray(randomWords.wordList) ? randomWords.wordList : [];
  const profanityWords = JSON.parse(fs.readFileSync(PROFANITY_LIST_PATH, "utf8"));

  const blockedWordSet = new Set(
    profanityWords
      .map(normalizeToken)
      .filter((word) => word.length >= 3 && word.length <= 15 && /^[a-z]+$/.test(word))
  );

  const guessPoolSet = new Set();
  const trackSource = {
    wordleAllAdded: 0,
    fromArrayAdded: 0,
    fromWordListAdded: 0,
    fromWordsAlphaAdded: 0,
    fromCommonAdded: 0,
    fromRandomAdded: 0
  };

  const originalWordleAllSet = new Set(
    sourceWordleAll
      .map(normalizeToken)
      .filter((word) => isFiveLetterWord(word) && !blockedWordSet.has(word))
  );

  const commonFiveSet = new Set(
    sourceCommonWords.map(normalizeToken).filter((word) => isFiveLetterWord(word) && !blockedWordSet.has(word))
  );

  const randomFiveSet = new Set(
    sourceRandomWords.map(normalizeToken).filter((word) => isFiveLetterWord(word) && !blockedWordSet.has(word))
  );

  const addGuessWord = (rawWord, source) => {
    const word = normalizeToken(rawWord);
    if (!isFiveLetterWord(word)) return;
    if (!hasVowelProfile(word)) return;
    if (blockedWordSet.has(word)) return;

    // Allow broad acceptance, but keep obvious junk out by requiring either
    // known Wordle provenance or presence in at least one cleaner source.
    const inTrustedSource =
      originalWordleAllSet.has(word) || commonFiveSet.has(word) || randomFiveSet.has(word);

    if (!inTrustedSource && source !== "array" && source !== "word-list" && source !== "words-alpha") {
      return;
    }

    if (!guessPoolSet.has(word)) {
      guessPoolSet.add(word);
      if (source === "wordle-all") trackSource.wordleAllAdded += 1;
      if (source === "array") trackSource.fromArrayAdded += 1;
      if (source === "word-list") trackSource.fromWordListAdded += 1;
      if (source === "words-alpha") trackSource.fromWordsAlphaAdded += 1;
      if (source === "common") trackSource.fromCommonAdded += 1;
      if (source === "random") trackSource.fromRandomAdded += 1;
    }
  };

  sourceWordleAll.forEach((word) => addGuessWord(word, "wordle-all"));
  sourceArrayWords.forEach((word) => addGuessWord(word, "array"));
  sourceWordList.forEach((word) => addGuessWord(word, "word-list"));
  sourceWordsAlpha.forEach((word) => addGuessWord(word, "words-alpha"));
  sourceCommonWords.forEach((word) => addGuessWord(word, "common"));
  sourceRandomWords.forEach((word) => addGuessWord(word, "random"));

  const guessPool = Array.from(guessPoolSet).sort();

  const originalAnswerSet = new Set(
    sourceWordleAnswers
      .map(normalizeToken)
      .filter((word) => isFiveLetterWord(word) && !blockedWordSet.has(word))
  );

  const commonRank = buildCommonWordRank(sourceCommonWords.map(normalizeToken).filter(isFiveLetterWord));

  const answerContext = {
    originalAnswerSet,
    randomWordSet: randomFiveSet,
    commonRank
  };

  const answerPoolSet = new Set(originalAnswerSet);

  const answerCandidates = new Set([
    ...commonFiveSet,
    ...randomFiveSet,
    ...MANUAL_ANSWER_BOOSTS.map(normalizeToken)
  ]);

  answerCandidates.forEach((word) => {
    if (!guessPoolSet.has(word)) return;
    if (blockedWordSet.has(word)) return;
    if (ANSWER_DENYLIST.has(word)) return;
    if (!/[aeiou]/.test(word)) return;

    const isPluralLike = word.endsWith("s") && !originalAnswerSet.has(word);
    if (isPluralLike) return;

    const score = scoreAnswerCandidate(word, answerContext);
    if (score < 4) return;

    answerPoolSet.add(word);
  });

  const answerPool = Array.from(answerPoolSet)
    .filter((word) => guessPoolSet.has(word))
    .sort();

  ensureDirectory(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_GUESSES, `${JSON.stringify(guessPool, null, 2)}\n`);
  fs.writeFileSync(OUTPUT_ANSWERS, `${JSON.stringify(answerPool, null, 2)}\n`);

  const report = {
    generatedAt: new Date().toISOString(),
    sourceCounts: {
      wordleAll: sourceWordleAll.length,
      wordleAnswers: sourceWordleAnswers.length,
      arrayWords: sourceArrayWords.length,
      wordList: sourceWordList.length,
      wordsAlpha: sourceWordsAlpha.length,
      randomWords: sourceRandomWords.length,
      commonWords: sourceCommonWords.length,
      profanityWords: blockedWordSet.size
    },
    outputCounts: {
      guessPool: guessPool.length,
      answerPool: answerPool.length,
      originalAnswerRetained: Array.from(originalAnswerSet).filter((word) => answerPoolSet.has(word)).length
    },
    additions: {
      addedAnswersBeyondOriginal: answerPool.length - originalAnswerSet.size,
      guessWordsBeyondWordleAll: guessPool.length - originalWordleAllSet.size
    }
  };

  fs.writeFileSync(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Built Wordle guess pool: ${guessPool.length}`);
  console.log(`Built Wordle answer pool: ${answerPool.length}`);
  console.log(`Guess additions beyond base Wordle list: ${report.additions.guessWordsBeyondWordleAll}`);
  console.log(`Answer additions beyond base Wordle answers: ${report.additions.addedAnswersBeyondOriginal}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
