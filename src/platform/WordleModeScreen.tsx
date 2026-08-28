import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AssetLayer } from "./AssetLayer";
import { GameEndOverlay } from "./GameEndOverlay";
import { quizzlerPoses, screenBackgrounds } from "./assets";
import { APP_BRAND_NAME } from "./product";
import { readLocalJson, writeLocalJson } from "./storage";
import type { WordleStats } from "./types";
import { useFullscreenTarget } from "./useFullscreenTarget";
import { burstConfetti } from "./ParticleCanvas";
import { RippleButton } from "./RippleButton";
import { WORDLE_ALLOWED_GUESSES, pickWordleAnswer } from "./wordleData";

type LetterState = "empty" | "pending" | "correct" | "present" | "absent";
type WordleStatus = "playing" | "won" | "lost";

const WORDLE_ROWS = 6;
const WORDLE_COLS = 5;
const WORDLE_STATS_KEY = "quizarena_wordle_stats_v1";

const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

const EMPTY_STATS: WordleStats = {
  gamesPlayed: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  guessDistribution: [0, 0, 0, 0, 0, 0]
};

function chooseRandomWord(previousAnswer?: string) {
  return pickWordleAnswer(previousAnswer);
}

function evaluateGuess(answer: string, guess: string): LetterState[] {
  const result: LetterState[] = Array.from({ length: guess.length }, () => "absent");
  const remaining = new Map<string, number>();

  for (let index = 0; index < answer.length; index += 1) {
    const answerChar = answer[index];
    const guessChar = guess[index];
    if (answerChar === guessChar) {
      result[index] = "correct";
    } else {
      remaining.set(answerChar, (remaining.get(answerChar) ?? 0) + 1);
    }
  }

  for (let index = 0; index < guess.length; index += 1) {
    if (result[index] === "correct") continue;
    const guessChar = guess[index];
    const available = remaining.get(guessChar) ?? 0;
    if (available > 0) {
      result[index] = "present";
      remaining.set(guessChar, available - 1);
    }
  }

  return result;
}

function computeKeyboardState(guesses: string[], evaluations: LetterState[][]) {
  const states = new Map<string, LetterState>();
  const priority: Record<LetterState, number> = {
    empty: 0,
    pending: 1,
    absent: 2,
    present: 3,
    correct: 4
  };

  guesses.forEach((guess, guessIndex) => {
    const evaluation = evaluations[guessIndex] ?? [];
    guess.split("").forEach((letter, letterIndex) => {
      const nextState = evaluation[letterIndex] ?? "pending";
      const current = states.get(letter) ?? "empty";
      if (priority[nextState] >= priority[current]) {
        states.set(letter, nextState);
      }
    });
  });

  return states;
}

function formatWinPercentage(stats: WordleStats) {
  if (!stats.gamesPlayed) return 0;
  return Math.round((stats.wins / stats.gamesPlayed) * 100);
}

function updateStats(previous: WordleStats, status: WordleStatus, guessCount: number): WordleStats {
  const next: WordleStats = {
    gamesPlayed: previous.gamesPlayed + 1,
    wins: previous.wins,
    currentStreak: previous.currentStreak,
    maxStreak: previous.maxStreak,
    guessDistribution: previous.guessDistribution.slice()
  };

  if (status === "won") {
    next.wins += 1;
    next.currentStreak += 1;
    next.maxStreak = Math.max(next.maxStreak, next.currentStreak);
    if (guessCount >= 1 && guessCount <= WORDLE_ROWS) {
      next.guessDistribution[guessCount - 1] += 1;
    }
  } else {
    next.currentStreak = 0;
  }

  return next;
}

