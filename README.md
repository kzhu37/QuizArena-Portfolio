# Quizler Arena

<p align="center">
  <strong>A local-first social game platform built from a family Jeopardy prototype. Its flagship mode turns repeated play into a constrained search problem: generate fresh, valid boards while preserving difficulty, topic balance, replayability, and recoverable state.</strong>
</p>

<p align="center">
  React 18 · TypeScript · JavaScript · Vite · Node.js · localStorage
</p>

<p align="center">
  <a href="https://quizler-arena-portfolio.vercel.app"><strong>Live Demo</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/kzhu37/QuizArena-Portfolio/actions/workflows/portfolio-verify.yml"><img alt="Portfolio verify" src="https://github.com/kzhu37/QuizArena-Portfolio/actions/workflows/portfolio-verify.yml/badge.svg"></a>
</p>

<table>
  <tr>
    <td width="54%">
      <img src="docs/media/jeopardy.webp" alt="Quizler Jeopardy showing a complete six-category Round One board">
    </td>
    <td width="46%">
      <img src="docs/diagrams/board-assembly.svg" alt="Quizler Jeopardy constrained board assembly process with recursive search and rollback">
    </td>
  </tr>
  <tr>
    <td align="center"><sub><strong>Playable system:</strong> the flagship Jeopardy mode builds complete boards for repeated shared-screen play.</sub></td>
    <td align="center"><sub><strong>Engineering center:</strong> candidate scoring, coupled constraints, recursive search, and rollback replace simple random sampling.</sub></td>
  </tr>
</table>

<p align="center">
  <a href="#at-a-glance">Overview</a> ·
  <a href="#engineering-center-constrained-board-generation">Engineering</a> ·
  <a href="#replayability-state-integrity-and-recovery">State</a> ·
  <a href="#content-pipeline-and-verified-scale">Content</a> ·
  <a href="#from-family-game-to-repeatable-system">Iteration</a> ·
  <a href="#architecture-and-tradeoffs">Architecture</a> ·
  <a href="#verification-and-ci">Verification</a> ·
  <a href="#run-locally">Run locally</a> ·
  <a href="#contribution-and-collaboration">Contribution</a>
</p>

## At a glance

| Area | Quizler Arena |
| --- | --- |
| **Product** | Three playable local-first modes: Quizler Jeopardy, Wordle, and Hangman |
| **Origin** | Began as a Christmas family and friends Jeopardy-style prototype, then became a larger platform project in April 2026 |
| **Real use** | Repeated family and social play plus multiple full-class sessions exposed replayability, pacing, projector readability, and screen-fit problems |
| **Technical centerpiece** | Recursive Jeopardy board assembly with candidate scoring, coupled constraints, backtracking, and rollback |
| **Current Jeopardy bank** | 8,319 regular clues plus 262 Final Jeopardy clues in the validated local runtime |
| **Replayability** | History-aware clue, answer, category, topic-family, and full-board novelty tracking |
| **Verification** | 200 deterministic complete Jeopardy game packages per smoke run, plus focused tests, source audits, type checking, builds, route checks, persistence, and recovery coverage |
| **My role** | Sole designer and developer from the original social prototype through the current three-mode platform |

**Core implementation:** [`boardAssembler.js`](src/jeopardy/boardAssembler.js) · [`gameStateAdapter.js`](src/jeopardy/gameStateAdapter.js) · [`usageTracker.js`](src/jeopardy/usageTracker.js) · [`questionSourceAdapter.js`](src/jeopardy/questionSourceAdapter.js) · [`jeopardy-runtime-smoke.html`](tools/jeopardy-runtime-smoke.html)

## Engineering center: constrained board generation

Repeated play exposed a problem that random selection could not solve. A valid board is a joint constraint problem: category freshness, topic balance, clue value, increasing difficulty, answer uniqueness, clue uniqueness, recent history, and full-board novelty all interact.

A standard round must satisfy constraints including:

