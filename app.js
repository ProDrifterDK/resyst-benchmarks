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
    const cost = (row.full?.cost ?? 0) + (row.swe?.cost ?? 0);
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

  container.innerHTML = matches.slice(0, 3).map((match) => `
    <article class="match-card">
      <div>
        <span class="match-label">Seed ${escapeHtml(match.seed ?? 'fixed')} · lane ${escapeHtml(match.lane ?? '—')} · ${escapeHtml(match.turns)} turns</span>
        <h3>${escapeHtml(match.entrants.A)} <span aria-hidden="true">vs</span> ${escapeHtml(match.entrants.B)}</h3>
        <p><strong>Winner:</strong> ${escapeHtml(match.winner_label)} · ${escapeHtml(prettyReason(match.winner_reason))}</p>
      </div>
      <div class="match-metrics">
        <div class="metric"><span class="metric-label">Core HP A/B</span><strong>${sideValue(match.core_hp, 'A')} / ${sideValue(match.core_hp, 'B')}</strong></div>
        <div class="metric"><span class="metric-label">Damage A/B</span><strong>${sideValue(match.core_damage_dealt, 'A')} / ${sideValue(match.core_damage_dealt, 'B')}</strong></div>
        <a class="row-action match-action" href="arena/#${encodeURIComponent(match.id)}">Open replay →</a>
      </div>
    </article>
  `).join('');
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
