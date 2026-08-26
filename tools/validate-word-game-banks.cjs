#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const WORDLE_GUESSES_PATH = path.join(ROOT, "src", "platform", "data", "wordle", "allowed-guesses.json");
const WORDLE_ANSWERS_PATH = path.join(ROOT, "src", "platform", "data", "wordle", "answer-pool.json");
const HANGMAN_WORDS_PATH = path.join(ROOT, "src", "platform", "data", "hangmanWordBank.ts");
const HANGMAN_PHRASES_PATH = path.join(ROOT, "src", "platform", "data", "hangmanPhraseBank.ts");
const PROFANITY_PATH = path.join(ROOT, "node_modules", "naughty-words", "en.json");

const BASELINE_COUNTS = {
  wordleGuesses: 12972,
  wordleAnswers: 2315,
  hangmanWords: 23,
  hangmanPhrases: 21
};

function normalizeToken(token) {
  return token.trim().toLowerCase();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseTsEntries(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const matches = [
    ...text.matchAll(
      /\{\s*answer:\s*"([^"]+)"\s*,\s*hint:\s*"([^"]+)"\s*,\s*category:\s*"([^"]+)"\s*,\s*mode:\s*"(word|phrase)"(?:\s*,\s*difficulty:\s*"(easy|medium|hard)")?/g
    )
  ];

  return matches.map((match) => ({
    answer: match[1],
    hint: match[2],
    category: match[3],
    mode: match[4],
    difficulty: match[5] || ""
  }));
}

function isOffensive(value, blockedWords) {
  const tokens = normalizeToken(value).split(/\s+/).filter(Boolean);
  return tokens.some((token) => blockedWords.has(token));
}

function validateWordle() {
  const guesses = JSON.parse(fs.readFileSync(WORDLE_GUESSES_PATH, "utf8"));
  const answers = JSON.parse(fs.readFileSync(WORDLE_ANSWERS_PATH, "utf8"));
  const blockedWords = new Set(JSON.parse(fs.readFileSync(PROFANITY_PATH, "utf8")).map(normalizeToken));

  assert(Array.isArray(guesses), "Wordle guesses file is not an array");
  assert(Array.isArray(answers), "Wordle answers file is not an array");

  const guessSet = new Set();
  guesses.forEach((word) => {
    assert(/^[a-z]{5}$/.test(word), `Invalid guess token: ${word}`);
    assert(!blockedWords.has(word), `Offensive token found in guesses: ${word}`);
    guessSet.add(word);
  });

  assert(guessSet.size === guesses.length, "Wordle guesses contain duplicates");

  const answerSet = new Set();
  answers.forEach((word) => {
    assert(/^[a-z]{5}$/.test(word), `Invalid answer token: ${word}`);
    assert(!blockedWords.has(word), `Offensive token found in answers: ${word}`);
    assert(guessSet.has(word), `Answer not present in guess set: ${word}`);
    answerSet.add(word);
  });

  assert(answerSet.size === answers.length, "Wordle answers contain duplicates");

  return {
    guesses: guesses.length,
    answers: answers.length,
    guessGrowth: guesses.length - BASELINE_COUNTS.wordleGuesses,
    answerGrowth: answers.length - BASELINE_COUNTS.wordleAnswers
  };
}

function validateHangman() {
  const blockedWords = new Set(JSON.parse(fs.readFileSync(PROFANITY_PATH, "utf8")).map(normalizeToken));
  const wordEntries = parseTsEntries(HANGMAN_WORDS_PATH);
  const phraseEntries = parseTsEntries(HANGMAN_PHRASES_PATH);
  const allEntries = [...wordEntries, ...phraseEntries];

  assert(wordEntries.length > 0, "No Hangman word entries parsed");
  assert(phraseEntries.length > 0, "No Hangman phrase entries parsed");

  const dedupe = new Set();
  allEntries.forEach((entry) => {
    const answer = normalizeToken(entry.answer);
    const key = `${entry.mode}:${answer}`;

    assert(!dedupe.has(key), `Duplicate Hangman entry: ${key}`);
    dedupe.add(key);

    assert(/^[a-z ]+$/.test(answer), `Malformed Hangman answer: ${answer}`);
    assert(entry.hint.trim().length >= 8, `Hint too short for ${answer}`);
    assert(entry.category.trim().length >= 3, `Category too short for ${answer}`);

    if (entry.mode === "word") {
      assert(!answer.includes(" "), `Word-mode answer contains spaces: ${answer}`);
      assert(answer.length >= 5 && answer.length <= 14, `Word-mode answer length out of bounds: ${answer}`);
    }

    if (entry.mode === "phrase") {
      const words = answer.split(/\s+/).filter(Boolean).length;
      assert(words >= 2 && words <= 8, `Phrase-mode answer word-count out of bounds: ${answer}`);
      assert(answer.length >= 9 && answer.length <= 56, `Phrase-mode answer length out of bounds: ${answer}`);
    }

    assert(!isOffensive(answer, blockedWords), `Offensive Hangman answer detected: ${answer}`);
  });

  return {
    words: wordEntries.length,
    phrases: phraseEntries.length,
    wordGrowth: wordEntries.length - BASELINE_COUNTS.hangmanWords,
    phraseGrowth: phraseEntries.length - BASELINE_COUNTS.hangmanPhrases
  };
}

function main() {
  const wordle = validateWordle();
  const hangman = validateHangman();

  console.log("Wordle guess pool:", wordle.guesses, `(growth ${wordle.guessGrowth >= 0 ? "+" : ""}${wordle.guessGrowth})`);
  console.log("Wordle answer pool:", wordle.answers, `(growth ${wordle.answerGrowth >= 0 ? "+" : ""}${wordle.answerGrowth})`);
  console.log("Hangman word bank:", hangman.words, `(growth ${hangman.wordGrowth >= 0 ? "+" : ""}${hangman.wordGrowth})`);
  console.log("Hangman phrase bank:", hangman.phrases, `(growth ${hangman.phraseGrowth >= 0 ? "+" : ""}${hangman.phraseGrowth})`);
  console.log("Validation: OK");
}

try {
  main();
} catch (error) {
  console.error("Validation failed:", error.message);
  process.exit(1);
}
