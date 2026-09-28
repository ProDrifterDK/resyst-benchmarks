import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const site = 'https://benchmarks.resyst.cl/';
const logoUrl = `${site}assets/ResystLabs-Logo.png`;
const ogImageVersion = '20260928-visual-overhaul';
const ogImageUrl = `${site}og.png?v=${ogImageVersion}`;
const assetVersion = '20260928-pass2';

if (!existsSync(src)) {
  throw new Error('src directory is missing');
}

const readJson = async (relativePath) => JSON.parse(await readFile(path.join(src, relativePath), 'utf8'));
const models = await readJson('data/model-comparison.json');
const arena = await readJson('data/arena-snapshots.json');
const hardAgentic = await readJson('data/hard-agentic-tool.json');

// Editing leftovers (*.bak, *.bak-<stamp>, *.orig, *~) must never be published. The
// .gitignore only stops git; the build copies src/ wholesale, so it filters here too.
const isBackupLeftover = (source) => /(\.bak(\b|-|$)|\.orig$|~$)/i.test(path.basename(source));
const publishableSource = (source) => !isBackupLeftover(source);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(src, dist, { recursive: true, filter: publishableSource });

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
const shortModelLabels = new Map([
  ['gpt-5.5-chatgpt-codex-xhigh', 'GPT5.5'],
  ['gpt-5.6-luna-openrouter-xhigh', 'Luna'],
  ['gpt-5.6-terra-openrouter-xhigh', 'Terra'],
  ['gpt-5.6-sol-openrouter-xhigh', 'Sol'],
  ['deepseek-v4-flash-direct', 'DS-V4f'],
  ['deepseek-v4.1-flash-opencode-go', 'DS-V4.1f'],
  ['claude-opus-4.8-openrouter-xhigh', 'Opus'],
  ['claude-opus-5-5-claude-max-xhigh', 'Opus 5.5'],
  ['glm-5.2-openrouter-xhigh', 'GLM5.2'],
  ['gemini-3.5-flash-openrouter', 'Gemini'],
  ['deepseek-v4-pro-direct', 'DS-V4p'],
  ['qwen3.7-max-openrouter-xhigh', 'Qwen3.7'],
  ['minimax-m3-openrouter-xhigh', 'M3'],
  ['claude-fable-5-openrouter-xhigh', 'Fable'],
  ['claude-sonnet-5-openrouter-xhigh', 'Sonnet'],
  ['minimax-m3-direct-anthropic', 'M3 Direct'],
  ['kimi-k2.7-code-openrouter-xhigh', 'Kimi'],
  ['step-3.7-flash-openrouter-xhigh', 'Step'],
  ['nemotron-3-ultra-openrouter-xhigh', 'Nemotron'],
  ['gemma4-12b-coder-fable5-composer25-q4km-local', 'Gemma'],
  ['ornith-35b-q4km-vulkan-fit-local', 'Ornith'],
  ['qwythos-9b-q8-vulkan-local', 'Qwythos'],
]);
const shortModelLabel = (row) => shortModelLabels.get(row.id) ?? String(row.label ?? row.id).replace(/DeepSeek/g, 'DS').replace(/NVIDIA /g, '').slice(0, 18);
const isLocalModel = (row) => row.runtime_type === 'local'
  || row.location === 'local'
  || row.provider === 'local'
  || String(row.cost_class ?? '').includes('local');
function modelBadgeMarkup(row) {
  const badges = [];
  if (isLocalModel(row)) badges.push({ label: 'Local model', className: 'local-model-badge', title: 'Benchmarked on local hardware' });
  return badges.length
    ? `<span class="model-badge-list" aria-label="Runtime badges">${badges.map((badge) => `<span class="model-badge ${badge.className}" title="${escapeHtml(badge.title)}">${escapeHtml(badge.label)}</span>`).join('')}</span>`
    : '';
}
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

models.rows = models.rows.map((row) => ({
  ...row,
  telemetry: publicTelemetry(row),
}));

const rankedRows = [...models.rows]
  .filter((row) => Number.isFinite(row.overall_rank))
  .sort((a, b) => a.overall_rank - b.overall_rank);
