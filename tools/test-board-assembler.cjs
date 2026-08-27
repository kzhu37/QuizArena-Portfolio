const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const sandbox = { window: { Jeopardy: {} }, console };
vm.createContext(sandbox);

for (const relativePath of [
  ["src", "jeopardy", "config.js"],
  ["src", "jeopardy", "utils.js"],
  ["src", "jeopardy", "boardAssembler.js"]
]) {
  const filename = path.join(root, ...relativePath);
  vm.runInContext(fs.readFileSync(filename, "utf8"), sandbox, { filename });
}

const ns = sandbox.window.Jeopardy;
const originalFamilyWeights = { ...ns.FAMILY_WEIGHTS };

function emptyUsageSnapshot() {
  return {
    clueIds: new Set(),
    categoryIds: new Set(),
    categoryTitles: new Set(),
    familySet: new Set(),
    finalIds: new Set(),
    finalCategories: new Set(),
    answerKeys: new Set(),
    boardHashes: new Set(),
    boardTitleHashes: new Set(),
    boardFamilyPatterns: new Set(),
    titleHistory: [],
    familyHistory: [],
    finalCategoryHistory: []
  };
}

function makeCategory({ id, family, conflicts = [] }) {
  const values = ns.ROUND_VALUES.r1;
  const records = values.map((value, index) => {
    const conflictAnswer = conflicts[index] || null;
    const answerKey = conflictAnswer || `${id}-answer-${index}`;
    return {
      id: `${id}-clue-${index}`,
      roundType: "r1",
      value,
      clue: `${id} clue ${index}`,
      canonicalResponse: answerKey,
      acceptedResponses: [],
      difficulty: 20 + index * 10,
      answerKey,
      fingerprint: `${id}-fingerprint-${index}`
    };
  });

  return {
    categorySet: {
      id,
      sourceCategoryId: `${id}-source`,
      family,
      title: `${id} title`,
      tags: [],
      roundType: "r1",
      valueSlots: records.map((record) => ({
        value: record.value,
        candidateIds: [record.id]
      }))
    },
    records
  };
}

function makeRepository(definitions) {
  const records = new Map();
  const categorySets = [];
  for (const definition of definitions) {
    categorySets.push(definition.categorySet);
    for (const record of definition.records) records.set(record.id, record);
  }

  return {
    categorySetsById: new Map(categorySets.map((categorySet) => [categorySet.id, categorySet])),
    getCategorySetsForRound(roundType) {
      return categorySets.filter((categorySet) => categorySet.roundType === roundType);
    },
    getClueRecord(id) {
      return records.get(id) || null;
    }
  };
}

const validator = {
  validateBoard(board) {
    assert.equal(board.categories.length, 6);
    for (const category of board.categories) {
      assert.equal(category.clues.length, 5);
    }
  }
};

function fixedRng() {
  return 0.999999;
}

function runRollbackTest() {
  const trap = makeCategory({
    id: "00-trap",
    family: "stem",
    conflicts: [null, null, null, null, null]
  });
  const sharedA = trap.records[0].answerKey;
  const sharedB = trap.records[1].answerKey;

  const definitions = [
    trap,
    makeCategory({ id: "01-history", family: "history_civics" }),
    makeCategory({ id: "02-geography", family: "geography" }),
    makeCategory({ id: "03-literature", family: "literature_language" }),
    makeCategory({ id: "04-arts", family: "arts_music" }),
    makeCategory({ id: "05-sports", family: "sports", conflicts: [sharedA] }),
    makeCategory({ id: "06-mythology", family: "mythology_ancient", conflicts: [sharedB] })
  ];

  const assembler = new ns.BoardAssembler(makeRepository(definitions), validator);
  const board = assembler.assembleRound({
    roundType: "r1",
    rng: fixedRng,
    usageSnapshot: emptyUsageSnapshot(),
    sessionContext: ns.createSessionContext(),
    difficultyMode: "tv"
  });

  const selectedIds = board.categories.map((category) => category.setId);
  assert.equal(selectedIds.includes("00-trap"), false);
  assert.deepEqual(
    new Set(selectedIds),
    new Set(["01-history", "02-geography", "03-literature", "04-arts", "05-sports", "06-mythology"])
  );
}

function runUsageHistoryTest() {
  for (const family of Object.keys(ns.FAMILY_WEIGHTS)) {
    ns.FAMILY_WEIGHTS[family] = 1;
  }

  const definitions = [
    makeCategory({ id: "01-used", family: "stem" }),
    makeCategory({ id: "02-history", family: "history_civics" }),
    makeCategory({ id: "03-geography", family: "geography" }),
    makeCategory({ id: "04-literature", family: "literature_language" }),
    makeCategory({ id: "05-arts", family: "arts_music" }),
    makeCategory({ id: "06-sports", family: "sports" }),
    makeCategory({ id: "07-mythology", family: "mythology_ancient" })
  ];

  const usageSnapshot = emptyUsageSnapshot();
  usageSnapshot.categoryIds.add("01-used");

  const assembler = new ns.BoardAssembler(makeRepository(definitions), validator);
  const board = assembler.assembleRound({
    roundType: "r1",
    rng: fixedRng,
    usageSnapshot,
    sessionContext: ns.createSessionContext(),
    difficultyMode: "tv"
  });

  const selectedIds = board.categories.map((category) => category.setId);
  assert.equal(selectedIds.includes("01-used"), false);
  assert.equal(selectedIds.length, 6);
}

try {
  runRollbackTest();
  runUsageHistoryTest();
  console.log("Board assembler tests passed: rollback and usage-history scoring are verified.");
} finally {
  ns.FAMILY_WEIGHTS = originalFamilyWeights;
}
