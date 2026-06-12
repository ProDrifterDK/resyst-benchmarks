const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const pct = (value, max) => `${clamp((Number(value) / Math.max(1, Number(max))) * 100, 0, 100).toFixed(1)}%`;

const titleCase = (value = '') => String(value)
  .replaceAll('_', ' ')
  .replaceAll('-', ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase());

const eventMeta = (event) => {
  const type = event?.type ?? 'event';
  const icon = {
    move: '↗',
    gather: '◆',
    core_damage: '✹',
    attack: '⚔',
    center_control: '⌾',
    spawn: '+',
  }[type] ?? '•';
  const tone = {
    move: 'move',
    gather: 'gather',
    core_damage: 'damage',
    attack: 'damage',
    center_control: 'control',
    spawn: 'spawn',
  }[type] ?? 'default';
  return { icon, tone };
};

const eventText = (event) => {
  if (!event?.type) return 'Event recorded';
  if (event.type === 'move') return `${event.player ?? ''} ${event.unit ?? ''} moved ${event.from ? `from ${event.from.x}:${event.from.y} ` : ''}to ${event.to?.x ?? event.x ?? '?'}:${event.to?.y ?? event.y ?? '?'}`;
  if (event.type === 'gather') return `${event.player ?? ''} ${event.unit ?? ''} gathered ${event.extracted ?? ''} from ${event.resource ?? 'resource'}`;
  if (event.type === 'core_damage') return `${event.attacker ?? ''} damaged ${event.defender ?? ''} core for ${event.damage ?? '?'}`;
  if (event.type === 'attack') return `${event.attacker ?? ''} attacked ${event.defender ?? event.target ?? 'target'}`;
  if (event.type === 'center_control') return `${event.player ?? ''} applied center pressure`;
  if (event.type === 'spawn') return `${event.player ?? ''} spawned ${event.unit ?? 'unit'}`;
  return titleCase(event.type);
};

const actionText = (action) => {
  if (!action?.type) return 'Action recorded';
  if (action.type === 'move') return `${action.unit ?? 'unit'} → ${action.x ?? '?'}:${action.y ?? '?'}`;
  if (action.type === 'gather') return `${action.unit ?? 'unit'} gathers ${action.resource ?? 'resource'}`;
  if (action.type === 'attack') return `${action.unit ?? action.attacker ?? 'unit'} attacks ${action.target ?? action.defender ?? 'target'}`;
  if (action.type === 'wait') return `${action.unit ?? 'unit'} waits`;
  if (action.type === 'spawn') return `Spawn ${action.unit_type ?? action.unit ?? 'unit'}`;
  return titleCase(action.type);
};

const niceBot = (value = '') => String(value)
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

function positionFor(id, state) {
  if (!id || !state) return null;
  for (const unit of state.units ?? []) if (unit.id === id) return unit;
  for (const side of ['A', 'B']) {
    const core = state.players?.[side]?.core;
    if (core?.id === id || id === side || id === `${side}_core`) return core;
  }
  for (const resource of state.resources ?? []) if (resource.id === id || resource.name === id) return resource;
  return null;
}

function addVector(board, from, to, width, height, tone = 'move') {
  if (!from || !to) return;
  const x1 = ((Number(from.x) + 0.5) / width) * 100;
  const y1 = ((Number(from.y) + 0.5) / height) * 100;
  const x2 = ((Number(to.x) + 0.5) / width) * 100;
  const y2 = ((Number(to.y) + 0.5) / height) * 100;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const node = document.createElement('div');
  node.className = `replay-vector ${tone}`;
  node.style.left = `${x1}%`;
  node.style.top = `${y1}%`;
  node.style.width = `${length}%`;
  node.style.transform = `rotate(${angle}deg)`;
  board.append(node);
}

function addPulse(board, at, width, height, tone = 'control') {
  if (!at) return;
  const node = document.createElement('div');
  node.className = `replay-fx ${tone}`;
  node.style.left = `${((Number(at.x) + 0.5) / width) * 100}%`;
  node.style.top = `${((Number(at.y) + 0.5) / height) * 100}%`;
  board.append(node);
}

const piece = (item, className, label) => {
  const node = document.createElement('div');
  node.className = className;
  node.style.gridColumn = `${Number(item.x ?? 0) + 1}`;
  node.style.gridRow = `${Number(item.y ?? 0) + 1}`;
  node.title = label;
  node.textContent = label;
  return node;
};