- six distinct categories;
- five playable values per category;
- strictly increasing clue difficulty within each category;
- no repeated clue IDs, normalized answers, or clue fingerprints;
- bounded topic-family concentration;
- reduced repetition across recent category titles and topic families;
- fresh board, title-set, and family-pattern combinations;
- a Final Jeopardy path that does not duplicate board answers or fingerprints.

[`boardAssembler.js`](src/jeopardy/boardAssembler.js) scores clue candidates for freshness and target difficulty, ranks categories using usage history and topic-family information, then searches recursively. If an early choice prevents a later category or clue value from completing legally, the assembler rolls that choice back and tries another path.

```text
rank candidates
      |
      v
choose a promising category
      |
      v
reserve clues, answers, fingerprints, and topic capacity
      |
      v
later choice cannot complete all required values
      |
      v
rollback the earlier choice
      |
      v
try the next candidate and continue searching
```

The same backtracking idea operates inside individual categories. A clue can look valid locally while blocking a later value from finding a unique, harder clue, so the assembler can unwind that clue choice and continue searching.

### Search strategy and bounds

The assembler is deliberately a **bounded heuristic search**, not an exhaustive optimizer. Category candidates are ranked using freshness, recency, topic-family balance, and difficulty heuristics; each recursive step considers at most 30 ranked category candidates, with up to 36 attempts to assemble a round and 48 attempts to assemble a complete game package.

Those limits keep generation predictable while still allowing rollback when a promising local choice creates a dead end. The scoring weights are hand-designed heuristics rather than a learned model, so the system aims for valid, varied boards without claiming a mathematically optimal board.

**The central lesson was that freshness is a constrained search problem, not random sampling.**

## Replayability, state integrity, and recovery

Quizler Jeopardy carries memory across play instead of resetting to pure randomness after each game. [`usageTracker.js`](src/jeopardy/usageTracker.js) records used clue IDs, normalized answers, source categories, category titles, topic families, and hashes for recent boards, title sets, and family patterns. Those histories influence future candidate scores and exclusions.

Persistence is treated as untrusted input. [`gameStateAdapter.js`](src/jeopardy/gameStateAdapter.js) validates runtime version, player structure, both standard rounds, board integrity, and Final Jeopardy data before accepting saved state. If current saved state is malformed, the application removes it, preserves limited continuity such as player names where possible, and regenerates a fresh valid game. Older save formats can also be salvaged into the current runtime.

<p align="center">
  <img src="docs/diagrams/architecture.svg" alt="Quizler Arena architecture showing the React shell, three game modes, the preserved Jeopardy runtime, replayability history, state validation, and local persistence" width="100%">
</p>

The result is a local-first system designed to remain varied and recoverable across repeated sessions, not only to produce one successful demo run.

## Content pipeline and verified scale

The current validated runtime contains **8,319 regular clues and 262 Final Jeopardy clues**. A major August expansion contributed **5,600 source rows across 14 structured packs**, covering **70 category assignments** before the runtime bank was rebuilt.

The expansion used **AI-assisted drafting under a fixed structured format**. I defined the source format and constraints, used generative AI for initial structured clue and response drafts, then researched and fact-checked answers, corrected weak or problematic entries, integrated the reviewed packs into the source-of-truth workflow, and built the normalization, duplicate-control, audit, generation, and parity systems around them. I do not present the 5,600 rows as individually hand-written from scratch.

<p align="center">
  <img src="docs/diagrams/content-pipeline.svg" alt="Quizler Jeopardy content build and validation pipeline" width="100%">
</p>

The source audit checks pack and row counts, category/value coverage, difficulty bands, normalized duplicates, clue fingerprints, answer leakage, malformed text, protected pre-expansion content, generated-source freshness, and runtime parity. The latest verified source audit reports all 5,600 expansion rows with 5,600 unique normalized answers and 5,600 unique clues, with no structural problems reported.

Automated checks establish engineering properties, not factual truth. Trivia accuracy, ambiguity, and wording still require research and human review. The methodology and claim boundaries are documented in [`data/CONTENT_METHODOLOGY.md`](data/CONTENT_METHODOLOGY.md).

