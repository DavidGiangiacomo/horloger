// L'établi : une platine, un ressort, des pignons de 8 à 60 dents, une aiguille.
// Pas de boîtier, pas d'échappement, pas de commande, pas de progression (MVP, design doc §14).

import { pitchRadius, tipRadius, gearPath, AXLE_TOLERANCE, dist } from './geometry.js';
import { solve, applySolution, periodOf, ETA } from './mechanism.js';
import { formatPeriod, formatTorque, formatSpeed, formatArea, formatPercent } from './format.js';
import { createRenderer } from './render.js';
import { createEditor } from './editor.js';
import { createAudio } from './audio.js';
import { save, load, clear } from './store.js';

const PLATE = { w: 600, h: 400 };
const INVENTORY = [8, 10, 12, 15, 16, 20, 24, 30, 36, 40, 48, 60];
const SOURCE = { z: 40, x: 100, y: 200, omega0: 1, torque0: 1 };

const now = () => Date.now() / 1000;
const $ = (sel) => document.querySelector(sel);

function makeSource() {
  return { id: 'source', z: SOURCE.z, x: SOURCE.x, y: SOURCE.y, layer: 0, isSource: true,
    omega0: SOURCE.omega0, torque0: SOURCE.torque0, phase: 0, omega: 0, tRef: now() };
}

const model = { parts: [], hand: null, nextId: 1 };
const saved = load();
if (saved) {
  model.parts = saved.parts;
  model.hand = saved.hand ?? null;
  model.nextId = saved.nextId ?? 1;
  const src = model.parts.find((p) => p.isSource);
  if (!src) model.parts.unshift(makeSource());
  else Object.assign(src, { omega0: SOURCE.omega0, torque0: SOURCE.torque0 });
} else {
  model.parts = [makeSource()];
}

const svg = $('#plate');
const renderer = createRenderer(svg, PLATE);
const audio = createAudio();
let solution = null;
let wasJammed = false;

const handPart = () => model.parts.find((p) => p.id === model.hand) || null;
const byId = () => new Map(model.parts.map((p) => [p.id, p]));

function commit() {
  const t = now();
  solution = solve(model.parts, t);
  applySolution(model.parts, solution, t);
  if (solution.jammed && !wasJammed) audio.grind();
  wasJammed = solution.jammed;
  renderer.rebuild(model.parts, handPart());
  renderer.setJammed(solution.jammed);
  updateStats();
  save(model);
}

// ---------------------------------------------------------------------------
// Fiche : période, couple, frottements, place

function footprint() {
  // Surface projetée : sur un même axe, la plus grande roue compte.
  const axles = [];
  for (const p of model.parts) {
    let ax = axles.find((a) => dist(a, p) <= AXLE_TOLERANCE);
    if (!ax) { ax = { x: p.x, y: p.y, r: 0 }; axles.push(ax); }
    ax.r = Math.max(ax.r, tipRadius(p.z));
  }
  return axles.reduce((s, a) => s + Math.PI * a.r * a.r, 0);
}

