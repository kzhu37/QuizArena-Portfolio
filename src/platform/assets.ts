import type { AssetDescriptor, AssetManifest } from "./types";

function background(id: string, path: string | undefined, alt: string, fallbackClassName: string): AssetDescriptor {
  return { id, path, alt, fallbackClassName };
}

function pose(id: string, path: string | undefined, alt: string): AssetDescriptor {
  return {
    id,
    path,
    alt,
    fallbackClassName: "asset-fallback asset-fallback-quizzler"
  };
}

export const screenBackgrounds = {
  hub: background(
    "hub",
    "./assets/backgrounds/lobby.png",
    "Quizler lobby with Wordle, flagship board, and Hangman portals",
    "asset-fallback asset-fallback-hub"
  ),
  loading: background(
    "loading",
    "./assets/backgrounds/loading.png",
    "Quizler loading background",
    "asset-fallback asset-fallback-loading"
  ),
  flagship: background(
    "flagship",
    "./assets/backgrounds/lobby.png",
    "Quizler Jeopardy portal shell background",
    "asset-fallback asset-fallback-flagship"
  ),
  wordle: background(
    "wordle",
    "./assets/backgrounds/wordle.png",
    "Wordle room background",
    "asset-fallback asset-fallback-wordle"
  ),
  hangmanRoom: background(
    "hangman-room",
    "./assets/hangman/stage_0.png",
    "Hangman chamber background",
    "asset-fallback asset-fallback-hangman"
  )
} as const satisfies Record<string, AssetDescriptor>;

const HANGMAN_STAGE_FILES = [
  "stage_0.png",
  "stage_1.png",
  "stage_2.png",
  "stage_3.png",
  "stage_4.png",
  "stage_5.png",
  "stage_6.png"
] as const;

export const hangmanStageBackgrounds: AssetDescriptor[] = HANGMAN_STAGE_FILES.map((stageFile, stage) =>
  background(
    `hangman-stage-${stage}`,
    `./assets/hangman/${stageFile}`,
    `Hangman chamber background stage ${stage}`,
    "asset-fallback asset-fallback-hangman"
  )
);

export const hangmanOutcomeBackgrounds = {
  win: background(
    "hangman-win",
    "./assets/hangman/win.png",
    "Hangman winning chamber frame",
    "asset-fallback asset-fallback-hangman"
  )
} as const satisfies Record<string, AssetDescriptor>;

export const quizzlerPoses = {
  host: pose("host", "./assets/quizzler/quizzler-host.png", "The Quizler hosting a game"),
  guide: pose("guide", "./assets/quizzler/quizzler-guide.png", "The Quizler greeting players"),
  celebrate: pose("celebrate", "./assets/quizzler/quizzler-celebrate.png", "The Quizler celebrating"),
  portal: pose("portal", "./assets/quizzler/quizzler-portal.png", "The Quizler opening a portal"),
  tiles: pose("tiles", "./assets/quizzler/quizzler-tiles.png", "The Quizler conjuring letter tiles"),
  shield: pose("shield", "./assets/quizzler/quizzler-shield.png", "The Quizler with game emblems"),
  oracle: pose("oracle", "./assets/quizzler/quizzler-oracle.png", "The Quizler offering guidance"),
  spark: pose("spark", "./assets/quizzler/quizzler-spark.png", "The Quizler casting sparks"),
  showman: pose("showman", "./assets/quizzler/quizzler-showman.png", "The Quizler presenting the show"),
  welcome: pose("welcome", "./assets/quizzler/quizzler-welcome.png", "The Quizler welcoming players"),
  wordle: pose("wordle", "./assets/quizzler/quizzler-wordle.png", "The Quizler with word tiles"),
  smirk: pose("smirk", "./assets/quizzler/quizzler-smirk.png", "The Quizler with a playful smirk")
} as const satisfies Record<string, AssetDescriptor>;

export const assetManifest: AssetManifest = {
  backgrounds: {
    ...screenBackgrounds,
    ...Object.fromEntries(hangmanStageBackgrounds.map((asset) => [asset.id, asset])),
    ...hangmanOutcomeBackgrounds
  },
  quizzlerPoses
};

// Keep startup eager loading limited to assets used immediately on the lobby/loading path.
// Route-specific game art loads when its mode is opened instead of competing with first paint.
export const criticalAssetPreloadList: AssetDescriptor[] = [
  screenBackgrounds.hub,
  screenBackgrounds.loading,
  quizzlerPoses.welcome
];
