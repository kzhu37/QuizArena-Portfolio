# Quizler Arena

<p align="center">
  <strong>A local-first social game platform where a small family Jeopardy-style prototype grew into an engineering project about constrained search, replayability, data quality, state integrity, and dependable shared-screen play.</strong>
</p>

<p align="center">
  React 18 · TypeScript · JavaScript · Vite · Node.js · localStorage
</p>

<p align="center">
  <a href="https://quizler-arena-portfolio.vercel.app"><strong>Live Demo</strong></a>
</p>

<p align="center">
  <a href="#origin-and-use">Origin</a> ·
  <a href="#my-contribution">Contribution</a> ·
  <a href="#engineering-highlights">Engineering</a> ·
  <a href="#architecture-and-tradeoffs">Architecture</a> ·
  <a href="#iteration-from-real-use">Iteration</a> ·
  <a href="#testing-and-reliability">Testing</a> ·
  <a href="#run-locally">Run locally</a>
</p>

<table>
  <tr>
    <td width="50%">
      <img src="docs/media/lobby.png" alt="Quizler Arena lobby with portals for Quizler Jeopardy, Wordle, and Hangman">
    </td>
    <td width="50%">
      <img src="docs/media/jeopardy.png" alt="Quizler Jeopardy showing a complete six-category Round One board">
    </td>
  </tr>
  <tr>
    <td align="center"><sub><strong>Platform:</strong> three focused local-first game modes connected through one shared lobby.</sub></td>
    <td align="center"><sub><strong>Flagship system:</strong> Jeopardy boards are assembled under freshness, uniqueness, difficulty, topic, and history constraints.</sub></td>
  </tr>
</table>

## At a glance

| Area | Quizler Arena |
| --- | --- |
| **Product** | Three playable local-first modes: Quizler Jeopardy, Wordle, and Hangman |
| **Technical centerpiece** | Recursive Jeopardy board assembly with candidate scoring, constraints, and rollback |
| **Replayability** | History-aware clue, answer, category, topic-family, and full-board novelty tracking |
| **Content pipeline** | 5,600-clue curated expansion across 14 research packs, with reproducible builds and source audits |
| **State integrity** | Saved games are validated before reuse, with corrupted-save regeneration and legacy continuity recovery |
| **Testing** | 200 deterministic complete Jeopardy game packages per smoke run, plus source audits, builds, route checks, and recovery coverage |
| **My role** | I designed and developed the project from the original Jeopardy prototype through the current three-mode platform |

**Implementation references:** [`boardAssembler.js`](src/jeopardy/boardAssembler.js) · [`gameStateAdapter.js`](src/jeopardy/gameStateAdapter.js) · [`questionSourceAdapter.js`](src/jeopardy/questionSourceAdapter.js) · [`jeopardy-runtime-smoke.html`](tools/jeopardy-runtime-smoke.html) · [`data/README.md`](data/README.md)

> **Scope:** Quizler Arena is a local-first, shared-screen platform. The interface includes a clearly labeled multiplayer concept panel, but hosted rooms, remote synchronization, rankings, and matchmaking are not implemented.

## Origin and use

Quizler Arena began during the Christmas period as a small Jeopardy-style game I made to play with family and friends, partly inspired by how much my dad enjoys Jeopardy. The first goal was simple: make one game night fun.

When I returned to the idea as a larger computer science project in April 2026, repeated play exposed problems that a one-time demo would not reveal. Boards could repeat answers, cluster weak categories, lose difficulty progression, restore invalid saved state, or become awkward on a projector or weaker computer.

The project also moved into multiple full-class sessions, where pacing, readability, screen fit, and shared-screen interaction became practical constraints rather than hypothetical ones.

That changed the engineering question from "can I make a trivia game work?" to:

**How do I make a local game platform stay varied, valid, and dependable after repeated use?**

The answer became a set of systems around the game: constrained search, replayability memory, curated data pipelines, state validation, recovery, and deterministic testing.

## My contribution

I designed and developed Quizler Arena from the original social Jeopardy prototype through the current platform. My work includes:

- product direction and the focused three-mode structure;
- the React/Vite platform shell, routing, fullscreen behavior, and shared presentation layer;
- Jeopardy gameplay, constrained board assembly, replayability logic, persistence, and recovery;
- local content repositories, source audits, validators, and bank-generation workflows;
- Wordle and Hangman gameplay, selection behavior, and persistent local state;
- build tooling, deterministic smoke tests, CI checks, and reproducible screenshot capture.

Feedback also changed the project. Michael Tetelbaum encouraged the early move from a single Jeopardy game toward a broader multi-mode Arena. Vladimir Duckardt contributed performance and visual feedback during development and later provided limited debugging help on Hangman asset replacement, staged-image layering, and transition behavior. I credit those contributions separately from my own implementation work.

## What I built

### Quizler Jeopardy

A complete game supports 1 to 4 players, Round One, Double Jeopardy, Final Jeopardy, Daily Doubles, wagering, scoring, pass and steal flow, custom categories, timers, persistence, and history-aware replayability.

