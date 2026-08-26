import { FLAGSHIP_BOARD_MODE_NAME, FLAGSHIP_BOARD_MODE_ROUTE } from "./product";
import type { ModeDefinition } from "./types";

export const modeRegistry: ModeDefinition[] = [
  {
    id: "wordle",
    title: "Wordle",
    shortLabel: "W",
    subtitle: "Word Magic",
    route: "/wordle",
    status: "playable",
    accent: "accent-wordle",
    description: "A focused five-letter challenge with live streak tracking and quick replay loops."
  },
  {
    id: "flagship",
    title: FLAGSHIP_BOARD_MODE_NAME,
    shortLabel: "J",
    subtitle: "Jeopardy Board",
    route: FLAGSHIP_BOARD_MODE_ROUTE,
    status: "playable",
    accent: "accent-flagship",
    description: "Classic clueboard flow with Round 1, Double Jeopardy, and Final Jeopardy wagering."
  },
  {
    id: "hangman",
    title: "Hangman",
    shortLabel: "H",
    subtitle: "Host vs. Philosopher",
    route: "/hangman",
    status: "playable",
    accent: "accent-hangman",
    description: "A word-or-phrase duel with escalating misses and a fast reset between rounds."
  }
];
