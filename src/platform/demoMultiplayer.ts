export interface DemoMultiplayerConfig {
  gameTitle: string;
  conceptSummary: string;
  requiredSystems: string[];
}

export const WORDLE_DEMO_MULTIPLAYER: DemoMultiplayerConfig = {
  gameTitle: "Wordle",
  conceptSummary:
    "A future remote mode could let two players solve the same answer seed while keeping guesses and timing synchronized through an authoritative room state.",
  requiredSystems: [
    "hosted room creation and authenticated join flow",
    "authoritative answer seed and round timer",
    "real-time guess and result synchronization",
    "disconnect, reconnect, and conflict handling"
  ]
};

export const HANGMAN_DEMO_MULTIPLAYER: DemoMultiplayerConfig = {
  gameTitle: "Hangman",
  conceptSummary:
    "A future remote mode could synchronize one puzzle, letter guesses, reveal state, and turn timing between players without trusting either browser as the source of truth.",
  requiredSystems: [
    "hosted room creation and join flow",
    "authoritative puzzle and turn state",
    "real-time guess and reveal synchronization",
    "disconnect, reconnect, and conflict handling"
  ]
};

export const JEOPARDY_DEMO_MULTIPLAYER: DemoMultiplayerConfig = {
  gameTitle: "Quizler Jeopardy",
  conceptSummary:
    "A future remote version would need an authoritative game server for board control, scoring, wagering, clue state, and recovery across multiple clients.",
  requiredSystems: [
    "authoritative room and player state",
    "synchronized clue selection, scoring, and turn control",
    "secure wager submission and Final Jeopardy state",
    "reconnect and state-recovery behavior"
  ]
};
