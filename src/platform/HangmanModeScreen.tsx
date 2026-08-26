import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AssetLayer } from "./AssetLayer";
import { GameEndOverlay } from "./GameEndOverlay";
import { hangmanStageBackgrounds, hangmanOutcomeBackgrounds, screenBackgrounds } from "./assets";
import {
  chooseHangmanEntry,
  QUIZZLER_INCORRECT_LINES,
  QUIZZLER_LOSS_LINES,
  SOCRATES_CORRECT_LINES,
  SOCRATES_WIN_LINES
} from "./hangmanData";
import { APP_BRAND_NAME } from "./product";
import type { HangmanEntry } from "./types";
import { useFullscreenTarget } from "./useFullscreenTarget";
import { burstConfetti } from "./ParticleCanvas";
import { RippleButton } from "./RippleButton";
import { DemoSocialControls } from "./DemoSocialControls";
import { HANGMAN_DEMO_MULTIPLAYER } from "./demoMultiplayer";

const HANGMAN_ALPHABET_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const MAX_WRONG_GUESSES = 7;

type HangmanStatus = "playing" | "won" | "lost";
type DialogueSpeaker = "Socrates" | "The Quizler";
type HangmanMode = "word" | "phrase";

function pickNextLine(pool: string[], previousLine: string) {
  const choices = pool.filter((line) => line !== previousLine);
  const source = choices.length ? choices : pool;
  return source[Math.floor(Math.random() * source.length)] ?? pool[0];
}

function getAnswerLetters(answer: string) {
  return Array.from(new Set(answer.toUpperCase().replace(/[^A-Z]/g, "").split("")));
}

function hasSolvedEntry(answer: string, guessedLetters: string[]) {
  const guessed = new Set(guessedLetters);
  return getAnswerLetters(answer).every((letter) => guessed.has(letter));
}

