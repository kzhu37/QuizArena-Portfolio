# Third-Party Notices

Quizler Arena combines original project code and content workflows with open-source software, external vocabulary lists, and limited development feedback from other people. This file keeps those boundaries explicit.

## Software dependencies

Quizler Arena uses open-source packages declared in `package.json`, including React, React DOM, React Router, Vite, esbuild, TypeScript, `wordle-words`, `word-list`, `an-array-of-english-words`, `random-words`, and `naughty-words`.

Each dependency remains subject to its own upstream license and terms. This repository does not relicense those packages.

## Word-list and puzzle data

The Wordle and Hangman build tooling combines external vocabulary sources with project-specific filtering, normalization, deny lists, difficulty heuristics, answer selection, and validation.

### `google-10000-english-no-swears.txt`

Committed file:

- `data/word-lists/google-10000-english-no-swears.txt`

Upstream source:

- `https://github.com/first20hours/google-10000-english`

The upstream project describes the list as derived from Google's Web Trillion Word Corpus through Peter Norvig's frequency compilation, with cleanup by Josh Kaufman. Its `LICENSE.md` states that educational and personal/research use is permitted under the cited upstream terms and specifically advises against commercial use without appropriate Linguistic Data Consortium licensing.

Quizler Arena uses this list only as an input to a noncommercial project vocabulary pipeline. The committed copy is not presented as original project data.

### `words_alpha.txt`

Committed file:

- `data/word-lists/words_alpha.txt`

Upstream source:

- `https://github.com/dwyl/english-words`

The upstream repository is published under the Unlicense, while its README also notes that the underlying word material originated from an earlier external list and that original copyright may still apply. Quizler Arena therefore treats this file as third-party vocabulary data rather than as freely relicenseable project content.

Anyone redistributing either vocabulary list separately should review the current upstream source and applicable terms rather than relying on this notice as a standalone license grant.

## Jeopardy content methodology

The 5,600-clue August expansion is part of the Quizler Arena content workflow. It was prepared through structured drafting, research, answer fact-checking, correction, source organization, duplicate rules, difficulty constraints, answer-leakage checks, freshness tracking, generated-bank parity checks, and runtime integration.

The complete methodology and its limitations are documented in [`data/CONTENT_METHODOLOGY.md`](data/CONTENT_METHODOLOGY.md).

## Visual assets

The visual assets under `public/assets/` were created or prepared for Quizler Arena through project-specific design work and manual editing. They are included as application assets rather than as a standalone reusable art pack.

The repository does not grant additional rights to any third-party material that may be incorporated into those assets beyond the rights already provided by its original source.

## Collaboration and feedback

I designed and developed Quizler Arena.

- **Michael Tetelbaum** provided early product feedback that encouraged the move from a single Jeopardy game toward a broader three-mode Arena.
- **Vladimir Duckardt** provided performance and visual feedback during development and later gave limited debugging help on Hangman asset replacement, staged-image layering, and transition behavior.

Those contributions are credited separately from my implementation work.

## Jeopardy-style format

Quizler Jeopardy is an unofficial independent project inspired by the familiar Jeopardy-style clue-board format. It is not affiliated with or endorsed by the television program or its rights holders.

## Reuse

Nothing in this file grants additional rights to third-party software, datasets, trademarks, media, or other external material beyond the rights provided by their respective owners and licenses.

The absence of a repository-wide permissive license should not be interpreted as permission to redistribute the complete project, its media, or its third-party data as a new product. Review the relevant source and license before reusing individual components.
