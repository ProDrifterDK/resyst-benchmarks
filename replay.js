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
    upgrade: '⇧',
    repair_core: '+',
    upkeep_paid: '$',
    starvation: '!',
    unit_destroyed: '×',
    overtime_pressure: '⌁',
    pressure_damage: '!',
    pressure_unit_destroyed: '×',
    game_over: '✓',
  }[type] ?? '•';
  const tone = {
    move: 'move',
    gather: 'gather',
    core_damage: 'damage',
    attack: 'damage',
    center_control: 'control',
    spawn: 'spawn',
    upgrade: 'spawn',
    repair_core: 'gather',
    upkeep_paid: 'default',
    starvation: 'damage',
    unit_destroyed: 'damage',
    overtime_pressure: 'control',
    pressure_damage: 'damage',
    pressure_unit_destroyed: 'damage',
    game_over: 'control',
  }[type] ?? 'default';
  return { icon, tone };
};

const eventText = (event) => {
  if (!event?.type) return 'Event recorded';
  if (event.type === 'move') return `${event.player ?? ''} ${event.unit ?? ''} moved ${event.from ? `from ${event.from.x}:${event.from.y} ` : ''}to ${event.to?.x ?? event.x ?? '?'}:${event.to?.y ?? event.y ?? '?'}`;
  if (event.type === 'gather') return `${event.player ?? ''} ${event.unit ?? ''} gathered ${event.extracted ?? ''} from ${event.resource ?? 'resource'}`;
  if (event.type === 'core_damage') {
    const source = event.source === 'center_control'
      ? 'Control Zone pressure'
      : event.source === 'unit_attack' && ['A', 'B'].includes(event.attacker)
        ? `Side ${event.attacker} unit attack`
        : refLabel(event.attacker, 'source');
    return `${source} → ${event.defender ?? ''} core: −${event.damage ?? '?'} HP`;
  }
  if (event.type === 'attack') return `${refLabel(event.attacker ?? event.unit, '')} attacked ${refLabel(event.defender ?? event.target, 'target')} for −${event.damage ?? '?'} HP`;
  if (event.type === 'center_control') return `${event.player ?? ''} applied center pressure`;
  if (event.type === 'spawn') return `${event.player ?? ''} spawned ${refLabel(event.unit)}`;
  if (event.type === 'upgrade') return `${event.player ?? ''} upgraded force capacity`;
  if (event.type === 'repair_core') return `${event.player ?? ''} repaired core to ${event.core_hp ?? '?'} HP`;
  if (event.type === 'upkeep_paid') return `${event.player ?? ''} paid upkeep`;
  if (event.type === 'starvation') return `${event.unit ?? event.player ?? ''} took −${event.damage ?? '?'} HP from starvation`;
  if (event.type === 'unit_destroyed') return `${event.target ?? event.unit ?? 'unit'} destroyed`;
  if (event.type === 'overtime_pressure') return `Overtime pressure dealt ${event.damage ?? '?'} damage`;
  if (event.type === 'pressure_damage') return `${event.unit ?? event.player ?? ''} took −${event.damage ?? '?'} HP from pressure`;
  if (event.type === 'pressure_unit_destroyed') return `${event.unit ?? 'unit'} destroyed by pressure`;
  if (event.type === 'game_over') return `Game over: ${titleCase(event.reason ?? 'complete')}`;
  return titleCase(event.type);
};

const refLabel = (value, fallback = 'unit') => {
  if (value && typeof value === 'object') return value.id ?? value.type ?? fallback;
  return value ?? fallback;
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

function positionLike(value, state) {
  if (value && typeof value === 'object' && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))) return value;
  return positionFor(value, state);
}

const coordKey = (item) => (item && Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y)))
  ? `${Number(item.x)}:${Number(item.y)}`
  : '';

const pointPercent = (item, width, height) => ({
  x: ((Number(item.x) + 0.5) / width) * 100,
  y: ((Number(item.y) + 0.5) / height) * 100,
});

function addVector(board, from, to, width, height, tone = 'move') {
  if (!from || !to) return;
  const start = pointPercent(from, width, height);
  const end = pointPercent(to, width, height);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const node = document.createElement('div');
  node.className = `replay-vector ${tone}`;
  node.style.left = `${start.x}%`;
  node.style.top = `${start.y}%`;
  node.style.width = `${length}%`;
  node.style.transform = `rotate(${angle}deg)`;
  node.setAttribute('aria-hidden', 'true');
  board.append(node);
}

