# Data and Content Sources

Quizler Arena keeps reviewable source inputs separate from generated runtime data so large content changes can be audited, rebuilt, and compared reproducibly.

## Jeopardy bank

`data/jeopardy-bank/` contains the committed inputs used by the bank pipeline:

| Input | Purpose |
| --- | --- |
| `researched-expansion-01.tsv` through `researched-expansion-14.tsv` | Fourteen reviewed structured expansion packs, each expected to contain 400 rows |
| `manual-existing-category-topoff.tsv` | Reviewed additions that strengthen existing categories without unnecessary category sprawl |
| `original-answer-blacklist.json` | Protected historical answer keys used to prevent accidental reuse |
| `pre-expansion-tracking.json` | Historical clue and answer tracking used for freshness and migration checks |
| `pre-major-expansion-stats.json` | Snapshot of bank size immediately before the major August expansion |
| `approved-pre-expansion-corrections.json` | Explicit manifest for reviewed corrections that would otherwise look like protected-content reuse |
| `bank-blueprint.ps1` | Historical PowerShell parser retained as an independent reference path |

The normal pipeline is:

```text
AI-assisted structured drafts
  -> human research, fact-checking, and correction
  -> committed reviewed source packs
  -> source audit
  -> expanded-bank.tsv
  -> runtime bank build
  -> round1-bank.js / round2-bank.js / final-bank.js
  -> runtime parity audit
```

`expanded-bank.tsv` and the three runtime JavaScript banks are generated files and are intentionally ignored by Git. `public/legacy/` is also generated during the build.

The cross-platform production path uses `tools/build-jeopardy-bank.cjs` and `tools/sync-legacy-runtime.cjs`. Windows verification keeps the older PowerShell tooling as an independent reference path.

The 14 structured packs contain the 5,600-row August expansion described in the project README. I defined the structured format and constraints, used generative AI for initial structured clue and response drafts, then researched and fact-checked answers, corrected problems, and integrated the reviewed packs into the source-of-truth workflow. See [`CONTENT_METHODOLOGY.md`](CONTENT_METHODOLOGY.md) for the complete process and claim boundaries.

## Word-game sources

`data/word-lists/` contains third-party word-list inputs used by the Wordle and Hangman tooling. Runtime-ready Wordle data is filtered and built into `src/platform/data/wordle/` rather than loading raw source files directly in the interface.

The committed vocabulary files are:

- `google-10000-english-no-swears.txt`, sourced from `first20hours/google-10000-english`;
- `words_alpha.txt`, sourced from `dwyl/english-words`.

Source and reuse details are documented in [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## What validation checks

The data pipeline checks engineering properties such as:

- required row structure and pack counts;
- category and value-slot coverage;
- normalized duplicates and clue fingerprints;
- difficulty bands;
- answer leakage;
- malformed or placeholder text;
- protected historical content reuse;
- generated-source freshness;
- generated/runtime count and hash parity.

Those checks catch structural and consistency failures. They do not determine whether a trivia fact is true, so factual quality still depends on research and human review.