function renderBoard(board, state, frame) {
  const width = state?.width ?? 8;
  const height = state?.height ?? 8;
  const events = frame?.events ?? [];
  board.innerHTML = '';
  board.dataset.activeSide = frame?.player ?? state?.active_player ?? 'A';
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
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) cell.dataset.edge = 'true';
      if ((x === Math.floor(width / 2) || x === Math.ceil(width / 2) - 1) && (y === Math.floor(height / 2) || y === Math.ceil(height / 2) - 1)) cell.dataset.center = 'true';
      if (x === 0 && y % 2 === 0) cell.dataset.coord = y;
      if (y === height - 1 && x % 2 === 0) cell.dataset.coordX = x;
      board.append(cell);
    }
  }

  for (const event of events) {
    if (event.type === 'move') {
      const to = event.to ?? { x: event.x, y: event.y };
      addVector(board, event.from, to, width, height, 'move');
      addPulse(board, to, width, height, 'move');
    } else if (event.type === 'gather') {
      addPulse(board, positionFor(event.resource, state), width, height, 'gather');
    } else if (event.type === 'core_damage') {
      const target = state?.players?.[event.defender]?.core;
      addPulse(board, target, width, height, 'damage');
      const attacker = positionFor(event.attacker, state) ?? state?.players?.[event.attacker]?.core;
      addVector(board, attacker, target, width, height, 'damage');
    } else if (event.type === 'attack') {
      const attacker = positionFor(event.attacker ?? event.unit, state);
      const target = positionFor(event.defender ?? event.target, state) ?? state?.players?.[event.defender]?.core;
      addVector(board, attacker, target, width, height, 'damage');
      addPulse(board, target, width, height, 'damage');
    } else if (event.type === 'center_control') {
      addPulse(board, { x: (width - 1) / 2, y: (height - 1) / 2 }, width, height, 'control');
    }
  }

  for (const obstacle of state?.obstacles ?? []) {
    board.append(piece(obstacle, 'replay-piece obstacle', ''));
  }

  for (const resource of state?.resources ?? []) {
    const amount = Number(resource.amount ?? 0);
    const node = piece(resource, `replay-piece resource ${resource.contested ? 'contested' : ''}`, '');
    node.style.opacity = amount > 0 ? '1' : '0.22';
    node.dataset.amount = amount;
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
    const label = unit.type === 'worker' ? 'W' : unit.type === 'striker' ? 'S' : 'U';
    const node = piece(unit, `replay-piece unit-piece ${unit.type ?? 'unit'} side-${unit.player ?? 'N'}`, label);
    node.dataset.hp = `${unit.hp ?? '—'}/${unit.max_hp ?? '—'}`;
    board.append(node);
  }
}

function updateCombatant(panel, side, state, frame) {
  const player = state?.players?.[side];
  const core = player?.core;
  const coreValue = panel.querySelector(`[data-core-${side.toLowerCase()}]`);
  const coreBar = panel.querySelector(`[data-core-bar-${side.toLowerCase()}]`);
  const energyValue = panel.querySelector(`[data-energy-${side.toLowerCase()}]`);
  const energyBar = panel.querySelector(`[data-energy-bar-${side.toLowerCase()}]`);
  const damageValue = panel.querySelector(`[data-damage-${side.toLowerCase()}]`);
  const invalidValue = panel.querySelector(`[data-invalid-${side.toLowerCase()}]`);
  const unitsValue = panel.querySelector(`[data-units-${side.toLowerCase()}]`);
  const active = frame?.player === side;
  panel.classList.toggle('is-active', active);
  if (coreValue) coreValue.textContent = `${core?.hp ?? '—'} / ${core?.max_hp ?? '—'}`;
  if (coreBar) coreBar.style.width = pct(core?.hp ?? 0, core?.max_hp ?? 30);
  if (energyValue) energyValue.textContent = `${player?.energy ?? frame?.energy?.[side] ?? '—'} / ${player?.max_energy ?? 12}`;
  if (energyBar) energyBar.style.width = pct(player?.energy ?? frame?.energy?.[side] ?? 0, player?.max_energy ?? 12);
  if (damageValue) damageValue.textContent = String(panel.dataset[`damage${side}`] ?? '0');
  if (invalidValue) invalidValue.textContent = String(panel.dataset[`invalid${side}`] ?? '0');
  if (unitsValue) unitsValue.textContent = String((state?.units ?? []).filter((unit) => unit.player === side).length);
}