function WordleStatsPanel({ stats }: { stats: WordleStats }) {
  const maxBarValue = Math.max(1, ...stats.guessDistribution);

  return (
    <div className="wordle-stats-panel">
      <div className="wordle-stat-grid">
        <div className="wordle-stat-card">
          <strong>{stats.gamesPlayed}</strong>
          <span>Played</span>
        </div>
        <div className="wordle-stat-card">
          <strong>{formatWinPercentage(stats)}%</strong>
          <span>Win %</span>
        </div>
        <div className="wordle-stat-card">
          <strong>{stats.currentStreak}</strong>
          <span>Current Streak</span>
        </div>
        <div className="wordle-stat-card">
          <strong>{stats.maxStreak}</strong>
          <span>Max Streak</span>
        </div>
      </div>
      <div className="wordle-distribution">
        <div className="eyebrow">Guess Distribution</div>
        {stats.guessDistribution.map((count, index) => (
          <div className="wordle-distribution-row" key={index}>
            <span>{index + 1}</span>
            <div className="wordle-distribution-bar-track">
              <div
                className="wordle-distribution-bar-fill"
                style={{
                  width: count > 0 ? `${Math.max(12, (count / maxBarValue) * 100)}%` : "2.4rem",
                  minWidth: "2.4rem"
                }}
              >
                {count}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WordleModeScreen() {
  const navigate = useNavigate();
  const { targetRef, isFullscreen, toggleFullscreen } = useFullscreenTarget<HTMLElement>();
  const [answer, setAnswer] = useState(() => chooseRandomWord());
  const [guesses, setGuesses] = useState<string[]>([]);
  const [evaluations, setEvaluations] = useState<LetterState[][]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [status, setStatus] = useState<WordleStatus>("playing");
  const [statusMessage, setStatusMessage] = useState("Find the hidden five-letter word in six guesses.");
  const [stats, setStats] = useState(() => readLocalJson<WordleStats>(WORDLE_STATS_KEY, EMPTY_STATS));
  const [resultCommitted, setResultCommitted] = useState(false);
  const [shakingRow, setShakingRow] = useState<number | null>(null);
  const [revealedRows, setRevealedRows] = useState<Set<number>>(new Set());
  const [winRow, setWinRow] = useState<number | null>(null);
  const submitGuessRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (status === "playing" || resultCommitted) return;
    const nextStats = updateStats(stats, status, guesses.length);
    setStats(nextStats);
    writeLocalJson(WORDLE_STATS_KEY, nextStats);
    setResultCommitted(true);
  }, [guesses.length, resultCommitted, stats, status]);

  function resetGame(nextAnswer?: string) {
    const freshAnswer = nextAnswer ?? chooseRandomWord(answer);
    setAnswer(freshAnswer);
    setGuesses([]);
    setEvaluations([]);
    setCurrentGuess("");
    setStatus("playing");
    setStatusMessage("Find the hidden five-letter word in six guesses.");
    setResultCommitted(false);
    setRevealedRows(new Set());
    setWinRow(null);
  }

  function submitGuess() {
    if (status !== "playing") return;
    const guess = currentGuess.toLowerCase();
    if (guess.length !== WORDLE_COLS) {
      setStatusMessage("Wordle needs exactly five letters.");
      setShakingRow(guesses.length);
      setTimeout(() => setShakingRow(null), 400);
      return;
    }
    if (!WORDLE_ALLOWED_GUESSES.has(guess)) {
      setStatusMessage("That word is not in the active puzzle lexicon.");
      setShakingRow(guesses.length);
      setTimeout(() => setShakingRow(null), 400);
      return;
    }

    const nextEvaluations = evaluateGuess(answer, guess);
    const nextGuesses = [...guesses, guess];
    setGuesses(nextGuesses);
    setEvaluations([...evaluations, nextEvaluations]);
    setCurrentGuess("");
    setRevealedRows((prev) => new Set([...prev, guesses.length]));

    if (guess === answer) {
      setStatus("won");
      setStatusMessage(`Solved in ${nextGuesses.length} guess${nextGuesses.length === 1 ? "" : "es"}.`);
      setWinRow(guesses.length);
      // Fire confetti from center of screen
      setTimeout(() => burstConfetti(window.innerWidth / 2, window.innerHeight * 0.4), 320);
      return;
    }

    if (nextGuesses.length >= WORDLE_ROWS) {
      setStatus("lost");
      setStatusMessage(`The hidden word was ${answer.toUpperCase()}.`);
      return;
    }

    setStatusMessage("Good pressure. Keep reading the pattern.");
  }

  submitGuessRef.current = submitGuess;

  useEffect(() => {
    if (status !== "playing") return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toUpperCase();

      if (key === "BACKSPACE") {
        setCurrentGuess((value) => value.slice(0, -1));
        return;
      }

      if (key === "ENTER") {
        submitGuessRef.current();
        return;
      }

      if (/^[A-Z]$/.test(key)) {
        setCurrentGuess((value) => (value.length < WORDLE_COLS ? `${value}${key}` : value));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status]);

  function handleKeyPress(letter: string) {
    if (status !== "playing") return;
    if (letter === "ENTER") {
      submitGuess();
      return;
    }
    if (letter === "BACK") {
      setCurrentGuess((value) => value.slice(0, -1));
      return;
    }
    setCurrentGuess((value) => (value.length < WORDLE_COLS ? `${value}${letter}` : value));
  }

  const keyboardState = computeKeyboardState(guesses, evaluations);
  const displayedStats =
    status === "playing" || resultCommitted ? stats : updateStats(stats, status, guesses.length);

  return (
    <main className="platform-shell game-shell game-shell-wordle">
      <section className={`mode-stage wordle-stage${isFullscreen ? " is-fullscreen" : ""}`} ref={targetRef}>
        <AssetLayer asset={screenBackgrounds.wordle} className="mode-backdrop">
          <div className="hero-scrim mode-scrim" />
        </AssetLayer>

        <header className="glass-panel mode-header">
          <div>
            <div className="eyebrow">{APP_BRAND_NAME} Wordle</div>
            <h1>Wordle</h1>
            <p className="muted">Six guesses. One five-letter word.</p>
          </div>
          <div className="header-actions">
            <RippleButton className="platform-button" onClick={() => navigate("/")} type="button">
              Back To Lobby
            </RippleButton>
            <RippleButton className="platform-button platform-button-primary" onClick={() => resetGame()} type="button">
              New Puzzle
            </RippleButton>
            <button
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className="fullscreen-btn"
              onClick={toggleFullscreen}
              type="button"
            >
              {isFullscreen ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              )}
            </button>
          </div>
        </header>

        <section className="wordle-layout">
          <aside className="glass-panel wordle-side-panel">
            <AssetLayer asset={quizzlerPoses.wordle} className="quizzler-card quizzler-wordle-card">
              <div className="quizzler-glow quizzler-glow-soft" />
            </AssetLayer>
            <div className="status-banner" aria-live="polite" role="status">
              <div className="eyebrow wordle-puzzle-feed-label">Puzzle Feed</div>
              <p className="wordle-status-copy">{statusMessage}</p>
            </div>
            <WordleStatsPanel stats={displayedStats} />
          </aside>

          <section className="glass-panel wordle-playfield">
            <div className="wordle-board">
              {Array.from({ length: WORDLE_ROWS }, (_, rowIndex) => {
                const guess = guesses[rowIndex] ?? "";
                const evaluation = evaluations[rowIndex] ?? [];
                const isActiveRow = rowIndex === guesses.length && status === "playing";
                const displayLetters = isActiveRow ? currentGuess.toUpperCase() : guess.toUpperCase();
                const isRevealed = revealedRows.has(rowIndex);
                const isWinRow = winRow === rowIndex;
                const isShaking = shakingRow === rowIndex;

                return (
                  <div className={`wordle-row${isShaking ? " wordle-row-shake" : ""}`} key={rowIndex}>
                    {Array.from({ length: WORDLE_COLS }, (_, letterIndex) => {
                      const letter = displayLetters[letterIndex] ?? "";
                      const tileState: LetterState =
                        guess && evaluation[letterIndex]
                          ? evaluation[letterIndex]
                          : letter
                            ? "pending"
                            : "empty";
                      const flipClass = isRevealed ? " wordle-tile-flip" : "";
                      const bounceClass = !isRevealed && letter ? " wordle-tile-bounce" : "";
                      const winClass = isWinRow ? " wordle-tile-win-dance" : "";
                      const animStyle = isRevealed
                        ? { animationDelay: `${letterIndex * 80}ms` }
                        : isWinRow
                          ? { animationDelay: `${letterIndex * 60}ms` }
                          : {};
                      return (
                        <div
                          className={`wordle-tile wordle-tile-${tileState}${flipClass}${bounceClass}${winClass}`}
                          key={letterIndex}
                          style={animStyle}
                        >
                          <span>{letter}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="wordle-keyboard">
              {KEYBOARD_ROWS.map((row) => (
                <div className="wordle-keyboard-row" key={row}>
                  {row.split("").map((letter) => (
                    <button
                      className={`wordle-key ${keyboardState.get(letter.toLowerCase()) ? `wordle-key-${keyboardState.get(letter.toLowerCase())}` : ""}`}
                      disabled={status !== "playing"}
                      key={letter}
                      onClick={() => handleKeyPress(letter)}
                      type="button"
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              ))}
              <div className="wordle-keyboard-row wordle-keyboard-row-actions">
                <button
                  className="wordle-key wordle-key-wide"
                  disabled={status !== "playing"}
                  onClick={() => handleKeyPress("ENTER")}
                  type="button"
                >
                  Enter
                </button>
                <button
                  className="wordle-key wordle-key-wide"
                  disabled={status !== "playing"}
                  onClick={() => handleKeyPress("BACK")}
                  type="button"
                >
                  Backspace
                </button>
              </div>
            </div>
          </section>
        </section>
      </section>

      <GameEndOverlay
        open={status !== "playing"}
        tone={status === "won" ? "win" : "loss"}
        title={status === "won" ? "Puzzle Solved" : "The Word Escaped"}
        subtitle={
          status === "won"
            ? `You cracked ${answer.toUpperCase()} and kept the streak alive.`
            : `The hidden word was ${answer.toUpperCase()}. Another run is ready when you are.`
        }
        stats={<WordleStatsPanel stats={displayedStats} />}
        primaryAction={{ label: "Play Again", onClick: () => resetGame(), tone: "primary" }}
        secondaryAction={{ label: "Back To Lobby", onClick: () => navigate("/") }}
      />
    </main>
  );
}
