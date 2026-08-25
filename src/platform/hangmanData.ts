import { HANGMAN_PHRASE_BANK } from "./data/hangmanPhraseBank";
import { HANGMAN_WORD_BANK } from "./data/hangmanWordBank";
import type { HangmanEntry } from "./types";

type HangmanMode = HangmanEntry["mode"];
type Difficulty = NonNullable<HangmanEntry["difficulty"]>;

interface PreparedHangmanEntry extends HangmanEntry {
  difficulty: Difficulty;
  difficultyScore: number;
  categoryKey: string;
}

const MAX_RECENT_ANSWERS_PER_MODE = 18;

const DIFFICULTY_WEIGHTS: Record<
  HangmanMode,
  Record<Difficulty, number>
> = {
  word: {
    easy: 0.14,
    medium: 0.56,
    hard: 0.3
  },
  phrase: {
    easy: 0.1,
    medium: 0.55,
    hard: 0.35
  }
};

const recentAnswersByMode: Record<HangmanMode, string[]> = {
  word: [],
  phrase: []
};

const recentCategoriesByMode: Record<HangmanMode, string[]> = {
  word: [],
  phrase: []
};

function normalizeAnswer(answer: string) {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}

function sanitizeHint(hint: string) {
  return hint.trim().replace(/\s+/g, " ");
}

function sanitizeCategory(category: string) {
  const cleaned = category.trim().replace(/\s+/g, " ");
  return cleaned || "General";
}

function isValidAnswer(answer: string, mode: HangmanMode) {
  if (!/^[a-z ]+$/.test(answer)) return false;

  if (mode === "word") {
    if (answer.includes(" ")) return false;
    return answer.length >= 5 && answer.length <= 14;
  }

  const words = answer.split(" ").filter(Boolean).length;
  return words >= 2 && words <= 8 && answer.length >= 9 && answer.length <= 56;
}

function scoreDifficulty(answer: string, mode: HangmanMode) {
  const lettersOnly = answer.replace(/ /g, "");
  const length = lettersOnly.length;
  const uniqueLetters = new Set(lettersOnly).size;
  const rareLetters = (lettersOnly.match(/[jqxzvk]/g) ?? []).length;

  let score = 0;
  score += Math.max(0, (length - 6) * 0.16);
  score += rareLetters * 0.42;

  if (uniqueLetters >= 9) {
    score += 0.35;
  }

  if (/(.)\1\1/.test(lettersOnly)) {
    score -= 0.2;
  }

  if (mode === "phrase") {
    const words = answer.split(" ").length;
    score += Math.max(0, words - 2) * 0.24;
    if (lettersOnly.length > 22) {
      score += 0.28;
    }
  }

  return score;
}

function difficultyFromScore(score: number): Difficulty {
  if (score <= 1.05) return "easy";
  if (score <= 2.15) return "medium";
  return "hard";
}

function sanitizeEntry(entry: HangmanEntry): PreparedHangmanEntry | null {
  const answer = normalizeAnswer(entry.answer);
  const mode = entry.mode;
  if (!isValidAnswer(answer, mode)) return null;

  const hint = sanitizeHint(entry.hint);
  if (!hint) return null;

  const category = sanitizeCategory(entry.category);
  const difficultyScore = scoreDifficulty(answer, mode);
  const difficulty = entry.difficulty ?? difficultyFromScore(difficultyScore);

  return {
    answer,
    hint,
    category,
    mode,
    difficulty,
    tags: entry.tags,
    difficultyScore,
    categoryKey: category.toLowerCase()
  };
}

function buildPreparedPool() {
  const deduped = new Map<string, PreparedHangmanEntry>();
  const source = [...HANGMAN_WORD_BANK, ...HANGMAN_PHRASE_BANK];

  source.forEach((entry) => {
    const normalized = sanitizeEntry(entry);
    if (!normalized) return;
    const key = `${normalized.mode}:${normalized.answer}`;
    if (!deduped.has(key)) {
      deduped.set(key, normalized);
    }
  });

  return Array.from(deduped.values());
}

const PREPARED_POOL = buildPreparedPool();
const PREPARED_BY_MODE: Record<HangmanMode, PreparedHangmanEntry[]> = {
  word: PREPARED_POOL.filter((entry) => entry.mode === "word"),
  phrase: PREPARED_POOL.filter((entry) => entry.mode === "phrase")
};

export const HANGMAN_POOL: HangmanEntry[] = PREPARED_POOL.map(({ difficultyScore, categoryKey, ...entry }) => entry);

function letterSimilarityRatio(left: string, right: string) {
  const leftLetters = new Set(left.replace(/ /g, "").split(""));
  const rightLetters = new Set(right.replace(/ /g, "").split(""));
  const overlap = Array.from(leftLetters).filter((letter) => rightLetters.has(letter)).length;
  return overlap / Math.max(leftLetters.size, rightLetters.size, 1);
}

