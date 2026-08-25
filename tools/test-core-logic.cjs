const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sandbox = { window: { Jeopardy: {} }, console };
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, 'src', 'jeopardy', 'utils.js'), 'utf8'),
  sandbox,
  { filename: 'src/jeopardy/utils.js' }
);

const ns = sandbox.window.Jeopardy;

assert.equal(ns.normalizeAnswer('What is Spider-Man?'), 'spider man');
assert.equal(ns.normalizeAnswer('The Odyssey (epic poem)'), 'odyssey');
assert.equal(ns.normalizeAnswer('Who is Søren Kierkegaard?'), 'soren kierkegaard');
assert.equal(ns.answerAppearsInClue('This clue names Saturn directly.', 'What is Saturn?'), true);
assert.equal(ns.answerAppearsInClue('This planet is famous for its rings.', 'What is Saturn?'), false);

const pathResult = ns.findStrictAscendingDifficultyPath(
  [
    [{ id: 'a', difficulty: 20 }, { id: 'b', difficulty: 30 }],
    [{ id: 'c', difficulty: 25 }, { id: 'd', difficulty: 40 }],
    [{ id: 'e', difficulty: 35 }, { id: 'f', difficulty: 50 }]
  ],
  (item) => item.difficulty
);
assert.deepEqual(pathResult.map((item) => item.id), ['a', 'c', 'e']);

const impossiblePath = ns.findStrictAscendingDifficultyPath(
  [
    [{ difficulty: 30 }],
    [{ difficulty: 20 }]
  ],
  (item) => item.difficulty
);
assert.equal(impossiblePath, null);

console.log('Core logic tests passed.');
