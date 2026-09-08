// Rendu SVG. Le rendu est indépendant de la simulation : les angles sont lus depuis l'horloge.

import { gearPath, tipRadius, hubRadius, pitchRadius, ESC_FOOT, ESC_GAP } from './geometry.js';
import { currentAngle, isGear, escapementWheel } from './mechanism.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEG = 180 / Math.PI;
const TAU = 2 * Math.PI;

function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}
const f2 = (v) => Number(v).toFixed(2);

/** Épaisseur du trait de l'axe : le couple s'affiche en épaisseur, pas en chiffres. */
export function torqueStroke(torque) {
  if (!torque) return 0.6;
  return Math.min(4.5, Math.max(0.6, 0.7 + 0.75 * Math.log10(torque * 1000)));
}

/** Forme de l'ancre, pivot en (0,0), roue vers +x. */
const ANCHOR_PATH = 'M0 0 Q7 -19 19 -19 L24 -14 Q15 -14 7 0 Q15 14 24 14 L19 19 Q7 19 0 0 Z';

export function createRenderer(svg) {
  let plate = { w: 600, h: 400, rects: [], outline: [] };
  const view = { x: 0, y: 0, w: 600, h: 400 };

  const defs = el('defs', {}, svg);
  const grid = el('pattern', { id: 'grid', width: 10, height: 10, patternUnits: 'userSpaceOnUse' }, defs);
  el('path', { d: 'M10 0H0V10', class: 'grid-minor' }, grid);
  const gridMajor = el('pattern', { id: 'grid-major', width: 50, height: 50, patternUnits: 'userSpaceOnUse' }, defs);
  el('rect', { width: 50, height: 50, fill: 'url(#grid)' }, gridMajor);
  el('path', { d: 'M50 0H0V50', class: 'grid-major' }, gridMajor);
  const clip = el('clipPath', { id: 'plate-clip' }, defs);
  const clipPath = el('path', {}, clip);

  const plateShadow = el('path', { class: 'plate-shadow' }, svg);
  const platePath = el('path', { class: 'plate' }, svg);
  const plateGrid = el('rect', { class: 'plate-grid', fill: 'url(#grid-major)', 'clip-path': 'url(#plate-clip)' }, svg);
  const outputGroup = el('g', { id: 'output' }, svg);
  const shaftsGroup = el('g', { id: 'shafts' }, svg);
  const layersGroup = el('g', { id: 'layers' }, svg);
  const handGroup = el('g', { id: 'hand' }, svg);
  const ghostGroup = el('g', { id: 'ghost' }, svg);

  const nodes = new Map();   // id -> {g, rot, hub, part} | {g, anchor, balance, part}
  let hand = null;
  let ghost = null;
  let solution = null;

  function applyView() { svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); }

  /** Change de platine (forme, arbre de sortie). */
  function setPlate(p, output) {
    plate = p;
    const d = 'M' + p.outline.map(([x, y]) => `${x} ${y}`).join(' L') + ' Z';
    platePath.setAttribute('d', d);
    plateShadow.setAttribute('d', d);
    plateShadow.setAttribute('transform', 'translate(3 4)');
    clipPath.setAttribute('d', d);
    plateGrid.setAttribute('width', p.w);
    plateGrid.setAttribute('height', p.h);
    outputGroup.textContent = '';
    if (output) {
      const g = el('g', { class: 'output-mark', transform: `translate(${output.x} ${output.y})` }, outputGroup);
      el('circle', { r: 9 }, g);
      el('circle', { r: 2 }, g);
      el('path', { d: 'M-13 0H-9M9 0H13M0 -13V-9M0 9V13' }, g);
      const t = el('text', { y: 20, 'text-anchor': 'middle', 'font-size': 5 }, g);
      t.textContent = 'arbre de sortie';
    }
  }

  function buildGear(part, group) {
    const g = el('g', { class: `gear ${part.isSource ? 'source' : part.z < 20 ? 'steel' : 'brass'} layer-${part.layer}${part.fixed ? ' fixed' : ''}`, 'data-id': part.id });
    if (part.isSource) {
      // le barillet : un tambour sous la platine, le ressort enroulé dedans
      const rr = Math.max(pitchRadius(part.z) * 0.72, 24);
      el('circle', { class: 'drum', r: rr + 3 }, g);
      const drumRot = el('g', { class: 'drum-rot' }, g);
      let d = '';
      for (let i = 0; i <= 120; i++) {
        const t = i / 120, a = t * 5 * TAU, r = 4 + (rr - 4) * t;
        d += (i ? 'L' : 'M') + (r * Math.cos(a)).toFixed(2) + ' ' + (r * Math.sin(a)).toFixed(2);
      }
      el('path', { class: 'spring', d }, drumRot);
    }
    if (part.layer > 0) el('circle', { class: 'shadow', r: tipRadius(part.z), cx: 1.5 * part.layer, cy: 1.8 * part.layer }, g);
    const rot = el('g', { class: 'rot' }, g);
    el('path', { class: 'teeth', d: gearPath(part.z), 'fill-rule': 'evenodd' }, rot);
    if (!part.isSource && part.z < 24) el('circle', { class: 'mark', r: 1.2, cx: pitchRadius(part.z) - 3.6, cy: 0 }, rot);
    const hub = el('circle', { class: 'hub', r: hubRadius(part.z) }, g);
    const label = el('text', { class: 'z', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': Math.max(3.4, hubRadius(part.z) * 0.95) }, g);
    label.textContent = part.isSource ? '⟳' : String(part.z);
    group.appendChild(g);
    return { g, rot, hub, part, drumRot: g.querySelector('.drum-rot') };
  }

  function buildEscapement(part, group, parts) {
    const wheel = escapementWheel(part, parts.filter(isGear));
    const dir = wheel ? Math.atan2(wheel.y - part.y, wheel.x - part.x) * DEG : 0;
    const g = el('g', { class: `escapement layer-${part.layer}${wheel ? '' : ' idle'}`, 'data-id': part.id });
    const body = el('g', { class: 'esc-body', transform: `rotate(${f2(dir)})` }, g);
    el('circle', { class: 'foot', r: ESC_FOOT }, body);
    const anchor = el('path', { class: 'anchor', d: ANCHOR_PATH }, body);
    el('circle', { class: 'pivot', r: 1.6 }, body);
    const balance = el('g', { class: 'balance', transform: 'translate(-9 0)' }, g);
    el('circle', { class: 'rim', r: 11 }, balance);
    el('path', { class: 'spokes', d: 'M0 -11V11M-9.5 -5.5L9.5 5.5M-9.5 5.5L9.5 -5.5' }, balance);
    el('circle', { class: 'balance-hub', r: 1.8 }, balance);
    group.appendChild(g);
    return { g, anchor, balance, part };
  }

  function rebuild(parts, links, handPart) {
    layersGroup.textContent = '';
    nodes.clear();
    const maxLayer = Math.max(0, ...parts.map((p) => p.layer));
    const layerGroups = [];
    for (let i = 0; i <= maxLayer; i++) layerGroups.push(el('g', { class: 'layer', 'data-layer': i }, layersGroup));
    for (const part of parts) {
      nodes.set(part.id, isGear(part) ? buildGear(part, layerGroups[part.layer]) : buildEscapement(part, layerGroups[part.layer], parts));
    }
    updateStyles(parts);

    shaftsGroup.textContent = '';
    for (const link of links || []) {
      const g = el('g', { class: 'shaft', 'data-link': link.id }, shaftsGroup);
      el('line', { class: 'shaft-bar', x1: f2(link.x1), y1: f2(link.y1), x2: f2(link.x2), y2: f2(link.y2) }, g);
      el('line', { class: 'shaft-core', x1: f2(link.x1), y1: f2(link.y1), x2: f2(link.x2), y2: f2(link.y2) }, g);
      for (const end of [1, 2]) {
        const e = el('g', { class: 'shaft-end', 'data-link': link.id, 'data-end': end, transform: `translate(${f2(link[`x${end}`])} ${f2(link[`y${end}`])})` }, g);
        el('circle', { class: 'bevel', r: 6 }, e);
        el('circle', { class: 'pivot', r: 1.8 }, e);
      }
    }

    handGroup.textContent = '';
    hand = null;
    if (handPart) {
      const axleParts = parts.filter((p) => isGear(p) && Math.hypot(p.x - handPart.x, p.y - handPart.y) < 1);
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
      n.g.classList.toggle('idle', !part.connected && !(part.kind === 'escapement' && !n.g.classList.contains('idle')));
      n.g.classList.toggle('colliding', !!part.colliding);
      if (n.hub) n.hub.setAttribute('stroke-width', torqueStroke(part.torque).toFixed(2));
      n.g.setAttribute('transform', `translate(${f2(part.x)} ${f2(part.y)})`);
    }
  }

  function setSolution(sol) { solution = sol; }

  /** Temps effectif d'une pièce : avec un échappement, le train avance par battements. */
  function effectiveTime(part, now) {
    if (!solution?.beat || !part.connected) return now;
    return part.tRef + Math.floor((now - part.tRef) * solution.beat) / solution.beat;
  }

  function frame(now) {
    const swing = solution?.beat ? Math.sin(TAU * now * solution.beat / 2) : 0;
    for (const [, n] of nodes) {
      if (n.rot) {
        const a = currentAngle(n.part, effectiveTime(n.part, now)) * DEG;
        n.rot.setAttribute('transform', `rotate(${a.toFixed(3)})`);
        if (n.drumRot) n.drumRot.setAttribute('transform', `rotate(${(a * 0.2).toFixed(3)})`);
      } else if (n.anchor) {
        n.anchor.setAttribute('transform', `rotate(${(swing * 9).toFixed(2)})`);
        n.balance.setAttribute('transform', `translate(-9 0) rotate(${(swing * 150).toFixed(2)})`);
      }
    }
    if (hand) {
      const a = currentAngle(hand.part, effectiveTime(hand.part, now)) * DEG - 90;
      hand.g.setAttribute('transform', `translate(${f2(hand.part.x)} ${f2(hand.part.y)}) rotate(${a.toFixed(3)})`);
    }
  }

  function setJammed(jammed) { svg.classList.toggle('jammed', jammed); }

  /** Fantôme de pose. */
  function showGhost(c) {
    ghostGroup.textContent = '';
    for (const [, n] of nodes) n.g.classList.remove('partner');
    ghost = c;
    if (!c) return;
    const validity = c.valid ? (c.jam ? 'jam' : 'valid') : 'invalid';
    if (c.kind === 'hand') {
      const g = el('g', { class: `ghost hand-ghost ${validity}`, transform: `translate(${f2(c.x)} ${f2(c.y)})` }, ghostGroup);
      el('circle', { r: 6 }, g);
      el('path', { d: 'M-12 0 L36 0', class: 'hand-body' }, g);
      return;
    }
    if (c.kind === 'shaft') {
      const g = el('g', { class: `ghost shaft-ghost ${validity}` }, ghostGroup);
      if (c.x1 !== undefined) el('line', { x1: f2(c.x1), y1: f2(c.y1), x2: f2(c.x), y2: f2(c.y) }, g);
      el('circle', { r: 6, cx: f2(c.x), cy: f2(c.y) }, g);
      return;
    }
    if (c.kind === 'esc') {
      const g = el('g', { class: `ghost esc-ghost ${validity}`, transform: `translate(${f2(c.x)} ${f2(c.y)}) rotate(${f2(c.dir || 0)})` }, ghostGroup);
      el('circle', { r: ESC_FOOT, class: 'foot' }, g);
      el('path', { d: ANCHOR_PATH }, g);
      if (c.wheelId) nodes.get(c.wheelId)?.g.classList.add('partner');
      return;
    }
    const g = el('g', { class: `ghost ${validity} ${c.snap}`, transform: `translate(${f2(c.x)} ${f2(c.y)})` }, ghostGroup);
    el('path', { d: gearPath(c.z), 'fill-rule': 'evenodd' }, g);
    el('circle', { class: 'hub', r: hubRadius(c.z) }, g);
    if (c.layer > 0) {
      const t = el('text', { class: 'layer-tag', 'text-anchor': 'middle', y: -tipRadius(c.z) - 3, 'font-size': 5 }, g);
      t.textContent = `étage ${c.layer + 1}`;
    }
    for (const id of c.partners || []) nodes.get(id)?.g.classList.add('partner');
  }

  function zoomAt(px, py, factor) {
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

  return { setPlate, rebuild, updateStyles, frame, setJammed, setSolution, showGhost, zoomAt, panBy, fit, view, get ghost() { return ghost; } };
}

export { ESC_GAP };