function noveltyWeight(candidate: PreparedHangmanEntry, recentAnswers: string[]) {
  if (!recentAnswers.length) return 1;

  const recentWindow = recentAnswers.slice(-8);
  const maxSimilarity = recentWindow.reduce((max, answer) => {
    return Math.max(max, letterSimilarityRatio(candidate.answer, answer));
  }, 0);

  const lengthPenalty = recentWindow.filter((answer) => answer.length === candidate.answer.length).length * 0.06;
  const scorePenalty = Math.max(0, candidate.difficultyScore - 3) * 0.04;

  return Math.max(0.08, 1 - maxSimilarity * 0.58 - lengthPenalty - scorePenalty);
}

function weightedPick<T>(candidates: Array<{ value: T; weight: number }>) {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (total <= 0) return candidates[0]?.value;

  let cursor = Math.random() * total;
  for (const candidate of candidates) {
    cursor -= candidate.weight;
    if (cursor <= 0) {
      return candidate.value;
    }
  }

  return candidates[candidates.length - 1]?.value;
}

function rememberPick(mode: HangmanMode, answer: string, categoryKey: string) {
  const nextAnswers = [...recentAnswersByMode[mode].filter((item) => item !== answer), answer].slice(
    -MAX_RECENT_ANSWERS_PER_MODE
  );
  recentAnswersByMode[mode] = nextAnswers;

  const nextCategories = [...recentCategoriesByMode[mode], categoryKey].slice(-8);
  recentCategoriesByMode[mode] = nextCategories;
}

export function chooseHangmanEntry(mode: HangmanMode, previousAnswer?: string): HangmanEntry {
  const sourcePool = PREPARED_BY_MODE[mode];
  if (!sourcePool.length) {
    throw new Error(`No Hangman entries available for mode: ${mode}`);
  }

  const normalizedPrevious = previousAnswer ? normalizeAnswer(previousAnswer) : undefined;
  const recentAnswers = recentAnswersByMode[mode];
  const recentCategories = recentCategoriesByMode[mode];
  const avoidSet = new Set(recentAnswers.slice(-MAX_RECENT_ANSWERS_PER_MODE));
  if (normalizedPrevious) {
    avoidSet.add(normalizedPrevious);
  }

  let candidates = sourcePool.filter((entry) => !avoidSet.has(entry.answer));
  if (candidates.length < Math.min(16, Math.floor(sourcePool.length * 0.3))) {
    candidates = sourcePool.filter((entry) => entry.answer !== normalizedPrevious);
  }
  if (!candidates.length) {
    candidates = sourcePool;
  }

  const recentCategorySet = new Set(recentCategories.slice(-2));

  const weightedCandidates = candidates.map((entry) => {
    const categoryPenalty = recentCategorySet.has(entry.categoryKey) ? 0.6 : 1;
    const difficultyWeight = DIFFICULTY_WEIGHTS[mode][entry.difficulty];
    const novelty = noveltyWeight(entry, recentAnswers);
    const wordCount = entry.answer.split(" ").length;
    const structurePenalty = mode === "phrase" && wordCount > 5 ? 0.86 : 1;
    const weight = Math.max(0.02, difficultyWeight * categoryPenalty * novelty * structurePenalty);

    return {
      value: entry,
      weight
    };
  });

  const selected = weightedPick(weightedCandidates) ?? candidates[0];
  rememberPick(mode, selected.answer, selected.categoryKey);

  const { difficultyScore, categoryKey, ...result } = selected;
  return result;
}

export const SOCRATES_CORRECT_LINES = [
  "Consistency is the key to success.",
  "A disciplined mind turns small gains into victory.",
  "Reason rewards the patient guesser.",
  "You move closer to truth by steady steps.",
  "Wisdom often arrives one letter at a time.",
  "Good habits make hard puzzles yield.",
  "A calm thinker hears the answer before the crowd does."
];

export const SOCRATES_WIN_LINES = [
  "You have freed me with judgment rather than luck.",
  "Well done. Thought, when practiced, becomes power.",
  "Victory belongs to the patient and the observant.",
  "You chose reason, and reason answered."
];

export const QUIZZLER_INCORRECT_LINES = [
  "If the source of your power is Lauder, then what are you without him?",
  "An ambitious guess. The portal remains unconvinced.",
  "Close enough for drama, perhaps. Not close enough for me.",
  "The chamber dimmed for that one.",
  "A bold swing. The magic liked the style more than the result.",
  "The wrong rune, and the room remembers it.",
  "Not every spark becomes a star, challenger."
];

export const QUIZZLER_LOSS_LINES = [
  "The stage keeps its prisoner, and the silence keeps your secret.",
  "A beautiful effort, but the chamber was harsher than kind.",
  "So near to mastery, and still the riddle slips away.",
  "The portal closes with one last laugh."
];
