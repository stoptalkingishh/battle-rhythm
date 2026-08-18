#!/usr/bin/env node
/** Generate original, editable SVG technical plates from the exercise source and card manifest. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exercisesPath = path.join(root, 'js/data/exercises.js');
const manifestPath = path.join(root, 'assets/plates/workout-cards.json');
const svgDir = path.join(root, 'assets/plates/svg');
const cardsPath = path.join(root, 'js/data/workout-cards.js');
const allowedPoses = new Set(['hinge', 'squat', 'bench', 'hang', 'standing-press', 'jump', 'run', 'sprint', 'shuttle', 'ruck', 'sled', 'floor-press', 'floor-hold', 'supine-core', 'mobility', 'prone']);
const allowedEquipment = new Set(['none', 'barbell', 'pull-up-bar', 'kettlebell', 'sled', 'ruck', 'lane-marker', 'hill', 'machine', 'cable', 'band', 'mat']);

function loadExercises() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(exercisesPath, 'utf8'), context, { filename: exercisesPath });
  if (!Array.isArray(context.window.BR_EXERCISES)) throw new Error('exercises.js did not define window.BR_EXERCISES');
  return context.window.BR_EXERCISES;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function poseGeometry(pose, variant) {
  const figures = {
    hinge: '<circle cx="370" cy="132" r="20" class="skin"/><path d="M355 155L430 202 478 258 441 285 388 230 337 196Z" class="body"/><path d="M442 276l48 64-12 51h-29l4-43-43-46zM424 278l-31 72-48 35-20-16 41-57 24-66z" class="body"/><path d="M378 194l45 76 52 46" class="limb"/><path d="M356 187l35 92 43 34" class="limb"/>',
    squat: '<circle cx="375" cy="112" r="20" class="skin"/><path d="M350 137h52l25 108-74 0z" class="body"/><path d="M365 241l-58 48 17 89h31l2-63 40-28zM410 241l64 45-4 91h-31l-7-62-48-29z" class="body"/><path d="M350 156l-52 74M402 156l61 70" class="limb"/>',
    bench: '<circle cx="252" cy="264" r="19" class="skin"/><path d="M275 246l116 7 65 29-16 38-111-21-63-7z" class="body"/><path d="M425 306l57 47 49-1 2 22-69 6-68-51zM347 294l28 78-32 10-40-76z" class="body"/><path d="M331 254l35-52M365 255l38-50" class="limb"/><path d="M214 322H519" class="ground"/>',
    hang: '<path d="M275 80H485" class="prop"/><circle cx="380" cy="135" r="19" class="skin"/><path d="M352 158h55l10 102-74 0z" class="body"/><path d="M361 252l-30 117h30l25-95 22 95h30l-30-117z" class="body"/><path d="M357 168l-47-73M405 168l45-73" class="limb"/>',
    'standing-press': '<circle cx="372" cy="112" r="20" class="skin"/><path d="M344 137h57l17 114h-86z" class="body"/><path d="M352 246l-24 126h30l18-94 17 94h30l-24-126z" class="body"/><path d="M350 157l-20-67M397 157l21-67" class="limb"/>',
    jump: '<circle cx="370" cy="112" r="20" class="skin"/><path d="M343 138h58l14 96h-84z" class="body"/><path d="M357 227l-63 54 18 22 82-42M402 226l48 57-16 21-62-39" class="limb"/><path d="M349 151l-61 38M398 151l58 37" class="limb"/>',
    run: '<circle cx="370" cy="121" r="20" class="skin"/><path d="M342 146l58-6 26 92-77 10z" class="body"/><path d="M365 234l-67 96h-42l61-113M407 230l82 55-12 31-104-54" class="limb"/><path d="M350 159l-63 42M400 160l62 35" class="limb"/>',
    sprint: '<circle cx="340" cy="151" r="19" class="skin"/><path d="M331 172l61 21 52 56-62 27-67-42z" class="body"/><path d="M388 267l-72 106h-47l72-121M401 257l95 21-5 32-112-15" class="limb"/><path d="M343 186l-64 15M392 202l64 39" class="limb"/>',
    shuttle: '<circle cx="340" cy="151" r="19" class="skin"/><path d="M331 172l61 21 52 56-62 27-67-42z" class="body"/><path d="M388 267l-72 106h-47l72-121M401 257l95 21-5 32-112-15" class="limb"/><path d="M343 186l-55 80M392 202l73 23" class="limb"/>',
    ruck: '<circle cx="370" cy="121" r="20" class="skin"/><rect x="397" y="153" width="48" height="76" rx="8" class="pack"/><path d="M342 146l58-6 26 92-77 10z" class="body"/><path d="M365 234l-47 126h31l34-86 34 86h31l-41-126z" class="body"/><path d="M350 159l-34 70M400 160l43 64" class="limb"/>',
    sled: '<circle cx="302" cy="152" r="19" class="skin"/><path d="M291 173l58 21 57 59-65 24-61-47z" class="body"/><path d="M348 264l-66 104h-39l67-119M358 259l87 48-12 29-100-46" class="limb"/><path d="M309 188l92 40M344 201l70 40" class="limb"/>',
    'floor-press': '<circle cx="244" cy="264" r="19" class="skin"/><path d="M270 245l120 15 65 40-23 31-103-29-62-8z" class="body"/><path d="M422 313l72 47-11 24-92-45M345 299l27 77-31 8-42-76" class="limb"/><path d="M326 254l48-35M361 257l51-31" class="limb"/><path d="M201 331H525" class="ground"/>',
    'floor-hold': '<circle cx="260" cy="260" r="19" class="skin"/><path d="M286 242l112 8 71 28-18 38-118-20-62-5z" class="body"/><path d="M440 302l71 44-10 24-87-38M348 295l-27 71h-29l20-88" class="limb"/><path d="M324 250l-34 65M364 251l42 60" class="limb"/><path d="M205 370H530" class="ground"/>',
    'supine-core': '<circle cx="250" cy="288" r="19" class="skin"/><path d="M274 270l108-34 56 44-25 35-89 18-61-12z" class="body"/><path d="M397 302l70 51 42-10 8 25-64 23-85-59M325 324l35 55-27 16-58-62" class="limb"/><path d="M320 271l30-68M350 260l45-59" class="limb"/><path d="M200 392H535" class="ground"/>',
    mobility: '<circle cx="370" cy="115" r="20" class="skin"/><path d="M343 140h58l15 104h-85z" class="body"/><path d="M357 237l-64 113h34l46-75 24 75h33l-39-113z" class="body"/><path d="M350 155l-45-70M398 155l48-70" class="limb"/>',
    prone: '<circle cx="240" cy="273" r="19" class="skin"/><path d="M267 253l123 10 72 22-15 38-118-13-65-10z" class="body"/><path d="M430 302l80 42-12 25-96-39M342 302l21 70-29 10-37-73" class="limb"/><path d="M322 260l42-45M357 262l57-34" class="limb"/><path d="M200 382H530" class="ground"/>'
  };
  let figure = figures[pose];
  if (!figure) throw new Error(`No geometry for pose ${pose}`);
  if (pose === 'jump' && variant === 'tuck') figure = figure.replace('l-63 54 18 22 82-42', 'l-34 16 9 25 52-7');
  if (pose === 'mobility' && variant === 'windmill') figure = figure.replace('l-45-70', 'l-83 47');
  return figure;
}

function equipmentGeometry(equipment, pose, variant) {
  if (equipment === 'barbell') {
    if (pose === 'bench') return '<path d="M270 194H474" class="bar"/><circle cx="282" cy="194" r="17" class="plate"/><circle cx="462" cy="194" r="17" class="plate"/><rect x="300" y="324" width="148" height="13" rx="4" class="bench"/><path d="M320 337v37M428 337v37" class="prop"/>';
    if (pose === 'hinge') return '<path d="M285 321H500" class="bar"/><circle cx="300" cy="321" r="17" class="plate"/><circle cx="485" cy="321" r="17" class="plate"/>';
    if (pose === 'squat') return '<path d="M278 145H470" class="bar"/><circle cx="293" cy="145" r="17" class="plate"/><circle cx="455" cy="145" r="17" class="plate"/>';
    return '<path d="M270 82H474" class="bar"/><circle cx="282" cy="82" r="17" class="plate"/><circle cx="462" cy="82" r="17" class="plate"/>';
  }
  if (equipment === 'kettlebell') return '<path d="M397 314v-18c0-24 38-24 38 0v18" class="prop"/><circle cx="416" cy="329" r="27" class="plate"/>';
  if (equipment === 'sled') return '<path d="M454 294h83l18 56h-92zM470 294l-31-63M513 294l-18-63" class="prop"/><path d="M445 354h122" class="ground"/>';
  if (equipment === 'lane-marker') return '<path d="M150 365H590" class="ground"/><path d="M185 342v30M535 342v30" class="accent"/>';
  if (equipment === 'hill') return '<path d="M115 364l154-88 100 47 97-82 124 123z" class="hill"/>';
  if (variant === 'machine-session') return '<path d="M500 170v166M500 170h72l-22 48h-50M500 278h66l29 57M520 278l-26 57" class="prop"/><circle cx="550" cy="350" r="18" class="plate"/>';
  if (equipment === 'machine') return '<path d="M96 96v228h30V96zM138 120h30v60h-30zM138 220h30v60h-30z" class="prop"/><path d="M96 96v228M96 96h168" class="prop"/>';
  if (equipment === 'cable') return '<path d="M126 86h80M126 86v40h16l-8 178M214 86l-20 34h16l-8 144" class="prop"/><rect x="126" y="250" width="52" height="14" rx="4" class="plate"/>';
  if (equipment === 'band') return '<path d="M400 312v-28c0-24 34-24 34 0v28" class="prop"/><path d="M400 312h34" class="prop"/>';
  if (equipment === 'mat') return '<rect x="110" y="352" width="430" height="12" rx="6" class="bench"/><path d="M110 352h430" class="ground"/>';
  return '';
}

function svg(card, exercise) {
  const title = escapeXml(exercise.name.toUpperCase());
  const desc = escapeXml(`${exercise.name} technical plate: athletic male figure in a ${card.pose} pose with ${card.equipment === 'none' ? 'no equipment' : card.equipment.replaceAll('-', ' ')}. Target regions: ${card.targets.join(', ')}.`);
  const targets = card.targets.slice(0, 4).map((target, index) => `<g transform="translate(48 ${290 + index * 23})"><rect width="10" height="10" rx="2" fill="${['#cf5368','#e18a52','#57c5cf','#d5a34d'][index]}"/><text x="18" y="9" class="small">${escapeXml(target.toUpperCase())}</text></g>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Original editable SVG workout card. Generated by scripts/generate-workout-cards.mjs. -->
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420" role="img" aria-labelledby="plate-title plate-desc">
  <title id="plate-title">${title}</title>
  <desc id="plate-desc">${desc}</desc>
  <defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#29405d" stroke-width="1" opacity=".6"/></pattern><style>.label{fill:#e8edf2;font-family:Arial,Helvetica,sans-serif}.small{fill:#9eb2c8;font:11px Arial,Helvetica,sans-serif;letter-spacing:1.2px}.body{fill:#627a8d;stroke:#b2c1cc;stroke-width:2;stroke-linejoin:round}.skin{fill:#8196a5;stroke:#b2c1cc;stroke-width:2}.limb{fill:none;stroke:#71899b;stroke-width:18;stroke-linecap:round;stroke-linejoin:round}.prop{fill:none;stroke:#c6d0d9;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}.bar{fill:none;stroke:#d4dde4;stroke-width:6}.plate{fill:#3e5972;stroke:#aab9c6;stroke-width:2}.pack{fill:#3d5771;stroke:#aab9c6;stroke-width:2}.bench{fill:#3d5771;stroke:#aab9c6;stroke-width:2}.ground{fill:none;stroke:#49637f;stroke-width:2}.accent{fill:none;stroke:#d19a3e;stroke-width:4}.hill{fill:#1a304b;stroke:#49637f;stroke-width:2}</style></defs>
  <rect width="720" height="420" fill="#0c1b31"/><rect width="720" height="420" fill="url(#grid)"/><path d="M36 76H684M36 390H684" class="ground"/><path d="M360 88V378" stroke="#29445f" stroke-width="1" stroke-dasharray="4 8"/>
  <g id="title-block"><text x="36" y="43" class="label" font-size="23" font-weight="700" letter-spacing="1.5">${title}</text><text x="38" y="63" class="small">${escapeXml(card.pose.toUpperCase().replaceAll('-', ' '))} / ${escapeXml(card.variant.toUpperCase().replaceAll('-', ' '))}</text><path d="M36 73H230" class="accent"/><text x="583" y="43" class="small">PLATE ${escapeXml(card.id.toUpperCase())}</text></g>
  <g id="equipment">${equipmentGeometry(card.equipment, card.pose, card.variant)}</g><g id="athlete">${poseGeometry(card.pose, card.variant)}</g>
  <g id="anatomy-targets" opacity=".88"><ellipse cx="378" cy="194" rx="26" ry="40" fill="#57c5cf"/><ellipse cx="385" cy="245" rx="27" ry="18" fill="#cf5368"/><path d="M350 251l-28 83 18 7 36-75zM404 251l30 79 18-8-31-78z" fill="#e18a52"/><path d="M350 158l-18 49 16 7 20-47z" fill="#d5a34d"/></g>
  <g id="target-legend"><rect x="36" y="270" width="170" height="108" rx="5" fill="#10233b" stroke="#3d5976"/><text x="48" y="287" class="label" font-size="11" font-weight="700" letter-spacing="1">TARGET REGIONS</text>${targets}</g>
  <text x="519" y="374" class="small">ORIGINAL VECTOR PLATE</text>
</svg>
`;
}

function validate(exercises, cards) {
  const ids = exercises.map(exercise => exercise.id);
  const cardIds = cards.map(card => card.id);
  if (ids.length !== cardIds.length) throw new Error(`Exercise count (${ids.length}) must match manifest card count (${cards.length})`);
  if (new Set(cardIds).size !== cardIds.length) throw new Error('Manifest contains duplicate IDs');
  const missing = ids.filter(id => !cardIds.includes(id));
  const extra = cardIds.filter(id => !ids.includes(id));
  if (missing.length || extra.length) throw new Error(`ID parity failed; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`);
  for (const card of cards) {
    if (!allowedPoses.has(card.pose)) throw new Error(`${card.id}: invalid pose ${card.pose}`);
    if (!allowedEquipment.has(card.equipment)) throw new Error(`${card.id}: invalid equipment ${card.equipment}`);
    if (!Array.isArray(card.targets) || !card.targets.length) throw new Error(`${card.id}: targets must be a non-empty list`);
    if (typeof card.variant !== 'string' || !card.variant) throw new Error(`${card.id}: variant is required`);
  }
}

const exercises = loadExercises();
const cards = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
validate(exercises, cards);
fs.mkdirSync(svgDir, { recursive: true });
for (const card of cards) {
  if (card.id === 's1-deadlift') continue; // Reviewed custom override is intentionally retained.
  fs.writeFileSync(path.join(svgDir, `${card.id}.svg`), svg(card, exercises.find(exercise => exercise.id === card.id)));
}
const data = exercises.map(exercise => ({ id: exercise.id, src: `assets/plates/svg/${exercise.id}.svg`, alt: `${exercise.name} technical workout card` }));
fs.writeFileSync(cardsPath, `// Generated by scripts/generate-workout-cards.mjs.\nwindow.BR_WORKOUT_CARDS = ${JSON.stringify(data, null, 2)};\n`);
console.log(`Validated ${exercises.length} exercise IDs and ${cards.length} manifest cards: exact parity.`);
console.log(`Generated ${cards.length - 1} SVG cards; preserved custom override: s1-deadlift.svg.`);
console.log(`Emitted ${data.length} BR_WORKOUT_CARDS entries.`);
