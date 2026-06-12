import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.xml', '.txt', '.webmanifest']);
const publicSourceRoots = ['src', 'dist'];
const generatorFiles = ['scripts/build.mjs'];

const forbidden = [
  ['twitter reference', /twitter/i],
  ['tweet reference', /tweet/i],
  ['account suspension context', /suspens(?:ion|ión|ded|ión)/i],
  ['ResystLabs handle leak', /@ResystLabs/i],
  ['old ai.resyst.cl path', /ai\.resyst\.cl/i],
  ['personal-account context', /personal account|cuenta personal/i],
  ['journal context', /journal/i],
  ['palliative/workaround framing', /paliativ[ao]|palliative|workaround/i],
  ['prompt snapshot field', /prompt_snapshot|prompt snapshots?/i],
  ['secret-like authorization text', /Authorization:|Bearer\s+|sk-or-v1-/i],
  ['internal page-architecture rationale', /ranking surface|home page|main ranking/i],
  ['non-self-contained page reference', /\bthis page\b|\bthis row\b/i],
  ['raw private trace wording', /private model text traces/i],
  ['internal run flag', /exclude=false|reasoning effort xhigh/i],
  ['historical-row implementation note', /older rows|existing .*baseline/i],
];

async function readText(file) {
  return readFile(path.join(root, file), 'utf8');
}

async function listTextFiles(relativeDir) {
  const out = [];
  async function walk(dir) {
    const full = path.join(root, dir);
    for (const entry of await readdir(full, { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(rel);
      } else if (textExtensions.has(path.extname(entry.name))) {
        out.push(rel);
      }
    }
  }
  await walk(relativeDir);
  return out;
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const filesToScan = new Set(generatorFiles);
for (const dir of publicSourceRoots) {
  for (const file of await listTextFiles(dir)) filesToScan.add(file);
}

for (const file of filesToScan) {
  const content = await readText(file);
  for (const [label, pattern] of forbidden) {
    if (pattern.test(content)) {
      throw new Error(`${file} contains forbidden public-context term (${label}): ${pattern}`);
    }
  }
}

await stat(path.join(root, 'src/assets/ResystLabs-Logo.png'));
await stat(path.join(root, 'dist/assets/ResystLabs-Logo.png'));

const html = await readText('dist/index.html');
for (const required of [
  'https://benchmarks.resyst.cl/',
  'Resyst Labs Benchmarks',
  'Independent model evaluation',
  'assets/ResystLabs-Logo.png',
  'data/model-comparison.json',
  'data/arena-snapshots.json',
  'arena/',
  'Resyst Arena evaluates spatial strategy in deterministic turn-based games',
  'Local and API-backed systems share a single tournament view',
  'Scores are claims with receipts',
  'Public by design. Auditable by default.',
]) {
  if (!html.includes(required)) throw new Error(`index.html missing required self-contained content: ${required}`);
}

const sectionChecks = [
  ['#ranking', 'One table, visible tradeoffs.'],
  ['#arena', 'Resyst Arena evaluates spatial strategy'],
  ['#methodology', 'Separate lanes'],
  ['#evidence', 'versioned data artifacts'],
];
for (const [, expected] of sectionChecks) {
  if (!html.includes(expected)) throw new Error(`index.html section missing context phrase: ${expected}`);
}

const arenaHtml = await readText('dist/arena/index.html');
for (const required of [
  'Resyst Arena Replays',
  'Resyst Arena is a deterministic turn-based evaluation environment',
  'Replay JSON exposes board states, actions, events, and telemetry',
  'Replay JSON',
  'replay.js',
  'data/replays/',
]) {
  if (!arenaHtml.includes(required)) throw new Error(`arena page missing required self-contained content: ${required}`);
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
  for (const required of [
    row.label,
    'Public result card',
    'Overall score',
    'Full / Agentic benchmark',
    'Software engineering MVP',
    'Runtime economics',
    'The overall score is calculated from the Full/Agentic and SWE lanes',
    '../../assets/ResystLabs-Logo.png',
  ]) {
    if (!content.includes(required)) throw new Error(`${modelPage} missing required self-contained content: ${required}`);
  }
  const text = visibleText(content);
  for (const label of ['Overall score', 'Full / Agentic', 'SWE MVP', 'Measured cost', 'Runtime economics']) {
    if (!text.includes(label)) throw new Error(`${modelPage} missing visible metric label: ${label}`);
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
  if (/prompt_snapshot|\bprompt\b|completion|messages/i.test(replayText)) {
    throw new Error(`${replayFile} contains prompt/model-text fields; public replays must stay sanitized`);
  }
  const replay = JSON.parse(replayText);
  if (!Array.isArray(replay.frames) || replay.frames.length < 1) throw new Error(`${replayFile} has no replay frames`);
  await stat(path.join(root, 'dist', match.artifacts.public_replay));
}

console.log(`site contract ok: ${rankedRows.length} model pages, ${arena.matches.length} arena replays, self-contained copy verified, official logo present`);
