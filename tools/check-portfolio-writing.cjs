#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const forbiddenDashPattern = /[\u2013\u2014]/g;
const failures = [];
const presentationFiles = new Set([
  'README.md',
  'THIRD_PARTY_NOTICES.md',
  'data/README.md'
]);

function collect(directory, allowedExtensions) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      collect(relative, allowedExtensions);
      continue;
    }
    if (allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
      presentationFiles.add(relative);
    }
  }
}

collect('docs', new Set(['.md', '.svg']));

for (const relativePath of [...presentationFiles].sort()) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    failures.push(`${relativePath}: file not found`);
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const matches = [...content.matchAll(forbiddenDashPattern)];
  if (matches.length) {
    failures.push(`${relativePath}: contains ${matches.length} typographic long dash character(s)`);
  }
}

if (failures.length) {
  console.error('Portfolio writing check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Portfolio writing check passed across ${presentationFiles.size} presentation files: no en dashes or em dashes found.`);
