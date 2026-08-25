const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const old = JSON.parse(fs.readFileSync(path.join(root, 'data/jeopardy-bank/original-answer-blacklist.json'), 'utf8'));
const oldKeys = new Set(old.answers.map((entry) => norm(entry.examples?.[0] || entry.key)));
const preExpansion = JSON.parse(fs.readFileSync(path.join(root, 'data/jeopardy-bank/pre-expansion-tracking.json'), 'utf8'));
const protectedAnswerKeys = new Set([
  ...oldKeys,
  ...(preExpansion.answers || []).map((entry) => norm(entry.examples?.[0] || entry.key))
]);
const usedAnswers = new Set();
const usedClues = new Set();
const categories = [];
const finals = [];
const authoredInputFiles = [];
const authoredCategorySources = new Map();
const initialCounts = { regular: 5348, r1: 2945, r2: 2403 };
const targetRegularClues = Math.max(5000, Math.ceil(initialCounts.regular * 1.5));
const minimumRoundGrowth = 1.1;
const minimumCluesPerValue = 8;

const values = { r1: [200, 400, 600, 800, 1000], r2: [400, 800, 1200, 1600, 2000] };
const difficulty = {
  r1: { 200: [18,20,21,23,25], 400: [28,31,34,37,40], 600: [43,46,49,52,55], 800: [58,62,66,69,72], 1000: [75,78,81,85,88] },
  r2: { 400: [34,37,40,43,45], 800: [48,51,54,56,58], 1200: [61,63,66,68,70], 1600: [73,76,79,82,84], 2000: [87,90,92,95,97] }
};
const difficultyBands = {
  r1: { 200: [15,25], 400: [26,40], 600: [41,55], 800: [56,72], 1000: [73,88] },
  r2: { 400: [30,45], 800: [46,58], 1200: [59,70], 1600: [71,84], 2000: [85,97] }
};
const finalDifficulty = [78,81,84,87,90,93,95];