const dataDate = (models.generated_at ? new Date(models.generated_at) : new Date()).toISOString().slice(0, 10);
const dataDateLabel = new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${dataDate}T00:00:00Z`));

// ---------------------------------------------------------------------------
// Visual helpers. Every mark below is drawn from a measured number in the data
// files; nothing here is decorative geometry.
// ---------------------------------------------------------------------------
const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value));
const pctOf = (value, max = 100) => `${clampNumber((Number(value) / max) * 100, 0, 100).toFixed(1)}%`;
const finiteOrNull = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const median = (values) => {
  const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function figureBlock({ number, title, note = '', body, className = '', id = '', wide = false }) {
  return `<figure class="fig${wide ? ' fig-wide' : ''}${className ? ` ${className}` : ''}"${id ? ` id="${escapeHtml(id)}"` : ''}>
    <figcaption>
      <span class="fig-n">Figure ${escapeHtml(number)}</span>
      <span class="fig-title">${escapeHtml(title)}</span>
      ${note ? `<span class="fig-note">${escapeHtml(note)}</span>` : ''}
    </figcaption>
    ${body}
  </figure>`;
}

function microBar(value, className = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return `<i class="micro-bar${className ? ` ${className}` : ''}" style="--v:${pctOf(number)}" aria-hidden="true"></i>`;
}

function scoreCell(value, { label, className = '', rank = null, extra = '', blankLabel = 'Not measured' } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return `<td class="score-cell is-blank${className ? ` ${className}` : ''}" data-label="${escapeHtml(label)}" aria-label="${escapeHtml(blankLabel)}"></td>`;
  }
  return `<td class="score-cell${className ? ` ${className}` : ''}" data-label="${escapeHtml(label)}"><span class="score-value">${fmt(number)}</span>${rank ? `<small class="score-rank">#${escapeHtml(rank)}</small>` : ''}${microBar(number)}${extra}</td>`;
}

const hardLaneMeta = [
  ['active_information_acquisition', 'Active inquiry'],
  ['online_adaptation_fast_learning', 'Online adaptation'],
  ['evidence_driven_self_repair', 'Self-repair'],
  ['authority_salience_constraint_integrity', 'Authority integrity'],
];

function hardSublaneBars(row) {
  const lanes = row.hard_intelligence?.lanes;
  if (!lanes) return '';
  const title = hardLaneMeta.map(([key, label]) => `${label} ${fmt(lanes[key])}`).join(', ');
  return `<span class="sublanes" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${hardLaneMeta.map(([key]) => `<i style="--v:${pctOf(lanes[key])}"></i>`).join('')}</span>`;
}

// The hero instrument: every ranked model placed on one axis at its overall score. Marks
// closer than `gap` score points stack upward so the dense 80 to 83 band stays legible.
function spectrumMarkup(rows) {
  const scored = rows.filter((row) => Number.isFinite(Number(row.overall_score)));
  const scores = scored.map((row) => Number(row.overall_score));
  const min = Math.max(0, Math.floor(Math.min(...scores) / 10) * 10 - 2);
  const max = Math.min(100, Math.ceil(Math.max(...scores) / 10) * 10 + 2);
  const span = Math.max(1, max - min);
  const xFor = (score) => ((score - min) / span) * 100;
  // Marks closer than the sum of their half-widths (in score points) stack upward. The
  // top three draw larger, so they claim more room than the rest.
  const halfWidth = (row) => (Number(row.overall_rank) <= 3 ? 1.1 : 0.55);
  const levels = [];
  const marks = [...scored]
    .sort((a, b) => Number(a.overall_score) - Number(b.overall_score))
    .map((row, index) => {
      const score = Number(row.overall_score);
      const mine = halfWidth(row);
      let level = 0;
      while ((levels[level] ?? []).some((other) => Math.abs(other.score - score) < mine + other.half)) level += 1;
      (levels[level] ??= []).push({ score, half: mine });
      return { row, score, level, index };
    });
  const ticks = [];
  for (let tick = Math.ceil(min / 10) * 10; tick <= max; tick += 10) ticks.push(tick);
  const top = [...scored].sort((a, b) => Number(a.overall_rank) - Number(b.overall_rank)).slice(0, 3);
  return `<div class="spectrum-plot" style="--levels:${levels.length}">
      <div class="spectrum-axis" aria-hidden="true">${ticks.map((tick) => `<span style="--x:${xFor(tick).toFixed(2)}%"><i></i>${tick}</span>`).join('')}</div>
      <ul class="spectrum-marks" aria-label="Ranked models by overall score">
        ${marks.map(({ row, score, level, index }) => {
          const rank = Number(row.overall_rank);
          const classes = ['spectrum-mark', isLocalModel(row) ? 'is-local' : '', rank <= 3 ? 'is-top' : '', rank === 1 ? 'is-leader' : ''].filter(Boolean).join(' ');
          return `<li style="--x:${xFor(score).toFixed(2)}%;--level:${level};--i:${index}"><a class="${classes}" href="${modelPath(row)}" data-rank="${escapeHtml(rank)}" data-label="#${escapeHtml(rank)} ${escapeHtml(row.label)} ${fmt(score)}" aria-label="Rank ${escapeHtml(rank)}, ${escapeHtml(row.label)}, overall ${fmt(score)}"></a></li>`;
        }).join('\n        ')}
      </ul>
    </div>
    <ol class="spectrum-key" aria-label="Top three">
      ${top.map((row) => `<li><b>${escapeHtml(row.overall_rank)}</b><a href="${modelPath(row)}">${escapeHtml(row.label)}</a><span>${fmt(row.overall_score)}</span></li>`).join('\n      ')}
    </ol>`;
}

// One strip per scored lane: all ranked models as ticks on a shared 30 to 100 axis.
function laneStripsMarkup(rows, matches) {
  const lanes = [
    { title: 'Agentic discipline', lane: 'Full / Agentic lane', text: 'Structured outputs, tool-use boundaries, instruction following, grounded reasoning, and hallucination resistance.', value: (row) => row.full?.final, rank: (row) => row.full_rank },
    { title: 'Software execution', lane: 'SWE MVP lane', text: 'Practical implementation quality, final-answer usefulness, source handling, and architecture cleanliness.', value: (row) => row.swe?.swe_score, rank: (row) => row.swe_rank },
    { title: 'Hard Intelligence', lane: 'Hard Intelligence lane', text: 'Active inquiry, online adaptation, evidence-driven self-repair, and authority integrity under a public hard-reasoning diagnostic.', value: (row) => row.hard_intelligence?.diagnostic_score, rank: (row) => row.hard_rank },
  ];
  const axisMin = 30;
  const axisMax = 100;
  const xFor = (value) => ((clampNumber(value, axisMin, axisMax) - axisMin) / (axisMax - axisMin)) * 100;
  const laneRow = (lane) => {
    const points = rows
      .map((row) => ({ row, value: finiteOrNull(lane.value(row)) }))
      .filter((point) => point.value !== null);
    const leader = points.reduce((best, point) => (!best || point.value > best.value ? point : best), null);
    const low = Math.min(...points.map((point) => point.value));
    return `<article class="lane-row">
      <div class="lane-name">
        <h3>${escapeHtml(lane.title)}</h3>
        <span class="lane-tag">${escapeHtml(lane.lane)}</span>
        <p>${escapeHtml(lane.text)}</p>
      </div>
      <div class="lane-strip">
        <span class="visually-hidden">${points.length} models measured, from ${fmt(low, 1)} to ${fmt(leader.value, 1)}.</span>
        <span class="lane-axis" aria-hidden="true"><i>${axisMin}</i><i>${axisMax}</i></span>
        ${points.map((point) => `<a class="lane-tick${point === leader ? ' is-leader' : ''}${isLocalModel(point.row) ? ' is-local' : ''}" style="--x:${xFor(point.value).toFixed(2)}%" href="${modelPath(point.row)}" data-label="#${escapeHtml(lane.rank(point.row) ?? '—')} ${escapeHtml(point.row.label)} ${fmt(point.value)}" aria-label="${escapeHtml(point.row.label)}, ${escapeHtml(lane.lane)} ${fmt(point.value)}, lane rank ${escapeHtml(lane.rank(point.row) ?? '—')}"></a>`).join('\n        ')}
      </div>
      <div class="lane-leader">
        <span>Lane leader</span>
        <strong><a href="${modelPath(leader.row)}">${escapeHtml(leader.row.label)}</a></strong>
        <b>${fmt(leader.value, 1)}</b>
      </div>
    </article>`;
  };
  const groups = buildEncounterGroups(matches);
  const turns = matches.reduce((sum, match) => sum + (Number(match.turns) || 0), 0);
  const arenaRow = `<article class="lane-row lane-row-arena">
      <div class="lane-name">
        <h3>Resyst Arena</h3>
        <span class="lane-tag">Tactical testbed</span>
        <p>Turn-based spatial duels where legal action discipline and tactical continuity are measured separately from runtime telemetry.</p>
      </div>
      <div class="lane-arena-facts">
        <span><b>${matches.length}</b> replays</span>
        <span><b>${groups.length}</b> encounters</span>
        <span><b>${turns}</b> recorded turns</span>
      </div>
      <div class="lane-leader">
        <span>Replay room</span>
        <strong><a href="arena/">Open Resyst Arena</a></strong>
      </div>
    </article>`;
  return `${lanes.map(laneRow).join('\n')}\n${arenaRow}`;
}

// A real final board position, drawn from the replay file rather than an illustration.
async function finalBoardFigure(match, prefix = '') {
  const replayPath = match?.replay_files?.public_replay;
  if (!replayPath) return '';
  const replay = await readJson(replayPath);
  const state = replay.final_state ?? replay.frames?.at(-1)?.state;
  if (!state) return '';
  const width = Number(state.width ?? 8);
  const height = Number(state.height ?? 8);
  const cell = 64;
  const pad = 4;
  const size = { w: width * cell + pad * 2, h: height * cell + pad * 2 };
  const cx = (x) => pad + Number(x) * cell + cell / 2;
  const cy = (y) => pad + Number(y) * cell + cell / 2;
  const lastEvents = replay.frames?.at(-1)?.events ?? [];
  const zone = (lastEvents.find((event) => event?.type === 'center_control' && Array.isArray(event.zone))?.zone
    ?? [[Math.floor(width / 2) - 1, Math.floor(height / 2)], [Math.floor(width / 2), Math.floor(height / 2) - 1]])
    .map(([x, y]) => ({ x: Number(x), y: Number(y) }));
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      cells.push(`<rect class="fb-cell${(x + y) % 2 ? ' odd' : ''}" x="${pad + x * cell}" y="${pad + y * cell}" width="${cell}" height="${cell}"></rect>`);
    }
  }
  const zoneMarks = zone.map(({ x, y }) => `<rect class="fb-zone" x="${pad + x * cell + 4}" y="${pad + y * cell + 4}" width="${cell - 8}" height="${cell - 8}" rx="6"></rect>`);
  const obstacles = (state.obstacles ?? []).map((item) => `<rect class="fb-obstacle" x="${pad + Number(item.x) * cell + 10}" y="${pad + Number(item.y) * cell + 10}" width="${cell - 20}" height="${cell - 20}" rx="4"></rect>`);
  const resources = (state.resources ?? []).map((item) => {
    const x = cx(item.x);
    const y = cy(item.y);
    const r = 12;
    return `<path class="fb-resource${item.contested ? ' contested' : ''}${Number(item.amount ?? 0) > 0 ? '' : ' depleted'}" d="M${x} ${y - r} L${x + r} ${y} L${x} ${y + r} L${x - r} ${y} Z"></path>`;
  });
  const cores = ['A', 'B'].map((side) => {
    const core = state.players?.[side]?.core;
    if (!core) return '';
    const hp = clampNumber(Number(core.hp ?? 0) / Number(core.max_hp ?? 30), 0, 1);
    const x = pad + Number(core.x) * cell;
    const y = pad + Number(core.y) * cell;
    return `<g class="fb-core side-${side}">
      <rect x="${x + 8}" y="${y + 8}" width="${cell - 16}" height="${cell - 16}" rx="8"></rect>
      <rect class="fb-core-hp" x="${x + 12}" y="${y + cell - 16}" width="${((cell - 24) * hp).toFixed(1)}" height="4" rx="2"></rect>
      <text x="${cx(core.x)}" y="${cy(core.y) + 2}" text-anchor="middle">${side}</text>
    </g>`;
  });
  const units = (state.units ?? []).map((unit) => {
    const alive = Number(unit.hp ?? 1) > 0;
    const glyph = unit.type === 'worker' ? 'W' : unit.type === 'striker' ? 'S' : 'U';
    return `<g class="fb-unit side-${escapeHtml(unit.player ?? 'N')}${alive ? '' : ' destroyed'}">
      <circle cx="${cx(unit.x)}" cy="${cy(unit.y)}" r="15"></circle>
      <text x="${cx(unit.x)}" y="${cy(unit.y) + 4}" text-anchor="middle">${alive ? glyph : '×'}</text>
    </g>`;
  });
  const [entrantA, entrantB] = encounterLabels(match);
  const winner = compactEntrant(match.winner_label);
  const caption = `Final position after ${escapeHtml(match.turns)} turns. ${escapeHtml(winner)} won by ${escapeHtml(prettyReason(match.winner_reason))}. Core integrity ${escapeHtml(sideValue(match.core_hp, 'A'))} for ${escapeHtml(entrantA)} (A) and ${escapeHtml(sideValue(match.core_hp, 'B'))} for ${escapeHtml(entrantB)} (B), out of 30.`;
  return `<figure class="fig board-fig">
      <figcaption>
        <span class="fig-n">Figure 3</span>
        <span class="fig-title">${escapeHtml(entrantA)} vs ${escapeHtml(entrantB)}</span>
        <span class="fig-note">${caption}</span>
      </figcaption>
      <a class="final-board-link" href="${prefix}arena/#${encodeURIComponent(match.id)}" aria-label="Open the replay for ${escapeHtml(entrantA)} vs ${escapeHtml(entrantB)}">
        <svg class="final-board" viewBox="0 0 ${size.w} ${size.h}" role="img" aria-hidden="true">
          ${cells.join('')}
          ${zoneMarks.join('')}
          ${obstacles.join('')}
          ${resources.join('')}
          ${cores.join('')}
          ${units.join('')}
        </svg>
      </a>
      <ul class="board-key" aria-label="Board key">
        <li><i class="key-core side-A"></i>Side A core</li>
        <li><i class="key-core side-B"></i>Side B core</li>
        <li><i class="key-unit"></i>Unit, W worker, S striker</li>
        <li><i class="key-resource"></i>Resource</li>
        <li><i class="key-zone"></i>Control zone</li>
      </ul>
    </figure>`;
}

// Model page: the model's three lane scores against the cohort median and best.
function laneProfileFigure(row, number) {
  const cohort = rankedRows;
  const lanes = [
    { label: 'Full / Agentic', value: finiteOrNull(row.full?.final), rank: row.full_rank, values: cohort.map((entry) => finiteOrNull(entry.full?.final)) },
    { label: 'SWE MVP', value: finiteOrNull(row.swe?.swe_score), rank: row.swe_rank, values: cohort.map((entry) => finiteOrNull(entry.swe?.swe_score)) },
    { label: 'Hard Intelligence', value: finiteOrNull(row.hard_intelligence?.diagnostic_score), rank: row.hard_rank, values: cohort.map((entry) => finiteOrNull(entry.hard_intelligence?.diagnostic_score)) },
  ];
  const body = `<div class="profile-chart">
      ${lanes.map((lane) => {
        const measured = lane.values.filter((value) => value !== null);
        const best = measured.length ? Math.max(...measured) : null;
        const mid = median(measured);
        if (lane.value === null) {
          return `<div class="profile-row is-blank"><span class="profile-label">${escapeHtml(lane.label)}</span><div class="profile-track"></div><strong>Not measured</strong></div>`;
        }
        return `<div class="profile-row">
          <span class="profile-label">${escapeHtml(lane.label)}<small>lane rank #${escapeHtml(lane.rank ?? '—')} of ${measured.length}</small></span>
          <div class="profile-track">
            <i class="profile-bar" style="--v:${pctOf(lane.value)}"></i>
            ${mid === null ? '' : `<b class="profile-median" style="--x:${pctOf(mid)}" title="Cohort median ${fmt(mid)}"></b>`}
            ${best === null ? '' : `<b class="profile-best" style="--x:${pctOf(best)}" title="Cohort best ${fmt(best)}"></b>`}
          </div>
          <strong>${fmt(lane.value)}</strong>
        </div>`;
      }).join('\n')}
    </div>
    <ul class="profile-key" aria-label="Profile key">
      <li><i class="key-bar"></i>${escapeHtml(row.label)}</li>
      <li><i class="key-median"></i>Cohort median</li>
      <li><i class="key-best"></i>Cohort best</li>
    </ul>`;
  return figureBlock({ number, title: 'Lane profile against the cohort', note: 'Each bar is one measured lane on the shared 0 to 100 scale. The thin mark is the cohort median; the bright mark is the best score any ranked model reached on that lane.', body, className: 'profile-fig' });
}

function header(prefix = '', current = '') {
  const navLink = (key, href, label) => `<a href="${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `
    <header class="site-header">
      <a class="brand" href="${prefix}" aria-label="Resyst Labs Benchmarks home">
        <img class="brand-logo" src="${prefix}assets/ResystLabs-Logo.png" alt="Resyst Labs logo" width="40" height="40" />
        <span class="brand-text">
          <strong>Resyst Labs</strong>
          <small>Benchmarks</small>
        </span>
      </a>
      <nav aria-label="Primary navigation">
        ${navLink('ranking', `${prefix}ranking/`, 'Ranking')}
        ${navLink('hard-agentic', `${prefix}hard-agentic/`, 'Hard Agentic')}
        ${navLink('arena', `${prefix}arena/`, 'Arena')}
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