function updateStats() {
  const hp = handPart();
  const periodEl = $('#stat-period'), torqueEl = $('#stat-torque'), etaEl = $('#stat-eta'), spaceEl = $('#stat-space');
  if (solution.jammed) {
    periodEl.textContent = 'grippé';
    periodEl.classList.add('bad');
  } else {
    periodEl.classList.remove('bad');
    periodEl.textContent = hp ? formatPeriod(periodOf(hp.omega)) : '—';
  }
  torqueEl.textContent = hp && hp.connected && !solution.jammed ? formatTorque(hp.torque) : '—';
  if (hp && hp.connected && !solution.jammed) {
    const n = hp.stage;
    etaEl.textContent = n ? `${formatPercent(1 - ETA ** n)} perdus sur ${n} ${n > 1 ? 'étages' : 'étage'}` : 'aucun étage';
  } else {
    etaEl.textContent = '—';
  }
  const total = PLATE.w * PLATE.h;
  const free = Math.max(0, total - footprint());
  spaceEl.textContent = `${formatArea(free)} (${formatPercent(free / total)})`;
  $('#stat-parts').textContent = String(model.parts.length - 1);

  const status = $('#jam');
  if (solution.jammed) {
    const kinds = new Set(solution.jams.map((j) => j.type));
    status.textContent = kinds.has('collision')
      ? 'Mécanisme grippé : deux dentures se chevauchent.'
      : 'Mécanisme bloqué : deux trains imposent des vitesses contradictoires à la même roue.';
    status.hidden = false;
  } else if (!hp) {
    status.textContent = 'Posez l’aiguille sur un axe pour lire sa période.';
    status.hidden = false;
  } else {
    status.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Inventaire

function buildInventory() {
  const list = $('#parts-list');
  for (const z of INVENTORY) {
    const card = document.createElement('div');
    card.className = `part-card ${z < 20 ? 'steel' : 'brass'}`;
    card.dataset.z = z;
    const ra = tipRadius(z);
    const box = Math.max(22, ra * 1.12);
    card.innerHTML = `<svg viewBox="${-box} ${-box} ${2 * box} ${2 * box}"><path d="${gearPath(z)}" fill-rule="evenodd"/></svg>`
      + `<div class="part-name">${z} dents</div><div class="part-meta">⌀ ${2 * pitchRadius(z)} mm</div>`;
    card.title = `${z < 20 ? 'Pignon' : 'Roue'} de ${z} dents — diamètre primitif ${2 * pitchRadius(z)} mm`;
    list.appendChild(card);
  }
  const hand = document.createElement('div');
  hand.className = 'part-card hand-card';
  hand.dataset.hand = '';
  hand.innerHTML = `<svg viewBox="-30 -30 60 60"><path class="hand-body" d="M-14 0 L-10 -2.4 L0 -1.8 L26 0 L0 1.8 L-10 2.4 Z"/><circle r="3" class="hand-cap"/></svg>`
    + `<div><div class="part-name">Aiguille</div><div class="part-meta">à poser sur un axe</div></div>`;
  list.appendChild(hand);
}

// ---------------------------------------------------------------------------
// Infobulle

const tooltip = $('#tooltip');
function onHover(part, e) {
  if (!part) { tooltip.hidden = true; return; }
  let text;
  if (part.isSource) text = `Barillet — ressort régulé · ${formatSpeed(part.omega0)} · ${formatTorque(part.torque0)}`;
  else if (solution.jammed) text = `${part.z} dents · étage ${part.layer + 1} · grippé`;
  else if (!part.connected) text = `${part.z} dents · étage ${part.layer + 1} · non relié`;
  else text = `${part.z} dents · étage ${part.layer + 1} · ${formatSpeed(part.omega)} · ${formatTorque(part.torque)}`;
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

buildInventory();
renderer.fit();
window.addEventListener('resize', () => renderer.fit());

const editor = createEditor({ svg, inventoryEl: $('#inventory'), model, plate: PLATE, renderer, commit, onHover, onStatus });

$('#btn-sound').addEventListener('click', (e) => {
  const on = audio.setEnabled(!audio.enabled);
  e.currentTarget.textContent = on ? 'Son : actif' : 'Son : coupé';
  e.currentTarget.setAttribute('aria-pressed', String(on));
});
$('#btn-clear').addEventListener('click', () => {
  if (model.parts.length <= 1 || confirm('Tout démonter et ranger l’atelier ?')) { editor.clearAll(); clear(); save(model); }
});
$('#btn-help').addEventListener('click', () => $('#help').showModal());
$('#btn-fit').addEventListener('click', () => renderer.fit());

commit();

function loop() {
  const t = now();
  renderer.frame(t);
  if (solution) audio.update(solution.edges, byId(), t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Pour l'inspection dans la console.
window.horloger = { model, commit, editor, renderer };