A board is not treated as a random sample. Six categories, five playable values per category, increasing difficulty, answer uniqueness, clue uniqueness, topic balance, prior history, and Final Jeopardy all interact.

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

These modes intentionally broaden the product without pretending that every mode has the same engineering center. Quizler Jeopardy remains the project's deepest algorithms, data, state, and testing story.

## Engineering highlights

### 1. Constrained Jeopardy board assembly

A usable board needs more than random categories and clues. The assembler must satisfy several constraints at the same time:

- six distinct categories per round;
- five valid clue values per category;
- strictly increasing clue difficulty within a category;
- no repeated clue IDs, normalized answers, or clue fingerprints;
- bounded topic-family concentration;
- reduced repetition across recent category titles and topic families;
- fresh full-board combinations and family patterns;
- a non-duplicating Final Jeopardy path.

[`boardAssembler.js`](src/jeopardy/boardAssembler.js) scores clues for freshness and target difficulty, ranks categories using history and topic-family information, then searches recursively.

<p align="center">
  <img src="docs/diagrams/board-assembly.svg" alt="Quizler Jeopardy constrained board assembly process with recursive search and rollback" width="100%">
</p>

A simplified failure path looks like this:

```text
rank category candidates
        |
        v
choose a promising category
        |
        v
reserve its clue IDs, answers, fingerprints, and topic slot
        |
        v
later category cannot complete all five valid values
        |
        v
rollback the earlier choice
        |
        v
try the next candidate and continue searching
```

The same idea operates inside individual categories. If one clue choice blocks a later value from finding a unique, harder clue, that clue is removed and another path is tried.

**Freshness is a constrained search problem, not random sampling.**

### 2. Replayability memory and curated data

Repeated play made content selection a data problem. Quizler Jeopardy tracks used clue IDs, normalized answers, clue fingerprints, source categories, category titles, topic families, full-board hashes, title hashes, and family-pattern hashes.

That memory changes future selection instead of resetting to pure randomness after every game.

The content system also grew substantially. The major expansion is stored as **14 research packs with 400 structured rows each**, adding **5,600 clues across 70 category assignments** before the runtime bank is rebuilt.

<p align="center">
  <img src="docs/diagrams/content-pipeline.svg" alt="Quizler Jeopardy curated content build and validation pipeline" width="100%">
</p>

The pipeline separates committed source inputs from generated runtime banks. It audits row and category coverage, value slots, difficulty bands, normalized duplicates, clue formatting, malformed text, answer leakage, protected pre-expansion content, generated-bank freshness, and runtime parity.

Automated checks validate engineering properties, not factual truth. Trivia accuracy and wording still depend on research and human review. The full content process and claim boundaries are documented in [`data/CONTENT_METHODOLOGY.md`](data/CONTENT_METHODOLOGY.md).

**Random is not the same as varied.**

### 3. State integrity and recovery

Jeopardy persists state in browser `localStorage`, but stored data is treated as external input rather than trusted application state.

[`gameStateAdapter.js`](src/jeopardy/gameStateAdapter.js) validates loaded games before reuse. It checks runtime version, player structure, both standard rounds, board validity, and Final Jeopardy data. If a current save is malformed, the application removes it, preserves usable continuity such as player names where possible, and builds a fresh valid state. Older save formats can also be salvaged into the current runtime.

That design prevents the existence of a JSON object in storage from being mistaken for proof that the game is safe to resume.

### 4. Deterministic complete-game testing

A game that works once does not prove that the next generated board will work.

[`tools/jeopardy-runtime-smoke.html`](tools/jeopardy-runtime-smoke.html) constructs **200 deterministic complete game packages** per smoke run. The harness alternates difficulty modes and player counts from 1 to 4, validates both standard rounds and Final Jeopardy, then exercises custom categories, save/load behavior, corrupted-save recovery, and legacy-save salvage.

Wordle also has a smaller but important correctness edge case. Repeated letters are evaluated in two passes so exact-position matches consume answer copies before present-position matches are assigned. That prevents duplicate letters from receiving too many yellow results.

## Architecture and tradeoffs

Quizler Arena uses a hybrid architecture. Wordle and Hangman are native React and TypeScript modes. The newer React shell hosts the mature JavaScript Jeopardy runtime inside an iframe rather than forcing a late rewrite of a working subsystem.

<p align="center">
  <img src="docs/diagrams/architecture.svg" alt="Quizler Arena architecture showing the React platform shell, native Wordle and Hangman modes, and the preserved JavaScript Jeopardy runtime" width="100%">
</p>

That decision preserved the deeper Jeopardy gameplay, generation, and persistence logic while adding unified routing, loading, fullscreen behavior, and platform presentation. The cost is a less direct boundary for shared styling, state, and test orchestration than a complete migration would provide.

### Why I removed live question generation

