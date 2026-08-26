export interface DemoModeOption {
  title: string;
  description: string;
}

export interface DemoMultiplayerConfig {
  gameTitle: string;
  trophyCount: number;
  description: string;
  modeOptions: DemoModeOption[];
}

const PARTY_DOMAIN = "quizzlerarena.net";
const ROOM_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function randomInt(maxExclusive: number) {
  if (maxExclusive <= 0) {
    return 0;
  }

  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
}

export function generateDemoRoomCode() {
  const targetLength = 8 + randomInt(5);
  let roomCode = "";

  for (let index = 0; index < targetLength; index += 1) {
    roomCode += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }

  return roomCode;
}

export function generateDemoPartyLink() {
  return `${PARTY_DOMAIN}/${generateDemoRoomCode()}`;
}

export const TROPHY_HELP_LINES = [
  "Every player starts at 0 trophies.",
  "Beating stronger players awards more trophies.",
  "Losing to weaker players costs more trophies.",
  "Trophy changes scale with the gap between both players.",
  "Demo preview only: this build does not run real online matchmaking."
];

export const WORDLE_DEMO_MULTIPLAYER: DemoMultiplayerConfig = {
  gameTitle: "Wordle",
  trophyCount: 1260,
  description: "Queue into a polished head-to-head Wordle duel with fast, competitive rounds.",
  modeOptions: [
    {
      title: "Least Guesses Wins",
      description:
        "Both players race to solve the same word. You get 30 seconds per guess. Fewest guesses wins, then total time breaks ties."
    },
    {
      title: "Alternating Duel",
      description:
        "A coin flip decides first turn. Players alternate guesses and can view the opponent clue pattern (green/yellow only), not exact letters. Tie by total time."
    },
    {
      title: "Fastest Solve",
      description:
        "Both players sprint to finish first. Overall speed decides the winner, with less focus on guess count."
    }
  ]
};

export const HANGMAN_DEMO_MULTIPLAYER: DemoMultiplayerConfig = {
  gameTitle: "Hangman",
  trophyCount: 1095,
  description: "Compete in live-feel Hangman duels with concise rule variants built for party play.",
  modeOptions: [
    {
      title: "Least Guesses Wins",
      description:
        "Both players solve the same puzzle with only 15 seconds per guess. Fewest guesses wins, and total time is the tiebreaker."
    },
    {
      title: "Alternating Duel",
      description:
        "Coin toss chooses who starts. Players alternate letters and can track the opponent reveal progress without sharing exact picks. Tie by total time."
    },
    {
      title: "Fastest Solve",
      description:
        "Both players race to complete the puzzle first. Fast execution wins the round."
    }
  ]
};

export const JEOPARDY_DEMO_MULTIPLAYER: DemoMultiplayerConfig = {
  gameTitle: "Quizler Jeopardy",
  trophyCount: 1430,
  description: "A focused two-player competitive board where clue control and wagering decide the match.",
  modeOptions: [
    {
      title: "Head-to-Head Classic",
      description:
        "Two players enter one competitive Quizler Jeopardy match. A coin toss decides who controls the board first."
    }
  ]
};