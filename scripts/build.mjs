import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const site = 'https://benchmarks.resyst.cl/';

if (!existsSync(src)) {
  throw new Error('src directory is missing');
}

const readJson = async (relativePath) => JSON.parse(await readFile(path.join(src, relativePath), 'utf8'));
const models = await readJson('data/model-comparison.json');
const arena = await readJson('data/arena-snapshots.json');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(src, dist, { recursive: true });

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const slug = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
const fmt = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
const fmtOne = (value) => fmt(value, 1);
const fmtCost = (value) => {
  if (!Number.isFinite(Number(value))) return '—';
  if (Number(value) === 0) return '$0';
  return `$${Number(value).toFixed(Number(value) < 0.01 ? 4 : 3)}`;
};
const sideValue = (map, side) => map?.[side] ?? 0;
const prettyReason = (value = 'resolved') => String(value).replaceAll('_', ' ');
const modelPath = (row) => `models/${slug(row.id)}/`;

const rankedRows = [...models.rows]
  .filter((row) => Number.isFinite(row.overall_rank))
  .sort((a, b) => a.overall_rank - b.overall_rank);

function header(prefix = '') {
  return `
    <header class="site-header">
      <a class="brand" href="${prefix}" aria-label="Resyst Labs Benchmarks home">
        <img class="brand-logo" src="${prefix}assets/ResystLabs-Logo.png" alt="" width="42" height="42" />
        <span>
          <strong>Resyst Labs</strong>
          <small>Benchmarks</small>
        </span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="${prefix}#ranking">Ranking</a>
        <a href="${prefix}arena/">Arena</a>
        <a href="${prefix}#methodology">Methodology</a>
        <a href="${prefix}#evidence">Evidence</a>
      </nav>
    </header>`;
}

function pageShell({ title, description, canonicalPath = '', prefix = '', bodyClass = '', content = '', extraScript = '' }) {
  const canonical = `${site}${canonicalPath}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="theme-color" content="#050508" />
    <link rel="canonical" href="${canonical}" />
    <link rel="manifest" href="${prefix}site.webmanifest" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${site}og.svg" />
    <meta property="og:site_name" content="Resyst Labs Benchmarks" />
    <link rel="stylesheet" href="${prefix}styles.css" />
  </head>
  <body class="${escapeHtml(bodyClass)}">
    <canvas id="signal-field" aria-hidden="true"></canvas>
    <div class="grain" aria-hidden="true"></div>
    <div class="aurora aurora-a" aria-hidden="true"></div>
    <div class="aurora aurora-b" aria-hidden="true"></div>
    ${header(prefix)}
    ${content}
    <footer class="site-footer">
      <span>Resyst Labs Benchmarks</span>
      <span>Independent evaluation for AI systems that act.</span>
    </footer>
    <script type="module" src="${prefix}background.js"></script>
    ${extraScript}
  </body>
</html>
`;
}

function statCard(label, value, detail = '') {
  return `<article class="result-stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ''}</article>`;
}

function metricCard(title, eyebrow, items, note) {
  return `<article class="result-card glass-panel">
    <span class="panel-label">${escapeHtml(eyebrow)}</span>
    <h2>${escapeHtml(title)}</h2>
    <div class="result-metric-list">
      ${items.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}
    </div>
    ${note ? `<p>${escapeHtml(note)}</p>` : ''}
  </article>`;
}

function buildModelInterpretation(row) {
  const rank = Number(row.overall_rank);
  const full = Number(row.full?.final);
  const swe = Number(row.swe?.swe_score);
  const parts = [];
  if (rank === 1) {
    parts.push('This row currently defines the all-around reference point: strong Full/Agentic performance and a competitive SWE lane without hiding runtime basis.');
  } else if (rank <= 3) {
    parts.push('This is a top-tier all-around entrant: the aggregate score stays close to the leader while exposing the lane tradeoffs separately.');
  } else if (Number.isFinite(full) && Number.isFinite(swe) && Math.abs(full - swe) > 8) {
    parts.push(full > swe
      ? 'The model is stronger in the Full/Agentic lane than in the SWE lane, so the page keeps those measurements separate instead of flattening the story into one number.'
      : 'The model is stronger in the SWE lane than in the Full/Agentic lane, so the page keeps both measurements visible before the overall average.');
  } else {
    parts.push('The result is best read as a balanced benchmark row: one overall publication view plus the underlying lane scores that produced it.');
  }
  if (row.notes?.length) parts.push(row.notes.join(' '));
  return parts.join(' ');
}

