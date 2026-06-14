import './background.js';

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

const formatOptionalScore = (value, digits = 2) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '';
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

const sideValue = (map, side) => map?.[side] ?? 0;
const modelPath = (row) => `models/${encodeURIComponent(row.id)}/`;
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

  document.querySelector('#leader-name').textContent = leader?.label ?? 'Pending artifact';
  document.querySelector('#leader-score').textContent = leader
    ? `Overall ${formatNumber(leader.overall_score, 2)} · ${leader.basis}`
    : 'No ranked data loaded';
  document.querySelector('#model-count').textContent = rows.length;
  document.querySelector('#arena-count').textContent = arena.matches?.length ?? 0;
  document.querySelector('#data-date').textContent = shortDate(models.generated_at);
}

function renderPodium(models) {
  const podium = document.querySelector('#podium');
  const rows = [...models.rows]
    .filter((row) => Number.isFinite(row.overall_rank))
    .sort((a, b) => a.overall_rank - b.overall_rank)
    .slice(0, 3);

  podium.innerHTML = rows.map((row) => `
    <article class="podium-card">
      <a class="podium-link" href="${modelPath(row)}" aria-label="Open result page for ${escapeHtml(row.label)}"></a>
      <span class="podium-rank">#${row.overall_rank}</span>
      <h3>${escapeHtml(row.label)}</h3>
      <p>${escapeHtml(row.basis)}</p>
      <span class="podium-cta">Open result →</span>
      <span class="podium-score">${formatNumber(row.overall_score, 1)}</span>
    </article>
  `).join('');
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
    const pendingHardAttrs = hard ? '' : ' class="pending-score-cell" aria-label="Not measured"';
    return `
      <tr>
        <td class="rank-cell">#${row.overall_rank}</td>
        <td class="model-cell">
          <a class="model-link" href="${modelPath(row)}"><strong>${escapeHtml(row.label)}</strong></a>
          <span>${escapeHtml(row.id)}</span>
        </td>
        <td>${escapeHtml(row.basis)}</td>
        <td class="score-cell">${formatNumber(row.overall_score, 2)}</td>
        <td>${formatNumber(row.full?.final, 2)}</td>
        <td>${formatNumber(row.swe?.swe_score, 2)}</td>
        <td${pendingHardAttrs}>${formatOptionalScore(hard?.diagnostic_score)}</td>
        <td${pendingHardAttrs}>${formatOptionalScore(hard?.lanes?.active_information_acquisition)}</td>
        <td${pendingHardAttrs}>${formatOptionalScore(hard?.lanes?.online_adaptation_fast_learning)}</td>
        <td${pendingHardAttrs}>${formatOptionalScore(hard?.lanes?.evidence_driven_self_repair)}</td>
        <td${pendingHardAttrs}>${formatOptionalScore(hard?.lanes?.authority_salience_constraint_integrity)}</td>
        <td>${formatCost(cost)}</td>
        <td>${formatNumber(reliability, 1)}%</td>
        <td><a class="row-action" href="${modelPath(row)}">Result</a></td>
      </tr>
    `;
  }).join('');
}

function renderArena(arena) {
  const container = document.querySelector('#arena-matches');
  const matches = arena.matches ?? [];
  const encounterGroups = buildEncounterGroups(matches).slice(0, 3);

  container.innerHTML = encounterGroups.map((group, groupIndex) => {
    const totalTurns = group.matches.reduce((sum, match) => sum + (Number(match.turns) || 0), 0);
    const seeds = [...new Set(group.matches.map((match) => match.seed).filter((seed) => seed !== undefined && seed !== null))];
    const firstMatch = group.matches[0];
    return `
      <article class="match-card encounter-summary-card" id="highlight-${escapeHtml(group.id)}">
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
      </article>
    `;
  }).join('');
}

async function main() {
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
  document.querySelector('#leader-score').textContent = 'The public artifact could not be loaded.';
});
