#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const presentationFiles = [
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/diagrams/architecture.svg",
  "docs/diagrams/board-assembly.svg",
  "docs/diagrams/content-pipeline.svg",
  "docs/diagrams/local-first-evolution.svg"
];

const forbiddenDashPattern = /[\u2013\u2014]/g;
const failures = [];

for (const relativePath of presentationFiles) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) {
    failures.push(`${relativePath}: file not found`);
    continue;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const matches = [...content.matchAll(forbiddenDashPattern)];
  if (matches.length) {
    failures.push(`${relativePath}: contains ${matches.length} typographic long dash character(s)`);
  }
}

if (failures.length) {
  console.error("Portfolio writing check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Portfolio writing check passed: no en dashes or em dashes found in presentation text.");
