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
  ['internal run flag', /exclude=false|reasoning effort xhigh|xhigh text-actions|xhigh reasoning|SWE xhigh|reasoning_effort|max\/xhigh/i],
  ['historical-row implementation note', /older rows|existing .*baseline/i],
  ['internal agent/runtime label', /Hermes|openai-codex|AIAgent|OAuth/i],
  ['local/private path', /\/home\/|prodrifterdk|\.hermes|local-llm-bench/i],
  ['unpublished result path', /results\/|docs\/results|raw_artifact|source_artifact|generated_from|evidence_artifacts|raw\.jsonl|summary\.json|report\.md/i],
  ['non-public artifact wording', /artifact|public artifacts|data artifacts|artifact references|Synchronizing benchmark artifact|Pending artifact|public artifact could not be loaded/i],
  ['provider marketing shorthand without explanation', /Think Max/i],
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

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
    .map((match) => JSON.parse(match[1]));
}

async function assertCrawlerSafePng(file) {
  const buffer = await readFile(path.join(root, file));
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error(`${file} must be a PNG file`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer.readUInt8(24);
  const colorType = buffer.readUInt8(25);
  if (width !== 1200 || height !== 630) throw new Error(`${file} must be 1200x630 for link previews`);
  if (bitDepth !== 8 || colorType !== 2) throw new Error(`${file} must be 8-bit truecolor RGB PNG; got bitDepth=${bitDepth}, colorType=${colorType}`);
}

function assertSeoBasics(file, content, canonical) {
  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  if (!titleMatch || titleMatch[1].trim().length < 20) throw new Error(`${file} needs a descriptive title tag`);
  const descMatch = content.match(/<meta\s+name="description"[\s\S]*?content="([^"]+)"/i);
  if (!descMatch || descMatch[1].length < 110 || descMatch[1].length > 180) throw new Error(`${file} needs a 110-180 character meta description`);
  for (const required of [
    '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"',
    '<meta name="googlebot" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"',
    `<link rel="canonical" href="${canonical}"`,
    `<link rel="alternate" hreflang="en" href="${canonical}"`,
    `<link rel="alternate" hreflang="x-default" href="${canonical}"`,
    '<meta property="og:image" content="https://benchmarks.resyst.cl/og.png?v=20260613-link-preview"',
    '<meta property="og:image:secure_url" content="https://benchmarks.resyst.cl/og.png?v=20260613-link-preview"',
    '<meta property="og:image:type" content="image/png"',
    '<meta property="og:image:width" content="1200"',
    '<meta property="og:image:height" content="630"',
    '<meta property="og:image:alt" content="Resyst Labs Benchmarks: independent AI model rankings and Arena evidence"',
  ]) {
    if (!content.includes(required)) throw new Error(`${file} missing SEO marker: ${required}`);
  }
  if ((content.match(/<h1\b/gi) ?? []).length !== 1) throw new Error(`${file} must have exactly one h1`);
  if (!jsonLdBlocks(content).length) throw new Error(`${file} must include JSON-LD structured data`);
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
await stat(path.join(root, 'src/og.png'));
await stat(path.join(root, 'dist/og.png'));
await assertCrawlerSafePng('src/og.png');
await assertCrawlerSafePng('dist/og.png');
await stat(path.join(root, 'dist/assets/icon-192.png'));
await stat(path.join(root, 'dist/assets/icon-512.png'));

const html = await readText('dist/index.html');
assertSeoBasics('dist/index.html', html, 'https://benchmarks.resyst.cl/');
for (const required of [
  'styles.css?v=20260614-hard-intelligence-claude-opus48-d6',
  'app.js?v=20260614-hard-intelligence-claude-opus48-d6',
  'AI Model Benchmarks & Arena Replays | Resyst Labs',
  'Resyst Labs logo',
  'https://benchmarks.resyst.cl/',
  'Resyst Labs Benchmarks',
  'Independent model evaluation',
  'assets/ResystLabs-Logo.png',
  'data/model-comparison.json',
  'data/arena-snapshots.json',
  'arena/',
  'Resyst Arena evaluates spatial strategy in deterministic turn-based games',
  'Local and API-backed systems share a single tournament view',
  'Hard Intelligence',
  'Scores are claims with receipts',
  'Public by design. Auditable by default.',
  'ItemList',
  'podium-card',
  '<tbody id="ranking-body">',
  'encounter-summary-card',
]) {
  if (!html.includes(required)) throw new Error(`index.html missing required self-contained content: ${required}`);
}

const sectionChecks = [
  ['#ranking', 'One table, visible tradeoffs.'],
  ['#arena', 'Resyst Arena evaluates spatial strategy'],
  ['#methodology', 'Separate lanes'],
  ['#evidence', 'versioned data files'],
];
for (const [, expected] of sectionChecks) {
  if (!html.includes(expected)) throw new Error(`index.html section missing context phrase: ${expected}`);
}
if (/Loading benchmark rows|Loading…|Synchronizing benchmark artifact/.test(html)) {
  throw new Error('dist/index.html must ship crawlable benchmark content instead of loading placeholders');
}

const appJs = await readText('dist/app.js');
for (const required of [
  'buildEncounterGroups(matches).slice(0, 3)',
  'Encounter ${groupIndex + 1}',
  'home-replay-link',
  'Open encounter',
]) {
  if (!appJs.includes(required)) throw new Error(`app.js missing grouped Arena summary behavior: ${required}`);
}
if (/matches\.slice\(0,\s*3\)\.map\(\(match\)/.test(appJs)) {
  throw new Error('app.js still renders highlighted Arena entries as a flat match list instead of grouped encounters');
}

const robots = await readText('dist/robots.txt');
if (!/User-agent:\s*\*/.test(robots) || !robots.includes('Sitemap: https://benchmarks.resyst.cl/sitemap.xml')) {
  throw new Error('robots.txt must allow crawling and point at the canonical HTTPS sitemap');
}
const manifest = JSON.parse(await readText('dist/site.webmanifest'));
if (!manifest.icons?.some((icon) => icon.sizes === '192x192') || !manifest.icons?.some((icon) => icon.sizes === '512x512')) {
  throw new Error('web manifest must include 192x192 and 512x512 icons');
}
const sitemap = await readText('dist/sitemap.xml');
for (const required of ['https://benchmarks.resyst.cl/', 'https://benchmarks.resyst.cl/arena/', 'xmlns:image=', '<image:loc>https://benchmarks.resyst.cl/og.png?v=20260613-link-preview</image:loc>']) {
  if (!sitemap.includes(required)) throw new Error(`sitemap.xml missing SEO marker: ${required}`);
}
if (/<loc>http:\/\//.test(sitemap) || /<image:loc>http:\/\//.test(sitemap)) throw new Error('sitemap.xml canonical URL entries must use HTTPS only');

const arenaHtml = await readText('dist/arena/index.html');
assertSeoBasics('dist/arena/index.html', arenaHtml, 'https://benchmarks.resyst.cl/arena/');
for (const required of [
  'Resyst Arena AI Replays | Tactical LLM Benchmark',
  'Resyst Arena is a deterministic turn-based evaluation environment',
  'Replays are grouped by encounter',
  'Encounter grouping',
  'BreadcrumbList',
  'Dataset',
  'Encounter 1',
  'Round 1',
  'Replay JSON exposes board states, actions, events, and telemetry',
  'Replay JSON',
  'replay.js',
  'data/replays/',
]) {
  if (!arenaHtml.includes(required)) throw new Error(`arena page missing required self-contained content: ${required}`);
}
if (arenaHtml.includes('<span>Match 1</span>')) {
  throw new Error('arena page still exposes flat global Match 1 tab labels instead of encounter-grouped replay labels');
}
for (const cssFile of ['src/styles.css', 'dist/styles.css']) {
  const css = await readText(cssFile);
  if (/\.encounter-switcher\s*\{[^}]*position\s*:\s*sticky/i.test(css)) {
    throw new Error(`${cssFile} keeps the encounter selector sticky; it must scroll as normal page content`);
  }
}

const models = JSON.parse(await readText('src/data/model-comparison.json'));
const arena = JSON.parse(await readText('src/data/arena-snapshots.json'));

if (!Array.isArray(models.rows) || models.rows.length < 5) {
  throw new Error('model data must expose at least 5 ranked rows');
}
if (!models.rows.every((row) => row.label && row.basis && Number.isFinite(row.overall_rank ?? 999))) {
  throw new Error('each model row needs public label, basis and rank metadata');
}
const hardLaneKeys = ['active_information_acquisition', 'online_adaptation_fast_learning', 'evidence_driven_self_repair', 'authority_salience_constraint_integrity'];
const hardMeasuredIds = ['gpt-5.5-openrouter-xhigh', 'gemini-3.5-flash-openrouter', 'claude-opus-4.8-openrouter-xhigh', 'deepseek-v4-pro-direct', 'deepseek-v4-flash-direct', 'minimax-m3-direct-anthropic', 'qwen3.7-max-openrouter-xhigh', 'minimax-m3-openrouter-xhigh', 'kimi-k2.7-code-openrouter-xhigh', 'nemotron-3-ultra-openrouter-xhigh'];
const expectedHard = {
  'gpt-5.5-openrouter-xhigh': {coverage: 'D6', seedCount: 1, score: 93.401, rank: 1},
  'gemini-3.5-flash-openrouter': {coverage: 'D6', seedCount: 1, score: 87.75, rank: 2, requestMaxTokens: 32000, reasoningLevel: 'extra-high'},
  'claude-opus-4.8-openrouter-xhigh': {coverage: 'D6', seedCount: 1, score: 81.3698, rank: 3, requestMaxTokens: 32000, reasoningLevel: 'extra-high'},
  'deepseek-v4-pro-direct': {coverage: 'D6', seedCount: 1, score: 78.375, rank: 4, requestMaxTokens: 32000, reasoningLevel: 'maximum'},
  'deepseek-v4-flash-direct': {coverage: 'D1,D2,D3,D4,D5,D6', seedCount: 5, score: 77.5339, rank: 5},
  'minimax-m3-direct-anthropic': {coverage: 'D6', seedCount: 1, score: 71.7969, rank: 6, requestMaxTokens: 32000, reasoningLevel: 'extra-high'},
  'qwen3.7-max-openrouter-xhigh': {coverage: 'D6', seedCount: 1, score: 69.8958, rank: 7, requestMaxTokens: 32000, reasoningLevel: 'extra-high'},
  'minimax-m3-openrouter-xhigh': {coverage: 'D6', seedCount: 1, score: 66.7708, rank: 8},
  'kimi-k2.7-code-openrouter-xhigh': {coverage: 'D6', seedCount: 1, score: 66.4583, rank: 9, requestMaxTokens: 32000, reasoningLevel: 'extra-high'},
  'nemotron-3-ultra-openrouter-xhigh': {coverage: 'D6', seedCount: 1, score: 64.5573, rank: 10, requestMaxTokens: 32000, reasoningLevel: 'extra-high'},
};
for (const id of hardMeasuredIds) {
  const row = models.rows.find((entry) => entry.id === id);
  if (!row?.hard_intelligence?.diagnostic_score) {
    throw new Error(`${id} must expose Hard Intelligence data`);
  }
  const expected = expectedHard[id];
  if (Math.abs(Number(row.hard_intelligence.diagnostic_score) - expected.score) > 0.0001) {
    throw new Error(`${id} Hard Intelligence score drifted`);
  }
  if (row.hard_intelligence.overall_included === false) throw new Error(`${id} Hard Intelligence must affect overall ranking`);
  if ((row.hard_intelligence.difficulty_coverage ?? []).join(',') !== expected.coverage) {
    throw new Error(`${id} Hard Intelligence coverage mismatch`);
  }
  if (Number(row.hard_intelligence.seed_count ?? 0) !== expected.seedCount) throw new Error(`${id} seed_count mismatch`);
  if (expected.requestMaxTokens && Number(row.hard_intelligence.request_max_tokens ?? 0) !== expected.requestMaxTokens) throw new Error(`${id} request_max_tokens mismatch`);
  if (expected.reasoningLevel && row.hard_intelligence.reasoning_level !== expected.reasoningLevel) throw new Error(`${id} reasoning_level mismatch`);
  if (Number(row.hard_rank ?? 0) !== expected.rank) throw new Error(`${id} hard_rank mismatch`);
  const hardScores = row.hard_intelligence.lanes ?? {};
  for (const key of hardLaneKeys) {
    if (!Number.isFinite(Number(hardScores[key]))) throw new Error(`${id} missing hard-intelligence lane: ${key}`);
  }
}
const gpt55 = models.rows.find((row) => row.id === 'gpt-5.5-openrouter-xhigh');
if (gpt55?.overall_rank !== 1 || Math.abs(Number(gpt55?.overall_score) - 88.2237) > 0.0001) {
  throw new Error('GPT-5.5 overall must include the published Hard Intelligence D6 smoke result and rank #1');
}
const claudeOpus48 = models.rows.find((row) => row.id === 'claude-opus-4.8-openrouter-xhigh');
if (claudeOpus48?.overall_rank !== 3 || Math.abs(Number(claudeOpus48?.overall_score) - 84.4533) > 0.0001) {
  throw new Error('Claude Opus 4.8 overall must include the published extra-high Hard Intelligence D6 smoke result and rank #3');
}
const gemini35 = models.rows.find((row) => row.id === 'gemini-3.5-flash-openrouter');
if (gemini35?.overall_rank !== 4 || Math.abs(Number(gemini35?.overall_score) - 83.3767) > 0.0001) {
  throw new Error('Gemini 3.5 Flash overall must include the published extra-high Hard Intelligence D6 smoke result and rank #4');
}
const deepseekPro = models.rows.find((row) => row.id === 'deepseek-v4-pro-direct');
if (deepseekPro?.overall_rank !== 5 || Math.abs(Number(deepseekPro?.overall_score) - 83.365) > 0.0001) {
  throw new Error('DeepSeek V4 Pro overall must include the published Think Max Hard Intelligence D6 smoke result and rank #5');
}
const qwen37 = models.rows.find((row) => row.id === 'qwen3.7-max-openrouter-xhigh');
if (qwen37?.overall_rank !== 6 || Math.abs(Number(qwen37?.overall_score) - 80.7086) > 0.0001) {
  throw new Error('Qwen3.7 Max overall must include the published extra-high Hard Intelligence D6 smoke result and rank #6');
}
const minimaxM3 = models.rows.find((row) => row.id === 'minimax-m3-openrouter-xhigh');
if (minimaxM3?.overall_rank !== 7 || Math.abs(Number(minimaxM3?.overall_score) - 79.6603) > 0.0001) {
  throw new Error('MiniMax M3 overall must include the published Hard Intelligence D6 smoke result and rank #7');
}
const minimaxDirect = models.rows.find((row) => row.id === 'minimax-m3-direct-anthropic');
if (minimaxDirect?.overall_rank !== 9 || Math.abs(Number(minimaxDirect?.overall_score) - 74.629) > 0.0001) {
  throw new Error('MiniMax M3 Direct Plus overall must include the published direct-API Hard Intelligence D6 smoke result and rank #9');
}
const kimiK27 = models.rows.find((row) => row.id === 'kimi-k2.7-code-openrouter-xhigh');
if (kimiK27?.overall_rank !== 10 || Math.abs(Number(kimiK27?.overall_score) - 71.0061) > 0.0001) {
  throw new Error('Kimi K2.7 Code overall must include the published xhigh Hard Intelligence D6 smoke result and rank #10');
}
const nemotron3Ultra = models.rows.find((row) => row.id === 'nemotron-3-ultra-openrouter-xhigh');
if (nemotron3Ultra?.overall_rank !== 11 || Math.abs(Number(nemotron3Ultra?.overall_score) - 67.5758) > 0.0001) {
  throw new Error('NVIDIA Nemotron 3 Ultra overall must include the published xhigh Hard Intelligence D6 smoke result and rank #11');
}
for (const row of models.rows.filter((entry) => !hardMeasuredIds.includes(entry.id))) {
  if (row.hard_intelligence) throw new Error(`${row.id} must keep Hard Intelligence blank until measured`);
}

const rankedRows = models.rows.filter((row) => Number.isFinite(row.overall_rank));
for (const row of rankedRows) {
  const modelPage = `dist/models/${row.id}/index.html`;
  const content = await readText(modelPage);
  assertSeoBasics(modelPage, content, `https://benchmarks.resyst.cl/models/${row.id}/`);
  for (const required of [
    row.label,
    'Benchmark Result | Resyst Labs',
    'BreadcrumbList',
    'Dataset',
    'Public result card',
    'Overall score',
    'Full / Agentic benchmark',
    'Software engineering MVP',
    'Runtime economics',
    'The overall score',
    '../../assets/ResystLabs-Logo.png',
  ]) {
    if (!content.includes(required)) throw new Error(`${modelPage} missing required self-contained content: ${required}`);
  }
  const text = visibleText(content);
  for (const label of ['Overall score', 'Full / Agentic', 'SWE MVP', 'Hard Intelligence', 'Measured cost', 'Runtime economics']) {
    if (!text.includes(label)) throw new Error(`${modelPage} missing visible metric label: ${label}`);
  }
}

if (!Array.isArray(arena.matches) || arena.matches.length < 1) {
  throw new Error('arena data must expose at least one match');
}
if (!arena.matches.every((match) => match.entrants?.A && match.entrants?.B && match.winner_label && match.replay_files?.public_replay)) {
  throw new Error('each arena match needs entrants, winner label, and public replay metadata');
}
for (const match of arena.matches) {
  const replayFile = `src/${match.replay_files.public_replay}`;
  const replayText = await readText(replayFile);
  if (/prompt_snapshot|\bprompt\b|completion|messages/i.test(replayText)) {
    throw new Error(`${replayFile} contains prompt/model-text fields; public replays must stay sanitized`);
  }
  const replay = JSON.parse(replayText);
  if (!Array.isArray(replay.frames) || replay.frames.length < 1) throw new Error(`${replayFile} has no replay frames`);
  await stat(path.join(root, 'dist', match.replay_files.public_replay));
}

console.log(`site contract ok: ${rankedRows.length} model pages, ${arena.matches.length} arena replays, self-contained copy verified, official logo present`);