function pageShell({ title, description, canonicalPath = '', prefix = '', bodyClass = '', content = '', extraScript = '', structuredData = [], navCurrent = '' }) {
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
    <meta name="theme-color" content="#07060b" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="en" href="${canonical}" />
    <link rel="alternate" hreflang="x-default" href="${canonical}" />
    <link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml" />
    <link rel="manifest" href="${prefix}site.webmanifest" />
    <link rel="preload" href="${prefix}assets/fonts/archivo-variable.woff2" as="font" type="font/woff2" crossorigin />
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
    <div class="grain" aria-hidden="true"></div>
    ${header(prefix, navCurrent)}
    ${content}
    <footer class="site-footer">
      <span>Resyst Labs Benchmarks</span>
      <span>Independent evaluation for AI systems that act.</span>
      <span class="footer-links"><a href="${prefix}data/model-comparison.json">Ranking JSON</a><a href="${prefix}data/arena-snapshots.json">Arena JSON</a><a href="${prefix}data/hard-agentic-tool.json">Hard Agentic JSON</a></span>
    </footer>
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
    const totalCost = totalMeasuredCost(row);
    const reliability = row.swe?.reliability ?? row.full?.reliability;
    const telemetry = row.telemetry ?? publicTelemetry(row);
    const content = `<main class="detail-main model-detail" id="top">
      <section class="page-hero model-hero">
        <div class="model-hero-copy">
          <a class="back-link" href="../../ranking/">Back to the ranking</a>
          <p class="kicker">Model result, rank ${escapeHtml(row.overall_rank)} of ${rankedRows.length}</p>
          <h1>${escapeHtml(row.label)}</h1>
          ${modelBadgeMarkup(row)}
          <p class="hero-lead">${escapeHtml(row.basis)}. Public result card with the model’s overall score, lane measurements, runtime and cost telemetry, and the ranking formula.</p>
          <div class="detail-actions">
            <a class="button primary" href="../../ranking/">Compare all models</a>
            <a class="button secondary" href="../../data/model-comparison.json">Download public JSON</a>
          </div>
        </div>
        <aside class="leader-plate model-plate" aria-label="Overall score">
          <span class="plate-label">Overall score</span>
          <span class="plate-score"><b>${fmt(row.overall_score)}</b><i>of 100</i></span>
          <small class="plate-basis">${escapeHtml(overallFormula(row))}</small>
        </aside>
      </section>

      <section class="section" aria-label="Lane profile">
        ${laneProfileFigure(row, 1)}
      </section>

      <section class="section result-stat-grid" aria-label="Headline metrics">
        ${statCard('Overall score', fmt(row.overall_score), `Rank #${row.overall_rank}`)}
        ${statCard('Full / Agentic', fmt(row.full?.final), `Full rank #${row.full_rank ?? '—'}`)}
        ${statCard('SWE MVP', fmt(row.swe?.swe_score), `SWE rank #${row.swe_rank ?? '—'}`)}
        ${statCard('Hard Intelligence', fmt(row.hard_intelligence?.diagnostic_score), hardStatSubline(row))}
        ${statCard('Measured cost', fmtCost(totalCost), `${fmtOne(reliability)}% reliability`)}
      </section>

      <section class="section result-card-grid" aria-label="Result cards">
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
          ['Total cost', fmtCost(totalCost)],
          ['Cost / scored item', fmtCost(telemetry.cost_per_scored_item)],
          ['Seconds / timed item', telemetry.runtime.seconds_per_timed_item === null ? '—' : `${fmt(telemetry.runtime.seconds_per_timed_item)}s`],
          ['Runtime coverage', `${fmtOne(telemetry.runtime.coverage_pct)}%`],
          ['Recorded tokens / item', telemetry.tokens.per_scored_item_recorded === null ? '—' : fmtCompactNumber(telemetry.tokens.per_scored_item_recorded)],
          ['Token coverage', `${fmtOne(telemetry.tokens.coverage_pct)}%`],
        ], 'Cost, time, and token basis are normalized telemetry. They explain tradeoffs; they do not overwrite the capability score yet.')}
      </section>

      <section class="section result-explainer">
        <div>
          <span class="panel-label">Interpretation</span>
          <h2>Why the result lands here.</h2>
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
      navCurrent: 'ranking',
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
    ${encounterFacts(group)}
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
        <span class="match-label"><span>Seed ${escapeHtml(match.seed ?? 'fixed')}</span><span>${escapeHtml(match.mode ?? 'duel')}</span><span>${escapeHtml(match.turns)} turns</span></span>
        <h2>${escapeHtml(compactEntrant(match.entrants?.A))} <span class="versus-inline">vs</span> ${escapeHtml(compactEntrant(match.entrants?.B))}</h2>
      </div>
      <aside class="winner-card" aria-label="Match winner">
        <span>Winner</span>
        <strong>${escapeHtml(compactEntrant(match.winner_label))}</strong>
        <small>by ${escapeHtml(prettyReason(match.winner_reason))}</small>
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
            <small>Board state, legal actions, event telemetry</small>
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
              <span>Victory</span>
              <strong>${escapeHtml(compactEntrant(match.winner_label))}</strong>
              <small>${escapeHtml(prettyReason(match.winner_reason))} after ${escapeHtml(match.turns)} turns</small>
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
  return `<button class="match-tab ${selected ? 'is-active' : ''}" type="button" role="tab" id="tab-${escapeHtml(match.id)}" data-match-tab="${escapeHtml(match.id)}" data-encounter-id="${escapeHtml(group.id)}" aria-controls="${escapeHtml(match.id)}" aria-selected="${selected ? 'true' : 'false'}">
    <span>${escapeHtml(tabLabel)}</span>
    <strong>${escapeHtml(compactEntrant(match.winner_label))}</strong>
    <small>${escapeHtml(prettyReason(match.winner_reason))}, seed ${escapeHtml(match.seed ?? 'fixed')}</small>
  </button>`;
}

function laneMiniList(row, className) {
  const lanes = [
    ['Full', row.full?.final],
    ['SWE', row.swe?.swe_score],
    ['Hard Intelligence', row.hard_intelligence?.diagnostic_score],
  ];
  return `<dl class="${className}">
        ${lanes.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${Number.isFinite(Number(value)) ? `${fmt(value)}${microBar(value)}` : '<span class="blank">not measured</span>'}</dd></div>`).join('')}
      </dl>`;
}

function overviewPodiumCard(row) {
  const lanes = [
    ['Full', row.full?.final],
    ['SWE', row.swe?.swe_score],
    ['Hard Intelligence', row.hard_intelligence?.diagnostic_score],
  ];
  return `<article class="podium-card rank-${escapeHtml(row.overall_rank)}">
      <a class="podium-link" href="${modelPath(row)}" aria-label="Open benchmark result for ${escapeHtml(row.label)}"></a>
      <span class="podium-rank">${escapeHtml(row.overall_rank)}</span>
      <div class="podium-body">
        <h3>${escapeHtml(row.label)}</h3>
        ${modelBadgeMarkup(row)}
        <p class="podium-basis">${escapeHtml(row.basis)}</p>
      </div>
      <span class="podium-score"><b>${fmt(row.overall_score)}</b><i>overall</i></span>
      <dl class="podium-lanes">
        ${lanes.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${Number.isFinite(Number(value)) ? `${fmt(value)}${microBar(value)}` : '<span class="blank">not measured</span>'}</dd></div>`).join('')}
      </dl>
      <span class="podium-cta">Open result</span>
    </article>`;
}

function overviewRankingRow(row) {
  const reliability = row.swe?.reliability ?? row.full?.reliability;
  const cost = totalMeasuredCost(row);
  const hard = row.hard_intelligence;
  return `<tr>
        <td class="rank-cell" data-label="Rank">${escapeHtml(row.overall_rank)}</td>
        <td class="model-cell" data-label="Model">
          <a class="model-link" href="${modelPath(row)}"><strong>${escapeHtml(row.label)}</strong></a>
          ${modelBadgeMarkup(row)}
          <small class="model-basis">${escapeHtml(row.basis)}</small>
        </td>
        ${scoreCell(row.overall_score, { label: 'Overall', className: 'overall-cell' })}
        ${scoreCell(row.full?.final, { label: 'Full', rank: row.full_rank })}
        ${scoreCell(row.swe?.swe_score, { label: 'SWE', rank: row.swe_rank })}
        ${scoreCell(hard?.diagnostic_score, { label: 'Hard Intelligence', rank: hard ? row.hard_rank : null, extra: hardSublaneBars(row), blankLabel: hard ? 'Diagnostic telemetry; not part of overall' : 'Not measured' })}
        <td class="num-cell" data-label="Cost">${fmtCost(cost)}</td>
        <td class="num-cell" data-label="Reliability">${fmtOne(reliability)}%</td>
        <td class="action-cell"><a class="row-action" href="${modelPath(row)}">Result</a></td>
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
      <span class="bar-row-model"><a href="../${modelPath(row)}">${escapeHtml(row.label)}</a>${modelBadgeMarkup(row)}</span>
      <div class="bar-track" aria-hidden="true"><i></i></div>
      <strong>${fmt(score)}</strong>
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
    </div>`;
  }).join('\n');
}

function rankingChartCard(number, title, subtitle, body, note = '', className = '') {
  return figureBlock({
    number,
    title,
    note: subtitle,
    className: ['ranking-chart-card', className].filter(Boolean).join(' '),
    body: `${body}${note ? `<p class="chart-note">${escapeHtml(note)}</p>` : ''}`,
  });
}

function metricValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function finiteMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstMetric(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function firstFiniteMetric(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function roundMetric(value, digits = 4) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function tokenUsageTotal(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  return Object.entries(usage).reduce((sum, [key, value]) => {
    if (value && typeof value === 'object') return sum + tokenUsageTotal(value);
    if (!/tokens?$/i.test(key)) return sum;
    const number = Number(value);
    return Number.isFinite(number) ? sum + number : sum;
  }, 0);
}

function laneItemCount(lane) {
  return metricValue(lane?.prompt_count ?? lane?.record_count);
}

function laneTokenTelemetry(lane) {
  const itemCount = laneItemCount(lane);
  if (!lane) {
    return { item_count: 0, recorded_total: null, per_item_recorded: null, status: 'not_run', basis: 'not_run' };
  }
  const directInput = firstFiniteMetric(lane.prompt_tokens, lane.input_tokens);
  const estimatedInput = firstFiniteMetric(lane.input_tokens_estimated);
  const directOutput = firstFiniteMetric(lane.output_tokens);
  const estimatedOutput = firstFiniteMetric(lane.output_tokens_estimated);
  const directReasoning = firstFiniteMetric(lane.reasoning_tokens);
  const estimatedReasoning = firstFiniteMetric(lane.reasoning_tokens_estimate, lane.reasoning_tokens_estimated);
  const measuredDirect = [directInput, directOutput, directReasoning].filter((value) => value !== null).reduce((sum, value) => sum + value, 0);
  const estimatedDirect = [directInput ?? estimatedInput, directOutput ?? estimatedOutput, directReasoning ?? estimatedReasoning].filter((value) => value !== null).reduce((sum, value) => sum + value, 0);
  const quotaTotal = finiteMetric(lane.provider_tokens_total_for_quota);
  const providerUsage = tokenUsageTotal(lane.provider_token_usage);
  const costTotal = finiteMetric(lane.total_tokens_for_cost);
  let recordedTotal = null;
  let basis = 'missing';
  let confidence = 'missing';
  if (quotaTotal !== null && quotaTotal > 0) {
    recordedTotal = quotaTotal;
    basis = 'quota_total';
    confidence = 'recorded';
  } else if (measuredDirect > 0) {
    const includesEstimatedReasoning = directReasoning === null && estimatedReasoning !== null;
    recordedTotal = includesEstimatedReasoning && estimatedDirect > measuredDirect ? estimatedDirect : measuredDirect;
    basis = includesEstimatedReasoning && estimatedDirect > measuredDirect ? 'direct_plus_estimated_fields' : 'direct_fields';
    confidence = basis === 'direct_plus_estimated_fields' ? 'estimated' : 'recorded';
  } else if (providerUsage > 0) {
    recordedTotal = providerUsage;
    basis = 'provider_usage';
    confidence = 'recorded';
  } else if (costTotal !== null && costTotal > 0) {
    recordedTotal = costTotal;
    basis = 'cost_token_total';
    confidence = 'recorded';
  } else if (estimatedDirect > 0) {
    recordedTotal = estimatedDirect;
    basis = 'estimated_fields';
    confidence = 'estimated';
  }
  const hasTokens = recordedTotal !== null;
  return {
    item_count: itemCount,
    recorded_total: hasTokens ? roundMetric(recordedTotal, 0) : null,
    per_item_recorded: hasTokens && itemCount > 0 ? roundMetric(recordedTotal / itemCount, 2) : null,
    status: hasTokens ? confidence : itemCount > 0 ? 'missing' : 'not_run',
    basis,
  };
}

function laneRuntimeTelemetry(lane) {
  const itemCount = laneItemCount(lane);
  if (!lane) {
    return { item_count: 0, recorded_seconds: null, seconds_per_item: null, status: 'not_run', basis: 'not_run' };
  }
  const directTotal = firstFiniteMetric(lane.total_time_s, lane.time_s, lane.runtime_seconds, lane.elapsed_seconds);
  const avgSeconds = firstFiniteMetric(lane.avg_s);
  const recordedSeconds = directTotal ?? (avgSeconds !== null && itemCount > 0 ? avgSeconds * itemCount : null);
  const hasRuntime = recordedSeconds !== null && itemCount > 0;
  return {
    item_count: itemCount,
    recorded_seconds: hasRuntime ? roundMetric(recordedSeconds, 4) : null,
    seconds_per_item: hasRuntime ? roundMetric(recordedSeconds / itemCount, 4) : null,
    status: hasRuntime ? 'recorded' : itemCount > 0 ? 'missing' : 'not_run',
    basis: directTotal !== null ? 'total_seconds' : avgSeconds !== null ? 'average_seconds' : itemCount > 0 ? 'missing' : 'not_run',
  };
}

function coverageStatus(covered, total) {
  if (total <= 0) return 'missing';
  const pct = (covered / total) * 100;
  if (pct >= 99.5) return 'complete';
  if (pct > 0) return 'limited';
  return 'missing';
}

function publicTelemetry(row) {
  const lanes = {
    full: { tokens: laneTokenTelemetry(row.full), runtime: laneRuntimeTelemetry(row.full) },
    swe: { tokens: laneTokenTelemetry(row.swe), runtime: laneRuntimeTelemetry(row.swe) },
    hard: { tokens: laneTokenTelemetry(row.hard_intelligence), runtime: laneRuntimeTelemetry(row.hard_intelligence) },
  };
  const scoredItems = Object.values(lanes).reduce((sum, lane) => sum + Math.max(lane.tokens.item_count, lane.runtime.item_count), 0);
  const tokenTotal = Object.values(lanes).reduce((sum, lane) => sum + metricValue(lane.tokens.recorded_total), 0);
  const tokenCoveredItems = Object.values(lanes).reduce((sum, lane) => lane.tokens.recorded_total !== null ? sum + lane.tokens.item_count : sum, 0);
  const tokenMean = scoredItems > 0 ? roundMetric(tokenTotal / scoredItems, 2) : null;
  const tokenMedian = firstFiniteMetric(row.token_median_per_scored_item, row.tokens_median_per_scored_item);
  const tokenP90 = firstFiniteMetric(row.token_p90_per_scored_item, row.tokens_p90_per_scored_item);
  const runtimeSeconds = Object.values(lanes).reduce((sum, lane) => sum + metricValue(lane.runtime.recorded_seconds), 0);
  const runtimeCoveredItems = Object.values(lanes).reduce((sum, lane) => lane.runtime.recorded_seconds !== null ? sum + lane.runtime.item_count : sum, 0);
  const tokenCoveragePct = scoredItems > 0 ? (tokenCoveredItems / scoredItems) * 100 : 0;
  const runtimeCoveragePct = scoredItems > 0 ? (runtimeCoveredItems / scoredItems) * 100 : 0;
  const cost = totalMeasuredCost(row);
  return {
    scoring_role: 'telemetry_only',
    cost,
    cost_per_scored_item: scoredItems > 0 ? roundMetric(cost / scoredItems, 6) : null,
    avgSeconds: runtimeCoveredItems > 0 ? roundMetric(runtimeSeconds / runtimeCoveredItems, 4) : null,
    tokenVolume: tokenTotal,
    tokenPerScoredItem: tokenMean,
    overall: metricValue(row.overall_score),
    scored_items: scoredItems,
    tokens: {
      recorded_total: tokenTotal,
      per_scored_item_recorded: tokenMean,
      mean_per_scored_item: tokenMean,
      median_per_scored_item: tokenMedian === null ? null : roundMetric(tokenMedian, 2),
      p90_per_scored_item: tokenP90 === null ? null : roundMetric(tokenP90, 2),
      per_covered_item: tokenCoveredItems > 0 ? roundMetric(tokenTotal / tokenCoveredItems, 2) : null,
      covered_items: tokenCoveredItems,
      coverage_pct: roundMetric(tokenCoveragePct, 2),
      status: coverageStatus(tokenCoveredItems, scoredItems),
      lanes: Object.fromEntries(Object.entries(lanes).map(([key, lane]) => [key, lane.tokens])),
    },
    runtime: {
      recorded_seconds: roundMetric(runtimeSeconds, 4),
      seconds_per_timed_item: runtimeCoveredItems > 0 ? roundMetric(runtimeSeconds / runtimeCoveredItems, 4) : null,
      seconds_per_scored_item_recorded: scoredItems > 0 ? roundMetric(runtimeSeconds / scoredItems, 4) : null,
      covered_items: runtimeCoveredItems,
      coverage_pct: roundMetric(runtimeCoveragePct, 2),
      status: coverageStatus(runtimeCoveredItems, scoredItems),
      lanes: Object.fromEntries(Object.entries(lanes).map(([key, lane]) => [key, lane.runtime])),
    },
  };
}

function fmtCompactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  if (Math.abs(number) >= 100) return number.toFixed(0);
  if (Math.abs(number) >= 10) return number.toFixed(1);
  return number.toFixed(2);
}

// Places one label per visible scatter point so that no label overlaps another label or a
// visible marker. Candidates sit at eighteen directions around the marker (right first, then the
// diagonals, above, below, left) at growing distances. Each candidate that clears the hard rules
// (inside the plot, off every marker, off every placed label) is scored by its distance plus
// penalties when its leader line would cross another marker, a placed label or another leader;
// the cheapest wins. A label further than a marker's width from its point gets that leader line
// back to it. Entries are placed by priority (rank), so the leading entrants keep the closest
// spots; a second pass then re-places each label against the finished layout, which untangles
// leaders that the first pass could not see yet.
function placeScatterLabels(entries, bounds) {
  const markerPad = 9;
  const markers = entries.map((entry) => ({ id: entry.id, x0: entry.cx - markerPad, y0: entry.cy - markerPad, x1: entry.cx + markerPad, y1: entry.cy + markerPad }));
  const hits = (box, other, pad = 0) => box.x0 < other.x1 + pad && box.x1 + pad > other.x0 && box.y0 < other.y1 + pad && box.y1 + pad > other.y0;
  const segmentCrossings = (x1, y1, x2, y2, boxes) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4));
    const crossed = new Set();
    for (let step = 0; step <= steps; step += 1) {
      const x = x1 + ((x2 - x1) * step) / steps;
      const y = y1 + ((y2 - y1) * step) / steps;
      boxes.forEach((box, index) => {
        if (x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1) crossed.add(index);
      });
    }
    return crossed.size;
  };
  const orientation = (ax, ay, bx, by, cx, cy) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  const segmentsCross = (a, b) => orientation(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1) !== orientation(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2)
    && orientation(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1) !== orientation(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  const radii = [11, 15, 20, 26, 33, 42, 53, 66, 82, 100, 122, 148, 178, 212, 250, 300];
  const angles = [0, -20, 20, -40, 40, -60, 60, -80, 80, -100, 100, 180, -160, 160, -140, 140, -120, 120];
  const placements = new Map();
  const placeOne = (entry) => {
    const others = [...placements.values()].filter((placement) => placement.id !== entry.id);
    const placed = others.map((placement) => placement.box);
    const leaders = others.map((placement) => placement.leader).filter(Boolean);
    const otherMarkers = markers.filter((marker) => marker.id !== entry.id);
    let best = null;
    for (const radius of radii) {
      // Cost is at least the radius, so once the radius passes the best cost nothing can beat it.
      if (best && radius >= best.cost) break;
      angles.forEach((degrees, angleIndex) => {
        const radians = (degrees * Math.PI) / 180;
        const cos = Math.cos(radians);
        const ax = entry.cx + radius * cos;
        const ay = entry.cy + radius * Math.sin(radians);
        const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
        const x0 = anchor === 'start' ? ax : anchor === 'end' ? ax - entry.w : ax - entry.w / 2;
        const box = { x0, x1: x0 + entry.w, y0: ay - entry.h / 2, y1: ay + entry.h / 2 };
        if (box.x0 < bounds.x0 || box.x1 > bounds.x1 || box.y0 < bounds.y0 || box.y1 > bounds.y1) return;
        if (markers.some((marker) => hits(box, marker))) return;
        if (placed.some((other) => hits(box, other, 2))) return;
        let cost = radius + angleIndex;
        let leader = null;
        if (radius > 14) {
          const tx = anchor === 'start' ? box.x0 - 2 : anchor === 'end' ? box.x1 + 2 : ax;
          const ty = anchor === 'middle' ? (ay < entry.cy ? box.y1 + 1 : box.y0 - 1) : ay;
          const dx = tx - entry.cx;
          const dy = ty - entry.cy;
          const span = Math.hypot(dx, dy) || 1;
          leader = { x1: entry.cx + (dx / span) * 8, y1: entry.cy + (dy / span) * 8, x2: tx, y2: ty };
          // A leader through another marker suggests the wrong owner; one through a label or
          // across another leader is merely harder to follow.
          cost += segmentCrossings(leader.x1, leader.y1, tx, ty, otherMarkers) * 60
            + segmentCrossings(leader.x1, leader.y1, tx, ty, placed) * 60
            + leaders.filter((other) => segmentsCross(leader, other)).length * 35;
        }
        if (!best || cost < best.cost) best = { id: entry.id, cost, box, anchor, x: ax, y: ay + entry.h * 0.31, leader };
      });
    }
    if (!best) {
      // Every candidate collided; keep the label attributable rather than dropping it.
      console.warn(`scatter label ${entry.id} found no free spot; placing it beside its marker`);
      best = { id: entry.id, cost: Infinity, box: { x0: entry.cx + 11, x1: entry.cx + 11 + entry.w, y0: entry.cy - entry.h / 2, y1: entry.cy + entry.h / 2 }, anchor: 'start', x: entry.cx + 11, y: entry.cy + entry.h * 0.31, leader: null };
    }
    return best;
  };
  const ordered = [...entries].sort((a, b) => a.priority - b.priority);
  for (const entry of ordered) placements.set(entry.id, placeOne(entry));
  for (const entry of ordered) {
    const again = placeOne(entry);
    if (again.cost < placements.get(entry.id).cost) placements.set(entry.id, again);
  }
  return placements;
}