## From family game to repeatable system

Quizler Arena began during the Christmas period as a small Jeopardy-style game I made for family and friends, partly inspired by how much my dad enjoys Jeopardy. The first goal was simple: make one game night fun.

When I returned to the idea as a larger computer science project in April 2026, repeated use exposed problems that a one-time demo would miss. The project later moved into multiple full-class sessions, where pacing, projector readability, screen fit, and shared-screen interaction became practical constraints.

| Observation | Engineering response |
| --- | --- |
| Repeated sessions exposed duplicate answers, repetitive categories, and weak clue combinations | Added usage history, novelty scoring, topic-family balancing, and constrained assembly |
| Full-class sessions made projector readability, pacing, and screen fit more demanding | Improved fullscreen behavior, no-scroll layouts, control sizing, and cross-screen stability |
| Weaker hardware made visual complexity a reliability issue | Refined visual layers and fallbacks instead of assuming one ideal machine |
| Runtime-generated questions could be inconsistent or service-dependent | Moved final gameplay to checked local data with reproducible validation |
| Asset replacement could break filenames, fallbacks, or Hangman stage order | Centralized visual asset mapping and explicit stage behavior |
| A saved object could exist while violating game invariants | Added state validation, recovery, and legacy continuity salvage |
| One successful generated board did not prove future boards would work | Added deterministic complete-game smoke testing |

The detailed observation-to-implementation record is in [`docs/ITERATION.md`](docs/ITERATION.md), and the dated development sequence is in [`docs/DEVELOPMENT_HISTORY.md`](docs/DEVELOPMENT_HISTORY.md).

## Three playable modes

<p align="center">
  <img src="docs/media/lobby.webp" alt="Quizler Arena lobby with portals for Quizler Jeopardy, Wordle, and Hangman" width="94%">
</p>

### Quizler Jeopardy

A complete game supports 1 to 4 players, Round One, Double Jeopardy, Final Jeopardy, Daily Doubles, wagering, scoring, pass and steal flow, custom categories, timers, persistence, and history-aware replayability.

### Wordle and Hangman

<table>
  <tr>
    <td width="50%">
      <img src="docs/media/wordle.webp" alt="Quizler Arena Wordle mode with statistics, puzzle grid, and keyboard">
    </td>
    <td width="50%">
      <img src="docs/media/hangman.webp" alt="Quizler Arena Hangman mode with a live puzzle, hints, misses, and keyboard state">
    </td>
  </tr>
  <tr>
    <td align="center"><sub><strong>Wordle:</strong> keyboard input, persistent statistics, novelty-aware answer selection, and two-pass duplicate-letter evaluation.</sub></td>
    <td align="center"><sub><strong>Hangman:</strong> word and phrase modes, hints, staged visuals, dialogue, keyboard input, and weighted puzzle selection.</sub></td>
  </tr>
</table>

These modes broaden the product without pretending that every mode has the same engineering center. Quizler Jeopardy remains the project's deepest algorithms, data, state, and testing story.

## Architecture and tradeoffs

Quizler Arena uses a hybrid architecture. Wordle and Hangman are native React and TypeScript modes. The newer React shell hosts the mature JavaScript Jeopardy runtime inside an iframe instead of forcing a late rewrite of a working subsystem.

That choice preserved deeper Jeopardy gameplay, board assembly, replayability, and persistence logic while adding unified routing, loading, fullscreen behavior, and platform presentation. The cost is a less direct boundary for shared styling, state, and test orchestration than a full typed migration would provide.

An early April version also experimented with runtime question generation through a hosted service. It accelerated experimentation but introduced network dependence, inconsistent output, credential handling, harder inspection, and weaker reproducibility. The final runtime uses a checked local source instead, and remote generation is explicitly disabled in [`questionSourceAdapter.js`](src/jeopardy/questionSourceAdapter.js).

Hosted multiplayer rooms, matchmaking, rankings, and remote synchronization remain outside the implemented scope. They are not simulated in the current product.

## Verification and CI

