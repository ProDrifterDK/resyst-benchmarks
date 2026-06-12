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
    <link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml" />
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
    parts.push('Rank #1 is the current all-around reference point: strong Full/Agentic performance, competitive SWE delivery, and transparent runtime telemetry.');
  } else if (rank <= 3) {
    parts.push('This is a top-tier all-around entrant: the aggregate score remains close to the leader, with lane-level tradeoffs shown separately.');
  } else if (Number.isFinite(full) && Number.isFinite(swe) && Math.abs(full - swe) > 8) {
    parts.push(full > swe
      ? 'The model is stronger in the Full/Agentic lane than in the SWE lane; the overall score is therefore shown with both component lanes visible.'
      : 'The model is stronger in the SWE lane than in the Full/Agentic lane; the overall score is therefore shown with both component lanes visible.');
  } else {
    parts.push('The result is best read as a balanced benchmark entry: one overall score plus the lane measurements that produced it.');
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
        <p class="hero-lead">${escapeHtml(row.basis)}. Public result card with the model’s overall score, lane measurements, runtime/cost telemetry, and ranking formula.</p>
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
        ], 'The overall score is calculated from the Full/Agentic and SWE lanes, keeping the aggregate comparable while preserving the measurements behind it.')}
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

function compactEntrant(value = '') {
  return String(value)
    .replace(/-openrouter.*/i, '')
    .replace(/-direct.*/i, '')
    .replace(/-native.*/i, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/Deepseek/g, 'DeepSeek')
    .replace(/Minimax/g, 'MiniMax')
    .replace(/Nvidia/g, 'NVIDIA')
    .replace(/\bGpt\b/g, 'GPT')
    .replace(/\bQwen/g, 'Qwen')
    .replace(/\bAi\b/g, 'AI');
}

