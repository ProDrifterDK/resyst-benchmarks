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
      <span class="podium-rank">#${row.overall_rank}</span>
      <h3>${row.label}</h3>
      <p>${row.basis}</p>
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
        <td class="model-cell"><strong>${row.label}</strong><span>${row.id}</span></td>
        <td>${row.basis}</td>
        <td class="score-cell">${formatNumber(row.overall_score, 2)}</td>
        <td>${formatNumber(row.full?.final, 2)}</td>
        <td>${formatNumber(row.swe?.swe_score, 2)}</td>
        <td>${formatCost(cost)}</td>
        <td>${formatNumber(reliability, 1)}%</td>
      </tr>
    `;
  }).join('');
}

function renderArena(arena) {
  const container = document.querySelector('#arena-matches');
  const matches = arena.matches ?? [];

  container.innerHTML = matches.map((match) => `
    <article class="match-card">
      <div>
        <span class="match-label">Seed ${match.seed ?? 'fixed'} · lane ${match.lane ?? '—'} · ${match.turns} turns</span>
        <h3>${match.entrants.A} <span aria-hidden="true">vs</span> ${match.entrants.B}</h3>
        <p><strong>Winner:</strong> ${match.winner_label} · ${match.winner_reason?.replaceAll('_', ' ') ?? 'resolved'}</p>
      </div>
      <div class="match-metrics">
        <div class="metric"><span class="metric-label">Core HP A/B</span><strong>${sideValue(match.core_hp, 'A')} / ${sideValue(match.core_hp, 'B')}</strong></div>
        <div class="metric"><span class="metric-label">Damage A/B</span><strong>${sideValue(match.core_damage_dealt, 'A')} / ${sideValue(match.core_damage_dealt, 'B')}</strong></div>
        <div class="metric"><span class="metric-label">Resources A/B</span><strong>${sideValue(match.resources_collected, 'A')} / ${sideValue(match.resources_collected, 'B')}</strong></div>
        <div class="metric"><span class="metric-label">Invalid A/B</span><strong>${sideValue(match.invalid_actions, 'A')} / ${sideValue(match.invalid_actions, 'B')}</strong></div>
      </div>
    </article>
  `).join('');
}

function bootSignalField() {
  const canvas = document.querySelector('#signal-field');
  if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;
  let nodes = [];
  let pointer = { x: -9999, y: -9999 };

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(96, Math.max(38, Math.floor(width * height / 18000)));
    nodes = Array.from({ length: count }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r: index % 9 === 0 ? 1.7 : 1,
    }));
  };

  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(201, 168, 76, 0.72)';
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.11)';
    ctx.lineWidth = 1;

    for (const node of nodes) {
      node.x += node.vx;
      node.y += node.vy;
      if (node.x < -20) node.x = width + 20;
      if (node.x > width + 20) node.x = -20;
      if (node.y < -20) node.y = height + 20;
      if (node.y > height + 20) node.y = -20;

      const dx = node.x - pointer.x;
      const dy = node.y - pointer.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 160) {
        node.x += dx * 0.002;
        node.y += dy * 0.002;
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance < 145) {
          ctx.globalAlpha = (145 - distance) / 145;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  };

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (event) => {
    pointer = { x: event.clientX, y: event.clientY };
  });
  window.addEventListener('pointerleave', () => {
    pointer = { x: -9999, y: -9999 };
  });
  resize();
  draw();
}

async function main() {
  bootSignalField();
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
