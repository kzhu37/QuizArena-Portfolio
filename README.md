# Quizler Arena

<p align="center">
  <strong>A local-first social game platform that turned a simple Jeopardy-style prototype into a systems project about replayability, data quality, state, and reliable shared-screen play.</strong>
</p>

<p align="center">
  React 18 · TypeScript · JavaScript · Vite · Node.js · localStorage
</p>

<p align="center">
  <a href="https://quizler-arena-portfolio.vercel.app"><strong>Live Demo</strong></a>
</p>

<p align="center">
  <a href="#engineering-highlights">Engineering</a> ·
  <a href="#architecture-and-design-decisions">Architecture</a> ·
  <a href="#verification">Verification</a> ·
  <a href="#iteration">Iteration</a> ·
  <a href="#run-locally">Run locally</a>
</p>

<p align="center">
  <img src="docs/media/lobby.webp" alt="Quizler Arena lobby with three playable portals" width="100%">
</p>

| 3 playable modes | Recursive board search | 5,600-clue audited expansion | 200 complete seeded games per smoke run |
|---:|---:|---:|---:|
| Wordle, Quizler Jeopardy, Hangman | Constraint scoring, backtracking, rollback | 14 source packs with 400 rows each | Both rounds, Final Jeopardy, and state paths validated |

> **Scope:** Quizler Arena is a local-first shared-screen platform. Multiplayer and party-link surfaces are presentation previews only. Hosted rooms, matchmaking, and remote synchronization are not implemented.

## From a social game to a systems problem

I first built a small Jeopardy-style game to play with family and friends. When I returned to the idea as a larger computer science project in April 2026, repeated play exposed problems that were more interesting than simply adding screens: weak clue combinations, repeated content, brittle assets, projector readability, bad saved state, and dependence on live question generation.

The project became a focused three-mode platform around Wordle, Quizler Jeopardy, and Hangman. The strongest engineering work came from asking a different question: **would the game still feel reliable and varied after repeated use?**

> **Portfolio note:** This repository is a curated public showcase assembled after the original project was already underway. The underlying development history records the April to August evolution; the earliest personal prototype predates that Git history. A concise evidence-based timeline is in [`docs/DEVELOPMENT_HISTORY.md`](docs/DEVELOPMENT_HISTORY.md).

## What I built

<table>
  <tr>
    <td width="50%">
      <img src="docs/media/wordle.webp" alt="Quizler Arena Wordle mode with statistics, puzzle grid, and keyboard">
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

<p align="center">
  <img src="docs/media/jeopardy.png" alt="Quizler Jeopardy showing a complete six-category Round One board" width="100%">
</p>

<p align="center">
  <sub><strong>Quizler Jeopardy:</strong> the flagship 1 to 4 player mode with two rounds, Final Jeopardy, Daily Doubles, wagering, custom categories, timers, scoring, saving, and replayability history.</sub>
</p>

The social controls visible in some documentation captures are demo UI, not evidence of hosted multiplayer. The current interface labels these controls as previews before a user enters the concept flow.

## Engineering highlights

### 1. Constrained Jeopardy board assembly

A replayable board cannot be built well by picking random clues. A complete game has to satisfy several conditions at the same time:

- six distinct categories per round
- five playable value slots per category
- strictly increasing clue difficulty inside each category
- no repeated clue IDs, normalized answers, or clue fingerprints
- subject-family diversity
- fresh category titles and board patterns
- Final Jeopardy options that do not duplicate the main board

[`boardAssembler.js`](src/jeopardy/boardAssembler.js) scores clue candidates for freshness and target difficulty, ranks categories using recency and subject-family history, then searches recursively. If one choice makes the remaining board impossible, the assembler rolls it back and tries another path.

<p align="center">
  <img src="docs/diagrams/board-assembly.svg" alt="Quizler Jeopardy constrained board assembly process" width="100%">
</p>

**Freshness is treated as a constrained search problem, not as random sampling.**

### 2. A content bank built as a reproducible pipeline

The Jeopardy content system grew into a data-engineering problem. The major curated expansion is stored as **14 authored source packs with 400 rows each**, adding **5,600 clues across 70 category assignments** before the runtime bank is rebuilt.

The source audit and generated-bank validator check properties such as:

- required row counts, category coverage, and value-slot coverage
- difficulty bands for Round One and Double Jeopardy
- duplicate normalized answers and duplicate clue text
- Jeopardy-style response formatting
- malformed text and unresolved identifiers
- answers accidentally revealed inside clue text
- conflicts with protected pre-expansion content
- generated-bank parity and stale build inputs

<p align="center">
  <img src="docs/diagrams/content-pipeline.svg" alt="Quizler Jeopardy content build and validation pipeline" width="100%">
</p>

Generated runtime banks are build products, not hand-edited source files. The pipeline now has a cross-platform Node build path for normal development and deployment, while the older PowerShell implementation remains useful as a historical reference and Windows verification path.