async function writeModelPages() {
  for (const row of rankedRows) {
    const fullCost = Number(row.full?.cost ?? 0);
    const sweCost = Number(row.swe?.cost ?? 0);
    const totalCost = fullCost + sweCost;
    const reliability = row.swe?.reliability ?? row.full?.reliability;
    const content = `<main class="detail-main model-detail" id="top">
      <section class="detail-hero section-shell">
        <a class="back-link" href="../../#ranking">← Back to ranking</a>
        <p class="eyebrow">Model result · rank #${escapeHtml(row.overall_rank)}</p>
        <h1>${escapeHtml(row.label)}</h1>
        <p class="hero-lead">${escapeHtml(row.basis)}. A self-contained readout of the public ranking row, its lane scores, runtime/cost telemetry, and the formula behind the all-around placement.</p>
        <div class="detail-actions">
          <a class="button primary" href="../../data/model-comparison.json">Download source JSON</a>
          <a class="button secondary" href="../../#ranking">Compare all models</a>
        </div>
      </section>

      <section class="section-shell result-stat-grid" aria-label="Headline metrics">
        ${statCard('Overall score', fmt(row.overall_score), `Rank #${row.overall_rank}`)}
        ${statCard('Full / Agentic', fmt(row.full?.final), `Full rank #${row.full_rank ?? '—'}`)}
        ${statCard('SWE MVP', fmt(row.swe?.swe_score), `SWE rank #${row.swe_rank ?? '—'}`)}
        ${statCard('Measured cost', fmtCost(totalCost), `${fmtOne(reliability)}% reliability`)}
      </section>

      <section class="section-shell result-card-grid" aria-label="Result cards">
        ${metricCard('All-around publication view', 'Overall', [
          ['Score', fmt(row.overall_score)],
          ['Formula', '50% Full + 50% SWE'],
          ['Basis', row.basis],
        ], 'The main ranking keeps one visible tournament table, but this page preserves the lane evidence that creates the all-around score.')}
        ${metricCard('Full / Agentic benchmark', 'Lane 01', [
          ['Final', fmt(row.full?.final)],
          ['Capability', fmt(row.full?.capability)],
          ['Agentic', fmt(row.full?.agentic)],
          ['Pass rate', `${fmtOne(row.full?.pass_rate)}%`],
          ['Prompts', String(row.full?.prompt_count ?? '—')],
        ], 'This lane captures instruction following, structured behavior, tool discipline, and general agentic reliability.')}
        ${metricCard('Software engineering MVP', 'Lane 02', [
          ['SWE score', fmt(row.swe?.swe_score)],
          ['Focused final', fmt(row.swe?.focused_final)],
          ['Capability', fmt(row.swe?.capability)],
          ['Daily driver', fmt(row.swe?.daily)],
          ['Prompts', String(row.swe?.prompt_count ?? '—')],
        ], 'This lane is closer to implementation usefulness: source handling, architecture cleanliness, and deliverable quality.')}
        ${metricCard('Runtime economics', 'Telemetry', [
          ['Full cost', fmtCost(fullCost)],
          ['SWE cost', fmtCost(sweCost)],
          ['Full avg seconds', fmt(row.full?.avg_s)],
          ['SWE time', `${fmt(row.swe?.time_s)}s`],
          ['Decode', row.full?.decode ? fmt(row.full.decode) : '—'],
        ], 'Cost, time, and runtime basis are telemetry. They explain tradeoffs; they do not secretly overwrite the capability scores.')}
      </section>

      <section class="section-shell result-explainer glass-panel">
        <div>
          <span class="panel-label">Interpretation</span>
          <h2>Why this result lands here.</h2>
        </div>
        <p>${escapeHtml(buildModelInterpretation(row))}</p>
      </section>
    </main>`;

    const outDir = path.join(dist, modelPath(row));
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, 'index.html'), pageShell({
      title: `${row.label} — Resyst Labs Benchmark Result`,
      description: `Self-contained Resyst Labs benchmark result page for ${row.label}, including overall, Full/Agentic, SWE, cost, and reliability metrics.`,
      canonicalPath: modelPath(row),
      prefix: '../../',
      bodyClass: 'detail-page',
      content,
    }));
  }
}

function matchCard(match) {
  const replay = match.artifacts?.public_replay ?? '';
  return `<article id="${escapeHtml(match.id)}" class="match-replay glass-panel" data-replay-src="../${escapeHtml(replay)}">
    <div class="match-replay-head">
      <div>
        <span class="match-label">Seed ${escapeHtml(match.seed ?? 'fixed')} · ${escapeHtml(match.mode ?? 'duel')} · ${escapeHtml(match.turns)} turns</span>
        <h2>${escapeHtml(match.title ?? `${match.entrants?.A} vs ${match.entrants?.B}`)}</h2>
        <p><strong>Winner:</strong> ${escapeHtml(match.winner_label)} · ${escapeHtml(prettyReason(match.winner_reason))}</p>
      </div>
      <a class="data-link" href="../${escapeHtml(replay)}">Replay JSON</a>
    </div>
    <div class="replay-layout">
      <div class="replay-stage">
        <div class="replay-board-live" data-board aria-label="Replay board for ${escapeHtml(match.title ?? match.id)}"></div>
      </div>
      <div class="replay-side-panel">
        <div class="match-metrics compact">
          <div class="metric"><span class="metric-label">Core HP A/B</span><strong>${sideValue(match.core_hp, 'A')} / ${sideValue(match.core_hp, 'B')}</strong></div>
          <div class="metric"><span class="metric-label">Damage A/B</span><strong>${sideValue(match.core_damage_dealt, 'A')} / ${sideValue(match.core_damage_dealt, 'B')}</strong></div>
          <div class="metric"><span class="metric-label">Resources A/B</span><strong>${sideValue(match.resources_collected, 'A')} / ${sideValue(match.resources_collected, 'B')}</strong></div>
          <div class="metric"><span class="metric-label">Invalid A/B</span><strong>${sideValue(match.invalid_actions, 'A')} / ${sideValue(match.invalid_actions, 'B')}</strong></div>
        </div>
        <div class="replay-controls">
          <button class="button secondary replay-play" type="button" data-play>Play replay</button>
          <input type="range" min="0" max="0" value="0" data-slider aria-label="Replay turn" />
          <div class="replay-frame-meta" data-frame-meta>Loading replay…</div>
          <div class="replay-events" data-events></div>
        </div>
      </div>
    </div>
  </article>`;
}

async function writeArenaPage() {
  const matches = arena.matches ?? [];
  const content = `<main class="detail-main arena-detail" id="top">
    <section class="detail-hero section-shell arena-hero-page">
      <a class="back-link" href="../#arena">← Back to overview</a>
      <p class="eyebrow">Resyst Arena · replay room</p>
      <h1>Tactical evidence you can replay.</h1>
      <p class="hero-lead">Arena results live on a dedicated page so the home page can stay a ranking surface. Each match below publishes a sanitized replay: board states, actions, events, and tactical telemetry without private model text traces.</p>
      <div class="detail-actions">
        <a class="button primary" href="#replays">Watch replays</a>
        <a class="button secondary" href="../data/arena-snapshots.json">Download Arena data</a>
      </div>
    </section>

    <section class="section-shell arena-rule-grid" aria-label="Arena method principles">
      ${statCard('Score boundary', 'Outcome first', 'Latency, token use, and cost are telemetry, not hidden score modifiers.')}
      ${statCard('Series discipline', 'Side swaps', 'Ranking-grade claims require series, seed variation, and comparable conditions.')}
      ${statCard('Replay contract', 'Sanitized state', 'Replay JSON exposes the game, not private model text traces.')}
    </section>

    <section id="replays" class="section-shell replay-list" aria-label="Arena replays">
      ${matches.map(matchCard).join('\n')}
    </section>
  </main>`;
  const outDir = path.join(dist, 'arena');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'index.html'), pageShell({
    title: 'Resyst Arena Replays — Resyst Labs Benchmarks',
    description: 'Dedicated Resyst Arena replay room with tactical benchmark match summaries and sanitized replay artifacts.',
    canonicalPath: 'arena/',
    prefix: '../',
    bodyClass: 'detail-page arena-replay-page',
    content,
    extraScript: '<script type="module" src="../replay.js"></script>',
  }));
}

await writeModelPages();
await writeArenaPage();

const today = new Date().toISOString().slice(0, 10);
const urls = [
  ['', '1.0'],
  ['arena/', '0.9'],
  ...rankedRows.map((row) => [modelPath(row), '0.72']),
];
await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([loc, priority]) => `  <url>
    <loc>${site}${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`).join('\n')}
</urlset>
`);

console.log(`built static site into dist/ with ${rankedRows.length} model pages and ${arena.matches?.length ?? 0} replay summaries`);
