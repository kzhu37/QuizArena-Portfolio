# Jeopardy Content Methodology

This document explains how the major Quizler Jeopardy content expansion was created and what the repository's automated checks do and do not establish.

## The 5,600-clue expansion

The August 2026 expansion added 5,600 Jeopardy-style clues across 14 structured packs of 400 rows each.

The drafting process was AI-assisted in a direct way: I used generative AI to produce the initial question and answer material for the expansion. I then went through the resulting content, researched the answers, and fact-checked them before treating the packs as usable project data.

That distinction matters. I do not describe the 5,600 clues as individually hand-written from scratch. My work on the expansion was in defining the structure and constraints, generating the draft material, researching and checking the answers, correcting problems, integrating the packs into the source-of-truth workflow, and building the validation and runtime pipeline around them.

## Source-of-truth workflow

The committed source packs live under `data/jeopardy-bank/`:

- `researched-expansion-01.tsv` through `researched-expansion-14.tsv`
- reviewed top-offs and correction manifests for earlier content
- pre-expansion answer and statistics snapshots used for migration and duplicate checks

The normal build path is:

```text
AI-drafted structured packs
  -> human research and answer fact-checking
  -> source audit
  -> generated expanded-bank.tsv
  -> runtime bank build
  -> round1-bank.js / round2-bank.js / final-bank.js
  -> runtime parity audit
```

Generated runtime banks are build products and are intentionally ignored by Git. The committed TSV and JSON inputs are the reviewable source material.

## What automated validation checks

The repository checks engineering properties that can be tested mechanically, including:

- expected pack and row counts;
- required fields and parseable structure;
- category and value-slot coverage;
- difficulty-band rules;
- duplicate normalized answers;
- duplicate or near-duplicate clue fingerprints;
- answer leakage into clue text;
- malformed or placeholder text;
- protected pre-expansion answer reuse;
- generated-source freshness;
- generated/runtime count and hash parity.

These checks make the data pipeline reproducible and catch many classes of structural failure before gameplay.

## What automated validation cannot prove

The automated checks do **not** determine whether a trivia statement is factually true. They also cannot guarantee that wording is ideal, that every clue has only one reasonable interpretation, or that difficulty will feel identical to every player.

Those properties still depend on research, human review, and play experience. I therefore keep structural validation and factual review separate in the project documentation instead of treating a passing script as proof of trivia accuracy.

## Why the final runtime is local-first

Earlier versions experimented with generating questions during gameplay through a hosted service. That made iteration fast, but it also introduced network dependence, inconsistent output, credential handling, harder debugging, and weak reproducibility.

The final game does not generate Jeopardy questions at runtime. It builds from checked local source data instead. Remote generation is explicitly disabled in `src/jeopardy/questionSourceAdapter.js`.

This preserves what was useful about AI during content creation while keeping final gameplay inspectable, repeatable, and independent of a generation service.
