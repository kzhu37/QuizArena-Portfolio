# Quizler Arena

<p align="center">
  <strong>A local-first social game platform that grew from a small Jeopardy-style game into a systems project about constrained generation, replayability, data integrity, and reliable shared-screen play.</strong>
</p>

<p align="center">
  React 18 · TypeScript · JavaScript · Vite · Node.js · localStorage
</p>

<p align="center">
  <a href="https://quizler-arena-portfolio.vercel.app"><strong>Live Demo</strong></a>
</p>

<p align="center">
  <a href="#why-i-built-it">Why</a> ·
  <a href="#what-i-built">Product</a> ·
  <a href="#my-contribution">My contribution</a> ·
  <a href="#engineering-highlights">Engineering</a> ·
  <a href="#architecture-and-key-decisions">Architecture</a> ·
  <a href="#iteration-from-real-use">Iteration</a> ·
  <a href="#testing-and-reliability">Testing</a> ·
  <a href="#run-locally">Run locally</a>
</p>

<p align="center">
  <img src="docs/media/jeopardy.png" alt="Quizler Jeopardy showing a complete six-category Round One board" width="100%">
</p>

<p align="center">
  <sub><strong>Flagship mode:</strong> a complete local-first Jeopardy experience with constrained board generation, replayability memory, persistence, recovery, and deterministic verification.</sub>
</p>

## At a glance

| Area | Quizler Arena |
| --- | --- |
| **Product** | Three playable local-first modes: Quizler Jeopardy, Wordle, and Hangman |
| **Technical centerpiece** | Recursive Jeopardy board assembly with candidate scoring, constraints, and rollback |
| **Content system** | 5,600-clue curated expansion across 14 research packs, with reproducible generation and source audits |
| **Replayability** | History-aware clue, answer, category, topic-family, and full-board novelty tracking |
| **State integrity** | Saved games are validated before reuse, with corrupted-save regeneration and legacy continuity recovery |
| **Testing** | 200 deterministic complete Jeopardy game packages per smoke run, plus tests, audits, builds, and route checks |
| **My role** | I designed and developed the project from the original Jeopardy prototype through the current three-mode platform |

**Implementation references:** [`boardAssembler.js`](src/jeopardy/boardAssembler.js) · [`gameStateAdapter.js`](src/jeopardy/gameStateAdapter.js) · [`jeopardy-runtime-smoke.html`](tools/jeopardy-runtime-smoke.html) · [`data/README.md`](data/README.md)

> **Scope:** Quizler Arena is a local-first shared-screen platform. Multiplayer and party-link interfaces are clearly labeled presentation previews. Hosted rooms, matchmaking, and remote synchronization are not implemented.

## Why I built it

Quizler Arena started as a small Jeopardy-style game I made during the Christmas period to play with family and friends, partly inspired by how much my dad enjoys Jeopardy. The first version only needed to make one game night work.

When I returned to it as a larger computer science project in April 2026, repeated play exposed a harder problem. A game could work once and still become repetitive, build weak category combinations, save invalid state, break when assets changed, or become difficult to use on a projector or weaker computer.

The project also moved into multiple full-class sessions, where projector readability, pacing, screen fit, and shared-screen interaction became practical constraints rather than hypothetical ones.

That changed the goal:

**How do you make a local game platform stay varied, valid, and dependable after repeated use?**

Most of the deeper systems work is concentrated in Quizler Jeopardy, while Wordle and Hangman broaden the platform with native React and TypeScript implementations.

## What I built

<p align="center">
  <img src="docs/media/lobby.png" alt="Quizler Arena lobby with portals for Quizler Jeopardy, Wordle, and Hangman" width="100%">
</p>

### Quizler Jeopardy

A full game supports 1 to 4 players, Round One, Double Jeopardy, Final Jeopardy, Daily Doubles, wagering, scoring, custom categories, timers, persistence, and history-aware replayability.

Repeated games turn board creation into a joint constraint problem. Categories, clue values, difficulty progression, duplicate prevention, topic balance, Final Jeopardy, and prior play history all affect whether a generated game is actually usable.

### Wordle and Hangman

<table>
  <tr>
    <td width="50%">
      <img src="docs/media/wordle.png" alt="Quizler Arena Wordle mode with statistics, puzzle grid, and keyboard">
    </td>
    <td width="50%">
      <img src="docs/media/hangman.png" alt="Quizler Arena Hangman mode with a live puzzle, hints, misses, and keyboard state">
    </td>
  </tr>
  <tr>
    <td align="center"><sub><strong>Wordle:</strong> keyboard input, duplicate-letter correctness, persistent statistics, and novelty-aware answer selection.</sub></td>
    <td align="center"><sub><strong>Hangman:</strong> word and phrase modes, hints, staged visuals, dialogue, keyboard input, and weighted puzzle selection.</sub></td>
  </tr>