function addPulse(board, at, width, height, tone = 'control') {
  if (!at) return;
  const point = pointPercent(at, width, height);
  const node = document.createElement('div');
  node.className = `replay-fx ${tone}`;
  node.style.left = `${point.x}%`;
  node.style.top = `${point.y}%`;
  node.setAttribute('aria-hidden', 'true');
  board.append(node);
}

function addDamageMarker(board, impact, width, height) {
  if (!impact?.target) return;
  const point = pointPercent(impact.target, width, height);
  const node = document.createElement('div');
  node.className = `damage-marker ${impact.kinds?.includes('pressure') ? 'pressure' : 'hit'}`;
  node.style.left = `${point.x}%`;
  node.style.top = `${point.y}%`;
  node.dataset.damage = impact.label;
  if (Number(impact.target.y) <= 0) node.dataset.edgeY = 'top';
  else if (Number(impact.target.y) >= height - 1) node.dataset.edgeY = 'bottom';
  if (impact.destroyed) node.dataset.outcome = 'destroyed';
  const label = document.createElement('span');
  label.textContent = impact.label;
  node.append(label);
  node.setAttribute('aria-hidden', 'true');
  board.append(node);
}

function addDamageProjectile(board, impact, sourcePoint, targetPoint) {
  const dx = targetPoint.x - sourcePoint.x;
  const dy = targetPoint.y - sourcePoint.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0) return;

  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const node = document.createElement('div');
  node.className = `damage-shot ${impact.primaryKind ?? 'hit'}`;
  node.style.left = `${sourcePoint.x}%`;
  node.style.top = `${sourcePoint.y}%`;
  node.style.width = `${length}%`;
  node.style.transform = `rotate(${angle}deg)`;
  node.dataset.damage = impact.label ?? '';
  node.dataset.cause = impact.causeLabel ?? impact.primaryKind ?? 'damage';
  node.setAttribute('aria-hidden', 'true');
  board.append(node);
}

function addDamageSourceCue(board, impact, width, height) {
  if (!impact?.target) return;
  const target = impact.target;
  const source = impact.source;
  const targetPoint = pointPercent(target, width, height);
  const sourcePoint = source ? pointPercent(source, width, height) : targetPoint;
  const sourceKey = coordKey(source);
  const targetKey = coordKey(target);
  const labelText = impact.primaryKind === 'pressure'
    ? `${impact.sourceLabel ?? 'Pressure'} → ${impact.label}`
    : impact.primaryKind === 'starvation'
      ? `${impact.causeLabel ?? 'Starvation'} → ${impact.label}`
      : `${impact.sourceLabel ?? 'Source'} ${impact.causeLabel ?? 'damage'} → ${impact.label}`;

  if (source && sourceKey && sourceKey !== targetKey) {
    const dx = targetPoint.x - sourcePoint.x;
    const dy = targetPoint.y - sourcePoint.y;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const line = document.createElement('div');
    line.className = `damage-source-line ${impact.primaryKind ?? 'hit'}`;
    line.style.left = `${sourcePoint.x}%`;
    line.style.top = `${sourcePoint.y}%`;
    line.style.width = `${length}%`;
    line.style.transform = `rotate(${angle}deg)`;
    line.setAttribute('aria-hidden', 'true');
    board.append(line);

    addDamageProjectile(board, impact, sourcePoint, targetPoint);

    const mid = { x: sourcePoint.x + dx * 0.5, y: sourcePoint.y + dy * 0.5 };
    const lineLabel = document.createElement('div');
    lineLabel.className = `damage-source-label ${impact.primaryKind ?? 'hit'}`;
    lineLabel.style.left = `${mid.x}%`;
    lineLabel.style.top = `${mid.y}%`;
    lineLabel.textContent = labelText;
    lineLabel.setAttribute('aria-hidden', 'true');
    board.append(lineLabel);
    return;
  }

  const origin = document.createElement('div');
  origin.className = `damage-source-origin ${impact.primaryKind ?? 'hit'} local`;
  origin.style.left = `${sourcePoint.x}%`;
  origin.style.top = `${sourcePoint.y}%`;
  origin.textContent = labelText;
  origin.setAttribute('aria-hidden', 'true');
  board.append(origin);
}

