export type ModeStatus = "playable" | "planned";
export type DifficultyMode = "tv" | "tv-lite";
export type RoundType = "r1" | "r2" | "final";
export type MacroFamily =
  | "stem"
  | "history_civics"
  | "geography"
  | "literature_language"
  | "arts_music"
  | "sports"
  | "mythology_ancient"
  | "film_television"
  | "general";

export interface AssetDescriptor {
  id: string;
  path?: string;
  alt: string;
  fallbackClassName: string;
}

export interface AssetManifest {
  backgrounds: Record<string, AssetDescriptor>;
  quizzlerPoses: Record<string, AssetDescriptor>;
}

export interface ModeDefinition {
  id: string;
  title: string;
  subtitle: string;
  route?: string;
  status: ModeStatus;
  accent: string;
  description: string;
  shortLabel?: string;
}

export interface WordleStats {
  gamesPlayed: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  guessDistribution: number[];
}

export interface HangmanEntry {
  answer: string;
  hint: string;
  category: string;
  mode: "word" | "phrase";
  difficulty?: "easy" | "medium" | "hard";
  tags?: string[];
}

export interface ClueRecord {
  id: string;
  categorySetId: string;
  sourceCategoryId: string;
  sourceTitle: string;
  family: MacroFamily;
  categoryTitle: string;
  roundType: Exclude<RoundType, "final">;
  value: number;
  clue: string;
  canonicalResponse: string;
  acceptedResponses: string[];
  difficulty: number;
  answerKey: string;
  fingerprint: string;
  nearFingerprint: string;
  tags: string[];
}

export interface QuestionPack {
  id: string;
  packId: string;
  sourceCategoryId: string;
  sourceTitle: string;
  family: MacroFamily;
  title: string;
  displayTitle: string;
  roundSupport: Exclude<RoundType, "final">[];
  roundType: Exclude<RoundType, "final">;
  tags: string[];
  computeWeight: number;
  valueSlots: Array<{
    value: number;
    candidateIds: string[];
  }>;
}

export interface FinalClue {
  id: string;
  family: MacroFamily;
  categoryTitle: string;
  clue: string;
  canonicalResponse: string;
  acceptedResponses: string[];
  difficulty: number;
  tags: string[];
  fingerprint: string;
  nearFingerprint: string;
  answerKey: string;
}

export interface BoardClue {
  id: string;
  value: number;
  clue: string;
  canonicalResponse: string;
  acceptedResponses: string[];
  answerKey: string;
  fingerprint: string;
  difficulty: number;
  used: boolean;
  dd: boolean;
}

export interface BoardCategory {
  setId: string;
  sourceCategoryId: string;
  family: MacroFamily;
  title: string;
  tags: string[];
  clues: BoardClue[];
}

export interface BoardBlueprint {
  roundType: Exclude<RoundType, "final">;
  boardHash: string;
  categories: BoardCategory[];
}

export interface FinalChoice extends FinalClue {
  cat: string;
  q: string;
  a: string;
}

export interface SavedGameState {
  version: string;
  seed: number;
  difficultyMode: DifficultyMode;
  roundIndex: number;
  turnId: number;
  rounds: BoardBlueprint[];
  doubles: Record<string, string[]>;
  final: {
    options: FinalChoice[];
    chosen: FinalChoice | null;
    wagers: Record<string, number>;
    answers: Record<string, string>;
    suggestions: Record<string, string[]>;
    judged: Record<string, boolean>;
    stage: string;
  };
  players: Array<{
    id: number;
    name: string;
    score: number;
  }>;
  opened: unknown;
  modal: {
    mode: string;
    stealId: number | null;
    revealed: boolean;
  };
  runtime: {
    source: string;
    builtAt: number;
    repositoryStats: {
      totalCategorySets: number;
      uniqueCategoryTitles: number;
      totalRegularClues: number;
      totalFinalClues: number;
      uniqueFinalCategories: number;
    };
    usageCommitted: boolean;
  };
}