An early April version experimented with runtime question generation through a hosted service. It accelerated experimentation, but repeated use exposed network dependence, inconsistent output, credential handling, harder inspection, and weaker reproducibility.

The final runtime therefore uses a local question source. Remote generation is explicitly disabled in [`questionSourceAdapter.js`](src/jeopardy/questionSourceAdapter.js).

<p align="center">
  <img src="docs/diagrams/local-first-evolution.svg" alt="Quizler Arena evolution from runtime question generation to a curated local-first architecture" width="100%">
</p>

The local-first design made repeatable builds, source auditing, duplicate control, deterministic testing, safer credential handling, and offline startup possible. The important decision was not adding another system. It was recognizing when an experiment no longer matched the product requirements and removing it.

### Current limitations

- Hosted multiplayer rooms, matchmaking, rankings, and remote synchronization are not implemented.
- Automated content audits cannot determine whether every trivia fact is correct.
- Classroom and family use were not instrumented with production analytics, so I do not claim retention or a distinct-player count.
- The preserved Jeopardy runtime keeps a mature subsystem stable, but it also leaves a less elegant platform boundary than a full typed migration would provide.

## Iteration from real use

Quizler Arena changed through repeated family and social play, multiple full-class sessions, presentation testing, different displays, weaker hardware, debugging, and technical failures.

| What I observed | What changed |
| --- | --- |
| Repeated sessions exposed duplicate answers, repetitive categories, and weak clue combinations | Added history, novelty scoring, topic-family balancing, and constrained board assembly |
| Full-class sessions made projector readability, pacing, screen fit, and shared-screen interaction more demanding | Improved fullscreen behavior, no-scroll layouts, control sizing, and cross-screen stability |
| Weaker hardware made visual complexity a reliability issue | Refined visual layers and fallbacks instead of assuming one ideal machine |
| Runtime-generated questions could be inconsistent or service-dependent | Moved final gameplay to curated local data with reproducible validation |
| Asset replacement could break filenames, fallbacks, or Hangman stage order | Centralized visual asset mapping and explicit stage behavior |
| Saved data could exist while still being structurally invalid | Added validation, corrupted-save regeneration, and legacy continuity recovery |
| One successful board did not prove that future generated games would work | Added deterministic complete-game smoke testing |

The full observation-to-implementation record is in [`docs/ITERATION.md`](docs/ITERATION.md).

## Testing and reliability

The [GitHub Actions workflow](.github/workflows/portfolio-verify.yml) checks two complementary paths:

1. **Portable Linux build:** public-text punctuation lint, production dependency audit, focused core tests, curated Jeopardy source audit, word-game validation, production build, and generated/runtime bank parity.
2. **Full Windows verification:** the deeper platform test run, including the 200-game Jeopardy smoke harness, production and direct-file builds, and route checks for the lobby and all three modes.

A separate manual workflow captures reproducible README screenshots as build artifacts without automatically committing binary files.

Useful focused commands include:

```bash
npm run test:core
npm run bank:audit:sources
npm run bank:audit
npm run wordgames:validate
npm run smoke:legacy
```

## Run locally

### Requirements

- Node.js 20 or newer
- npm

### Development

```bash
npm ci
npm run dev
```

`npm run dev` rebuilds the Jeopardy bank, synchronizes the preserved Jeopardy runtime into the Vite public directory, and starts the development server.

### Production build

```bash
npm run build
```

The normal development and production paths are cross-platform. Windows PowerShell and Microsoft Edge are only required for extended direct-file testing and screenshot capture.

### Full Windows verification

```bash
npm run verify
```

## Repository map

- [`src/platform/`](src/platform): React shell, Wordle, Hangman, shared UI, fullscreen behavior, assets, and routing
- [`src/jeopardy/`](src/jeopardy): Jeopardy repository, validation, board assembly, usage history, persistence, gameplay, and the preserved runtime shell
- [`data/`](data): curated Jeopardy source inputs, word-list inputs, provenance notes, and content methodology
- [`tools/`](tools): build, audit, test, smoke, synchronization, and capture tooling
- [`docs/`](docs): diagrams, product captures, iteration notes, and development history

Generated Jeopardy banks and synchronized public runtime output are ignored by Git and rebuilt from committed inputs. See [`data/README.md`](data/README.md) for the data layout.

## Development history

The public repository was created after the project was already underway. The original development work lived in a separate private repository, and the earliest personal Jeopardy prototype predates that Git history.

```text
small social prototype
  -> runtime-generation experiment
  -> three-mode platform
  -> repeated-play problems
  -> local content and replayability systems
  -> deterministic verification and recovery
```

A dated timeline is in [`docs/DEVELOPMENT_HISTORY.md`](docs/DEVELOPMENT_HISTORY.md).

## Attribution and reuse

Third-party software, word-list sources, collaboration notes, and reuse details are documented in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Quizler Jeopardy is an unofficial independent project inspired by the familiar Jeopardy-style clue-board format. It is not affiliated with or endorsed by the television program or its rights holders.