function addAnchor(board, at, width, height, side) {
  if (!at) return;
  const point = pointPercent(at, width, height);
  const node = document.createElement('div');
  node.className = `board-anchor side-${side}`;
  node.style.left = `${point.x}%`;
  node.style.top = `${point.y}%`;
  node.setAttribute('aria-hidden', 'true');
  board.append(node);
}

function controlZoneCells(width, height, events = []) {
  const eventZone = events.find((event) => event?.type === 'center_control' && Array.isArray(event.zone))?.zone;
  const fallback = [[Math.floor(width / 2) - 1, Math.floor(height / 2)], [Math.floor(width / 2), Math.floor(height / 2) - 1]];
  const zone = eventZone?.length ? eventZone : fallback;
  return zone
    .map((cell) => Array.isArray(cell) ? { x: Number(cell[0]), y: Number(cell[1]) } : { x: Number(cell?.x), y: Number(cell?.y) })
    .filter((cell) => Number.isFinite(cell.x) && Number.isFinite(cell.y) && cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height);
}

function addControlZone(board, cells, width, height) {
  if (!cells?.length) return;
  const xs = cells.map((cell) => Number(cell.x));
  const ys = cells.map((cell) => Number(cell.y));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const node = document.createElement('div');
  node.className = 'board-control-zone';
  node.style.left = `${(minX / width) * 100}%`;
  node.style.top = `${(minY / height) * 100}%`;
  node.style.width = `${((maxX - minX + 1) / width) * 100}%`;
  node.style.height = `${((maxY - minY + 1) / height) * 100}%`;
  node.innerHTML = '<span>Control<br>Zone</span>';
  node.setAttribute('aria-hidden', 'true');
  board.append(node);
}

function addBoardLayer(board, className) {
  const node = document.createElement('div');
  node.className = className;
  node.setAttribute('aria-hidden', 'true');
  board.append(node);
}

function markAction(actionCells, item, tone, role = 'target') {
  const key = coordKey(item);
  if (!key) return;
  const priority = { damage: 4, attack: 4, gather: 3, spawn: 3, move: 2, control: 1, source: 0 };
  const previous = actionCells.get(key);
  if (!previous || (priority[tone] ?? 0) >= (priority[previous.tone] ?? 0)) {
    actionCells.set(key, { tone, role });
  }
}

