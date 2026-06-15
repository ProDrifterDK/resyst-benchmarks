import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const site = 'https://benchmarks.resyst.cl/';
const logoUrl = `${site}assets/ResystLabs-Logo.png`;
const ogImageVersion = '20260613-link-preview';
const ogImageUrl = `${site}og.png?v=${ogImageVersion}`;
const assetVersion = '20260615-ranking-copy-cleanup';

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
const fmtOptional = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '';
const fmtOne = (value) => fmt(value, 1);
const fmtCost = (value) => {
  if (!Number.isFinite(Number(value))) return '—';
  if (Number(value) === 0) return '$0';
  return `$${Number(value).toFixed(Number(value) < 0.01 ? 4 : 3)}`;
};
const sideValue = (map, side) => map?.[side] ?? 0;
const prettyReason = (value = 'resolved') => String(value).replaceAll('_', ' ');
const modelPath = (row) => `models/${slug(row.id)}/`;
const hardLane = (row, key) => row.hard_intelligence?.lanes?.[key];
const hardOverallIncluded = (row) => Boolean(
  row.hard_intelligence
  && row.hard_intelligence.overall_included !== false,
);
const hardStatSubline = (row) => {
  if (!row.hard_intelligence) return 'Hard lane pending';
  if (!hardOverallIncluded(row)) return 'Shown as diagnostic telemetry';
  return `Hard rank #${row.hard_rank ?? '—'}`;
};
const hardCellAttrs = (row) => {
  if (!row.hard_intelligence) return ' class="pending-score-cell" aria-label="Not measured"';
  if (!hardOverallIncluded(row)) return ' class="pending-score-cell" aria-label="Diagnostic telemetry; not part of overall"';
  return '';
};
const totalMeasuredCost = (row) => (row.full?.cost ?? 0) + (row.swe?.cost ?? 0) + (row.hard_intelligence?.cost ?? 0);
const overallFormula = (row) => {
  if (hardOverallIncluded(row)) return 'mean(Full, SWE, Hard Intelligence)';
  if (row.hard_intelligence) return 'mean(Full, SWE)';
  return 'mean(Full, SWE)';
};
const overallFormulaCopy = (row) => {
  if (hardOverallIncluded(row)) {
    return 'The overall score averages the measured major lanes while keeping each source measurement visible.';
  }
  if (row.hard_intelligence) {
    return 'The overall score averages Full/Agentic and SWE while showing the Hard Intelligence telemetry separately.';
  }
  return 'The overall score averages measured lanes and keeps blank cells visible for lanes that are not yet measured.';
};

const rankedRows = [...models.rows]
  .filter((row) => Number.isFinite(row.overall_rank))
  .sort((a, b) => a.overall_rank - b.overall_rank);
const dataDate = (models.generated_at ? new Date(models.generated_at) : new Date()).toISOString().slice(0, 10);
const dataDateLabel = new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(dataDate));

function header(prefix = '') {
  return `
    <header class="site-header">
      <a class="brand" href="${prefix}" aria-label="Resyst Labs Benchmarks home">
        <img class="brand-logo" src="${prefix}assets/ResystLabs-Logo.png" alt="Resyst Labs logo" width="42" height="42" />
        <span>
          <strong>Resyst Labs</strong>
          <small>Benchmarks</small>
        </span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="${prefix}ranking/">Ranking</a>
        <a href="${prefix}arena/">Arena</a>
        <a href="${prefix}#methodology">Methodology</a>
        <a href="${prefix}#evidence">Evidence</a>
      </nav>
    </header>`;
}

function schemaScript(data) {
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2).replace(/</g, '\\u003c')}\n</script>`;
}

function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Resyst Labs',
    url: 'https://resyst.cl/',
    logo: {
      '@type': 'ImageObject',
      url: logoUrl,
      width: 1254,
      height: 1254,
    },
  };
}

function webSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Resyst Labs Benchmarks',
    url: site,
    publisher: organizationSchema(),
    inLanguage: 'en',
    description: 'Independent AI model benchmarks, software engineering scores, agentic reliability measurements, and replayable Resyst Arena evidence.',
  };
}

function webPageSchema({ title, description, url }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url,
    isPartOf: { '@id': `${site}#website`, name: 'Resyst Labs Benchmarks' },
    publisher: organizationSchema(),
    inLanguage: 'en',
    dateModified: dataDate,
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: ogImageUrl,
      width: 1200,
      height: 630,
    },
  };
}

function breadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function pageShell({ title, description, canonicalPath = '', prefix = '', bodyClass = '', content = '', extraScript = '', structuredData = [] }) {
  const canonical = `${site}${canonicalPath}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
    <meta name="googlebot" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
    <meta name="application-name" content="Resyst Labs Benchmarks" />
    <meta name="author" content="Resyst Labs" />
    <meta name="color-scheme" content="dark" />
    <meta name="theme-color" content="#050508" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="en" href="${canonical}" />
    <link rel="alternate" hreflang="x-default" href="${canonical}" />
    <link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml" />
    <link rel="manifest" href="${prefix}site.webmanifest" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:image:secure_url" content="${ogImageUrl}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Resyst Labs Benchmarks: independent AI model rankings and Arena evidence" />
    <meta property="og:site_name" content="Resyst Labs Benchmarks" />
    <link rel="stylesheet" href="${prefix}styles.css?v=${assetVersion}" />
    ${structuredData.map(schemaScript).join('\n    ')}
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

function modelDatasetSchema(row) {
  const modelUrl = `${site}${modelPath(row)}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${row.label} AI benchmark result`,
    description: `${row.label} benchmark result from Resyst Labs, including overall score, Full/Agentic score, SWE score, Hard Intelligence diagnostics, runtime cost, and reliability telemetry.`,
    url: modelUrl,
    identifier: row.id,
    creator: organizationSchema(),
    publisher: organizationSchema(),
    license: `${site}#evidence`,
    dateModified: dataDate,
    keywords: ['AI benchmark', 'LLM benchmark', 'agentic AI evaluation', 'software engineering benchmark', row.label],
    measurementTechnique: ['Full/Agentic benchmark', 'SWE MVP benchmark', 'runtime cost telemetry', 'reliability telemetry'],
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'Overall score', value: fmt(row.overall_score) },
      { '@type': 'PropertyValue', name: 'Full / Agentic score', value: fmt(row.full?.final) },
      { '@type': 'PropertyValue', name: 'SWE MVP score', value: fmt(row.swe?.swe_score) },
      { '@type': 'PropertyValue', name: 'Hard Intelligence diagnostic', value: fmt(row.hard_intelligence?.diagnostic_score) },
      { '@type': 'PropertyValue', name: 'Reliability', value: `${fmtOne(row.swe?.reliability ?? row.full?.reliability)}%` },
    ],
    distribution: {
      '@type': 'DataDownload',
      encodingFormat: 'application/json',
      contentUrl: `${site}data/model-comparison.json`,
    },
  };
}

function arenaDatasetSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Resyst Arena replay dataset',
    description: 'Replayable AI model duel evidence with board states, legal actions, events, tactical telemetry, winners, seeds, and turn counts.',
    url: `${site}arena/`,
    creator: organizationSchema(),
    publisher: organizationSchema(),
    license: `${site}#evidence`,
    dateModified: dataDate,
    keywords: ['AI Arena benchmark', 'LLM game benchmark', 'tactical AI evaluation', 'agentic model benchmark', 'replay dataset'],
    measurementTechnique: ['deterministic turn-based duel', 'legal action tracking', 'spatial strategy evaluation', 'side-swapped replay series'],
    variableMeasured: ['winner', 'turn count', 'core damage', 'invalid actions', 'resources collected', 'board state'],
    distribution: {
      '@type': 'DataDownload',
      encodingFormat: 'application/json',
      contentUrl: `${site}data/arena-snapshots.json`,
    },
  };
}

function rankingItemListSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Resyst Labs AI model benchmark ranking',
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: rankedRows.length,
    itemListElement: rankedRows.map((row) => ({
      '@type': 'ListItem',
      position: row.overall_rank,
      name: row.label,
      url: `${site}${modelPath(row)}`,
    })),
  };
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
  if (row.hard_intelligence) {
    parts.push(hardOverallIncluded(row)
      ? `Hard Intelligence score is ${fmt(row.hard_intelligence.diagnostic_score)} and contributes to the overall score alongside Full/Agentic and SWE.`
      : `Hard Intelligence score is ${fmt(row.hard_intelligence.diagnostic_score)} and is shown as diagnostic telemetry beside the ranked lanes.`);
  } else {
    parts.push('Hard Intelligence remains blank until that lane is measured for this entrant.');
  }
  if (row.notes?.length) parts.push(row.notes.join(' '));
  return parts.join(' ');
}