function norm(value) {
  return String(value || '')
    .normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/ð/g, 'd').replace(/þ/g, 'th')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2010-\u2015]/g, '-')
    .replace(/\bwhat\s*'s\s+/g, '')
    .replace(/^(what|who|where|when|why|how)\s+(is|are|was|were|am|be)\s+/g, '')
    .replace(/^(what|who|where|when|why|how)\s+(do|does|did)\s+/g, '')
    .replace(/\?+$/g, '').replace(/(?:\s*\([^)]*\)\s*)+$/g, ' ')
    .replace(/^(?:(?:the|a|an)\s+)+/g, '').replace(/&/g, ' and ')
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function clueKey(value) { return clean(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/-/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function giveawayKey(value) {
  return norm(value)
    .replace(/-/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function answerAppearsInClue(clue, answer) {
  const answerKey = giveawayKey(answer);
  const normalizedClue = giveawayKey(clue);
  if (!answerKey || !normalizedClue) return false;
  if (!answerKey.includes(' ') && answerKey.length < 4) return false;
  const escaped = answerKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(normalizedClue);
}
function assertCleanAuthoredRow({ filePath, lineNumber, round, title, value, difficultyValue, clue, responseText }) {
  const location = `${path.relative(root, filePath)}:${lineNumber}`;
  if (!values[round]) throw new Error(`${location}: unknown round "${round}".`);
  if (!categories.some((entry) => entry.round === round && entry.title === title)) {
    throw new Error(`${location}: unknown ${round} category "${title}".`);
  }
  if (!values[round].includes(value)) throw new Error(`${location}: invalid value $${value} for ${round}.`);
  const [minimumDifficulty, maximumDifficulty] = difficultyBands[round][value];
  if (!Number.isInteger(difficultyValue) || difficultyValue < minimumDifficulty || difficultyValue > maximumDifficulty) {
    throw new Error(`${location}: difficulty ${difficultyValue} is outside the ${round} $${value} band.`);
  }
  if (!clue || !responseText) throw new Error(`${location}: clue and response are required.`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/u.test(`${clue} ${responseText}`)) {
    throw new Error(`${location}: malformed Unicode or control character.`);
  }
  if (/^(what|which|who|where|when|why|how)\b/i.test(clue)) throw new Error(`${location}: worksheet-style clue opening.`);
  if (!/^(What|Who|Where|When)\s+(?:is|are|was|were)\s+.+\?$/u.test(responseText)) {
    throw new Error(`${location}: response must use Jeopardy phrasing.`);
  }
  if (/\b(?:undefined|null|Q\d{3,}|P\d{3,})\b/u.test(`${clue} ${responseText}`)) {
    throw new Error(`${location}: unresolved identifier or junk text.`);
  }
  if (/\b(?:is the answer|title sought here|this is described as|scientific article|journal article|U\.S\. patent|National Archives and Records Administration's holdings)\b/i.test(clue)) {
    throw new Error(`${location}: low-information generated wording.`);
  }
  if (answerAppearsInClue(clue, responseText)) throw new Error(`${location}: clue contains its response.`);
}
function response(answer, kind = 'what') {
  const prefix = kind === 'who' ? 'Who is' : kind === 'whatAre' ? 'What are' : 'What is';
  const text = clean(answer);
  return /\?$/.test(text) ? `${prefix} ${text}` : `${prefix} ${text}?`;
}
function usable(clue, resp) {
  const a = norm(resp);
  const q = clueKey(clue);
  return a && q && !usedAnswers.has(a) && !usedClues.has(q);
}
function reserve(clue, resp) { usedAnswers.add(norm(resp)); usedClues.add(clueKey(clue)); }
function addCategory(round, title, family, tags, candidates, packKey = '') {
  const slots = new Map(values[round].map((value) => [value, []]));
  for (const candidate of candidates) {
    const value = values[round][candidate.tier - 1];
    if (!value) continue;
    const clue = clean(candidate.clue);
    const resp = candidate.response || response(candidate.answer, candidate.kind);
    if (!usable(clue, resp)) continue;
    reserve(clue, resp);
    slots.get(value).push({ clue, response: resp });
  }
  categories.push({ round, title, family, tags, packKey, slots });
}
function addFinal(category, clue, resp) {
  if (!usable(clue, resp)) return false;
  reserve(clue, resp);
  finals.push({ category, clue: clean(clue), response: clean(resp), difficulty: finalDifficulty[finals.length % finalDifficulty.length] });
  return true;
}
function manualRows(raw) {
  return raw.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [tier, resp, clue] = line.split('|');
    return { tier: Number(tier), response: clean(resp), clue: clean(clue) };
  });
}
function manual(round, title, family, tags, raw, packKey = '') { addCategory(round, title, family, tags, manualRows(raw), packKey); }
function orderedRows(raw, perTier = 8) {
  return raw.trim().split(/\r?\n/).filter(Boolean).map((line, index) => {
    const [resp, ...clueParts] = line.split('|');
    return {
      tier: Math.floor(index / perTier) + 1,
      response: clean(resp),
      clue: clean(clueParts.join('|'))
    };
  });
}
function ordered(round, title, family, tags, raw, packKey = '', perTier = 8) {
  addCategory(round, title, family, tags, orderedRows(raw, perTier), packKey);
}
function factRows(raw, perTier = 8) {
  return raw.trim().split(/\r?\n/).filter(Boolean).map((line, index) => {
    const [answerText, clueText, kindText] = line.split('|');
    return {
      tier: Math.floor(index / perTier) + 1,
      answer: clean(answerText),
      clue: clean(clueText),
      kind: clean(kindText || '')
    };
  });
}
function facts(round, title, family, tags, raw, packKey = '', perTier = 8) {
  addCategory(round, title, family, tags, factRows(raw, perTier), packKey);
}
function supplement(round, title, raw) {
  const category = categories.find((entry) => entry.round === round && entry.title === title);
  if (!category) throw new Error(`Cannot supplement missing category ${round} ${title}`);
  for (const candidate of manualRows(raw)) {
    const value = values[round][candidate.tier - 1];
    if (!value) continue;
    const clue = clean(candidate.clue);
    const resp = clean(candidate.response);
    if (!usable(clue, resp)) continue;
    reserve(clue, resp);
    category.slots.get(value).push({ clue, response: resp });
  }
}
function loadManualTopoff(filePath) {
  if (!fs.existsSync(filePath)) return;
  const rows = [];
  const sourceLines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (let index = 0; index < sourceLines.length; index += 1) {
    const rawLine = sourceLines[index];
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = rawLine.split('\t');
    if (parts.length !== 6) {
      throw new Error(`${path.relative(root, filePath)}:${index + 1}: expected exactly six tab-separated fields.`);
    }
    const [round, title, valueText, difficultyText, clueText, responseText] = parts;
    const value = Number(valueText);
    const difficultyValue = Number(difficultyText);
    const clue = clean(clueText);
    const authoredResponse = clean(responseText);
    assertCleanAuthoredRow({
      filePath,
      lineNumber: index + 1,
      round,
      title,
      value,
      difficultyValue,
      clue,
      responseText: authoredResponse
    });
    rows.push({ round, title, value, difficulty: difficultyValue, clue, response: authoredResponse });
  }
  for (const row of rows) {
    if (!usable(row.clue, row.response)) continue;
    const category = categories.find((entry) => entry.round === row.round && entry.title === row.title);
    reserve(row.clue, row.response);
    category.slots.get(row.value).push({
      clue: row.clue,
      response: row.response,
      difficulty: row.difficulty
    });
  }
}
function loadAuthoredExpansion(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing authored Jeopardy expansion: ${filePath}`);
  authoredInputFiles.push(filePath);
  const rows = [];
  const perSlot = new Map();
  const seenFileAnswers = new Set();
  const seenFileClues = new Set();
  const sourceLines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (let index = 0; index < sourceLines.length; index += 1) {
    const rawLine = sourceLines[index];
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = rawLine.split('\t');
    if (parts.length !== 6) {
      throw new Error(`${path.relative(root, filePath)}:${index + 1}: expected exactly six tab-separated fields.`);
    }
    const [round, title, valueText, difficultyText, clueText, responseText] = parts;
    const value = Number(valueText);
    const difficultyValue = Number(difficultyText);
    const clue = clean(clueText);
    const authoredResponse = clean(responseText);
    assertCleanAuthoredRow({
      filePath,
      lineNumber: index + 1,
      round,
      title,
      value,
      difficultyValue,
      clue,
      responseText: authoredResponse
    });
    const answerKey = norm(authoredResponse);
    const normalizedClue = clueKey(clue);
    if (protectedAnswerKeys.has(answerKey)) {
      throw new Error(`${path.relative(root, filePath)}:${index + 1}: response reuses a protected pre-expansion answer: ${authoredResponse}`);
    }
    if (usedAnswers.has(answerKey) || seenFileAnswers.has(answerKey)) {
      throw new Error(`${path.relative(root, filePath)}:${index + 1}: duplicate normalized answer: ${authoredResponse}`);
    }
    if (usedClues.has(normalizedClue) || seenFileClues.has(normalizedClue)) {
      throw new Error(`${path.relative(root, filePath)}:${index + 1}: duplicate normalized clue text.`);
    }
    seenFileAnswers.add(answerKey);
    seenFileClues.add(normalizedClue);
    const slotKey = `${round}\t${title}\t${value}`;
    perSlot.set(slotKey, (perSlot.get(slotKey) || 0) + 1);
    rows.push({ round, title, value, difficulty: difficultyValue, clue, response: authoredResponse });
  }
  for (const [slotKey, count] of perSlot) {
    if (count !== 16) {
      throw new Error(`${path.relative(root, filePath)}: authored slot ${slotKey} must contain exactly 16 rows; found ${count}.`);
    }
  }
  if (rows.length !== 400) {
    throw new Error(`${path.relative(root, filePath)} must contain exactly 400 authored rows; found ${rows.length}.`);
  }
  if (perSlot.size !== 25) {
    throw new Error(`${path.relative(root, filePath)} must contain exactly 25 category/value slots; found ${perSlot.size}.`);
  }
  const categorySlots = new Map();
  for (const row of rows) {
    const key = `${row.round}\t${row.title}`;
    if (!categorySlots.has(key)) categorySlots.set(key, new Set());
    categorySlots.get(key).add(row.value);
  }
  for (const [key, presentValues] of categorySlots) {
    const [round, title] = key.split('\t');
    const missing = values[round].filter((value) => !presentValues.has(value));
    if (missing.length) {
      throw new Error(`${path.relative(root, filePath)}: ${round} ${title} is missing authored values ${missing.join(', ')}.`);
    }
  }
  if (categorySlots.size !== 5) {
    throw new Error(`${path.relative(root, filePath)} must contain exactly five categories; found ${categorySlots.size}.`);
  }
  for (const key of categorySlots.keys()) {
    if (authoredCategorySources.has(key)) {
      throw new Error(`${path.relative(root, filePath)}: ${key} is already authored in ${authoredCategorySources.get(key)}.`);
    }
    authoredCategorySources.set(key, path.relative(root, filePath));
  }
  for (const row of rows) {
    const category = categories.find((entry) => entry.round === row.round && entry.title === row.title);
    reserve(row.clue, row.response);
    category.slots.get(row.value).push({ clue: row.clue, response: row.response, difficulty: row.difficulty });
  }
}

function sourceDigest(filePaths) {
  const hash = crypto.createHash('sha256');
  for (const filePath of filePaths.map((file) => path.resolve(file)).sort()) {
    hash.update(path.relative(root, filePath).replace(/\\/g, '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(filePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}
function skipManual() {}
function generated(round, title, family, tags, records, make, packKey = '') {
  const candidates = [];
  records.forEach((record, index) => candidates.push({ tier: Math.floor(index / 8) + 1, ...make(record, index) }));
  addCategory(round, title, family, tags, candidates, packKey);
}
function chunk(records, index, size = 40) { return records.slice(index * size, (index + 1) * size); }

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
const currencyNames = new Intl.DisplayNames(['en'], { type: 'currency' });
const scriptNames = new Intl.DisplayNames(['en'], { type: 'script' });
const countryCodes = 'US CA MX BR AR CL CO PE GB IE FR DE IT ES PT NL BE CH AT NO SE DK FI PL CZ HU GR TR IL EG MA NG ZA KE ET GH IN PK BD LK NP CN JP KR TH VN MY SG ID PH AU NZ FJ PG RU UA RO BG HR RS SI SK LT LV EE IS GE AM AZ KZ UZ MN SA AE QA KW JO LB IR IQ OM YE TN DZ LY SD SN CM UG TZ ZM ZW BW NA AO MZ MG MU SC CR PA GT HN SV NI CU JM HT DO TT BS BB AD MC LI SM VA LU CY MT AL BA MK ME XK MD BY KG TJ TM AF KH LA MM BN TL MV'.split(' ');
const countries = countryCodes.map((code) => ({ code, name: regionNames.of(code) })).filter((x) => x.name && x.name !== x.code);
const languageCodes = 'en fr es de it pt nl sv da no fi is pl cs sk hu ro bg el tr ar he fa hi ur bn ta te mr pa gu zh ja ko vi th ms id tl sw am ha yo ig zu xh af sq hy ka kk uz mn uk ru sr hr sl lt lv et ga cy mt la eo eu ca gl bs mk be ky tg tk ps km lo my ne si jv su'.split(' ');
const languages = languageCodes.map((code) => ({ code, name: languageNames.of(code) })).filter((x) => x.name && x.name !== x.code);
const currencyCodes = 'USD CAD MXN BRL ARS CLP COP PEN GBP EUR CHF NOK SEK DKK PLN CZK HUF RON BGN TRY ILS EGP MAD NGN ZAR KES ETB GHS INR PKR BDT LKR NPR CNY JPY KRW THB VND MYR SGD IDR PHP AUD NZD FJD PGK RUB UAH GEL AMD AZN KZT UZS MNT SAR AED QAR KWD JOD LBP IRR IQD OMR YER TND DZD LYD SDG XOF XAF UGX TZS ZMW BWP NAD AOA MZN MGA MUR SCR CRC PAB GTQ HNL NIO CUP JMD HTG DOP TTD BSD BBD BZD BMD BOB PYG UYU'.split(' ');
const currencies = currencyCodes.map((code) => ({ code, name: currencyNames.of(code) })).filter((x) => x.name && x.name !== x.code);
const scripts = 'Latn Cyrl Arab Deva Beng Guru Gujr Taml Telu Knda Mlym Sinh Thai Lao Mymr Ethi Geor Armn Hebr Grek Hani Hans Hant Hang Kana Hira Bopo Cher Cans Tibt Mong Khmr Syrc Thaana Nkoo Vaii Tfng Orya Olck Runr Ogam Ital Goth Glag Copt Brah'.split(' ').map((code) => {
  try {
    return { code, name: scriptNames.of(code) };
  } catch {
    return null;
  }
}).filter((x) => x && x.name && x.name !== x.code);
const elements = `Hydrogen,H,1|Helium,He,2|Lithium,Li,3|Beryllium,Be,4|Boron,B,5|Carbon,C,6|Nitrogen,N,7|Oxygen,O,8|Fluorine,F,9|Neon,Ne,10|Sodium,Na,11|Magnesium,Mg,12|Aluminum,Al,13|Silicon,Si,14|Phosphorus,P,15|Sulfur,S,16|Chlorine,Cl,17|Argon,Ar,18|Potassium,K,19|Calcium,Ca,20|Scandium,Sc,21|Titanium,Ti,22|Vanadium,V,23|Chromium,Cr,24|Manganese,Mn,25|Iron,Fe,26|Cobalt,Co,27|Nickel,Ni,28|Copper,Cu,29|Zinc,Zn,30|Gallium,Ga,31|Germanium,Ge,32|Arsenic,As,33|Selenium,Se,34|Bromine,Br,35|Krypton,Kr,36|Rubidium,Rb,37|Strontium,Sr,38|Yttrium,Y,39|Zirconium,Zr,40|Niobium,Nb,41|Molybdenum,Mo,42|Technetium,Tc,43|Ruthenium,Ru,44|Rhodium,Rh,45|Palladium,Pd,46|Silver,Ag,47|Cadmium,Cd,48|Indium,In,49|Tin,Sn,50|Antimony,Sb,51|Tellurium,Te,52|Iodine,I,53|Xenon,Xe,54|Cesium,Cs,55|Barium,Ba,56|Lanthanum,La,57|Cerium,Ce,58|Praseodymium,Pr,59|Neodymium,Nd,60|Promethium,Pm,61|Samarium,Sm,62|Europium,Eu,63|Gadolinium,Gd,64|Terbium,Tb,65|Dysprosium,Dy,66|Holmium,Ho,67|Erbium,Er,68|Thulium,Tm,69|Ytterbium,Yb,70|Lutetium,Lu,71|Hafnium,Hf,72|Tantalum,Ta,73|Tungsten,W,74|Rhenium,Re,75|Osmium,Os,76|Iridium,Ir,77|Platinum,Pt,78|Gold,Au,79|Mercury,Hg,80|Thallium,Tl,81|Lead,Pb,82|Bismuth,Bi,83|Polonium,Po,84|Astatine,At,85|Radon,Rn,86|Francium,Fr,87|Radium,Ra,88|Actinium,Ac,89|Thorium,Th,90|Protactinium,Pa,91|Uranium,U,92|Neptunium,Np,93|Plutonium,Pu,94|Americium,Am,95|Curium,Cm,96|Berkelium,Bk,97|Californium,Cf,98|Einsteinium,Es,99|Fermium,Fm,100|Mendelevium,Md,101|Nobelium,No,102|Lawrencium,Lr,103|Rutherfordium,Rf,104|Dubnium,Db,105|Seaborgium,Sg,106|Bohrium,Bh,107|Hassium,Hs,108|Meitnerium,Mt,109|Darmstadtium,Ds,110|Roentgenium,Rg,111|Copernicium,Cn,112|Nihonium,Nh,113|Flerovium,Fl,114|Moscovium,Mc,115|Livermorium,Lv,116|Tennessine,Ts,117|Oganesson,Og,118`.split('|').map((row) => { const [name, symbol, number] = row.split(','); return { name, symbol, number }; });
const constellations = `Andromeda,And|Antlia,Ant|Apus,Aps|Aquarius,Aqr|Aquila,Aql|Ara,Ara|Aries,Ari|Auriga,Aur|Bootes,Boo|Caelum,Cae|Camelopardalis,Cam|Cancer,Cnc|Canes Venatici,CVn|Canis Major,CMa|Canis Minor,CMi|Capricornus,Cap|Carina,Car|Cassiopeia,Cas|Centaurus,Cen|Cepheus,Cep|Cetus,Cet|Chamaeleon,Cha|Circinus,Cir|Columba,Col|Coma Berenices,Com|Corona Australis,CrA|Corona Borealis,CrB|Corvus,Crv|Crater,Crt|Crux,Cru|Cygnus,Cyg|Delphinus,Del|Dorado,Dor|Draco,Dra|Equuleus,Equ|Eridanus,Eri|Fornax,For|Gemini,Gem|Grus,Gru|Hercules,Her|Horologium,Hor|Hydra,Hya|Hydrus,Hyi|Indus,Ind|Lacerta,Lac|Leo,Leo|Leo Minor,LMi|Lepus,Lep|Libra,Lib|Lupus,Lup|Lynx,Lyn|Lyra,Lyr|Mensa,Men|Microscopium,Mic|Monoceros,Mon|Musca,Mus|Norma,Nor|Octans,Oct|Ophiuchus,Oph|Orion,Ori|Pavo,Pav|Pegasus,Peg|Perseus,Per|Phoenix,Phe|Pictor,Pic|Pisces,Psc|Piscis Austrinus,PsA|Puppis,Pup|Pyxis,Pyx|Reticulum,Ret|Sagitta,Sge|Sagittarius,Sgr|Scorpius,Sco|Sculptor,Scl|Scutum,Sct|Serpens,Ser|Sextans,Sex|Taurus,Tau|Telescopium,Tel|Triangulum,Tri|Triangulum Australe,TrA|Tucana,Tuc|Ursa Major,UMa|Ursa Minor,UMi|Vela,Vel|Virgo,Vir|Volans,Vol|Vulpecula,Vul`.split('|').map((row) => { const [name, abbr] = row.split(','); return { name, abbr }; });
const timeZones = Intl.supportedValuesOf('timeZone').filter((zone) => /\//.test(zone)).sort((a, b) => a.length - b.length || a.localeCompare(b));
const cityZones = [...new Map(timeZones.map((zone) => [zone.split('/').pop().replace(/_/g, ' '), zone])).entries()].map(([city, zone]) => ({ city, zone })).filter((x) => x.city.length > 3);
const unitIds = Intl.supportedValuesOf('unit').map((id) => ({ id, name: id.replace(/-/g, ' ') }));
const airports = `YYZ|Toronto Pearson|Toronto|YVR|Vancouver International|Vancouver|YUL|Montreal Trudeau|Montreal|YYC|Calgary International|Calgary|YOW|Ottawa Macdonald-Cartier|Ottawa|LGA|LaGuardia|New York City|EWR|Newark Liberty|Newark|BOS|Logan International|Boston|SEA|Seattle-Tacoma|Seattle|SFO|San Francisco International|San Francisco|LAX|Los Angeles International|Los Angeles|ORD|O'Hare International|Chicago|DFW|Dallas Fort Worth|Dallas-Fort Worth|ATL|Hartsfield-Jackson Atlanta|Atlanta|MIA|Miami International|Miami|DEN|Denver International|Denver|LAS|Harry Reid International|Las Vegas|PHX|Phoenix Sky Harbor|Phoenix|LHR|Heathrow|London|CDG|Charles de Gaulle|Paris|AMS|Schiphol|Amsterdam|FRA|Frankfurt Airport|Frankfurt|MUC|Munich Airport|Munich|MAD|Adolfo Suarez Madrid-Barajas|Madrid|BCN|Barcelona-El Prat|Barcelona|FCO|Fiumicino|Rome|ZRH|Zurich Airport|Zurich|VIE|Vienna International|Vienna|CPH|Copenhagen Airport|Copenhagen|ARN|Arlanda|Stockholm|OSL|Gardermoen|Oslo|HEL|Helsinki-Vantaa|Helsinki|DUB|Dublin Airport|Dublin|LIS|Humberto Delgado|Lisbon|ATH|Athens International|Athens|IST|Istanbul Airport|Istanbul|DXB|Dubai International|Dubai|DOH|Hamad International|Doha|SIN|Changi|Singapore|HKG|Hong Kong International|Hong Kong|HND|Haneda|Tokyo|NRT|Narita|Tokyo|ICN|Incheon International|Seoul|BKK|Suvarnabhumi|Bangkok|KUL|Kuala Lumpur International|Kuala Lumpur|SYD|Kingsford Smith|Sydney|MEL|Melbourne Airport|Melbourne|AKL|Auckland Airport|Auckland|JNB|O. R. Tambo|Johannesburg|CAI|Cairo International|Cairo|ADD|Bole International|Addis Ababa|NBO|Jomo Kenyatta|Nairobi|GRU|Guarulhos|Sao Paulo|EZE|Ministro Pistarini|Buenos Aires`.split('|').reduce((rows, _, i, a) => { if (i % 3 === 0) rows.push({ code: a[i], airport: a[i + 1], city: a[i + 2] }); return rows; }, []);

// The classroom bank now relies on authored broad categories only.
// Generated code, abbreviation, unit, symbol, and time-zone list categories are intentionally excluded.

manual('r1', 'Cars', 'general', ['cars','transportation'], `
1|What is an anti-lock braking system?|This safety system pulses brake pressure to help prevent wheel lockup.
1|What is a hatchback?|This car body style has a rear door that swings upward to open the cargo area.
1|What is cruise control?|This feature keeps a car moving at a set speed without constant pressure on the accelerator.
1|What is a hybrid car?|This kind of car combines a gasoline engine with an electric motor.
1|What is a speedometer?|This dashboard instrument shows how fast the car is moving.
1|What is a minivan?|This family vehicle style usually has sliding side doors and three rows.
2|What is regenerative braking?|This system recovers energy while slowing an electric or hybrid vehicle.
2|What is all-wheel drive?|This drivetrain can send power to all four wheels for extra traction.
2|What is a turbocharger?|This device uses exhaust gases to force more air into an engine.
2|What is a catalytic converter?|This exhaust device helps reduce harmful emissions from a gasoline engine.
2|What is a differential?|This gear unit lets wheels on the same axle turn at different speeds.
2|What is adaptive cruise control?|This driver aid adjusts speed to keep distance from traffic ahead.
3|What is a continuously variable transmission?|This transmission changes ratios smoothly instead of using fixed gears.
3|What is a crumple zone?|This part of a car is designed to deform in a crash and absorb energy.
3|What is lane-keeping assist?|This driver-assistance feature nudges a car back toward its lane.
3|What is a boxer engine?|This engine layout has horizontally opposed pistons moving like fists.
3|What is direct injection?|This fuel system sprays fuel straight into the combustion chamber.
3|What is a knock sensor?|This sensor detects abnormal combustion and helps adjust ignition timing.
4|What is oversteer?|This handling condition occurs when the rear tires lose grip before the front tires.
4|What is understeer?|This handling condition occurs when the front tires slide wide through a turn.
4|What is a limited-slip differential?|This differential can reduce one-wheel spin during acceleration.
4|What is a monocoque?|This vehicle structure uses the body shell itself as the main load-bearing frame.
4|What is brake fade?|This loss of stopping power can happen when brakes overheat.
4|What is torque vectoring?|This system varies power between wheels to help a car rotate through corners.
5|What is homologation?|This approval process certifies that a car or racing part meets a rule set.
5|What is a transaxle?|This unit combines the transmission and axle drive in one assembly.
5|What is MacPherson strut suspension?|This compact suspension design uses the strut as a load-bearing member.
5|What is a dry sump?|This engine lubrication system stores oil in a separate tank rather than below the crankshaft.
5|What is scrub radius?|This steering geometry distance affects feel and kickback.
5|What is volumetric efficiency?|This measure compares actual air intake with an engine's theoretical capacity.
`);

manual('r1', 'Planes & Aviation', 'general', ['planes','aviation','transportation'], `
1|What is a runway?|This long paved strip is where aircraft take off and land.
1|What is the cockpit?|This part of an aircraft contains the pilots' controls and instruments.
1|What is lift?|This upward aerodynamic force helps keep an aircraft in the air.
1|What is a boarding pass?|This document lets a passenger onto a flight.
1|What is a propeller?|This spinning blade assembly can pull or push an aircraft through the air.
1|What is landing gear?|This wheel assembly supports an aircraft on the ground.
2|What is aileron?|This hinged wing surface helps an aircraft roll left or right.
2|What is the fuselage?|This main body section holds passengers, cargo, and crew.
2|What is turbulence?|This bumpy air motion can make a flight feel rough.
2|What is an air traffic controller?|This person directs aircraft movements to keep traffic separated.
2|What is a glider?|This aircraft can fly without engine power by using rising air.
2|What is an altimeter?|This instrument tells a pilot the aircraft's altitude.
3|What is a jet stream?|This high-altitude river of fast-moving air can speed or slow flights.
3|What is the black box?|This nickname refers to an aircraft's flight data and cockpit voice recorders.
3|What is a stall?|This condition happens when a wing loses smooth airflow and lift drops sharply.
3|What is a transponder?|This device sends an aircraft's identity and altitude to radar systems.
3|What is a hangar?|This large building shelters aircraft on the ground.
3|What is deicing?|This process removes frozen buildup from aircraft surfaces.
4|What is fly-by-wire?|This control system sends pilot inputs electronically rather than through direct cables.
4|What is thrust reverser?|This jet-engine system helps slow a plane after landing.
4|What is dihedral?|This upward angle of wings from root to tip helps lateral stability.
4|What is angle of attack?|This angle compares a wing's chord line with the oncoming airflow.
4|What is wake turbulence?|This swirling air behind a large aircraft can endanger following planes.
4|What is a ramjet?|This jet engine has no compressor and works best only at high speed.
5|What is the coffin corner?|This high-altitude flight region leaves little margin between stall and overspeed.
5|What is ETOPS?|This certification lets twin-engine airliners fly long routes far from diversion airports.
5|What is supercritical wing?|This wing shape delays drag rise near the speed of sound.
5|What is ground effect?|This cushion of altered airflow near a surface can reduce induced drag.
5|What is wing loading?|This ratio compares an aircraft's weight with its wing area.
5|What is vortex generator?|This small fin energizes airflow to delay separation over a surface.
`);

manual('r1', 'Space Exploration', 'stem', ['space-exploration','space','science'], `
1|What is Sputnik 1?|This Soviet satellite became the first human-made object to orbit Earth.
1|Who is Yuri Gagarin?|This cosmonaut became the first person in space.
1|What is the Space Shuttle?|This reusable NASA vehicle launched like a rocket and landed like a glider.
1|What is a rover?|This wheeled robot explores the surface of another world.
1|What is Mission Control?|This ground center supports astronauts and spacecraft during a mission.
1|What is a launch pad?|This structure supports a rocket before liftoff.
1|What is a payload fairing?|This nose-cone covering protects cargo during the early part of launch.
1|What is a launch window?|This time period is when a mission can lift off and still reach its target.
1|What is a spacesuit?|This wearable system protects an astronaut outside a spacecraft.
2|What is Vostok 1?|This spacecraft carried the first human into orbit.
2|What is Voyager 2?|This probe visited all four giant planets on its grand tour.
2|What is the International Space Station?|This orbiting laboratory has hosted crews from many nations.
2|What is Curiosity?|This car-sized NASA rover landed in Gale Crater on Mars.
2|What is the Hubble Space Telescope?|This orbiting telescope gave astronomy a sharper view above Earth's atmosphere.
2|What is Skylab?|This was the first U.S. space station.
2|What is Crew Dragon?|This spacecraft carries astronauts to and from low Earth orbit.
2|What is Ingenuity?|This small helicopter flew in the thin air of Mars.
2|What is Artemis I?|This uncrewed mission tested Orion around the Moon.
2|What is Lunar Gateway?|This planned station would orbit the Moon as part of Artemis.
2|What is Europa Clipper?|This NASA mission is designed to study an icy moon of Jupiter.
3|What is Chang'e 4?|This Chinese mission made the first soft landing on the far side of the Moon.
3|What is Cassini?|This spacecraft orbited Saturn and sent the Huygens probe to Titan.
3|What is Rosetta?|This European spacecraft escorted comet 67P and deployed the Philae lander.
3|What is New Horizons?|This spacecraft flew past Pluto in 2015.
3|What is Perseverance?|This rover is collecting sealed samples in Jezero Crater.
3|What is Parker Solar Probe?|This spacecraft flies through the Sun's outer corona.
3|What is Juno?|This spacecraft studies Jupiter's gravity, magnetic field, and atmosphere.
3|What is MAVEN?|This orbiter studies how Mars lost much of its atmosphere.
3|What is Mars Odyssey?|This long-running orbiter has mapped Mars from above since 2001.
3|What is ExoMars Trace Gas Orbiter?|This European orbiter studies gases in the Martian atmosphere.
3|What is Dawn?|This spacecraft orbited both Vesta and Ceres.
4|What is Hayabusa2?|This Japanese mission returned samples from asteroid Ryugu.
4|What is OSIRIS-REx?|This NASA mission returned a sample from asteroid Bennu.
4|What is Mariner 10?|This probe was the first to visit Mercury.
4|What is Luna 9?|This Soviet spacecraft made the first survivable soft landing on the Moon.
4|What is BepiColombo?|This joint mission is traveling to study Mercury.
4|What is NEAR Shoemaker?|This spacecraft orbited and landed on asteroid Eros.
4|What is MESSENGER?|This spacecraft became the first to orbit Mercury.
4|What is Genesis?|This mission returned samples of solar wind to Earth.
5|What is Venera 7?|This Soviet probe made the first successful landing on another planet.
5|What is Giotto?|This European probe flew close to Halley's Comet in 1986.
5|What is Surveyor 1?|This NASA lander proved soft-landing techniques on the Moon before crewed missions.
5|What is Akatsuki?|This Japanese orbiter studies the atmosphere of Venus.
5|What is JUICE?|This European mission is headed to study Jupiter's icy moons.
5|What is IKAROS?|This Japanese spacecraft demonstrated solar-sail propulsion.
5|What is SMART-1?|This European lunar orbiter tested solar-electric propulsion.
5|What is Aditya-L1?|This Indian solar observatory was sent toward the Sun-Earth L1 point.
`);

manual('r1', 'Animals', 'stem', ['animals','biology'], `
1|What is a meerkat?|This small mongoose relative stands upright as a lookout in southern Africa.
1|What is a red panda?|This bamboo-eating mammal is not a close relative of the giant panda.
1|What is a clownfish?|This reef fish can live among the stinging tentacles of sea anemones.
1|What is a beaver?|This rodent builds dams and lodges with branches and mud.
1|What is a flamingo?|This wading bird often gets its pink color from pigments in its food.
1|What is a wombat?|This Australian marsupial digs burrows and produces cube-shaped droppings.
2|What is an ocelot?|This spotted wild cat lives in parts of the Americas.
2|What is a pangolin?|This scaly mammal rolls into a ball when threatened.
2|What is a narwhal?|This Arctic whale is famous for a long spiral tusk.
2|What is a capybara?|This South American rodent is the largest living rodent.
2|What is a quokka?|This small Australian marsupial is known for its camera-ready grin.
2|What is an okapi?|This forest relative of the giraffe has zebra-like leg stripes.
3|What is a cassowary?|This large flightless bird has a helmet-like casque on its head.
3|What is a tardigrade?|This tiny animal can survive extreme drying by entering a tun state.
3|What is a mantis shrimp?|This crustacean strikes prey with a rapid club-like appendage.
3|What is a kakapo?|This nocturnal, flightless parrot lives in New Zealand.
3|What is a saiga antelope?|This steppe antelope has a large flexible nose.
3|What is a hoatzin?|This Amazonian bird's chicks have claws on their wings.
4|What is a solenodon?|This venomous insect-eating mammal survives in the Caribbean.
4|What is a tuatara?|This New Zealand reptile is the lone survivor of an ancient order.
4|What is a coelacanth?|This lobe-finned fish was long known only from fossils before a living one was found.
4|What is a shoebill?|This tall African bird has a huge shoe-shaped bill.
4|What is a binturong?|This civet relative is sometimes called a bearcat and smells like popcorn.
4|What is a numbat?|This termite-eating Australian marsupial has a long sticky tongue.
5|What is a vaquita?|This tiny porpoise of the Gulf of California is critically endangered.
5|What is a fossa?|This catlike carnivore is native to Madagascar.
5|What is a gerenuk?|This long-necked antelope can stand on its hind legs to browse.
5|What is a gharial?|This fish-eating crocodilian has a long narrow snout.
5|What is a markhor?|This wild goat has dramatic corkscrew horns.
5|What is an aye-aye?|This lemur uses an elongated finger to tap and extract insects.
`);

manual('r1', 'World War II', 'history_civics', ['world-war-ii','history'], `
1|What is rationing?|This wartime system limited civilian purchases of goods like sugar and gasoline.
1|What is D-Day?|This nickname refers to the Allied landings in Normandy on June 6, 1944.
1|What is Pearl Harbor?|This U.S. naval base was attacked on December 7, 1941.
1|What is the Blitz?|This German bombing campaign targeted British cities in 1940 and 1941.
1|What is VE Day?|This day marked victory in Europe in May 1945.
1|What is VJ Day?|This day marked victory over Japan in 1945.
2|What is Operation Torch?|This Allied landing opened the North African campaign in late 1942.
2|What is Midway?|This 1942 Pacific battle turned on aircraft carriers and codebreaking.
2|What is the Enigma machine?|This cipher device was used by Germany for secret communications.
2|What is the Lend-Lease Act?|This U.S. program supplied Allied nations before direct American entry.
2|What is the Home Front?|This phrase describes civilian mobilization and production during the war.
2|What is ration book?|This booklet tracked limited civilian purchases during wartime.
3|What is Operation Market Garden?|This Allied plan tried to seize bridges in the Netherlands in 1944.
3|What is the Battle of Kursk?|This 1943 battle was one of history's largest tank clashes.
3|What is the Manhattan Project?|This secret Allied program developed atomic weapons.
3|What is the Yalta Conference?|This 1945 meeting brought Roosevelt, Churchill, and Stalin together in Crimea.
3|What is the Battle of the Bulge?|This German counteroffensive struck through the Ardennes in late 1944.
3|What is the Doolittle Raid?|This 1942 carrier-launched raid struck Tokyo.
4|What is Operation Bagration?|This 1944 Soviet offensive devastated Germany's Army Group Centre.
4|What is the Casablanca Conference?|This 1943 meeting announced the Allied demand for unconditional surrender.
4|What is the Tehran Conference?|This 1943 meeting was the first Big Three conference with all three leaders present.
4|What is the Battle of Leyte Gulf?|This 1944 naval battle helped return the Philippines to Allied control.
4|What is the Warsaw Uprising?|This 1944 Polish resistance revolt was launched as Soviet forces neared the city.
4|What is Operation Fortitude?|This deception helped hide the actual Normandy invasion site.
5|What is Operation Mincemeat?|This deception used false papers on a corpse to mislead Axis planners.
5|What is the Katyn massacre?|This mass killing of Polish officers by Soviet forces was uncovered in 1943.
5|What is the Kasserine Pass?|This 1943 battle exposed weaknesses in inexperienced U.S. forces in North Africa.
5|What is the Combined Bomber Offensive?|This Allied air campaign coordinated strategic bombing against Germany.
5|What is Operation Dragoon?|This 1944 Allied invasion landed in southern France.
5|What is the Hump airlift?|This dangerous route supplied China over the Himalayas.
`);

manual('r1', 'Modern Civics', 'history_civics', ['politics','civics'], `
1|What is a constitution?|This basic law sets out the structure and powers of a government.
1|What is a cabinet?|This group of senior ministers helps lead the executive branch.
1|What is a referendum?|This direct vote asks citizens to decide a specific public question.
1|What is a bill?|This proposed law must pass through a legislature before becoming law.
1|What is citizenship?|This legal status connects a person with rights and duties in a country.
1|What is parliament?|This representative body debates and passes laws in many countries.
1|What is a ballot?|This paper or electronic record lets a voter mark a choice.
1|What is voter turnout?|This percentage shows how many eligible voters cast ballots.
1|What is a mayor?|This elected leader heads many city governments.
1|What is a bylaw?|This local rule is passed by a municipal government.
1|What is public service?|This broad term covers government work done for the community.
1|What is a polling station?|This place is where voters go to cast ballots in person.
2|What is federalism?|This system divides authority between national and regional governments.
2|What is judicial review?|This power lets courts examine whether laws fit a constitution.
2|What is proportional representation?|This election system aims to match seats closely with vote shares.
2|What is a coalition government?|This government is formed by more than one political party working together.
2|What is an ombudsman?|This official investigates complaints about public administration.
2|What is rule of law?|This principle says government power must follow publicly known laws.
2|What is a riding?|This Canadian term can name an electoral district.
2|What is a ward?|This local electoral district is often used in municipal politics.
2|What is a quorum?|This minimum number of members must be present for official business.
2|What is a deputy minister?|This senior public servant leads a government department's administration.
2|What is a municipal council?|This elected body governs a city, town, or local municipality.
2|What is a public hearing?|This meeting lets people comment before an official decision.
3|What is responsible government?|This principle makes the executive answerable to the elected legislature.
3|What is a confidence vote?|This parliamentary vote tests whether the government still has majority support.
3|What is gerrymandering?|This manipulation of electoral boundaries can help one party unfairly.
3|What is civil society?|This term covers voluntary groups and associations outside government and business.
3|What is parliamentary privilege?|This protection lets legislators speak freely during official proceedings.
3|What is separation of powers?|This design divides authority among branches of government.
3|What is order paper?|This parliamentary document lists business scheduled for a sitting day.
3|What is private member's bill?|This proposed law is introduced by a legislator who is not a cabinet minister.
3|What is electoral register?|This official list records people eligible to vote.
4|What is subsidiarity?|This principle says decisions should be handled by the lowest competent authority.
4|What is a constructive vote of no confidence?|This rule removes a government only when a replacement is ready.
4|What is bicameralism?|This arrangement gives a legislature two chambers.
4|What is entrenchment?|This process makes constitutional rules harder to change than ordinary laws.
4|What is caretaker convention?|This norm limits major government decisions during an election period.
4|What is judicial independence?|This principle protects courts from improper political pressure.
4|What is delegated authority?|This power is assigned from one public body or office to another.
4|What is administrative tribunal?|This body decides specialized disputes outside ordinary courts.
4|What is statutory instrument?|This written rule is made under authority granted by a statute.
5|What is mixed-member proportional representation?|This electoral system combines local representatives with party-list seats.
5|What is deliberative democracy?|This democratic theory emphasizes public reasoning before collective decisions.
5|What is constitutional convention?|This unwritten rule guides government behavior even if courts may not enforce it.
5|What is asymmetrical federalism?|This arrangement gives different regions different powers within one federation.
5|What is delegated legislation?|This lawmaking authority is given by a legislature to the executive or agencies.
5|What is reserve powers?|These discretionary powers may be held by a head of state in rare situations.
`);
skipManual('r1', 'Canadian Geography', 'geography', ['canada','geography'], `
1|What is the Canadian Shield?|This ancient rock region covers much of central and eastern Canada.
1|What is Lake Winnipeg?|This large Manitoba lake drains northward through the Nelson River system.
1|What is Baffin Island?|This Arctic island is Canada's largest island.
1|What is the Prairies?|This broad grassland region includes much of Alberta, Saskatchewan, and Manitoba.
1|What is the Niagara Escarpment?|This ridge runs through Ontario and is linked to the famous waterfall region.
1|What is Georgian Bay?|This large bay of Lake Huron borders Ontario's cottage country.
2|What is the Mackenzie River?|This long river system flows toward the Arctic Ocean.
2|What is the Avalon Peninsula?|This Newfoundland peninsula includes St. John's.
2|What is the Bay of Fundy tides?|This Atlantic region is famous for extremely high tides.
2|What is the Fraser River?|This British Columbia river flows past the Lower Mainland to the Strait of Georgia.
2|What is the Torngat Mountains?|This range rises in northern Labrador and Quebec.
2|What is the Columbia Icefield?|This Rocky Mountain icefield feeds several major rivers.
3|What is the Peace-Athabasca Delta?|This large inland freshwater delta lies near Lake Athabasca.
3|What is the Oak Ridges Moraine?|This glacial landform north of Toronto helps feed watersheds.
3|What is the Magdalen Islands?|This Quebec archipelago sits in the Gulf of St. Lawrence.
3|What is the Cypress Hills?|This upland region straddles Alberta and Saskatchewan.
3|What is the Nahanni River?|This Northwest Territories river is known for Virginia Falls.
3|What is the Manicouagan Reservoir?|This ring-shaped Quebec reservoir marks an ancient impact crater.
4|What is the Boothia Peninsula?|This Arctic peninsula is near the north magnetic pole's historic locations.
4|What is the Ungava Peninsula?|This northern Quebec peninsula lies between Hudson Bay and Ungava Bay.
4|What is the Queen Charlotte Sound?|This body of water lies off the central coast of British Columbia.
4|What is the Thelon River?|This northern river flows through a major wildlife sanctuary.
4|What is the Frontenac Arch?|This geological bridge connects the Canadian Shield to the Adirondacks.
4|What is the Holland Marsh?|This agricultural lowland north of Toronto is known for vegetable farming.
5|What is the Nastapoka arc?|This curved shoreline feature appears along eastern Hudson Bay.
5|What is the Smoking Hills?|This Northwest Territories coastline has lignite deposits that can smolder naturally.
5|What is the Sverdrup Islands?|This High Arctic island group includes Axel Heiberg and Ellef Ringnes islands.
5|What is the Wopmay orogen?|This ancient mountain-building belt lies in northwestern Canada.
5|What is the Bathurst Inlet?|This Arctic inlet cuts into the mainland of Nunavut.
5|What is the Temiskaming Graben?|This rift valley region lies near the Ontario-Quebec border.
`);

manual('r1', 'World Capitals', 'geography', ['world-capitals','geography'], `
1|What is Asuncion?|This capital of Paraguay sits on the Paraguay River.
1|What is Montevideo?|This capital of Uruguay lies on the Rio de la Plata.
1|What is Tbilisi?|This capital of Georgia stands along the Kura River.
1|What is Yerevan?|This capital of Armenia has views toward Mount Ararat.
1|What is Vilnius?|This capital of Lithuania has a baroque old town.
1|What is Riga?|This Latvian capital stands near the mouth of the Daugava River.
2|What is Chisinau?|This capital of Moldova lies on the Bic River.
2|What is Bratislava?|This capital of Slovakia sits on the Danube near Austria.
2|What is Muscat?|This capital of Oman lies on the Gulf of Oman.
2|What is Amman?|This capital of Jordan is built across many hills.
2|What is Vientiane?|This capital of Laos stands near the Mekong River.
2|What is Skopje?|This capital of North Macedonia lies on the Vardar River.
3|What is Dushanbe?|This capital of Tajikistan means Monday in Persian.
3|What is Ashgabat?|This capital of Turkmenistan is known for white marble buildings.
3|What is Windhoek?|This capital of Namibia lies in a central highland basin.
3|What is Kigali?|This capital of Rwanda is set among green hills.
3|What is Ljubljana?|This Slovenian capital is crossed by the Ljubljanica River.
3|What is Tirana?|This capital of Albania is centered around Skanderbeg Square.
4|What is Porto-Novo?|This official capital of Benin differs from its larger city Cotonou.
4|What is Ngerulmud?|This small planned capital belongs to Palau.
4|What is Funafuti?|This atoll capital belongs to Tuvalu.
4|What is Moroni?|This capital of Comoros lies on Grande Comore island.
4|What is Banjul?|This capital of The Gambia sits on an island near the Atlantic.
4|What is Malabo?|This capital of Equatorial Guinea sits on Bioko island.
5|What is Naypyidaw?|This planned capital replaced Yangon as Myanmar's seat of government.
5|What is Gitega?|This inland city replaced Bujumbura as Burundi's political capital.
5|What is Sri Jayawardenepura Kotte?|This official legislative capital of Sri Lanka sits near Colombo.
5|What is Dodoma?|This inland city is Tanzania's official capital.
5|What is Tarawa?|This atoll capital belongs to Kiribati.
5|What is Honiara?|This capital of Solomon Islands is on Guadalcanal.
`);

skipManual('r1', 'Biology', 'stem', ['biology','science'], `
1|What is chlorophyll?|This green pigment helps plants capture light for photosynthesis.
1|What is a nucleus?|This membrane-bound structure holds most of a eukaryotic cell's DNA.
1|What is an enzyme?|This biological catalyst speeds up chemical reactions in cells.
1|What is a habitat?|This is the natural home or environment of an organism.
1|What is a chromosome?|This DNA-containing structure carries many genes.
1|What is pollen?|This powdery plant material carries male reproductive cells.
2|What is osmosis?|This movement of water crosses a membrane toward higher solute concentration.
2|What is a ribosome?|This cell structure builds proteins by reading messenger RNA.
2|What is a mitochondrion?|This organelle releases usable energy through cellular respiration.
2|What is pollination?|This transfer of pollen allows many plants to reproduce.
2|What is symbiosis?|This close relationship links two different species.
2|What is a vacuole?|This cell compartment stores water, nutrients, or waste.
3|What is meiosis?|This cell division produces gametes with half the usual chromosome number.
3|What is transcription?|This process copies DNA information into RNA.
3|What is a keystone species?|This species has an unusually large effect on its ecosystem.
3|What is a codon?|This three-base RNA sequence specifies an amino acid or stop signal.
3|What is allele frequency?|This measure describes how common a gene variant is in a population.
3|What is plasmid?|This small circular DNA molecule is common in bacteria.
4|What is endosymbiosis?|This theory explains how mitochondria and chloroplasts began as internal bacteria.
4|What is epigenetics?|This field studies heritable changes in gene activity without DNA sequence changes.
4|What is cladistics?|This method groups organisms by shared derived traits.
4|What is allopolyploidy?|This condition combines chromosome sets from different species.
4|What is quorum sensing?|This bacterial communication system responds to population density.
4|What is horizontal gene transfer?|This movement of genes between organisms bypasses parent-to-offspring inheritance.
5|What is CRISPR-Cas9?|This gene-editing system uses a guide RNA and a DNA-cutting enzyme.
5|What is riboswitch?|This RNA segment can change shape to regulate gene expression.
5|What is molecular clock?|This method estimates evolutionary timing from genetic differences.
5|What is paedomorphosis?|This evolutionary pattern retains juvenile traits in adults.
5|What is Batesian mimicry?|This mimicry lets a harmless species resemble a harmful one.
5|What is cryptobiosis?|This extreme dormancy nearly stops metabolism under harsh conditions.
`);

skipManual('r1', 'Computer Science', 'stem', ['computer-science','technology'], `
1|What is a loop?|This programming structure repeats a block of instructions.
1|What is a variable?|This named storage location holds a value in a program.
1|What is debugging?|This process finds and fixes errors in code.
1|What is a database?|This organized collection stores data for later use.
1|What is a function?|This reusable block of code performs a task.
1|What is a bit?|This smallest binary unit can be 0 or 1.
2|What is recursion?|This technique has a function call itself.
2|What is a compiler?|This program translates source code into another form before execution.
2|What is an array?|This data structure stores ordered items by index.
2|What is boolean logic?|This logic works with true and false values.
2|What is an operating system?|This software manages hardware and other programs.
2|What is a file path?|This text describes where a file is located.
3|What is a hash table?|This data structure uses a hash function to place key-value pairs.
3|What is binary search?|This algorithm repeatedly halves a sorted search space.
3|What is an API endpoint?|This address exposes a service operation to other software.
3|What is encapsulation?|This object-oriented idea bundles data with methods and hides details.
3|What is a stack overflow?|This error can occur when calls exceed available stack memory.
3|What is serialization?|This process converts data into a storable or transferable format.
4|What is dynamic programming?|This technique stores solutions to overlapping subproblems.
4|What is a race condition?|This bug depends on unpredictable timing between operations.
4|What is dependency injection?|This design pattern supplies a component's dependencies from outside it.
4|What is a trie?|This tree-like structure stores strings by shared prefixes.
4|What is garbage collection?|This automatic memory management reclaims unreachable objects.
4|What is idempotence?|This property means repeating an operation has the same effect as doing it once.
5|What is topological sort?|This ordering places each directed edge before its dependent target.
5|What is memoization?|This optimization caches function results for repeated inputs.
5|What is eventual consistency?|This distributed-system model lets replicas agree after updates settle.
5|What is a Bloom filter?|This probabilistic structure can report false positives but not false negatives.
5|What is referential transparency?|This property lets an expression be replaced by its value without changing behavior.
5|What is backtracking?|This search technique abandons partial solutions that cannot work.
`);

skipManual('r1', 'Video Games', 'film_television', ['video-games','entertainment'], `
1|What is Mario Kart?|This racing series lets players throw shells and banana peels from karts.
1|What is Minecraft?|This block-building game has Survival and Creative modes.
1|What is Rocket League?|This game mixes soccer with rocket-powered cars.
1|What is Stardew Valley?|This farming game lets players restore a farm and befriend villagers.
1|What is Portal?|This puzzle game uses linked doorways made by a handheld device.
1|What is Splatoon?|This Nintendo series has teams cover arenas with ink.
2|What is Celeste?|This platformer follows Madeline climbing a mountain.
2|What is Hollow Knight?|This action-adventure game explores the insect kingdom of Hallownest.
2|What is Hades?|This roguelike follows Zagreus trying to escape the underworld.
2|What is Journey?|This wordless game features a robed traveler crossing a desert.
2|What is Kerbal Space Program?|This simulation game lets players design rockets for small green astronauts.
2|What is Animal Crossing?|This life-sim series lets players decorate homes and befriend villagers.
3|What is Chrono Trigger?|This role-playing game sends its heroes through time using gates.
3|What is Shadow of the Colossus?|This game centers on defeating giant beings in a forbidden land.
3|What is Papers, Please?|This game casts the player as a border inspector in Arstotzka.
3|What is Outer Wilds?|This exploration game resets its solar system in a time loop.
3|What is Disco Elysium?|This role-playing game follows an amnesiac detective in Revachol.
3|What is Okami?|This game presents a wolf sun goddess in ink-painting style.
4|What is Firewatch?|This narrative game follows a lookout in the Wyoming wilderness.
4|What is Dwarf Fortress?|This complex simulation inspired many colony-management games.
4|What is Return of the Obra Dinn?|This mystery game uses a magical watch to reconstruct deaths on a ship.
4|What is Ico?|This minimalist adventure game pairs a horned boy with a princess in a castle.
4|What is Katamari Damacy?|This game has players roll objects into an ever-growing ball.
4|What is Grim Fandango?|This adventure game mixes film noir with the Land of the Dead.
5|What is Cave Story?|This indie platform adventure helped define modern freeware indie games.
5|What is The Witness?|This puzzle game fills an island with line-drawing panels.
5|What is Her Story?|This mystery game has players search interview video clips.
5|What is Into the Breach?|This tactics game uses mechs to prevent kaiju attacks on a grid.
5|What is Baba Is You?|This puzzle game lets players change rules by moving words.
5|What is Fez?|This indie platformer rotates a 2D world through 3D perspectives.
`);

skipManual('r1', 'Food & Drink', 'general', ['food-drink'], `
1|What is hummus?|This Middle Eastern dip is made mainly from chickpeas and tahini.
1|What is sushi rice?|This seasoned rice is essential to many Japanese sushi styles.
1|What is maple syrup?|This sweet Canadian product is boiled from tree sap.
1|What is naan?|This flatbread is often baked in a tandoor.
1|What is guacamole?|This avocado-based dip is often served with tortilla chips.
1|What is couscous?|This North African staple is made from tiny granules of semolina.
2|What is kimchi?|This Korean side dish is usually fermented and spicy.
2|What is espresso?|This concentrated coffee is brewed under pressure.
2|What is pesto?|This Italian sauce often combines basil, garlic, pine nuts, cheese, and oil.
2|What is pierogi?|This filled dumpling is common in Polish cuisine.
2|What is ceviche?|This dish cures raw seafood in citrus juice.
2|What is miso?|This fermented soybean paste seasons soups and sauces in Japan.
3|What is injera?|This sour flatbread made from teff is central to Ethiopian meals.
3|What is arepa?|This cornmeal cake is popular in Venezuela and Colombia.
3|What is rooibos?|This caffeine-free tea comes from a South African shrub.
3|What is gochujang?|This Korean chili paste is fermented and savory-sweet.
3|What is halloumi?|This firm cheese from Cyprus can be grilled without melting quickly.
3|What is harissa?|This North African chili paste flavors stews and couscous.
4|What is mole poblano?|This Mexican sauce can include chiles, spices, and chocolate.
4|What is banh mi?|This Vietnamese sandwich reflects French and Vietnamese influences.
4|What is bottarga?|This cured fish roe is grated or sliced in Mediterranean cooking.
4|What is dukkah?|This Egyptian blend combines nuts, seeds, and spices.
4|What is umeboshi?|This salty-sour Japanese pickled plum is often served with rice.
4|What is lavash?|This thin flatbread is traditional in Armenia and nearby regions.
5|What is attieke?|This West African side dish is made from fermented cassava.
5|What is ras el hanout?|This North African spice blend name means head of the shop.
5|What is skyr?|This Icelandic cultured dairy food is thick and high in protein.
5|What is piri piri?|This chili sauce or seasoning is associated with Portuguese and African cooking.
5|What is tempeh?|This fermented soybean cake originated in Indonesia.
5|What is za'atar?|This Middle Eastern herb and spice blend often includes thyme and sumac.
`);

manual('r2', 'Canadian Geography', 'geography', ['canada','geography'], `
1|What is Cape Breton Island?|This Nova Scotia island is linked to the mainland by the Canso Causeway.
1|What is the Okanagan Valley?|This British Columbia region is known for orchards, lakes, and dry summers.
1|What is the Bruce Peninsula?|This Ontario peninsula separates Georgian Bay from Lake Huron.
1|What is Lake Nipissing?|This northern Ontario lake sits between Sudbury and North Bay.
1|What is Kananaskis Country?|This Alberta mountain recreation area lies west of Calgary.
1|What is Prince Edward County?|This Ontario county on Lake Ontario is known for beaches and wineries.
1|What is Fundy National Park?|This New Brunswick park sits beside a bay famous for huge tides.
1|What is the Fundy Trail Parkway?|This scenic New Brunswick route follows cliffs above the Bay of Fundy.
2|What is Bras d'Or Lake?|This inland sea lies in the middle of Cape Breton Island.
2|What is the Saguenay Fjord?|This Quebec fjord meets the St. Lawrence River near Tadoussac.
2|What is the Kootenay River?|This river flows through British Columbia, Montana, and Idaho before joining the Columbia.
2|What is Cabot Strait?|This waterway separates Newfoundland from Cape Breton Island.
2|What is the Athabasca Glacier?|This glacier is one of the most visited parts of the Columbia Icefield.
2|What is the Niagara Peninsula?|This Ontario peninsula lies between Lake Ontario and Lake Erie.
2|What is the Red River Valley?|This flat prairie valley includes Winnipeg and flood-prone farmland.
2|What is the Gaspesie Peninsula?|This Quebec peninsula projects into the Gulf of St. Lawrence.
3|What is Prince William Island?|This Arctic island lies in Nunavut between Victoria Island and the mainland.
3|What is Charlevoix?|This Quebec region northeast of Quebec City was shaped by an ancient impact structure.
3|What is the Strait of Belle Isle?|This passage separates Labrador from Newfoundland.
3|What is the Lake of the Woods?|This lake touches Ontario, Manitoba, and Minnesota.
3|What is the Selkirk Mountains?|This range forms part of the Columbia Mountains in British Columbia.
3|What is Anticosti Island?|This large Quebec island lies in the Gulf of St. Lawrence.
3|What is the Northumberland Strait?|This waterway separates Prince Edward Island from New Brunswick and Nova Scotia.
3|What is the Albany River?|This northern Ontario river flows east into James Bay.
4|What is the Cobalt Embayment?|This geological basin is associated with silver mining in northeastern Ontario.
4|What is the Skeena River?|This British Columbia river reaches the Pacific near Prince Rupert.
4|What is the Mackenzie Delta?|This Arctic delta spreads out where a major northern river meets the Beaufort Sea.
4|What is the Torngat Mountains National Park?|This Labrador park includes some of eastern Canada's highest peaks.
4|What is the Mingan Archipelago?|This Quebec national park reserve is known for limestone monoliths.
4|What is the Pelly Mountains?|This Yukon mountain range lies east of Whitehorse.
4|What is the Wapusk National Park?|This Manitoba park protects polar bear denning habitat near Hudson Bay.
4|What is the Stikine River?|This wild river runs from British Columbia into southeast Alaska.
5|What is the Nastapoka arc?|This curved shoreline feature appears along eastern Hudson Bay.
5|What is the Sverdrup Islands?|This High Arctic island group includes Axel Heiberg and Ellef Ringnes islands.
5|What is the Temiskaming Graben?|This rift valley region lies near the Ontario-Quebec border.
5|What is the Wopmay orogen?|This ancient mountain-building belt lies in northwestern Canada.
5|What is the Belcher Islands?|This archipelago lies in southeastern Hudson Bay.
5|What is the Melville Peninsula?|This Nunavut peninsula sits west of Foxe Basin.
5|What is the Coppermine River?|This river flows north through Nunavut to Coronation Gulf.
5|What is the Smoking Hills?|This Arctic coastline has lignite deposits that can burn naturally.
`);

manual('r2', 'Biology', 'stem', ['biology','science'], `
1|What are guard cells?|These paired cells open and close a plant leaf's stomata.
1|What is xylem?|This plant tissue carries water upward from roots.
1|What is phloem?|This plant tissue transports sugars made by photosynthesis.
1|What is mycelium?|This threadlike network forms much of a fungus.
1|What is a lichen?|This partnership often combines a fungus with an alga or cyanobacterium.
1|What is keratin?|This tough protein helps make hair, nails, feathers, and claws.
1|What is cartilage?|This flexible tissue cushions joints and shapes ears and noses.
1|What is a spore?|This tiny reproductive cell can help fungi, mosses, or ferns spread.
2|What is a stomata?|This tiny pore in a leaf lets gases move in and out.
2|What is a meristem?|This plant growth tissue produces new cells at roots and shoots.
2|What is a synapse?|This junction lets one neuron signal another cell.
2|What is myelin?|This fatty covering helps many nerve signals travel faster.
2|What is an alveolus?|This tiny air sac is where gas exchange occurs in the lungs.
2|What is a nephron?|This microscopic kidney unit filters blood and forms urine.
2|What is a chloroplast?|This organelle captures light energy in plant and algal cells.
2|What is a lysosome?|This organelle breaks down worn-out cell parts and molecules.
2|What is a companion cell?|This plant cell supports sugar transport through sieve tubes.
2|What is a root cap?|This protective tissue covers the growing tip of a plant root.
2|What is parenchyma?|This versatile plant tissue often handles storage, repair, and photosynthesis.
2|What is a fibroblast?|This connective-tissue cell produces collagen and other extracellular fibers.
2|What is an osteoblast?|This bone-forming cell builds new bone matrix.
2|What is a plasmodesma?|This tiny channel connects neighboring plant cells.
2|What is cambium?|This growth tissue produces new xylem and phloem in many stems.
2|What is a bryophyte?|This plant group includes mosses and lacks true vascular tissue.
3|What is a plasmid?|This small circular DNA molecule is common in bacteria.
3|What is a codon?|This three-base RNA sequence specifies an amino acid or stop signal.
3|What is a keystone species?|This species has an unusually large effect on its ecosystem.
3|What is allele frequency?|This measure describes how common a gene variant is in a population.
3|What is a trophic cascade?|This chain reaction moves through food webs when one population changes.
3|What is genetic drift?|This random change in allele frequency can strongly affect small populations.
3|What is a haploid cell?|This cell carries one set of chromosomes rather than paired sets.
3|What is a telomere?|This protective DNA region sits at the end of a chromosome.
3|What is a promoter sequence?|This DNA region helps start transcription of a gene.
3|What is a Punnett square?|This grid predicts possible genotypes from a genetic cross.
3|What is an axon hillock?|This neuron region is where many action potentials begin.
3|What is a mycorrhiza?|This partnership links plant roots with fungi.
3|What is a founder effect?|This genetic drift occurs when a small group starts a new population.
3|What is an operon?|This bacterial gene-control unit groups related genes under one promoter.
4|What is quorum sensing?|This bacterial communication system responds to population density.
4|What is horizontal gene transfer?|This movement of genes between organisms bypasses parent-to-offspring inheritance.
4|What is endosymbiosis?|This theory explains how mitochondria and chloroplasts began as internal bacteria.
4|What is cladistics?|This method groups organisms by shared derived traits.
4|What is apoptosis?|This programmed cell death helps shape tissues and remove damaged cells.
4|What is a homeobox gene?|This gene helps guide body-pattern development in many animals.
4|What is secondary succession?|This ecosystem recovery follows disturbance when soil remains.
4|What is allosteric regulation?|This enzyme control occurs when a molecule binds away from the active site.
5|What is the Casparian strip?|This waxy root barrier helps control what enters plant vascular tissue.
5|What is a riboswitch?|This RNA segment can change shape to regulate gene expression.
5|What is paedomorphosis?|This evolutionary pattern retains juvenile traits in adults.
5|What is cryptobiosis?|This extreme dormancy nearly stops metabolism under harsh conditions.
5|What is plasmodesmata?|These channels connect the cytoplasm of neighboring plant cells.
5|What is a transposon?|This DNA sequence can move to a new position in a genome.
5|What is ectomycorrhiza?|This fungus-root relationship wraps around root cells instead of entering them.
5|What is a kinase cascade?|This signal pathway passes phosphate groups through a chain of proteins.
`);

manual('r2', 'Computer Science', 'stem', ['computer-science','technology'], `
1|What is source code?|This human-written text contains the instructions programmers create.
1|What is a syntax error?|This coding mistake breaks the grammar rules of a language.
1|What is a cache?|This storage area keeps recently used data ready for faster access.
1|What is a parameter?|This named input lets a function receive a value.
1|What is a string literal?|This text value appears directly inside a program.
1|What is version control?|This system tracks changes to files over time.
1|What is the command line?|This text interface lets users type commands to a computer.
1|What is pseudocode?|This plain-language plan describes an algorithm before real code is written.
2|What is a hash table?|This data structure uses a hash function to place key-value pairs.
2|What is binary search?|This algorithm repeatedly halves a sorted search space.
2|What is serialization?|This process converts data into a storable or transferable format.
2|What is an API endpoint?|This address exposes a service operation to other software.
2|What is encapsulation?|This object-oriented idea bundles data with methods and hides details.
2|What is a stack overflow?|This error can occur when calls exceed available stack memory.
2|What is tokenization?|This process breaks text into meaningful pieces for software to handle.
2|What is a pull request?|This proposed code change can be reviewed before merging.
3|What is dependency injection?|This design pattern supplies a component's dependencies from outside it.
3|What is a trie?|This tree-like structure stores strings by shared prefixes.
3|What is idempotence?|This property means repeating an operation has the same effect as doing it once.
3|What is garbage collection?|This automatic memory management reclaims unreachable objects.
3|What is a race condition?|This bug depends on unpredictable timing between operations.
3|What is dynamic programming?|This technique stores solutions to overlapping subproblems.
3|What is memoization?|This optimization caches function results for repeated inputs.
3|What is topological sort?|This ordering places each directed edge before its dependent target.
4|What is a Bloom filter?|This probabilistic structure can report false positives but not false negatives.
4|What is referential transparency?|This property lets an expression be replaced by its value without changing behavior.
4|What is eventual consistency?|This distributed-system model lets replicas agree after updates settle.
4|What is backtracking?|This search technique abandons partial solutions that cannot work.
4|What is a B-tree?|This balanced tree structure is common in databases and file systems.
4|What is SIMD?|This processor technique applies one instruction to multiple data values at once.
4|What is a Merkle tree?|This hash tree helps verify that data blocks have not changed.
4|What is tail-call optimization?|This compiler technique can reuse a stack frame for certain recursive calls.
5|What is a red-black tree?|This self-balancing binary search tree colors nodes to maintain balance.
5|What is the CAP theorem?|This result says a distributed system must trade off consistency, availability, and partition tolerance.
5|What is a Lamport clock?|This logical clock orders events in a distributed system.
5|What is Raft consensus?|This algorithm helps replicated servers agree on a log.
5|What is Dijkstra's algorithm?|This algorithm finds shortest paths with nonnegative edge weights.
5|What is a suffix array?|This sorted list of string suffixes helps fast text searching.
5|What is deadlock?|This condition leaves processes waiting forever for each other to release resources.
5|What is vectorization?|This optimization rewrites work to use array-style processor operations.
`);

manual('r2', 'Video Games', 'film_television', ['video-games','entertainment'], `
1|What is a checkpoint?|This save marker lets a player restart from a recent point after failing.
1|What is a hitbox?|This invisible shape determines whether attacks or collisions connect.
1|What is a sandbox game?|This game style gives players open-ended tools and freedom.
1|What is a rhythm game?|This genre asks players to act in time with music.
1|What is a speedrun?|This play style tries to finish a game as quickly as possible.
1|What is a save point?|This spot lets a player record progress.
1|What is co-op mode?|This mode lets players work together toward shared goals.
1|What is a boss fight?|This major battle usually tests skills learned earlier in a game.
2|What is Terraria?|This 2D sandbox adventure has players dig, craft, build, and battle bosses.
2|What is Slay the Spire?|This deck-building roguelike sends players up a branching tower.
2|What is Untitled Goose Game?|This comedy puzzle game stars a mischievous goose in an English village.
2|What is Cuphead?|This run-and-gun game is styled after 1930s cartoons.
2|What is Subnautica?|This survival game explores an alien ocean world.
2|What is Ori and the Blind Forest?|This platform adventure stars a glowing guardian spirit.
2|What is FTL: Faster Than Light?|This game manages a spaceship crew during a dangerous sector-by-sector escape.
2|What is Spiritfarer?|This gentle management game has players ferry spirits and build a boat.
3|What is Metroidvania?|This genre rewards exploration with abilities that open earlier paths.
3|What is roguelite?|This genre keeps some progress between randomized runs.
3|What is procedural generation?|This technique creates levels or content through algorithms.
3|What is rollback netcode?|This networking method helps fast games feel responsive online.
3|What is pathfinding?|This system lets game characters find routes through a level.
3|What is emergent gameplay?|This play arises from systems interacting in surprising ways.
3|What is diegetic UI?|This interface exists inside the game world rather than only on the screen overlay.
3|What is a tech tree?|This branching upgrade map unlocks tools, units, or abilities.
4|What is The Witness?|This puzzle game fills an island with line-drawing panels.
4|What is Return of the Obra Dinn?|This mystery game uses a magical watch to reconstruct deaths on a ship.
4|What is Into the Breach?|This tactics game uses mechs to prevent giant insect attacks on a grid.
4|What is Baba Is You?|This puzzle game lets players change rules by moving words.
4|What is Fez?|This indie platformer rotates a 2D world through 3D perspectives.
4|What is Hyper Light Drifter?|This action game uses wordless storytelling and neon pixel art.
4|What is Tunic?|This adventure game hides many clues inside an in-game instruction manual.
4|What is Outer Wilds?|This exploration game resets its solar system in a time loop.
5|What is ludonarrative dissonance?|This term describes conflict between a game's story and its play actions.
5|What is bunny hopping?|This movement technique chains jumps to preserve or build speed.
5|What is frame data?|This fighting-game information counts startup, active, and recovery frames.
5|What is input buffering?|This system stores a player's input briefly so it can trigger at the right moment.
5|What is coyote time?|This platforming grace period allows a jump just after leaving a ledge.
5|What is rubber-banding AI?|This racing-game technique helps trailing competitors catch up.
5|What is dynamic difficulty adjustment?|This system changes challenge based on player performance.
5|What is animation canceling?|This technique interrupts an animation to act sooner than usual.
`);

manual('r2', 'Food & Drink', 'general', ['food-drink'], `
1|What is tzatziki?|This Greek sauce combines yogurt, cucumber, garlic, and herbs.
1|What is falafel?|This fried Middle Eastern food is often made from chickpeas or fava beans.
1|What is biryani?|This spiced rice dish is often layered with meat, eggs, or vegetables.
1|What is focaccia?|This Italian flatbread is often dimpled and seasoned with olive oil.
1|What is dulce de leche?|This caramel-like sweet is made by slowly heating sweetened milk.
1|What is tahini?|This sesame paste appears in hummus and many sauces.
1|What is kombucha?|This fizzy fermented tea is made with a culture of bacteria and yeast.
1|What is paneer?|This firm fresh cheese is common in South Asian cooking.
2|What is shakshuka?|This dish poaches eggs in a spiced tomato and pepper sauce.
2|What is pho?|This Vietnamese soup features broth, rice noodles, herbs, and often beef or chicken.
2|What is congee?|This rice porridge appears in many East and Southeast Asian cuisines.
2|What is chimichurri?|This Argentine herb sauce is often served with grilled meat.
2|What is socca?|This chickpea flour pancake is associated with Nice in southern France.
2|What is tom yum?|This Thai soup is known for hot, sour, and aromatic flavors.
2|What is tagine?|This North African stew is named for the cone-lidded pot used to cook it.
2|What is labneh?|This strained yogurt cheese is common in Middle Eastern cooking.
3|What is gochugaru?|This Korean red pepper powder seasons kimchi and stews.
3|What is pandan?|This fragrant tropical leaf flavors many Southeast Asian desserts.
3|What is farro?|This chewy ancient wheat grain appears in soups and salads.
3|What is yuzu?|This East Asian citrus fruit has a bright, aromatic flavor.
3|What is sumac?|This tangy red spice is used in Middle Eastern cooking.
3|What is poutine?|This Canadian dish combines fries, cheese curds, and gravy.
3|What is mochi?|This chewy Japanese food is made from pounded glutinous rice.
3|What is aioli?|This garlicky Mediterranean sauce is traditionally emulsified with oil.
4|What is dukkah?|This Egyptian blend combines nuts, seeds, and spices.
4|What is umeboshi?|This salty-sour Japanese pickled plum is often served with rice.
4|What is bottarga?|This cured fish roe is grated or sliced in Mediterranean cooking.
4|What is mole poblano?|This Mexican sauce can include chiles, spices, and chocolate.
4|What is lavash?|This thin flatbread is traditional in Armenia and nearby regions.
4|What is nam prik?|This Thai chili relish family can be served with vegetables or fish.
4|What is berbere?|This Ethiopian spice blend often includes chiles, ginger, and warm spices.
4|What is koshari?|This Egyptian street food combines rice, lentils, pasta, and tomato sauce.
5|What is attieke?|This West African side dish is made from fermented cassava.
5|What is ras el hanout?|This North African spice blend name means head of the shop.
5|What is skyr?|This Icelandic cultured dairy food is thick and high in protein.
5|What is piri piri?|This chili sauce or seasoning is associated with Portuguese and African cooking.
5|What is tempeh?|This fermented soybean cake originated in Indonesia.
5|What is za'atar?|This Middle Eastern herb and spice blend often includes thyme and sumac.
5|What is shio koji?|This Japanese seasoning uses rice koji, salt, and water to tenderize and flavor foods.
5|What is garum?|This fermented fish sauce was prized in ancient Roman cooking.
`);

manual('r1', 'Weather & Climate', 'stem', ['weather','climate','science'], `
1|What is drizzle?|This light rain falls in very small droplets.
1|What is a heat wave?|This stretch of unusually hot weather can last for several days.
1|What is sleet?|This winter precipitation falls as small pellets of ice.
1|What is humidity?|This measure describes how much water vapor is in the air.
1|What is frost?|This icy coating forms when water vapor freezes on cold surfaces.
1|What is a rain gauge?|This instrument measures how much rain has fallen.
1|What is a cold front?|This boundary forms where colder air advances into warmer air.
1|What is cloud cover?|This term describes how much of the sky is hidden by clouds.
2|What is barometric pressure?|This air-pressure reading often changes before storms arrive.
2|What is an anemometer?|This instrument measures wind speed.
2|What is a cumulonimbus cloud?|This towering cloud type is often linked with thunderstorms.
2|What is lake-effect snow?|This snow develops when cold air crosses warmer lake water.
2|What is the dew point?|This temperature marks when air becomes saturated with water vapor.
2|What is a sea breeze?|This daytime coastal wind often blows from water toward land.
2|What is wind chill?|This index estimates how cold moving air feels on skin.
2|What is a rain shadow?|This dry region forms on the leeward side of a mountain range.
3|What is an occluded front?|This front forms when a cold front overtakes a warm front.
3|What is virga?|This precipitation evaporates before reaching the ground.
3|What is a microburst?|This localized downdraft can create dangerous straight-line winds.
3|What is graupel?|This soft pellet forms when supercooled droplets freeze onto snowflakes.
3|What is albedo?|This measure describes how much sunlight a surface reflects.
3|What is a polar vortex?|This large circulation of cold air sits high over polar regions.
3|What is an isobar?|This weather-map line connects places with equal air pressure.
3|What is a mesocyclone?|This rotating updraft can form inside a severe thunderstorm.
4|What is adiabatic cooling?|This cooling occurs when rising air expands as pressure drops.
4|What is a temperature inversion?|This layer traps cooler air below warmer air.
4|What is orographic lift?|This rising air is forced upward by terrain such as mountains.
4|What is the Coriolis effect?|This apparent deflection shapes winds because Earth rotates.
4|What is a derecho?|This widespread windstorm is linked to a long-lived line of thunderstorms.
4|What is the dryline?|This boundary separates moist air from much drier air.
4|What is latent heat?|This stored energy is released when water vapor condenses.
4|What is the Beaufort scale?|This scale estimates wind force from observed effects.
5|What is radiative forcing?|This measure describes an imbalance in energy entering and leaving Earth.
5|What is the Walker circulation?|This tropical Pacific air pattern is linked to El Nino and La Nina.
5|What is a katabatic wind?|This dense downslope wind flows from high terrain under gravity.
5|What is potential vorticity?|This conserved atmospheric quantity helps meteorologists analyze rotating flow.
5|What is the Madden-Julian Oscillation?|This moving tropical disturbance influences rainfall around the globe.
5|What is atmospheric river?|This long narrow band carries large amounts of water vapor.
5|What is the quasi-biennial oscillation?|This stratospheric wind pattern reverses direction roughly every two years.
5|What is lapse rate?|This rate describes how air temperature changes with altitude.
`);

manual('r2', 'Human Body', 'stem', ['human-body','biology','science'], `
1|What is the femur?|This thigh bone is the longest bone in the human body.
1|What is the iris?|This colored part of the eye helps control pupil size.
1|What is the diaphragm?|This muscle helps draw air into the lungs.
1|What is saliva?|This fluid begins digestion and moistens food in the mouth.
1|What is the kneecap?|This small bone is also called the patella.
1|What is cartilage?|This flexible tissue cushions joints and shapes parts of the ear and nose.
1|What is the retina?|This light-sensitive layer lines the back of the eye.
1|What is the trachea?|This windpipe carries air toward the lungs.
2|What is the cochlea?|This spiral inner-ear structure helps turn sound vibrations into nerve signals.
2|What is the pancreas?|This organ releases digestive enzymes and helps control blood sugar.
2|What is the cerebellum?|This brain region helps coordinate balance and movement.
2|What is the ulna?|This forearm bone lies on the pinky-finger side.
2|What is hemoglobin?|This protein in red blood cells carries oxygen.
2|What is the scapula?|This shoulder blade anchors muscles of the upper back and arm.
2|What is the adrenal gland?|This gland above the kidney releases hormones including adrenaline.
2|What is the small intestine?|This digestive organ absorbs many nutrients after food leaves the stomach.
2|What is the medulla oblongata?|This brainstem region helps regulate breathing and heart rate.
2|What is the parathyroid gland?|This small neck gland helps regulate calcium levels.
2|What is the humerus?|This long bone runs from the shoulder to the elbow.
2|What is the clavicle?|This collarbone connects the breastbone to the shoulder.
2|What is the temporal lobe?|This brain lobe helps process sound and memory.
2|What is the Achilles tendon?|This tendon connects calf muscles to the heel bone.
2|What is the epiglottis?|This flap helps keep food out of the windpipe when swallowing.
2|What is the meniscus?|This crescent-shaped cartilage cushions the knee.
3|What is the hypothalamus?|This brain region helps regulate temperature, hunger, and hormones.
3|What is the sinoatrial node?|This natural pacemaker starts many heartbeats.
3|What is the alveoli?|These tiny lung sacs exchange oxygen and carbon dioxide.
3|What is the myelin sheath?|This fatty layer insulates many nerve fibers.
3|What is the hepatic portal vein?|This blood vessel carries nutrient-rich blood from the gut to the liver.
3|What is the lacrimal gland?|This gland produces tears.
3|What is the vestibular system?|This inner-ear system helps control balance.
3|What is the thymus?|This immune organ helps T cells mature.
3|What is the pyloric sphincter?|This ring of muscle controls movement from stomach to small intestine.
3|What is the ileum?|This final section of the small intestine absorbs nutrients including vitamin B12.
3|What is the ulnar nerve?|This nerve is involved in the tingling feeling of hitting the funny bone.
3|What is the parietal lobe?|This brain lobe helps process touch and spatial information.
3|What is the mitral valve?|This heart valve sits between the left atrium and left ventricle.
3|What is the spleen?|This organ filters blood and supports immune responses.
3|What is the optic chiasm?|This X-shaped structure is where optic nerve fibers partially cross.
3|What is the pleura?|This membrane surrounds the lungs and lines the chest cavity.
4|What is the loop of Henle?|This kidney structure helps concentrate urine.
4|What is the basal ganglia?|This group of brain structures helps control movement and habits.
4|What is the sinoatrial bundle?|This heart-conduction pathway carries electrical signals between chambers.
4|What is the corpus callosum?|This thick nerve bridge connects the brain's two hemispheres.
4|What is the glomerulus?|This tiny kidney filter begins urine formation.
4|What is the brachial plexus?|This nerve network supplies the shoulder, arm, and hand.
4|What is the ossicles?|These three tiny middle-ear bones transmit sound vibrations.
4|What is the vagus nerve?|This cranial nerve carries signals to the heart, lungs, and digestive tract.
5|What is the arcuate fasciculus?|This nerve pathway links language-related regions of the brain.
5|What is the Purkinje fibers?|These heart-conduction fibers help coordinate ventricular contraction.
5|What is the circle of Willis?|This arterial ring supplies blood around the base of the brain.
5|What is the juxtaglomerular apparatus?|This kidney structure helps regulate blood pressure and filtration.
5|What is the sphenoid bone?|This skull bone sits near the base of the brain and eye sockets.
5|What is the enteric nervous system?|This network of neurons helps control the digestive tract.
5|What is the fovea centralis?|This tiny retinal area gives sharp central vision.
5|What is the ligamentum arteriosum?|This adult remnant comes from a fetal blood vessel near the heart.
`);

manual('r1', 'Inventions', 'history_civics', ['inventions','history','technology'], `
1|What is the safety pin?|Walter Hunt patented this everyday fastener in 1849.
1|What is the zipper?|This fastening device became common on clothing in the 20th century.
1|What is the traffic light?|Garrett Morgan improved this street-safety invention with a warning position.
1|What is the ballpoint pen?|Laszlo Biro helped develop this pen that uses a tiny rolling ball.
1|What is Velcro?|This hook-and-loop fastener was inspired by burrs sticking to clothing.
1|What is the paper clip?|This bent wire office tool holds sheets together without staples.
1|What is the thermos bottle?|This insulated container keeps drinks hot or cold by limiting heat transfer.
1|What is the escalator?|This moving stairway carries people between floors.
2|What is the telegraph?|This invention sent coded messages over wires before the telephone.
2|What is the phonograph?|Thomas Edison demonstrated this machine for recording and playing sound.
2|What is the steam locomotive?|This rail vehicle used steam power to pull trains.
2|What is the sewing machine?|This machine sped up stitching fabric compared with hand sewing.
2|What is the elevator brake?|Elisha Otis demonstrated this safety device for lifts.
2|What is the stethoscope?|Rene Laennec invented this medical listening tool.
2|What is the mechanical reaper?|Cyrus McCormick's farm machine sped up grain harvesting.
2|What is the dishwasher?|Josephine Cochrane built an early successful version of this kitchen machine.
3|What is the Bessemer process?|This method made steel production faster and cheaper.
3|What is the Jacquard loom?|This loom used punched cards to control woven patterns.
3|What is the liquid-fueled rocket?|Robert Goddard launched an early version of this technology in 1926.
3|What is the vacuum tube?|This electronic device controlled current before transistors became common.
3|What is the transistor radio?|This portable device became a symbol of compact consumer electronics.
3|What is the gyroscope?|This spinning device helps maintain orientation in ships, aircraft, and phones.
3|What is the Polaroid camera?|This camera produced a finished photograph minutes after exposure.
3|What is the hovercraft?|This vehicle rides on a cushion of air over land or water.
4|What is the difference engine?|Charles Babbage designed this mechanical calculator for tables.
4|What is vulcanized rubber?|Charles Goodyear's process made rubber stronger and more heat resistant.
4|What is the Haber-Bosch process?|This process synthesizes ammonia from nitrogen and hydrogen.
4|What is the Wheatstone bridge?|This circuit measures electrical resistance by balancing two legs.
4|What is the cavity magnetron?|This device helped generate microwaves for radar during World War II.
4|What is float glass?|This manufacturing process forms flat glass on molten tin.
4|What is the charge-coupled device?|This light-sensitive chip helped digital imaging develop.
4|What is the QR code?|This two-dimensional barcode was invented for tracking parts in manufacturing.
5|What is the astrolabe?|This ancient instrument helped measure positions of stars and planets.
5|What is the Antikythera mechanism?|This ancient Greek device modeled astronomical cycles with gears.
5|What is the klystron?|This vacuum tube amplifies microwave signals.
5|What is the Josephson junction?|This superconducting device is used in precise voltage standards.
5|What is the scanning tunneling microscope?|This instrument images surfaces by measuring quantum tunneling.
5|What is the blue LED?|This invention made efficient white LED lighting possible.
5|What is the Stirling engine?|This heat engine works by cyclic compression and expansion of gas.
5|What is the cyclotron?|This particle accelerator uses a magnetic field and alternating voltage.
`);

manual('r2', 'Technology History', 'stem', ['technology','history'], `
1|What is ENIAC?|This early electronic computer filled a room at the University of Pennsylvania.
1|What is floppy disk?|This removable magnetic storage medium came in sizes such as 5.25 and 3.5 inches.
1|What is Ethernet?|This networking technology was developed at Xerox PARC.
1|What is the World Wide Web?|Tim Berners-Lee created this linked information system on the internet.
1|What is the mouse?|Douglas Engelbart demonstrated this pointing device in 1968.
1|What is SMS?|This short text messaging service became common on mobile phones.
1|What is the compact disc?|This optical disc format stored digital audio and later computer data.
1|What is Wi-Fi?|This wireless networking family is based on IEEE 802.11 standards.
2|What is ARPANET?|This packet-switching network helped lead to the modern internet.
2|What is UNIX?|This operating system family began at Bell Labs.
2|What is Mosaic?|This early graphical web browser helped popularize the web.
2|What is FORTRAN?|This early programming language was designed for scientific computing.
2|What is COBOL?|This business-oriented programming language dates to 1959.
2|What is the Apple II?|This early personal computer helped bring computers into homes and schools.
2|What is the IBM PC?|This 1981 computer helped standardize the personal computer market.
2|What is the PalmPilot?|This handheld organizer became a famous personal digital assistant.
3|What is packet switching?|This method divides messages into small chunks routed across a network.
3|What is the integrated circuit?|This technology puts many electronic components on one chip.
3|What is the microprocessor?|This chip places a computer's central processor on integrated circuitry.
3|What is the relational database?|This database model organizes data into tables linked by keys.
3|What is the Alto?|This Xerox PARC computer used a graphical interface and mouse.
3|What is TCP/IP?|This protocol suite became the foundation of internet communication.
3|What is the Altair 8800?|This 1975 microcomputer kit helped inspire early personal computing.
3|What is the laser printer?|This printer technology was pioneered at Xerox PARC.
4|What is the Manchester Baby?|This 1948 machine ran one of the first stored programs.
4|What is LISP?|This programming language became important in artificial intelligence research.
4|What is Smalltalk?|This object-oriented language and environment influenced modern graphical computing.
4|What is VisiCalc?|This spreadsheet program became a killer app for early personal computers.
4|What is the Cray-1?|This supercomputer was famous for its C-shaped design.
4|What is the Domain Name System?|This system translates names such as example dot com into network addresses.
4|What is the RSA algorithm?|This public-key cryptosystem relies on the difficulty of factoring large numbers.
4|What is the Newton MessagePad?|This Apple handheld device became known for ambitious pen computing.
5|What is Colossus?|This British wartime computer helped analyze encrypted messages.
5|What is the Whirlwind computer?|This MIT computer supported real-time interaction and air-defense research.
5|What is the SAGE system?|This Cold War air-defense system used large computers and radar networks.
5|What is PLATO?|This educational computer system offered early forums, games, and messaging.
5|What is the Dynabook?|Alan Kay's concept imagined a portable personal computer for learning.
5|What is Sketchpad?|Ivan Sutherland's program pioneered interactive computer graphics.
5|What is the Homebrew Computer Club?|This Silicon Valley group connected early personal-computer hobbyists.
5|What is the Connection Machine?|This massively parallel computer was known for blinking red lights.
`);

manual('r1', 'Ancient Civilizations', 'history_civics', ['ancient-history','history'], `
1|What is Sumer?|This Mesopotamian civilization developed city-states such as Uruk.
1|What is the Indus Valley civilization?|This ancient civilization built planned cities including Harappa.
1|What is the Minoan civilization?|This Bronze Age civilization centered on Crete.
1|What is the Phoenicians?|This seafaring people spread an influential alphabet around the Mediterranean.
1|What is ancient Nubia?|This Nile-region civilization lay south of Egypt.
1|What is the Olmec civilization?|This Mesoamerican culture is known for colossal stone heads.
1|What is the Hittite Empire?|This Anatolian power used chariots and negotiated with Egypt.
1|What is the Shang dynasty?|This early Chinese dynasty used oracle bones.
2|What is Uruk?|This Mesopotamian city is linked with one of the world's earliest urban cultures.
2|What is Mohenjo-daro?|This Indus city had carefully planned streets and drainage.
2|What is Knossos?|This palace complex is associated with Minoan Crete.
2|What is Carthage?|This Phoenician-founded city became Rome's major rival.
2|What is Axum?|This African kingdom controlled Red Sea trade and minted coins.
2|What is Teotihuacan?|This Mesoamerican city has the Pyramid of the Sun.
2|What is Babylon?|This Mesopotamian city became famous under Hammurabi and Nebuchadnezzar II.
2|What is Mycenae?|This Greek Bronze Age center gave its name to a civilization.
3|What is cuneiform?|This wedge-shaped writing system was used in Mesopotamia.
3|What is Linear B?|This script records an early form of Greek.
3|What is the Code of Hammurabi?|This Babylonian law collection was carved on a basalt stele.
3|What is oracle bones?|These objects were used for divination in Shang China.
3|What is the Rosetta Stone?|This inscription helped scholars decipher Egyptian hieroglyphs.
3|What is the Royal Road?|This Persian route helped imperial communication across long distances.
3|What is the Mandate of Heaven?|This Chinese idea justified dynastic rule and its loss.
3|What is the Punic Wars?|These conflicts pitted Rome against Carthage.
3|What is the Cyrus Cylinder?|This Persian inscription is linked with Cyrus the Great's conquest of Babylon.
3|What is the Epic of Gilgamesh?|This Mesopotamian work follows a king of Uruk and his companion Enkidu.
3|What is the Linear A script?|This undeciphered script was used by the Minoans.
3|What is the Appian Way?|This Roman road connected Rome with southern Italy.
3|What is the Gupta Empire?|This Indian empire is linked with advances in mathematics, art, and literature.
3|What is the Terracotta Army?|This buried army of clay figures guarded China's first emperor.
3|What is the Nabataean kingdom?|This Arab kingdom controlled trade routes and built Petra.
3|What is the Library of Ashurbanipal?|This Assyrian collection preserved many cuneiform tablets at Nineveh.
4|What is the Battle of Kadesh?|This clash between Egypt and the Hittites led to a famous treaty.
4|What is the Achaemenid Empire?|This Persian empire ruled from Cyrus the Great to Darius III.
4|What is the Maurya Empire?|This Indian empire included the emperor Ashoka.
4|What is the Nok culture?|This West African culture is known for terracotta sculptures.
4|What is the Parthian Empire?|This Iranian empire often fought Rome along its western frontier.
4|What is the Zapotec civilization?|This Mesoamerican civilization built Monte Alban.
4|What is the Sea Peoples?|This name refers to groups linked to Bronze Age eastern Mediterranean disruption.
4|What is the Mississippian culture?|This North American mound-building culture included Cahokia.
5|What is the Amarna Period?|This Egyptian period is linked to Akhenaten's religious changes.
5|What is the Behistun Inscription?|This trilingual Persian text helped decipher cuneiform.
5|What is the Edict of Ashoka?|These inscriptions spread moral and political messages across the Maurya Empire.
5|What is the Urartian kingdom?|This Iron Age kingdom centered around Lake Van.
5|What is the Lapita culture?|This Pacific culture is linked to early Austronesian expansion.
5|What is the Etruscan civilization?|This Italian civilization influenced early Rome.
5|What is the Mitanni kingdom?|This Bronze Age kingdom lay in northern Mesopotamia and Syria.
5|What is the Moche civilization?|This Andean culture is known for portrait vessels and irrigation.
`);

manual('r2', 'Mythology', 'mythology_ancient', ['mythology'], `
1|Who is Hephaestus?|This Greek god of metalworking made weapons for the gods.
1|Who is Freyja?|This Norse goddess is associated with love, magic, and a hall for slain warriors.
1|Who is Anubis?|This Egyptian god is linked with mummification and jackal imagery.
1|Who is Quetzalcoatl?|This feathered serpent deity appears in Mesoamerican traditions.
1|Who is Persephone?|This Greek figure spends part of the year in the underworld.
1|Who is Thor?|This Norse thunder god carries a hammer.
1|Who is Athena?|This Greek goddess is associated with wisdom and strategic warfare.
1|Who is Ra?|This Egyptian sun god travels across the sky.
1|Who is Vulcan?|This Roman god of fire and metalworking parallels the Greek Hephaestus.
1|Who is Frigg?|This Norse goddess is associated with marriage and the household.
1|Who is Sobek?|This Egyptian crocodile god was linked with the Nile.
1|Who is Artemis?|This Greek goddess is associated with the hunt and the Moon.
1|Who is Minerva?|This Roman goddess is associated with wisdom and crafts.
1|Who is Osiris?|This Egyptian god rules the afterlife after being restored by Isis.
1|Who is Dionysus?|This Greek god is associated with wine, theatre, and celebration.
1|Who is Heimdall?|This Norse watchman guards the rainbow bridge.
1|Who is Sekhmet?|This Egyptian lioness goddess is associated with war and healing.
1|Who is Pan?|This Greek god of wild places is often shown with goat-like features.
2|Who is Hermes?|This Greek messenger god wears winged sandals in many depictions.
2|Who is Bastet?|This Egyptian goddess is often shown with feline features.
2|Who is Balder?|This Norse god's death helps set events toward Ragnarok.
2|Who is Huitzilopochtli?|This Aztec god is linked with the sun and war.
2|Who is Demeter?|This Greek goddess searches for her daughter after an underworld abduction.
2|Who is Loki?|This Norse trickster is father of several unusual beings.
2|Who is Horus?|This falcon-headed Egyptian god avenges Osiris.
2|Who is Arachne?|This skilled weaver challenged Athena and was transformed.
3|What is the Aegis?|This protective shield or breastplate is associated with Athena and Zeus.
3|Who is Epona?|This Celtic goddess is associated with horses.
3|Who is Tlaloc?|This Aztec rain deity was honored in a mountain temple.
3|Who is Brigid?|This Irish goddess is associated with poetry, healing, and smithcraft.
3|Who is Ix Chel?|This Maya goddess is associated with the moon and weaving.
3|Who is Nuwa?|This Chinese creator figure is said to repair the sky.
3|Who is Set?|This Egyptian god is associated with storms, desert, and conflict.
3|Who is Orpheus?|This musician descends to the underworld to retrieve Eurydice.
4|What is Yggdrasil?|This world tree connects realms in Norse mythology.
4|Who is Amaterasu?|This Japanese sun goddess hides in a cave in a famous myth.
4|Who is Morrigan?|This Irish figure is associated with war, fate, and crows.
4|Who is Tezcatlipoca?|This Aztec god is linked with obsidian mirrors and night.
4|Who is Pele?|This Hawaiian goddess is associated with volcanoes.
4|Who is Enki?|This Mesopotamian god is associated with wisdom and fresh water.
4|What is the Golden Fleece?|Jason and the Argonauts seek this prized object.
4|Who is Atalanta?|This swift huntress joins the Calydonian boar hunt in Greek myth.
4|Who is Susanoo?|This Japanese storm god battles the serpent Yamata no Orochi.
4|Who is Inti?|This Inca sun god was especially important to royal ideology.
4|Who is Xipe Totec?|This Aztec deity is associated with renewal and flayed skin imagery.
4|Who is Nergal?|This Mesopotamian god is linked with war, plague, and the underworld.
4|Who is Lugh?|This Irish deity is associated with skill and a famous harvest festival.
5|Who is Ereshkigal?|This Mesopotamian goddess rules the underworld.
5|What is the Mabinogi?|This Welsh collection includes stories of Pwyll, Branwen, and Math.
5|Who is Cuchulainn?|This Irish hero is famous for a battle frenzy called the warp-spasm.
5|What is Gjallarhorn?|This horn is blown by Heimdall at Ragnarok.
5|Who is Veles?|This Slavic deity is associated with cattle, magic, and the underworld.
5|Who is Sedna?|This Inuit figure is associated with sea animals.
5|Who is Tlazolteotl?|This Aztec goddess is linked with purification and transgression.
5|Who is Hecate?|This Greek goddess is associated with crossroads and magic.
`);

manual('r1', 'World Landmarks', 'geography', ['landmarks','geography'], `
1|What is the Leaning Tower of Pisa?|This Italian bell tower is famous for its unintended tilt.
1|What is the Tower Bridge?|This London bridge has two towers and a lifting central span.
1|What is the Sydney Opera House?|This harbor landmark has sail-like roof shells.
1|What is the CN Tower?|This tall Toronto landmark was once the world's tallest free-standing structure.
1|What is the Brandenburg Gate?|This neoclassical Berlin landmark became a symbol of reunification.
1|What is the Space Needle?|This Seattle landmark was built for the 1962 World's Fair.
1|What is the Gateway Arch?|This St. Louis monument rises beside the Mississippi River.
1|What is Christ the Redeemer?|This statue overlooks Rio de Janeiro from Corcovado.
2|What is the Burj Khalifa?|This Dubai skyscraper is the world's tallest building.
2|What is Stonehenge?|This prehistoric ring of standing stones is in Wiltshire, England.
2|What is Hagia Sophia?|This Istanbul landmark has served as cathedral, mosque, and museum.
2|What is the Potala Palace?|This former winter palace of the Dalai Lamas stands in Lhasa.
2|What is the Shwedagon Pagoda?|This gilded Buddhist landmark rises above Yangon.
2|What is the Moai of Rapa Nui?|These large stone figures stand on Easter Island.
2|What is Mont Saint-Michel?|This tidal island commune rises off the coast of Normandy.
2|What is the Atomium?|This Brussels landmark looks like an enlarged iron crystal.
3|What is Borobudur?|This massive Buddhist temple stands on Java in Indonesia.
3|What is the Mezquita of Cordoba?|This landmark combines mosque arches with a later cathedral.
3|What is the Sheikh Zayed Grand Mosque?|This white marble mosque is a major landmark in Abu Dhabi.
3|What is the Leshan Giant Buddha?|This huge seated Buddha is carved into a cliff in Sichuan.
3|What is Chichen Itza?|This Maya site includes the stepped pyramid called El Castillo.
3|What is the Wieliczka Salt Mine?|This Polish site includes chapels carved from salt.
3|What is the Itsukushima Shrine?|This Japanese shrine is famous for a torii gate standing in water.
3|What is the Minaret of Jam?|This remote Afghan minaret rises beside the Hari River.
4|What is the Rila Monastery?|This Bulgarian monastery stands in the mountains southwest of Sofia.
4|What is Lalibela?|This Ethiopian town is known for rock-hewn churches.
4|What is the Banaue Rice Terraces?|These Philippine terraces were carved into mountainsides.
4|What is the Hassan II Mosque?|This Casablanca mosque has a very tall minaret by the Atlantic.
4|What is the Ellora Caves?|This Indian site includes Buddhist, Hindu, and Jain rock-cut monuments.
4|What is the Koutoubia Mosque?|This Marrakech landmark has a minaret that influenced later towers.
4|What is the Meteora monasteries?|These Greek monasteries sit atop tall rock pillars.
4|What is the Hawa Mahal?|This Jaipur palace is famous for its many small windows.
5|What is Nan Madol?|This ruined city of stone platforms lies off Pohnpei in Micronesia.
5|What is Sigiriya?|This Sri Lankan rock fortress has frescoes and a palace site on top.
5|What is Tikal?|This Maya city in Guatemala has tall temples rising from rainforest.
5|What is Leptis Magna?|This Roman city ruin lies on the coast of Libya.
5|What is Derinkuyu?|This underground city in Cappadocia could shelter thousands of people.
5|What is the Buzludzha Monument?|This saucer-shaped Bulgarian monument sits on a mountain peak.
5|What is the Great Zimbabwe ruins?|These stone structures gave their name to a modern African country.
5|What is the Ellora Kailasa temple?|This temple was carved downward from a single rock mass.
`);

manual('r2', 'Rivers & Mountains', 'geography', ['rivers','mountains','geography'], `
1|What is the Danube?|This European river flows through or along many countries before reaching the Black Sea.
1|What is the Andes?|This long mountain range runs along western South America.
1|What is the Mekong?|This Southeast Asian river reaches the sea through a delta in Vietnam.
1|What is the Alps?|This European mountain system includes Mont Blanc.
1|What is the Volga?|This river is often called Europe's longest.
1|What is the Atlas Mountains?|This range stretches across parts of North Africa.
1|What is the Ganges?|This river is sacred to many Hindus and flows through northern India.
1|What is the Rockies?|This mountain chain runs from western Canada into the United States.
1|What is the Rhine?|This European river flows past Basel, Strasbourg, and Cologne.
1|What is the Seine?|This river runs through Paris.
1|What is the Thames?|This river runs through London.
1|What is the Appalachians?|This mountain system runs through eastern North America.
1|What is the Pyrenees?|This range separates France from Spain.
1|What is the Po River?|This river crosses northern Italy toward the Adriatic Sea.
1|What is the Tagus?|This river reaches the Atlantic at Lisbon.
1|What is the Blue Ridge Mountains?|This Appalachian range is known for hazy blue views.
1|What is the Ebro?|This river flows across northeastern Spain.
1|What is the Dales?|This upland area in northern England is known for valleys and limestone scenery.
2|What is the Zambezi?|This African river feeds Victoria Falls.
2|What is the Urals?|This mountain range is often treated as a boundary between Europe and Asia.
2|What is the Orinoco?|This South American river drains much of Venezuela.
2|What is the Carpathians?|This mountain arc curves across Central and Eastern Europe.
2|What is the Murray River?|This major Australian river flows toward the Southern Ocean.
2|What is the Drakensberg?|This southern African mountain range includes high escarpments.
2|What is the Loire?|This French river is known for chateaux along its valley.
2|What is the Tigris?|This river joins the Euphrates before reaching the Persian Gulf region.
2|What is the Elbe?|This river flows through Dresden and Hamburg.
2|What is the Oder?|This river forms part of the Germany-Poland border.
2|What is the Eiger?|This Swiss mountain is famous for its north face.
2|What is the Dolomites?|This Italian mountain range is known for pale limestone peaks.
2|What is the Douro?|This Iberian river is associated with port wine country.
2|What is the Durance?|This river flows through southeastern France toward the Rhone.
2|What is the Aare?|This Swiss river loops around the old city of Bern.
2|What is the Cantabrian Mountains?|This range runs along northern Spain.
3|What is the Irrawaddy?|This river runs through Myanmar toward the Andaman Sea.
3|What is the Pamir Mountains?|This high Asian region is nicknamed the Roof of the World.
3|What is the Vistula?|This river flows through Warsaw and Krakow.
3|What is the Zagros Mountains?|This range runs mainly through Iran.
3|What is the Brahmaputra?|This river flows from Tibet through India and Bangladesh.
3|What is the Apennines?|This mountain chain forms the spine of Italy.
3|What is the Dnieper?|This river flows through Kyiv toward the Black Sea.
3|What is the Rwenzori Mountains?|This African range near the equator has glaciated peaks.
4|What is the Lena River?|This Siberian river flows north to the Arctic Ocean.
4|What is the Hindu Kush?|This mountain range extends through Afghanistan and nearby regions.
4|What is the Amu Darya?|This Central Asian river historically fed the Aral Sea.
4|What is the Tien Shan?|This Central Asian range includes peaks in Kyrgyzstan and China.
4|What is the Magdalena River?|This river is a major waterway of Colombia.
4|What is the Ural River?|This river flows into the Caspian Sea and shares its name with a mountain range.
4|What is the Cordillera Blanca?|This Peruvian range includes many high tropical glaciers.
4|What is the Orange River?|This river forms part of the border between South Africa and Namibia.
5|What is the Yarlung Tsangpo?|This Tibetan river becomes the Brahmaputra downstream.
5|What is the Karakoram?|This mountain range includes K2.
5|What is the Essequibo River?|This major river flows through Guyana.
5|What is the Kunlun Mountains?|This long range borders the northern edge of the Tibetan Plateau.
5|What is the Syr Darya?|This Central Asian river also historically fed the Aral Sea.
5|What is the Dinaric Alps?|This range runs along much of the western Balkans.
5|What is the Fitz Roy massif?|This jagged Patagonian mountain group sits near the Chile-Argentina border.
5|What is the Chao Phraya?|This river flows through Bangkok.
`);

manual('r1', 'Architecture', 'arts_music', ['architecture','art'], `
1|What is an arch?|This curved structure can span an opening and carry weight.
1|What is a dome?|This rounded roof shape appears on many capitol buildings and churches.
1|What is a column?|This vertical support can be decorative as well as structural.
1|What is a blueprint?|This plan drawing guides construction.
1|What is a courtyard?|This open space is enclosed partly or completely by buildings.
1|What is a balcony?|This platform projects from an upper story of a building.
1|What is a facade?|This front face of a building is often its most decorated side.
1|What is a skylight?|This roof window lets daylight enter from above.
2|What is flying buttress?|This exterior support helped Gothic cathedrals reach great heights.
2|What is cantilever?|This projecting beam is supported at only one end.
2|What is atrium?|This large open interior space often rises through several floors.
2|What is keystone?|This central wedge-shaped stone locks an arch.
2|What is clerestory?|This high window level brings light into a tall interior.
2|What is gable roof?|This roof has two sloping sides meeting at a ridge.
2|What is truss?|This triangular framework supports roofs and bridges.
2|What is load-bearing wall?|This wall supports weight from above rather than only dividing rooms.
3|What is Brutalism?|This modern style often uses raw concrete and massive forms.
3|What is Art Deco?|This style favors geometric ornament and sleek modern materials.
3|What is Bauhaus?|This design school promoted functional modernism in architecture and objects.
3|What is curtain wall?|This non-load-bearing exterior wall hangs from a building frame.
3|What is pilaster?|This flattened column-like feature projects slightly from a wall.
3|What is coffered ceiling?|This ceiling is divided into sunken panels.
3|What is entasis?|This subtle curve helps a column look visually straight.
3|What is porte cochere?|This covered entrance lets vehicles pass through or stop beneath it.
4|What is post-and-lintel construction?|This system uses vertical supports topped by a horizontal beam.
4|What is reinforced concrete?|This material combines concrete with steel bars or mesh.
4|What is geodesic dome?|This dome uses a network of triangles to form a strong shell.
4|What is double-skin facade?|This building envelope uses two layers with an air gap between them.
4|What is adaptive reuse?|This approach gives an old building a new purpose.
4|What is parametric design?|This design method uses rules and variables to generate forms.
4|What is rainscreen cladding?|This exterior system leaves a drained air gap behind the outer layer.
4|What is thermal bridge?|This building detail lets heat move more easily through insulation.
5|What is tensegrity?|This structural principle balances compression elements with continuous tension.
5|What is diagrid?|This diagonal grid structure can support tall buildings efficiently.
5|What is pendentive?|This curved triangular surface helps place a dome over a square room.
5|What is hypostyle hall?|This large interior space is filled with many columns.
5|What is mashrabiya?|This projecting lattice screen shades and ventilates in traditional architecture.
5|What is trombe wall?|This passive solar wall stores daytime heat for later release.
5|What is base isolation?|This earthquake design lets a building move separately from the ground.
5|What is reciprocal frame?|This roof structure uses mutually supporting beams arranged in a loop.
`);

manual('r2', 'Sports', 'sports', ['sports'], `
1|What is a free throw?|This basketball shot is taken from a line with no defender directly guarding it.
1|What is a corner kick?|This soccer restart is awarded after the defense sends the ball over its own goal line.
1|What is a faceoff?|This restart begins play in hockey after a stoppage.
1|What is a relay race?|This team race passes a baton or touch from one athlete to another.
1|What is a penalty kick?|This soccer shot is taken from the spot after certain fouls in the box.
1|What is a putt?|This golf stroke is usually made on the green.
1|What is a serve?|This action starts a point in tennis, volleyball, or table tennis.
1|What is a referee?|This official enforces rules during many sports.
2|What is a pick-and-roll?|This basketball play uses a screen followed by movement toward the basket.
2|What is icing?|This hockey infraction involves sending the puck down the ice from behind the center line.
2|What is a false start?|This penalty occurs when a player moves illegally before the play begins.
2|What is a scrum?|This rugby formation restarts play after certain minor infringements.
2|What is a tiebreak?|This tennis game or sequence decides a set tied late.
2|What is a clean and jerk?|This Olympic weightlifting lift moves the bar to the shoulders and then overhead.
2|What is a medley relay?|This swimming relay uses different strokes in a set order.
2|What is a bunt?|This baseball tactic softly taps the ball into play.
3|What is leg before wicket?|This cricket dismissal can occur when the ball hits a batter's leg in front of the stumps.
3|What is a triple axel?|This figure-skating jump has three and a half rotations.
3|What is an alley-oop?|This basketball play finishes a lob pass near the rim.
3|What is a lineout?|This rugby union restart throws the ball between two lines of players.
3|What is a velodrome?|This arena is built for track cycling.
3|What is a steeplechase?|This race includes barriers and water jumps.
3|What is a libero?|This volleyball defensive specialist wears a different colored jersey.
3|What is a knuckleball?|This pitch is thrown with little spin so it moves unpredictably.
4|What is a panenka?|This soccer penalty technique chips the ball softly down the middle.
4|What is a scull?|This rowing boat is propelled with two oars per rower.
4|What is a repechage?|This second-chance round lets some competitors qualify after an early loss.
4|What is a decathlon?|This track and field event combines ten disciplines.
4|What is a fleche?|This fencing attack uses a sudden running motion.
4|What is a ruck?|This rugby phase forms when players contest the ball on the ground.
4|What is a split-finger fastball?|This baseball pitch drops sharply as it nears the plate.
4|What is a keirin?|This track cycling race uses a pacing vehicle before the sprint finish.
5|What is the Fosbury Flop?|This high-jump technique goes over the bar back-first.
5|What is the Magnus effect?|This force helps explain curveballs and bending free kicks.
5|What is DRS in cricket?|This review system lets teams challenge certain umpire decisions.
5|What is a V-sit?|This gymnastics strength move holds the body in a raised V shape.
5|What is a chicane?|This S-shaped sequence of turns slows vehicles on a racing circuit.
5|What is an omnium?|This track cycling competition combines several races into one event.
5|What is an epee?|This fencing weapon allows the whole body as target area.
5|What is a capoeira roda?|This circle frames the Brazilian martial art and game of capoeira.
`);

// Expanded authored classroom categories. These use broad Jeopardy-style topics
// and avoid code, abbreviation, and unit-symbol list formats.
facts('r1', 'World Geography', 'geography', ['world-geography','geography'], `
peninsula|This landform is almost surrounded by water but remains attached to a larger landmass.
delta|This fan-shaped landform can build where a river drops sediment at its mouth.
plateau|This broad highland has a relatively level surface above surrounding land.
bay|This body of water is partly enclosed by land but opens to a larger sea or lake.
strait|This narrow waterway connects two larger bodies of water.
glacier|This slow-moving mass of ice can carve valleys and transport rock.
reef|This ridge of coral or rock can form just below the surface of warm seas.
canyon|This deep valley often has steep sides cut by a river over time.
isthmus|This narrow strip of land links two larger land areas.
archipelago|This group or chain of islands may stretch across part of a sea.
steppe|This dry grassland region has few trees and often supports grazing.
basin|This low area can collect water and sediment from surrounding land.
estuary|This coastal zone is where river water mixes with seawater.
fjord|This long narrow inlet is usually carved by a glacier and flanked by steep sides.
mesa|This flat-topped hill has steep sides in arid landscapes.
atoll|This ring-shaped coral island may surround a lagoon.
Sahel|This semi-arid belt lies south of the Sahara across Africa.
Patagonia|This southern region of Argentina and Chile is known for windswept landscapes.
Siberia|This vast Russian region stretches across northern Asia.
the Pampas|These fertile grasslands cover parts of Argentina and Uruguay.|whatAre
the Outback|This remote interior region is strongly associated with Australia.
the Maghreb|This northwest African region includes Morocco, Algeria, and Tunisia.
the Low Countries|This European region traditionally includes the Netherlands and Belgium.|whatAre
Anatolia|This Asian part of Turkey is also known as Asia Minor.
Krakatoa|This Indonesian volcanic island produced a catastrophic eruption in 1883.
Mauna Kea|This Hawaiian volcano is extremely tall when measured from its oceanic base.
Socotra|This island near Yemen is famous for unusual dragon blood trees.
Spitsbergen|This largest island of Svalbard sits far north in the Arctic.
Lake Baikal|This Siberian lake is the world's deepest freshwater lake.
the Pantanal|This huge tropical wetland lies mostly in Brazil.
the Okavango Delta|This inland wetland spreads into the Kalahari instead of reaching the sea.
the Tarim Basin|This arid region of western China contains much of the Taklamakan Desert.
the Drake Passage|This stormy waterway separates South America from Antarctica.
the Mozambique Channel|This waterway separates Madagascar from mainland Africa.
the Qattara Depression|This low desert basin lies in northwest Egypt.
the Sundarbans|This mangrove region spans the Ganges-Brahmaputra delta.
the Danakil Depression|This hot lowland lies near the junction of three tectonic plates.
the Challenger Deep|This deepest known ocean point lies in the Mariana Trench.
the Afar Triangle|This East African region is where major rifts meet.
the Deccan Plateau|This large highland covers much of southern India.
`);

facts('r1', 'Canadian Cities', 'history_civics', ['canada','cities','geography'], `
Halifax|This Atlantic port city is home to a famous hilltop citadel.
Victoria|This British Columbia capital sits on Vancouver Island.
Winnipeg|This Manitoba city grew where the Red and Assiniboine rivers meet.
Quebec City|This provincial capital is known for its old walls and Chateau Frontenac.
Saskatoon|This Saskatchewan city is nicknamed the Paris of the Prairies.
Hamilton|This Ontario city is known for steelmaking and a large natural harbor.
Regina|This Prairie capital is home to the RCMP Heritage Centre.
St. John's|This Newfoundland and Labrador capital is one of North America's oldest cities.
Fredericton|This New Brunswick capital sits along the Saint John River.
Charlottetown|This Prince Edward Island capital hosted an important 1864 conference.
Yellowknife|This northern capital sits on the shore of Great Slave Lake.
Iqaluit|This Nunavut capital lies on Baffin Island.
Whitehorse|This Yukon capital grew as a transportation hub during northern gold rushes.
Trois-Rivieres|This Quebec city stands where the Saint-Maurice River reaches the St. Lawrence.
Kingston|This Ontario city was briefly capital of the Province of Canada.
Kelowna|This British Columbia city is a major centre in the Okanagan Valley.
Medicine Hat|This Alberta city is associated with natural gas and a distinctive name.
Moose Jaw|This Saskatchewan city is known for tunnels and railway history.
Thunder Bay|This Lake Superior city formed from Fort William and Port Arthur.
Sherbrooke|This Quebec city is a hub of the Eastern Townships.
Sudbury|This Ontario city is strongly linked with nickel mining.
Kamloops|This British Columbia city sits near the meeting of the North and South Thompson rivers.
Lethbridge|This Alberta city is crossed by a large railway viaduct.
Moncton|This New Brunswick city is near the tidal bore of the Petitcodiac River.
Gatineau|This Quebec city faces Ottawa across the river.
Nanaimo|This Vancouver Island city is known for a layered dessert bar.
Red Deer|This Alberta city lies roughly between Calgary and Edmonton.
Brandon|This Manitoba city is a major centre in the province's southwest.
Peterborough|This Ontario city is famous for a hydraulic lift lock.
Sault Ste. Marie|This Ontario city faces a Michigan city across important locks.
Baie-Comeau|This Quebec city developed around paper, aluminum, and a deep-water port.
Corner Brook|This Newfoundland city is a west-coast centre near the Humber River.
Prince Rupert|This British Columbia port lies near the Alaska Panhandle.
Thompson|This northern Manitoba city grew around nickel mining.
Timmins|This northern Ontario city is linked with the Porcupine gold camp.
Rimouski|This Quebec city sits on the lower St. Lawrence and hosts a maritime institute.
Chilliwack|This Fraser Valley city lies east of Vancouver.
Drummondville|This Quebec city is associated with textile history and poutine lore.
Sarnia|This Ontario city sits where Lake Huron drains into the St. Clair River.
Orillia|This Ontario city lies between Lakes Simcoe and Couchiching.
`);

facts('r1', 'Ontario Knowledge', 'history_civics', ['ontario','canada'], `
Queen's Park|This Toronto site houses the Ontario Legislative Assembly.
the Niagara Escarpment|This long ridge creates many waterfalls and forms part of a UNESCO biosphere reserve.
Algonquin Provincial Park|This large protected area is famous for lakes, forests, and canoe routes.
the Bruce Trail|This long footpath follows a ridge from the Niagara area to Tobermory.
the Rideau Canal|This historic waterway links Ottawa and Kingston.
the CN Tower|This Toronto landmark was once the world's tallest freestanding structure.
Muskoka|This cottage-country district is known for lakes and rocky shorelines.
the Thousand Islands|This island region lies along the St. Lawrence River near Kingston.|whatAre
the Holland Marsh|This fertile area north of Toronto is known for vegetable farming.
the Greenbelt|This protected area around the Greater Golden Horseshoe limits urban sprawl.
the Oak Ridges Moraine|This glacial landform stores groundwater north of Toronto.
the Welland Canal|This waterway lets ships bypass Niagara Falls.
the Group of Seven|This art collective painted many northern Ontario landscapes.
the Don Valley Parkway|This Toronto expressway follows a ravine corridor.
the Niagara Parkway|This scenic road follows the river between Fort Erie and Niagara-on-the-Lake.
the Trent-Severn Waterway|This canal route links Lake Ontario with Georgian Bay.
Point Pelee|This southern national park is a major bird migration stop.
Manitoulin Island|This large island lies in Lake Huron.
Pelee Island|This island sits in Lake Erie and has one of Canada's southernmost communities.
the Ottawa River|This river forms part of the Ontario-Quebec boundary.
the French River|This historic canoe route links Lake Nipissing and Georgian Bay.
the Grand River|This river flows through Kitchener, Cambridge, and Brantford.
Lake Simcoe|This lake lies north of Toronto and drains toward Georgian Bay.
Georgian Bay|This large bay forms the northeast arm of Lake Huron.
Fort York|This historic Toronto site preserves military structures from the early 1800s.
Upper Canada Village|This living-history site recreates life along the St. Lawrence.
the McMichael Canadian Art Collection|This gallery in Kleinburg is closely associated with national landscape art.
the Stratford Festival|This theatre festival began in a southwestern Ontario city.
Science North|This science centre in Sudbury is built into the rocky landscape.
the Big Nickel|This Sudbury landmark celebrates the region's mining identity.
the Agawa Canyon|This scenic northern area is reached by a popular rail excursion.
the Cheltenham Badlands|This red, eroded landscape lies northwest of Toronto.
the Niagara Glen|This nature reserve protects a gorge below the famous falls.
the Bonnechere Caves|These limestone caves are found in eastern Ontario.
the Cobalt Silver Rush|This early 1900s mining boom helped shape northeastern Ontario.
the Holland River|This waterway flows into Cook's Bay near Lake Simcoe.
Rondeau Provincial Park|This Lake Erie park protects a long sandspit and marsh.
Killarney Provincial Park|This park is known for white quartzite hills and clear lakes.
the Petroglyphs|This protected site near Peterborough preserves Indigenous rock carvings.|whatAre
the Niagara Peninsula|This wine-growing area lies between two Great Lakes.
`);

facts('r1', 'Canadian History', 'history_civics', ['canada','history'], `
Confederation|This 1867 process united several British North American colonies into a new dominion.
the Fathers of Confederation|These delegates helped negotiate the creation of Canada.|whatAre
John A. Macdonald|This Kingston lawyer became Canada's first prime minister.|who
Louis Riel|This Metis leader was central to resistance movements in Manitoba and the Northwest.|who
the Canadian Pacific Railway|This transcontinental line helped fulfill a promise to British Columbia.
the War of 1812|This conflict helped shape Canadian identity along the U.S. border.
Laura Secord|This figure is remembered for warning British forces of an American attack.|who
the Underground Railroad|This network helped many enslaved people reach freedom in British North America.
the Red River Resistance|This 1869-1870 movement preceded Manitoba joining Confederation.
the Northwest Resistance|This 1885 conflict involved Metis and First Nations communities in the Prairies.
the Klondike Gold Rush|This 1890s rush drew prospectors to the Yukon.
the Statute of Westminster|This 1931 law increased Canada's legislative independence.
the Persons Case|This legal victory confirmed women could be appointed to the Senate.
the Quiet Revolution|This 1960s period transformed politics and society in Quebec.
the October Crisis|This 1970 emergency followed kidnappings by the FLQ.
the patriation of the Constitution|This 1982 change brought Canada's founding law fully under domestic control.
Vimy Ridge|This 1917 battle became an important Canadian military symbol.
Juno Beach|This D-Day landing area was assigned to Canadian forces.
the Halifax Explosion|This 1917 disaster followed a collision involving a munitions ship.
the Winnipeg General Strike|This 1919 labour action became a landmark in Canadian labour history.
the Chinese head tax|This discriminatory policy charged many Chinese immigrants entering Canada.
the Numbered Treaties|These agreements between the Crown and Indigenous peoples cover large parts of Canada.|whatAre
the Royal Commission on Aboriginal Peoples|This 1990s inquiry examined relations between Indigenous peoples and Canada.
the Charter of Rights and Freedoms|This rights document became part of Canada's Constitution in 1982.
the British North America Act|This 1867 law created the Dominion of Canada.
the Charlottetown Conference|This 1864 meeting began talks that led toward Confederation.
the Quebec Conference|This 1864 meeting produced resolutions for a federal union.
the Durham Report|This 1839 document recommended responsible government and union in the Canadas.
responsible government|This principle made colonial executives answerable to elected assemblies.
the Rebellions of 1837|These uprisings challenged colonial rule in Upper and Lower Canada.|whatAre
the Acadian Expulsion|This 1750s deportation affected French-speaking communities in Atlantic Canada.
the Royal Proclamation of 1763|This postwar decree set rules for Indigenous land relations after Britain gained New France.
the Quebec Act|This 1774 law protected French civil law and Catholic practice in Quebec.
the Battle of the Plains of Abraham|This 1759 battle helped decide the fate of New France.
the Meech Lake Accord|This failed constitutional agreement was negotiated in the late 1980s.
the Charlottetown Accord|This 1992 constitutional proposal was rejected in a national referendum.
the Auto Pact|This 1965 agreement integrated North American automobile production.
the Free Trade Agreement|This 1988 Canada-U.S. deal preceded NAFTA.
the Truth and Reconciliation Commission|This body documented the history and legacy of residential schools.
Viola Desmond|This Nova Scotian businesswoman challenged segregation in a movie theatre.|who
`);

facts('r1', 'Earth Science', 'stem', ['earth-science','science'], `
the crust|This outer rocky layer is thinnest beneath oceans.
the mantle|This thick layer of Earth slowly flows beneath the crust.
the core|This innermost region includes a solid centre and a liquid outer layer.
tectonic plates|These large slabs of lithosphere move over the asthenosphere.|whatAre
erosion|This process wears away rock and soil by water, wind, ice, or gravity.
weathering|This process breaks rock down without necessarily moving the pieces.
sediment|This loose material can settle in layers and later become rock.
magma|This molten rock remains below Earth's surface.
subduction|This process sends one tectonic plate beneath another.
the rock cycle|This model shows how igneous, sedimentary, and metamorphic rocks transform.
igneous rock|This kind of rock forms from cooled molten material.
sedimentary rock|This rock type often forms from compressed layers.
metamorphic rock|This rock type changes under heat and pressure without melting.
a fault|This fracture is where blocks of rock have moved past each other.
the epicenter|This point on the surface lies above an earthquake's origin.
a mineral|This naturally occurring solid has a definite chemical composition.
the Moho|This boundary separates the crust from the mantle.
P-waves|These fast earthquake waves compress and expand material.|whatAre
S-waves|These earthquake waves shear material and cannot travel through liquids.|whatAre
lahar|This volcanic mudflow can race down valleys.
caldera|This large volcanic depression can form after a major eruption.
karst|This landscape develops where dissolving rock creates caves and sinkholes.
loess|This windblown silt can form fertile but erosion-prone deposits.
permafrost|This ground remains frozen for at least two consecutive years.
the Wilson cycle|This model describes repeated opening and closing of ocean basins.
isostasy|This principle describes buoyant balance of Earth's crust.
ophiolite|This slice of oceanic crust may be exposed on land.
varve|This annual sediment layer can record seasonal changes in a lake.
till|This unsorted sediment is deposited directly by glacial ice.
drumlin|This streamlined hill forms beneath moving ice.
the asthenosphere|This weak upper-mantle zone helps plates move.
the lithosphere|This rigid outer shell includes crust and uppermost mantle.
magnetic reversal|This change flips the polarity recorded by rocks.
paleomagnetism|This study uses ancient magnetic signals preserved in rocks.
the Ring of Fire|This Pacific belt has many volcanoes and earthquakes.
hotspot volcanism|This process can build island chains away from plate boundaries.
seafloor spreading|This process creates new ocean crust at mid-ocean ridges.
a transform boundary|This plate boundary is dominated by sideways motion.
orogeny|This mountain-building process can result from plate collision.
the Gutenberg discontinuity|This boundary separates the mantle from the outer core.
`);

facts('r1', 'Chemistry', 'stem', ['chemistry','science'], `
an atom|This basic unit of matter has a nucleus surrounded by electrons.
a molecule|This particle consists of atoms bonded together.
a compound|This substance contains two or more elements chemically combined.
a solution|This mixture has one substance dissolved evenly in another.
an acid|This substance donates hydrogen ions in many common chemistry models.
a base|This substance can accept hydrogen ions or produce hydroxide ions.
a catalyst|This substance speeds a reaction without being consumed.
a precipitate|This solid can form when two solutions react.
ionic bonding|This bonding involves attraction between charged particles.
covalent bonding|This bonding involves shared electron pairs.
valence electrons|These outer electrons are most involved in bonding.|whatAre
pH|This scale describes how acidic or basic a solution is.
oxidation|This process involves loss of electrons in redox chemistry.
reduction|This process involves gain of electrons in redox chemistry.
the mole|This counting unit represents Avogadro's number of particles.
an isotope|This form of an element has a different number of neutrons.
activation energy|This energy barrier must be overcome for a reaction to proceed.
equilibrium|This state occurs when forward and reverse reaction rates match.
electronegativity|This tendency measures how strongly atoms attract bonding electrons.
enthalpy|This thermodynamic quantity is often associated with heat content.
entropy|This quantity is often described as a measure of energy dispersal or disorder.
stoichiometry|This calculation method uses balanced equations to relate reactants and products.
titration|This lab method measures concentration using a controlled reaction.
a buffer|This solution resists changes in pH.
Le Chatelier's principle|This principle predicts how equilibrium shifts after a disturbance.
Avogadro's law|This gas law links volume and amount at constant temperature and pressure.
Hess's law|This rule says enthalpy change is independent of reaction path.
VSEPR theory|This model predicts molecular shape from electron-pair repulsion.
the Aufbau principle|This rule describes the filling order of electron orbitals.
Hund's rule|This rule fills equal-energy orbitals singly before pairing electrons.
Gibbs free energy|This quantity helps predict whether a reaction is thermodynamically favorable.
a zwitterion|This molecule has both positive and negative charged regions.
coordination complex|This compound has a central metal atom or ion bound to ligands.
ligand|This ion or molecule donates an electron pair to a metal center.
chirality|This property means a molecule is not superimposable on its mirror image.
enantiomers|These mirror-image molecules can have different biological effects.|whatAre
chromatography|This separation method relies on different movement through phases.
spectroscopy|This technique studies how matter interacts with light.
polymerization|This process links many small units into long chains.
hydrogen bonding|This attraction often occurs when H is bonded to N, O, or F.
`);

facts('r1', 'Physics Concepts', 'stem', ['physics','science'], `
gravity|This force attracts masses toward one another.
friction|This force resists motion between surfaces in contact.
inertia|This tendency keeps an object at rest or moving unless acted on.
momentum|This quantity combines mass and velocity.
acceleration|This rate describes how velocity changes over time.
energy|This capacity lets a system do work.
power|This rate describes how quickly work is done or energy is transferred.
pressure|This quantity is force divided by area.
velocity|This vector describes speed in a particular direction.
work|This energy transfer occurs when a force moves an object through a distance.
torque|This turning effect depends on force and lever arm.
density|This quantity is mass per unit volume.
buoyancy|This upward force acts on objects in a fluid.
elasticity|This property lets a material return to shape after deformation.
refraction|This bending occurs when a wave enters a medium at a different speed.
resonance|This effect occurs when a system is driven near its natural frequency.
centripetal force|This inward force keeps an object moving in a circular path.
angular momentum|This rotational quantity is conserved in many spinning systems.
specific heat capacity|This quantity measures energy needed to raise temperature.
thermal expansion|This effect makes many materials grow larger when heated.
electromagnetic induction|This process creates voltage from changing magnetic fields.
capacitance|This ability measures how much charge can be stored for a given voltage.
impedance|This opposition to alternating current combines resistance and reactance.
terminal velocity|This steady speed occurs when drag balances weight.
simple harmonic motion|This back-and-forth motion has a restoring force proportional to displacement.
Bernoulli's principle|This fluid principle relates speed with pressure.
Snell's law|This rule connects angles and wave speeds during bending of light.
the Doppler effect|This shift changes observed frequency when source and observer move.
the photoelectric effect|This effect ejects electrons when light has enough energy.
quantization|This idea says some physical quantities come in discrete amounts.
superposition|This principle lets waves add together.
tunneling|This quantum effect lets particles pass through barriers classically forbidden.
time dilation|This relativistic effect makes moving clocks run differently to observers.
mass-energy equivalence|This relation links mass with energy through the speed of light squared.
Noether's theorem|This theorem connects symmetries with conservation laws.
entropy|This thermodynamic quantity tends to increase in isolated systems.
Lagrangian mechanics|This formulation uses energy differences to describe motion.
wave-particle duality|This concept says light and matter show both wave and particle behavior.
the uncertainty principle|This principle limits simultaneous precision of certain measurements.
blackbody radiation|This emission depends on temperature for an ideal absorber and emitter.
`);

facts('r1', 'Plants & Nature', 'stem', ['plants','nature','biology'], `
photosynthesis|This process uses light energy to make sugars.
pollen|This fine material carries male reproductive cells in seed plants.
seeds|These plant structures protect embryos and can help them spread.|whatAre
roots|These plant parts anchor a plant and absorb water and minerals.|whatAre
stems|These structures support leaves and move materials through a plant.|whatAre
leaves|These plant parts are often the main sites of food-making.|whatAre
chlorophyll|This green pigment helps capture light energy.
bark|This outer tree covering helps protect living tissues.
xylem|This plant tissue carries water upward from roots.
phloem|This plant tissue transports sugars from leaves.
stomata|These tiny openings allow gas exchange in leaves.|whatAre
germination|This process begins when a seed starts to sprout.
pollination|This transfer moves pollen to the female part of a flower.
conifer|This kind of tree usually bears cones and needle-like leaves.
deciduous trees|These trees shed their leaves seasonally.|whatAre
fungi|These organisms include mushrooms and absorb nutrients from their surroundings.|whatAre
lichen|This partnership usually combines a fungus with an alga or cyanobacterium.
moss|This small nonvascular plant often grows in damp places.
fern|This plant reproduces by spores and often has divided fronds.
peat|This partially decayed plant material can build up in wetlands.
mycorrhiza|This partnership links fungi with plant roots.
sapwood|This younger outer wood conducts water in many trees.
heartwood|This older central wood no longer carries water actively.
rhizome|This horizontal underground stem can send up new shoots.
tuber|This swollen underground stem stores food, as in potatoes.
bulb|This underground storage organ has layered fleshy leaves.
tendril|This slender structure helps some climbing plants grip supports.
trichomes|These hairlike plant structures can protect surfaces.|whatAre
allelopathy|This chemical effect lets one plant inhibit others nearby.
phototropism|This growth response bends a plant toward or away from light.
vernalization|This exposure to cold can help trigger flowering.
transpiration|This water loss from leaves helps pull water through plants.
apical dominance|This growth pattern lets a main shoot suppress side shoots.
vascular cambium|This growth layer produces new wood and inner bark.
succession|This ecological process changes a community over time.
pioneer species|These early colonizers can establish after disturbance.|whatAre
canopy|This upper forest layer intercepts much of the sunlight.
understory|This forest layer lies beneath the main tree crowns.
taproot|This large central root grows downward from many seedlings.
nitrogen fixation|This process converts atmospheric nitrogen into usable forms.
`);

facts('r1', 'Ecology', 'stem', ['ecology','environment','science'], `
ecosystem|This community of organisms interacts with its physical environment.
habitat|This place provides the conditions an organism needs to live.
population|This group includes members of one species in an area.
community|This group includes different species living and interacting in an area.
food chain|This sequence shows energy passing from one organism to another.
producer|This organism makes its own food, often using sunlight.
consumer|This organism gets energy by eating other organisms.
decomposer|This organism breaks down dead material and recycles nutrients.
food web|This network shows many feeding relationships in an ecosystem.
biome|This large ecological region is shaped by climate and dominant life forms.
niche|This role includes how an organism uses resources and interacts.
competition|This interaction occurs when organisms need the same limited resource.
predation|This interaction involves one organism killing and eating another.
mutualism|This relationship benefits both species involved.
parasitism|This relationship benefits one organism while harming another.
commensalism|This relationship benefits one species without much effect on another.
carrying capacity|This limit is the population size an environment can support.
biodiversity|This term describes variety of life at genetic, species, and ecosystem levels.
invasive species|These organisms spread outside their native range and cause harm.|whatAre
keystone species|These organisms have unusually large effects on their ecosystems.|whatAre
indicator species|These organisms can signal environmental conditions.|whatAre
ecological succession|This process gradually changes species in a community.
primary succession|This community development begins where no soil exists.
secondary succession|This recovery begins after disturbance where soil remains.
trophic level|This feeding position describes a step in energy transfer.
biomagnification|This process concentrates pollutants higher up a food chain.
eutrophication|This nutrient overload can trigger algal blooms and oxygen loss.
desertification|This land degradation turns productive areas drier and less fertile.
edge effect|This change occurs where two habitats meet.
habitat fragmentation|This process breaks large habitats into smaller isolated pieces.
carbon cycle|This pathway moves carbon among air, water, land, and living things.
nitrogen cycle|This pathway converts nitrogen among atmospheric, soil, and biological forms.
biogeochemical cycles|These pathways move matter through living and nonliving systems.|whatAre
ecological footprint|This measure estimates demand placed on nature.
restoration ecology|This field works to repair damaged ecosystems.
climax community|This relatively stable community may develop late in succession.
resilience|This ability helps an ecosystem recover after disturbance.
endemic species|These organisms are native to only a particular area.|whatAre
marine protected area|This ocean region is managed to conserve ecosystems.
watershed|This land area drains toward a common body of water.
`);

facts('r1', 'Dinosaurs & Fossils', 'stem', ['dinosaurs','fossils','science'], `
Tyrannosaurus rex|This large predatory dinosaur had powerful jaws and two-fingered arms.
Triceratops|This horned dinosaur had a large frill and three facial horns.
Stegosaurus|This plated dinosaur carried spikes at the end of its tail.
Velociraptor|This small theropod became famous through movies, though it was turkey-sized.
Brachiosaurus|This long-necked dinosaur had front limbs longer than its hind limbs.
fossilization|This process preserves remains or traces of ancient life.
amber|This hardened tree resin can preserve insects in remarkable detail.
Mary Anning|This fossil hunter made important Jurassic discoveries along England's coast.|who
Allosaurus|This Jurassic predator lived long before the most famous tyrant lizard.
Ankylosaurus|This armored dinosaur had a heavy tail club.
Iguanodon|This dinosaur was one of the first scientifically named non-avian dinosaurs.
Pterosaurs|These flying reptiles lived alongside dinosaurs but were not dinosaurs.|whatAre
ammonites|These extinct marine mollusks had coiled shells.|whatAre
coprolite|This fossilized dung can reveal ancient diets.
paleontology|This science studies ancient life through fossils.
the Burgess Shale|This Canadian fossil site preserves many soft-bodied Cambrian organisms.
Archaeopteryx|This Jurassic animal shows both birdlike and reptilelike features.
Tiktaalik|This fossil animal helps show a transition toward limbed vertebrates.
Lucy|This famous Australopithecus skeleton was found in Ethiopia.
La Brea Tar Pits|This Los Angeles site preserved many Ice Age animals.
stromatolites|These layered structures can be produced by microbial mats.|whatAre
index fossils|These fossils help date rock layers over wide areas.|whatAre
trace fossils|These preserved footprints, burrows, or trails record activity.|whatAre
radiometric dating|This method uses radioactive decay to estimate age.
Spinosaurus|This dinosaur is often depicted with a sail-like back and fish-eating habits.
Carnotaurus|This horned theropod from South America had very short arms.
Pachycephalosaurus|This dinosaur is known for a thick domed skull.
Parasaurolophus|This duck-billed dinosaur had a long backward crest.
Deinonychus|This clawed predator helped reshape views of dinosaur activity.
Sauropods|These long-necked plant-eaters include some of the largest land animals.|whatAre
the K-Pg extinction|This event ended non-avian dinosaurs about 66 million years ago.
Chicxulub crater|This impact structure is linked to a major extinction event.
iridium layer|This global boundary clue helped support the asteroid-impact hypothesis.
feathered dinosaurs|These fossils show birdlike covering in many theropods.|whatAre
mosasaurs|These large marine reptiles dominated late Cretaceous seas.|whatAre
plesiosaurs|These marine reptiles often had long necks and paddle-like limbs.|whatAre
Cambrian explosion|This interval saw many animal body plans appear in the fossil record.
Ediacaran biota|These ancient organisms predate most familiar animal fossils.|whatAre
lagerstatte|This type of fossil site preserves exceptional detail.
cladistics|This method groups organisms by shared derived traits.
`);

facts('r1', 'Tech Before Smartphones', 'stem', ['technology','history'], `
the telegraph|This communication technology sent messages by electrical pulses.
Morse code|This dot-and-dash system was widely used for long-distance messages.
the phonograph|This device recorded and played back sound on cylinders or discs.
the typewriter|This office machine put characters on paper using keys.
the radio|This technology brought wireless audio broadcasts into homes.
the television|This device combined moving images with sound for mass audiences.
the transistor radio|This portable device helped make music mobile in the 1950s and 1960s.
the pager|This small device alerted users to call or read short messages.
the fax machine|This device sent scanned documents over telephone lines.
the answering machine|This home device recorded calls when no one picked up.
the floppy disk|This removable storage medium was once common for personal computers.
the cassette tape|This magnetic medium stored music and voice recordings.
the Walkman|This portable cassette player changed personal music listening.
the Polaroid camera|This camera produced instant photographs on self-developing film.
the VCR|This home device recorded and played videotapes.
the CD-ROM|This optical disc stored computer data and multimedia.
the mainframe|This large computer served many users through terminals.
the minicomputer|This smaller business computer sat between mainframes and PCs.
the dumb terminal|This screen-and-keyboard device depended on a central computer.
the punch card|This stiff paper medium stored data as holes.
the slide rule|This calculating tool used logarithmic scales before electronic calculators.
the abacus|This counting frame has beads moved along rods or wires.
the mechanical calculator|This machine performed arithmetic using gears and levers.
the teletype|This electromechanical terminal typed messages over communications lines.
the vacuum tube|This electronic component controlled current before transistors became dominant.
ENIAC|This early electronic computer filled a room and used thousands of tubes.
UNIVAC I|This early commercial computer became famous for election-night prediction.
the Altair 8800|This kit computer helped launch the personal computing hobby era.
the Apple II|This early personal computer became popular in homes and schools.
the Commodore 64|This best-selling 1980s home computer was known for games and sound.
the ARPANET|This packet-switched network was a forerunner of the internet.
Usenet|This distributed discussion system predated modern web forums.
Gopher|This menu-based internet protocol was popular before the Web took over.
the PalmPilot|This handheld organizer used a stylus and synced contacts and calendars.
the BlackBerry|This mobile device became famous for secure email and a tiny keyboard.
the Newton MessagePad|This Apple handheld device was an ambitious early personal digital assistant.
the LaserDisc|This large optical video format offered high-quality home playback.
the Betamax|This videotape format lost a famous consumer format battle.
the MiniDisc|This small rewritable audio format used magneto-optical storage.
the Game Boy|This handheld system made portable gaming mainstream.
`);

facts('r1', 'Internet History', 'stem', ['internet','technology','history'], `
ARPANET|This U.S. research network sent early packet-switched messages.
packet switching|This method breaks data into small pieces that travel across networks.
email|This digital message system predates the public Web.
the World Wide Web|This linked information system was proposed at CERN in 1989.
Tim Berners-Lee|This computer scientist created the Web's core early standards.|who
HTML|This markup language structures pages for browsers.
HTTP|This protocol lets browsers request web resources.
URLs|These addresses identify resources on the Web.|whatAre
Mosaic|This early graphical browser helped popularize the Web.
Netscape Navigator|This 1990s browser became a symbol of the first browser war.
Internet Explorer|This Microsoft browser was bundled with Windows for many years.
the dot-com bubble|This late-1990s boom and crash centered on internet companies.
Wikipedia|This online encyclopedia launched in 2001 using collaborative editing.
Google|This search company grew from a Stanford research project.
YouTube|This video-sharing site launched in 2005 and was later bought by Google.
Facebook|This social network began at Harvard before expanding widely.
TCP/IP|This protocol suite became the foundation for internet communication.
DNS|This naming system translates domain names into network addresses.
ICANN|This organization coordinates key internet naming and numbering systems.
the browser war|This competition saw companies fight for web browser dominance.
the Wayback Machine|This service archives old versions of websites.
RSS|This web feed format lets users subscribe to updates.
blog|This kind of site often presents dated posts in reverse order.
podcasting|This internet format distributes audio episodes by subscription.
the WELL|This early online community became influential in internet culture.
IRC|This chat protocol supported real-time group conversations.
ICQ|This early instant messenger was known for user numbers and alerts.
AOL|This online service introduced many households to email and chat.
GeoCities|This web-hosting service organized user pages into themed neighborhoods.
Napster|This file-sharing service sparked major debates over digital music.
BitTorrent|This peer-to-peer protocol shares pieces of files among users.
the iPhone App Store|This marketplace reshaped mobile software distribution.
net neutrality|This principle treats internet traffic without unfair discrimination.
cloud computing|This model delivers computing resources over networks on demand.
webmail|This email approach works through a browser instead of a local client.
search engine optimization|This practice tries to improve visibility in search results.
CAPTCHA|This challenge helps distinguish humans from automated submissions.
cookies|These small browser-stored data files support sessions and preferences.|whatAre
two-factor authentication|This login approach requires a second proof besides a password.
open source|This software model makes source code available for use and modification.
`);

facts('r1', 'Hardware & Devices', 'stem', ['hardware','technology'], `
the motherboard|This main circuit board connects many computer components.
the CPU|This processor executes instructions for a computer.
RAM|This short-term memory loses its contents when power is off.
the hard drive|This storage device traditionally uses spinning magnetic platters.
the solid-state drive|This storage device uses flash memory instead of moving platters.
the graphics card|This component accelerates image and video rendering.
the power supply|This component converts wall electricity for computer parts.
the monitor|This display device shows visual output from a computer.
the router|This device directs network traffic between networks.
the modem|This device converts signals so a home can connect to an internet service.
the keyboard|This input device has keys for typing.
the mouse|This pointing device usually moves a cursor on screen.
the printer|This output device puts text or images onto paper.
the scanner|This input device digitizes physical documents or photos.
the webcam|This camera sends video for calls or recordings.
the microphone|This input device captures sound.
the heat sink|This metal part helps draw heat away from a chip.
thermal paste|This material improves heat transfer between a chip and cooler.
the fan|This cooling part moves air through a computer case.
the expansion slot|This connector lets add-in cards attach to a computer.
the USB port|This connector carries data and power for many peripherals.
the HDMI port|This connector carries digital video and audio.
the Ethernet port|This wired network connector often uses an RJ-45 plug.
Bluetooth|This short-range wireless technology connects nearby devices.
the BIOS|This firmware helps start a computer before the operating system loads.
UEFI|This modern firmware interface replaced many older PC startup systems.
the chipset|This set of controller chips helps components communicate.
the bus|This communication pathway carries data inside a computer.
the cache|This small fast memory stores frequently used data.
the register|This tiny storage location sits inside a processor.
the GPU|This processor handles many graphics and parallel workloads.
the NIC|This adapter connects a computer to a network.
the trackpad|This touch-sensitive surface moves a pointer on many laptops.
the stylus|This pen-like tool is used on some touchscreens and tablets.
the e-reader|This device is designed mainly for digital books.
the smartwatch|This wearable device can show notifications and track activity.
the projector|This device casts an image onto a screen or wall.
the NAS|This network storage device shares files across a local network.
the docking station|This accessory connects a laptop to monitors and peripherals.
the VR headset|This wearable display creates an immersive digital view.
`);

facts('r1', 'Movies', 'film_television', ['movies','entertainment'], `
the director|This person guides the overall creative vision of a film.
the screenplay|This written script includes dialogue and scene directions.
the soundtrack|This collection of music and audio supports a film.
the sequel|This later film continues a previous story.
the prequel|This later-made story is set before an earlier film.
the cameo|This brief appearance is often made by a famous person.
the trailer|This preview promotes a film before release.
the box office|This term refers to ticket sales and film earnings.
the cinematographer|This person leads camera and lighting work on a film.
the producer|This person helps arrange financing, logistics, and production.
the editor|This person shapes footage into the final sequence.
the storyboard|This visual plan sketches shots before filming.
the close-up|This shot frames a subject tightly, often on a face.
the wide shot|This shot shows a broad view of a setting or action.
the montage|This sequence compresses time through edited images.
the genre|This category groups films by style or subject.
Charlie Chaplin|This silent-film star created the Little Tramp character.|who
Walt Disney|This entertainment pioneer produced early feature-length animation.|who
Alfred Hitchcock|This director became known as the Master of Suspense.|who
Akira Kurosawa|This Japanese director made Seven Samurai and Rashomon.|who
Steven Spielberg|This director made Jaws, E.T., and Jurassic Park.|who
Kathryn Bigelow|This filmmaker became the first woman to win the Oscar for directing.|who
Hayao Miyazaki|This animator co-founded Studio Ghibli.|who
Hedy Lamarr|This film star also co-invented a frequency-hopping communication idea.|who
Citizen Kane|This 1941 film begins with the word Rosebud.
Casablanca|This wartime romance is set in a Moroccan city.
The Wizard of Oz|This film sends Dorothy from Kansas to a colorful land.
Star Wars|This space opera begins with a rebel struggle against an empire.
Jaws|This thriller made summer blockbusters a new Hollywood model.
The Godfather|This crime film follows the Corleone family.
Spirited Away|This animated film follows a girl trapped in a spirit world.
Parasite|This Korean film won the Academy Award for Best Picture.
German Expressionism|This film movement used stylized shadows and distorted sets.
Italian neorealism|This postwar film movement often used ordinary locations and nonprofessional actors.
the French New Wave|This movement challenged traditional filmmaking in the late 1950s and 1960s.
film noir|This style is associated with crime stories, shadows, and moral ambiguity.
the Kuleshov effect|This editing idea shows how context changes audience interpretation.
diegetic sound|This sound comes from within the story world.
Foley|This craft creates everyday sound effects in post-production.
mise-en-scene|This term covers what is placed within the frame.
`);

facts('r1', 'Television', 'film_television', ['television','entertainment'], `
the pilot|This first episode is often used to sell or launch a series.
the season finale|This episode closes a run of episodes.
the sitcom|This comedy format often follows recurring characters in everyday situations.
the documentary|This nonfiction format presents real people, events, or issues.
the news anchor|This broadcaster presents news stories on a program.
the rerun|This broadcast shows an episode again after its original airing.
the remote control|This device lets viewers change channels from a distance.
the streaming service|This platform delivers shows over the internet on demand.
the cliffhanger|This ending leaves a story unresolved to encourage viewers to return.
the spin-off|This series grows out of characters or settings from another show.
the laugh track|This recorded audience reaction is used in some comedies.
the writers' room|This group develops scripts and storylines for a series.
the showrunner|This lead producer manages the creative direction of a series.
syndication|This system licenses shows to air on many stations or platforms.
public broadcasting|This model supports educational or cultural programming outside commercial networks.
ratings|These measurements estimate how many people watch a program.|whatAre
I Love Lucy|This sitcom helped pioneer filming before a live studio audience.
The Twilight Zone|This anthology series mixed science fiction, suspense, and moral twists.
Star Trek|This series follows starship crews exploring space.
Sesame Street|This educational children's program uses puppets and songs.
The Simpsons|This animated sitcom follows a family in Springfield.
Doctor Who|This British series follows a time-traveling alien known as the Doctor.
Saturday Night Live|This sketch show has aired from New York since the 1970s.
Jeopardy!|This game show gives answers and expects responses in question form.
the kinescope|This early recording method filmed a television screen.
the cathode-ray tube|This display technology powered many older TV sets.
cable television|This distribution system uses wired networks rather than broadcast towers.
satellite television|This service beams programming from orbit to home dishes.
HDTV|This picture standard improved resolution over earlier broadcasts.
DVR|This recorder lets viewers pause and save television programs.
binge-watching|This viewing pattern consumes many episodes in a short time.
appointment television|This phrase describes shows viewers plan to watch at broadcast time.
the Nielsen ratings|These measurements long shaped U.S. television advertising decisions.|whatAre
the watershed hour|This scheduling boundary separates family viewing from later mature content.
the cold open|This scene begins an episode before the opening credits.
the bottle episode|This lower-cost episode uses limited sets and cast.
the recap|This segment reminds viewers of earlier story events.
the crossover episode|This episode brings together characters from different shows.
the television upfronts|These events present upcoming schedules to advertisers.
the miniseries|This limited-run story has a planned number of episodes.
`);

facts('r1', 'Board Games', 'general', ['board-games','games'], `
Chess|This strategy game uses kings, queens, bishops, knights, rooks, and pawns.
Checkers|This game uses diagonal moves and jumps on an eight-by-eight board.
Scrabble|This word game scores letters placed on a grid.
Monopoly|This property-trading game includes railroads and a jail space.
Clue|This mystery game asks players to identify a suspect, room, and weapon.
Risk|This game turns a world map into a contest for territories.
The Game of Life|This game sends players through school, careers, and retirement.
Battleship|This guessing game has players call coordinates to find hidden ships.
Catan|This game uses resources such as brick, wool, ore, grain, and lumber.
Ticket to Ride|This game builds train routes across a map.
Carcassonne|This tile-laying game builds cities, roads, and farms.
Pandemic|This cooperative game has players fight outbreaks around the world.
Sorry!|This game sends pawns sliding and bumping back to start.
Connect Four|This game asks players to line up discs vertically, horizontally, or diagonally.
Backgammon|This ancient game uses dice and points on a narrow board.
Othello|This game flips discs to capture territory.
Go|This ancient strategy game surrounds territory with black and white stones.
Mancala|This family of games moves stones or seeds through pits.
Parcheesi|This cross-and-circle race game influenced many later family games.
Yahtzee|This dice game scores categories such as full house and large straight.
Dominion|This deck-building game helped define a modern tabletop genre.
Azul|This game scores patterned tile placement.
Wingspan|This engine-building game is themed around birds.
Splendor|This game has players collect gems to buy development cards.
7 Wonders|This drafting game builds ancient civilizations over three ages.
Terraforming Mars|This strategy game develops the Red Planet with projects and corporations.
Twilight Struggle|This game simulates Cold War competition.
Gloomhaven|This campaign game combines tactical combat with a branching story.
Agricola|This worker-placement game has players build farms.
Puerto Rico|This strategy game uses role selection and production.
Settlers of Catan|This original title helped introduce many players to Eurogames.
Diplomacy|This negotiation game is famous for alliances and betrayals.
Axis & Allies|This war game covers major powers during World War II.
Power Grid|This economic game has players buy power plants and supply cities.
Hive|This abstract game uses hexagonal insect tiles without a board.
Patchwork|This two-player game builds a quilt from shaped pieces.
Santorini|This abstract game uses builders and rising towers.
Scythe|This strategy game mixes farming, engines, and alternate-history machines.
The Resistance|This social deduction game hides spies among mission teams.
Codenames|This word-association game uses one-word clues to connect agents.
`);

facts('r1', 'World Cuisines', 'general', ['food','world-cuisines'], `
sushi|This Japanese dish often pairs vinegared rice with seafood or vegetables.
tacos|These Mexican foods fold fillings into tortillas.|whatAre
paella|This Spanish rice dish is often cooked in a wide shallow pan.
curry|This sauced dish family appears in many South Asian and Southeast Asian cuisines.
kimchi|This Korean fermented vegetable dish commonly uses cabbage or radish.
gelato|This Italian frozen dessert is dense and creamy.
hummus|This Middle Eastern dip is made from chickpeas and tahini.
baguette|This long French bread has a crisp crust.
pad thai|This Thai stir-fried noodle dish often includes tamarind and peanuts.
ramen|This Japanese noodle soup has broth, noodles, and toppings.
falafel|This fried ball or patty is often made from chickpeas or fava beans.
poutine|This Canadian dish combines fries, cheese curds, and gravy.
arepas|These cornmeal cakes are associated with Venezuela and Colombia.|whatAre
ceviche|This seafood dish is cured in citrus juice.
baklava|This layered pastry uses nuts and sweet syrup or honey.
gnocchi|These Italian dumplings are often made with potato.
tagine|This North African stew shares its name with a conical cooking vessel.
biryani|This South Asian rice dish is layered with spices, meat, or vegetables.
injera|This Ethiopian flatbread has a spongy texture and tangy flavor.
pho|This Vietnamese noodle soup is served with herbs and broth.
dim sum|This Cantonese meal features small dishes often served from carts.
mochi|This Japanese rice cake is made from glutinous rice.
empanadas|These filled pastries are common across Latin America.|whatAre
borscht|This beet soup is associated with Eastern Europe.
rendang|This slow-cooked spiced meat dish is associated with Indonesia.
jollof rice|This West African dish has seasoned rice and a lively regional rivalry.
dolma|This stuffed dish often uses grape leaves or vegetables.
satay|This Southeast Asian dish serves skewered grilled meat with sauce.
tom yum|This Thai soup is known for sour and spicy flavors.
feijoada|This Brazilian stew often uses black beans and pork.
okonomiyaki|This savory Japanese pancake can include cabbage and varied toppings.
pastilla|This Moroccan pie combines flaky pastry with spiced filling.
laksa|This Southeast Asian noodle soup has rich spicy broth.
khachapuri|This Georgian bread is filled with cheese.
fufu|This West African staple is pounded into a smooth doughlike food.
cevapi|These grilled sausages are common in the Balkans.
tteokbokki|This Korean street food uses chewy rice cakes in spicy sauce.
shakshuka|This dish poaches eggs in a spiced tomato sauce.
koshari|This Egyptian dish mixes rice, lentils, pasta, and tomato sauce.
adobo|This Filipino dish is commonly cooked with vinegar, soy sauce, and garlic.
`);

facts('r1', 'Holidays & Traditions', 'history_civics', ['holidays','traditions'], `
Lunar New Year|This celebration begins a new year in many East Asian calendars.
Diwali|This South Asian festival of lights is celebrated by Hindus, Sikhs, Jains, and others.
Hanukkah|This Jewish festival includes lighting a menorah over eight nights.
Ramadan|This Islamic month is marked by fasting from dawn to sunset.
Eid al-Fitr|This celebration marks the end of a month of fasting.
Christmas|This Christian holiday is celebrated on December 25 in many traditions.
Easter|This Christian holiday celebrates the resurrection of Jesus.
Thanksgiving|This harvest-themed holiday is observed in both Canada and the United States.
Canada Day|This July 1 holiday marks Confederation.
Remembrance Day|This November 11 observance honors those who served in war.
Victoria Day|This Canadian holiday is tied to the monarch's birthday.
Labour Day|This holiday honors workers and usually falls in early September in Canada.
Holi|This Hindu spring festival is famous for colorful powders.
Vesak|This Buddhist festival commemorates key events in the life of the Buddha.
Nowruz|This Persian New Year begins around the spring equinox.
Kwanzaa|This African American cultural celebration begins on December 26.
Carnival|This festive season often occurs before Lent.
Mardi Gras|This celebration is especially associated with New Orleans before Ash Wednesday.
Oktoberfest|This German festival is closely associated with Munich.
Burns Night|This Scottish tradition celebrates a poet with haggis and recitations.
Bonfire Night|This British observance remembers the failed Gunpowder Plot.
St. Patrick's Day|This March holiday celebrates Ireland's patron saint.
Bastille Day|This French national day falls on July 14.
Anzac Day|This April observance honors Australian and New Zealand service members.
Obon|This Japanese Buddhist tradition honors ancestral spirits.
Day of the Dead|This Mexican tradition honors deceased loved ones with offerings.
Las Posadas|This Mexican Christmas-season tradition reenacts a search for lodging.
Songkran|This Thai New Year festival is famous for water celebrations.
Yom Kippur|This Jewish holy day is centered on atonement and fasting.
Rosh Hashanah|This Jewish New Year begins the High Holy Days.
Midsummer|This northern European tradition celebrates near the summer solstice.
the Dragon Boat Festival|This Chinese festival features racing long narrow boats.
Chuseok|This Korean harvest holiday includes family gatherings and ancestral rites.
the Mid-Autumn Festival|This East Asian harvest festival is associated with mooncakes.
Saint-Jean-Baptiste Day|This Quebec holiday is celebrated on June 24.
National Indigenous Peoples Day|This Canadian observance falls on June 21.
Truth and Reconciliation Day|This Canadian federal day honors victims and survivors of residential schools.
the Calgary Stampede|This annual event is known for rodeo and western culture.
the Running of the Bulls|This tradition is associated with Pamplona in Spain.
the Highland Games|These Scottish cultural events include piping, dancing, and heavy athletics.|whatAre
`);

facts('r2', 'World History', 'history_civics', ['world-history','history'], `
the Silk Road|This trade network connected East Asia with the Mediterranean world.
the Black Death|This pandemic devastated much of Eurasia in the 1300s.
the Renaissance|This European cultural movement renewed interest in classical learning and art.
the Reformation|This religious movement challenged Roman Catholic authority in the 1500s.
the Mongol Empire|This empire created the largest contiguous land empire in history.
the Ottoman Empire|This state captured Constantinople in 1453 and lasted into the 1900s.
the Spanish Armada|This fleet failed in its attempted invasion of England in 1588.
the Haitian Revolution|This uprising created the first Black republic in the Americas.
the Taiping Rebellion|This massive 19th-century Chinese civil war caused enormous casualties.
the Sepoy Rebellion|This 1857 uprising challenged British East India Company rule.
the Scramble for Africa|This period saw European powers rapidly claim African territory.
the Opium Wars|These conflicts forced Qing China into unequal treaties with Western powers.|whatAre
the Congress of Vienna|This 1814-1815 meeting redrew Europe after Napoleon.
the Meiji Restoration|This 1868 shift transformed Japan's government and modernization.
the Russian Revolution|This 1917 upheaval ended Romanov rule and brought Bolsheviks to power.
the Treaty of Versailles|This 1919 treaty formally ended World War I with Germany.
the Thirty Years' War|This destructive European conflict ended with the Peace of Westphalia.
the Fronde|This series of uprisings challenged royal authority in 17th-century France.
the Glorious Revolution|This 1688 event replaced James II with William and Mary.
the War of Spanish Succession|This conflict centered on who would inherit Spain's throne.
the Mughal Empire|This South Asian empire built the Taj Mahal.
the Safavid Empire|This Persian empire made Twelver Shiism central to the state.
the Song dynasty|This Chinese dynasty saw major advances in printing, commerce, and technology.
the Abbasid Caliphate|This Islamic dynasty founded Baghdad and supported a golden age.
the Mali Empire|This West African empire was enriched by gold and trans-Saharan trade.
the Sui dynasty|This short Chinese dynasty reunified China and expanded the Grand Canal.
the Khmer Empire|This Southeast Asian empire built Angkor.
the Byzantine Empire|This eastern Roman state preserved Greek and Roman traditions for centuries.
the Boxer Rebellion|This anti-foreign uprising in China was crushed by an international coalition.
the Balfour Declaration|This 1917 British statement supported a Jewish national home in Palestine.
the Sykes-Picot Agreement|This wartime agreement sketched British and French spheres in the Middle East.
the Berlin Airlift|This operation supplied West Berlin during a Soviet blockade.
the Bandung Conference|This 1955 meeting helped shape the Non-Aligned Movement.
the Cultural Revolution|This upheaval in China began in 1966 under Mao Zedong.
the Prague Spring|This 1968 reform movement in Czechoslovakia was ended by Warsaw Pact invasion.
the Helsinki Accords|This 1975 agreement addressed European security and human rights.
the Iran-Contra affair|This 1980s scandal involved secret arms sales and funding for rebels.
the Carnation Revolution|This 1974 Portuguese revolution helped end dictatorship.
the Velvet Revolution|This peaceful 1989 movement ended communist rule in Czechoslovakia.
the Arab Spring|This wave of protests began in Tunisia in 2010.
`);

facts('r2', 'Government & Elections', 'history_civics', ['government','elections','civics'], `
a constitution|This foundational document sets out a state's basic rules.
federalism|This system divides powers between central and regional governments.
parliament|This legislative body debates and passes laws in many democracies.
cabinet|This group of senior ministers advises and helps lead a government.
opposition|This group challenges the governing party or coalition.
coalition government|This government forms when parties cooperate to hold power.
by-election|This vote fills a seat that becomes vacant between general elections.
referendum|This direct vote asks the public to decide an issue.
proportional representation|This electoral approach links seats more closely to vote share.
first-past-the-post|This electoral system awards a district to the top vote-getter.
ranked-choice voting|This system lets voters order candidates by preference.
electoral college|This indirect body formally chooses a president in the United States.
redistricting|This process redraws electoral boundaries.
campaign finance|This field concerns money raised and spent in elections.
voter turnout|This measure tracks the share of eligible voters who cast ballots.
incumbent|This officeholder is running for another term.
confidence vote|This parliamentary test can determine whether a government survives.
question period|This parliamentary session lets legislators challenge ministers.
prorogation|This action ends a parliamentary session without dissolving the legislature.
dissolution|This step ends a legislature and triggers a general election.
caretaker government|This administration handles routine business during an election period.
minority government|This government lacks more than half the legislative seats.
whip|This party official organizes votes and discipline in a legislature.
speaker|This presiding officer maintains order in a legislative chamber.
gerrymandering|This district drawing unfairly advantages a party or group.
malapportionment|This problem gives districts unequal population weight.
runoff election|This second vote may occur when no candidate wins enough support.
primary election|This vote helps choose a party's candidate.
caucus|This meeting can select candidates or coordinate party strategy.
shadow cabinet|This opposition team mirrors government ministerial roles.
single transferable vote|This ranked system can transfer votes to fill multiple seats.
mixed-member proportional|This system combines local representatives with party-list seats.
constructive vote of no confidence|This mechanism removes a government only by naming a replacement.
recall election|This vote can remove an official before a term ends.
ballot initiative|This process lets citizens place a measure on the ballot.
spoiled ballot|This ballot cannot be counted because it is marked improperly.
mandate|This claimed authority comes from winning an election.
apportionment|This process allocates seats among regions or states.
plurality|This result means more votes than any rival but not necessarily a majority.
supermajority|This threshold requires more than a simple majority.
`);

facts('r2', 'Law & Rights', 'history_civics', ['law','rights','civics'], `
due process|This principle requires fair legal procedures before the state acts.
habeas corpus|This legal protection challenges unlawful detention.
judicial review|This power lets courts examine whether laws or actions are constitutional.
precedent|This earlier court decision guides later cases.
statute|This written law is passed by a legislature.
common law|This legal tradition develops through court decisions.
civil law|This legal system relies heavily on comprehensive codes.
tort|This civil wrong can lead to compensation.
contract|This legally enforceable agreement creates obligations.
liability|This legal responsibility may require payment or other remedy.
burden of proof|This obligation determines who must prove a claim.
reasonable doubt|This criminal standard is higher than a balance of probabilities.
injunction|This court order requires or prevents an action.
appeal|This request asks a higher court to review a decision.
jurisdiction|This authority determines which court or government can act.
plaintiff|This party brings a civil case.
defendant|This party is accused or sued in a legal case.
amicus curiae|This friend-of-the-court brief offers information from a nonparty.
stare decisis|This doctrine means courts generally follow precedent.
mens rea|This criminal-law term refers to a guilty mind.
actus reus|This criminal-law term refers to a guilty act.
strict liability|This standard can impose responsibility without proving intent.
voir dire|This process examines jurors or evidence before a trial issue.
writ of certiorari|This order asks a lower court to send up a case for review.
charter rights|These protections are set out in a constitutional rights document.
freedom of expression|This right protects speech and communication from unjustified limits.
freedom of association|This right protects joining with others for common purposes.
equality rights|These protections guard against discrimination under law.
privacy|This interest protects personal information and private life.
natural justice|This idea requires fair hearings and unbiased decision-makers.
rule of law|This principle says power must operate under publicly known law.
proportionality|This test asks whether a rights limit is appropriately balanced.
standing|This requirement asks whether a party has a sufficient stake in a case.
mootness|This doctrine can stop a case when the issue no longer matters.
remedy|This legal outcome addresses a wrong.
damages|This monetary award compensates for loss.|whatAre
injunctive relief|This remedy orders a person to do or stop doing something.
public interest litigation|This legal action advances broader social or constitutional issues.
restorative justice|This approach focuses on repairing harm and accountability.
substantive due process|This doctrine protects some rights from government interference.
`);

facts('r2', 'Economics', 'history_civics', ['economics','markets'], `
supply|This side of a market represents how much sellers offer.
demand|This side of a market represents how much buyers want.
inflation|This rise in the general price level reduces purchasing power.
deflation|This fall in the general price level can discourage spending.
scarcity|This basic problem means resources are limited compared with wants.
opportunity cost|This value is what you give up when choosing one option.
gross domestic product|This measure totals the value of goods and services produced in a country.
interest rate|This price of borrowing money is often expressed as a percentage.
fiscal policy|This government policy uses taxes and spending.
monetary policy|This central bank policy influences money and credit.
recession|This downturn usually involves shrinking output and rising unemployment.
unemployment rate|This statistic tracks workers seeking jobs but not employed.
comparative advantage|This principle supports specialization and trade.
tariff|This tax is placed on imported goods.
quota|This limit restricts how much of something can be imported or produced.
subsidy|This payment supports a producer, consumer, or activity.
elasticity|This measure shows how responsive quantity is to a price change.
externality|This side effect affects people outside a transaction.
public good|This kind of good is non-rival and difficult to exclude users from.
monopoly|This market has one dominant seller.
oligopoly|This market has a small number of major sellers.
cartel|This group cooperates to control prices or output.
price ceiling|This legal maximum can create shortages if set too low.
price floor|This legal minimum can create surpluses if set too high.
stagflation|This condition combines high inflation with weak growth.
yield curve|This graph compares interest rates across debt maturities.
liquidity|This quality describes how easily an asset can be turned into cash.
moral hazard|This risk arises when protection changes behavior.
adverse selection|This problem occurs when one side has hidden information before a deal.
principal-agent problem|This conflict appears when one party acts for another but incentives differ.
creative destruction|This idea describes innovation replacing older industries.
comparative statics|This analysis compares economic outcomes before and after a change.
deadweight loss|This lost surplus results from inefficient market outcomes.
consumer surplus|This buyer benefit equals willingness to pay minus the actual price.
producer surplus|This seller benefit equals the price received minus the minimum acceptable price.
Phillips curve|This model relates inflation and unemployment in some contexts.
Lorenz curve|This graph shows income or wealth distribution.
Gini coefficient|This number summarizes inequality in a distribution.
capital flight|This movement sends money out of a country during risk or instability.
seigniorage|This revenue comes from issuing money.
`);

facts('r2', 'Philosophy', 'literature_language', ['philosophy'], `
Socrates|This Athenian philosopher is famous for questioning and an executed death sentence.|who
Plato|This philosopher wrote dialogues and founded the Academy.|who
Aristotle|This philosopher tutored Alexander and wrote on logic, ethics, and nature.|who
ethics|This branch studies moral questions about right conduct.
logic|This branch studies valid reasoning and argument.
metaphysics|This branch studies being, reality, and existence.
epistemology|This branch studies knowledge and justification.
the Socratic method|This approach uses questioning to examine beliefs.
stoicism|This school emphasized virtue and control over one's judgments.
Epicureanism|This school sought tranquility and freedom from unnecessary fear.
utilitarianism|This ethical theory judges actions by consequences and overall welfare.
deontology|This ethical approach emphasizes duties and rules.
virtue ethics|This approach emphasizes character and human flourishing.
the categorical imperative|This Kantian principle tests whether maxims can be universal laws.
the social contract|This idea explains political authority through agreement among people.
skepticism|This position questions whether certainty or knowledge is possible.
Rene Descartes|This philosopher argued from systematic doubt to "I think, therefore I am."|who
Immanuel Kant|This philosopher wrote the Critique of Pure Reason.|who
John Stuart Mill|This thinker defended liberty and utilitarianism.|who
Mary Wollstonecraft|This writer argued for women's rights in the 1790s.|who
existentialism|This movement emphasizes freedom, choice, and responsibility.
phenomenology|This method studies structures of experience from the first-person view.
pragmatism|This school assesses ideas by practical effects and inquiry.
empiricism|This view emphasizes experience as a source of knowledge.
rationalism|This view emphasizes reason as a source of knowledge.
dualism|This position treats mind and body as fundamentally distinct.
materialism|This view holds that reality is ultimately physical.
the veil of ignorance|This Rawlsian device asks people to choose principles without knowing their social position.
the trolley problem|This thought experiment tests moral intuitions about harm and choice.
the ship of Theseus|This puzzle asks whether identity survives replacement of all parts.
the allegory of the cave|This Platonic image describes prisoners mistaking shadows for reality.
the problem of induction|This puzzle asks how past observations justify future expectations.
the mind-body problem|This issue asks how mental states relate to physical states.
qualia|These subjective qualities of experience are debated in philosophy of mind.|whatAre
free will|This problem concerns whether choices are genuinely open.
determinism|This view says events are fixed by prior causes and laws.
nihilism|This position denies certain kinds of meaning or value.
absurdism|This view highlights the clash between human search for meaning and an indifferent universe.
falsifiability|This criterion says scientific claims should be testable by possible refutation.
Occam's razor|This principle prefers simpler explanations when evidence is equal.
`);

facts('r2', 'Psychology', 'stem', ['psychology','social-science'], `
memory|This mental process stores and retrieves information.
attention|This process selects information for mental focus.
perception|This process organizes sensory information into experience.
motivation|This force helps explain goal-directed behavior.
emotion|This state includes feeling, expression, and bodily response.
learning|This process changes behavior or knowledge through experience.
personality|This pattern of traits helps describe consistent differences among people.
cognition|This broad term covers thinking, knowing, and problem solving.
classical conditioning|This learning process links a neutral stimulus with a reflexive response.
operant conditioning|This learning process changes behavior through consequences.
reinforcement|This consequence increases the likelihood of a behavior.
punishment|This consequence decreases the likelihood of a behavior.
working memory|This limited system holds information for active use.
long-term memory|This system stores information over extended periods.
implicit memory|This memory affects behavior without conscious recall.
explicit memory|This memory involves conscious recall of facts or events.
confirmation bias|This tendency favors information that supports existing beliefs.
availability heuristic|This shortcut judges likelihood by how easily examples come to mind.
anchoring|This bias relies too heavily on an initial value.
the bystander effect|This pattern makes helping less likely when more people are present.
cognitive dissonance|This discomfort arises from conflicting beliefs or actions.
growth mindset|This belief treats ability as improvable through effort and strategies.
attachment theory|This framework studies early bonds and later relationships.
social facilitation|This effect changes performance when others are present.
the Stroop effect|This task shows interference when word meaning conflicts with ink color.
the placebo effect|This improvement can result from expectation rather than active treatment.
the Hawthorne effect|This change occurs when people alter behavior because they are observed.
learned helplessness|This condition follows repeated exposure to uncontrollable negative events.
schema|This mental framework organizes knowledge and expectations.
priming|This effect occurs when exposure influences later responses.
neuroplasticity|This ability lets the brain change connections through experience.
amygdala|This brain region is important in fear and emotional processing.
hippocampus|This brain region is important for forming new memories.
prefrontal cortex|This brain area supports planning, judgment, and self-control.
Maslow's hierarchy|This model arranges human needs from basic survival to self-actualization.
the Big Five|This personality model includes openness, conscientiousness, extraversion, agreeableness, and neuroticism.|whatAre
the fundamental attribution error|This bias overemphasizes personality and underemphasizes situation.
the Dunning-Kruger effect|This pattern links low skill with overestimated ability.
loss aversion|This tendency weighs losses more heavily than equivalent gains.
prospect theory|This model describes choices involving risk and reference points.
`);

facts('r2', 'Genetics', 'stem', ['genetics','biology','science'], `
DNA|This molecule stores hereditary information in cells.
gene|This stretch of DNA can influence a trait or product.
chromosome|This packaged DNA structure carries many genes.
allele|This version of a gene can differ among individuals.
dominant trait|This trait appears when one copy of an allele is enough.
recessive trait|This trait appears only when two copies are present in many simple crosses.
genotype|This term refers to an organism's genetic makeup.
phenotype|This term refers to observable traits.
meiosis|This cell division produces gametes with half the usual chromosome number.
mitosis|This cell division produces genetically similar body cells.
mutation|This change in DNA sequence can create variation.
inheritance|This process passes traits from parents to offspring.
Punnett square|This grid predicts possible genetic combinations.
codominance|This pattern shows both alleles clearly in a heterozygote.
incomplete dominance|This pattern produces a blended-looking heterozygote.
sex-linked trait|This trait is associated with genes on sex chromosomes.
genetic drift|This random change in allele frequencies is strongest in small populations.
natural selection|This process favors traits that improve survival or reproduction.
gene flow|This movement of alleles occurs when individuals migrate and reproduce.
founder effect|This drift occurs when a small group starts a new population.
bottleneck effect|This drift follows a sharp reduction in population size.
polygenic inheritance|This pattern involves many genes contributing to one trait.
epigenetics|This field studies heritable gene-expression changes not caused by DNA sequence changes.
genome|This complete set of genetic material belongs to an organism.
CRISPR|This gene-editing tool is adapted from a bacterial defense system.
karyotype|This organized chromosome display helps detect abnormalities.
linkage|This pattern occurs when genes close together tend to be inherited together.
crossing over|This exchange during meiosis reshuffles genetic material.
recombination|This process creates new combinations of alleles.
pedigree chart|This family diagram tracks inheritance of traits.
plasmid|This small circular DNA molecule is common in bacteria.
transposon|This DNA sequence can move within a genome.
telomere|This chromosome end region helps protect genetic material.
centromere|This chromosome region helps attach spindle fibers.
operon|This bacterial gene-control unit groups related genes.
promoter|This DNA sequence helps start transcription.
enhancer|This DNA region can increase transcription from a distance.
RNA interference|This process can silence gene expression using small RNA molecules.
Mendelian inheritance|This pattern follows principles first described from pea experiments.
Hardy-Weinberg equilibrium|This model describes allele frequencies when evolutionary forces are absent.
`);

facts('r2', 'Periodic Table', 'stem', ['periodic-table','chemistry','science'], `
alkali metals|These highly reactive elements occupy the first main group.|whatAre
alkaline earth metals|These reactive elements include magnesium and calcium.|whatAre
halogens|These reactive nonmetals form salts with many metals.|whatAre
noble gases|These elements are known for low reactivity at standard conditions.|whatAre
transition metals|These elements often form colored compounds and variable charges.|whatAre
lanthanides|These rare-earth elements follow lanthanum in a row below the main table.|whatAre
actinides|These heavy elements include several radioactive metals.|whatAre
metalloids|These elements have properties between metals and nonmetals.|whatAre
atomic number|This number counts protons in an element's nucleus.
atomic mass|This weighted average reflects isotopes of an element.
period|This horizontal row organizes elements by electron shells.
group|This vertical column often contains elements with similar chemistry.
valence shell|This outer electron level helps explain bonding behavior.
ionization energy|This energy is required to remove an electron from an atom.
atomic radius|This size trend generally decreases across a period.
electronegativity|This trend measures attraction for bonding electrons.
Mendeleev|This scientist arranged elements and predicted missing ones.|who
periodic law|This principle says properties repeat when elements are ordered by atomic number.
isotopes|These forms of an element have different neutron counts.|whatAre
radioactivity|This process releases radiation from unstable nuclei.
allotropes|These different structural forms belong to the same element.|whatAre
diatomic elements|These elements naturally form two-atom molecules in their standard state.|whatAre
semiconductors|These materials conduct electricity between conductors and insulators.|whatAre
rare earth elements|These elements are important in magnets, screens, and clean-energy technology.|whatAre
alkali metal reactivity|This trend generally increases moving down the first main group.
shielding effect|This effect reduces nuclear attraction felt by outer electrons.
effective nuclear charge|This attraction influences size and ionization trends.
electron affinity|This energy change occurs when an atom gains an electron.
oxidation state|This assigned charge helps track electron transfer.
coordination number|This count describes neighbors around a central atom or ion.
periodic trend|This pattern changes predictably across rows or down columns.
block|This table section is named for the subshell being filled.
superheavy elements|These laboratory-made elements have very high atomic numbers.|whatAre
synthetic elements|These elements are produced artificially rather than found naturally in bulk.|whatAre
transuranium elements|These elements have atomic numbers greater than uranium's.|whatAre
platinum group metals|These dense metals include platinum, palladium, and rhodium.|whatAre
chalcogens|This group includes oxygen, sulfur, selenium, and tellurium.|whatAre
pnictogens|This group includes nitrogen, phosphorus, arsenic, and antimony.|whatAre
periodic table island of stability|This predicted region may contain longer-lived superheavy nuclei.
Aufbau principle|This rule helps explain the order in which electron orbitals fill.
`);

facts('r2', 'Energy & Forces', 'stem', ['energy','forces','physics'], `
kinetic energy|This energy depends on motion.
potential energy|This stored energy depends on position or arrangement.
mechanical energy|This total often combines kinetic and potential energy.
thermal energy|This energy is associated with the motion of particles in matter.
chemical energy|This energy is stored in bonds and molecular arrangements.
nuclear energy|This energy comes from changes in atomic nuclei.
radiant energy|This energy travels as electromagnetic waves.
sound energy|This energy travels through vibrations in a medium.
normal force|This support force acts perpendicular to a surface.
tension|This pulling force is transmitted through a rope, cable, or string.
drag|This resistive force acts opposite motion through a fluid.
lift|This force can hold an aircraft in the air.
thrust|This force pushes a vehicle forward.
weight|This force is gravity acting on mass.
spring force|This restoring force follows Hooke's law in many simple cases.
net force|This overall force determines acceleration.
conservation of energy|This principle says energy changes form but total amount is preserved.
work-energy theorem|This theorem links net work with change in kinetic energy.
power|This rate measures energy transfer per unit time.
efficiency|This ratio compares useful output energy with input energy.
impulse|This quantity equals force multiplied by time and changes momentum.
mechanical advantage|This factor compares output force with input force in a machine.
torque|This rotational effect depends on force and distance from an axis.
center of mass|This point represents the average position of mass.
Hooke's law|This law says spring force is proportional to displacement for ideal springs.
Newton's third law|This law says forces come in equal and opposite pairs.
friction coefficient|This number helps relate friction force to normal force.
gravitational potential energy|This stored energy depends on height in a gravity field.
elastic potential energy|This stored energy belongs to stretched or compressed objects.
centrifugal force|This apparent outward force appears in a rotating reference frame.
Coriolis effect|This apparent deflection affects moving objects on a rotating Earth.
viscosity|This property describes a fluid's resistance to flow.
terminal velocity|This speed occurs when downward and upward forces balance.
static equilibrium|This condition has zero net force and zero net torque.
dynamic equilibrium|This condition can involve steady motion with balanced influences.
conservative force|This force has work that does not depend on path.
nonconservative force|This force can dissipate mechanical energy.
field|This model assigns a value or vector to points in space.
potential well|This region can trap a particle or object at lower energy.
escape velocity|This speed lets an object leave a body's gravity without more thrust.
`);

facts('r2', 'Astronomy', 'stem', ['astronomy','space','science'], `
planet|This body orbits a star, is round, and has cleared its neighborhood.
moon|This natural satellite orbits a planet or dwarf planet.
asteroid|This small rocky body often orbits in a belt between Mars and Jupiter.
comet|This icy body can grow a glowing tail near the Sun.
meteor|This streak of light appears when space debris burns in the atmosphere.
galaxy|This huge system contains stars, gas, dust, and dark matter.
nebula|This cloud of gas and dust can be a birthplace or remnant of stars.
light-year|This distance is how far light travels in one year.
red giant|This late stellar stage has expanded outer layers and a cooler surface.
white dwarf|This dense stellar remnant is left by many Sun-like stars.
supernova|This powerful explosion can mark the death of a massive star.
black hole|This object has gravity so strong that not even light escapes.
exoplanet|This planet orbits a star beyond our solar system.
the habitable zone|This region around a star may allow liquid water on a planet.
solar wind|This stream of charged particles flows from the Sun.
aurora|This glow appears when charged particles interact with the upper atmosphere.
parallax|This apparent shift helps astronomers measure distances to nearby stars.
proper motion|This apparent movement of a star across the sky builds over time.
redshift|This wavelength stretching can show that an object is moving away.
the cosmic microwave background|This faint radiation is leftover from the early universe.
dark matter|This unseen matter is inferred from gravity.
dark energy|This mysterious component is linked to accelerated cosmic expansion.
the Hertzsprung-Russell diagram|This chart compares star brightness and temperature.
main sequence|This band contains stars fusing hydrogen in their cores.
pulsar|This rotating neutron star sends regular beams of radiation.
quasar|This bright active galactic nucleus is powered by a supermassive black hole.
globular cluster|This dense old star cluster orbits a galaxy.
open cluster|This loose group of young stars forms from the same cloud.
the Oort Cloud|This distant icy reservoir may supply long-period comets.
the Kuiper Belt|This outer region includes Pluto and many icy bodies.
Lagrange point|This location balances gravitational and orbital effects.
Roche limit|This distance marks where tidal forces can tear a body apart.
the Chandrasekhar limit|This mass limit applies to white dwarfs.
the Tully-Fisher relation|This relation links spiral galaxy rotation speed and luminosity.
Cepheid variables|These stars help measure cosmic distances through predictable brightness changes.|whatAre
Type Ia supernovae|These explosions serve as standardizable candles for distance measurement.|whatAre
gravitational lensing|This bending of light occurs around massive objects.
cosmic inflation|This proposed early expansion happened extremely rapidly.
heliosphere|This bubble is carved by the solar wind around the Sun.
magnetosphere|This magnetic region helps shield a planet from charged particles.
`);

facts('r2', 'Scientific Laws', 'stem', ['scientific-laws','science'], `
Newton's first law|This law says motion changes only when a net force acts.
Newton's second law|This law links force, mass, and acceleration.
Newton's third law|This law pairs every action force with an equal opposite reaction.
Boyle's law|This law relates pressure and volume for a gas at constant temperature.
Charles's law|This law relates gas volume and temperature at constant pressure.
Ohm's law|This law relates voltage, current, and resistance.
Hooke's law|This law relates spring force to displacement for ideal springs.
the law of conservation of mass|This law says matter is not created or destroyed in ordinary chemical reactions.
the law of conservation of energy|This law says energy cannot be created or destroyed.
the law of universal gravitation|This law describes attraction between masses.
Coulomb's law|This law describes electric force between charges.
Faraday's law|This law connects changing magnetic fields with induced voltage.
Lenz's law|This law gives the direction of induced current opposing a change.
Snell's law|This law describes bending of light between media.
Kepler's first law|This law says planetary orbits are ellipses with the Sun at one focus.
Kepler's second law|This law says a planet sweeps equal areas in equal times.
Kepler's third law|This law links orbital period with average orbital distance.
the ideal gas law|This equation combines pressure, volume, amount, and temperature.
Hubble's law|This law links galaxy recession speed with distance.
Mendel's law of segregation|This law says allele pairs separate during gamete formation.
Mendel's law of independent assortment|This law describes separate inheritance of many gene pairs.
the law of superposition|This geology rule places younger layers above older layers in undisturbed strata.
the law of original horizontality|This geology rule says sediment layers are deposited roughly flat.
the law of cross-cutting relationships|This rule says a feature cutting another is younger.
the second law of thermodynamics|This law says entropy of an isolated system tends not to decrease.
the zeroth law of thermodynamics|This law defines thermal equilibrium relationships.
Kirchhoff's current law|This circuit law says current entering a junction equals current leaving.
Kirchhoff's voltage law|This circuit law says voltage changes around a closed loop sum to zero.
Beer-Lambert law|This law relates absorbance to concentration and path length.
Raoult's law|This law describes vapor pressure of ideal solutions.
Henry's law|This law relates dissolved gas amount to gas pressure above a liquid.
Avogadro's law|This law relates gas volume to amount at constant temperature and pressure.
Graham's law|This law compares gas diffusion or effusion rates.
Gauss's law|This law relates electric flux to enclosed charge.
Ampere's law|This law relates magnetic fields to electric current in a loop.
Planck's law|This law describes blackbody radiation spectrum.
Wien's displacement law|This law links peak radiation wavelength with temperature.
Stefan-Boltzmann law|This law links total radiation from a blackbody with temperature.
Fick's law|This law describes diffusion from high to low concentration.
Hardy-Weinberg principle|This model predicts genetic equilibrium under ideal conditions.
`);

facts('r2', 'Famous Scientists', 'stem', ['scientists','science'], `
Marie Curie|This physicist and chemist studied radioactivity and won Nobel Prizes in two sciences.|who
Albert Einstein|This physicist developed relativity and explained the photoelectric effect.|who
Isaac Newton|This scientist formulated laws of motion and gravity.|who
Charles Darwin|This naturalist proposed evolution by natural selection.|who
Rosalind Franklin|This scientist's X-ray images helped reveal DNA structure.|who
Jane Goodall|This primatologist transformed understanding of chimpanzee behavior.|who
Galileo Galilei|This astronomer defended heliocentrism and improved telescopic observations.|who
Ada Lovelace|This mathematician wrote notes on an early mechanical computer.|who
Katherine Johnson|This mathematician calculated trajectories for U.S. space missions.|who
Alan Turing|This mathematician helped found computer science and codebreaking.|who
Rachel Carson|This biologist's writing helped launch modern environmental awareness.|who
Carl Sagan|This astronomer popularized science through Cosmos.|who
Gregor Mendel|This monk's pea experiments became foundational for genetics.|who
Dmitri Mendeleev|This chemist arranged elements and predicted missing ones.|who
Barbara McClintock|This geneticist discovered transposable elements.|who
Chien-Shiung Wu|This physicist tested parity violation in beta decay.|who
Lise Meitner|This physicist helped explain nuclear fission.|who
Subrahmanyan Chandrasekhar|This astrophysicist studied the mass limit of white dwarfs.|who
S. N. Bose|This physicist's work led to the naming of bosons.|who
Jocelyn Bell Burnell|This astronomer discovered pulsars as a graduate student.|who
Vera Rubin|This astronomer's galaxy rotation work supported dark matter evidence.|who
Tu Youyou|This scientist helped develop an antimalarial drug from traditional sources.|who
Mario Molina|This chemist helped explain ozone depletion by CFCs.|who
Frances Arnold|This chemist pioneered directed evolution of enzymes.|who
Antoine Lavoisier|This chemist helped define elements and conservation of mass.|who
Michael Faraday|This scientist made key discoveries in electromagnetism and electrochemistry.|who
James Clerk Maxwell|This physicist unified electricity, magnetism, and light mathematically.|who
Niels Bohr|This physicist proposed a quantum model of the atom.|who
Enrico Fermi|This physicist built the first controlled nuclear chain reaction.|who
Richard Feynman|This physicist worked on quantum electrodynamics and became a famous teacher.|who
Emmy Noether|This mathematician linked symmetries with conservation laws.|who
Henrietta Leavitt|This astronomer discovered a key relationship in Cepheid variables.|who
Ibn al-Haytham|This medieval scholar made major contributions to optics.|who
Al-Biruni|This polymath studied astronomy, geography, and comparative culture.|who
Hypatia|This Alexandrian scholar taught mathematics and philosophy in late antiquity.|who
Maryam Mirzakhani|This mathematician was the first woman awarded the Fields Medal.|who
Jennifer Doudna|This biochemist shared a Nobel Prize for CRISPR gene-editing work.|who
Emmanuelle Charpentier|This microbiologist shared a Nobel Prize for CRISPR gene-editing work.|who
Mae Jemison|This physician and engineer became the first Black woman in space.|who
George Washington Carver|This agricultural scientist promoted crop rotation and alternative crops.|who
`);

facts('r2', 'AI & Computing Concepts', 'stem', ['ai','computing','technology'], `
algorithm|This step-by-step procedure solves a problem or performs a task.
data set|This collection of examples is used for analysis or training.
model|This learned or designed system makes predictions or decisions from data.
training|This process adjusts a model using examples.
inference|This process uses a trained model to produce an output.
classification|This task assigns items to categories.
regression|This task predicts a numerical value.
clustering|This task groups similar items without predefined labels.
neural network|This model uses layers of connected units inspired loosely by brains.
deep learning|This approach uses multi-layer neural networks.
supervised learning|This learning setup uses labeled examples.
unsupervised learning|This learning setup looks for patterns without labels.
reinforcement learning|This learning setup uses rewards and actions in an environment.
overfitting|This problem occurs when a model learns training data too narrowly.
underfitting|This problem occurs when a model is too simple to capture patterns.
feature|This input variable helps a model make a prediction.
gradient descent|This optimization method follows slopes to reduce error.
loss function|This measure tells how wrong a model's output is.
transformer|This architecture uses attention and became central to many language models.
attention|This mechanism weighs parts of input differently when producing output.
embedding|This vector representation captures relationships among items.
tokenization|This process breaks text into pieces a model can handle.
prompt|This input text or instruction guides a generative model.
hallucination|This failure produces confident but unsupported output.
bias|This systematic skew can appear in data, models, or decisions.
explainability|This goal aims to make model behavior understandable.
computer vision|This field helps computers interpret images and video.
natural language processing|This field helps computers work with human language.
speech recognition|This task converts spoken audio into text.
recommender system|This system suggests items such as videos, songs, or products.
decision tree|This model splits data through branching rules.
random forest|This model combines many decision trees.
support vector machine|This model separates classes with a boundary called a hyperplane.
Bayesian network|This model represents probabilistic relationships among variables.
genetic algorithm|This search method uses selection, crossover, and mutation ideas.
backpropagation|This method computes gradients through neural network layers.
regularization|This technique discourages overly complex models.
cross-validation|This evaluation method tests a model across different data splits.
confusion matrix|This table compares predicted and actual classes.
precision and recall|These metrics evaluate retrieved or classified results.|whatAre
`);

facts('r2', 'Cybersecurity Basics', 'stem', ['cybersecurity','technology'], `
password|This secret string helps prove a user's identity.
passphrase|This longer phrase can be easier to remember and harder to guess.
multi-factor authentication|This login method requires more than one proof of identity.
phishing|This scam tricks people into revealing information or clicking harmful links.
malware|This broad term covers harmful software.
ransomware|This malware locks or encrypts data and demands payment.
spyware|This software secretly gathers information.
firewall|This system filters network traffic based on rules.
encryption|This process makes information unreadable without a key.
decryption|This process turns protected data back into readable form.
hashing|This one-way process produces a fixed-size fingerprint of data.
backup|This copy helps restore data after loss or damage.
patch|This update fixes a vulnerability or bug.
vulnerability|This weakness can be exploited to harm a system.
exploit|This technique takes advantage of a vulnerability.
social engineering|This manipulation targets people rather than code.
least privilege|This principle gives users only the access they need.
zero trust|This approach verifies requests instead of assuming internal traffic is safe.
VPN|This tool creates an encrypted connection through another network.
certificate|This digital document helps prove a website or service identity.
public key|This key can be shared for encryption or signature verification.
private key|This secret key must be protected by its owner.
digital signature|This mechanism helps verify authenticity and integrity.
salt|This random value is added before hashing passwords.
brute-force attack|This attack tries many possible passwords or keys.
dictionary attack|This attack tries words and common password patterns.
security awareness|This training helps users recognize and avoid risks.
incident response|This plan guides detection, containment, and recovery.
access control|This system decides who may use resources.
authentication|This process verifies identity.
authorization|This process determines allowed actions after identity is known.
audit log|This record tracks events for review and investigation.
threat modeling|This process identifies likely risks and defenses.
penetration test|This authorized assessment looks for security weaknesses.
security patch management|This practice prioritizes and applies protective updates.
data breach|This incident exposes information to unauthorized people.
endpoint security|This protection focuses on devices such as laptops and phones.
network segmentation|This design limits how far an attacker can move.
security hygiene|This routine practice keeps systems safer through updates and good habits.
recovery point objective|This target defines how much data loss is acceptable.
`);

facts('r2', 'Engineering Feats', 'stem', ['engineering','technology'], `
the Panama Canal|This waterway saves ships from rounding South America.
the Suez Canal|This waterway links the Mediterranean Sea and Red Sea.
the Channel Tunnel|This rail tunnel connects Britain and France under the sea.
the Hoover Dam|This concrete dam controls the Colorado River and creates Lake Mead.
the Golden Gate Bridge|This suspension bridge crosses the entrance to San Francisco Bay.
the Trans-Siberian Railway|This long rail route stretches across Russia.
the International Space Station|This orbiting laboratory is assembled from modules launched by several nations.
the Large Hadron Collider|This particle accelerator sits in a circular tunnel near Geneva.
the Three Gorges Dam|This massive Chinese dam spans the Yangtze River.
the Burj Khalifa|This Dubai skyscraper is the world's tallest building.
the Millau Viaduct|This French bridge carries a highway high above the Tarn Valley.
the Gotthard Base Tunnel|This Swiss rail tunnel cuts beneath the Alps.
the Akashi Kaikyo Bridge|This Japanese suspension bridge has an extremely long central span.
Palm Jumeirah|This artificial island project is shaped like a palm tree.
the Itaipu Dam|This hydroelectric dam sits on the border of Brazil and Paraguay.
the Falkirk Wheel|This rotating boat lift connects two Scottish canals.
the Thames Barrier|This movable barrier helps protect London from storm surges.
the Delta Works|This Dutch system protects low-lying areas from North Sea flooding.|whatAre
the Seikan Tunnel|This undersea rail tunnel links Honshu and Hokkaido.
the Karakoram Highway|This high mountain road links Pakistan and China.
the CN Tower|This Toronto structure became a landmark of tall-building engineering.
the Hubble Space Telescope|This orbiting telescope was repaired by astronauts after launch.
the James Webb Space Telescope|This observatory unfolded a large segmented mirror in space.
the Brooklyn Bridge|This bridge used steel-wire suspension on a landmark scale.
the Eiffel Tower|This iron lattice tower was built for the 1889 Paris exposition.
the Aswan High Dam|This Nile dam created Lake Nasser.
the London Underground|This urban rail system opened in the 1860s.
the Erie Canal|This canal connected the Great Lakes with the Hudson River system.
the Apollo Guidance Computer|This compact computer helped navigate lunar missions.
the Saturn V|This powerful rocket launched astronauts toward the Moon.
the Forth Bridge|This Scottish rail bridge is a major cantilever structure.
the Qinghai-Tibet Railway|This high-altitude railway reaches Lhasa.
the Confederation Bridge|This bridge links Prince Edward Island with New Brunswick.
the Snowy Mountains Scheme|This Australian project diverts water for irrigation and power.
the Deepwater Horizon well cap|This engineering effort helped stop a major Gulf oil spill.
the CERN accelerator complex|This network feeds beams into major particle physics experiments.
the Masdar City project|This planned city in Abu Dhabi explores low-carbon urban design.
the Palm Islands|These artificial island developments changed Dubai's coastline.|whatAre
the Øresund Bridge|This road-rail link connects Denmark and Sweden.
the Rion-Antirion Bridge|This Greek bridge crosses the Gulf of Corinth.
`);

facts('r2', 'Bridges & Buildings', 'arts_music', ['architecture','bridges','buildings'], `
arch bridge|This bridge type transfers loads through a curved structure.
suspension bridge|This bridge type hangs its roadway from cables.
cable-stayed bridge|This bridge type uses cables running directly from towers to the deck.
cantilever bridge|This bridge type projects arms from supports to span a gap.
truss bridge|This bridge type uses connected triangles for strength.
skyscraper|This very tall building relies on structural frames and elevators.
dome|This rounded roof structure can cover large spaces.
buttress|This support projects from a wall to resist outward forces.
keystone|This central wedge locks an arch in place.
foundation|This lower structure transfers a building's load to the ground.
atrium|This open interior space often rises through several floors.
facade|This exterior face is often the public front of a building.
curtain wall|This non-load-bearing exterior wall hangs from a frame.
load-bearing wall|This wall carries weight from above.
flying buttress|This exterior support is associated with Gothic cathedrals.
reinforced concrete|This material combines concrete with steel.
Pont du Gard|This Roman aqueduct bridge stands in southern France.
Tower Bridge|This London bridge has two towers and a lifting span.
Sydney Harbour Bridge|This steel arch bridge is nicknamed the Coathanger.
Brooklyn Bridge|This New York bridge joined Manhattan and Brooklyn in 1883.
Millau Viaduct|This French bridge has very tall slender piers.
Ponte Vecchio|This Florence bridge is famous for shops built along it.
Rialto Bridge|This Venice bridge crosses the Grand Canal.
Charles Bridge|This Prague bridge is lined with statues.
Fallingwater|This Frank Lloyd Wright house is built partly over a waterfall.
Villa Savoye|This Le Corbusier house became a modernist icon.
Guggenheim Museum Bilbao|This Frank Gehry building helped transform a city's image.
Sagrada Familia|This Barcelona basilica is strongly associated with Antoni Gaudi.
Taj Mahal|This white marble mausoleum was built in Agra.
Hagia Sophia|This Istanbul monument has served as cathedral, mosque, and museum.
pendentive|This curved triangular support helps place a dome over a square space.
diagrid|This diagonal structural grid can support tall towers efficiently.
base isolation|This earthquake strategy lets a building move separately from the ground.
tuned mass damper|This device reduces sway in tall structures.
brutalism|This architectural style often uses massive raw concrete forms.
Art Deco|This style favors geometric ornament and sleek modern materials.
Bauhaus|This design school promoted functional modernism.
parametric design|This method uses rules and variables to generate forms.
adaptive reuse|This approach gives an old building a new purpose.
tensegrity|This structural idea balances compression elements with continuous tension.
`);

facts('r2', 'Greek Mythology', 'mythology_ancient', ['greek-mythology','mythology'], `
Zeus|This Olympian rules the sky and wields thunderbolts.|who
Hera|This queen of the gods is associated with marriage.|who
Athena|This goddess is associated with wisdom and strategic warfare.|who
Poseidon|This god rules the sea and earthquakes.|who
Hades|This god rules the underworld.|who
Aphrodite|This goddess is associated with love and beauty.|who
Apollo|This god is linked with prophecy, music, and the Sun.|who
Artemis|This goddess is linked with hunting and the Moon.|who
Hermes|This messenger god wears winged sandals.|who
Ares|This god represents the brutal side of war.|who
Hephaestus|This smith god makes weapons and armor for the gods.|who
Demeter|This goddess searches for her daughter after an underworld abduction.|who
Persephone|This daughter of Demeter becomes queen of the underworld.|who
Dionysus|This god is associated with wine and theatre.|who
Hestia|This goddess is associated with the hearth.|who
Pan|This wild god is often shown with goatlike features.|who
Prometheus|This Titan brings fire to humanity and suffers punishment.|who
Atlas|This Titan is condemned to hold up the heavens.|who
Cronus|This Titan overthrows Uranus and is later overthrown by his son.|who
Rhea|This Titan mother protects the infant Zeus from his father.|who
Orpheus|This musician descends to the underworld for Eurydice.|who
Eurydice|This wife of Orpheus is lost after he looks back.|who
Theseus|This hero defeats the Minotaur in a labyrinth.|who
Perseus|This hero beheads a snake-haired monster.|who
Heracles|This hero performs twelve labors.|who
Jason|This leader sails with the Argonauts for the Golden Fleece.|who
Medea|This sorceress helps Jason and later becomes a tragic figure.|who
Ariadne|This princess gives Theseus a thread to escape a maze.|who
the Aegis|This protective shield or breastplate is associated with Athena and Zeus.
the Golden Fleece|This prized object is sought by Jason and the Argonauts.
the Minotaur|This creature lives inside a labyrinth on Crete.
the Chimera|This fire-breathing monster combines parts of several animals.
the Hydra|This many-headed monster grows heads back after they are cut.
the Gorgons|These sisters include Medusa.|whatAre
the Furies|These avenging spirits punish certain crimes.|whatAre
the Muses|These nine figures inspire arts and learning.|whatAre
the Sirens|These singers lure sailors toward danger.|whatAre
the Argonauts|These sailors join Jason on his quest.|whatAre
the Labyrinth|This maze imprisons a monster on Crete.
the Oracle at Delphi|This prophetic shrine is associated with Apollo.
`);

facts('r2', 'World Religions & Beliefs', 'history_civics', ['religion','beliefs','culture'], `
pilgrimage|This journey is made to a sacred place for religious reasons.
ritual|This formal action follows established religious or cultural patterns.
scripture|This sacred writing holds authority in a tradition.
monotheism|This belief centers on one God.
polytheism|This belief recognizes many gods.
atheism|This position does not believe in gods.
agnosticism|This position holds that ultimate religious claims may be unknown.
secularism|This principle separates government institutions from religious authority.
Buddhism|This tradition began in India and emphasizes awakening from suffering.
Hinduism|This diverse South Asian tradition includes concepts such as dharma and karma.
Judaism|This tradition centers on covenant, Torah, and the history of the Jewish people.
Christianity|This tradition centers on the life and teachings of Jesus.
Islam|This tradition centers on submission to God and the prophethood of Muhammad.
Sikhism|This tradition began in Punjab and teaches devotion, equality, and service.
Jainism|This Indian tradition strongly emphasizes nonviolence.
Taoism|This Chinese tradition is associated with the Dao and harmony with nature.
karma|This concept links actions with consequences across moral or spiritual life.
dharma|This concept can mean duty, law, teaching, or cosmic order.
nirvana|This Buddhist goal is liberation from suffering and rebirth.
enlightenment|This term describes deep spiritual insight or awakening.
kosher|This Jewish dietary standard governs permitted foods.
halal|This Islamic standard governs what is permissible.
meditation|This practice trains attention, awareness, or contemplation.
prayer|This communication or devotion is directed toward the sacred.
syncretism|This blending combines elements from different religious traditions.
mysticism|This approach seeks direct experience of ultimate reality.
the Vedas|These ancient Sanskrit texts are central in Hindu tradition.|whatAre
the Torah|This teaching or law is foundational in Judaism.
the Quran|This scripture is central in Islam.
the Guru Granth Sahib|This scripture is the central text of Sikhism.
the Tripitaka|This collection preserves many Buddhist teachings.
the Bhagavad Gita|This Hindu text presents a dialogue on duty and devotion.
the Five Pillars|These core practices structure Muslim religious life.|whatAre
the Eightfold Path|This Buddhist path guides ethical and mental development.
the Ten Commandments|These biblical laws are important in Judaism and Christianity.|whatAre
the Golden Rule|This ethical principle urges treating others as one wants to be treated.
animism|This belief sees spirits or agency in natural beings and places.
totemism|This belief system links groups with symbolic plants, animals, or objects.
shamanism|This practice involves specialists mediating with a spirit world.
religious pluralism|This outlook recognizes multiple traditions within a society.
`);

facts('r2', 'Oceans', 'stem', ['oceans','geography','science'], `
Pacific Ocean|This largest ocean covers more area than all land combined.
Atlantic Ocean|This ocean separates the Americas from Europe and Africa.
Indian Ocean|This ocean lies south of Asia and east of Africa.
Southern Ocean|This ocean surrounds Antarctica.
Arctic Ocean|This smallest ocean lies around the North Pole.
coral reef|This marine ecosystem is built by tiny animals and their calcium carbonate skeletons.
continental shelf|This shallow submerged edge of a continent can be rich in life.
abyssal plain|This deep flat seafloor region lies far from land.
thermocline|This water layer changes temperature rapidly with depth.
salinity|This measure describes how salty water is.
upwelling|This process brings cold nutrient-rich water toward the surface.
downwelling|This process sends surface water deeper.
gyre|This large circular current system moves within an ocean basin.
tide|This regular sea-level rise and fall is driven mainly by gravity.
tsunami|This long wave is often triggered by undersea earthquakes.
sea level|This average height of the ocean is used as a reference.
the Mariana Trench|This trench contains the deepest known point in the ocean.
the Mid-Atlantic Ridge|This underwater mountain chain marks a spreading boundary.
the Great Barrier Reef|This huge reef system lies off northeastern Australia.
the Gulf Stream|This warm current influences climates around the North Atlantic.
the Humboldt Current|This cold current flows along western South America.
El Nino|This Pacific climate pattern warms surface waters in the eastern tropical ocean.
La Nina|This Pacific pattern cools surface waters in the eastern tropical ocean.
the Sargasso Sea|This region is bounded by currents rather than land.
hydrothermal vent|This seafloor opening releases hot mineral-rich water.
chemosynthesis|This process lets some deep-sea life use chemical energy.
marine snow|This falling organic material feeds deep-ocean ecosystems.
phytoplankton|These microscopic producers form the base of many marine food webs.|whatAre
zooplankton|These drifting animals feed on smaller organisms.|whatAre
kelp forest|This coastal ecosystem is built by large brown algae.
estuary|This coastal zone mixes freshwater and seawater.
mangrove|This coastal tree or shrub grows in salty, tidal areas.
ocean acidification|This change occurs as seawater absorbs carbon dioxide.
dead zone|This low-oxygen area can follow nutrient pollution.
exclusive economic zone|This maritime area gives coastal states resource rights.
nautical mile|This distance unit is based on Earth's circumference.
bathymetry|This measurement maps the depth and shape of the seafloor.
submersible|This underwater vehicle can carry people or instruments.
ROV|This remotely operated vehicle explores underwater without a pilot aboard.
thermohaline circulation|This global flow is driven by temperature and salinity differences.
`);

facts('r2', 'Books & Authors', 'literature_language', ['books','authors','literature'], `
Jane Austen|This author wrote Pride and Prejudice.|who
Mark Twain|This author created Tom Sawyer and Huckleberry Finn.|who
Mary Shelley|This author wrote Frankenstein as a young woman.|who
George Orwell|This author wrote Animal Farm and Nineteen Eighty-Four.|who
Agatha Christie|This mystery writer created Hercule Poirot and Miss Marple.|who
J.R.R. Tolkien|This author created Middle-earth.|who
Harper Lee|This author wrote To Kill a Mockingbird.|who
Charles Dickens|This Victorian author wrote Great Expectations and A Christmas Carol.|who
Homer|This ancient poet is traditionally linked with the Iliad and the Odyssey.|who
Virgil|This Roman poet wrote the Aeneid.|who
Miguel de Cervantes|This Spanish author wrote Don Quixote.|who
Leo Tolstoy|This Russian author wrote War and Peace.|who
Fyodor Dostoevsky|This Russian author wrote Crime and Punishment.|who
Virginia Woolf|This modernist author wrote Mrs Dalloway and To the Lighthouse.|who
Chinua Achebe|This Nigerian author wrote Things Fall Apart.|who
Toni Morrison|This Nobel laureate wrote Beloved.|who
Gabriel Garcia Marquez|This author wrote One Hundred Years of Solitude.|who
Isabel Allende|This Chilean author wrote The House of the Spirits.|who
Margaret Atwood|This Canadian author wrote The Handmaid's Tale.|who
Alice Munro|This Canadian Nobel laureate is famous for short stories.|who
Octavia Butler|This author wrote Kindred and Parable of the Sower.|who
Ursula K. Le Guin|This author wrote The Left Hand of Darkness.|who
Ray Bradbury|This author wrote Fahrenheit 451.|who
Arthur C. Clarke|This author co-wrote 2001: A Space Odyssey.|who
The Odyssey|This epic follows a Greek hero's long voyage home.
Frankenstein|This novel features Victor and the creature he creates.
Moby-Dick|This novel follows Ahab's hunt for a white whale.
Pride and Prejudice|This novel features Elizabeth Bennet and Mr. Darcy.
Jane Eyre|This novel follows an orphaned governess and Mr. Rochester.
The Great Gatsby|This novel is narrated by Nick Carraway.
Things Fall Apart|This novel follows Okonkwo in an Igbo community.
Beloved|This novel centers on Sethe and the legacy of slavery.
magical realism|This style blends realistic settings with extraordinary elements.
stream of consciousness|This technique follows the flow of a character's thoughts.
bildungsroman|This genre follows a character's growth toward maturity.
epistolary novel|This form tells a story through letters or documents.
unreliable narrator|This storyteller cannot be fully trusted by readers.
satire|This mode uses humor or irony to criticize human folly.
allegory|This story form carries a second symbolic meaning.
foreshadowing|This technique hints at future events.
`);

supplement('r1', 'Cars', `
1|What is a sedan?|This passenger car body style usually has a separate trunk and four doors.
1|What is a pickup truck?|This vehicle type has an open cargo bed behind the cab.
2|What is traction control?|This system reduces wheel spin during acceleration.
2|What is a parking brake?|This secondary brake helps hold a stopped vehicle in place.
3|What is a timing belt?|This engine part keeps camshaft and crankshaft movement synchronized.
3|What is a fuel injector?|This component sprays fuel into an engine's intake or cylinder.
4|What is hydroplaning?|This loss of tire grip happens when water lifts tires from the road.
4|What is a sway bar?|This suspension part helps reduce body roll in turns.
5|What is a limited production run?|This manufacturing approach builds only a small set of vehicles.
5|What is a dual-clutch transmission?|This transmission preselects gears with two clutch assemblies.
`);
supplement('r1', 'Planes & Aviation', `
1|What is a jet bridge?|This movable hallway connects an airport gate with an aircraft door.
1|What is a boarding gate?|This airport area is where passengers wait before getting on a flight.
2|What is a flight attendant?|This crew member helps passengers and handles cabin safety.
2|What is a tailwind?|This wind blows in the same direction an aircraft is traveling.
3|What is a holding pattern?|This oval flight path keeps an aircraft waiting before landing.
3|What is a pressure cabin?|This aircraft cabin keeps air breathable at high altitude.
4|What is a glass cockpit?|This flight deck uses digital displays instead of many separate gauges.
4|What is adverse yaw?|This tendency turns an aircraft opposite the direction of a roll input.
5|What is a yaw damper?|This system reduces unwanted side-to-side aircraft motion.
5|What is a variable-sweep wing?|This wing design can change its angle during flight.
`);
supplement('r1', 'Animals', `
1|What is a hedgehog?|This small mammal rolls into a spiny ball for protection.
1|What is an alpaca?|This South American domesticated animal is raised for soft fiber.
2|What is a tapir?|This hoofed mammal has a short flexible snout.
2|What is a mandrill?|This colorful primate has a bright face and rump.
3|What is an axolotl?|This amphibian can remain aquatic and larval-looking as an adult.
3|What is an okapi?|This forest mammal is a relative of the giraffe.
4|What is a quoll?|This spotted carnivorous marsupial lives in Australia and New Guinea.
4|What is a tuatara?|This reptile-like animal of New Zealand is the last of an ancient lineage.
5|What is a shoebill stork?|This large African bird has a massive clog-shaped bill.
5|What is a pangolin?|This scaly mammal is heavily trafficked for illegal wildlife trade.
`);
supplement('r1', 'World War II', `
1|What is rationing?|This home-front policy limited scarce goods during wartime.
1|What is a blackout?|This practice hid city lights to make air raids harder.
2|What is Lend-Lease?|This U.S. program supplied Allied nations before direct American entry.
2|What is the Atlantic Charter?|This 1941 statement outlined shared Allied aims.
3|What is Operation Torch?|This Allied landing opened a North African front.
3|What is the Manhattan Project?|This secret program developed atomic weapons.
4|What is the Battle of Kursk?|This 1943 clash involved a huge armored battle on the Eastern Front.
4|What is the Warsaw Uprising?|This 1944 revolt tried to liberate a capital before Soviet arrival.
5|What is the Wannsee Conference?|This 1942 meeting coordinated the Nazi genocide of European Jews.
5|What is Operation Bagration?|This 1944 Soviet offensive destroyed much of Germany's Army Group Centre.
`);
supplement('r1', 'Modern Civics', `
5|What is judicial independence?|This principle protects courts from improper political pressure.
5|What is constitutional convention?|This unwritten practice helps guide how a political system operates.
`);
supplement('r1', 'World Capitals', `
1|What is Finland?|Helsinki is the capital of this Nordic country.
1|What is Kenya?|Nairobi is the capital of this East African country.
2|What is Vietnam?|Hanoi is the capital of this Southeast Asian country.
2|What is Chile?|Santiago is the capital of this long South American country.
3|What is Ghana?|Accra is the capital of this West African country.
3|What is Uruguay?|Montevideo is the capital of this South American country.
4|What is Kazakhstan?|Astana is the capital of this Central Asian country.
4|What is Slovakia?|Bratislava is the capital of this Central European country.
5|What is Kyrgyzstan?|Bishkek is the capital of this Central Asian country.
5|What is Eritrea?|Asmara is the capital of this Horn of Africa country.
`);
supplement('r2', 'Human Body', `
1|What is the diaphragm?|This muscle helps draw air into the lungs when it contracts.
`);
supplement('r1', 'Ontario Knowledge', `
1|What is the Legislative Assembly of Ontario?|This elected body debates and passes provincial laws at Queen's Park.
5|What is the Temagami region?|This northeastern area is known for old-growth pine and canoe routes.
`);
supplement('r1', 'Canadian History', `
4|What is the Chanak Crisis?|This 1922 dispute showed Canada would not automatically follow Britain into war.
`);
supplement('r1', 'Physics Concepts', `
5|What is relativistic mass?|This older term describes mass increasing with speed in some presentations of relativity.
`);
supplement('r1', 'Plants & Nature', `
2|What is a stolon?|This horizontal stem can run along the surface and produce new plants.
2|What is a bract?|This leaflike structure can sit near a flower or inflorescence.
2|What is a petiole?|This stalk attaches a leaf blade to a stem.
3|What is a drupe?|This fleshy fruit type has a single hard stone inside.
3|What is a samara?|This winged fruit helps seeds spin away on the wind.
`);
supplement('r1', 'Ecology', `
3|What is ecological succession?|This gradual community change can follow fire, flood, or new land formation.
3|What is trophic cascade?|This chain reaction spreads through food webs after one population changes.
`);
supplement('r1', 'Dinosaurs & Fossils', `
5|What is the Morrison Formation?|This rock formation preserves many Jurassic dinosaurs in western North America.
`);
supplement('r1', 'Tech Before Smartphones', `
1|What is the rotary phone?|This telephone used a turning dial to enter numbers.
1|What is the pocket calculator?|This handheld device made arithmetic portable before phones did.
1|What is the pay phone?|This public telephone required coins or a card for calls.
2|What is the dot-matrix printer?|This printer formed characters from tiny impact-driven dots.
2|What is the overhead projector?|This classroom device enlarged transparent sheets onto a screen.
4|What is the Osborne 1?|This early portable computer weighed far more than modern laptops.
4|What is the Sinclair ZX Spectrum?|This British home computer became popular for inexpensive gaming and programming.
4|What is the TRS-80?|This early microcomputer was sold through RadioShack.
4|What is the Amiga 500?|This home computer was known for graphics and sound.
4|What is the Psion Series 5?|This pocket computer had a clamshell keyboard and organizer software.
5|What is the Xerox Alto?|This experimental computer influenced graphical interfaces and networking.
5|What is the NeXTcube?|This workstation platform hosted early Web development.
`);
supplement('r1', 'Internet History', `
1|What is a bulletin board system?|This dial-up service let users exchange messages and files before the Web.
1|What is dial-up internet?|This connection used telephone lines and audible modem tones.
1|What is a web browser?|This software displays pages and follows links.
2|What is AltaVista?|This early search engine was prominent before Google.
3|What is NCSA Mosaic?|This browser helped bring graphics to early web users.
`);
supplement('r1', 'Hardware & Devices', `
2|What is a barcode scanner?|This input device reads printed product codes at checkout.
4|What is an FPGA?|This chip can be configured after manufacturing for specialized logic.
`);
supplement('r1', 'Movies', `
2|What is a continuity editor?|This crew member helps keep screen details consistent between shots.
`);
supplement('r1', 'World Cuisines', `
2|What is bibimbap?|This Korean rice bowl is often topped with vegetables, meat, and egg.
2|What is pierogi?|These filled dumplings are common in Polish cuisine.
3|What is nasi goreng?|This Indonesian fried rice dish is often served with egg.
3|What is bibingka?|This Filipino rice cake is often associated with Christmas season.
3|What is avgolemono?|This Greek soup uses egg and lemon for a silky texture.
3|What is loco moco?|This Hawaiian dish often combines rice, hamburger patty, egg, and gravy.
4|What is nam prik?|This Thai chili relish is served with vegetables and other foods.
5|What is smorrebrod?|This Danish open-faced sandwich is built on rye bread.
5|What is xiaolongbao?|These soup dumplings are associated with Jiangnan cuisine.
`);
supplement('r2', 'Government & Elections', `
1|What is a ballot box?|This container receives voters' marked ballots.
1|What is a polling station?|This place is where voters cast ballots in person.
1|What is an absentee ballot?|This ballot lets someone vote without attending a polling place.
1|What is a campaign platform?|This set of promises describes what a party or candidate supports.
1|What is voter registration?|This process puts eligible voters on the official list.
1|What is a riding?|This Canadian electoral district chooses one representative.
2|What is an advance poll?|This voting opportunity happens before election day.
2|What is a party leader?|This person heads a political party.
3|What is a hung parliament?|This result leaves no party with a clear majority.
4|What is parliamentary sovereignty?|This doctrine gives a legislature supreme lawmaking authority in some systems.
5|What is constructive abstention?|This procedure lets a member state avoid blocking certain joint decisions.
`);
supplement('r2', 'Law & Rights', `
1|What is legal aid?|This service helps people afford legal advice or representation.
4|What is proportionality analysis?|This rights test asks whether a limit is balanced and justified.
`);
supplement('r2', 'Economics', `
3|What is marginal utility?|This added satisfaction comes from one more unit of a good or service.
3|What is price discrimination?|This strategy charges different customers different prices for similar goods.
5|What is Dutch disease?|This problem can occur when a resource boom makes other exports less competitive.
5|What is the Triffin dilemma?|This conflict affects a reserve-currency country that must supply global liquidity.
`);
supplement('r2', 'Philosophy', `
1|What is an argument?|This set of claims offers reasons for a conclusion.
`);
supplement('r2', 'Genetics', `
2|What is a carrier?|This person has one copy of a recessive allele without showing the trait.
3|What is linkage disequilibrium?|This pattern means genetic variants occur together more often than expected.
3|What is pleiotropy?|This effect occurs when one gene influences multiple traits.
4|What is epistasis?|This interaction has one gene affect how another gene is expressed.
4|What is copy number variation?|This genetic difference changes how many copies of a DNA segment are present.
5|What is genetic hitchhiking?|This process lets a neutral variant rise because it sits near a favored one.
5|What is coalescent theory?|This framework traces gene copies back to common ancestors.
`);
supplement('r2', 'Periodic Table', `
2|What is a lanthanide contraction?|This trend makes later rare-earth ions smaller than expected.
5|What is the actinide concept?|This organizing idea placed actinides below the lanthanides.
`);
supplement('r2', 'Energy & Forces', `
2|What is shear force?|This force acts parallel to a surface or cross-section.
3|What is strain energy?|This stored energy comes from deformation.
3|What is rolling resistance?|This opposition occurs as wheels deform and move over a surface.
4|What is pseudo force?|This apparent force appears in an accelerating reference frame.
5|What is virial theorem?|This theorem relates average kinetic and potential energies in bound systems.
`);
supplement('r2', 'Scientific Laws', `
1|What is Pascal's principle?|This principle says pressure applied to a confined fluid is transmitted throughout it.
1|What is Archimedes' principle?|This principle gives the buoyant force on an immersed object.
2|What is Dalton's law?|This law adds partial pressures in a gas mixture.
4|What is Curie's law?|This law relates magnetization of some materials to temperature and field.
`);
supplement('r2', 'Famous Scientists', `
2|Who is Cecilia Payne-Gaposchkin?|This astronomer showed that stars are made mostly of hydrogen and helium.
2|Who is Grace Hopper?|This computer scientist helped develop COBOL and popularized the term debugging.
`);
supplement('r2', 'AI & Computing Concepts', `
3|What is transfer learning?|This method adapts knowledge from one task to another.
3|What is dimensionality reduction?|This technique represents data with fewer variables.
`);
supplement('r2', 'Engineering Feats', `
1|What is the St. Lawrence Seaway?|This system lets ocean-going ships reach the Great Lakes.
2|What is the Mersey Gateway Bridge?|This cable-stayed bridge crosses a river in northwest England.
3|What is the Itaipu spillway?|This structure safely releases excess water from a huge hydroelectric dam.
3|What is the Channel Tunnel Rail Link?|This high-speed line connects London with the undersea tunnel route.
`);
supplement('r2', 'Bridges & Buildings', `
1|What is a bascule bridge?|This movable bridge type lifts like a seesaw to let boats pass.
2|What is a tied-arch bridge?|This bridge type uses a bottom tie to resist the arch's outward thrust.
2|What is a box girder bridge?|This bridge uses hollow rectangular beams for strength and stiffness.
2|What is a segmental bridge?|This bridge is built from repeated concrete sections.
2|What is an extradosed bridge?|This bridge type blends cable-stayed and girder behavior.
2|What is a movable bridge?|This bridge type changes position to allow traffic below.
2|What is a covered bridge?|This bridge has a roof and side covering over its span.
2|What is a causeway?|This raised road or track crosses low or wet ground.
3|What is a cofferdam?|This temporary enclosure lets builders work in a dry area below water level.
3|What is a caisson?|This watertight structure helps build foundations underwater.
3|What is a pier foundation?|This support carries loads down to stronger soil or rock.
4|What is a space frame?|This three-dimensional truss can span large roofs efficiently.
4|What is a gridshell?|This lightweight shell is made from a grid of structural members.
4|What is a vierendeel truss?|This truss uses rectangular openings without diagonal members.
5|What is a tuned liquid damper?|This sloshing-fluid device can reduce building motion.
5|What is progressive collapse?|This failure spreads from a local break to a larger structural loss.
5|What is a moment-resisting frame?|This frame resists lateral loads through rigid joints.
5|What is a shear wall core?|This stiff central structure helps tall buildings resist wind and earthquakes.
5|What is post-tensioning?|This method tightens steel tendons after concrete hardens.
5|What is a waffle slab?|This concrete floor system has a grid of ribs underneath.
5|What is a diagrid tower?|This tall-building structure uses diagonal exterior members.
5|What is a transfer girder?|This deep beam shifts loads from columns above to supports below.
`);
supplement('r2', 'Greek Mythology', `
1|Who is Nike?|This winged goddess personifies victory.
1|Who is Hecate?|This goddess is associated with crossroads and magic.
2|Who is Bellerophon?|This hero rides Pegasus and defeats a fire-breathing monster.
2|Who is Cassandra?|This Trojan seer is cursed to be disbelieved.
2|Who is Andromeda?|This princess is rescued from a sea monster by Perseus.
2|Who is Phaethon?|This son of Helios loses control of the Sun's chariot.
2|Who is Tantalus?|This figure is punished with unreachable food and water.
2|Who is Sisyphus?|This king is punished by rolling a stone uphill forever.
2|Who is Niobe?|This queen boasts about her children and suffers divine punishment.
2|Who is Europa?|This Phoenician princess is carried away by Zeus in bull form.
3|Who is Laocoon?|This Trojan priest warns against bringing in the wooden horse.
4|Who is Meleager?|This hero is linked with the Calydonian boar hunt.
4|Who is Pygmalion?|This sculptor falls in love with a statue that comes to life.
`);
supplement('r2', 'Oceans', `
4|What is the oxygen minimum zone?|This layer has unusually low dissolved oxygen in seawater.
`);
supplement('r1', 'Animals', `
3|What is a bilby?|This small Australian marsupial has long ears and digs burrows.
4|What is a zorilla?|This striped African mustelid can spray a powerful smell when threatened.
5|What is a hirola?|This rare antelope of Kenya and Somalia is sometimes called a hunter's hartebeest.
`);
supplement('r1', 'World War II', `
1|What are victory gardens?|These home plots helped civilians supplement food supplies during wartime.
1|What is the Home Guard?|This British volunteer force prepared for possible invasion.
2|What is the Atlantic Wall?|This German defensive system stretched along occupied western Europe.
2|What is Operation Dragoon?|This Allied landing invaded southern France in 1944.
3|What is the Battle of El Alamein?|This North African battle helped stop Axis advance toward Egypt.
3|What is Operation Market Garden?|This airborne plan tried to seize bridges into the Netherlands.
4|What is the Battle of Monte Cassino?|This Italian campaign battle centered on a hilltop monastery.
4|What is the Burma Road?|This supply route linked Burma with China before Japanese advances.
5|What is the Katyn massacre?|This mass killing of Polish officers was carried out by the Soviet NKVD.
`);
supplement('r1', 'Modern Civics', `
5|What is ministerial responsibility?|This convention makes ministers answerable for their departments.
5|What is subsidiarity?|This principle favors handling decisions at the lowest effective level of authority.
`);
supplement('r2', 'Human Body', `
1|What is the uvula?|This small hanging structure is visible at the back of the mouth.
`);
supplement('r1', 'Ecology', `
3|What is ecotone?|This transition area lies between two ecological communities.
3|What is biocapacity?|This measure estimates an ecosystem's ability to regenerate resources and absorb waste.
`);
supplement('r1', 'World Cuisines', `
4|What is gochujang?|This Korean fermented chili paste adds heat and depth to many dishes.
`);
supplement('r2', 'Government & Elections', `
1|What is a campaign manager?|This person organizes strategy, staff, and resources for a candidate.
1|What is a recount?|This process checks votes again when results are close or disputed.
`);
supplement('r2', 'Greek Mythology', `
1|Who is Eris?|This goddess personifies strife and throws a famous golden apple.
`);
supplement('r1', 'World War II', `
3|What is Operation Fortitude?|This deception plan misled Germany about the location of the D-Day landings.
3|What is the Battle of Gazala?|This 1942 desert battle preceded the Axis capture of Tobruk.
5|What is the Battle of Hurtgen Forest?|This long, costly battle was fought near Germany's western border in 1944.
`);
supplement('r1', 'Modern Civics', `
5|What is a supply and confidence agreement?|This arrangement supports a minority government on budgets and confidence votes.
`);
const finalRows = `
History|This 1521 event ended the Aztec capital's resistance to Spanish forces.|What is the fall of Tenochtitlan?
Geography|This sea between Saudi Arabia and Africa is opening along a major rift system.|What is the Red Sea?
Science|This particle has the same mass as an electron but a positive charge.|What is a positron?
Canadian History|This 1999 change created a new territory in Canada's north.|What is the creation of Nunavut?
World Landmarks|This cliffside monastery complex in Bhutan is nicknamed the Tiger's Nest.|What is Paro Taktsang?
Space Exploration|This probe became the first spacecraft to orbit Mercury.|What is MESSENGER?
Technology|This 1970s language created at Bell Labs became central to Unix systems programming.|What is C?
Mythology|This Greek hero solved the Sphinx's riddle before becoming king of Thebes.|Who is Oedipus?
Animals|This egg-laying mammal has venomous spurs on the male's hind legs.|What is the platypus?
World War II|This 1942 raid on Tokyo was launched from the carrier USS Hornet.|What is the Doolittle Raid?
Politics/Civics|This parliamentary procedure ends debate and forces a vote.|What is cloture?
Geography|This lake, shared by Peru and Bolivia, is often called the highest navigable lake.|What is Lake Titicaca?
Science|This lowest major layer of the atmosphere contains nearly all clouds and weather.|What is the troposphere?
Canadian Geography|This strait separates Vancouver Island from mainland British Columbia near Vancouver.|What is the Strait of Georgia?
History|This empire's capital at Tenochtitlan stood on an island in Lake Texcoco.|What is the Aztec Empire?
Space Exploration|This astronaut commanded the first Space Shuttle mission.|Who is John Young?
Technology|This early hypertext system was created at Brown University in the 1960s.|What is FRESS?
World Landmarks|This unfinished Barcelona basilica was designed by Antoni Gaudi.|What is La Sagrada Familia?
Animals|This monotreme has a long beak and lays eggs in Australia and New Guinea.|What is an echidna?
World War II|This conference issued a declaration demanding Japan's unconditional surrender.|What is the Potsdam Conference?
Politics/Civics|This voting method lets voters rank candidates and can transfer surplus votes.|What is single transferable vote?
History|This 1804 legal code influenced civil law systems far beyond France.|What is the Napoleonic Code?
Geography|This desert in northern Chile is among the driest places on Earth.|What is the Atacama Desert?
Science|This cell structure packages and modifies proteins before shipment.|What is the Golgi apparatus?
Canadian History|This 1870 act created Manitoba as a province.|What is the Manitoba Act?
World Landmarks|This ancient city in Jordan is entered through a narrow gorge called the Siq.|What is Petra?
Space Exploration|This Saturn moon received the Huygens lander in 2005.|What is Titan?
Technology|This theorem shows that any consistent formal system rich enough for arithmetic contains statements it can neither prove nor disprove.|What is Godel's incompleteness theorem?
Mythology|This Norse hall receives half of those slain in battle, chosen by Freyja.|What is Folkvangr?
Animals|This bird's long migration connects the Arctic and Antarctic regions.|What is the Arctic tern?
World War II|This German battleship was sunk after a major Atlantic chase in 1941.|What is the Bismarck?
Politics/Civics|This Latin term means a temporary delay or suspension of an activity or law.|What is a moratorium?
History|This 1415 battle was a major English victory during the Hundred Years' War.|What is Agincourt?
Geography|This African country completely surrounds Lesotho.|What is South Africa?
Science|This principle says no two identical fermions can occupy the same quantum state.|What is the Pauli exclusion principle?
Canadian Geography|This island group includes Baffin, Ellesmere, and Victoria islands.|What is the Arctic Archipelago?
World Landmarks|This Cambodian temple complex was first built for Vishnu and later became Buddhist.|What is Angkor Wat?
Space Exploration|This mission returned comet dust samples from Wild 2.|What is Stardust?
Technology|This programming language was designed by Guido van Rossum.|What is Python?
Mythology|This Mesopotamian hero journeys with Enkidu in one of the oldest surviving epics.|Who is Gilgamesh?
Animals|This marsupial carnivore of Tasmania is known for a powerful bite and loud screeches.|What is the Tasmanian devil?
World War II|This island battle in 1945 produced the famous flag-raising photograph.|What is Iwo Jima?
Politics/Civics|This system gives each voter a first preference and redistributes votes until a majority emerges.|What is instant-runoff voting?
History|This city was the eastern Roman capital founded by Constantine.|What is Constantinople?
Geography|This river forms part of the border between the United States and Mexico.|What is the Rio Grande?
Science|This acid carries genetic information from DNA to ribosomes as a messenger.|What is mRNA?
World Landmarks|This Inca city lies above the Urubamba River valley.|What is Machu Picchu?
Space Exploration|This telescope was launched in 2021 to observe infrared light from deep space.|What is the James Webb Space Telescope?
Technology|This public-key method is based on the difficulty of factoring large numbers.|What is RSA encryption?
Mythology|This Egyptian goddess resurrects Osiris and protects Horus.|Who is Isis?
Animals|This fish has a lure-like appendage to attract prey in deep water.|What is the anglerfish?
World War II|This 1944 battle in the Philippines was one of history's largest naval battles.|What is Leyte Gulf?
Politics/Civics|This term describes a legislature with only one chamber.|What is unicameral?
History|This 1494 treaty divided new Atlantic claims between Spain and Portugal.|What is the Treaty of Tordesillas?
Geography|This mountain range separates France and Spain.|What are the Pyrenees?
Science|This organelle contains chlorophyll in plant cells.|What is a chloroplast?
Canadian Geography|This river gives its name to a major hydroelectric project in northern Quebec.|What is the La Grande River?
World Landmarks|This fortress-palace complex overlooks Granada in Spain.|What is the Alhambra?
Space Exploration|This Mars orbiter has studied the planet since 2006 with a powerful camera.|What is Mars Reconnaissance Orbiter?
Technology|This 1989 proposal by Tim Berners-Lee described a linked information system at CERN.|What is Information Management: A Proposal?
Mythology|This Roman god of beginnings and doorways has two faces.|Who is Janus?
Animals|This canid of East Asia looks raccoon-like but is a wild dog relative.|What is a raccoon dog?
World War II|This 1943 conference in Iran brought together Roosevelt, Churchill, and Stalin.|What is the Tehran Conference?
Politics/Civics|This principle divides government power among branches to prevent concentration.|What is separation of powers?
History|This Chinese dynasty built much of the Forbidden City in Beijing.|What is the Ming dynasty?
Geography|This canal connects the Mediterranean Sea with the Red Sea.|What is the Suez Canal?
Science|This law says pressure and volume of a gas are inversely related at constant temperature.|What is Boyle's law?
Canadian History|This case confirmed that many women were legally persons eligible for Senate appointment.|What is the Persons Case?
World Landmarks|This Peruvian geoglyph group includes a hummingbird and a spider.|What are the Nazca Lines?
Space Exploration|This reusable Soviet spacecraft made one uncrewed orbital flight in 1988.|What is Buran?
Technology|This computer architecture separates memory for instructions from memory for data.|What is Harvard architecture?
Mythology|This Greek craftsman built wings for himself and his son.|Who is Daedalus?
Animals|This large flightless bird of New Guinea and Australia has a casque and dangerous kick.|What is the cassowary?
World War II|This Allied deception operation used a corpse carrying false papers.|What is Operation Mincemeat?
Politics/Civics|This term describes drawing districts to advantage a party or group unfairly.|What is gerrymandering?
History|This 1648 settlement ended the Thirty Years' War.|What is the Peace of Westphalia?
Science|This enzyme copies DNA into RNA.|What is RNA polymerase?
Canadian Geography|This Ontario geological structure is linked to a major ancient meteor impact and nickel ore.|What is the Sudbury Basin?
World Landmarks|This palace complex in Beijing served Ming and Qing emperors.|What is the Forbidden City?
Space Exploration|This mission first placed a spacecraft in orbit around asteroid Eros.|What is NEAR Shoemaker?
Technology|This sorting algorithm repeatedly partitions around a pivot.|What is quicksort?
Mythology|This Greek underworld ferryman carries souls across a river.|Who is Charon?
Animals|This hoofed animal has a flexible nose and lives on Eurasian steppes.|What is the saiga antelope?
World War II|This 1945 meeting in Crimea discussed postwar Europe.|What is the Yalta Conference?
Politics/Civics|This executive power can reject a bill passed by a legislature.|What is veto power?
History|This empire used quipu knots as an accounting and record system.|What is the Inca Empire?
Geography|This strait separates the Malay Peninsula from Sumatra.|What is the Strait of Malacca?
Science|This effect explains the apparent bending of waves around obstacles.|What is diffraction?
Canadian History|This 1914 ship carrying South Asian passengers was turned away from Vancouver.|What is the Komagata Maru?
World Landmarks|This archaeological site in Turkey includes early monumental stone circles.|What is Gobekli Tepe?
Space Exploration|This spacecraft made the first successful soft landing on the far side of the Moon.|What is Chang'e 4?
Technology|This data structure removes items in first-in, first-out order.|What is a queue?
Mythology|This Greek monster had snakes for hair and could turn viewers to stone.|Who is Medusa?
Animals|This tiny mammal can enter torpor and has a famously fast heartbeat.|What is a shrew?
World War II|This secret British site was central to codebreaking work.|What is Bletchley Park?
Politics/Civics|This official investigates complaints against public agencies.|What is an ombudsman?
History|This 1871 event unified many German states under Prussian leadership.|What is German unification?
Geography|This cold current flows north along the west coast of South America.|What is the Humboldt Current?
Science|This carbon molecule is shaped like a soccer ball with 60 atoms.|What is buckminsterfullerene?
Canadian History|This 1931 statute increased legislative independence for dominions.|What is the Statute of Westminster?
World Landmarks|This huge mosque in Cordoba later became a cathedral.|What is the Mosque-Cathedral of Cordoba?
Space Exploration|This European telescope mapped more than a billion stars in the Milky Way.|What is Gaia?
Technology|This 1968 presentation by Douglas Engelbart showed the mouse and hypertext.|What is the Mother of All Demos?
Mythology|This Polynesian hero is said to have fished up islands.|Who is Maui?
Animals|This deep-sea animal can eject sticky glowing mucus as defense.|What is the vampire squid?
World War II|This German rocket weapon was the first long-range guided ballistic missile used in war.|What is the V-2 rocket?
Politics/Civics|This term means a legislature's power to investigate government actions.|What is oversight?
History|This 1884-1885 meeting set rules for European claims in Africa.|What is the Berlin Conference?
Geography|This waterfall system lies on the border of Zambia and Zimbabwe.|What is Victoria Falls?
Science|This type of bond shares electron pairs between atoms.|What is a covalent bond?
Canadian Geography|This northern river is famous for Virginia Falls.|What is the Nahanni River?
World Landmarks|This fortified Inca site overlooks Cusco with massive stone walls.|What is Sacsayhuaman?
Space Exploration|This mission placed the first Indian spacecraft in Mars orbit.|What is Mars Orbiter Mission?
Technology|This algorithm finds shortest paths from a source in a weighted graph with nonnegative edges.|What is Dijkstra's algorithm?
Mythology|This Irish hero is famous for the warp-spasm battle frenzy.|Who is Cuchulainn?
Animals|This marine mammal uses tools such as rocks to open shellfish.|What is the sea otter?
World War II|This 1942-43 battle marked a major turning point on the Eastern Front.|What is Stalingrad?
Politics/Civics|This type of election lets voters remove an official before the end of a term.|What is a recall election?
`;
for (const line of finalRows.trim().split(/\r?\n/)) {
  const [category, clue, resp] = line.split('|');
  addFinal(category, clue, resp);
}
[
  ['History', 'This 1853-1856 conflict pitted Russia against an alliance including Britain, France, and the Ottoman Empire.', 'What is the Crimean War?'],
  ['Geography', 'This landlocked South American country has Sucre as constitutional capital and La Paz as seat of government.', 'What is Bolivia?'],
  ['Science', 'This named number is about 6.022 x 10^23 particles per mole.', 'What is Avogadro constant?'],
  ['Technology', 'This open standard lets websites request resources from another domain with controlled permission.', 'What is CORS?'],
  ['World War II', 'This 1943 Allied invasion of Sicily used the code name Husky.', 'What is Operation Husky?'],
  ['Politics/Civics', 'This redistribution of legislative seats among regions follows measured population changes.', 'What is reapportionment?'],
  ['Animals', 'This Madagascar primate group includes ring-tailed and mouse varieties.', 'What are lemurs?'],
  ['Space Exploration', 'This NASA mission deliberately struck an asteroid moonlet to test planetary defense.', 'What is DART?'],
  ['Canadian History', 'This 1995 referendum asked whether Quebec should become sovereign after an offer of partnership.', 'What is the 1995 Quebec referendum?'],
  ['World Landmarks', 'This Myanmar plain is dotted with thousands of Buddhist temples and pagodas.', 'What is Bagan?'],
  ['Mythology', 'This giant wolf is foretold to break free at Ragnarok.', 'Who is Fenrir?'],
  ['Science', 'This boundary in a black hole marks the point beyond which light cannot escape.', 'What is the event horizon?'],
  ['Technology', 'This database property group is summarized as atomicity, consistency, isolation, and durability.', 'What is ACID compliance?'],
  ['History', 'This 1905 naval battle saw Japan defeat a Russian fleet near Korea.', 'What is the Battle of Tsushima?'],
  ['Geography', 'This narrow waterway connects the Black Sea to the Sea of Marmara.', 'What is the Bosporus?'],
  ['World War II', 'This 1942 naval battle stopped Japan from taking Port Moresby by sea.', 'What is the Battle of the Coral Sea?'],
  ['Politics/Civics', 'This legal idea means a government body must act within the powers legally given to it.', 'What is ultra vires?'],
  ['Animals', 'This nocturnal African primate has huge eyes and a long bony finger.', 'What is an aye-aye?'],
  ['Space Exploration', 'This Mars lander detected seismic activity on the Red Planet.', 'What is InSight?'],
  ['Canadian Geography', 'This freshwater island in Lake Huron is often called the world largest lake island.', 'What is Manitoulin Island?'],
  ['World Landmarks', 'This ancient citadel near Athens is crowned by the Parthenon.', 'What is the Athenian Acropolis?'],
  ['Mythology', 'This Welsh collection includes stories of Pwyll, Branwen, and Math.', 'What is the Mabinogi?'],
  ['Science', 'This type of RNA carries amino acids to the ribosome during protein synthesis.', 'What is transfer RNA?'],
  ['Technology', 'This networking command-line tool is named for testing whether a host responds.', 'What is ping?'],
  ['History', 'This 1868 Japanese political restoration returned formal power to the emperor.', 'What is the Meiji Restoration?'],
  ['Geography', 'This plateau covers much of Spain and is ringed by mountain systems.', 'What is the Meseta Central?'],
  ['World War II', 'This 1940 evacuation moved Allied troops from beaches in northern France.', 'What is Dunkirk evacuation?'],
  ['Politics/Civics', 'This parliamentary role manages party discipline and vote attendance.', 'What is a party whip?'],
  ['Animals', 'This flightless New Zealand bird gives its name to the people of New Zealand informally.', 'What is the kiwi?'],
  ['Space Exploration', 'This ESA comet mission deployed the Philae lander.', 'What is Rosetta mission?'],
  ['World Landmarks', 'This Mali city was a medieval center of learning and manuscript culture.', 'What is Timbuktu?'],
  ['Science', 'This ocean zone has enough sunlight for photosynthesis.', 'What is the photic zone?']
].forEach(([category, clue, resp]) => addFinal(category, clue, resp));
const extraFinalRows = `
Canadian History|This 1944 order extended federal voting rights to many members of this group serving in the armed forces.|Who are First Nations people?
Canadian History|This 1960 law extended federal voting rights to status First Nations people without requiring them to give up status.|What is the Canada Elections Act amendment of 1960?
Canadian History|This 1965 symbol replaced the Red Ensign on federal buildings.|What is the maple leaf flag?
Canadian History|This 1969 policy proposal sought to abolish the Indian Act and transfer responsibilities to provinces.|What is the White Paper?
Canadian History|This 1990 standoff near Montreal began over plans to expand a golf course.|What is the Oka Crisis?
Canadian History|This 2008 formal statement was delivered in the House of Commons about residential schools.|What is the federal apology?
Canadian Geography|This Arctic waterway connects Baffin Bay with the Arctic Ocean between Greenland and Ellesmere Island.|What is Nares Strait?
Canadian Geography|This large Nunavut island lies in James Bay only about 20 kilometres from Ontario's coast.|What is Akimiski Island?
Canadian Geography|This highest peak in Canada rises in the Saint Elias Mountains.|What is Mount Logan?
Canadian Geography|This lake on the Manitoba-Saskatchewan border drains toward the Churchill River system.|What is Reindeer Lake?
Canadian Geography|This prairie park protects badlands where many dinosaur fossils have been found.|What is Dinosaur Provincial Park?
Ancient Civilizations|This ruler's law stele was discovered at Susa and is now in the Louvre.|What is the Code of Hammurabi?
Ancient Civilizations|This Bronze Age eruption on Thera affected the Aegean world.|What is the Minoan eruption?
Ancient Civilizations|This Assyrian king's library at Nineveh preserved the Epic of Gilgamesh.|Who is Ashurbanipal?
Ancient Civilizations|This Persian royal road linked Sardis with Susa.|What is the Royal Road?
Ancient Civilizations|This script on Easter Island remains undeciphered.|What is Rongorongo?
Ancient Civilizations|This Indus Valley site in present-day Pakistan was built with carefully planned streets.|What is Mohenjo-daro?
Ancient Civilizations|This Maya city in Guatemala has temples rising above the rainforest canopy.|What is Tikal?
Ancient Civilizations|This Andean site predates the Inca and is associated with monumental platform mounds.|What is Caral?
World Capitals|This planned capital replaced Lagos as the seat of Nigeria's government.|What is Abuja?
World Capitals|This capital lies on the Han River and was once called Hanyang.|What is Seoul?
World Capitals|This capital city was designed with major input from Lucio Costa and Oscar Niemeyer.|What is Brasilia?
World Capitals|This capital sits at the meeting of the Blue and White Nile.|What is Khartoum?
World Capitals|This capital near Table Mountain is one of South Africa's three national capitals.|What is Cape Town?
World Capitals|This capital on the Vltava River is known for a castle and Charles Bridge.|What is Prague?
World Capitals|This Andean capital is one of the world's highest national seats of government.|What is La Paz?
World Capitals|This Baltic capital has a medieval old town on the Gulf of Finland.|What is Tallinn?
Oceans & Rivers|This river's delta includes much of Bangladesh and the Indian state of West Bengal.|What is the Ganges-Brahmaputra Delta?
Oceans & Rivers|This African river is famous for a great bend near Timbuktu.|What is the Niger River?
Oceans & Rivers|This river begins in the Tibetan Plateau and reaches the South China Sea through Vietnam.|What is the Mekong River?
Oceans & Rivers|This salty lake has shores in Jordan, Israel, and the West Bank.|What is the Dead Sea?
Oceans & Rivers|This sea lies between the Korean Peninsula and Japan.|What is the Sea of Japan?
Oceans & Rivers|This current brings warm water northward along the eastern coast of North America.|What is the Gulf Stream?
Oceans & Rivers|This canal across Egypt opened in 1869.|What is the Suez Canal?
Oceans & Rivers|This river flows through Baghdad before joining another to form the Shatt al-Arab.|What is the Tigris?
Famous People|This South African leader spent 27 years imprisoned before becoming president.|Who is Nelson Mandela?
Famous People|This aviator disappeared over the Pacific in 1937 while attempting to circle the globe.|Who is Amelia Earhart?
Famous People|This Polish-born scientist coined the term radioactivity with her husband.|Who is Marie Curie?
Famous People|This Indian lawyer led a nonviolent independence movement against British rule.|Who is Mohandas Gandhi?
Famous People|This nurse organized care during the Crimean War and became a symbol of modern nursing.|Who is Florence Nightingale?
Famous People|This Haitian revolutionary leader was captured by France and died in a French prison.|Who is Toussaint Louverture?
Famous People|This Kenyan environmentalist founded the Green Belt Movement.|Who is Wangari Maathai?
Famous People|This mathematician's notes on the Analytical Engine are often called an early computer program.|Who is Ada Lovelace?
Inventions|This 1712 engine pumped water from mines and helped launch steam power.|What is the Newcomen atmospheric engine?
Inventions|This 1793 machine separated cotton fibers from seeds.|What is the cotton gin?
Inventions|This 1856 process made steel production cheaper by blowing air through molten iron.|What is the Bessemer process?
Inventions|This 1903 aircraft made controlled powered flight at Kitty Hawk.|What is the Wright Flyer?
Inventions|This 1947 device at Bell Labs became a foundation of modern electronics.|What is the point-contact transistor?
Inventions|This 1958 integrated circuit demonstration was built by Jack Kilby.|What is the microchip?
Inventions|This 1977 medical imaging technique uses magnetic fields and radio waves.|What is MRI?
Inventions|This polymer invented by Stephanie Kwolek is known for high tensile strength.|What is Kevlar?
Architecture|This architect designed Fallingwater over a Pennsylvania waterfall.|Who is Frank Lloyd Wright?
Architecture|This Swiss-French architect promoted the idea of a house as a machine for living.|Who is Le Corbusier?
Architecture|This ancient Roman author wrote De architectura.|Who is Vitruvius?
Architecture|This Italian engineer designed the dome of Florence Cathedral without traditional centering.|Who is Filippo Brunelleschi?
Architecture|This style's name came from a French word for raw concrete.|What is Brutalism?
Architecture|This New York skyscraper's stainless-steel crown and automobile-themed ornaments made it an Art Deco icon.|What is the Chrysler Building?
Architecture|This planned Indian city was designed in part by Le Corbusier.|What is Chandigarh?
Architecture|This London skyscraper by Norman Foster is nicknamed the Gherkin.|What is 30 St Mary Axe?
Economics|This Scottish thinker published The Wealth of Nations in 1776.|Who is Adam Smith?
Economics|This economist argued that governments should manage demand during downturns.|Who is John Maynard Keynes?
Economics|This market structure has many sellers offering differentiated products.|What is monopolistic competition?
Economics|This index measures average price change for a basket of consumer goods.|What is the Consumer Price Index?
Economics|This curve illustrates a tradeoff between tax rates and tax revenue.|What is the Laffer curve?
Economics|This international institution was created at Bretton Woods to support monetary cooperation.|What is the International Monetary Fund?
Economics|This concept says people or firms should specialize where their relative cost is lower.|What is comparative advantage?
Economics|This paradox notes that individual saving can reduce overall demand in a recession.|What is the paradox of thrift?
Philosophy|This ancient paradox describes a runner who seems unable to overtake a tortoise.|What is Zeno's paradox?
Philosophy|This philosopher's cave image distinguishes appearances from deeper reality.|Who is Plato?
Philosophy|This 17th-century thinker described life without government as solitary, poor, nasty, brutish, and short.|Who is Thomas Hobbes?
Philosophy|This philosopher argued for a veil of ignorance in A Theory of Justice.|Who is John Rawls?
Philosophy|This school founded by Zeno of Citium taught discipline over judgments and passions.|What is Stoicism?
Philosophy|This German philosopher wrote Beyond Good and Evil.|Who is Friedrich Nietzsche?
Philosophy|This term describes a statement true by definition, such as all bachelors are unmarried.|What is analytic proposition?
Philosophy|This thought experiment asks whether a room following symbol rules can understand Chinese.|What is the Chinese Room?
Literature|This novel's opening line begins with a claim that happy families are all alike.|What is Anna Karenina?
Literature|This epic poem begins with a quarrel between Achilles and Agamemnon.|What is the Iliad?
Literature|This novel follows Saleem Sinai, born at the moment of Indian independence.|What is Midnight's Children?
Literature|This novel by Ralph Ellison begins with a narrator declaring his invisibility.|What is Invisible Man?
Literature|This dystopian novel includes the World State and conditioning centers.|What is Brave New World?
Literature|This Nigerian novel opens with Okonkwo famous throughout nine villages.|What is Things Fall Apart?
Literature|This work by Dante begins with the narrator lost in a dark wood.|What is the Divine Comedy?
Literature|This Virginia Woolf novel follows a single day and a planned party in London.|What is Mrs Dalloway?
Art & Music|This painting's subject sits before a distant winding landscape and an enigmatic smile.|What is the Mona Lisa?
Art & Music|This mural by Picasso responds to the bombing of a Basque town.|What is Guernica?
Art & Music|This Dutch painter cut off part of his ear and painted starry skies.|Who is Vincent van Gogh?
Art & Music|This composer wrote the Brandenburg Concertos.|Who is Johann Sebastian Bach?
Art & Music|This composer wrote the opera The Magic Flute.|Who is Wolfgang Amadeus Mozart?
Art & Music|This Harlem Renaissance painter created the Migration Series.|Who is Jacob Lawrence?
Art & Music|This Mexican painter created many self-portraits with symbolic imagery.|Who is Frida Kahlo?
Art & Music|This Russian-born artist is often credited as a pioneer of abstract painting.|Who is Wassily Kandinsky?
Sports History|This 1936 Olympics athlete won four gold medals in Berlin.|Who is Jesse Owens?
Sports History|This boxer lit the cauldron at the 1996 Atlanta Olympics.|Who is Muhammad Ali?
Sports History|This 1972 chess match in Reykjavik became a Cold War cultural event.|What is Fischer-Spassky?
Sports History|This runner broke the four-minute mile barrier in 1954.|Who is Roger Bannister?
Sports History|This tennis player won the Battle of the Sexes match in 1973.|Who is Billie Jean King?
Sports History|This Canadian sprinter won the 1996 Olympic 100 meters in Atlanta.|Who is Donovan Bailey?
Sports History|This hockey series in 1972 ended with Paul Henderson's famous goal.|What is the Summit Series?
Sports History|This baseball player broke Major League Baseball's color barrier in 1947.|Who is Jackie Robinson?
Modern History|This 1948-1949 operation supplied a divided city by air.|What is the Berlin Airlift?
Modern History|This 1956 crisis followed Egypt's nationalization of a canal.|What is the Suez Crisis?
Modern History|This 1962 confrontation centered on Soviet missiles in the Caribbean.|What is the Cuban Missile Crisis?
Modern History|This 1978 agreement was negotiated by Egypt, Israel, and the United States at a presidential retreat.|What are the Camp David Accords?
Modern History|This 1989 event opened a barrier that had divided a German city for decades.|What is the fall of the Berlin Wall?
Modern History|This 1994 agreement created a trade zone among Canada, the United States, and Mexico.|What is NAFTA?
Modern History|This 1998 agreement helped set a framework for peace in Northern Ireland.|What is the Good Friday Agreement?
Modern History|This 2004 expansion added ten countries to the European Union.|What is the EU's eastern enlargement?
Earth Science|This supercontinent began breaking apart during the Mesozoic Era.|What is Pangaea?
Earth Science|This boundary between crust and mantle is named for a Croatian seismologist.|What is the Mohorovicic discontinuity?
Earth Science|This volcanic eruption in 1815 caused the Year Without a Summer.|What is Mount Tambora?
Earth Science|This scale measures earthquake magnitude by seismic moment.|What is the moment magnitude scale?
Earth Science|This mineral scale ranks scratch resistance from talc to diamond.|What is the Mohs scale?
Earth Science|Lower Ice Age sea levels exposed this land connection between Siberia and Alaska.|What is the Bering land bridge?
Earth Science|This rock type forms when limestone is metamorphosed.|What is marble?
Earth Science|This desert's name means empty quarter in Arabic.|What is the Rub' al Khali?
Astronomy|This astronomer cataloged galaxies and helped show the universe is expanding.|Who is Edwin Hubble?
Astronomy|This dwarf planet was visited by New Horizons in 2015.|What is Pluto?
Astronomy|This moon of Saturn has lakes and rivers of liquid hydrocarbons.|What is Titan?
Astronomy|This moon of Jupiter likely has a global ocean beneath ice.|What is Europa?
Astronomy|This star is the brightest in the night sky as seen from Earth.|What is Sirius?
Astronomy|This constellation contains Betelgeuse and Rigel.|What is Orion?
Astronomy|This galaxy is on a collision course with the Milky Way.|What is Andromeda?
Astronomy|This first directly imaged black hole lies at the centre of galaxy Messier 87.|What is M87*?
Law & Rights|This Canadian court is the final court of appeal for the country.|What is the Supreme Court of Canada?
Law & Rights|This 1215 document became a symbol of limits on royal power.|What is Magna Carta?
Law & Rights|This U.S. Supreme Court case established judicial review in 1803.|What is Marbury v. Madison?
Law & Rights|This Canadian Charter section allows reasonable limits demonstrably justified in a free and democratic society.|What is Section 1?
Law & Rights|This legal doctrine excludes illegally obtained evidence in some systems.|What is the exclusionary rule?
Law & Rights|This international document was adopted by the UN General Assembly in 1948.|What is the Universal Declaration of Human Rights?
Law & Rights|This Latin phrase means let the decision stand.|What is stare decisis?
Law & Rights|This Latin phrase means friend of the court.|What is amicus curiae?
World Religions|This city is sacred in Judaism, Christianity, and Islam.|What is Jerusalem?
World Religions|This Sikh place of worship is known for a community kitchen.|What is a gurdwara?
World Religions|This Buddhist monument form often contains relics.|What is a stupa?
World Religions|This Islamic pilgrimage to Mecca is required of those able to perform it.|What is the Hajj?
World Religions|This Hindu festival of lights is associated with lamps and renewal.|What is Diwali?
World Religions|This Jewish day of atonement is marked by fasting and reflection.|What is Yom Kippur?
World Religions|This Taoist text is traditionally attributed to Laozi.|What is the Tao Te Ching?
World Religions|This concept in Jainism means nonviolence toward living beings.|What is ahimsa?
`;
for (const line of extraFinalRows.trim().split(/\r?\n/)) {
  const [category, clue, resp] = line.split('|');
  addFinal(category, clue, resp);
}
const extraFinalTopOffRows = `
Ancient Civilizations|This empire of Sargon is often called the first empire in Mesopotamian history.|What is the Akkadian Empire?
Ancient Civilizations|This Peruvian ceremonial center is associated with carved stone heads and an early Andean culture.|What is Chavin de Huantar?
Ancient Civilizations|This granodiorite slab helped scholars decipher Egyptian hieroglyphs.|What is the Rosetta Stone?
Ancient Civilizations|This ancient city near modern Mosul was a major Assyrian capital.|What is Nineveh?
Oceans & Rivers|This southern African river plunges over Victoria Falls.|What is the Zambezi River?
Oceans & Rivers|This cold current flows south along the coast of Newfoundland and Labrador.|What is the Labrador Current?
Oceans & Rivers|This sea lies between Borneo, Java, Sumatra, and Sulawesi.|What is the Java Sea?
Oceans & Rivers|This sea lies between northern Australia and New Guinea.|What is the Arafura Sea?
Famous People|This Moroccan traveler wrote about journeys across Africa, Asia, and Europe in the 1300s.|Who is Ibn Battuta?
Famous People|This Egyptian pharaoh ruled as a woman and built a mortuary temple at Deir el-Bahri.|Who is Hatshepsut?
Inventions|This punched-card loom influenced later ideas about programmable machines.|What is the Jacquard loom?
Architecture|This New York tower by Mies van der Rohe became a model of modern corporate architecture.|What is the Seagram Building?
Economics|This post-World War II monetary order fixed exchange rates around the U.S. dollar.|What is the Bretton Woods system?
Philosophy|This challenge to justified true belief was published in a short 1963 paper.|What is the Gettier problem?
Philosophy|This Latin phrase means a blank slate in debates over knowledge and experience.|What is tabula rasa?
Literature|This Japanese work by Murasaki Shikibu is often called an early novel.|What is The Tale of Genji?
Modern History|This 1992 treaty created the European Union.|What is the Maastricht Treaty?
Astronomy|This largest object in the asteroid belt is classified as a dwarf planet.|What is Ceres?
Astronomy|This bright star in Lyra was used as a baseline for measuring stellar brightness.|What is Vega?
Astronomy|This interstellar object discovered in 2017 passed through the inner solar system.|What is Oumuamua?
Law & Rights|This 1954 U.S. Supreme Court case rejected school segregation.|What is Brown v. Board of Education?
Law & Rights|This 1966 U.S. Supreme Court case led to warnings about silence and counsel.|What is Miranda v. Arizona?
World Religions|This Sikh community meal is served free to visitors in a place of worship.|What is langar?
World Religions|This tree at Bodh Gaya is associated with the Buddha's awakening.|What is the Bodhi tree?
Ancient Civilizations|This fortified Bronze Age city in Anatolia is associated with layers excavated by Heinrich Schliemann.|What is Troy?
Inventions|This 1950s medical breakthrough by Jonas Salk targeted a paralyzing viral disease.|What is the polio vaccine?
`;
for (const line of extraFinalTopOffRows.trim().split(/\r?\n/)) {
  const [category, clue, resp] = line.split('|');
  addFinal(category, clue, resp);
}
facts('r1', 'Trains', 'general', ['trains','transportation'], `
sleeping car|This overnight rail coach lets passengers travel in berths instead of upright seats.
dining car|This rail coach serves meals to passengers during longer journeys.
commuter rail|This passenger service mainly carries people between suburbs and a city center.
ticket inspector|This railway worker checks fares after passengers board.
level crossing|This place is where a road crosses tracks at the same grade.
funicular|This cable railway uses paired cars on a steep slope.
cowcatcher|This metal frame on early locomotives helped push obstacles away from the track.
third rail|This electrified conductor beside some tracks supplies power to trains.
signal box|This lineside building traditionally housed levers for points and signals.
freight yard|This rail area sorts and stores cargo cars.
tilting train|This passenger design leans through curves to allow higher speeds.
gauge|This measurement is the distance between the inner faces of the two rails.
pantograph|This roof-mounted device collects power from overhead wires.
bogie|This wheeled frame under a rail vehicle pivots beneath the car body.
switchback|This zigzag rail layout helps trains climb steep terrain.
maglev|This train technology uses magnetic levitation instead of steel wheels on rails.
cab signaling|This system displays movement authority inside the driver's compartment.
dynamic braking|This method slows a train by using traction motors as generators.
banking engine|This extra locomotive helps push a heavy train up a grade.
loading gauge|This profile limits how tall and wide rail vehicles can be.
continuous welded rail|This track construction reduces joint gaps and the clickety-clack sound.
ERTMS|This European standard coordinates train protection and signaling.
positive train control|This safety system can automatically slow or stop trains to prevent collisions.
Scharfenberg coupler|This automatic coupling type is common on multiple-unit passenger trains.
distributed power|This freight practice places remote-controlled locomotives within or at the rear of a train.
`, '', 5);

facts('r1', 'Ships & Navigation', 'general', ['ships','navigation','transportation'], `
anchor|This heavy device grips the seabed to hold a vessel in place.
life jacket|This safety garment helps keep a person afloat in water.
harbor pilot|This local expert guides large vessels through difficult port waters.
ferry|This vessel carries passengers or vehicles across a regular water route.
dry dock|This basin can be drained so a ship's hull can be repaired.
keel|This central structural member runs along the bottom of a ship.
bowline|This knot forms a fixed loop that is useful aboard boats.
bulkhead|This interior wall divides compartments inside a vessel.
starboard|This nautical direction means the right-hand side when facing forward.
bilge pump|This device removes water from the lowest part of a boat.
sextant|This instrument measures angles between celestial bodies and the horizon.
dead reckoning|This navigation method estimates position from course, speed, and elapsed time.
chartplotter|This electronic device displays position on a marine chart.
trimaran|This boat design uses one main hull and two smaller outrigger hulls.
ballast tank|This compartment can be filled or emptied to control stability or depth.
Plimsoll line|This mark shows the maximum safe loading level for a merchant ship.
azimuth thruster|This steerable propeller unit can rotate to direct thrust.
great circle route|This shortest path on a globe often curves on flat maps.
freeboard|This distance runs from the waterline to the main deck edge.
marine chronometer|This precise clock helped sailors determine longitude at sea.
gyrocompass|This nonmagnetic compass finds true north using Earth's rotation.
AIS transponder|This device broadcasts a ship's identity, position, course, and speed.
bulbous bow|This rounded underwater projection can reduce wave-making drag.
heaving-to|This sailing maneuver settles a vessel nearly stopped in rough weather.
tonnage|This measurement in shipping often refers to internal volume rather than weight.
`, '', 5);

facts('r1', 'Famous Firsts', 'history_civics', ['firsts','history'], `
Senda Berenson|This physical educator adapted basketball rules for women at Smith College in the 1890s.
Alice Coachman|This high jumper became the first Black woman to win Olympic gold.
Maggie Gee|This pilot became one of two Chinese American women in the Women Airforce Service Pilots.
Norma Merrick Sklarek|This architect became the first Black woman licensed as an architect in New York.
Shirley Chisholm|This New York representative became the first Black woman elected to the U.S. Congress.
Sirimavo Bandaranaike|This Sri Lankan politician became the world's first female prime minister.
Sandra Day O'Connor|This jurist became the first woman on the U.S. Supreme Court.
Benazir Bhutto|This Pakistani politician became the first woman to lead a Muslim-majority country.
Tenzing Norgay|This Sherpa mountaineer reached Everest's summit with Edmund Hillary in 1953.
Gertrude Ederle|This swimmer became the first woman to swim the English Channel.
Bessie Coleman|This aviator became the first African American woman to earn a pilot's license.
Hiram Revels|This Mississippi politician became the first Black U.S. senator.
Althea Gibson|This tennis player became the first Black athlete to win Wimbledon singles.
Arati Saha|This Indian swimmer became the first Asian woman to swim the English Channel.
Sally Ride|This physicist became the first American woman in space.
Annie Edson Taylor|This teacher became the first person known to survive going over Niagara Falls in a barrel.
Arnaldo Tamayo Mendez|This Cuban pilot became the first person of African heritage to travel in space.
Guion Bluford|This Air Force pilot became the first Black American to travel in space.
Michaelle Jean|This broadcaster became Canada's first Black governor general.
Roberta Bondar|This neurologist became Canada's first woman astronaut.
Mary Simon|This Inuk leader became Canada's first Indigenous governor general.
Kamala Harris|This politician became the first woman to serve as U.S. vice president.
Sian Proctor|This geoscientist became the first Black woman to pilot a spacecraft.
Wally Funk|This aviator became the oldest person to reach space at the time in 2021.
Jessica Meir|This astronaut took part in the first all-woman spacewalk.
`, '', 5);

facts('r1', 'Olympic Games', 'sports', ['olympics','sports'], `
torch relay|This pre-Games tradition carries a flame from Olympia toward the host city.
opening ceremony|This event includes the parade of nations before competition begins.
podium|This platform is where medalists stand after an event.
medal table|This ranking compares countries by gold, silver, bronze, or total medals.
Olympic Village|This temporary residence houses athletes during the Games.
skeleton|This winter sliding sport sends athletes headfirst down an icy track.
Nordic combined|This winter sport pairs ski jumping with cross-country skiing.
short track speed skating|This indoor racing sport uses tight turns on a hockey-sized rink.
snowboard cross|This event sends several riders down a course with jumps and banked turns.
race walking|This athletics event requires one foot to appear in contact with the ground.
mixed relay|This race format combines athletes of different genders on one team.
boulder and lead combined|This climbing format totals performance on problems and tall-route attempts.
Madison|This team track cycling race uses hand slings between partners.
sport climbing|This Olympic sport combines wall events such as speed, bouldering, and lead.
breaking|This dance sport made its Olympic debut at Paris 2024.
modern pentathlon|This sport was inspired by skills of a 19th-century cavalry officer.
Olympic Charter|This document sets out the rules and principles of the Olympic movement.
Youth Olympic Games|This event for younger athletes began in Singapore in 2010.
Ekecheiria|This ancient Greek truce was associated with safe passage to the Games.
Coubertin|This baron helped revive the modern Olympics in the 1890s.
Nadia Comaneci|This gymnast received the first perfect 10 in Olympic gymnastics.
Abebe Bikila|This Ethiopian runner won the 1960 marathon while running barefoot.
Kipchoge Keino|This Kenyan runner won the 1500 meters at altitude in Mexico City.
Fanny Blankers-Koen|This Dutch athlete won four track golds in 1948.
Ireen Wust|This Dutch speed skater became the first athlete to win individual gold at five Winter Olympics.
`, '', 5);

facts('r1', 'Hockey', 'sports', ['hockey','sports'], `
bench minor|This team penalty is served by a player chosen from the ice.
goal horn|This arena sound often blasts immediately after the home team scores.
secondary assist|This stat credits the pass before the primary setup on a goal.
red line|This center marking divides the rink and matters for icing.
rink glass|This transparent barrier rises above the boards around the playing surface.
blue line|This rink marking helps determine offside.
slapshot|This hard shot uses a big windup and stick flex.
penalty kill|This defensive situation happens while a team is short-handed.
empty net|This late-game situation occurs when a goalie is pulled for an extra skater.
line change|This substitution can happen while play continues.
hybrid icing|This rule lets an official stop play based on who is likely to reach the puck first.
dump and chase|This tactic sends the puck deep so attackers can race after it.
gap control|This defensive skill manages space between a defender and an attacking player.
net-front traffic|This tactic places bodies near the goalie to block sightlines and hunt rebounds.
quick release|This shooting skill gets the puck away before a goalie can fully set.
trap defense|This system clogs the neutral zone to slow attacks.
butterfly style|This goaltending method drops the knees and spreads the pads.
odd-man rush|This attack gives the puck carrier's team more skaters than defenders.
delayed penalty|This call lets play continue until the offending team gains possession.
Gordie Howe hat trick|This unofficial feat combines a goal, an assist, and a fight.
neutral zone|This central rink area lies between the two blue lines.
short-handed goal|This score is made by the team serving a penalty.
wraparound|This scoring attempt carries the puck behind the net and quickly out front.
five-hole|This goalie target is the gap between the pads.
point shot|This shot comes from a defender near the blue line.
`, '', 5);

skipManual('r2', 'Political Systems', 'history_civics', ['politics','civics'], `
asymmetric federalism|This arrangement gives some regions powers or status that others do not have.
reserved powers|These authorities are kept for a level of government under a constitution.
grand coalition|This cabinet joins major rival parties in one governing arrangement.
ceremonial monarchy|This arrangement leaves a royal figure mainly symbolic duties.
citizens' assembly|This selected public body studies issues and recommends reforms.
party-list system|This ballot model assigns seats from ranked slates submitted by parties.
runoff election|This follow-up vote is held when no candidate reaches the required threshold.
confidence and supply|This agreement supports budgets and survival votes without joining cabinet.
revising chamber|This legislative body scrutinizes bills after another house has passed them.
mutual veto|This power-sharing device lets communities block measures seen as vital threats.
confidence vote|This parliamentary test can determine whether a government stays in office.
shadow cabinet|This opposition team mirrors government portfolios.
judicial review|This power lets courts assess whether laws comply with higher law.
single transferable vote|This ranked system can elect multiple representatives in a district.
constructive vote of no confidence|This rule removes a government only when a replacement is chosen.
semi-presidential system|This model has both a president and a prime minister with real executive roles.
consociationalism|This power-sharing model manages deeply divided societies through group guarantees.
devolution|This process transfers powers from a central government to regional bodies.
caretaker government|This temporary administration handles duties during transitions or elections.
sovereignty|This concept means ultimate legal authority within a territory.
cohabitation|This situation has a president and prime minister from opposing parties.
gerrymandering|This practice manipulates district boundaries for political advantage.
closed list|This proportional ballot type lets parties set the order of candidates.
unicameralism|This legislative structure uses a single chamber.
quorum|This minimum attendance is required for a body to conduct business.
`, '', 5);
skipManual('r2', 'Political Systems', `
2|What is the alternative vote?|This ballot method lets voters order candidates by preference.
`);

facts('r2', 'Medical Terms', 'stem', ['medicine','health','science'], `
diagnosis|This term means identifying a disease or condition.
prognosis|This term predicts the likely course or outcome of an illness.
vaccine|This preparation trains the immune system against a pathogen.
antibiotic|This medicine fights bacterial infections, not viral ones.
inflammation|This response can cause redness, heat, swelling, and pain.
hypertension|This condition means persistently high blood pressure.
anemia|This condition involves too few red blood cells or too little hemoglobin.
biopsy|This procedure removes tissue for examination.
placebo|This inactive treatment is used as a comparison in trials.
triage|This process prioritizes care based on urgency.
endoscopy|This procedure uses a camera-equipped tube to view inside the body.
ischemia|This condition means inadequate blood supply to tissue.
sepsis|This dangerous syndrome is a bodywide response to infection.
edema|This swelling results from excess fluid in tissues.
arrhythmia|This term means an abnormal heart rhythm.
contraindication|This factor makes a treatment inadvisable.
comorbidity|This term means an additional disease present with a primary condition.
iatrogenic|This adjective describes harm caused by medical treatment.
nosocomial infection|This infection is acquired in a hospital or health-care setting.
tachycardia|This term means an unusually fast heart rate.
bradycardia|This term means an unusually slow heart rate.
aphasia|This language disorder can follow damage to speech-related brain areas.
embolism|This blockage travels through the bloodstream before lodging in a vessel.
dyspnea|This medical term means difficult or labored breathing.
homeostasis|This process maintains stable internal conditions.
`, '', 5);

skipManual('r2', 'Big Ideas in Physics', 'stem', ['physics','science'], `
inertia|This property makes matter resist changes in motion.
entropy|This quantity is often linked with disorder and energy dispersal.
relativity|This theory connects space, time, motion, and gravity.
quantum mechanics|This theory describes matter and energy at very small scales.
conservation of energy|This principle says energy changes form but total amount remains constant.
wave-particle duality|This idea says light and matter can show both wave and particle behavior.
uncertainty principle|This principle limits simultaneous precision of position and momentum.
equivalence principle|This idea says gravitational and inertial mass behave the same.
superposition|This quantum idea allows systems to combine possible states before measurement.
dark matter|This unseen matter is inferred from gravity in galaxies and clusters.
Noether's theorem|This result links symmetries with conservation laws.
renormalization|This method tames infinities in some quantum field calculations.
spontaneous symmetry breaking|This idea explains how underlying symmetry can yield asymmetric states.
gauge theory|This framework underlies modern descriptions of fundamental forces.
Bose-Einstein condensate|This state of matter forms when bosons occupy one quantum state.
blackbody radiation|This spectrum comes from an ideal absorber and emitter of heat.
Casimir effect|This quantum effect produces a tiny force between close conducting plates.
Mach's principle|This idea links local inertia to the distribution of distant matter.
Pauli exclusion principle|This rule prevents identical fermions from sharing the same quantum state.
Higgs mechanism|This process gives certain particles mass through interaction with a field.
Bell's theorem|This result rules out broad classes of local hidden-variable theories.
cosmic inflation|This proposed early burst of expansion helps explain a smooth universe.
quantum tunneling|This phenomenon lets particles pass barriers they classically lack energy to cross.
phase transition|This change shifts matter between states such as solid and liquid.
standard model|This framework describes known elementary particles and three fundamental forces.
`, '', 5);

skipManual('r2', 'Software History', 'stem', ['software','technology','history'], `
FORTRAN|This early high-level language was built for scientific computing.
COBOL|This business-oriented language was designed for readable data processing.
UNIX|This operating system from Bell Labs influenced Linux and macOS.
VisiCalc|This spreadsheet program helped make the Apple II a business machine.
Lotus 1-2-3|This spreadsheet dominated many IBM PC offices in the 1980s.
GNU Project|This free-software effort began under Richard Stallman in 1983.
Linux kernel|This open-source kernel was first released by Linus Torvalds.
Mosaic|This early graphical web browser popularized browsing in the 1990s.
Java|This language was promoted with the phrase write once, run anywhere.
Python|This language is named for a British comedy group rather than a snake.
Smalltalk|This object-oriented language influenced modern graphical interfaces.
HyperCard|This Apple software let users build stacks of linked cards.
Emacs|This extensible editor became a famous project in the free-software world.
Perl|This scripting language was widely used for early web programming and text processing.
Ruby on Rails|This framework helped popularize convention over configuration.
Git|This distributed version-control system was created for Linux kernel development.
Docker|This platform popularized containerized application deployment.
Kubernetes|This system orchestrates containers across clusters.
Node.js|This runtime brought JavaScript to server-side programming.
TensorFlow|This Google-backed library became prominent in machine learning.
Ada language|This language was named for a 19th-century computing pioneer.
ALGOL|This language family strongly influenced later syntax and programming-language design.
Erlang|This language was created at Ericsson for fault-tolerant telecom systems.
PostgreSQL|This open-source database descends from the POSTGRES project at Berkeley.
Apache HTTP Server|This web server was a major engine of the early public web.
`, '', 5);

facts('r2', 'Spacecraft', 'stem', ['spacecraft','space','science'], `
capsule|This crewed spacecraft shape returns astronauts inside a compact reentry vehicle.
orbiter|This spacecraft is designed to circle a planet or moon.
lander|This spacecraft is built to touch down on a surface.
heat shield|This protective layer absorbs or sheds intense reentry heating.
solar panel|This spacecraft component converts sunlight into electrical power.
reaction wheel|This spinning device helps control spacecraft attitude.
star tracker|This camera system identifies stars to determine orientation.
ion thruster|This efficient engine accelerates charged particles for gentle continuous thrust.
service module|This spacecraft section supplies power, propulsion, and life-support resources.
escape tower|This rocket system can pull a crew capsule away during launch emergencies.
cryogenic propellant|This very cold fuel or oxidizer must be kept at low temperature.
aerobraking|This technique uses atmospheric drag to reduce orbital energy.
gravity assist|This maneuver uses a planet's motion to change a spacecraft's speed or path.
reaction control system|This set of small thrusters controls orientation and fine movement.
sample return capsule|This small reentry vehicle brings collected material back to Earth.
solar sail|This propulsion concept uses pressure from sunlight.
Hall-effect thruster|This electric engine uses crossed fields to accelerate ions.
radioisotope thermoelectric generator|This power source converts heat from radioactive decay into electricity.
Lagrange point|This gravitational location can let spacecraft maintain stable relative positions.
orbital insertion burn|This maneuver slows a spacecraft enough to be captured by a destination.
ablative material|This heat-shield substance chars or vaporizes to carry heat away.
gimbaled engine|This steerable rocket engine helps control direction during thrust.
deep-space network|This system of large antennas communicates with distant missions.
pressurized rover|This vehicle lets astronauts travel farther while staying in a livable cabin.
transfer orbit|This elliptical path moves a spacecraft from one orbit to another.
`, '', 5);
supplement('r2', 'Spacecraft', `
4|What is a sun sensor?|This attitude device detects the direction of sunlight for spacecraft orientation.
`);

// These broad additions are populated entirely by the researched expansion packs below.
addCategory('r2', 'Political Systems', 'history_civics', ['politics','civics'], []);
addCategory('r2', 'Big Ideas in Physics', 'stem', ['physics','science'], []);
addCategory('r2', 'Software History', 'stem', ['software','technology','history'], []);

const manualTopoffPath = path.join(root, 'data/jeopardy-bank/manual-existing-category-topoff.tsv');
loadManualTopoff(manualTopoffPath);

const researchedExpansionNames = fs.readdirSync(path.join(root, 'data/jeopardy-bank'))
  .filter((name) => /^researched-expansion-\d+\.tsv$/u.test(name))
  .sort();
const expectedResearchedExpansionNames = Array.from(
  { length: 14 },
  (_, index) => `researched-expansion-${String(index + 1).padStart(2, '0')}.tsv`
);
if (JSON.stringify(researchedExpansionNames) !== JSON.stringify(expectedResearchedExpansionNames)) {
  throw new Error(`Expected researched packs ${expectedResearchedExpansionNames.join(', ')}; found ${researchedExpansionNames.join(', ') || 'none'}.`);
}
const researchedExpansionFiles = researchedExpansionNames
  .map((name) => path.join(root, 'data/jeopardy-bank', name));
for (const filePath of researchedExpansionFiles) loadAuthoredExpansion(filePath);

const regularClues = categories.reduce((sum, category) => sum + [...category.slots.values()].reduce((slotSum, slot) => slotSum + slot.length, 0), 0);
const roundClues = Object.fromEntries(['r1', 'r2'].map((round) => [
  round,
  categories
    .filter((category) => category.round === round)
    .reduce((sum, category) => sum + [...category.slots.values()].reduce((slotSum, slot) => slotSum + slot.length, 0), 0)
]));
if (categories.length < 70) throw new Error(`Expected at least 70 regular categories, built ${categories.length}`);
if (categories.filter((category) => category.round === 'r1').length < 35) throw new Error('Expected at least 35 Round One categories.');
if (categories.filter((category) => category.round === 'r2').length < 35) throw new Error('Expected at least 35 Double Jeopardy categories.');
if (regularClues < targetRegularClues) throw new Error(`Expected at least ${targetRegularClues} regular clues, built ${regularClues}`);
for (const round of ['r1', 'r2']) {
  const target = Math.ceil(initialCounts[round] * minimumRoundGrowth);
  if (roundClues[round] < target) throw new Error(`${round} needs at least ${target} clues for substantial growth; built ${roundClues[round]}.`);
}
for (const category of categories) {
  for (const value of values[category.round]) {
    const count = category.slots.get(value).length;
    if (count < minimumCluesPerValue) throw new Error(`${category.title} ${category.round} $${value} has only ${count} usable clues.`);
  }
}
if (finals.length < 200) throw new Error(`Expected at least 200 Final clues, built ${finals.length}`);
if (new Set(finals.map((final) => final.category)).size < 20) throw new Error('Expected at least 20 Final categories.');
const upstreamFiles = [
  __filename,
  path.join(root, 'data/jeopardy-bank/original-answer-blacklist.json'),
  path.join(root, 'data/jeopardy-bank/pre-expansion-tracking.json'),
  manualTopoffPath,
  ...authoredInputFiles
];
const upstreamHash = sourceDigest(upstreamFiles);
const lines = [
  '# Generated by tools/generate-jeopardy-classroom-bank.cjs',
  `# Upstream SHA-256: ${upstreamHash}`,
  '# Regular category rows use: value<TAB>difficulty<TAB>clue<TAB>response',
  '# Final category rows use: difficulty<TAB>clue<TAB>response'
];
for (const category of categories) {
  const header = ['REGULAR', category.round, category.title, category.family, category.tags.join(','), category.packKey || ''];
  lines.push(header.join('\t').replace(/\t$/, ''));
  for (const value of values[category.round]) {
    const band = difficulty[category.round][value];
    category.slots.get(value).forEach((item, index) => {
      const score = Number.isInteger(item.difficulty)
        ? item.difficulty
        : band[Math.min(index, band.length - 1)];
      lines.push([value, score, item.clue, item.response].join('\t'));
    });
  }
  lines.push('END');
}
const byFinalCategory = new Map();
for (const final of finals) {
  if (!byFinalCategory.has(final.category)) byFinalCategory.set(final.category, []);
  byFinalCategory.get(final.category).push(final);
}
for (const [category, clues] of byFinalCategory) {
  lines.push(['FINAL', category].join('\t'));
  for (const clue of clues) lines.push([clue.difficulty, clue.clue, clue.response].join('\t'));
  lines.push('END');
}
fs.writeFileSync(path.join(root, 'data/jeopardy-bank/expanded-bank.tsv'), lines.join('\n') + '\n');
console.log(JSON.stringify({
  regularCategories: categories.length,
  regularClues,
  finalClues: finals.length,
  uniqueAnswers: usedAnswers.size,
  authoredExpansionFiles: researchedExpansionFiles.length,
  upstreamHash
}, null, 2));
