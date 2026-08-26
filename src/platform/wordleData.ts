import rawAnswerPool from "./data/wordle/answer-pool.json";
import rawAllowedGuesses from "./data/wordle/allowed-guesses.json";

type WordDifficultyBucket = "easy" | "medium" | "spicy";

interface WordleAnswerMeta {
  word: string;
  bucket: WordDifficultyBucket;
  difficultyScore: number;
}

const WORDLE_RECENT_ANSWER_KEY = "quizarena_wordle_recent_answers_v2";
const WORDLE_RECENT_ANSWER_LIMIT = 28;

const BUCKET_WEIGHTS: Record<WordDifficultyBucket, number> = {
  easy: 0.48,
  medium: 0.38,
  spicy: 0.14
};

function normalizeWord(word: string) {
  return word.trim().toLowerCase();
}

function isPlayableFiveLetterWord(word: string) {
  return /^[a-z]{5}$/.test(word);
}

function sanitizeWordList(source: string[]) {
  return Array.from(
    new Set(
      source
        .map(normalizeWord)
        .filter((word) => isPlayableFiveLetterWord(word))
    )
  ).sort();
}

function scoreDifficulty(word: string) {
  let score = 0;

  const uniqueLetters = new Set(word).size;
  if (uniqueLetters >= 5) score += 0.8;
  if (uniqueLetters <= 3) score += 0.45;

  const rareCount = (word.match(/[jqxz]/g) ?? []).length;
  score += rareCount * 0.95;

  if (/(.)\1/.test(word)) {
    score += 0.35;
  }

  if (/[^aeiou]{4}/.test(word)) {
    score += 0.35;
  }

  return score;
}

function bucketForDifficulty(score: number): WordDifficultyBucket {
  if (score <= 0.75) return "easy";
  if (score <= 1.7) return "medium";
  return "spicy";
}

function letterSimilarityRatio(left: string, right: string) {
  const leftSet = new Set(left.split(""));
  const rightSet = new Set(right.split(""));
  const overlap = Array.from(leftSet).filter((char) => rightSet.has(char)).length;
  return overlap / Math.max(leftSet.size, rightSet.size, 1);
}

function noveltyWeight(word: string, recentAnswers: string[]) {
  if (!recentAnswers.length) return 1;

  const recentWindow = recentAnswers.slice(-8);
  const maxSimilarity = recentWindow.reduce((max, recentWord) => {
    return Math.max(max, letterSimilarityRatio(word, recentWord));
  }, 0);

  const samePrefixCount = recentWindow.filter((recentWord) => recentWord[0] === word[0]).length;
  const sameSuffixCount = recentWindow.filter((recentWord) => recentWord.slice(3) === word.slice(3)).length;

  const penalty = maxSimilarity * 0.6 + samePrefixCount * 0.09 + sameSuffixCount * 0.12;
  return Math.max(0.08, 1 - penalty);
}

function weightedPick<T>(candidates: Array<{ value: T; weight: number }>) {
  const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return candidates[0]?.value;

  let cursor = Math.random() * totalWeight;
  for (const candidate of candidates) {
    cursor -= candidate.weight;
    if (cursor <= 0) {
      return candidate.value;
    }
  }

  return candidates[candidates.length - 1]?.value;
}

function readRecentAnswers() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const raw = window.localStorage.getItem(WORDLE_RECENT_ANSWER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => normalizeWord(String(value))).filter(isPlayableFiveLetterWord);
  } catch {
    return [];
  }
}

function writeRecentAnswers(nextAnswers: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORDLE_RECENT_ANSWER_KEY, JSON.stringify(nextAnswers));
  } catch {
    // Ignore storage issues so gameplay stays local-first.
  }
}

function rememberAnswer(word: string) {
  const current = readRecentAnswers().filter((item) => item !== word);
  const next = [...current, word].slice(-WORDLE_RECENT_ANSWER_LIMIT);
  writeRecentAnswers(next);
}

const broadGuessPool = sanitizeWordList(rawAllowedGuesses);
const curatedAnswerPool = sanitizeWordList(rawAnswerPool);

export const WORDLE_ALLOWED_GUESSES = new Set(broadGuessPool);
export const WORDLE_ANSWER_POOL = curatedAnswerPool.filter((word) => WORDLE_ALLOWED_GUESSES.has(word));

const WORDLE_ANSWER_META: WordleAnswerMeta[] = WORDLE_ANSWER_POOL.map((word) => {
  const difficultyScore = scoreDifficulty(word);
  return {
    word,
    difficultyScore,
    bucket: bucketForDifficulty(difficultyScore)
  };
});

export function pickWordleAnswer(previousAnswer?: string) {
  const normalizedPrevious = previousAnswer ? normalizeWord(previousAnswer) : undefined;
  const recentAnswers = readRecentAnswers();
  const avoidSet = new Set(recentAnswers.slice(-16));
  if (normalizedPrevious) {
    avoidSet.add(normalizedPrevious);
  }

  let candidateMeta = WORDLE_ANSWER_META.filter((meta) => !avoidSet.has(meta.word));

  if (candidateMeta.length < 100) {
    candidateMeta = WORDLE_ANSWER_META.filter((meta) => meta.word !== normalizedPrevious);
  }

  if (!candidateMeta.length) {
    return WORDLE_ANSWER_POOL[0];
  }

  const bucketOptions = (Object.keys(BUCKET_WEIGHTS) as WordDifficultyBucket[])
    .map((bucket) => {
      const pool = candidateMeta.filter((meta) => meta.bucket === bucket);
      return {
        bucket,
        pool,
        weight: pool.length ? BUCKET_WEIGHTS[bucket] : 0
      };
    })
    .filter((entry) => entry.weight > 0);

  const chosenBucket = weightedPick(bucketOptions.map((entry) => ({ value: entry, weight: entry.weight })));
  const bucketPool = chosenBucket?.pool?.length ? chosenBucket.pool : candidateMeta;

  const weightedCandidates = bucketPool.map((meta) => {
    const novelty = noveltyWeight(meta.word, recentAnswers);
    const difficultyBias = meta.bucket === "medium" ? 1.08 : meta.bucket === "easy" ? 1 : 0.95;
    return {
      value: meta.word,
      weight: Math.max(0.02, novelty * difficultyBias)
    };
  });

  const selected = weightedPick(weightedCandidates) ?? bucketPool[0].word;
  rememberAnswer(selected);
  return selected;
}