</table>

These modes are intentionally secondary to Jeopardy in the technical story. They extend the platform without pretending that every mode has the same engineering center.

## My contribution

I designed and developed Quizler Arena from the original Jeopardy prototype through the current platform. My work includes:

- product direction, the focused three-mode structure, and the React/Vite platform shell
- Jeopardy gameplay, constrained board assembly, replayability logic, persistence, and recovery
- local content repositories, source audits, validators, and bank-generation workflows
- Wordle and Hangman gameplay and selection behavior
- build tooling, deterministic smoke tests, CI verification, and screenshot-capture tooling

[Vladimir Duckardt](https://github.com/VDuckardtt) provided limited debugging help on visual implementation issues, especially Hangman asset replacement and staged-image layering and transition behavior. I credit those contributions separately from my own work.

## Engineering highlights

### 1. Constrained Jeopardy board assembly

A complete board cannot be built reliably by choosing clues at random. It needs six distinct categories, five playable values per category, increasing difficulty, duplicate prevention, topic diversity, fresh board patterns, and a non-duplicating Final Jeopardy.

[`boardAssembler.js`](src/jeopardy/boardAssembler.js) scores clue candidates for freshness and target difficulty, ranks categories using recency and topic-family history, then searches recursively. If a choice makes the remaining board impossible, the assembler rolls it back and tries another path.

<p align="center">
  <img src="docs/diagrams/board-assembly.svg" alt="Quizler Jeopardy constrained board assembly process with recursive search and rollback" width="100%">
</p>

For example, a promising category can consume an answer, clue fingerprint, or topic-family slot that a later category needs. When that partial board can no longer reach six valid categories, the search removes the choice and explores the next candidate instead of accepting a broken board.

**Freshness is a constrained search problem, not random sampling.**

### 2. Curated data and replayability memory

The Jeopardy content system grew into a data-engineering problem. The major expansion is stored as **14 research packs with 400 structured rows each**, adding **5,600 clues across 70 category assignments** before the runtime bank is rebuilt.

Research, structured drafting, automated structural validation, and human review all contributed to preparing that expansion. The pipeline audits row and category coverage, value slots, difficulty bands, normalized duplicates, clue formatting, malformed text, answer leakage, protected pre-expansion content, and generated-bank parity.

<p align="center">
  <img src="docs/diagrams/content-pipeline.svg" alt="Quizler Jeopardy curated content build and validation pipeline" width="100%">
</p>

Generated runtime banks are build products rather than hand-edited source files. Automated checks verify engineering properties such as structure, uniqueness, format, difficulty constraints, and source parity. They do not determine whether every trivia fact is correct, so research and human review still matter.

Replayability also uses memory rather than resetting to pure randomness. Jeopardy tracks used clue IDs, normalized answers, clue fingerprints, categories, titles, topic families, full-board hashes, title hashes, and family patterns. Wordle and Hangman use smaller novelty windows suited to their content.

**Random is not the same as varied.**

### 3. State integrity and deterministic testing

Jeopardy persists state in browser `localStorage`, but stored data is treated as external input rather than automatically trusted. [`gameStateAdapter.js`](src/jeopardy/gameStateAdapter.js) validates loaded state, regenerates a valid game when the current save is malformed, and can preserve usable player continuity while rebuilding older saves.

[`tools/jeopardy-runtime-smoke.html`](tools/jeopardy-runtime-smoke.html) constructs **200 deterministic complete game packages** per smoke run, alternating difficulty modes and player counts from 1 to 4. It validates both standard rounds and Final Jeopardy, then also exercises custom categories, save/load behavior, corrupted-save recovery, and legacy-save salvage.

Wordle has its own correctness edge case: repeated letters are evaluated in two passes so exact-position matches consume answer copies before present-position matches are assigned. This prevents repeated letters from receiving too many yellow results.

## Architecture and key decisions

Quizler Arena uses a hybrid architecture. Wordle and Hangman are native React and TypeScript modes. The newer React shell hosts the mature JavaScript Jeopardy runtime inside an iframe rather than forcing a rewrite of a working subsystem.

<p align="center">
  <img src="docs/diagrams/architecture.svg" alt="Quizler Arena architecture showing the React platform shell, native Wordle and Hangman modes, and the preserved JavaScript Jeopardy runtime" width="100%">
</p>

That choice preserved the deeper Jeopardy gameplay and generation logic while adding unified routing, loading, fullscreen behavior, and presentation. The tradeoff is a less direct boundary for shared state, styling, and test orchestration than a complete migration would provide.

### Why I removed live question generation

An early April version experimented with runtime question generation through a hosted service. It was useful for exploring content quickly, but repeated use exposed network dependence, inconsistent output, credential handling, harder inspection, and weaker reproducibility.

The final runtime therefore uses a local question source, with remote generation disabled in [`questionSourceAdapter.js`](src/jeopardy/questionSourceAdapter.js).

<p align="center">
  <img src="docs/diagrams/local-first-evolution.svg" alt="Quizler Arena evolution from runtime question generation to a curated local-first architecture" width="100%">
</p>

The local-first design enabled repeatable builds, source auditing, duplicate control, deterministic testing, safer credential handling, and startup without a generation service.

The important decision was recognizing when runtime generation no longer matched the product requirements and removing it from final gameplay.

## Iteration from real use

Quizler Arena changed through repeated social play, multiple full-class sessions, presentation testing, different displays, weaker hardware, and technical failures.

| What I observed | What changed |
| --- | --- |
| Repeated sessions exposed duplicate answers, repetitive categories, and weak clue combinations | Added history, novelty scoring, topic-family balancing, and constrained board assembly |
| Full-class sessions made projector readability, pacing, screen fit, and shared-screen interaction more demanding | Improved fullscreen behavior, no-scroll layouts, control sizing, and cross-screen stability |
| Weaker hardware made visual complexity a reliability issue | Refined visual layers and fallbacks instead of assuming one ideal machine |
| Runtime-generated questions could be inconsistent or service-dependent | Moved final gameplay to curated local data with reproducible validation |
| A successful board did not prove that the next generated game would work | Added deterministic complete-game smoke testing and save-recovery coverage |

I did not track distinct users across these sessions or collect production telemetry for retention or measured performance improvement, so I describe classroom use qualitatively rather than turning it into a user-count metric. The full observation-to-implementation record is in [`docs/ITERATION.md`](docs/ITERATION.md).

## Testing and reliability

The [GitHub Actions workflow](.github/workflows/portfolio-verify.yml) checks two complementary paths:

1. **Portable Linux build:** public-text punctuation lint, production dependency audit, focused core tests, curated Jeopardy source audit, word-game validation, production build, and generated/runtime bank parity.
2. **Full Windows verification:** the deeper platform verifier, including the 200-game Jeopardy smoke harness, production and direct-file builds, and route checks for the lobby and all three modes.

A separate manual workflow captures reproducible README screenshots as build artifacts without automatically committing binary files.

## Run locally

### Requirements

- Node.js 20 or newer
- npm

### Development

```bash
npm ci
npm run dev
```

`npm run dev` rebuilds the Jeopardy bank, synchronizes the mature Jeopardy runtime into the Vite public directory, and starts the development server.

### Production build

```bash
npm run build
```

The normal development and production paths are cross-platform. Windows PowerShell and Microsoft Edge are only required for extended direct-file verification and screenshot capture.

### Full Windows verification

```bash
npm run verify
```

Useful focused commands:

```bash
npm run test:core
npm run bank:audit:sources
npm run bank:audit
npm run wordgames:validate
npm run smoke:legacy
```

## Repository map

- [`src/platform/`](src/platform): React shell, Wordle, Hangman, shared UI, fullscreen behavior, assets, and routing
- [`src/jeopardy/`](src/jeopardy): Jeopardy repository, validation, board assembly, usage history, persistence, and gameplay
- [`data/`](data): curated content sources, validation references, and word-list inputs
- [`tools/`](tools): build, audit, test, smoke, synchronization, and capture tooling
- [`docs/`](docs): diagrams, product captures, iteration notes, and development history

Generated Jeopardy banks and synchronized legacy output are ignored by Git and rebuilt from committed inputs. See [`data/README.md`](data/README.md) for the data layout and source notes.

## Development history

The public repository was created after the project was already underway. The original development work lived in a separate private repository, and the earliest personal Jeopardy prototype predates that Git history.

```text
small social prototype
  -> runtime-generation experiment
  -> three-mode platform
  -> repeated-play problems
  -> local content and replayability systems
  -> deterministic testing and recovery
```

A dated timeline is in [`docs/DEVELOPMENT_HISTORY.md`](docs/DEVELOPMENT_HISTORY.md).

## Attribution and reuse

Third-party software, word-list sources, collaboration notes, and reuse details are documented in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Quizler Jeopardy is an unofficial independent project inspired by the familiar Jeopardy-style clue-board format. It is not affiliated with or endorsed by the television program or its rights holders.
