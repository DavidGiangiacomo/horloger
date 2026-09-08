// L'atelier : douze commandes, une par boîtier. Ici, les trois premières, plus l'établi libre du MVP.

import { pitchRadius, tipRadius, gearPath, ESC_GAP } from './geometry.js';
import { solve, applySolution, drainReserve, periodOf, efficiency, isGear } from './mechanism.js';
import { formatPeriod, formatTorque, formatSpeed, formatArea, formatPercent } from './format.js';
import { WORKSHOPS, BOITIERS, byId as workshopById, makeSource, check, footprint } from './boitiers.js';
import { createRenderer } from './render.js';
import { createEditor } from './editor.js';
import { createAudio } from './audio.js';
import { save, load, clear } from './store.js';

const now = () => Date.now() / 1000;
const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------------------
// État : un modèle par atelier, la progression, l'atelier courant.

const saved = load();
const slots = saved?.slots ?? {};
const completed = saved?.completed ?? {};
const state = { ws: null, model: null };

function newModel(ws) {
  return { parts: [makeSource(ws, now())], links: [], hand: null, nextId: 1 };
}

function modelFor(ws) {
  let m = slots[ws.id];
  if (!m) { m = newModel(ws); slots[ws.id] = m; }
  m.links ??= [];
  let src = m.parts.find((p) => p.isSource);
  if (!src) { src = makeSource(ws, now()); m.parts.unshift(src); }
  // La source est définie par l'atelier, jamais par la sauvegarde (sauf sa position et sa réserve).
  const fresh = makeSource(ws, now());
  Object.assign(src, { z: fresh.z, fixed: fresh.fixed, regulated: fresh.regulated, torque0: fresh.torque0, omega0: fresh.omega0, capacity: fresh.capacity });
  if (fresh.fixed) Object.assign(src, { x: fresh.x, y: fresh.y, layer: 0 });
  if (fresh.capacity === undefined) { delete src.wound; delete src.woundAt; } else { src.wound ??= fresh.capacity; src.woundAt ??= now(); }
  return m;
}

const svg = $('#plate');
const renderer = createRenderer(svg);
const audio = createAudio();
let solution = null;
let wasJammed = false, wasStatus = 'ok';
let exhaustTimer = null;

const handPart = () => state.model.parts.find((p) => p.id === state.model.hand) || null;
const sourcePart = () => state.model.parts.find((p) => p.isSource);
const byId = () => new Map(state.model.parts.map((p) => [p.id, p]));
const solveOpts = () => ({ links: state.model.links, beat: state.ws.escapement?.beat, cmin: state.ws.escapement?.cmin });
const solveWith = (parts) => solve(parts, now(), solveOpts());

function persist() {
  save({ current: state.ws.id, slots, completed });
}

function commit() {
  const t = now();
  const src = sourcePart();
  drainReserve(src, t);
  solution = solve(state.model.parts, t, solveOpts());
  applySolution(state.model.parts, solution, t);
  if (solution.jammed && !wasJammed) audio.grind();
  if (solution.status === 'runaway' && wasStatus !== 'runaway') audio.whirr();
  wasJammed = solution.jammed;
  wasStatus = solution.status;
  renderer.setSolution(solution);
  renderer.rebuild(state.model.parts, state.model.links, handPart());
  renderer.setJammed(solution.jammed);
  scheduleExhaustion();
  updateStats();
  persist();
}

/** Quand le ressort sera détendu, on recalcule : tout s'arrête. */
function scheduleExhaustion() {
  if (exhaustTimer) { clearTimeout(exhaustTimer); exhaustTimer = null; }
  if (Number.isFinite(solution.autonomy) && solution.running) {
    exhaustTimer = setTimeout(commit, Math.min(solution.autonomy * 1000 + 50, 2 ** 31 - 1));
  }
}

function rewind() {
  const src = sourcePart();
  if (!src || src.capacity === undefined) return;
  src.wound = src.capacity;
  src.woundAt = now();
  audio.ratchet();
  commit();
}

// ---------------------------------------------------------------------------
// Changement d'atelier

