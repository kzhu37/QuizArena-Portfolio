# Third-party notices

This repository is a curated technical portfolio for Quizler Arena. It contains project code, project media, third-party software dependencies, and external word-list data. This file records the main attribution and reuse boundaries that are easy to miss when viewing the repository only as an application.

## Software dependencies

Quizler Arena uses open-source packages declared in `package.json`, including React, React DOM, React Router, Vite, esbuild, TypeScript, `wordle-words`, `word-list`, `an-array-of-english-words`, `random-words`, and `naughty-words`.

Each dependency remains subject to its own upstream license and terms. This repository does not relicense those packages.

## Word-list and puzzle data

The Wordle build tooling combines several external vocabulary sources with project-specific filtering, normalization, deny lists, difficulty heuristics, and manual answer boosts.

Committed external word-list inputs include:

- `data/word-lists/google-10000-english-no-swears.txt`
- `data/word-lists/words_alpha.txt`

Additional source data is read from the npm packages listed above when the word-game banks are rebuilt.

I do not claim authorship over external vocabulary lists. Anyone reusing those datasets outside this project should confirm the original upstream source and license that applies to the specific list or package.

The Jeopardy research packs, validation rules, bank-building workflow, replayability system, and runtime integration are part of the Quizler Arena project. The 5,600-clue expansion is described as curated and researched. Research, tool-assisted drafting, and human review were part of preparing content, so the portfolio does not claim that every clue was written from scratch without assistance.

## Visual assets

The visual assets under `public/assets/` were created or prepared for Quizler Arena through a mixture of project-specific design work, manual editing, and AI-assisted visual experimentation during development. They are presented here as part of the application and portfolio rather than as a standalone reusable art pack.

## Collaboration

Quizler Arena was designed and developed by Kevin Zhu. [Vladimir Duckardt](https://github.com/VDuckardtt) provided limited debugging help on visual implementation issues, particularly Hangman asset replacement and stage-image layering and transition behavior in the original development history.

## AI-assisted development

AI-assisted tools were used during parts of implementation, debugging, content drafting, research support, and visual experimentation. Generated output was treated as material to inspect, test, revise, or replace rather than as automatically trusted application data.

The current Jeopardy runtime does not depend on live language-model generation. It uses curated local content and validation tooling instead.

## Jeopardy-style format

Quizler Jeopardy is an unofficial independent project inspired by the familiar Jeopardy-style clue-board format. It is not affiliated with or endorsed by the television program or its rights holders.

## Reuse

No statement in this file grants rights to third-party software, datasets, trademarks, or other external material beyond the rights provided by their respective owners and licenses. Check the relevant upstream terms before redistributing third-party components or data separately from this portfolio.