function damageAmount(event) {
  const value = Number(event?.damage);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function damageImpactKey(target, source = null, kind = 'hit', discriminator = '') {
  if (!target) return '';
  const targetPart = target.id ? `id:${target.id}` : coordKey(target) ? `cell:${coordKey(target)}` : '';
  if (!targetPart) return '';
  const sourcePart = source?.id ? `id:${source.id}` : coordKey(source) ? `cell:${coordKey(source)}` : 'local';
  return `${targetPart}|${sourcePart}|${kind}|${discriminator}`;
}

function targetImpactKey(target) {
  if (!target) return '';
  if (target.id) return `id:${target.id}`;
  const key = coordKey(target);
  return key ? `cell:${key}` : '';
}

function damageImpactPriority(kind) {
  return { attack: 5, core: 4, pressure: 3, starvation: 2, destroyed: 1, hit: 0 }[kind] ?? 0;
}

function addDamageImpact(impacts, event, target, kind = 'hit', source = null, sourceLabel = '', causeLabel = '') {
  const key = damageImpactKey(target, source, kind, sourceLabel || causeLabel);
  if (!key) return;
  const existing = impacts.get(key) ?? {
    target,
    damage: 0,
    destroyed: false,
    kinds: new Set(),
    primaryKind: kind,
    source,
    sourceLabel,
    causeLabel,
  };
  existing.target = target;
  existing.damage += damageAmount(event);
  existing.destroyed = existing.destroyed
    || ['unit_destroyed', 'pressure_unit_destroyed'].includes(event?.type)
    || Number(target?.hp ?? 1) <= 0;
  if (!existing.source || damageImpactPriority(kind) >= damageImpactPriority(existing.primaryKind)) {
    existing.primaryKind = kind;
    existing.source = source ?? target;
    existing.sourceLabel = sourceLabel || titleCase(kind);
    existing.causeLabel = causeLabel || titleCase(kind);
  }
  existing.kinds.add(kind);
  impacts.set(key, existing);
}

function damageLabel(impact) {
  const damage = Number(impact?.damage ?? 0);
  if (damage > 0) return `−${damage} HP`;
  return impact?.destroyed ? 'KO' : 'HIT';
}

function collectDamageImpacts(events = [], state) {
  const impacts = new Map();
  const width = state?.width ?? 8;
  const height = state?.height ?? 8;
  const centerSource = { id: 'control_zone', type: 'zone', x: (width - 1) / 2, y: (height - 1) / 2 };
  for (const event of events) {
    if (event.type === 'core_damage') {
      const target = state?.players?.[event.defender]?.core;
      const fromCenter = event.source === 'center_control';
      const source = fromCenter
        ? centerSource
        : !['A', 'B'].includes(event.attacker)
          ? positionLike(event.attacker, state)
          : null;
      const sideOnlyAttack = !fromCenter && ['A', 'B'].includes(event.attacker);
      addDamageImpact(
        impacts,
        event,
        target,
        fromCenter ? 'pressure' : 'core',
        source,
        fromCenter ? 'Control Zone' : sideOnlyAttack ? `Side ${event.attacker}` : refLabel(event.attacker, 'Source'),
        fromCenter ? 'center pressure' : event.source === 'unit_attack' ? 'unit attack' : 'core damage',
      );
    } else if (event.type === 'attack') {
      const source = positionFor(event.attacker ?? event.unit, state);
      addDamageImpact(
        impacts,
        event,
        positionFor(event.defender ?? event.target, state) ?? state?.players?.[event.defender]?.core,
        'attack',
        source,
        refLabel(event.attacker ?? event.unit, 'Attacker'),
        'attack',
      );
    } else if (event.type === 'starvation') {
      const target = positionFor(event.unit ?? event.target, state);
      addDamageImpact(impacts, event, target, 'starvation', target, 'No upkeep', 'starvation');
    } else if (event.type === 'pressure_damage') {
      addDamageImpact(impacts, event, positionFor(event.unit ?? event.target, state), 'pressure', centerSource, 'Overtime pressure', 'pressure');
    } else if (['unit_destroyed', 'pressure_unit_destroyed'].includes(event.type)) {
      const target = positionFor(event.unit ?? event.target, state);
      addDamageImpact(impacts, event, target, 'destroyed', target, 'Final blow', 'destroyed');
    }
  }
  return [...impacts.values()].map((impact) => ({
    ...impact,
    kinds: [...impact.kinds],
    label: damageLabel(impact),
  }));
}

function buildDamageLookup(impacts) {
  const byId = new Map();
  const byCoord = new Map();
  for (const impact of impacts) {
    if (impact.target?.id) byId.set(String(impact.target.id), impact);
    const key = coordKey(impact.target);
    if (key) byCoord.set(key, impact);
  }
  return (item) => {
    if (!item) return null;
    if (item.id) return byId.get(String(item.id)) ?? null;
    return byCoord.get(coordKey(item)) ?? null;
  };
}

function aggregateDamageTargets(impacts) {
  const byTarget = new Map();
  for (const impact of impacts) {
    const key = targetImpactKey(impact.target);
    if (!key) continue;
    const existing = byTarget.get(key) ?? {
      target: impact.target,
      damage: 0,
      destroyed: false,
      kinds: new Set(),
      primaryKind: impact.primaryKind,
      sourceLabels: new Set(),
      causeLabels: new Set(),
    };
    existing.damage += Number(impact.damage ?? 0);
    existing.destroyed = existing.destroyed || Boolean(impact.destroyed);
    for (const kind of impact.kinds ?? []) existing.kinds.add(kind);
    if (impact.sourceLabel) existing.sourceLabels.add(impact.sourceLabel);
    if (impact.causeLabel) existing.causeLabels.add(impact.causeLabel);
    if (damageImpactPriority(impact.primaryKind) >= damageImpactPriority(existing.primaryKind)) {
      existing.primaryKind = impact.primaryKind;
    }
    byTarget.set(key, existing);
  }
  return [...byTarget.values()].map((impact) => {
    const sourceLabels = [...impact.sourceLabels];
    const causeLabels = [...impact.causeLabels];
    return {
      ...impact,
      kinds: [...impact.kinds],
      sourceLabel: sourceLabels.length > 1 ? 'Multiple sources' : (sourceLabels[0] ?? ''),
      causeLabel: causeLabels.length > 1 ? 'multiple damage' : (causeLabels[0] ?? ''),
      label: damageLabel(impact),
    };
  });
}

function buildStackPlan(items) {
  const counts = new Map();
  for (const item of items) {
    const key = coordKey(item);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cursors = new Map();
  return (item) => {
    const key = coordKey(item);
    const total = counts.get(key) ?? 1;
    const index = cursors.get(key) ?? 0;
    cursors.set(key, index + 1);
    if (total <= 1) return { total, index, x: '0%', y: '0%' };
    const angle = ((Math.PI * 2) / total) * index - Math.PI / 2;
    const radius = Math.min(34, 16 + total * 4);
    const rounded = (value) => `${Math.abs(value) < 0.01 ? 0 : Number(value.toFixed(2))}%`;
    return {
      total,
      index,
      x: rounded(Math.cos(angle) * radius),
      y: rounded(Math.sin(angle) * radius),
    };
  };
}

const piece = (item, className, label, stack = null, impact = null) => {
  const node = document.createElement('div');
  const hp = Number(item.hp ?? item.max_hp ?? 1);
  const maxHp = Number(item.max_hp ?? (hp || 1));
  const motionKey = item.id ?? item.name ?? `${item.type ?? className}:${item.player ?? 'N'}:${item.x ?? 0}:${item.y ?? 0}`;
  node.className = className;
  node.style.gridColumn = `${Number(item.x ?? 0) + 1}`;
  node.style.gridRow = `${Number(item.y ?? 0) + 1}`;
  node.dataset.label = label;
  node.dataset.motionKey = String(motionKey);
  if (item.id) node.dataset.id = item.id;
  if (item.type) node.dataset.kind = item.type;
  if (item.player) node.dataset.side = item.player;
  if ('hp' in item) {
    node.dataset.hp = `${item.hp ?? '—'}/${item.max_hp ?? '—'}`;
    node.style.setProperty('--hp-pct', pct(hp, maxHp));
    if (hp <= 0) node.dataset.status = 'destroyed';
  }
  if (stack) {
    node.style.setProperty('--stack-x', stack.x);
    node.style.setProperty('--stack-y', stack.y);
    node.dataset.stack = `${stack.index + 1}/${stack.total}`;
  }
  if (impact) {
    node.dataset.hit = 'true';
    node.dataset.damage = impact.label;
    node.dataset.damageKind = impact.kinds?.[0] ?? 'hit';
    node.dataset.damageSource = impact.sourceLabel ?? '';
    node.dataset.damageCause = impact.causeLabel ?? '';
    if (impact.destroyed) node.dataset.hitOutcome = 'destroyed';
  }
  node.title = [item.id, item.type, item.player ? `Side ${item.player}` : '', item.hp !== undefined ? `HP ${item.hp}/${item.max_hp}` : '', impact ? `Damage ${impact.label} from ${impact.sourceLabel ?? impact.causeLabel ?? 'source'}` : '']
    .filter(Boolean)
    .join(' · ') || label;
  node.setAttribute('aria-label', node.title);
  if (label) {
    const marker = document.createElement('span');
    marker.className = 'replay-piece-label';
    marker.textContent = label;
    node.append(marker);
  }
  if (impact) {
    const damageCrack = document.createElement('span');
    damageCrack.className = 'damage-crack';
    damageCrack.textContent = impact.destroyed ? '×' : '!';
    node.append(damageCrack);
  }
  return node;
};

function captureBoardMotion(board) {
  const pieces = new Map();
  if (!board) return pieces;

  for (const node of board.querySelectorAll('.replay-piece[data-motion-key]')) {
    const key = node.dataset.motionKey;
    if (!key) continue;
    const rect = node.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    pieces.set(key, { left: rect.left, top: rect.top });
  }

  return pieces;
}

function animateBoardMotion(board, previousPieces, duration) {
  if (!board || !previousPieces?.size || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

  const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';

  for (const node of board.querySelectorAll('.replay-piece[data-motion-key]')) {
    const key = node.dataset.motionKey;
    const previous = previousPieces.get(key);
    const baseTransform = window.getComputedStyle(node).transform;
    const toTransform = baseTransform === 'none' ? 'translate(0px, 0px)' : baseTransform;

    if (!previous) {
      node.dataset.motion = 'entering';
      const animation = node.animate([
        { opacity: 0, transform: toTransform },
        { opacity: 1, transform: toTransform },
      ], {
        duration: Math.min(duration, 260),
        easing,
        fill: 'both',
      });
      animation.onfinish = () => {
        animation.cancel();
        node.removeAttribute('data-motion');
      };
      continue;
    }

    const rect = node.getBoundingClientRect();
    const dx = previous.left - rect.left;
    const dy = previous.top - rect.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

    node.dataset.motion = 'moving';
    const fromTransform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) ${toTransform}`;
    const animation = node.animate([
      { transform: fromTransform },
      { transform: toTransform },
    ], {
      duration,
      easing,
      fill: 'both',
    });
    animation.onfinish = () => {
      animation.cancel();
      node.removeAttribute('data-motion');
    };
  }
}

function renderBoard(board, state, frame) {
  const width = state?.width ?? 8;
  const height = state?.height ?? 8;
  const events = frame?.events ?? [];
  const resources = state?.resources ?? [];
  const obstacles = state?.obstacles ?? [];
  const units = state?.units ?? [];
  const cores = ['A', 'B'].map((side) => state?.players?.[side]?.core).filter(Boolean);
  const actionCells = new Map();
  const resourceCells = new Map(resources.map((resource) => [coordKey(resource), resource]));
  const obstacleCells = new Set(obstacles.map(coordKey));
  const coreCells = new Map(cores.map((core) => [coordKey(core), core.player]));
  const unitSides = new Map();
  const controlCells = controlZoneCells(width, height, events);
  const controlCellKeys = new Set(controlCells.map(coordKey));
  const damageImpacts = collectDamageImpacts(events, state);
  const damageTargets = aggregateDamageTargets(damageImpacts);
  const damageFor = buildDamageLookup(damageTargets);

  for (const unit of units) {
    const key = coordKey(unit);
    if (!key) continue;
    const set = unitSides.get(key) ?? new Set();
    set.add(unit.player ?? 'N');
    unitSides.set(key, set);
  }

  board.innerHTML = '';
  board.dataset.activeSide = frame?.player ?? state?.active_player ?? 'A';
  board.dataset.turn = frame?.turn ?? state?.turn ?? 0;
  board.style.setProperty('--cols', width);
  board.style.setProperty('--rows', height);
  board.style.gridTemplateColumns = `repeat(${width}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${height}, 1fr)`;
  board.style.aspectRatio = `${width} / ${height}`;

  for (const event of events) {
    if (event.type === 'move') {
      const to = event.to ?? { x: event.x, y: event.y };
      markAction(actionCells, event.from, 'move', 'source');
      markAction(actionCells, to, 'move', 'target');
    } else if (event.type === 'gather') {
      markAction(actionCells, positionFor(event.resource, state), 'gather', 'target');
    } else if (event.type === 'core_damage') {
      markAction(actionCells, state?.players?.[event.defender]?.core, 'damage', 'target');
      const attacker = !['A', 'B'].includes(event.attacker) && event.source !== 'center_control'
        ? positionLike(event.attacker, state)
        : null;
      if (attacker) markAction(actionCells, attacker, 'damage', 'source');
    } else if (event.type === 'attack') {
      markAction(actionCells, positionFor(event.attacker ?? event.unit, state), 'damage', 'source');
      markAction(actionCells, positionFor(event.defender ?? event.target, state) ?? state?.players?.[event.defender]?.core, 'damage', 'target');
    } else if (event.type === 'center_control') {
      for (const [x, y] of event.zone ?? [[Math.floor(width / 2) - 1, Math.floor(height / 2)], [Math.floor(width / 2), Math.floor(height / 2) - 1]]) {
        markAction(actionCells, { x, y }, 'control', 'target');
      }
    } else if (event.type === 'spawn') {
      markAction(actionCells, positionLike(event.unit, state), 'spawn', 'target');
    } else if (event.type === 'repair_core') {
      markAction(actionCells, state?.players?.[event.player]?.core, 'gather', 'target');
    } else if (['starvation', 'unit_destroyed', 'pressure_damage', 'pressure_unit_destroyed'].includes(event.type)) {
      markAction(actionCells, positionFor(event.unit ?? event.target, state), 'damage', 'target');
    } else if (event.type === 'overtime_pressure') {
      markAction(actionCells, { x: Math.floor(width / 2), y: Math.floor(height / 2) }, 'control', 'target');
    }
  }

  addBoardLayer(board, 'board-center-sigil');
  addControlZone(board, controlCells, width, height);
  addBoardLayer(board, 'board-scanline');

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x}:${y}`;
      const cell = document.createElement('div');
      const action = actionCells.get(key);
      const resource = resourceCells.get(key);
      const isCenterCell = (x === Math.floor(width / 2) || x === Math.ceil(width / 2) - 1) && (y === Math.floor(height / 2) || y === Math.ceil(height / 2) - 1);
      const isControlCell = controlCellKeys.has(key);
      cell.className = 'replay-cell';
      cell.style.gridColumn = `${x + 1}`;
      cell.style.gridRow = `${y + 1}`;
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.dataset.parity = (x + y) % 2;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) cell.dataset.edge = 'true';
      if (isCenterCell) {
        cell.dataset.center = 'true';
        cell.dataset.cellMark = '⌾';
      }
      if (isControlCell) {
        cell.dataset.zone = 'control';
        cell.dataset.cellMark = '⌾';
      }
      if (resource) {
        const resourceKind = resource.contested
          ? 'contested'
          : String(resource.id ?? '').includes('_A_')
            ? 'side-a'
            : String(resource.id ?? '').includes('_B_')
              ? 'side-b'
              : 'neutral';
        cell.dataset.resource = Number(resource.amount ?? 0) > 0 ? 'loaded' : 'depleted';
        cell.dataset.resourceKind = resourceKind;
        cell.dataset.cellMark = resource.contested ? '◆' : '◇';
      }
      if (resource?.contested) cell.dataset.contested = 'true';
      if (obstacleCells.has(key)) {
        cell.dataset.obstacle = 'true';
        cell.dataset.cellMark = '▧';
      }
      if (coreCells.has(key)) {
        cell.dataset.core = coreCells.get(key);
        cell.dataset.cellMark = '◇';
      }
      if (unitSides.has(key)) cell.dataset.occupied = [...unitSides.get(key)].sort().join('');
      if (action) {
        cell.dataset.action = action.tone;
        cell.dataset.actionRole = action.role;
      }
      if (x === 0 && y % 2 === 0) {
        const coord = document.createElement('span');
        coord.className = 'cell-coord cell-coord-y';
        coord.textContent = y;
        cell.append(coord);
      }
      if (y === height - 1 && x % 2 === 0) {
        const coord = document.createElement('span');
        coord.className = 'cell-coord cell-coord-x';
        coord.textContent = x;
        cell.append(coord);
      }
      board.append(cell);
    }
  }

  for (const side of ['A', 'B']) addAnchor(board, state?.players?.[side]?.core, width, height, side);

  for (const event of events) {
    if (event.type === 'move') {
      const to = event.to ?? { x: event.x, y: event.y };
      addVector(board, event.from, to, width, height, 'move');
      addPulse(board, to, width, height, 'move');
    } else if (event.type === 'gather') {
      const resource = positionFor(event.resource, state);
      const unit = positionFor(event.unit, state);
      addVector(board, unit, resource, width, height, 'gather');
      addPulse(board, resource, width, height, 'gather');
    } else if (event.type === 'core_damage') {
      const target = state?.players?.[event.defender]?.core;
      addPulse(board, target, width, height, 'damage');
      const attacker = !['A', 'B'].includes(event.attacker) && event.source !== 'center_control' ? positionLike(event.attacker, state) : null;
      if (attacker) addVector(board, attacker, target, width, height, 'damage');
    } else if (event.type === 'attack') {
      const attacker = positionFor(event.attacker ?? event.unit, state);
      const target = positionFor(event.defender ?? event.target, state) ?? state?.players?.[event.defender]?.core;
      addVector(board, attacker, target, width, height, 'damage');
      addPulse(board, target, width, height, 'damage');
    } else if (event.type === 'center_control') {
      addPulse(board, { x: (width - 1) / 2, y: (height - 1) / 2 }, width, height, 'control');
    } else if (event.type === 'spawn') {
      addPulse(board, positionLike(event.unit, state), width, height, 'spawn');
    } else if (event.type === 'repair_core') {
      addPulse(board, state?.players?.[event.player]?.core, width, height, 'gather');
    } else if (['starvation', 'unit_destroyed', 'pressure_damage', 'pressure_unit_destroyed'].includes(event.type)) {
      addPulse(board, positionFor(event.unit ?? event.target, state), width, height, 'damage');
    } else if (event.type === 'overtime_pressure') {
      addPulse(board, { x: (width - 1) / 2, y: (height - 1) / 2 }, width, height, 'control');
    }
  }

  for (const obstacle of obstacles) {
    board.append(piece(obstacle, 'replay-piece obstacle', ''));
  }

  for (const resource of resources) {
    const amount = Number(resource.amount ?? 0);
    const node = piece(resource, `replay-piece resource ${resource.contested ? 'contested' : ''}`, '');
    node.style.setProperty('--resource-pct', pct(amount, 12));
    node.dataset.amount = amount;
    node.dataset.status = amount > 0 ? 'loaded' : 'depleted';
    board.append(node);
  }

  const stackFor = buildStackPlan([...cores, ...units]);

  for (const side of ['A', 'B']) {
    const core = state?.players?.[side]?.core;
    if (core) board.append(piece(core, `replay-piece core-piece side-${side}`, side, stackFor(core), damageFor(core)));
  }

  for (const unit of units) {
    const label = unit.type === 'worker' ? 'W' : unit.type === 'striker' ? 'S' : 'U';
    const node = piece(unit, `replay-piece unit-piece ${unit.type ?? 'unit'} side-${unit.player ?? 'N'}`, label, stackFor(unit), damageFor(unit));
    board.append(node);
  }

  for (const impact of damageImpacts) addDamageSourceCue(board, impact, width, height);
  for (const impact of damageTargets) addDamageMarker(board, impact, width, height);
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
  if (unitsValue) {
    const sideUnits = (state?.units ?? []).filter((unit) => unit.player === side);
    const liveUnits = sideUnits.filter((unit) => Number(unit.hp ?? 1) > 0);
    unitsValue.textContent = `${liveUnits.length}/${sideUnits.length}`;
  }
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
  const motionMs = () => Math.round(clamp(intervalMs() * 0.64, 140, 440));

  const renderList = (items, mapper, emptyText) => items.length
    ? items.map((item) => mapper(item)).join('')
    : `<p class="empty-log">${escapeHtml(emptyText)}</p>`;

  const render = (nextIndex) => {
    const previousIndex = index;
    const previousPieces = captureBoardMotion(board);
    index = Math.max(0, Math.min(frames.length - 1, Number(nextIndex) || 0));
    const frame = frames[index];
    const state = frame?.state ?? replay.final_state;
    board.style.setProperty('--frame-motion', `${motionMs()}ms`);
    renderBoard(board, state, frame);
    if (Math.abs(index - previousIndex) === 1) animateBoardMotion(board, previousPieces, motionMs());
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
  const encounterGroups = [...document.querySelectorAll('[data-encounter-group]')];
  if (!tabs.length || !panels.length) return;

  const activate = (id, { updateHash = false } = {}) => {
    const selectedTab = tabs.find((tab) => tab.dataset.matchTab === id);
    if (!selectedTab) return;

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
    for (const group of encounterGroups) {
      group.classList.toggle('is-active', group.contains(selectedTab));
    }
    if (updateHash) {
      history.replaceState(null, '', `#${id}`);
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activate(tab.dataset.matchTab, { updateHash: true }));
    tab.addEventListener('keydown', (event) => {
      const current = tabs.indexOf(tab);
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const nextIndex = event.key === 'ArrowRight'
          ? (current + 1) % tabs.length
          : (current - 1 + tabs.length) % tabs.length;
        tabs[nextIndex].focus();
        activate(tabs[nextIndex].dataset.matchTab, { updateHash: true });
      }
    });
  });

  const activateHash = () => {
    const hashId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (hashId && tabs.some((tab) => tab.dataset.matchTab === hashId)) {
      activate(hashId);
      return true;
    }
    return false;
  };

  if (!activateHash()) {
    activate(tabs[0].dataset.matchTab);
  }
  window.addEventListener('hashchange', activateHash);
}

initMatchTabs();
document.querySelectorAll('[data-replay-src]').forEach(initReplay);