async function writeModelPages() {
  for (const row of rankedRows) {
    const fullCost = Number(row.full?.cost ?? 0);
    const sweCost = Number(row.swe?.cost ?? 0);
    const hardCost = row.hard_intelligence?.cost;
    const totalCost = totalMeasuredCost(row);
    const reliability = row.swe?.reliability ?? row.full?.reliability;
    const content = `<main class="detail-main model-detail" id="top">
      <section class="detail-hero section-shell">
        <a class="back-link" href="../../ranking/">← Back to ranking</a>
        <p class="eyebrow">Model result · rank #${escapeHtml(row.overall_rank)}</p>
        <h1>${escapeHtml(row.label)}</h1>
        <p class="hero-lead">${escapeHtml(row.basis)}. Public result card with the model’s overall score, lane measurements, runtime/cost telemetry, and ranking formula.</p>
        <div class="detail-actions">
          <a class="button primary" href="../../data/model-comparison.json">Download public JSON</a>
          <a class="button secondary" href="../../ranking/">Compare all models</a>
        </div>
      </section>

      <section class="section-shell result-stat-grid" aria-label="Headline metrics">
        ${statCard('Overall score', fmt(row.overall_score), `Rank #${row.overall_rank}`)}
        ${statCard('Full / Agentic', fmt(row.full?.final), `Full rank #${row.full_rank ?? '—'}`)}
        ${statCard('SWE MVP', fmt(row.swe?.swe_score), `SWE rank #${row.swe_rank ?? '—'}`)}
        ${statCard('Hard Intelligence', fmt(row.hard_intelligence?.diagnostic_score), hardStatSubline(row))}
        ${statCard('Measured cost', fmtCost(totalCost), `${fmtOne(reliability)}% reliability`)}
      </section>

      <section class="section-shell result-card-grid" aria-label="Result cards">
        ${metricCard('All-around publication view', 'Overall', [
          ['Score', fmt(row.overall_score)],
          ['Formula', overallFormula(row)],
          ['Basis', row.basis],
        ], overallFormulaCopy(row))}
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
        ${metricCard('Hard Intelligence diagnostic', 'Lane 03', [
          ['Hard score', fmt(row.hard_intelligence?.diagnostic_score)],
          ['Active inquiry', fmt(hardLane(row, 'active_information_acquisition'))],
          ['Online adaptation', fmt(hardLane(row, 'online_adaptation_fast_learning'))],
          ['Self-repair', fmt(hardLane(row, 'evidence_driven_self_repair'))],
          ['Authority integrity', fmt(hardLane(row, 'authority_salience_constraint_integrity'))],
        ], row.hard_intelligence ? 'Hard Intelligence measures active inquiry, online adaptation, evidence-driven self-repair, and authority/salience integrity.' : 'Blank values mean this lane has not been measured for the entrant yet.')}
        ${metricCard('Runtime economics', 'Telemetry', [
          ['Full cost', fmtCost(fullCost)],
          ['SWE cost', fmtCost(sweCost)],
          ['Hard cost', fmtCost(hardCost)],
          ['Full avg seconds', fmt(row.full?.avg_s)],
          ['Hard records', String(row.hard_intelligence?.record_count ?? '—')],
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
    const modelTitle = `${row.label} Benchmark Result | Resyst Labs`;
    const modelDescription = `Compare ${row.label}: overall rank, Full/Agentic, SWE MVP, Hard Intelligence, cost, reliability, and public Resyst Labs benchmark evidence.`;
    await writeFile(path.join(outDir, 'index.html'), pageShell({
      title: modelTitle,
      description: modelDescription,
      canonicalPath: modelPath(row),
      prefix: '../../',
      bodyClass: 'detail-page',
      content,
      structuredData: [
        webPageSchema({ title: modelTitle, description: modelDescription, url: `${site}${modelPath(row)}` }),
        breadcrumbSchema([
          { name: 'Resyst Labs Benchmarks', url: site },
          { name: 'AI model ranking', url: `${site}ranking/` },
          { name: row.label, url: `${site}${modelPath(row)}` },
        ]),
        modelDatasetSchema(row),
      ],
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

function encounterLabels(match) {
  return ['A', 'B'].map((side) => compactEntrant(match.entrants?.[side] ?? side));
}

function encounterKey(match) {
  return [...encounterLabels(match)].sort((a, b) => a.localeCompare(b)).join(' vs ');
}

function buildEncounterGroups(matches) {
  const groups = new Map();
  for (const match of matches) {
    const [first, second] = encounterLabels(match);
    const key = encounterKey(match);
    if (!groups.has(key)) {
      groups.set(key, {
        id: `encounter-${slug(key)}`,
        title: `${first} vs ${second}`,
        key,
        matches: [],
      });
    }
    groups.get(key).matches.push(match);
  }
  return [...groups.values()];
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function encounterWinnerSummary(group) {
  const counts = new Map();
  for (const match of group.matches) {
    const winner = compactEntrant(match.winner_label ?? 'Unresolved');
    counts.set(winner, (counts.get(winner) ?? 0) + 1);
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ordered.length) return 'No winner recorded';
  const [leader, leaderWins] = ordered[0];
  const runnerWins = ordered[1]?.[1] ?? 0;
  if (group.matches.length === 1) return `${leader} won the replay`;
  if (leaderWins === runnerWins) return `Split ${leaderWins}–${runnerWins}`;
  return `${leader} leads ${leaderWins}–${runnerWins}`;
}

function matchDateLabel(match) {
  const label = String(match.date_label ?? '');
  if (/^20\d{6}$/.test(label)) return label;
  return String(match.id ?? '').match(/20\d{6}/)?.[0] ?? label ?? 'undated';
}

function encounterMeta(group) {
  const latestDate = group.matches.map(matchDateLabel).filter(Boolean).sort().at(-1) ?? 'undated';
  const lanes = [...new Set(group.matches.map((match) => match.lane).filter(Boolean))];
  const laneLabel = lanes.length ? ` · ${lanes.join(' / ')}` : '';
  return `${pluralize(group.matches.length, 'replay')} · latest ${latestDate}${laneLabel}`;
}

function encounterCard(group, groupIndex, selectedMatchId) {
  const active = group.matches.some((match) => match.id === selectedMatchId);
  const totalTurns = group.matches.reduce((sum, match) => sum + (Number(match.turns) || 0), 0);
  const seeds = [...new Set(group.matches.map((match) => match.seed).filter((seed) => seed !== undefined && seed !== null))];
  return `<article id="${escapeHtml(group.id)}" class="encounter-card ${active ? 'is-active' : ''}" data-encounter-group="${escapeHtml(group.id)}" aria-labelledby="${escapeHtml(group.id)}-title">
    <div class="encounter-card-head">
      <span class="encounter-label">Encounter ${groupIndex + 1}</span>
      <h2 id="${escapeHtml(group.id)}-title">${escapeHtml(group.title)}</h2>
      <p>${escapeHtml(encounterWinnerSummary(group))}</p>
    </div>
    <div class="encounter-meta-grid" aria-label="Encounter summary">
      ${metricPill('Replays', group.matches.length)}
      ${metricPill('Turns', totalTurns)}
      ${metricPill('Seeds', seeds.length || '—')}
    </div>
    <p class="encounter-meta">${escapeHtml(encounterMeta(group))}</p>
    <div class="encounter-replay-tabs" role="tablist" aria-label="${escapeHtml(group.title)} replays">
      ${group.matches.map((match, index) => matchTab(match, index, group, selectedMatchId)).join('\n')}
    </div>
  </article>`;
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
        <small>Side ${escapeHtml(side)}</small>
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
  const replay = match.replay_files?.public_replay ?? '';
  const title = match.title ?? `${compactEntrant(match.entrants?.A)} vs ${compactEntrant(match.entrants?.B)}`;
  return `<article id="${escapeHtml(match.id)}" class="match-replay glass-panel" data-replay-src="../${escapeHtml(replay)}">
    <div class="match-replay-head">
      <div class="match-title-block">
        <span class="match-label">Seed ${escapeHtml(match.seed ?? 'fixed')} · ${escapeHtml(match.mode ?? 'duel')} · ${escapeHtml(match.turns)} turns</span>
        <h2>${escapeHtml(compactEntrant(match.entrants?.A))} <span class="versus-inline">vs</span> ${escapeHtml(compactEntrant(match.entrants?.B))}</h2>
        <p class="entrant-ids"><span>A:</span> ${escapeHtml(compactEntrant(match.entrants?.A))} <span>B:</span> ${escapeHtml(compactEntrant(match.entrants?.B))}</p>
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
            <span><i class="legend-control"></i>Control zone</span>
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

function matchTab(match, index, group, selectedMatchId) {
  const selected = match.id === selectedMatchId;
  const tabLabel = match.series_id ? `Round ${index + 1}` : group.matches.length > 1 ? `Replay ${index + 1}` : 'Replay';
  const detail = `${prettyReason(match.winner_reason)} · seed ${match.seed ?? 'fixed'}`;
  return `<button class="match-tab ${selected ? 'is-active' : ''}" type="button" role="tab" id="tab-${escapeHtml(match.id)}" data-match-tab="${escapeHtml(match.id)}" data-encounter-id="${escapeHtml(group.id)}" aria-controls="${escapeHtml(match.id)}" aria-selected="${selected ? 'true' : 'false'}">
    <span>${escapeHtml(tabLabel)}</span>
    <strong>${escapeHtml(compactEntrant(match.winner_label))}</strong>
    <small>${escapeHtml(detail)}</small>
  </button>`;
}

function overviewPodiumCard(row) {
  return `<article class="podium-card">
      <a class="podium-link" href="${modelPath(row)}" aria-label="Open benchmark result for ${escapeHtml(row.label)}"></a>
      <span class="podium-rank">#${escapeHtml(row.overall_rank)}</span>
      <h3>${escapeHtml(row.label)}</h3>
      <p>${escapeHtml(row.basis)}</p>
      <span class="podium-cta">Open result →</span>
      <span class="podium-score">${fmtOne(row.overall_score)}</span>
    </article>`;
}

function overviewRankingRow(row) {
  const reliability = row.swe?.reliability ?? row.full?.reliability;
  const cost = totalMeasuredCost(row);
  const hard = row.hard_intelligence;
  const hardAttrs = hardCellAttrs(row);
  return `<tr>
        <td class="rank-cell">#${escapeHtml(row.overall_rank)}</td>
        <td class="model-cell">
          <a class="model-link" href="${modelPath(row)}"><strong>${escapeHtml(row.label)}</strong></a>
        </td>
        <td>${escapeHtml(row.basis)}</td>
        <td class="score-cell">${fmt(row.overall_score)}</td>
        <td>${fmt(row.full?.final)}</td>
        <td>${fmt(row.swe?.swe_score)}</td>
        <td${hardAttrs}>${fmtOptional(hard?.diagnostic_score)}</td>
        <td${hardAttrs}>${fmtOptional(hard?.lanes?.active_information_acquisition)}</td>
        <td${hardAttrs}>${fmtOptional(hard?.lanes?.online_adaptation_fast_learning)}</td>
        <td${hardAttrs}>${fmtOptional(hard?.lanes?.evidence_driven_self_repair)}</td>
        <td${hardAttrs}>${fmtOptional(hard?.lanes?.authority_salience_constraint_integrity)}</td>
        <td>${fmtCost(cost)}</td>
        <td>${fmtOne(reliability)}%</td>
        <td><a class="row-action" href="${modelPath(row)}">Result</a></td>
      </tr>`;
}

function rankingDatasetSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Resyst Labs AI model ranking explained',
    description: 'Public AI model ranking with overall score, Full/Agentic benchmark, SWE MVP benchmark, Hard Intelligence diagnostics, runtime economics, and reliability context.',
    url: `${site}ranking/`,
    creator: organizationSchema(),
    publisher: organizationSchema(),
    license: `${site}#evidence`,
    dateModified: dataDate,
    keywords: ['AI benchmark ranking', 'LLM benchmark', 'software engineering benchmark', 'Hard Intelligence', 'agentic AI evaluation'],
    measurementTechnique: ['lane-aware overall ranking', 'Full/Agentic benchmark', 'SWE MVP benchmark', 'Hard Intelligence public diagnostic', 'runtime cost telemetry'],
    variableMeasured: ['overall score', 'Full / Agentic score', 'SWE MVP score', 'Hard Intelligence diagnostic score', 'measured cost', 'reliability'],
    distribution: {
      '@type': 'DataDownload',
      encodingFormat: 'application/json',
      contentUrl: `${site}data/model-comparison.json`,
    },
  };
}

function finiteScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function laneScoreEntries(row) {
  const entries = [
    { key: 'full', label: 'Full / Agentic', value: finiteScore(row.full?.final), rank: row.full_rank },
    { key: 'swe', label: 'SWE MVP', value: finiteScore(row.swe?.swe_score), rank: row.swe_rank },
  ];
  if (row.hard_intelligence && hardOverallIncluded(row)) {
    entries.push({ key: 'hard', label: 'Hard Intelligence', value: finiteScore(row.hard_intelligence.diagnostic_score), rank: row.hard_rank });
  }
  return entries.filter((entry) => entry.value !== null);
}

function rankingReason(row) {
  const entries = laneScoreEntries(row);
  const strongest = [...entries].sort((a, b) => b.value - a.value)[0];
  const limiter = [...entries].sort((a, b) => a.value - b.value)[0];
  const strengths = [];
  if (Number(row.full_rank) <= 3) strengths.push(`Full rank #${row.full_rank}`);
  if (Number(row.swe_rank) <= 3) strengths.push(`SWE rank #${row.swe_rank}`);
  if (Number(row.hard_rank) <= 3) strengths.push(`Hard Intelligence rank #${row.hard_rank}`);
  const strengthText = strengths.length ? strengths.join(', ') : `${strongest?.label ?? 'best lane'} at ${fmt(strongest?.value)}`;
  const limiterText = limiter ? `${limiter.label} at ${fmt(limiter.value)}` : 'pending lane coverage';
  const hardText = row.hard_intelligence
    ? 'Hard Intelligence contributes to the ranking as a separate measured lane.'
    : 'Hard Intelligence is blank, so the overall score currently averages Full and SWE only.';
  return `Overall ${fmt(row.overall_score)} uses ${overallFormula(row)}. Strength signal: ${strengthText}. Main limiter: ${limiterText}. ${hardText}`;
}

function rankingBarRows(rows, getScore, getMeta = () => '') {
  return rows.map((row) => {
    const score = finiteScore(getScore(row));
    if (score === null) return '';
    const bar = Math.max(2, Math.min(100, score));
    const meta = getMeta(row);
    return `<div class="bar-row" style="--bar:${bar.toFixed(2)}%">
      <a href="../${modelPath(row)}">${escapeHtml(row.label)}</a>
      <div class="bar-track" aria-hidden="true"><i></i></div>
      <strong>${fmt(score)}</strong>
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
    </div>`;
  }).join('\n');
}

function rankingChartCard(title, subtitle, body, note = '') {
  return `<article class="ranking-chart-card glass-panel">
    <div class="ranking-chart-head">
      <span class="panel-label">Chart</span>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(subtitle)}</p>
    </div>
    ${body}
    ${note ? `<p class="chart-note">${escapeHtml(note)}</p>` : ''}
  </article>`;
}

function laneComparisonRows(rows) {
  return rows.map((row) => {
    const full = finiteScore(row.full?.final);
    const swe = finiteScore(row.swe?.swe_score);
    const hard = finiteScore(row.hard_intelligence?.diagnostic_score);
    return `<div class="lane-compare-row">
      <a href="../${modelPath(row)}">#${escapeHtml(row.overall_rank)} ${escapeHtml(row.label)}</a>
      <div class="lane-compare-bars" aria-label="Lane scores for ${escapeHtml(row.label)}">
        ${full === null ? '' : `<span class="lane-bar full" style="--lane:${Math.max(2, full).toFixed(2)}%"><i>Full ${fmt(full)}</i></span>`}
        ${swe === null ? '' : `<span class="lane-bar swe" style="--lane:${Math.max(2, swe).toFixed(2)}%"><i>SWE ${fmt(swe)}</i></span>`}
        ${hard === null ? '' : `<span class="lane-bar hard" style="--lane:${Math.max(2, hard).toFixed(2)}%"><i>Hard ${fmt(hard)}</i></span>`}
      </div>
    </div>`;
  }).join('\n');
}

function costRows(rows) {
  const maxCost = Math.max(...rows.map(totalMeasuredCost), 0.001);
  return rows.map((row) => {
    const cost = totalMeasuredCost(row);
    const bar = Math.max(2, Math.min(100, (cost / maxCost) * 100));
    return `<div class="bar-row cost-row" style="--bar:${bar.toFixed(2)}%">
      <a href="../${modelPath(row)}">${escapeHtml(row.label)}</a>
      <div class="bar-track" aria-hidden="true"><i></i></div>
      <strong>${fmtCost(cost)}</strong>
      <small>rank #${escapeHtml(row.overall_rank)}</small>
    </div>`;
  }).join('\n');
}

function rankingInsightCards() {
  const leader = rankedRows[0];
  const fullLeader = [...rankedRows].filter((row) => row.full).sort((a, b) => Number(a.full_rank ?? 999) - Number(b.full_rank ?? 999))[0];
  const sweLeader = [...rankedRows].filter((row) => row.swe).sort((a, b) => Number(a.swe_rank ?? 999) - Number(b.swe_rank ?? 999))[0];
  const hardLeader = [...rankedRows].filter((row) => row.hard_intelligence).sort((a, b) => Number(a.hard_rank ?? 999) - Number(b.hard_rank ?? 999))[0];
  const hardDrag = [...rankedRows]
    .filter((row) => row.hard_intelligence && row.full && row.swe)
    .map((row) => ({ row, drag: ((Number(row.full.final) + Number(row.swe.swe_score)) / 2) - Number(row.hard_intelligence.diagnostic_score) }))
    .sort((a, b) => b.drag - a.drag)[0];
  const cards = [
    ['Breadth wins the top spot', `${leader.label} leads because its measured lanes stay high together: overall ${fmt(leader.overall_score)}, Full ${fmt(leader.full?.final)}, SWE ${fmt(leader.swe?.swe_score)}, and Hard Intelligence ${fmt(leader.hard_intelligence?.diagnostic_score)}.`],
    ['Full / Agentic alone does not decide', `${fullLeader.label} owns Full rank #${fullLeader.full_rank} at ${fmt(fullLeader.full?.final)}, but the overall formula still checks SWE and Hard Intelligence before ordering the table.`],
    ['SWE is a separate capability signal', `${sweLeader.label} owns SWE rank #${sweLeader.swe_rank} at ${fmt(sweLeader.swe?.swe_score)}. That lane rewards practical implementation and review behavior rather than only general prompt competence.`],
    ['Hard Intelligence reshapes the table', `${hardLeader.label} owns Hard Intelligence rank #${hardLeader.hard_rank} at ${fmt(hardLeader.hard_intelligence?.diagnostic_score)}. That lane tests active inquiry, adaptation, repair, and authority integrity separately from Full and SWE.`],
  ];
  if (hardDrag) {
    cards.push(['The clearest drag is visible', `${hardDrag.row.label} has a Full/SWE average near ${fmt((Number(hardDrag.row.full.final) + Number(hardDrag.row.swe.swe_score)) / 2)}, but Hard Intelligence is ${fmt(hardDrag.row.hard_intelligence.diagnostic_score)}, so the blended overall lands at ${fmt(hardDrag.row.overall_score)}.`]);
  }
  return cards.map(([title, text]) => `<article class="ranking-insight-card glass-panel"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></article>`).join('\n');
}

function rankingDetailedTableRow(row) {
  return `<tr>
    <td class="rank-cell">#${escapeHtml(row.overall_rank)}</td>
    <td class="model-cell"><a class="model-link" href="../${modelPath(row)}"><strong>${escapeHtml(row.label)}</strong></a></td>
    <td class="score-cell">${fmt(row.overall_score)}</td>
    <td>${fmt(row.full?.final)} <small>#${escapeHtml(row.full_rank ?? '—')}</small></td>
    <td>${fmt(row.swe?.swe_score)} <small>#${escapeHtml(row.swe_rank ?? '—')}</small></td>
    <td${hardCellAttrs(row)}>${fmtOptional(row.hard_intelligence?.diagnostic_score)}${row.hard_intelligence ? ` <small>#${escapeHtml(row.hard_rank ?? '—')}</small>` : ''}</td>
    <td>${escapeHtml(overallFormula(row))}</td>
    <td>${fmtCost(totalMeasuredCost(row))}</td>
    <td class="reason-cell">${escapeHtml(rankingReason(row))}</td>
  </tr>`;
}

async function writeRankingPage() {
  const leader = rankedRows[0];
  const hardMeasured = rankedRows.filter((row) => row.hard_intelligence).length;
  const spread = Number(rankedRows[0]?.overall_score ?? 0) - Number(rankedRows.at(-1)?.overall_score ?? 0);
  const chartRows = rankedRows;
  const topLaneRows = rankedRows.slice(0, 8);
  const content = `<main class="detail-main ranked-detail-page" id="top">
    <section class="detail-hero section-shell ranking-hero-page">
      <a class="back-link" href="../#ranking">← Overview</a>
      <p class="eyebrow">Unified ranking · lane-aware explanation</p>
      <h1>Why the ranking looks like this.</h1>
      <p class="hero-lead">The public ranking is not a single vibe score. It orders measured entrants by a transparent overall formula while keeping Full / Agentic, SWE MVP, Hard Intelligence, cost, and reliability visible.</p>
      <div class="detail-actions">
        <a class="button primary" href="#ranking-table">Read the table</a>
        <a class="button secondary" href="../data/model-comparison.json">Download public JSON</a>
      </div>
    </section>

    <section class="section-shell result-stat-grid" aria-label="Ranking summary">
      ${statCard('Ranked entrants', String(rankedRows.length), `${hardMeasured} with Hard Intelligence data`)}
      ${statCard('Current leader', leader.label, `Overall ${fmt(leader.overall_score)}`)}
      ${statCard('Score spread', fmt(spread), `#1 to #${rankedRows.at(-1)?.overall_rank ?? '—'}`)}
      ${statCard('Formula', 'Lane mean', 'Full + SWE + published Hard Intelligence when measured')}
      ${statCard('Data refresh', dataDateLabel, 'Static HTML plus public JSON')}
    </section>

    <section class="section-shell ranking-chart-grid" aria-label="Ranking charts">
      ${rankingChartCard('Overall ladder', 'Every ranked entrant ordered by public overall score.', `<div class="bar-chart">${rankingBarRows(chartRows, (row) => row.overall_score, (row) => `rank #${row.overall_rank}`)}</div>`, 'Overall is a lane mean, not a hidden replacement for source measurements.')}
      ${rankingChartCard('Lane contrast', 'Top eight entrants with Full, SWE, and Hard Intelligence shown side by side.', `<div class="lane-compare-chart">${laneComparisonRows(topLaneRows)}</div>`, 'Hard Intelligence is shown as its own lane so cross-lane strengths and weaknesses stay visible.')}
      ${rankingChartCard('Measured cost context', 'Cost is shown because deployment economics matter, but it does not secretly rewrite capability scores.', `<div class="bar-chart compact">${costRows(chartRows)}</div>`, 'Very expensive rows are not punished twice; cost is visible telemetry and part of the public interpretation.')}
    </section>

    <section class="section-shell ranking-insight-grid" aria-label="Ranking explanation cards">
      ${rankingInsightCards()}
    </section>

    <section id="ranking-table" class="section-shell ranking-section ranking-page-table" aria-labelledby="ranking-page-table-title">
      <div class="section-kicker">Full ranking table</div>
      <div class="section-head">
        <div>
          <h2 id="ranking-page-table-title">Table with reasons, not just numbers.</h2>
          <p>Each row states the score formula, lane ranks, cost context, and the main reason the entrant lands at its current position.</p>
        </div>
        <a class="data-link" href="../data/model-comparison.json">Ranking data</a>
      </div>
      <div class="table-wrap glass-panel ranking-explained-table">
        <table aria-label="Explained Resyst Labs model ranking">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Model</th>
              <th>Overall</th>
              <th>Full</th>
              <th>SWE</th>
              <th>Hard IQ</th>
              <th>Formula</th>
              <th>Cost</th>
              <th>Why here</th>
            </tr>
          </thead>
          <tbody>
            ${rankedRows.map(rankingDetailedTableRow).join('\n')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section-shell result-card-grid ranking-method-grid" aria-label="Ranking method explanation">
      ${metricCard('Why the leader leads', 'Interpretation', [
        ['Leader', leader.label],
        ['Overall', fmt(leader.overall_score)],
        ['Full', fmt(leader.full?.final)],
        ['SWE', fmt(leader.swe?.swe_score)],
        ['Hard IQ', fmt(leader.hard_intelligence?.diagnostic_score)],
      ], 'The top rank belongs to the entrant with the strongest cross-lane balance under the current formula, not simply the best isolated lane score.')}
      ${metricCard('How Hard Intelligence is handled', 'Lane policy', [
        ['Scope', 'active inquiry + adaptation + repair'],
        ['Formula role', 'included when measured'],
        ['Blank cells', 'not yet measured'],
        ['Interpretation', 'separate from Full and SWE'],
      ], 'When a Hard Intelligence score is published, it becomes the third major lane in the overall mean. Otherwise the row remains ranked by the measured lanes it has.')}
      ${metricCard('How to compare close rows', 'Tie-break reading', [
        ['Overall', 'first glance'],
        ['Lane ranks', 'diagnosis'],
        ['Cost', 'runtime context'],
        ['Reliability', 'operational risk'],
      ], 'Close overall scores should be read through the lane breakdown. A model can be strong for building software while weaker at active inquiry, or the reverse.')}
    </section>
  </main>`;
  const outDir = path.join(dist, 'ranking');
  await mkdir(outDir, { recursive: true });
  const rankingTitle = 'AI Model Ranking Explained | Resyst Labs';
  const rankingDescription = 'Explore the Resyst Labs AI model ranking with overall scores, lane charts, SWE results, Hard Intelligence diagnostics, cost, and reliability context.';
  await writeFile(path.join(outDir, 'index.html'), pageShell({
    title: rankingTitle,
    description: rankingDescription,
    canonicalPath: 'ranking/',
    prefix: '../',
    bodyClass: 'detail-page ranking-explained-page',
    content,
    structuredData: [
      webPageSchema({ title: rankingTitle, description: rankingDescription, url: `${site}ranking/` }),
      breadcrumbSchema([
        { name: 'Resyst Labs Benchmarks', url: site },
        { name: 'AI model ranking', url: `${site}ranking/` },
      ]),
      rankingDatasetSchema(),
      rankingItemListSchema(),
    ],
  }));
}

function overviewEncounterCard(group, groupIndex) {
  const totalTurns = group.matches.reduce((sum, match) => sum + (Number(match.turns) || 0), 0);
  const seeds = [...new Set(group.matches.map((match) => match.seed).filter((seed) => seed !== undefined && seed !== null))];
  const firstMatch = group.matches[0];
  return `<article class="match-card encounter-summary-card" id="highlight-${escapeHtml(group.id)}">
        <div>
          <span class="match-label">Encounter ${groupIndex + 1} · ${escapeHtml(encounterMeta(group))}</span>
          <h3>${escapeHtml(group.title)}</h3>
          <p><strong>${escapeHtml(encounterWinnerSummary(group))}</strong>. Replays stay grouped under this model-vs-model encounter, including side-swapped rounds.</p>
          <div class="home-replay-tabs" aria-label="${escapeHtml(group.title)} replay shortcuts">
            ${group.matches.map((match, index) => {
              const label = match.series_id ? `Round ${index + 1}` : group.matches.length > 1 ? `Replay ${index + 1}` : 'Replay';
              const detail = `${prettyReason(match.winner_reason)} · seed ${match.seed ?? 'fixed'}`;
              return `<a class="home-replay-link" href="arena/#${encodeURIComponent(match.id)}">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(compactEntrant(match.winner_label))}</strong>
                <small>${escapeHtml(detail)}</small>
              </a>`;
            }).join('')}
          </div>
        </div>
        <div class="match-metrics encounter-summary-metrics">
          <div class="metric"><span class="metric-label">Replays</span><strong>${group.matches.length}</strong></div>
          <div class="metric"><span class="metric-label">Turns</span><strong>${totalTurns}</strong></div>
          <div class="metric"><span class="metric-label">Seeds</span><strong>${seeds.length || '—'}</strong></div>
          <a class="row-action match-action" href="arena/#${encodeURIComponent(firstMatch?.id ?? group.id)}">Open encounter →</a>
        </div>
      </article>`;
}

async function hydrateOverviewHtml() {
  const indexPath = path.join(dist, 'index.html');
  const leader = rankedRows[0];
  const encounterGroups = buildEncounterGroups(arena.matches ?? []).slice(0, 3);
  let html = await readFile(indexPath, 'utf8');
  html = html
    .replace('<strong id="leader-name">Loading…</strong>', `<strong id="leader-name">${escapeHtml(leader?.label ?? 'Pending data')}</strong>`)
    .replace('<small id="leader-score">Loading benchmark data</small>', `<small id="leader-score">${leader ? `Overall ${fmt(leader.overall_score)} · ${escapeHtml(leader.basis)}` : 'No ranked data loaded'}</small>`)
    .replace('<span id="model-count">—</span>', `<span id="model-count">${rankedRows.length}</span>`)
    .replace('<span id="arena-count">—</span>', `<span id="arena-count">${arena.matches?.length ?? 0}</span>`)
    .replace('<span id="data-date">—</span>', `<span id="data-date">${escapeHtml(dataDateLabel)}</span>`)
    .replace('<div id="podium" class="podium" aria-label="Top ranked models"></div>', `<div id="podium" class="podium" aria-label="Top ranked models">\n${rankedRows.slice(0, 3).map(overviewPodiumCard).join('\n')}\n        </div>`)
    .replace(/<tbody id="ranking-body">[\s\S]*?<\/tbody>/, `<tbody id="ranking-body">\n${rankedRows.map(overviewRankingRow).join('\n')}\n            </tbody>`)
    .replace('<div id="arena-matches" class="match-grid" aria-label="Highlighted Arena matches"></div>', `<div id="arena-matches" class="match-grid" aria-label="Highlighted Arena matches">\n${encounterGroups.map(overviewEncounterCard).join('\n')}\n        </div>`)
    .replace('</head>', `    ${schemaScript(rankingItemListSchema())}\n  </head>`);
  await writeFile(indexPath, html);
}

async function writeArenaPage() {
  const matches = arena.matches ?? [];
  const encounterGroups = buildEncounterGroups(matches);
  const selectedMatchId = matches[0]?.id;
  const content = `<main class="detail-main arena-detail" id="top">
    <section class="detail-hero section-shell arena-hero-page">
      <a class="back-link" href="../#arena">← Back to overview</a>
      <p class="eyebrow">Resyst Arena · replay room</p>
      <h1>Tactical evidence you can replay.</h1>
      <p class="hero-lead">Resyst Arena is a deterministic turn-based evaluation environment for spatial strategy, legal-action discipline, and long-horizon tactical continuity. Replays are grouped by encounter so historical DeepSeek vs Step, DeepSeek vs Gemini, and DeepSeek vs Kimi runs stay readable instead of collapsing into one flat match list.</p>
      <div class="detail-actions">
        <a class="button primary" href="#replays">Browse encounters</a>
        <a class="button secondary" href="../data/arena-snapshots.json">Download Arena data</a>
      </div>
    </section>

    <section class="section-shell arena-rule-grid" aria-label="Arena method principles">
      ${statCard('Score boundary', 'Outcome first', 'Latency, token use, and cost are telemetry, not hidden score modifiers.')}
      ${statCard('Encounter grouping', 'Pairing first', 'Replay buttons live under the model-vs-model encounter they belong to, including side-swapped rounds.')}
      ${statCard('Replay contract', 'Sanitized state', 'Replay JSON exposes board states, actions, events, and telemetry while excluding raw model text outputs.')}
    </section>

    <section id="replays" class="section-shell replay-list" aria-label="Arena encounters and replays">
      <div class="encounter-switcher" aria-label="Grouped Arena encounters">
        ${encounterGroups.map((group, index) => encounterCard(group, index, selectedMatchId)).join('\n')}
      </div>
      <div class="match-stage-list">
        ${matches.map((match) => matchCard(match).replace('class="match-replay glass-panel"', `class="match-replay glass-panel ${match.id === selectedMatchId ? 'is-active' : ''}" role="tabpanel" aria-labelledby="tab-${escapeHtml(match.id)}" ${match.id === selectedMatchId ? '' : 'hidden'}`)).join('\n')}
      </div>
    </section>
  </main>`;
  const outDir = path.join(dist, 'arena');
  await mkdir(outDir, { recursive: true });
  const arenaTitle = 'Resyst Arena AI Replays | Tactical LLM Benchmark';
  const arenaDescription = 'Replay Resyst Arena AI model duels with board states, legal actions, winners, seeds, telemetry, and grouped tactical benchmark evidence.';
  await writeFile(path.join(outDir, 'index.html'), pageShell({
    title: arenaTitle,
    description: arenaDescription,
    canonicalPath: 'arena/',
    prefix: '../',
    bodyClass: 'detail-page arena-replay-page',
    content,
    extraScript: '<script type="module" src="../replay.js"></script>',
    structuredData: [
      webPageSchema({ title: arenaTitle, description: arenaDescription, url: `${site}arena/` }),
      breadcrumbSchema([
        { name: 'Resyst Labs Benchmarks', url: site },
        { name: 'Resyst Arena replays', url: `${site}arena/` },
      ]),
      arenaDatasetSchema(),
    ],
  }));
}

await writeModelPages();
await writeRankingPage();
await writeArenaPage();
await hydrateOverviewHtml();

const today = dataDate;
const urls = [
  ['', '1.0'],
  ['ranking/', '0.96'],
  ['arena/', '0.9'],
  ...rankedRows.map((row) => [modelPath(row), '0.72']),
];
await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map(([loc, priority]) => `  <url>
    <loc>${site}${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
    <image:image>
      <image:loc>${ogImageUrl}</image:loc>
      <image:title>Resyst Labs Benchmarks</image:title>
    </image:image>
  </url>`).join('\n')}
</urlset>
`);

console.log(`built static site into dist/ with ${rankedRows.length} model pages and ${arena.matches?.length ?? 0} replay summaries`);
