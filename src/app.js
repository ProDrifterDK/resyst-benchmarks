// Client-side fallback renderer for the overview. The build hydrates every data
// region into static HTML; this module only redraws them when that hydration is
// absent (for example when src/ is served directly), using the same markup.

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const formatNumber = (value, digits = 1) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits);
};

const formatCost = (value) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '—';
  if (Number(value) === 0) return '$0';
  return `$${Number(value).toFixed(Number(value) < 0.01 ? 4 : 3)}`;
};

const shortDate = (iso) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(iso));
};

const pctOf = (value) => `${Math.max(0, Math.min(100, Number(value))).toFixed(1)}%`;
const modelPath = (row) => `models/${encodeURIComponent(row.id)}/`;
const isLocalModel = (row) => row.runtime_type === 'local'
  || row.location === 'local'
  || row.provider === 'local'
  || String(row.cost_class ?? '').includes('local');
const modelBadgeMarkup = (row) => {
  const badges = [];
  if (isLocalModel(row)) badges.push({ label: 'Local model', className: 'local-model-badge', title: 'Benchmarked on local hardware' });
  return badges.length
    ? `<span class="model-badge-list" aria-label="Runtime badges">${badges.map((badge) => `<span class="model-badge ${badge.className}" title="${escapeHtml(badge.title)}">${escapeHtml(badge.label)}</span>`).join('')}</span>`
    : '';
};
const microBar = (value) => (Number.isFinite(Number(value)) ? `<i class="micro-bar" style="--v:${pctOf(value)}" aria-hidden="true"></i>` : '');
const hardLaneMeta = [
  ['active_information_acquisition', 'Active inquiry'],
  ['online_adaptation_fast_learning', 'Online adaptation'],
  ['evidence_driven_self_repair', 'Self-repair'],
  ['authority_salience_constraint_integrity', 'Authority integrity'],
];
const hardSublaneBars = (row) => {
  const lanes = row.hard_intelligence?.lanes;
  if (!lanes) return '';
  const title = hardLaneMeta.map(([key, label]) => `${label} ${formatNumber(lanes[key], 2)}`).join(', ');
  return `<span class="sublanes" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${hardLaneMeta.map(([key]) => `<i style="--v:${pctOf(lanes[key])}"></i>`).join('')}</span>`;
};
const scoreCell = (value, { label, className = '', rank = null, extra = '', blankLabel = 'Not measured' } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return `<td class="score-cell is-blank${className ? ` ${className}` : ''}" data-label="${escapeHtml(label)}" aria-label="${escapeHtml(blankLabel)}"></td>`;
  }
  return `<td class="score-cell${className ? ` ${className}` : ''}" data-label="${escapeHtml(label)}"><span class="score-value">${formatNumber(number, 2)}</span>${rank ? `<small class="score-rank">#${escapeHtml(rank)}</small>` : ''}${microBar(number)}${extra}</td>`;
};
const prettyReason = (value = 'resolved') => String(value).replaceAll('_', ' ');

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
        id: `encounter-${key.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')}`,
        title: `${first} vs ${second}`,
        key,
        matches: [],
      });
    }
    groups.get(key).matches.push(match);
  }
  return [...groups.values()];
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

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
  return response.json();
}