function scatterPlotPanel({ number, title, xLabel, yLabel, rows, xValue, yValue, formatX = fmtCompactNumber, formatY = fmtCompactNumber, showInlineNames = false, inlineNameLimit = 10, defaultVisible = 10, pointClass = () => '', tooltipExtra = () => [] }) {
  const points = rows
    .map((row) => ({ row, x: Number(xValue(row)), y: Number(yValue(row)), className: pointClass(row), extra: tooltipExtra(row) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const width = 760;
  const height = 440;
  const margin = { top: 28, right: 32, bottom: 74, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const xMinRaw = Math.min(...xValues);
  const xMaxRaw = Math.max(...xValues);
  const yMinRaw = Math.min(...yValues);
  const yMaxRaw = Math.max(...yValues);
  const xPad = Math.max((xMaxRaw - xMinRaw) * 0.08, xMaxRaw === xMinRaw ? Math.max(1, xMaxRaw * 0.1) : 0);
  const yPad = Math.max((yMaxRaw - yMinRaw) * 0.08, yMaxRaw === yMinRaw ? Math.max(1, yMaxRaw * 0.1) : 0);
  const xMin = Math.max(0, xMinRaw - xPad);
  const xMax = xMaxRaw + xPad;
  const yMin = Math.max(0, yMinRaw - yPad);
  const yMax = Math.min(100, yMaxRaw + yPad);
  const xRange = Math.max(0.0001, xMax - xMin);
  const yRange = Math.max(0.0001, yMax - yMin);
  const xFor = (value) => margin.left + ((value - xMin) / xRange) * plotWidth;
  const yFor = (value) => margin.top + ((yMax - value) / yRange) * plotHeight;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const tooltipWidth = 230;
  const tooltipLines = Math.max(0, ...points.map((point) => Math.min(4, (point.extra ?? []).length)));
  const tooltipHeight = 78 + tooltipLines * 14;
  const tooltipFor = (cx, cy) => {
    const preferRight = cx + tooltipWidth + 18 <= width - margin.right;
    const x = preferRight ? cx + 16 : cx - tooltipWidth - 16;
    const yAbove = cy - tooltipHeight - 16;
    const y = yAbove >= margin.top ? yAbove : cy + 18;
    return {
      x: clamp(x, margin.left, width - margin.right - tooltipWidth),
      y: clamp(y, margin.top, height - margin.bottom - tooltipHeight),
    };
  };
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const safeId = slug(title);
  // Long inline labels are what collide: 27 "#13 - Model Name" strings cannot share the plot, so
  // only the leading entrants carry a name while every point keeps its compact rank label and
  // hover card.
  const labelTextFor = (point) => {
    const labelled = showInlineNames && Number(point.row.overall_rank) <= inlineNameLimit;
    return { labelled, text: labelled ? `#${point.row.overall_rank} - ${shortModelLabel(point.row)}` : `#${point.row.overall_rank}` };
  };
  // Label boxes in viewBox units, calibrated against Chromium's getBBox() of the rendered page:
  // named labels measure 4.8 to 5.4 px per character at 11.5 px, compact rank labels 5.9 px per
  // character at 10.5 px. The 3 px paint-order stroke widens the visible box a little.
  const labelSize = (text, labelled) => ({ w: text.length * (labelled ? 5.6 : 6.1) + 3, h: labelled ? 13 : 12 });
  // One layout per density option. The set of visible markers changes with the density select,
  // so a layout computed for all entrants would push Top 10 labels away from empty space, and a
  // Top 10 layout would let All 27 labels land on markers that were hidden when it was computed.
  const densityOptions = [{ value: 10, label: 'Top 10' }, { value: 15, label: 'Top 15' }, { value: 9999, label: `All ${points.length}` }];
  const labelBounds = { x0: margin.left + 1, x1: width - 3, y0: 3, y1: height - margin.bottom - 3 };
  const layouts = new Map(densityOptions.map(({ value }) => {
    const entries = points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => Number(point.row.overall_rank) <= value)
      .map(({ point, index }) => {
        const { text, labelled } = labelTextFor(point);
        return { id: index, cx: xFor(point.x), cy: yFor(point.y), ...labelSize(text, labelled), priority: Number(point.row.overall_rank) };
      });
    return [value, placeScatterLabels(entries, labelBounds)];
  }));
  const layoutSpec = (placement) => {
    if (!placement) return '';
    const leader = placement.leader ? [placement.leader.x1, placement.leader.y1, placement.leader.x2, placement.leader.y2].map((v) => v.toFixed(1)) : ['', '', '', ''];
    return [placement.x.toFixed(1), placement.y.toFixed(1), placement.anchor, ...leader].join(',');
  };
  return `<figure class="fig scatter-panel">
    <figcaption>
      <span class="fig-n">Figure ${escapeHtml(number)}</span>
      <span class="fig-title">${escapeHtml(title)}</span>
      <span class="fig-note">${escapeHtml(yLabel)} against ${escapeHtml(xLabel.toLowerCase())}. Each point is one tested model; hover or focus a point for its card.</span>
    </figcaption>
    <div class="scatter-controls">
      <label class="scatter-control">
        <span class="scatter-control-label">Entrants shown</span>
        <select class="scatter-filter" data-scatter="${safeId}" aria-label="How many entrants to plot in ${escapeHtml(title)}">
          ${densityOptions.map(({ value, label }) => `<option value="${value}"${(value === 9999 ? defaultVisible > 15 : defaultVisible === value) ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('\n          ')}
        </select>
      </label>
      <small class="scatter-control-note">Names stay on the top ${inlineNameLimit}; every visible point keeps its rank label and hover detail.</small>
    </div>
    <div class="scatter-scroll">
    <svg class="scatter-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="scatter-title-${safeId} scatter-desc-${safeId}">
      <title id="scatter-title-${safeId}">${escapeHtml(title)}</title>
      <desc id="scatter-desc-${safeId}">Each point is one tested model. ${escapeHtml(xLabel)} is plotted on the X-axis and ${escapeHtml(yLabel)} is plotted on the Y-axis.</desc>
      ${ticks.map((ratio) => {
        const x = margin.left + ratio * plotWidth;
        const y = margin.top + ratio * plotHeight;
        return `<line class="scatter-grid" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${margin.top}" y2="${height - margin.bottom}"></line><line class="scatter-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
      }).join('\n')}
      <line class="axis-line" x1="${margin.left}" x2="${width - margin.right}" y1="${height - margin.bottom}" y2="${height - margin.bottom}"></line>
      <line class="axis-line" x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${height - margin.bottom}"></line>
      ${ticks.map((ratio) => {
        const xValueTick = xMin + ratio * xRange;
        const yValueTick = yMin + ratio * yRange;
        const x = margin.left + ratio * plotWidth;
        const y = yFor(yValueTick);
        return `<text class="scatter-tick" x="${x.toFixed(1)}" y="${height - margin.bottom + 22}" text-anchor="middle">${escapeHtml(formatX(xValueTick))}</text><text class="scatter-tick" x="${margin.left - 10}" y="${y.toFixed(1)}" text-anchor="end" dominant-baseline="middle">${escapeHtml(formatY(yValueTick))}</text>`;
      }).join('\n')}
      ${(() => {
        const pointViews = points.map((point, pointIndex) => {
          const cx = xFor(point.x);
          const cy = yFor(point.y);
          const rank = `#${point.row.overall_rank}`;
          const shortLabel = shortModelLabel(point.row);
          const { text: inlineLabel, labelled } = labelTextFor(point);
          // The static markup carries the default density's layout so the page reads correctly
          // without JavaScript; the other densities ride along as data attributes for the select.
          // A point outside the default view takes its all-entrants spot until the select shows it.
          const labelPosition = layouts.get(defaultVisible)?.get(pointIndex) ?? layouts.get(9999).get(pointIndex);
          const layoutAttrs = densityOptions.map(({ value }) => {
            const spec = layoutSpec(layouts.get(value).get(pointIndex));
            return spec ? ` data-lay-${value}="${spec}"` : '';
          }).join('');
          const tooltip = tooltipFor(cx, cy);
          const linkId = `scatter-link-${safeId}-${pointIndex}`;
          const tooltipId = `scatter-tooltip-${safeId}-${pointIndex}`;
          // A label pushed away from its marker stops being attributable to it, so a displaced
          // label gets a leader back to its dot. The leader is rendered inside the point's own
          // anchor so hiding the point hides its leader too, with or without JavaScript; it is
          // present but hidden when the current layout keeps the label beside the marker.
          const leaderLine = labelPosition.leader;
          const leader = leaderLine
            ? `<line class="scatter-leader" x1="${leaderLine.x1.toFixed(1)}" y1="${leaderLine.y1.toFixed(1)}" x2="${leaderLine.x2.toFixed(1)}" y2="${leaderLine.y2.toFixed(1)}"></line>`
            : '<line class="scatter-leader" visibility="hidden"></line>';
          return { point, cx, cy, rank, shortLabel, inlineLabel, labelled, labelPosition, layoutAttrs, leader, tooltip, linkId, tooltipId, extra: point.extra ?? [], className: point.className ?? '' };
        });
        const hoverRules = pointViews
          .map(({ linkId, tooltipId }) => `#${linkId}:hover ~ .scatter-tooltip-layer #${tooltipId}, #${linkId}:has(.scatter-point:hover) ~ .scatter-tooltip-layer #${tooltipId}, #${linkId}:focus ~ .scatter-tooltip-layer #${tooltipId}, #${linkId}:focus-visible ~ .scatter-tooltip-layer #${tooltipId} { opacity: 1; }`)
          .join('\n');
        return `${hoverRules ? `<style>${hoverRules}</style>` : ''}
      ${pointViews.map(({ point, cx, cy, rank, shortLabel, inlineLabel, labelled, labelPosition, layoutAttrs, leader, linkId, tooltipId, className }) => `<a id="${linkId}" class="scatter-link${Number(point.row.overall_rank) > defaultVisible ? ' is-filtered-out' : ''}" data-tooltip-target="${tooltipId}" data-overall-rank="${escapeHtml(point.row.overall_rank)}"${layoutAttrs} href="../${modelPath(point.row)}" aria-label="Open ${escapeHtml(point.row.label)} result">
          ${leader}
          <circle class="scatter-point ${Number(point.row.overall_rank) <= 3 ? 'leader' : ''} ${escapeHtml(className)}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7"><title>${escapeHtml(rank)} - ${escapeHtml(shortLabel)} · ${escapeHtml(point.row.label)} · ${escapeHtml(xLabel)} ${escapeHtml(formatX(point.x))} · ${escapeHtml(yLabel)} ${escapeHtml(formatY(point.y))}</title></circle>
          <text class="scatter-rank-label ${labelled ? 'with-name' : 'compact'}" x="${labelPosition.x.toFixed(1)}" y="${labelPosition.y.toFixed(1)}" text-anchor="${labelPosition.anchor}">${escapeHtml(inlineLabel)}</text>
        </a>`).join('\n')}
      <text class="axis-title scatter-x-title" x="${margin.left + plotWidth / 2}" y="${height - 18}" text-anchor="middle">${escapeHtml(xLabel)}</text>
      <text class="axis-title scatter-y-title" x="20" y="${margin.top + plotHeight / 2}" transform="rotate(-90 20 ${margin.top + plotHeight / 2})" text-anchor="middle">${escapeHtml(yLabel)}</text>
      <g class="scatter-tooltip-layer" aria-hidden="true">
        ${pointViews.map(({ point, rank, shortLabel, tooltip, tooltipId, extra }) => `<g id="${tooltipId}" class="scatter-hover-card" transform="translate(${tooltip.x.toFixed(1)} ${tooltip.y.toFixed(1)})">
          <rect class="scatter-tooltip-box" width="${tooltipWidth}" height="${tooltipHeight}" rx="12"></rect>
          <text class="scatter-tooltip-title" x="12" y="19">${escapeHtml(rank)} - ${escapeHtml(shortLabel)}</text>
          <text class="scatter-tooltip-subtitle" x="12" y="36">${escapeHtml(point.row.label)}</text>
          <text class="scatter-tooltip-metric" x="12" y="53">${escapeHtml(xLabel)}: ${escapeHtml(formatX(point.x))}</text>
          <text class="scatter-tooltip-metric" x="12" y="67">${escapeHtml(yLabel)}: ${escapeHtml(formatY(point.y))}</text>
          ${(extra ?? []).slice(0, 4).map((line, lineIndex) => `<text class="scatter-tooltip-note" x="12" y="${82 + lineIndex * 14}">${escapeHtml(line)}</text>`).join('')}
        </g>`).join('\n')}
      </g>`;
      })()}
    </svg>
    </div>
    <script>
      (() => {
        const svg = document.currentScript?.parentElement?.querySelector('svg.scatter-chart');
        if (!svg) return;
        const hideAll = () => svg.querySelectorAll('.scatter-hover-card.is-visible').forEach((card) => card.classList.remove('is-visible'));
        svg.querySelectorAll('.scatter-link[data-tooltip-target]').forEach((link) => {
          const card = svg.querySelector('#' + link.dataset.tooltipTarget);
          if (!card) return;
          const show = () => {
            hideAll();
            card.classList.add('is-visible');
          };
          const hide = (event) => {
            if (event?.relatedTarget && link.contains(event.relatedTarget)) return;
            card.classList.remove('is-visible');
          };
          link.addEventListener('pointerover', show);
          link.addEventListener('pointerout', hide);
          link.addEventListener('focus', show);
          link.addEventListener('blur', hide);
        });

        // Density control. The panel renders every entrant so the data is complete without
        // JavaScript; the build already marks points past the default as filtered out. This only
        // re-applies that class when the reader picks a different view, and hides any hover card
        // whose point just disappeared so a stale tooltip cannot outlive its marker.
        const figure = document.currentScript?.parentElement;
        const select = figure?.querySelector('.scatter-filter');
        if (!select) return;
        // Each density has its own label layout (computed at build time against the markers that
        // density shows), carried on the anchor as data-lay-<limit>: label x, y, anchor, then the
        // leader line endpoints, empty when the label sits beside its marker.
        const applyLayout = (link, limit) => {
          const spec = link.getAttribute('data-lay-' + limit);
          if (!spec) return;
          const [x, y, anchor, x1, y1, x2, y2] = spec.split(',');
          const label = link.querySelector('.scatter-rank-label');
          const leader = link.querySelector('.scatter-leader');
          if (label) {
            label.setAttribute('x', x);
            label.setAttribute('y', y);
            label.setAttribute('text-anchor', anchor);
          }
          if (!leader) return;
          if (x1) {
            leader.setAttribute('x1', x1);
            leader.setAttribute('y1', y1);
            leader.setAttribute('x2', x2);
            leader.setAttribute('y2', y2);
            leader.removeAttribute('visibility');
          } else {
            leader.setAttribute('visibility', 'hidden');
          }
        };
        const applyFilter = () => {
          const limit = Number(select.value);
          svg.querySelectorAll('.scatter-link[data-overall-rank]').forEach((link) => {
            const filtered = Number(link.dataset.overallRank) > limit;
            link.classList.toggle('is-filtered-out', filtered);
            if (filtered) svg.querySelector('#' + link.dataset.tooltipTarget)?.classList.remove('is-visible');
            else applyLayout(link, limit);
          });
          hideAll();
        };
        select.addEventListener('change', applyFilter);
        applyFilter();
      })();
    </script>
  </figure>`;
}

function tradeoffScatterMaps(rows) {
  const telemetry = new Map(rows.map((row) => [row.id, row.telemetry ?? publicTelemetry(row)]));
  const getTelemetry = (row) => telemetry.get(row.id) ?? row.telemetry ?? publicTelemetry(row);
  const telemetryClass = (status) => status === 'complete' ? '' : status === 'limited' ? 'telemetry-limited' : 'telemetry-missing';
  const coverageLine = (label, coveragePct) => `${label} coverage: ${fmt(coveragePct, 0)}%`;
  const tokenBreakdownLines = (row) => {
    const tokens = getTelemetry(row).tokens;
    return [
      `Tokens total: ${fmtCompactNumber(tokens.recorded_total)}`,
      `Median / item: ${tokens.median_per_scored_item === null ? '—' : fmtCompactNumber(tokens.median_per_scored_item)}`,
      `P90 / item: ${tokens.p90_per_scored_item === null ? '—' : fmtCompactNumber(tokens.p90_per_scored_item)}`,
      coverageLine('Token', tokens.coverage_pct),
    ];
  };
  return `<div class="tradeoff-scatter-grid">
    ${scatterPlotPanel({
      number: 2,
      title: 'Cost × overall',
      xLabel: 'Measured cost',
      yLabel: 'Overall score',
      rows,
      xValue: (row) => getTelemetry(row).cost,
      yValue: (row) => getTelemetry(row).overall,
      formatX: fmtCost,
      formatY: (value) => fmt(value, 1),
      showInlineNames: true,
    })}
    ${scatterPlotPanel({
      number: 3,
      title: 'Runtime × overall',
      xLabel: 'Seconds / timed item',
      yLabel: 'Overall score',
      rows,
      xValue: (row) => getTelemetry(row).runtime.seconds_per_timed_item,
      yValue: (row) => getTelemetry(row).overall,
      formatX: (value) => `${fmtCompactNumber(value)}s`,
      formatY: (value) => fmt(value, 1),
      showInlineNames: true,
      pointClass: (row) => telemetryClass(getTelemetry(row).runtime.status),
      tooltipExtra: (row) => [coverageLine('Runtime', getTelemetry(row).runtime.coverage_pct)],
    })}
    ${scatterPlotPanel({
      number: 4,
      title: 'Recorded tokens/item × cost',
      xLabel: 'Recorded tokens / scored item',
      yLabel: 'Measured cost',
      rows,
      xValue: (row) => getTelemetry(row).tokens.per_scored_item_recorded,
      yValue: (row) => getTelemetry(row).cost,
      formatX: fmtCompactNumber,
      formatY: fmtCost,
      pointClass: (row) => telemetryClass(getTelemetry(row).tokens.status),
      tooltipExtra: tokenBreakdownLines,
    })}
  </div>`;
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

function laneBalancePressureRows(rows) {
  const pressureRows = rows
    .map((row) => {
      const entries = laneScoreEntries(row);
      if (entries.length < 2) return null;
      const ordered = [...entries].sort((a, b) => b.value - a.value);
      const strongest = ordered[0];
      const weakest = ordered.at(-1);
      return { row, strongest, weakest, pressure: strongest.value - weakest.value };
    })
    .filter(Boolean)
    .sort((a, b) => b.pressure - a.pressure);
  const maxPressure = Math.max(...pressureRows.map((entry) => entry.pressure), 0.001);
  return pressureRows.map(({ row, strongest, weakest, pressure }) => {
    const bar = Math.max(2, Math.min(100, (pressure / maxPressure) * 100));
    return `<div class="bar-row pressure-row" style="--bar:${bar.toFixed(2)}%">
      <a href="../${modelPath(row)}">${escapeHtml(row.label)}</a>
      <div class="bar-track" aria-hidden="true"><i></i></div>
      <strong>${fmt(pressure)}</strong>
      <small>${escapeHtml(weakest.label)} ${fmt(weakest.value)} vs ${escapeHtml(strongest.label)} ${fmt(strongest.value)} · rank #${escapeHtml(row.overall_rank)}</small>
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
  return cards.map(([title, text]) => `<article class="ranking-insight-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`).join('\n');
}

function rankingDetailedTableRow(row) {
  const telemetry = row.telemetry ?? publicTelemetry(row);
  const hard = row.hard_intelligence;
  return `<tr>
    <td class="rank-cell" data-label="Rank">${escapeHtml(row.overall_rank)}</td>
    <td class="model-cell" data-label="Model"><a class="model-link" href="../${modelPath(row)}"><strong>${escapeHtml(row.label)}</strong></a>${modelBadgeMarkup(row)}<small class="model-basis">${escapeHtml(row.basis)}</small></td>
    ${scoreCell(row.overall_score, { label: 'Overall', className: 'overall-cell' })}
    ${scoreCell(row.full?.final, { label: 'Full', rank: row.full_rank })}
    ${scoreCell(row.swe?.swe_score, { label: 'SWE', rank: row.swe_rank })}
    ${scoreCell(hard?.diagnostic_score, { label: 'Hard Intelligence', rank: hard ? row.hard_rank : null, extra: hardSublaneBars(row), blankLabel: hard ? 'Diagnostic telemetry; not part of overall' : 'Not measured' })}
    <td class="formula-cell" data-label="Formula">${escapeHtml(overallFormula(row))}</td>
    <td class="num-cell telemetry-cell" data-label="Cost and telemetry">${fmtCost(totalMeasuredCost(row))}<small>${telemetry.runtime.seconds_per_timed_item === null ? 'runtime not recorded' : `${fmt(telemetry.runtime.seconds_per_timed_item)}s per item`}</small><small>tokens ${escapeHtml(telemetry.tokens.status)}</small></td>
    <td class="reason-cell" data-label="Why here">${escapeHtml(rankingReason(row))}</td>
  </tr>`;
}

async function writeRankingPage() {
  const leader = rankedRows[0];
  const hardMeasured = rankedRows.filter((row) => row.hard_intelligence).length;
  const spread = Number(rankedRows[0]?.overall_score ?? 0) - Number(rankedRows.at(-1)?.overall_score ?? 0);
  const chartRows = rankedRows;
  const topLaneRows = rankedRows.slice(0, 8);
  const content = `<main class="detail-main ranked-detail-page" id="top">
    <section class="page-hero">
      <a class="back-link" href="../#ranking">Back to the overview</a>
      <p class="kicker">Unified ranking, lane-aware explanation</p>
      <h1>Why the ranking looks like this.</h1>
      <p class="hero-lead">The public ranking is not a single vibe score. It orders measured entrants by a transparent overall formula while keeping Full / Agentic, SWE MVP, Hard Intelligence, cost, and reliability visible.</p>
      <div class="detail-actions">
        <a class="button primary" href="#ranking-table">Read the table</a>
        <a class="button secondary" href="../data/model-comparison.json">Download public JSON</a>
      </div>
    </section>

    <section class="section result-stat-grid" aria-label="Ranking summary">
      ${statCard('Ranked entrants', String(rankedRows.length), `${hardMeasured} with Hard Intelligence data`)}
      ${statCard('Current leader', leader.label, `Overall ${fmt(leader.overall_score)}`)}
      ${statCard('Score spread', fmt(spread), `#1 to #${rankedRows.at(-1)?.overall_rank ?? '—'}`)}
      ${statCard('Formula', 'Lane mean', 'Full + SWE + published Hard Intelligence when measured')}
      ${statCard('Data refresh', dataDateLabel, 'Static HTML plus public JSON')}
    </section>

    <section class="section ranking-chart-grid" aria-label="Ranking charts">
      ${rankingChartCard(1, 'Overall ladder', 'Every ranked entrant ordered by public overall score.', `<div class="bar-chart">${rankingBarRows(chartRows, (row) => row.overall_score, (row) => `rank #${row.overall_rank}`)}</div>`, 'Overall is a lane mean, not a hidden replacement for source measurements.')}

      <div class="section-head scatter-head">
        <div>
          <h2>Tradeoff scatter maps</h2>
          <p>Each point is one tested model at the intersection of two public telemetry axes. Use the maps to read quality against cost, speed, and recorded token use. Runtime and token axes are normalized per item and show coverage in the hover cards; they are telemetry, not current overall score inputs.</p>
        </div>
      </div>
      ${tradeoffScatterMaps(chartRows)}

      ${rankingChartCard(5, 'Lane contrast', 'Top eight entrants with Full, SWE, and Hard Intelligence shown side by side.', `<div class="lane-compare-chart">${laneComparisonRows(topLaneRows)}</div>`, 'Hard Intelligence is shown as its own lane so cross-lane strengths and weaknesses stay visible.')}
      ${rankingChartCard(6, 'Measured cost context', 'Cost is shown because deployment economics matter, but it does not secretly rewrite capability scores.', `<div class="bar-chart compact">${costRows(chartRows)}</div>`, 'Very expensive rows are not punished twice; cost is visible telemetry and part of the public interpretation.')}
      ${rankingChartCard(7, 'Lane balance pressure', 'Largest gap between each entrant’s strongest and weakest measured major lane.', `<div class="bar-chart compact">${laneBalancePressureRows(chartRows)}</div>`, 'Lower pressure means a more even profile; higher pressure explains why one strong lane may not lift the overall rank by itself.', 'balance-chart-card')}
    </section>

    <section class="section ranking-insight-grid" aria-label="Ranking explanation notes">
      <div class="section-head"><h2>Reading notes</h2></div>
      <div class="insight-list">
        ${rankingInsightCards()}
      </div>
    </section>

    <section id="ranking-table" class="section ranking-section ranking-page-table" aria-labelledby="ranking-page-table-title">
      <div class="section-head">
        <div>
          <h2 id="ranking-page-table-title">Table with reasons, not just numbers.</h2>
          <p>Each row states the score formula, lane ranks, cost context, and the main reason the entrant lands at its current position.</p>
        </div>
        <a class="data-link" href="../data/model-comparison.json">Ranking data</a>
      </div>
      <div class="table-wrap ranking-explained-table">
        <table class="ranking-table explained-table" aria-label="Explained Resyst Labs model ranking">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Model</th>
              <th scope="col">Overall</th>
              <th scope="col">Full</th>
              <th scope="col">SWE</th>
              <th scope="col">Hard Intelligence</th>
              <th scope="col">Formula</th>
              <th scope="col">Cost and telemetry</th>
              <th scope="col">Why here</th>
            </tr>
          </thead>
          <tbody>
            ${rankedRows.map(rankingDetailedTableRow).join('\n')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section result-card-grid ranking-method-grid" aria-label="Ranking method explanation">
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
    navCurrent: 'ranking',
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

function encounterFacts(group) {
  const totalTurns = group.matches.reduce((sum, match) => sum + (Number(match.turns) || 0), 0);
  const latestDate = group.matches.map(matchDateLabel).filter(Boolean).sort().at(-1) ?? 'undated';
  const lanes = [...new Set(group.matches.map((match) => match.lane).filter(Boolean))];
  return `<ul class="encounter-facts">
            <li><b>${group.matches.length}</b> ${group.matches.length === 1 ? 'replay' : 'replays'}</li>
            <li><b>${totalTurns}</b> turns</li>
            <li>latest ${escapeHtml(latestDate)}</li>
            ${lanes.map((lane) => `<li>${escapeHtml(lane)}</li>`).join('')}
          </ul>`;
}

function overviewEncounterCard(group, groupIndex) {
  const firstMatch = group.matches[0];
  return `<article class="encounter-summary-card" id="highlight-${escapeHtml(group.id)}">
        <div class="encounter-summary-head">
          <span class="match-label">Encounter ${groupIndex + 1}</span>
          <h3>${escapeHtml(group.title)}</h3>
          <p><strong>${escapeHtml(encounterWinnerSummary(group))}</strong>. <span class="encounter-note">Replays stay grouped under the model-vs-model encounter, including side-swapped rounds.</span></p>
          ${encounterFacts(group)}
        </div>
        <div class="home-replay-tabs" aria-label="${escapeHtml(group.title)} replay shortcuts">
          ${group.matches.map((match, index) => {
            const label = match.series_id ? `Round ${index + 1}` : group.matches.length > 1 ? `Replay ${index + 1}` : 'Replay';
            return `<a class="home-replay-link" href="arena/#${encodeURIComponent(match.id)}">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(compactEntrant(match.winner_label))}</strong>
              <small>${escapeHtml(prettyReason(match.winner_reason))}</small>
              <small>seed ${escapeHtml(match.seed ?? 'fixed')}</small>
            </a>`;
          }).join('')}
        </div>
        <a class="row-action match-action" href="arena/#${encodeURIComponent(firstMatch?.id ?? group.id)}">Open encounter</a>
      </article>`;
}

async function hydrateOverviewHtml() {
  const indexPath = path.join(dist, 'index.html');
  const leader = rankedRows[0];
  const matches = arena.matches ?? [];
  const encounterGroups = buildEncounterGroups(matches).slice(0, 3);
  const fill = (html, id, inner) => {
    const pattern = new RegExp(`(<(\\w+) id="${id}"[^>]*>)[\\s\\S]*?(</\\2>)`);
    if (!pattern.test(html)) throw new Error(`index.html is missing the #${id} hydration target`);
    return html.replace(pattern, (_, open, tag, close) => `${open}${inner}${close}`);
  };
  let html = await readFile(indexPath, 'utf8');
  html = fill(html, 'leader-name', escapeHtml(leader?.label ?? 'Pending data'));
  html = fill(html, 'leader-score-value', leader ? fmt(leader.overall_score) : '—');
  html = fill(html, 'leader-score', leader ? escapeHtml(leader.basis) : 'No ranked data loaded');
  html = fill(html, 'leader-lanes', leader ? laneMiniList(leader, 'plate-lanes') : '');
  html = fill(html, 'model-count', String(rankedRows.length));
  html = fill(html, 'arena-count', String(matches.length));
  html = fill(html, 'data-date', escapeHtml(dataDateLabel));
  html = fill(html, 'score-spectrum', spectrumMarkup(rankedRows));
  html = fill(html, 'lane-strips', laneStripsMarkup(rankedRows, matches));
  html = fill(html, 'podium', `\n${rankedRows.slice(0, 3).map(overviewPodiumCard).join('\n')}\n        `);
  html = fill(html, 'ranking-body', `\n${rankedRows.map(overviewRankingRow).join('\n')}\n            `);
  html = fill(html, 'arena-board-figure', await finalBoardFigure(matches[0]));
  html = fill(html, 'arena-matches', `\n${encounterGroups.map(overviewEncounterCard).join('\n')}\n        `);
  html = html
    .replace('<body class="home-page">', '<body class="home-page" data-hydrated="true">')
    .replace('</head>', `    ${schemaScript(rankingItemListSchema())}\n  </head>`);
  await writeFile(indexPath, html);
}


function hardAgenticDatasetSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: hardAgentic.summary?.title ?? 'Hard Agentic Tool Benchmark',
    description: 'Separate native tool benchmark lane for field disambiguation, authority rules, retries, hostile data, and source-of-record handling.',
    url: `${site}hard-agentic/`,
    license: `${site}#methodology`,
    creator: organizationSchema(),
    distribution: {
      '@type': 'DataDownload',
      encodingFormat: 'application/json',
      contentUrl: `${site}data/hard-agentic-tool.json`,
    },
  };
}

function hardAgenticRows() {
  return [...(hardAgentic.rows ?? [])]
    .sort((a, b) => Number(a.rank ?? 999) - Number(b.rank ?? 999))
    .map((row) => `<tr>
      <td class="rank-cell" data-label="Rank">${escapeHtml(row.rank)}</td>
      <td class="model-cell" data-label="Model"><strong>${escapeHtml(row.label)}</strong><small class="model-basis">${escapeHtml(row.provider)}, ${escapeHtml(row.runtime)}</small></td>
      ${scoreCell(row.score, { label: 'Score', className: 'overall-cell' })}
      <td class="num-cell" data-label="Task range">${fmt(row.task_min)} to ${fmt(row.task_max)}</td>
      <td class="num-cell" data-label="Pass rate">${fmt(row.pass_rate_pct, 0)}%</td>
      <td data-label="Native tools">${row.native_tool_valid ? 'valid' : 'excluded'}</td>
    </tr>`).join('\n');
}

function hardAgenticControlRows() {
  return (hardAgentic.controls ?? [])
    .map((control) => `<div class="bar-row hard-agentic-control ${control.passed ? 'control-pass' : 'control-fail'}" style="--bar:${Math.max(2, Math.min(100, Number(control.score) || 0)).toFixed(2)}%">
      <strong>${escapeHtml(control.label)}</strong>
      <div class="bar-track" aria-hidden="true"><i></i></div>
      <span>${fmt(control.score)} / limit ${fmt(control.limit, 0)}</span>
      <small>${control.passed ? 'below guardrail' : 'above guardrail'}</small>
    </div>`).join('\n');
}

function hardAgenticTaskRows() {
  return [...(hardAgentic.tasks ?? [])]
    .sort((a, b) => Number(b.spread ?? 0) - Number(a.spread ?? 0))
    .map((task) => `<div class="bar-row hard-agentic-task" style="--bar:${Math.max(2, Math.min(100, Number(task.spread) || 0)).toFixed(2)}%">
      <strong>${escapeHtml(task.label)}</strong>
      <div class="bar-track" aria-hidden="true"><i></i></div>
      <span>${fmt(task.spread)}</span>
      <small>best ${fmt(task.best)} · worst ${fmt(task.worst)}</small>
    </div>`).join('\n');
}

async function writeHardAgenticPage() {
  const summary = hardAgentic.summary ?? {};
  const rows = [...(hardAgentic.rows ?? [])].sort((a, b) => Number(a.rank ?? 999) - Number(b.rank ?? 999));
  const leader = rows[0];
  const content = `<main class="detail-main hard-agentic-page" id="top">
    <section class="page-hero">
      <a class="back-link" href="../ranking/">Back to the ranking</a>
      <p class="kicker">Hard Agentic Tool Benchmark, a separate lane</p>
      <h1>Hard native tool tasks, reported separately.</h1>
      <p class="hero-lead">This lane targets native-tool-capable models with ambiguous operational data: similar fields, production versus staging, date and status authority, retries, units, policy lookup, hostile data, and fallback ownership. It does not change the global overall ranking yet.</p>
      <div class="detail-actions">
        <a class="button primary" href="#hard-agentic-table">Read the lane table</a>
        <a class="button secondary" href="../data/hard-agentic-tool.json">Download lane JSON</a>
      </div>
    </section>

    <section class="section result-stat-grid" aria-label="Hard Agentic summary">
      ${statCard('Measured rows', String(summary.row_count ?? rows.length), 'native tool rows only')}
      ${statCard('Lane leader', leader?.label ?? 'Pending', `score ${fmt(leader?.score)}`)}
      ${statCard('Score spread', fmt(summary.score_spread), `${fmt(summary.score_min)} to ${fmt(summary.score_max)}`)}
      ${statCard('Dispersion', fmt(summary.stddev_population), 'population standard deviation')}
      ${statCard('Flat perfect tasks', String(summary.all_rows_perfect_tasks ?? 0), 'tasks where every row scored 100')}
      ${statCard('High-spread tasks', String(summary.tasks_with_spread_gte_25 ?? 0), 'tasks with spread at least 25')}
    </section>

    <section id="hard-agentic-table" class="section ranking-section ranking-page-table" aria-labelledby="hard-agentic-table-title">
      <div class="section-head">
        <div>
          <h2 id="hard-agentic-table-title">Native-tool rows on the hard agentic lane.</h2>
          <p>Scores are capability averages across ${escapeHtml(summary.task_count ?? 14)} tasks. The public overall score is unchanged.</p>
        </div>
        <a class="data-link" href="../data/hard-agentic-tool.json">Lane data</a>
      </div>
      <div class="table-wrap ranking-explained-table hard-agentic-table">
        <table class="ranking-table" aria-label="Hard Agentic Tool Benchmark lane results">
          <thead><tr><th scope="col">Rank</th><th scope="col">Model</th><th scope="col">Score</th><th scope="col">Task range</th><th scope="col">Pass rate</th><th scope="col">Native tools</th></tr></thead>
          <tbody>${hardAgenticRows()}</tbody>
        </table>
      </div>
    </section>

    <section class="section ranking-chart-grid hard-agentic-grid" aria-label="Hard Agentic controls and task spread">
      ${rankingChartCard(1, 'Task spread', 'Tasks ordered by the spread between the best and worst measured row.', `<div class="bar-chart compact">${hardAgenticTaskRows()}</div>`, `${escapeHtml(summary.tasks_with_spread_gte_25 ?? 0)} of the ${escapeHtml(summary.task_count ?? 14)} tasks separate rows by at least 25 points in the measured set.`)}
      ${rankingChartCard(2, 'Shortcut controls', 'All control bots remain below their guardrail limits.', `<div class="bar-chart compact">${hardAgenticControlRows()}</div>`, 'These controls protect against answers from snippets, guessing, first hits, or broad tool spraying.')}
    </section>

    <section class="section ranking-insight-grid" aria-label="Hard Agentic interpretation notes">
      <div class="section-head"><h2>Reading notes</h2></div>
      <div class="insight-list">
        <article class="ranking-insight-card"><h3>Why it is separate</h3><p>The global ranking remains unchanged while the lane matures. It is a harder tool-use slice, not a silent replacement for Full, SWE, or Hard Intelligence.</p></article>
        <article class="ranking-insight-card"><h3>What it measures</h3><p>Models must choose authority, follow pointers, recover from transient tool failures, reject misleading snippets, convert units, and ignore injected instructions inside data fields.</p></article>
        <article class="ranking-insight-card"><h3>What does not count</h3><p>Rows that cannot produce native tool calls are excluded from difficulty claims. Protocol failure is not model weakness under the lane.</p></article>
        <article class="ranking-insight-card"><h3>Control guardrails</h3><p>Snippet reading, blind guessing, first-hit extraction, and broad tool spraying all stay below their limits, so the lane is not solved by cheap shortcuts.</p></article>
      </div>
    </section>
  </main>`;
  const outDir = path.join(dist, 'hard-agentic');
  await mkdir(outDir, { recursive: true });
  const title = 'Hard Agentic Tool Benchmark | Resyst Labs';
  const description = 'Separate hard native-tool benchmark lane for agentic AI models, covering authority, retries, unit handling, hostile data, and shortcut controls.';
  await writeFile(path.join(outDir, 'index.html'), pageShell({
    title,
    description,
    canonicalPath: 'hard-agentic/',
    prefix: '../',
    bodyClass: 'detail-page hard-agentic-page-body',
    navCurrent: 'hard-agentic',
    content,
    structuredData: [
      webPageSchema({ title, description, url: `${site}hard-agentic/` }),
      breadcrumbSchema([
        { name: 'Resyst Labs Benchmarks', url: site },
        { name: 'Hard Agentic Tool Benchmark', url: `${site}hard-agentic/` },
      ]),
      hardAgenticDatasetSchema(),
    ],
  }));
}

async function writeArenaPage() {
  const matches = arena.matches ?? [];
  const encounterGroups = buildEncounterGroups(matches);
  const selectedMatchId = matches[0]?.id;
  const content = `<main class="detail-main arena-detail" id="top">
    <section class="page-hero">
      <a class="back-link" href="../#arena">Back to the overview</a>
      <p class="kicker">Resyst Arena replay room</p>
      <h1>Tactical evidence you can replay.</h1>
      <p class="hero-lead">Resyst Arena is a deterministic turn-based evaluation environment for spatial strategy, legal-action discipline, and long-horizon tactical continuity. Replays are grouped by encounter so historical DeepSeek vs Step, DeepSeek vs Gemini, and DeepSeek vs Kimi runs stay readable instead of collapsing into one flat match list.</p>
      <div class="detail-actions">
        <a class="button primary" href="#replays">Browse encounters</a>
        <a class="button secondary" href="../data/arena-snapshots.json">Download Arena data</a>
      </div>
    </section>

    <section class="section result-stat-grid arena-rule-grid" aria-label="Arena method principles">
      ${statCard('Score boundary', 'Outcome first', 'Latency, token use, and cost are telemetry, not hidden score modifiers.')}
      ${statCard('Encounter grouping', 'Pairing first', 'Replay buttons live under the model-vs-model encounter they belong to, including side-swapped rounds.')}
      ${statCard('Replay contract', 'Sanitized state', 'Replay JSON exposes board states, actions, events, and telemetry while excluding raw model text outputs.')}
    </section>

    <section id="replays" class="section replay-list" aria-label="Arena encounters and replays">
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
    navCurrent: 'arena',
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

await writeFile(path.join(dist, 'data/model-comparison.json'), `${JSON.stringify(models, null, 2)}\n`);
await writeFile(path.join(dist, 'data/hard-agentic-tool.json'), `${JSON.stringify(hardAgentic, null, 2)}\n`);

await writeModelPages();
await writeRankingPage();
await writeHardAgenticPage();
await writeArenaPage();
await hydrateOverviewHtml();

const today = dataDate;
const urls = [
  ['', '1.0'],
  ['ranking/', '0.96'],
  ['hard-agentic/', '0.92'],
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