export function HangmanModeScreen() {
  const navigate = useNavigate();
  const { targetRef, isFullscreen, toggleFullscreen } = useFullscreenTarget<HTMLElement>();
  const [mode, setMode] = useState<HangmanMode>("word");
  const [entry, setEntry] = useState<HangmanEntry>(() => chooseHangmanEntry("word"));
  const [guessedLetters, setGuessedLetters] = useState<string[]>([]);
  const [wrongLetters, setWrongLetters] = useState<string[]>([]);
  const [status, setStatus] = useState<HangmanStatus>("playing");
  const [dialogueSpeaker, setDialogueSpeaker] = useState<DialogueSpeaker>("Socrates");
  const [dialogueLine, setDialogueLine] = useState("Find the mystery word or phrase one letter at a time.");
  const [guessStatusMessage, setGuessStatusMessage] = useState("Unused letters glow on the keyboard until you commit them.");
  const handleGuessRef = useRef<(letter: string) => void>(() => undefined);

  const wrongCount = wrongLetters.length;
  const stageIndex = Math.min(wrongCount, 6);
  const usedLetters = [...guessedLetters, ...wrongLetters];
  const isPhraseAnswer = /\s/.test(entry.answer.trim());

  function resetGame(nextMode = mode) {
    const freshEntry = chooseHangmanEntry(nextMode, entry.answer);
    setMode(nextMode);
    setEntry(freshEntry);
    setGuessedLetters([]);
    setWrongLetters([]);
    setStatus("playing");
    setDialogueSpeaker("Socrates");
    setDialogueLine("Find the mystery word or phrase one letter at a time.");
    setGuessStatusMessage("Unused letters glow on the keyboard until you commit them.");
  }

  function handleGuess(letter: string) {
    if (status !== "playing") return;
    if (guessedLetters.includes(letter) || wrongLetters.includes(letter)) {
      setGuessStatusMessage(`${letter} was already used.`);
      return;
    }

    const upperAnswer = entry.answer.toUpperCase();
    if (upperAnswer.includes(letter)) {
      const nextGuessed = [...guessedLetters, letter];
      setGuessedLetters(nextGuessed);
      setGuessStatusMessage(`${letter} is in the answer.`);

      if (hasSolvedEntry(entry.answer, nextGuessed)) {
        const line = pickNextLine(SOCRATES_WIN_LINES, dialogueLine);
        setDialogueSpeaker("Socrates");
        setDialogueLine(line);
        setStatus("won");
        setTimeout(() => burstConfetti(window.innerWidth / 2, window.innerHeight * 0.4), 280);
      } else {
        const line = pickNextLine(SOCRATES_CORRECT_LINES, dialogueLine);
        setDialogueSpeaker("Socrates");
        setDialogueLine(line);
      }
      return;
    }

    const nextWrong = [...wrongLetters, letter];
    setWrongLetters(nextWrong);
    setGuessStatusMessage(`${letter} is not in the answer.`);

    if (nextWrong.length >= MAX_WRONG_GUESSES) {
      const line = pickNextLine(QUIZZLER_LOSS_LINES, dialogueLine);
      setDialogueSpeaker("The Quizler");
      setDialogueLine(line);
      setStatus("lost");
    } else {
      const line = pickNextLine(QUIZZLER_INCORRECT_LINES, dialogueLine);
      setDialogueSpeaker("The Quizler");
      setDialogueLine(line);
    }
  }

  handleGuessRef.current = handleGuess;

  useEffect(() => {
    if (status !== "playing") return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toUpperCase();
      if (/^[A-Z]$/.test(key)) {
        handleGuessRef.current(key);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status]);

  const arenaAsset = status === "won" ? hangmanOutcomeBackgrounds.win : hangmanStageBackgrounds[stageIndex];

  function renderAnswerCharacter(character: string, key: string) {
    if (!/[A-Z]/.test(character)) {
      return <span className="hangman-char hangman-char-fixed" key={key}>{character}</span>;
    }

    const revealed = guessedLetters.includes(character) || status === "lost";
    return (
      <span className={`hangman-char ${revealed ? "hangman-char-revealed" : ""}`} key={key}>
        {revealed ? character : ""}
      </span>
    );
  }

  const answerDisplay = isPhraseAnswer
    ? (() => {
        const words = entry.answer.toUpperCase().split(/\s+/).filter(Boolean);
        return words.map((word, wordIndex) => (
          <Fragment key={`word-${wordIndex}`}>
            <span className="hangman-answer-word">
              {word.split("").map((character, characterIndex) => renderAnswerCharacter(character, `word-${wordIndex}-${character}-${characterIndex}`))}
            </span>
            {wordIndex < words.length - 1 ? <span aria-hidden="true" className="hangman-answer-word-space" /> : null}
          </Fragment>
        ));
      })()
    : entry.answer.toUpperCase().split("").map((character, index) => renderAnswerCharacter(character, `${character}-${index}`));

  return (
    <main className="platform-shell game-shell game-shell-hangman">
      <section className={`mode-stage hangman-stage${isFullscreen ? " is-fullscreen" : ""}`} ref={targetRef}>
        <AssetLayer asset={arenaAsset} className="mode-backdrop hangman-backdrop-fade" key={`backdrop-${arenaAsset.id}`}>
          <div className="hero-scrim mode-scrim hangman-scrim" />
        </AssetLayer>

        <header className="glass-panel mode-header">
          <div>
            <div className="eyebrow">{APP_BRAND_NAME} Hangman</div>
            <h1>Hangman</h1>
            <p className="muted">Solve the word or phrase before the chamber closes.</p>
          </div>
          <div className="header-actions">
            <RippleButton className="platform-button" onClick={() => navigate("/")} type="button">
              Back To Lobby
            </RippleButton>
            <DemoSocialControls config={HANGMAN_DEMO_MULTIPLAYER} />
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

        <section className="hangman-layout">
          <section className="glass-panel hangman-playfield hangman-playfield-classic">
            <div className="hangman-toolbar">
              <div className="segmented-control" role="group" aria-label="Hangman mode">
                <button
                  className={`segment ${mode === "word" ? "is-active" : ""}`}
                  onClick={() => resetGame("word")}
                  type="button"
                >
                  Word
                </button>
                <button
                  className={`segment ${mode === "phrase" ? "is-active" : ""}`}
                  onClick={() => resetGame("phrase")}
                  type="button"
                >
                  Phrase
                </button>
              </div>
              <div className="hangman-meta hangman-meta-inline">
                <div className="meta-chip hangman-meta-chip hangman-meta-chip-category">
                  <span>Category</span>
                  <strong>{entry.category}</strong>
                </div>
                <div className="meta-chip hangman-meta-chip hangman-meta-chip-hint">
                  <span>Hint</span>
                  <strong>{entry.hint}</strong>
                </div>
                <div className="meta-chip hangman-meta-chip hangman-meta-chip-misses">
                  <span>Misses Left</span>
                  <strong>{Math.max(0, MAX_WRONG_GUESSES - wrongCount)}</strong>
                </div>
              </div>
            </div>

            <div className="hangman-lower-grid">
              <div className="hangman-info-stack hangman-info-dock">
                <div className="hangman-info-card">
                  <span className="eyebrow">Used Letters</span>
                  <div className="hangman-wrong-chips">
                    {usedLetters.length ? usedLetters.map((letter) => <span className="wrong-chip" key={`used-${letter}`}>{letter}</span>) : <span className="muted">None yet.</span>}
                  </div>
                </div>
                <div className="hangman-info-card">
                  <span className="eyebrow">Wrong Letters</span>
                  <div className="hangman-wrong-chips">
                    {wrongLetters.length ? wrongLetters.map((letter) => <span className="wrong-chip" key={letter}>{letter}</span>) : <span className="muted">None yet.</span>}
                  </div>
                </div>

                <div className={`hangman-answer-row ${isPhraseAnswer ? "hangman-answer-row-phrase" : "hangman-answer-row-single"}`}>
                  {answerDisplay}
                </div>
              </div>

              <div className="hangman-action-dock">
                <div className="status-banner hangman-status-banner hangman-status-banner-classic" aria-live="polite" role="status">
                  <p className="hangman-helper-copy">Guess letters to reveal the hidden word or phrase before Socrates disappears.</p>
                  <div className="eyebrow hangman-guess-feed-label">Guess Feed</div>
                  <p className="hangman-status-copy">{guessStatusMessage}</p>
                  <p className="hangman-dialogue-inline">
                    <strong>{dialogueSpeaker}:</strong> {dialogueLine}
                  </p>
                </div>

                <div className="hangman-keyboard hangman-keyboard-dock">
                  {HANGMAN_ALPHABET_ROWS.map((row) => (
                    <div className="wordle-keyboard-row" key={row}>
                      {row.split("").map((letter) => {
                        const isGuessed = guessedLetters.includes(letter);
                        const isWrong = wrongLetters.includes(letter);
                        return (
                          <button
                            className={`wordle-key ${isGuessed ? "wordle-key-correct" : ""} ${isWrong ? "wordle-key-absent" : ""}`}
                            disabled={isGuessed || isWrong || status !== "playing"}
                            key={letter}
                            onClick={() => handleGuess(letter)}
                            type="button"
                          >
                            {letter}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </section>
        </section>
      </section>

      <GameEndOverlay
        open={status !== "playing"}
        tone={status === "won" ? "win" : "loss"}
        title={status === "won" ? "Socrates Freed" : "The Spell Held"}
        subtitle={
          status === "won"
            ? `You solved ${entry.answer.toUpperCase()} before the chamber took its final toll.`
            : `The answer was ${entry.answer.toUpperCase()}. The next attempt can begin immediately.`
        }
        primaryAction={{ label: "Play Again", onClick: () => resetGame(), tone: "primary" }}
        secondaryAction={{ label: "Back To Lobby", onClick: () => navigate("/") }}
        tertiaryAction={{ label: mode === "word" ? "Switch To Phrase" : "Switch To Word", onClick: () => resetGame(mode === "word" ? "phrase" : "word") }}
      />
    </main>
  );
}