function switchTo(id) {
  if (state.ws) persist();
  const ws = workshopById(id) || BOITIERS[0];
  state.ws = ws;
  state.model = modelFor(ws);
  wasJammed = false; wasStatus = 'ok';
  renderer.setPlate(ws.plate, ws.output);
  buildTabs();
  buildInventory(ws);
  renderFiche(ws);
  $('#btn-rewind').hidden = ws.source.regulated;
  commit();
  renderer.fit();
}

function buildTabs() {
  const nav = $('#tabs');
  nav.textContent = '';
  for (const ws of WORKSHOPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab' + (ws.id === state.ws.id ? ' active' : '') + (completed[ws.id] ? ' done' : '');
    b.textContent = ws.n ? `${ws.n} · ${ws.title}` : ws.title;
    if (completed[ws.id]) b.title = 'Commande honorée';
    b.addEventListener('click', () => { if (ws.id !== state.ws.id) switchTo(ws.id); });
    nav.appendChild(b);
  }
}

function renderFiche(ws) {
  $('#ws-title').textContent = ws.n ? `Commande n°${ws.n} — ${ws.title}` : ws.title;
  $('#ws-text').textContent = ws.fiche;
  document.body.classList.toggle('sandbox', !ws.target);
}

// ---------------------------------------------------------------------------
// Fiche : période, couple, frottements, réserve, place — et les exigences de la commande.

function updateStats() {
  const ws = state.ws, hp = handPart(), src = sourcePart();
  const running = solution.running && !solution.jammed;
  const periodEl = $('#stat-period');
  periodEl.classList.toggle('bad', solution.jammed || (solution.status !== 'ok' && solution.status !== 'idle'));
  if (solution.jammed) periodEl.textContent = 'grippé';
  else if (solution.status === 'runaway') periodEl.textContent = 's’emballe';
  else if (solution.status === 'weak') periodEl.textContent = 'ne bat pas';
  else if (solution.status === 'empty') periodEl.textContent = 'ressort détendu';
  else periodEl.textContent = hp ? formatPeriod(periodOf(hp.omega)) : '—';

  const live = hp && hp.connected && running;
  $('#stat-torque').textContent = hp && hp.connected && !solution.jammed ? formatTorque(hp.torque) : '—';
  $('#stat-eta').textContent = live ? `${formatPercent(1 - efficiency(src, hp, solution.omega0))} de la puissance perdus` : '—';

  const reserveEl = $('#stat-reserve');
  reserveEl.parentElement.hidden = src.capacity === undefined;
  if (src.capacity !== undefined) {
    const turns = src.wound ?? src.capacity;
    const txt = `${turns.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} / ${src.capacity} tours`;
    reserveEl.textContent = Number.isFinite(solution.autonomy) && solution.running ? `${txt} · tient ${formatPeriod(solution.autonomy)}` : txt;
    $('#reserve-bar').style.width = `${Math.round((turns / src.capacity) * 100)}%`;
  }

  const total = ws.plate.rects.reduce((s, r) => s + r.w * r.h, 0);
  const free = Math.max(0, total - footprint(state.model.parts));
  $('#stat-space').textContent = `${formatArea(free)} (${formatPercent(free / total)})`;
  $('#stat-parts').textContent = String(state.model.parts.filter((p) => !p.isSource).length + state.model.links.length);

  // Message d'état
  const status = $('#jam');
  let msg = '';
  if (solution.jammed) {
    const kinds = new Set(solution.jams.map((j) => j.type));
    msg = kinds.has('collision') ? 'Mécanisme grippé : deux pièces se chevauchent.'
      : kinds.has('escapements') ? 'Deux ancres se disputent le train : elles imposent des vitesses différentes.'
      : 'Mécanisme bloqué : deux trains imposent des vitesses contradictoires à la même roue.';
  } else if (solution.status === 'runaway') msg = 'Le ressort s’emballe : rien ne le retient. Il faut une ancre qui batte sur une roue du train.';
  else if (solution.status === 'weak') msg = `L’ancre ne bat pas : ${formatTorque(solution.escapement.torque)} à la roue d’échappement, il en faut ${formatTorque(solution.escapement.cmin)}.`;
  else if (solution.status === 'empty') msg = 'Ressort détendu. Cliquez sur le barillet pour le remonter.';
  else if (!hp) msg = ws.output ? 'Posez l’aiguille sur l’arbre de sortie marqué.' : 'Posez l’aiguille sur un axe pour lire sa période.';
  status.textContent = msg;
  status.hidden = !msg;
  status.classList.toggle('warn', !solution.jammed);

  renderRequirements(ws);
}