The automated checks prove **structure, uniqueness, formatting, difficulty constraints, and source parity**. They are not presented as an automated factual truth checker. Trivia quality still depends on the human research and review behind the authored source material.

### 3. Replayability uses memory, not just randomness

Quizler Jeopardy remembers used clue IDs, normalized answers, clue fingerprints, source category IDs, category titles, subject families, full board hashes, title hashes, and family patterns. Wordle and Hangman use smaller history windows and weighted novelty rules suited to their own content.

For example, Wordle avoids recent answers and penalizes recent letter similarity, prefixes, and suffixes. The result is still variable, but obvious repetition becomes less likely.

This became one of the project's clearest lessons: **random is not the same as varied.**

### 4. Defensive state and recovery

The Jeopardy runtime persists game state in browser `localStorage`, but saved data is not automatically trusted. [`gameStateAdapter.js`](src/jeopardy/gameStateAdapter.js) validates loaded state, regenerates a valid game when the current save is malformed, and can preserve usable player continuity while rebuilding legacy saves.

That changed saving from a convenience feature into a data-integrity problem: persistent state is external input and needs validation too.

### 5. Mode-specific correctness and visual reliability

Wordle uses a two-pass repeated-letter evaluation so exact-position matches consume answer copies before present-position matches are assigned. This avoids a common clone bug where repeated letters receive too many yellow results.

The visual layer also became an engineering concern. Asset paths are centralized in [`assets.ts`](src/platform/assets.ts), rendered through a shared [`AssetLayer`](src/platform/AssetLayer.tsx), and checked for availability so replacing backgrounds, host poses, or Hangman stages does not require scattered path changes.

## Architecture and design decisions

Quizler Arena uses a hybrid architecture. Wordle and Hangman are native React and TypeScript modes. The newer React shell hosts the mature JavaScript Jeopardy runtime inside an iframe rather than forcing an immediate rewrite of a working subsystem.

<p align="center">
  <img src="docs/diagrams/architecture.svg" alt="Quizler Arena hybrid React and JavaScript architecture" width="100%">
</p>

That choice reduced rewrite risk and preserved the deeper Jeopardy gameplay and board-generation logic while giving the platform unified routing, loading, fullscreen behavior, and visual presentation. The tradeoff is that the iframe boundary makes shared state, styling, and test orchestration less direct than a full migration would.

### From live generation to local-first content

An early April version experimented with generating questions at runtime through a hosted language-model API. That was useful for exploring content quickly, but repeated use made the costs clearer: network dependence, inconsistent output, harder inspection, credential handling, and weaker reproducibility.

The current runtime deliberately uses a local question source. Remote generation is disabled in [`questionSourceAdapter.js`](src/jeopardy/questionSourceAdapter.js).

<p align="center">
  <img src="docs/diagrams/local-first-evolution.svg" alt="Evolution from live question generation to the current local-first architecture" width="100%">
</p>

The change improved startup independence, repeatable builds, duplicate controls, difficulty validation, automated testing, and credential safety. It was an important judgment call: a newer technology had been useful for experimentation, but reliability and control were better requirements for the final product.

## Verification

The project treats verification as part of the build rather than as a final manual check.

### Complete-game smoke testing

[`tools/jeopardy-runtime-smoke.html`](tools/jeopardy-runtime-smoke.html) constructs **200 deterministic complete game packages** in every smoke run, alternating difficulty modes and player counts from 1 to 4. For each package it validates both main rounds and Final Jeopardy.

The same harness also exercises custom categories, two custom rounds, Final Jeopardy selection, even custom-category draft distribution, fresh save/load behavior, corrupted-save recovery, and legacy-save salvage.

### Portable build and Windows verification

GitHub Actions now checks two complementary paths:

1. **Portable build on Linux:** install dependencies, run focused core-logic tests, lint portfolio writing, audit authored Jeopardy sources, build the full Vite application with the cross-platform Node bank builder, and validate generated/runtime parity.
2. **Full Windows verification:** run the complete bank audit and 200-game smoke harness, build the browser application and direct-file shell, smoke-test the lobby and all three routes, then capture reproducible CI screenshots as build artifacts.

The focused tests cover normalization, answer-leakage detection, and ascending-difficulty search behavior. The larger smoke harness then checks the assembled system rather than only isolated helpers.

See [`.github/workflows/portfolio-verify.yml`](.github/workflows/portfolio-verify.yml) for the exact CI sequence.

## Iteration

Quizler Arena was not developed from a fixed specification. Repeated play, presentation testing, technical failures, and feedback changed what I prioritized.

