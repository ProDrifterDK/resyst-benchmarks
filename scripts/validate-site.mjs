import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const srcFiles = [
  'src/index.html',
  'src/styles.css',
  'src/app.js',
  'src/background.js',
  'src/replay.js',
  'src/robots.txt',
  'src/_headers',
];
const distFiles = [
  'dist/index.html',
  'dist/arena/index.html',
  'dist/styles.css',
  'dist/background.js',
  'dist/replay.js',
  'dist/sitemap.xml',
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
  /prompt_snapshot/i,
  /Authorization:/i,
  /Bearer\s+/i,
  /sk-or-v1-/i,
];

async function readText(file) {
  return readFile(path.join(root, file), 'utf8');
}

for (const file of [...srcFiles, ...distFiles]) {
  const content = await readText(file);
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      throw new Error(`${file} contains forbidden public-context term: ${pattern}`);
    }
  }
}

await stat(path.join(root, 'src/assets/ResystLabs-Logo.png'));
await stat(path.join(root, 'dist/assets/ResystLabs-Logo.png'));

const html = await readText('dist/index.html');
for (const required of [
  'https://benchmarks.resyst.cl/',
  'Resyst Labs Benchmarks',
  'Resyst Arena',
  'Independent model evaluation',
  'assets/ResystLabs-Logo.png',
  'data/model-comparison.json',
  'data/arena-snapshots.json',
  'arena/',
]) {
  if (!html.includes(required)) throw new Error(`index.html missing required text: ${required}`);
}

const arenaHtml = await readText('dist/arena/index.html');
for (const required of [
  'Resyst Arena Replays',
  'Replay JSON',
  'replay.js',
  'data/replays/',
  'sanitized replay',
]) {
  if (!arenaHtml.includes(required)) throw new Error(`arena page missing required text: ${required}`);
}

const models = JSON.parse(await readText('src/data/model-comparison.json'));
const arena = JSON.parse(await readText('src/data/arena-snapshots.json'));

if (!Array.isArray(models.rows) || models.rows.length < 5) {
  throw new Error('model data must expose at least 5 ranked rows');
}
if (!models.rows.every((row) => row.label && row.basis && Number.isFinite(row.overall_rank ?? 999))) {
  throw new Error('each model row needs public label, basis and rank metadata');
}

const rankedRows = models.rows.filter((row) => Number.isFinite(row.overall_rank));
for (const row of rankedRows) {
  const modelPage = `dist/models/${row.id}/index.html`;
  const content = await readText(modelPage);
  for (const required of [row.label, 'Full / Agentic benchmark', 'Software engineering MVP', 'Runtime economics', '../../assets/ResystLabs-Logo.png']) {
    if (!content.includes(required)) throw new Error(`${modelPage} missing required text: ${required}`);
  }
}

if (!Array.isArray(arena.matches) || arena.matches.length < 1) {
  throw new Error('arena data must expose at least one match');
}
if (!arena.matches.every((match) => match.entrants?.A && match.entrants?.B && match.winner_label && match.artifacts?.public_replay)) {
  throw new Error('each arena match needs entrants, winner label, and public replay metadata');
}
for (const match of arena.matches) {
  const replayFile = `src/${match.artifacts.public_replay}`;
  const replayText = await readText(replayFile);
  if (/prompt_snapshot|prompt|completion|messages/i.test(replayText)) {
    throw new Error(`${replayFile} contains prompt/model-text fields; public replays must stay sanitized`);
  }
  const replay = JSON.parse(replayText);
  if (!Array.isArray(replay.frames) || replay.frames.length < 1) throw new Error(`${replayFile} has no replay frames`);
  await stat(path.join(root, 'dist', match.artifacts.public_replay));
}

console.log(`site contract ok: ${rankedRows.length} model pages, ${arena.matches.length} arena replays, official logo present`);
