# Data and content sources

Quizler Arena keeps curated source inputs separate from generated runtime data so large content changes can be reviewed, audited, and rebuilt reproducibly.

## Jeopardy bank

`data/jeopardy-bank/` contains the committed inputs used by the bank pipeline:

| Input | Purpose |
| --- | --- |
| `researched-expansion-01.tsv` through `researched-expansion-14.tsv` | Fourteen curated research packs, each expected to contain 400 structured rows |
| `manual-existing-category-topoff.tsv` | Reviewed additions that strengthen existing categories without unnecessary category sprawl |
| `original-answer-blacklist.json` | Protected historical answer keys used to prevent accidental reuse |
| `pre-expansion-tracking.json` | Historical clue and answer tracking used for freshness and migration checks |
| `pre-major-expansion-stats.json` | Snapshot of bank size immediately before the major August expansion |
| `approved-pre-expansion-corrections.json` | Explicit manifest for reviewed corrections that would otherwise look like protected-content reuse |
| `bank-blueprint.ps1` | Historical PowerShell parser for the generated TSV source |

The normal pipeline is:

```text
curated source inputs
  -> source audit
  -> expanded-bank.tsv
  -> runtime bank build
  -> round1-bank.js / round2-bank.js / final-bank.js
  -> runtime parity audit
```

`expanded-bank.tsv` and the three runtime JavaScript banks are generated files and are intentionally ignored by Git. `public/legacy/` is also generated during the build.

The cross-platform production path uses `tools/build-jeopardy-bank.cjs` and `tools/sync-legacy-runtime.cjs`. Windows verification keeps the older PowerShell tooling as an independent reference path.

The 14 research packs contain the 5,600-clue major expansion described in the project README. Research, tool-assisted drafting, and later review were part of preparing this content. The portfolio does not claim that every trivia clue was written from scratch without assistance.

## Word-game sources

`data/word-lists/` contains upstream word-list inputs used by the Wordle and Hangman tooling. Runtime-ready Wordle data is curated into `src/platform/data/wordle/` rather than loading raw source files directly in the interface.

Third-party source and reuse notes are documented in [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Validation boundaries

The data pipeline checks engineering properties such as row structure, duplicates, response format, difficulty bands, answer leakage, freshness, and generated-output parity.

These automated checks are not a factual truth engine. Human research and review remain necessary for trivia accuracy and wording quality.
