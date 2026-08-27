# Quizler Arena Iteration Record

Quizler Arena changed through repeated social play, family and class use, presentation testing, different displays, weaker hardware, debugging, and technical failures. This page records the observations and feedback that materially changed the product.

## Origin

The project began as a small Jeopardy-style game I made during the Christmas period for family and friends, partly inspired by my dad's enthusiasm for Jeopardy. When I revived the idea as a larger computer science project in April 2026, repeated use exposed problems that were easy to miss in a one-time demo.

The project therefore shifted from "make a game that works" toward "make a game platform that stays varied, valid, and dependable after repeated use."

## Feedback that changed the direction

Not every important project decision came from a bug report.

- **Michael Tetelbaum** encouraged the move from a single Jeopardy experience toward a broader platform with additional modes. That feedback helped establish the three-mode Arena structure around Quizler Jeopardy, Wordle, and Hangman.
- **Vladimir Duckardt** raised performance and visual concerns during development, including how a graphics-heavy interface behaved on weaker hardware. He later provided limited debugging help on Hangman asset replacement, stage-image layering, and transition behavior.

I treated those contributions as feedback and debugging support rather than as ownership of the systems I implemented.

## Observation to implementation

| Observation or feedback | Decision | Technical result |
| --- | --- | --- |
| A single Jeopardy game did not provide enough variety for the broader product idea | Expand the concept, then keep the final scope focused | Wordle and Hangman became native modes around a shared three-portal lobby |
| Repeated Jeopardy sessions exposed duplicated answers, weak clue combinations, and repetitive categories | Stop treating randomness as sufficient | Usage history, novelty scoring, topic-family balancing, and recursive constrained board assembly |
| Projector and different-screen use could push gameplay-critical UI out of view | Treat display fit as part of usability | Fullscreen controls, no-scroll layouts, viewport tuning, larger high-priority text, and cross-screen stability work |
| Weaker graphics hardware made visual complexity a practical reliability issue | Prefer dependable interaction when visual complexity conflicts with stability | Visual layers and fallback behavior were refined instead of assuming one ideal machine |
| Runtime-generated questions could be inconsistent or service-dependent | Make final gameplay local-first | Checked local source data, reproducible bank generation, source auditing, and generated-bank parity checks |
| Asset replacement repeatedly broke filenames, fallbacks, or Hangman stage order | Centralize visual source-of-truth rules | Shared asset registry, `AssetLayer`, availability checks, and explicit staged-image mapping |
| A saved game could be syntactically present but structurally invalid | Treat persistence as untrusted input | State validation, corrupted-save regeneration, and legacy continuity salvage |
| A game could appear to work while failing on a different generated board | Test complete generated states, not only one happy path | 200 deterministic full game packages per smoke run plus custom-category and save-recovery coverage |
| A future online mode could be easy to overstate in a polished interface | Separate implemented behavior from product direction | The current UI labels multiplayer only as a concept and does not simulate hosted rooms, rankings, or party links |

## Three decisions that mattered most

### Replacing random selection with constrained search

The early mental model was to choose categories and clues randomly. Repeated play showed that a valid board is a joint constraint problem: categories, clue values, answer uniqueness, difficulty progression, topic balance, and previous history all interact.

The current assembler ranks candidates, searches recursively, and rolls back partial selections that block a valid completion.

### Removing live generation from final gameplay

Runtime generation was useful for exploring content quickly. It also made quality, reproducibility, startup, credential safety, duplicate control, and debugging harder.

I moved final content preparation into an offline drafting and review workflow, with research and answer fact-checking before the structured packs enter the local source pipeline. Final gameplay itself uses checked local data rather than generating questions on demand.

### Testing generated games, not only functions

Many bugs only appear when independent pieces interact. A category can be individually valid while still making a full board impossible. A save can be valid JSON while containing invalid game state. A generated bank can be correct while a stale runtime copy is still loaded.

That is why the verification path checks complete game packages, state recovery, source-to-runtime parity, and route behavior in addition to focused core logic.

## What I did not measure

I did not track a reliable distinct-player count across every family, friend, and classroom session, and I did not collect retention, revenue, or measured performance-improvement metrics.

Automated trivia audits check structural properties such as uniqueness, format, difficulty bands, source parity, and answer leakage. They do not determine factual truth, so research and human review remain separate parts of content quality.