function renderRequirements(ws) {
  const list = $('#exigences');
  const banner = $('#done');
  list.textContent = '';
  if (!ws.target) { banner.hidden = true; return; }
  const result = check(ws, state.model, solution);
  const labels = {
    period: (i) => `Un tour en ${formatPeriod(ws.target)}, à ${formatPercent(ws.tolerance).replace(' ', ' ')} près`
      + (Number.isFinite(i.period) ? ` — ${formatPeriod(i.period)}` : ''),
    output: () => 'L’aiguille sur l’arbre de sortie marqué',
    escapement: (i) => `L’ancre bat, ${formatTorque(ws.escapement.cmin)} au moins` + (i.torque ? ` — ${formatTorque(i.torque)}` : ''),
    reserve: (i) => `Réserve de ${formatPeriod(ws.reserve)} au moins` + (Number.isFinite(i.autonomy) && i.autonomy > 0 ? ` — ${formatPeriod(i.autonomy)}` : ''),
    sound: () => 'Mécanisme sain',
  };
  for (const item of result.items) {
    const li = document.createElement('li');
    li.className = item.ok ? 'ok' : 'ko';
    li.textContent = labels[item.key](item);
    list.appendChild(li);
  }
  if (result.ok) {
    const s = result.scores;
    if (!completed[ws.id]) { completed[ws.id] = { at: Date.now(), ...s }; buildTabs(); }
    else Object.assign(completed[ws.id], s);
    $('#done-scores').textContent = `${s.pieces} pièces · ${formatPercent(s.area)} de la platine · écart ${formatPercent(s.deviation)}`;
    const next = BOITIERS.find((b) => b.n === ws.n + 1);
    const btn = $('#btn-next');
    btn.textContent = next ? `Boîtier suivant : ${next.title}` : 'Retour à l’établi libre';
    btn.onclick = () => switchTo(next ? next.id : 'libre');
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Inventaire

function buildInventory(ws) {
  const list = $('#parts-list');
  list.textContent = '';
  for (const z of ws.inventory.gears) {
    const card = document.createElement('div');
    card.className = `part-card ${z < 20 ? 'steel' : 'brass'}`;
    card.dataset.z = z;
    const box = Math.max(22, tipRadius(z) * 1.12);
    card.innerHTML = `<svg viewBox="${-box} ${-box} ${2 * box} ${2 * box}"><path d="${gearPath(z)}" fill-rule="evenodd"/></svg>`
      + `<div class="part-name">${z} dents</div><div class="part-meta">⌀ ${2 * pitchRadius(z)} mm</div>`;
    card.title = `${z < 20 ? 'Pignon' : 'Roue'} de ${z} dents — diamètre primitif ${2 * pitchRadius(z)} mm`;
    list.appendChild(card);
  }
  const wide = (cls, data, svgInner, name, meta, title) => {
    const card = document.createElement('div');
    card.className = `part-card wide ${cls}`;
    card.dataset[data] = '';
    card.title = title;
    card.innerHTML = `<svg viewBox="-30 -18 60 36">${svgInner}</svg><div><div class="part-name">${name}</div><div class="part-meta">${meta}</div></div>`;
    list.appendChild(card);
  };
  if (ws.inventory.shaft) {
    wide('shaft-card', 'shaft', '<line class="shaft-bar" x1="-24" y1="0" x2="24" y2="0"/><circle class="bevel" cx="-24" r="6"/><circle class="bevel" cx="24" r="6"/>',
      'Arbre de renvoi', 'passe sous la platine, 10 % de perte', 'Deux bouts, deux axes : ils tournent ensemble. Posez le premier bout, puis cliquez pour le second.');
  }
  if (ws.inventory.escapement) {
    wide('esc-card', 'escapement', '<g transform="translate(2 0) scale(.75)"><path class="anchor" d="M0 0 Q7 -19 19 -19 L24 -14 Q15 -14 7 0 Q15 14 24 14 L19 19 Q7 19 0 0 Z"/><circle class="rim" cx="-14" r="11"/><path class="spokes" d="M-14 -11V11"/></g>',
      'Ancre et balancier', `${ws.escapement.beat} battements/s · ${formatTorque(ws.escapement.cmin)} au moins`, 'Se pose contre une roue du train et lui impose une dent par battement.');
  }
  wide('hand-card', 'hand', '<path class="hand-body" d="M-14 0 L-10 -2.4 L0 -1.8 L26 0 L0 1.8 L-10 2.4 Z"/><circle r="3" class="hand-cap"/>',
    'Aiguille', 'à poser sur un axe', 'La fiche affiche la période de l’axe qui porte l’aiguille.');
}

// ---------------------------------------------------------------------------
// Infobulle

const tooltip = $('#tooltip');
function onHover(part, e) {
  if (!part) { tooltip.hidden = true; return; }
  let text;
  const where = `étage ${part.layer + 1}`;
  if (part.isSource) {
    text = part.regulated
      ? `Moteur régulé — ${formatSpeed(part.omega0)} · ${formatTorque(part.torque0)}`
      : `Barillet — ${formatTorque(part.torque0)} · ${part.capacity} tours · cliquer pour remonter`;
  } else if (part.kind === 'escapement') {
    const esc = solution.escapement?.id === part.id ? solution.escapement : null;
    text = esc ? `Ancre · ${where} · ${formatTorque(esc.torque)} reçus` + (solution.status === 'weak' ? ' — insuffisant' : '') : `Ancre · ${where} · sur aucune roue`;
  } else if (solution.jammed) text = `${part.z} dents · ${where} · grippé`;
  else if (!part.connected) text = `${part.z} dents · ${where} · non relié`;
  else if (!solution.running) text = `${part.z} dents · ${where} · à l’arrêt · ${formatTorque(part.torque)}`;
  else text = `${part.z} dents · ${where} · ${formatSpeed(part.omega)} · ${formatTorque(part.torque)}`;
  tooltip.textContent = text;
  tooltip.hidden = false;
  const wrap = $('#plate-wrap').getBoundingClientRect();
  tooltip.style.left = `${e.clientX - wrap.left + 14}px`;
  tooltip.style.top = `${e.clientY - wrap.top + 16}px`;
}

const statusEl = $('#status');
function onStatus(text) {
  statusEl.textContent = text;
  statusEl.hidden = !text;
}

// ---------------------------------------------------------------------------
// Démarrage

const editor = createEditor({ svg, inventoryEl: $('#inventory'), state, renderer, solveWith, commit, onHover, onStatus, onSourceClick: rewind });

$('#btn-sound').addEventListener('click', (e) => {
  const on = audio.setEnabled(!audio.enabled);
  e.currentTarget.textContent = on ? 'Son : actif' : 'Son : coupé';
  e.currentTarget.setAttribute('aria-pressed', String(on));
});
$('#btn-clear').addEventListener('click', () => {
  const n = state.model.parts.length - 1 + state.model.links.length;
  if (n === 0 || confirm('Tout démonter et ranger l’établi ?')) editor.clearAll();
});
$('#btn-help').addEventListener('click', () => $('#help').showModal());
$('#btn-fit').addEventListener('click', () => renderer.fit());
$('#btn-rewind').addEventListener('click', rewind);
window.addEventListener('resize', () => renderer.fit());

switchTo(saved?.current ?? 'b1');

function loop() {
  const t = now();
  renderer.frame(t);
  if (solution) audio.update(solution, byId(), t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Pour l'inspection dans la console.
window.horloger = { state, slots, completed, commit, switchTo, rewind, editor, renderer, get solution() { return solution; }, clear, consts: { ESC_GAP } };
