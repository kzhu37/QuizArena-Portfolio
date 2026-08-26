# Quizler Arena iteration record

Quizler Arena changed through repeated social play, presentation testing, debugging, and technical failures. This document records the main observations that changed the product without inventing user counts or impact metrics that were not measured.

## Observation to implementation

| Observation or feedback | Decision | Technical result |
|---|---|---|
| A single Jeopardy game did not create enough variety for repeated social play | Expand the product, but keep the final scope focused | Wordle and Hangman became native modes around a shared three-portal lobby |
| Different screens and presentation environments could push important UI off-screen | Treat display fit as part of usability | Fullscreen controls, no-scroll layouts, viewport tuning, larger high-priority text, and cross-screen stability work |
| Weaker graphics hardware made visual complexity a practical concern | Prefer dependable interaction over decorative effects when the two conflict | Visual layers and fallback behavior were refined instead of assuming one ideal machine |
| Repeated Jeopardy sessions exposed duplicated answers, weak clue combinations, and repetitive categories | Stop treating randomness as sufficient | Usage history, novelty scoring, family balancing, and recursive constrained board assembly |
| Runtime-generated questions could be inconsistent or service-dependent | Make the final runtime local-first | Authored source packs, reproducible bank generation, source auditing, and generated-bank parity checks |
| Asset replacement repeatedly broke filenames, fallbacks, or Hangman stage order | Centralize visual source-of-truth rules | Shared asset registry, `AssetLayer`, availability checks, and explicit staged-image mapping |
| A saved game could be syntactically present but structurally invalid | Treat persistence as untrusted input | State validation, corrupted-save regeneration, and legacy continuity salvage |
| A game could appear to work while failing on a different generated board | Test complete generated states, not only one happy path | 200 deterministic full game packages per smoke run plus custom-category and save-recovery coverage |
| Presentation-only social controls could be mistaken for implemented networking | Make the boundary visible in the product itself | Buttons now use preview/demo wording and the modal continues to state that rooms and matchmaking are not hosted |

## Two decisions that mattered most

### 1. Replacing random selection with constrained search

The early mental model was to choose categories and clues randomly. Repeated play showed that a valid board is a joint constraint problem: categories, clue values, answer uniqueness, difficulty progression, topic balance, and previous history all interact.

The current assembler therefore ranks candidates, searches recursively, and rolls back partial selections that block a valid completion.

### 2. Removing live generation from the final runtime

Runtime generation looked powerful because it could produce content on demand. It also made quality, reproducibility, startup, credential safety, and debugging harder.

The project kept what the experiment taught me but removed the dependency from final gameplay. That decision is important to the portfolio because it shows that a technology can be useful during exploration without deserving a permanent place in the product.

## Evidence standard

The public portfolio distinguishes between observation and measured impact. It does not report a player count, retention statistic, or performance improvement that was not recorded.

Likewise, automated trivia audits verify structural properties such as uniqueness, format, difficulty bands, source freshness, and answer leakage. They do not automatically establish factual truth.
