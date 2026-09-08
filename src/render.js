// Rendu SVG. Le rendu est indépendant de la simulation : les angles sont lus depuis l'horloge.

import { gearPath, tipRadius, hubRadius, pitchRadius } from './geometry.js';
import { currentAngle } from './mechanism.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEG = 180 / Math.PI;

function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

/** Épaisseur du trait de l'axe : le couple s'affiche en épaisseur, pas en chiffres. */
export function torqueStroke(torque) {
  if (!torque) return 0.6;
  return Math.min(4.5, Math.max(0.6, 0.7 + 0.75 * Math.log10(torque * 1000)));
}

export function createRenderer(svg, plate) {
  const view = { x: -30, y: -30, w: plate.w + 60, h: plate.h + 60 };

  const defs = el('defs', {}, svg);
  const grid = el('pattern', { id: 'grid', width: 10, height: 10, patternUnits: 'userSpaceOnUse' }, defs);
  el('path', { d: 'M10 0H0V10', class: 'grid-minor' }, grid);
  const gridMajor = el('pattern', { id: 'grid-major', width: 50, height: 50, patternUnits: 'userSpaceOnUse' }, defs);
  el('rect', { width: 50, height: 50, fill: 'url(#grid)' }, gridMajor);
  el('path', { d: 'M50 0H0V50', class: 'grid-major' }, gridMajor);

  el('rect', { class: 'plate-shadow', x: 3, y: 4, width: plate.w, height: plate.h, rx: 6 }, svg);
  el('rect', { class: 'plate', x: 0, y: 0, width: plate.w, height: plate.h, rx: 6 }, svg);
  el('rect', { class: 'plate-grid', x: 0, y: 0, width: plate.w, height: plate.h, rx: 6, fill: 'url(#grid-major)' }, svg);

  const layersGroup = el('g', { id: 'layers' }, svg);
  const handGroup = el('g', { id: 'hand' }, svg);
  const ghostGroup = el('g', { id: 'ghost' }, svg);

  const nodes = new Map();   // id -> {g, rot, hub}
  let hand = null;           // {g, part}
  let ghost = null;

  function applyView() {
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  }
  applyView();

  function buildGear(part, layerGroups) {
    const g = el('g', { class: `gear ${part.isSource ? 'source' : part.z < 20 ? 'steel' : 'brass'} layer-${part.layer}`, 'data-id': part.id });
    if (part.layer > 0) {
      el('circle', { class: 'shadow', r: tipRadius(part.z), cx: 1.5 * part.layer, cy: 1.8 * part.layer }, g);
    }
    const rot = el('g', { class: 'rot' }, g);
    el('path', { class: 'teeth', d: gearPath(part.z), 'fill-rule': 'evenodd' }, rot);
    if (part.isSource) {
      // le barillet : un tambour avec le ressort enroulé, dessiné en spirale
      const rr = pitchRadius(part.z) * 0.72;
      let d = '';
      for (let i = 0; i <= 120; i++) {
        const t = i / 120, a = t * 5 * 2 * Math.PI, r = 4 + (rr - 4) * t;
        d += (i ? 'L' : 'M') + (r * Math.cos(a)).toFixed(2) + ' ' + (r * Math.sin(a)).toFixed(2);
      }
      el('path', { class: 'spring', d }, rot);
    } else if (part.z < 24) {
      el('circle', { class: 'mark', r: 1.2, cx: pitchRadius(part.z) - 3.6, cy: 0 }, rot);
    }
    const hub = el('circle', { class: 'hub', r: hubRadius(part.z) }, g);
    const label = el('text', { class: 'z', 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': Math.max(3.4, hubRadius(part.z) * 0.95) }, g);
    label.textContent = part.isSource ? '⟳' : String(part.z);
    layerGroups[part.layer].appendChild(g);
    return { g, rot, hub, part };
  }

  function rebuild(parts, handPart) {
    layersGroup.textContent = '';
    nodes.clear();
    const maxLayer = Math.max(0, ...parts.map((p) => p.layer));
    const layerGroups = [];
    for (let i = 0; i <= maxLayer; i++) layerGroups.push(el('g', { class: 'layer', 'data-layer': i }, layersGroup));
    for (const part of parts) nodes.set(part.id, buildGear(part, layerGroups));
    updateStyles(parts);

    handGroup.textContent = '';
    hand = null;
    if (handPart) {
      const axleParts = parts.filter((p) => Math.hypot(p.x - handPart.x, p.y - handPart.y) < 1);
      const reach = Math.max(40, ...axleParts.map((p) => tipRadius(p.z) + 22));
      const g = el('g', { class: 'hand-piece', 'data-hand': '1' }, handGroup);
      el('path', { class: 'hand-body', d: `M-14 0 L-10 -2.4 L0 -1.8 L${reach} 0 L0 1.8 L-10 2.4 Z` }, g);
      el('circle', { class: 'hand-cap', r: 3.2 }, g);
      hand = { g, part: handPart, reach };
    }
  }

  function updateStyles(parts) {
    for (const part of parts) {
      const n = nodes.get(part.id);
      if (!n) continue;
      n.g.classList.toggle('idle', !part.connected);
      n.g.classList.toggle('colliding', !!part.colliding);
      n.hub.setAttribute('stroke-width', torqueStroke(part.torque).toFixed(2));
      n.g.setAttribute('transform', `translate(${part.x.toFixed(2)} ${part.y.toFixed(2)})`);
    }
  }

  function frame(now) {
    for (const [, n] of nodes) {
      const a = currentAngle(n.part, now) * DEG;
      n.rot.setAttribute('transform', `rotate(${a.toFixed(3)})`);
    }
    if (hand) {
      const a = (currentAngle(hand.part, now) * DEG - 90);
      hand.g.setAttribute('transform', `translate(${hand.part.x.toFixed(2)} ${hand.part.y.toFixed(2)}) rotate(${a.toFixed(3)})`);
    }
  }

  function setJammed(jammed) { svg.classList.toggle('jammed', jammed); }

  /** Fantôme de pose : {z, x, y, layer, valid, jam, partners:[ids], kind:'gear'|'hand'} ou null. */
  function showGhost(c) {
    ghostGroup.textContent = '';
    for (const [, n] of nodes) n.g.classList.remove('partner');
    ghost = c;
    if (!c) return;
    if (c.kind === 'hand') {
      const g = el('g', { class: `ghost hand-ghost ${c.valid ? 'valid' : 'invalid'}`, transform: `translate(${c.x} ${c.y})` }, ghostGroup);
      el('circle', { r: 6 }, g);
      el('path', { d: 'M-12 0 L36 0', class: 'hand-body' }, g);
      return;
    }
    const cls = `ghost ${c.valid ? (c.jam ? 'jam' : 'valid') : 'invalid'} ${c.snap}`;
    const g = el('g', { class: cls, transform: `translate(${c.x.toFixed(2)} ${c.y.toFixed(2)})` }, ghostGroup);
    el('path', { d: gearPath(c.z), 'fill-rule': 'evenodd' }, g);
    el('circle', { class: 'hub', r: hubRadius(c.z) }, g);
    if (c.layer > 0) {
      const t = el('text', { class: 'layer-tag', 'text-anchor': 'middle', y: -tipRadius(c.z) - 3, 'font-size': 5 }, g);
      t.textContent = `étage ${c.layer + 1}`;
    }
    for (const id of c.partners || []) nodes.get(id)?.g.classList.add('partner');
  }

  function zoomAt(px, py, factor) {
    // px, py en coordonnées platine (point fixe du zoom)
    const nw = Math.min(plate.w * 4, Math.max(60, view.w * factor));
    const k = nw / view.w;
    view.x = px - (px - view.x) * k;
    view.y = py - (py - view.y) * k;
    view.w = nw;
    view.h *= k;
    applyView();
  }
  function panBy(dx, dy) { view.x -= dx; view.y -= dy; applyView(); }
  function fit() {
    const box = svg.getBoundingClientRect();
    const ratio = box.width / Math.max(1, box.height);
    const margin = 30;
    let w = plate.w + 2 * margin, h = w / ratio;
    if (h < plate.h + 2 * margin) { h = plate.h + 2 * margin; w = h * ratio; }
    view.x = (plate.w - w) / 2; view.y = (plate.h - h) / 2; view.w = w; view.h = h;
    applyView();
  }

  return { rebuild, updateStyles, frame, setJammed, showGhost, zoomAt, panBy, fit, view, get ghost() { return ghost; } };
}
