const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const legacyRoot = path.join(root, 'public', 'legacy');
const legacySource = path.join(legacyRoot, 'src', 'jeopardy');
const legacyData = path.join(legacyRoot, 'data', 'jeopardy-bank');
const sourceDirectory = path.join(root, 'src', 'jeopardy');
const dataDirectory = path.join(root, 'data', 'jeopardy-bank');

fs.rmSync(legacyRoot, { recursive: true, force: true });
fs.mkdirSync(legacySource, { recursive: true });
fs.mkdirSync(legacyData, { recursive: true });

fs.copyFileSync(
  path.join(root, 'legacy-jeopardy.html'),
  path.join(legacyRoot, 'jeopardy.html')
);

for (const name of fs.readdirSync(sourceDirectory).filter((name) => name.endsWith('.js')).sort()) {
  fs.copyFileSync(path.join(sourceDirectory, name), path.join(legacySource, name));
}

for (const name of ['round1-bank.js', 'round2-bank.js', 'final-bank.js']) {
  const source = path.join(dataDirectory, name);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing generated Jeopardy bank: ${source}`);
  }
  fs.copyFileSync(source, path.join(legacyData, name));
}

console.log('Legacy Jeopardy runtime synced to public/legacy.');
