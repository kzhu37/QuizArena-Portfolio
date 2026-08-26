# Quizler Arena Iteration Record

Quizler Arena changed through repeated social play, family and class use, presentation testing, different displays, weaker hardware, debugging, and technical failures. This page collects the observations that actually changed the product.

## Origin

The project began as a small Jeopardy-style game I made during the Christmas period for family and friends, partly inspired by my dad's enthusiasm for Jeopardy. When I revived the idea as a larger computer science project in April 2026, repeated use exposed problems that were easy to miss in a one-time demo.

The project therefore shifted from "make a game that works" toward "make a game platform that stays varied, valid, and dependable after repeated use."

## Observation to implementation

| Observation or feedback | Decision | Technical result |
| --- | --- | --- |
| A single Jeopardy game did not create enough variety for repeated social play | Expand the product, then keep the final scope focused | Wordle and Hangman became native modes around a shared three-portal lobby |
| Repeated Jeopardy sessions exposed duplicated answers, weak clue combinations, and repetitive categories | Stop treating randomness as sufficient | Usage history, novelty scoring, topic-family balancing, and recursive constrained board assembly |
| Projector and different-screen use could push gameplay-critical UI out of view | Treat display fit as part of usability | Fullscreen controls, no-scroll layouts, viewport tuning, larger high-priority text, and cross-screen stability work |
| Weaker graphics hardware made visual complexity a practical reliability issue | Prefer dependable interaction when visual complexity conflicts with stability | Visual layers and fallback behavior were refined instead of assuming one ideal machine |
| Runtime-generated questions could be inconsistent or service-dependent | Make final gameplay local-first | Curated research packs, reproducible bank generation, source auditing, and generated-bank parity checks |
| Asset replacement repeatedly broke filenames, fallbacks, or Hangman stage order | Centralize visual source-of-truth rules | Shared asset registry, `AssetLayer`, availability checks, and explicit staged-image mapping |
| A saved game could be syntactically present but structurally invalid | Treat persistence as untrusted input | State validation, corrupted-save regeneration, and legacy continuity salvage |
| A game could appear to work while failing on a different generated board | Test complete generated states, not only one happy path | 200 deterministic full game packages per smoke run plus custom-category and save-recovery coverage |
| Presentation-only social controls could be mistaken for implemented networking | Make the boundary visible in the product itself | Preview wording and explicit notices state that rooms and matchmaking are not hosted |

## Two decisions that mattered most

### Replacing random selection with constrained search

The early mental model was to choose categories and clues randomly. Repeated play showed that a valid board is a joint constraint problem: categories, clue values, answer uniqueness, difficulty progression, topic balance, and previous history all interact.

The current assembler ranks candidates, searches recursively, and rolls back partial selections that block a valid completion.

### Removing live generation from final gameplay

Runtime generation was useful for exploring content quickly. It also made quality, reproducibility, startup, credential safety, duplicate control, and debugging harder.

I kept what the experiment taught me but removed the dependency from final gameplay. The current system uses curated local data and reproducible validation instead.

## What I did not measure

I did not track a reliable distinct-player count across every family, friend, and classroom session, and I did not collect retention, revenue, or performance-improvement metrics.

Automated trivia audits check structural properties such as uniqueness, format, difficulty bands, source parity, and answer leakage. They do not determine factual truth, so research and human review still matter.