function renderHero(models, arena) {
  const rows = [...models.rows]
    .filter((row) => Number.isFinite(row.overall_rank))
    .sort((a, b) => a.overall_rank - b.overall_rank);
  const leader = rows[0];

  document.querySelector('#leader-name').textContent = leader?.label ?? 'Pending data';
  document.querySelector('#leader-score-value').textContent = leader ? formatNumber(leader.overall_score, 2) : '—';
  document.querySelector('#leader-score').textContent = leader ? leader.basis : 'No ranked data loaded';
  document.querySelector('#model-count').textContent = rows.length;
  document.querySelector('#arena-count').textContent = arena.matches?.length ?? 0;
  document.querySelector('#data-date').textContent = shortDate(models.generated_at);
  const lanes = leader ? [['Full', leader.full?.final], ['SWE', leader.swe?.swe_score], ['Hard Intelligence', leader.hard_intelligence?.diagnostic_score]] : [];
  document.querySelector('#leader-lanes').innerHTML = lanes.length
    ? `<dl class="plate-lanes">${lanes.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${Number.isFinite(Number(value)) ? `${formatNumber(value, 2)}${microBar(value)}` : '<span class="blank">not measured</span>'}</dd></div>`).join('')}</dl>`
    : '';
}

function renderPodium(models) {
  const podium = document.querySelector('#podium');
  const rows = [...models.rows]
    .filter((row) => Number.isFinite(row.overall_rank))
    .sort((a, b) => a.overall_rank - b.overall_rank)
    .slice(0, 3);

  podium.innerHTML = rows.map((row) => {
    const lanes = [
      ['Full', row.full?.final],
      ['SWE', row.swe?.swe_score],
      ['Hard Intelligence', row.hard_intelligence?.diagnostic_score],
    ];
    return `
    <article class="podium-card rank-${escapeHtml(row.overall_rank)}">
      <a class="podium-link" href="${modelPath(row)}" aria-label="Open result page for ${escapeHtml(row.label)}"></a>
      <span class="podium-rank">${escapeHtml(row.overall_rank)}</span>
      <div class="podium-body">
        <h3>${escapeHtml(row.label)}</h3>
        ${modelBadgeMarkup(row)}
        <p class="podium-basis">${escapeHtml(row.basis)}</p>
      </div>
      <span class="podium-score"><b>${formatNumber(row.overall_score, 2)}</b><i>overall</i></span>
      <dl class="podium-lanes">
        ${lanes.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${Number.isFinite(Number(value)) ? `${formatNumber(value, 2)}${microBar(value)}` : '<span class="blank">not measured</span>'}</dd></div>`).join('')}
      </dl>
      <span class="podium-cta">Open result</span>
    </article>
  `;
  }).join('');
}

function renderRanking(models) {
  const body = document.querySelector('#ranking-body');
  const rows = [...models.rows]
    .filter((row) => Number.isFinite(row.overall_rank))
    .sort((a, b) => a.overall_rank - b.overall_rank);

  body.innerHTML = rows.map((row) => {
    const reliability = row.swe?.reliability ?? row.full?.reliability;
    const cost = (row.full?.cost ?? 0) + (row.swe?.cost ?? 0) + (row.hard_intelligence?.cost ?? 0);
    const hard = row.hard_intelligence;
    return `
      <tr>
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
        <td class="num-cell" data-label="Cost">${formatCost(cost)}</td>
        <td class="num-cell" data-label="Reliability">${formatNumber(reliability, 1)}%</td>
        <td class="action-cell"><a class="row-action" href="${modelPath(row)}">Result</a></td>
      </tr>
    `;
  }).join('');
}

function renderArena(arena) {
  const container = document.querySelector('#arena-matches');
  const matches = arena.matches ?? [];
  const encounterGroups = buildEncounterGroups(matches).slice(0, 3);

  container.innerHTML = encounterGroups.map((group, groupIndex) => {
    const firstMatch = group.matches[0];
    return `
      <article class="encounter-summary-card" id="highlight-${escapeHtml(group.id)}">
        <div class="encounter-summary-head">
          <span class="match-label">Encounter ${groupIndex + 1}</span>
          <h3>${escapeHtml(group.title)}</h3>
          <p><strong>${escapeHtml(encounterWinnerSummary(group))}</strong>. Replays stay grouped under the model-vs-model encounter, including side-swapped rounds.</p>
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
      </article>
    `;
  }).join('');
}

async function main() {
  if (document.body.dataset.hydrated === 'true') return;
  const [models, arena] = await Promise.all([
    loadJson('data/model-comparison.json'),
    loadJson('data/arena-snapshots.json'),
  ]);
  renderHero(models, arena);
  renderPodium(models);
  renderRanking(models);
  renderArena(arena);
}

main().catch((error) => {
  console.error(error);
  document.querySelector('#leader-name').textContent = 'Data unavailable';
  document.querySelector('#leader-score').textContent = 'The public data file could not be loaded.';
});