| Observed problem | Engineering response |
|---|---|
| One game did not provide enough variety for repeated social play | Focus the platform on three distinct modes and add history-aware selection |
| Projector and weaker-device use exposed layout and readability problems | Improve fullscreen behavior, no-scroll layouts, control sizing, and cross-screen stability |
| Repeated Jeopardy games exposed weak combinations and content repetition | Expand the bank, track usage history, and replace simple random selection with constrained assembly |
| Asset replacement caused stale paths and incorrect staged Hangman visuals | Centralize asset paths and use a shared availability-aware rendering layer |
| Runtime generation was novel but inconsistent and service-dependent | Move final gameplay to curated local data with reproducible validation |
| A feature could work once and still fail after persistence or migration | Validate saved state, recover corrupted saves, and add deterministic smoke testing |

The detailed iteration record, including claim boundaries and the evidence behind these changes, is in [`docs/ITERATION.md`](docs/ITERATION.md).

## My contribution

**I designed and developed Quizler Arena**, from the original Jeopardy prototype through the current three-mode platform. My work includes:

- product direction and the focused three-mode structure
- the React/Vite shell, routing, lobby, fullscreen flow, and mode integration
- Jeopardy gameplay architecture and continued iteration
- constrained board assembly and replayability logic
- local content repositories, source auditing, validation, and bank-building workflows
- Wordle and Hangman gameplay and selection behavior
- persistence, save recovery, asset reliability, and interaction polish
- build, smoke-test, CI, and portfolio-capture tooling

[Vladimir Duckardt](https://github.com/VDuckardtt) provided **limited debugging help on visual implementation issues**, particularly Hangman asset replacement and stage-image layering and transition behavior. Those contributions are credited here and are not presented as my work.

AI-assisted development tools were used during parts of implementation, debugging, content drafting, and visual experimentation. Generated material was treated as implementation material to inspect, test, revise, or replace. One of the project's largest later changes was specifically moving away from runtime generation toward local data and reproducible validation.

## Development history

| Period | What changed |
|---|---|
| **Early April 2026** | Moved the personal Jeopardy prototype into active development, experimented with runtime question generation, and added deterministic smoke tooling |
| **Mid-April 2026** | Built the React/Vite platform shell, narrowed the product to Wordle, Quizler Jeopardy, and Hangman, and refined lobby, fullscreen, assets, and presentation readability |
| **Late April to May 2026** | Improved cross-screen stability, category handling, clue quality, duplicate prevention, difficulty behavior, and the local question bank |
| **August 2026** | Added the 5,600-clue authored expansion, strengthened source and parity audits, reinforced the local-first runtime, and curated the project as a public technical portfolio |

For commit-level evidence and the distinction between the original development repository and this showcase repository, see [`docs/DEVELOPMENT_HISTORY.md`](docs/DEVELOPMENT_HISTORY.md).

## Run locally

### Requirements

- Node.js 20 or newer
- npm

### Development

```bash
npm ci
npm run dev
```

`npm run dev` rebuilds the Jeopardy bank, synchronizes the legacy runtime into the Vite public directory, and starts the development server.

### Production build

```bash
npm run build
```

The normal development and production build paths are cross-platform. Windows PowerShell and Microsoft Edge are only required for the extended direct-file verification and screenshot-capture tooling.

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

- [`src/platform/`](src/platform): React shell, Wordle, Hangman, shared UI, fullscreen, assets, and routing
- [`src/jeopardy/`](src/jeopardy): Jeopardy repository, validation, board assembly, usage history, state, and gameplay
- [`data/`](data): authored content sources, historical validation references, and word-list inputs
- [`tools/`](tools): build, audit, test, smoke, sync, and capture tooling
- [`docs/`](docs): architecture diagrams, product captures, iteration evidence, and development history

Generated Jeopardy runtime banks and synchronized legacy output are intentionally ignored by Git and rebuilt from committed source inputs. See [`data/README.md`](data/README.md) for the data layout and provenance model.

## Current boundaries

Quizler Arena is currently a **local-first shared-screen platform with three playable modes**.

The multiplayer and party-link interfaces are presentation previews. They do not create online rooms or matchmaking. The project also does not claim that its automated trivia validators prove factual correctness; those tools enforce engineering and content-structure constraints.

Possible future directions include hosted multiplayer and deeper migration of the legacy Jeopardy runtime into the React codebase. They are future work, not completed features.

## What I learned

**Reliability can matter more than novelty.** Live generation was useful to explore, but a tested local content pipeline became a better fit for the product.

**Random is not the same as varied.** Replayable games need memory, constraints, weighting, and deliberate diversity.

**Persistent data should be treated as untrusted input.** Save recovery became more robust once stored state was validated instead of assumed correct.

**Finishing a first version is not the end of the engineering.** Many of the strongest systems in the project appeared only after repeated use exposed where the earlier version failed.

## Attribution and project notes

Quizler Arena includes third-party software packages and word-list sources. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for source and reuse notes.

Quizler Jeopardy is an unofficial independent project inspired by the familiar Jeopardy-style clue-board format. It is not affiliated with or endorsed by the television program or its rights holders.