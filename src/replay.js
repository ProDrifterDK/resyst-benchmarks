const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const eventText = (event) => {
  if (!event?.type) return 'event';
  if (event.type === 'move') return `${event.player ?? ''} ${event.unit ?? ''} moved to ${event.to?.x ?? '?'}:${event.to?.y ?? '?'}`;
  if (event.type === 'gather') return `${event.player ?? ''} ${event.unit ?? ''} gathered ${event.extracted ?? ''} from ${event.resource ?? 'resource'}`;
  if (event.type === 'core_damage') return `${event.attacker ?? ''} damaged ${event.defender ?? ''} core for ${event.damage ?? '?'}`;
  if (event.type === 'attack') return `${event.attacker ?? ''} attacked ${event.defender ?? event.target ?? 'target'}`;
  if (event.type === 'center_control') return `${event.player ?? ''} applied center pressure`;
  return String(event.type).replaceAll('_', ' ');
};

const piece = (item, className, label) => {
  const node = document.createElement('div');
  node.className = className;
  node.style.gridColumn = `${Number(item.x ?? 0) + 1}`;
  node.style.gridRow = `${Number(item.y ?? 0) + 1}`;
  node.title = label;
  node.textContent = label;
  return node;
};

function renderBoard(board, state) {
  const width = state?.width ?? 8;
  const height = state?.height ?? 8;
  board.innerHTML = '';
  board.style.setProperty('--cols', width);
  board.style.setProperty('--rows', height);
  board.style.gridTemplateColumns = `repeat(${width}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${height}, 1fr)`;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = document.createElement('div');
      cell.className = 'replay-cell';
      cell.style.gridColumn = `${x + 1}`;
      cell.style.gridRow = `${y + 1}`;
      board.append(cell);
    }
  }

  for (const obstacle of state?.obstacles ?? []) {
    board.append(piece(obstacle, 'replay-piece obstacle', ''));
  }

  for (const resource of state?.resources ?? []) {
    const amount = Number(resource.amount ?? 0);
    const node = piece(resource, `replay-piece resource ${resource.contested ? 'contested' : ''}`, amount > 0 ? String(amount) : '');
    node.style.opacity = amount > 0 ? '1' : '0.25';
    board.append(node);
  }

  for (const side of ['A', 'B']) {
    const core = state?.players?.[side]?.core;
    if (core) {
      const node = piece(core, `replay-piece core-piece side-${side}`, side);
      node.dataset.hp = `${core.hp ?? '—'}/${core.max_hp ?? '—'}`;
      board.append(node);
    }
  }

  for (const unit of state?.units ?? []) {
    const label = unit.type === 'worker' ? 'w' : unit.type === 'striker' ? 's' : 'u';
    const node = piece(unit, `replay-piece unit-piece side-${unit.player ?? 'N'}`, label);
    node.dataset.hp = `${unit.hp ?? '—'}/${unit.max_hp ?? '—'}`;
    board.append(node);
  }
}

async function initReplay(panel) {
  const src = panel.dataset.replaySrc;
  const board = panel.querySelector('[data-board]');
  const slider = panel.querySelector('[data-slider]');
  const play = panel.querySelector('[data-play]');
  const frameMeta = panel.querySelector('[data-frame-meta]');
  const eventsBox = panel.querySelector('[data-events]');
  let replay;
  let index = 0;
  let timer = null;

  try {
    const response = await fetch(src, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    replay = await response.json();
  } catch (error) {
    frameMeta.textContent = `Replay unavailable: ${error.message}`;
    return;
  }

  const frames = replay.frames ?? [];
  slider.max = Math.max(0, frames.length - 1);
  slider.value = 0;

  const render = (nextIndex) => {
    index = Math.max(0, Math.min(frames.length - 1, Number(nextIndex) || 0));
    const frame = frames[index];
    renderBoard(board, frame?.state ?? replay.final_state);
    slider.value = index;
    const hp = frame?.core_hp ? `Core HP ${frame.core_hp.A ?? '—'} / ${frame.core_hp.B ?? '—'}` : 'Core HP —';
    frameMeta.innerHTML = `<strong>Turn ${escapeHtml(frame?.turn ?? index)}</strong> · ${escapeHtml(frame?.player ?? '—')} acting · ${escapeHtml(hp)}`;
    const events = (frame?.events ?? []).slice(-5);
    eventsBox.innerHTML = events.length
      ? events.map((event) => `<p>${escapeHtml(eventText(event))}</p>`).join('')
      : '<p>No visible event on this frame.</p>';
  };

  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = null;
    play.textContent = 'Play replay';
  };

  play.addEventListener('click', () => {
    if (timer) {
      stop();
      return;
    }
    play.textContent = 'Pause replay';
    timer = window.setInterval(() => {
      if (index >= frames.length - 1) {
        stop();
        return;
      }
      render(index + 1);
    }, 650);
  });

  slider.addEventListener('input', (event) => {
    stop();
    render(event.target.value);
  });

  render(0);
}

document.querySelectorAll('[data-replay-src]').forEach(initReplay);