async function initReplay(panel) {
  const src = panel.dataset.replaySrc;
  const board = panel.querySelector('[data-board]');
  const slider = panel.querySelector('[data-slider]');
  const play = panel.querySelector('[data-play]');
  const prev = panel.querySelector('[data-prev]');
  const next = panel.querySelector('[data-next]');
  const speed = panel.querySelector('[data-speed]');
  const frameMeta = panel.querySelector('[data-frame-meta]');
  const eventsBox = panel.querySelector('[data-events]');
  const actionsBox = panel.querySelector('[data-actions]');
  const turnLabel = panel.querySelector('[data-turn-label]');
  const activeLabel = panel.querySelector('[data-active-label]');
  const botLabel = panel.querySelector('[data-bot-label]');
  const progressFill = panel.querySelector('[data-progress-fill]');
  const victory = panel.querySelector('[data-victory]');
  const restart = panel.querySelector('[data-restart]');
  const combatantA = panel.querySelector('[data-side-panel="A"]');
  const combatantB = panel.querySelector('[data-side-panel="B"]');
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

  const intervalMs = () => Number(speed?.value ?? 650);

  const renderList = (items, mapper, emptyText) => items.length
    ? items.map((item) => mapper(item)).join('')
    : `<p class="empty-log">${escapeHtml(emptyText)}</p>`;

  const render = (nextIndex) => {
    index = Math.max(0, Math.min(frames.length - 1, Number(nextIndex) || 0));
    const frame = frames[index];
    const state = frame?.state ?? replay.final_state;
    renderBoard(board, state, frame);
    slider.value = index;
    const progress = frames.length <= 1 ? 0 : (index / (frames.length - 1)) * 100;
    slider.style.setProperty('--progress', `${progress}%`);
    if (progressFill) progressFill.style.width = `${progress}%`;

    const hp = frame?.core_hp ? `Core HP ${frame.core_hp.A ?? '—'} / ${frame.core_hp.B ?? '—'}` : 'Core HP —';
    if (turnLabel) turnLabel.textContent = `Turn ${frame?.turn ?? index}`;
    if (activeLabel) activeLabel.textContent = `Side ${frame?.player ?? '—'} acting`;
    if (botLabel) botLabel.textContent = niceBot(frame?.bot ?? 'Model');
    frameMeta.innerHTML = `<strong>Turn ${escapeHtml(frame?.turn ?? index)}</strong><span>${escapeHtml(frame?.player ?? '—')} acting</span><span>${escapeHtml(hp)}</span>`;

    if (combatantA) updateCombatant(combatantA, 'A', state, frame);
    if (combatantB) updateCombatant(combatantB, 'B', state, frame);
    if (victory) victory.hidden = index < frames.length - 1;

    const events = (frame?.events ?? []).slice(-6).reverse();
    eventsBox.innerHTML = renderList(events, (event) => {
      const meta = eventMeta(event);
      return `<article class="event-card ${meta.tone}"><span>${escapeHtml(meta.icon)}</span><p>${escapeHtml(eventText(event))}</p></article>`;
    }, 'No visible event on this frame.');

    const actions = (frame?.applied_actions ?? frame?.actions ?? []).slice(0, 6);
    actionsBox.innerHTML = renderList(actions, (action) => {
      const tone = action?.type === 'wait' ? 'default' : action?.type === 'gather' ? 'gather' : action?.type === 'attack' ? 'damage' : 'move';
      return `<article class="action-card ${tone}"><span>${escapeHtml(titleCase(action?.type ?? 'action'))}</span><p>${escapeHtml(actionText(action))}</p></article>`;
    }, 'No applied action recorded.');
  };

  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = null;
    play.textContent = 'Play replay';
    play.setAttribute('aria-pressed', 'false');
  };

  const start = () => {
    play.textContent = 'Pause replay';
    play.setAttribute('aria-pressed', 'true');
    timer = window.setInterval(() => {
      if (index >= frames.length - 1) {
        stop();
        return;
      }
      render(index + 1);
    }, intervalMs());
  };

  play.addEventListener('click', () => {
    if (timer) stop();
    else start();
  });

  prev?.addEventListener('click', () => {
    stop();
    render(index - 1);
  });

  next?.addEventListener('click', () => {
    stop();
    render(index + 1);
  });

  speed?.addEventListener('change', () => {
    if (timer) {
      stop();
      start();
    }
  });

  restart?.addEventListener('click', () => {
    stop();
    render(0);
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!panel.classList.contains('is-active')) return;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(target.tagName)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      play.click();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      stop();
      render(index + (event.shiftKey ? 10 : 1));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stop();
      render(index - (event.shiftKey ? 10 : 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      stop();
      render(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      stop();
      render(frames.length - 1);
    }
  });

  slider.addEventListener('input', (event) => {
    stop();
    render(event.target.value);
  });

  render(0);
}

function initMatchTabs() {
  const tabs = [...document.querySelectorAll('[data-match-tab]')];
  const panels = [...document.querySelectorAll('[data-match-panel], .match-replay[role="tabpanel"]')];
  if (!tabs.length || !panels.length) return;

  const activate = (id) => {
    document.querySelectorAll('[data-play][aria-pressed="true"]').forEach((button) => button.click());
    for (const tab of tabs) {
      const selected = tab.dataset.matchTab === id;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    for (const panel of panels) {
      const selected = panel.id === id;
      panel.classList.toggle('is-active', selected);
      panel.hidden = !selected;
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activate(tab.dataset.matchTab));
    tab.addEventListener('keydown', (event) => {
      const current = tabs.indexOf(tab);
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const nextIndex = event.key === 'ArrowRight'
          ? (current + 1) % tabs.length
          : (current - 1 + tabs.length) % tabs.length;
        tabs[nextIndex].focus();
        activate(tabs[nextIndex].dataset.matchTab);
      }
    });
  });
}

initMatchTabs();
document.querySelectorAll('[data-replay-src]').forEach(initReplay);