A game that works once does not prove that the next generated board will work. [`tools/jeopardy-runtime-smoke.html`](tools/jeopardy-runtime-smoke.html) constructs **200 deterministic complete game packages** per smoke run. It alternates difficulty modes and player counts from 1 to 4, validates both rounds and Final Jeopardy, checks package-wide uniqueness and difficulty progression, then exercises custom categories, save/load behavior, corrupted-save recovery, and legacy continuity salvage.

Focused Node tests cover normalization and difficulty-path logic plus two centerpiece behaviors: forced category-level rollback and usage-history influence on future selection.

The [GitHub Actions workflow](.github/workflows/portfolio-verify.yml) checks two complementary paths:

1. **Portable Linux verification:** production dependency audit at moderate severity, public-writing punctuation lint, strict TypeScript checking, focused tests, curated Jeopardy source audit, Wordle/Hangman validation, production build, and generated/runtime bank parity.
2. **Full Windows verification:** public-writing lint, strict TypeScript checking, and deeper platform verification, including the 200-game Jeopardy smoke harness, production and direct-file builds, and route checks for the lobby and all three modes.

A separate manual capture job reproduces the four README screenshots from a production build as workflow artifacts. The committed README images are optimized WebP copies of production captures rather than hand-built mockups.

Useful commands:

```bash
npm test
npm run verify:portable
npm run verify
```

### Current limitations

- Automated content audits cannot determine whether every trivia fact is correct.
- Classroom and family use were not instrumented with production analytics, so I do not claim retention or a distinct-player count.
- The preserved Jeopardy runtime keeps a mature subsystem stable, but it also leaves a less direct platform boundary than a complete typed migration would provide.

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

### Verification

```bash
npm test
npm run verify:portable
```

`npm test` runs the focused cross-platform logic tests. `npm run verify:portable` reproduces the portable CI path locally. The deeper Windows verification and reproducible screenshot capture require Windows PowerShell and Microsoft Edge.

```bash
npm run verify
```

## Repository map

- [`src/platform/`](src/platform): React shell, Wordle, Hangman, shared UI, fullscreen behavior, assets, and routing
- [`src/jeopardy/`](src/jeopardy): Jeopardy repository, validation, board assembly, usage history, persistence, and gameplay
- [`data/`](data): reviewed source inputs, word-list inputs, provenance notes, and content methodology
- [`tools/`](tools): build, audit, test, smoke, synchronization, and capture tooling
- [`docs/`](docs): diagrams, optimized product captures, iteration notes, development history, and visual-asset provenance

Generated Jeopardy banks and synchronized public runtime output are ignored by Git and rebuilt from committed inputs. See [`data/README.md`](data/README.md) for the data layout.

## Contribution and collaboration

I designed and developed Quizler Arena from the original social Jeopardy prototype through the current platform. My work includes:

- product direction and the focused three-mode structure;
- the React/Vite platform shell, routing, fullscreen behavior, and shared presentation layer;
- Jeopardy gameplay, constrained board assembly, replayability logic, persistence, and recovery;
- local content repositories, source audits, validators, and bank-generation workflows;
- Wordle and Hangman gameplay, selection behavior, and persistent local state;
- build tooling, deterministic smoke tests, CI checks, and reproducible screenshot capture.

Feedback also changed the project. **Michael Tetelbaum** encouraged the early move from a single Jeopardy game toward a broader multi-mode Arena. **Vladimir Duckardt** provided performance and visual feedback during development and later gave limited debugging help on Hangman asset replacement, staged-image layering, and transition behavior. Those contributions are credited separately from my implementation work.

## Attribution and reuse

Third-party software, word-list sources, collaboration notes, AI-assisted content drafting, visual-asset provenance, and reuse details are documented in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and [`docs/ASSET_PROVENANCE.md`](docs/ASSET_PROVENANCE.md).

Quizler Jeopardy is an unofficial independent project inspired by the familiar Jeopardy-style clue-board format. It is not affiliated with or endorsed by the television program or its rights holders.
