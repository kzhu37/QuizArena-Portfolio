# Data and content sources

Quizler Arena keeps authored inputs separate from generated runtime data so large content changes can be reviewed and rebuilt reproducibly.

## Jeopardy bank

`data/jeopardy-bank/` contains the committed inputs used by the bank pipeline:

| Input | Purpose |
|---|---|
| `researched-expansion-01.tsv` through `researched-expansion-14.tsv` | Fourteen authored expansion packs, each expected to contain 400 structured rows |
| `manual-existing-category-topoff.tsv` | Reviewed additions that strengthen existing categories without creating unnecessary category sprawl |
| `original-answer-blacklist.json` | Protected historical answer keys used to prevent accidental reuse |
| `pre-expansion-tracking.json` | Historical clue and answer tracking used for freshness and migration checks |
| `pre-major-expansion-stats.json` | Immutable snapshot of bank size immediately before the major August expansion |
| `approved-pre-expansion-corrections.json` | Explicit manifest for reviewed corrections that would otherwise look like protected-content reuse |
| `bank-blueprint.ps1` | Historical PowerShell parser for the generated TSV source |

The normal pipeline is:

```text
authored inputs
  -> source audit
  -> expanded-bank.tsv
  -> runtime bank build
  -> round1-bank.js / round2-bank.js / final-bank.js
  -> runtime parity audit
```

`expanded-bank.tsv` and the three runtime JavaScript banks are generated files and are intentionally ignored by Git. `public/legacy/` is also generated during the build.

The cross-platform production path uses `tools/build-jeopardy-bank.cjs` and `tools/sync-legacy-runtime.cjs`. Windows verification still keeps the historical PowerShell tooling available as an independent reference path.

## Word-game sources

`data/word-lists/` contains upstream word-list inputs used by the Wordle and Hangman tooling. Runtime-ready Wordle data is curated into `src/platform/data/wordle/` rather than loading the raw source files directly in the interface.

Third-party source and reuse notes are documented in [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Validation boundaries

The data pipeline checks engineering properties such as row structure, duplicates, response format, difficulty bands, answer leakage, freshness, and generated-output parity.

These automated checks are not presented as a factual truth engine. Human research and review remain necessary for trivia accuracy and wording quality.