function metricPill(label, value) {
  return `<div class="score-pill"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function combatantPanel(match, side) {
  const entrant = match.entrants?.[side] ?? side;
  const sideKey = side.toLowerCase();
  const damage = sideValue(match.core_damage_dealt, side);
  const invalid = sideValue(match.invalid_actions, side);
  const resources = sideValue(match.resources_collected, side);
  return `<section class="combatant-card side-${side}" data-side-panel="${side}" data-damage-${side}="${escapeHtml(damage)}" data-invalid-${side}="${escapeHtml(invalid)}">
    <div class="combatant-topline">
      <span class="side-token">${side}</span>
      <div>
        <strong>${escapeHtml(compactEntrant(entrant))}</strong>
        <small>${escapeHtml(entrant)}</small>
      </div>
    </div>
    <div class="vital-stack">
      <div class="vital-row">
        <span>Core integrity</span>
        <strong data-core-${sideKey}>${escapeHtml(sideValue(match.core_hp, side))} / 30</strong>
      </div>
      <div class="vital-bar"><i data-core-bar-${sideKey} style="width:${Math.max(0, Math.min(100, (Number(sideValue(match.core_hp, side)) / 30) * 100)).toFixed(1)}%"></i></div>
      <div class="vital-row">
        <span>Energy reserve</span>
        <strong data-energy-${sideKey}>— / 12</strong>
      </div>
      <div class="vital-bar energy"><i data-energy-bar-${sideKey} style="width:0%"></i></div>
    </div>
    <div class="combatant-microgrid">
      ${metricPill('Damage', damage)}
      ${metricPill('Resources', resources)}
      ${metricPill('Invalid', invalid)}
      ${metricPill('Units', `<span data-units-${sideKey}>—</span>`).replaceAll('&lt;', '<').replaceAll('&gt;', '>')}
    </div>
  </section>`;
}

function matchCard(match) {
  const replay = match.artifacts?.public_replay ?? '';
  const title = match.title ?? `${match.entrants?.A} vs ${match.entrants?.B}`;
  return `<article id="${escapeHtml(match.id)}" class="match-replay glass-panel" data-replay-src="../${escapeHtml(replay)}">
    <div class="match-replay-head">
      <div class="match-title-block">
        <span class="match-label">Seed ${escapeHtml(match.seed ?? 'fixed')} · ${escapeHtml(match.mode ?? 'duel')} · ${escapeHtml(match.turns)} turns</span>
        <h2>${escapeHtml(compactEntrant(match.entrants?.A))} <span class="versus-inline">vs</span> ${escapeHtml(compactEntrant(match.entrants?.B))}</h2>
        <p class="entrant-ids"><span>A:</span> ${escapeHtml(match.entrants?.A)} <span>B:</span> ${escapeHtml(match.entrants?.B)}</p>
      </div>
      <aside class="winner-card" aria-label="Match winner">
        <span>Winner</span>
        <strong>${escapeHtml(compactEntrant(match.winner_label))}</strong>
        <small>${escapeHtml(prettyReason(match.winner_reason))}</small>
        <a class="data-link" href="../${escapeHtml(replay)}">Replay JSON</a>
      </aside>
    </div>

    <div class="replay-scoreboard" aria-label="Match telemetry summary">
      ${combatantPanel(match, 'A')}
      <div class="versus-node" aria-hidden="true">
        <span>VS</span>
        <strong data-turn-label>Turn 0</strong>
        <small data-active-label>Loading state</small>
      </div>
      ${combatantPanel(match, 'B')}
    </div>

    <div class="replay-layout">
      <div class="replay-stage">
        <div class="board-chrome">
          <div class="board-topbar">
            <span class="live-dot"></span>
            <strong data-bot-label>Loading model</strong>
            <small>Board state · legal actions · event telemetry</small>
          </div>
          <div class="control-deck">
            <div class="transport-head">
              <span class="panel-label">Replay control</span>
              <div class="speed-picker">
                <label for="speed-${escapeHtml(match.id)}">Speed</label>
                <select id="speed-${escapeHtml(match.id)}" data-speed>
                  <option value="950">0.7×</option>
                  <option value="650" selected>1×</option>
                  <option value="380">1.7×</option>
                  <option value="210">3×</option>
                </select>
              </div>
            </div>
            <div class="transport-row">
              <button class="icon-button" type="button" data-prev aria-label="Previous replay turn">←</button>
              <button class="button primary replay-play" type="button" data-play aria-pressed="false">Play replay</button>
              <button class="icon-button" type="button" data-next aria-label="Next replay turn">→</button>
            </div>
            <div class="timeline-shell">
              <div class="timeline-progress" data-progress-fill></div>
              <input type="range" min="0" max="0" value="0" data-slider aria-label="Replay turn" />
            </div>
            <div class="replay-frame-meta" data-frame-meta>Loading replay…</div>
          </div>
          <div class="board-legend" aria-label="Board legend">
            <span><i class="legend-core side-A"></i>A core</span>
            <span><i class="legend-core side-B"></i>B core</span>
            <span><i class="legend-resource"></i>Resource</span>
            <span><i class="legend-vector"></i>Current action</span>
          </div>
          <div class="board-wrap">
            <div class="replay-board-live" data-board aria-label="Replay board for ${escapeHtml(title)}"></div>
            <div class="victory-overlay" data-victory hidden>
              <span>✦ Victory</span>
              <strong>${escapeHtml(compactEntrant(match.winner_label))}</strong>
              <small>${escapeHtml(prettyReason(match.winner_reason))} · ${escapeHtml(match.turns)} turns</small>
              <button class="button secondary" type="button" data-restart>Replay from start</button>
            </div>
          </div>
        </div>
      </div>

      <aside class="replay-side-panel">
        <div class="log-deck">
          <div>
            <span class="panel-label">Current events</span>
            <div class="replay-events" data-events></div>
          </div>
          <div>
            <span class="panel-label">Applied actions</span>
            <div class="replay-actions" data-actions></div>
          </div>
        </div>
      </aside>
    </div>
  </article>`;
}

function matchTab(match, index) {
  const selected = index === 0;
  return `<button class="match-tab ${selected ? 'is-active' : ''}" type="button" role="tab" id="tab-${escapeHtml(match.id)}" data-match-tab="${escapeHtml(match.id)}" aria-controls="${escapeHtml(match.id)}" aria-selected="${selected ? 'true' : 'false'}">
    <span>Match ${index + 1}</span>
    <strong>${escapeHtml(compactEntrant(match.winner_label))}</strong>
    <small>${escapeHtml(prettyReason(match.winner_reason))}</small>
  </button>`;
}

async function writeArenaPage() {
  const matches = arena.matches ?? [];
  const content = `<main class="detail-main arena-detail" id="top">
    <section class="detail-hero section-shell arena-hero-page">
      <a class="back-link" href="../#arena">← Back to overview</a>
      <p class="eyebrow">Resyst Arena · replay room</p>
      <h1>Tactical evidence you can replay.</h1>
      <p class="hero-lead">Resyst Arena is a deterministic turn-based evaluation environment for spatial strategy, legal-action discipline, and long-horizon tactical continuity. Each replay publishes board states, actions, events, and telemetry so the match can be inspected turn by turn.</p>
      <div class="detail-actions">
        <a class="button primary" href="#replays">Watch replays</a>
        <a class="button secondary" href="../data/arena-snapshots.json">Download Arena data</a>
      </div>
    </section>

    <section class="section-shell arena-rule-grid" aria-label="Arena method principles">
      ${statCard('Score boundary', 'Outcome first', 'Latency, token use, and cost are telemetry, not hidden score modifiers.')}
      ${statCard('Series discipline', 'Side swaps', 'Ranking-grade claims require series, seed variation, and comparable conditions.')}
      ${statCard('Replay contract', 'Sanitized state', 'Replay JSON exposes board states, actions, events, and telemetry while excluding raw model text outputs.')}
    </section>

    <section id="replays" class="section-shell replay-list" aria-label="Arena replays">
      <div class="match-switcher" role="tablist" aria-label="Select Arena replay">
        ${matches.map(matchTab).join('\n')}
      </div>
      <div class="match-stage-list">
        ${matches.map((match, index) => matchCard(match).replace('class="match-replay glass-panel"', `class="match-replay glass-panel ${index === 0 ? 'is-active' : ''}" role="tabpanel" aria-labelledby="tab-${escapeHtml(match.id)}" ${index === 0 ? '' : 'hidden'}`)).join('\n')}
      </div>
    </section>
  </main>`;
  const outDir = path.join(dist, 'arena');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'index.html'), pageShell({
    title: 'Resyst Arena Replays — Resyst Labs Benchmarks',
    description: 'Resyst Arena replay room with tactical benchmark match summaries, board states, legal actions, events, and telemetry artifacts.',
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
