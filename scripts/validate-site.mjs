import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const files = [
  'src/index.html',
  'src/styles.css',
  'src/app.js',
  'src/robots.txt',
  'src/_headers',
];

const forbidden = [
  /twitter/i,
  /tweet/i,
  /suspens(?:ion|ión|ded|ión)/i,
  /@ResystLabs/i,
  /ai\.resyst\.cl/i,
  /personal account/i,
  /cuenta personal/i,
  /journal/i,
  /paliativ[ao]/i,
];

for (const file of files) {
  const content = await readFile(path.join(root, file), 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      throw new Error(`${file} contains forbidden public-context term: ${pattern}`);
    }
  }
}

const html = await readFile(path.join(root, 'src/index.html'), 'utf8');
for (const required of [
  'https://benchmarks.resyst.cl/',
  'Resyst Labs Benchmarks',
  'Resyst Arena',
  'Independent model evaluation',
  'data/model-comparison.json',
  'data/arena-snapshots.json',
]) {
  if (!html.includes(required)) throw new Error(`index.html missing required text: ${required}`);
}

const models = JSON.parse(await readFile(path.join(root, 'src/data/model-comparison.json'), 'utf8'));
const arena = JSON.parse(await readFile(path.join(root, 'src/data/arena-snapshots.json'), 'utf8'));

if (!Array.isArray(models.rows) || models.rows.length < 5) {
  throw new Error('model data must expose at least 5 ranked rows');
}
if (!models.rows.every((row) => row.label && row.basis && Number.isFinite(row.overall_rank ?? 999))) {
  throw new Error('each model row needs public label, basis and rank metadata');
}
if (!Array.isArray(arena.matches) || arena.matches.length < 1) {
  throw new Error('arena data must expose at least one match');
}
if (!arena.matches.every((match) => match.entrants?.A && match.entrants?.B && match.winner_label)) {
  throw new Error('each arena match needs entrants and winner label');
}

console.log('site contract ok');
