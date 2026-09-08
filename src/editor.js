// Éditeur de pose : glisser, accrocher, poser. C'est ici que le jeu se joue (risque R1).
// Accrochage automatique : sur un axe existant (pignons coaxiaux), à la distance d'engrènement
// d'un voisin, ou à l'intersection des distances d'engrènement de deux voisins (roue partagée).
// Les bouts d'arbre de renvoi et l'arbre de sortie imposé sont des axes comme les autres.

import { pitchRadius, tipRadius, dist, circleIntersections, insideShape, MAX_LAYERS, AXLE_TOLERANCE, ESC_GAP, ESC_FOOT } from './geometry.js';
import { isGear } from './mechanism.js';

const GHOST_ID = '__fantome__';
const SHAFT_MIN = 30, SHAFT_MAX = 320;

/**
 * @param state   { ws, model } — l'atelier courant et son modèle, remplacés par main.js au changement de boîtier
 * @param solveWith  (parts) => solution, avec les options de l'atelier
 */
export function createEditor({ svg, inventoryEl, state, renderer, solveWith, commit, onHover, onStatus, onSourceClick }) {
  let drag = null;
  let hovered = null;

  const now = () => Date.now() / 1000;
  const model = () => state.model;
  const ws = () => state.ws;

  function toPlate(evt) {
    const p = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  }
  function pxToMm(px) { return px / svg.getScreenCTM().a; }
  function snapRadius() { return Math.min(25, Math.max(4, pxToMm(18))); }
  function overInventory(evt) {
    const r = inventoryEl.getBoundingClientRect();
    return evt.clientX >= r.left && evt.clientX <= r.right && evt.clientY >= r.top && evt.clientY <= r.bottom;
  }
  const findPart = (id) => model().parts.find((p) => p.id === id);
  const findLink = (id) => model().links.find((l) => l.id === id);
  const inBounds = (x, y, r) => insideShape(ws().plate.rects, x, y, r);

  /** Regroupe les pièces par axe, plus les axes virtuels : bouts d'arbres, arbre de sortie. */
  function axlesOf(parts, excludeLinkEnd = null) {
    const axles = [];
    const add = (x, y, part) => {
      let ax = axles.find((a) => dist(a, { x, y }) <= AXLE_TOLERANCE);
      if (!ax) { ax = { x, y, parts: [] }; axles.push(ax); }
      if (part) ax.parts.push(part);
    };
    for (const p of parts) if (isGear(p)) add(p.x, p.y, p);
    for (const l of model().links) {
      if (!(excludeLinkEnd && excludeLinkEnd.link === l && excludeLinkEnd.end === 1)) add(l.x1, l.y1, null);
      if (!(excludeLinkEnd && excludeLinkEnd.link === l && excludeLinkEnd.end === 2)) add(l.x2, l.y2, null);
    }
    if (ws().output) add(ws().output.x, ws().output.y, null);
    return axles;
  }

  function nearestAxle(cursor, parts, radius, withParts = false, excludeLinkEnd = null) {
    let best = null;
    for (const ax of axlesOf(parts, excludeLinkEnd)) {
      if (withParts && !ax.parts.length) continue;
      const d = dist(cursor, ax);
      if (d <= radius && (!best || d < best.d)) best = { ax, d };
    }
    return best?.ax || null;
  }

  /** Essaie une position sur une liste d'étages : le solveur dit si ça grippe. */
  function tryLayers(others, temp, layers, snap, radius) {
    let firstValid = null;
    for (const layer of layers) {
      const t = { ...temp, layer };
      const res = solveWith([...others, t]);
      const collision = res.jams.some((j) => j.type === 'collision' && (j.a === GHOST_ID || j.b === GHOST_ID));
      const partners = res.edges
        .filter((e) => (e.type === 'mesh' || e.type === 'escapement') && (e.a === GHOST_ID || e.b === GHOST_ID))
        .map((e) => (e.a === GHOST_ID ? e.b : e.a));
      const outside = !inBounds(t.x, t.y, radius);
      const valid = !collision && !outside;
      const c = { ...t, kind: temp.kind === 'escapement' ? 'esc' : 'gear', valid, outside, jam: res.jammed, partners, snap, id: undefined };
      if (valid && !res.jammed) return c;
      if (valid && !firstValid) firstValid = c;
    }
    return firstValid || { ...temp, kind: temp.kind === 'escapement' ? 'esc' : 'gear', layer: layers[0] ?? 0, valid: false,
      outside: !inBounds(temp.x, temp.y, radius), jam: false, partners: [], snap, id: undefined };
  }

  /** Où irait un pignon de z dents si on le lâchait ici ? */
  function gearCandidate(z, cursor, excludeId) {
    const others = model().parts.filter((p) => p.id !== excludeId);
    const r = pitchRadius(z), radius = tipRadius(z);
    const snap = snapRadius();
    const temp = (x, y) => ({ id: GHOST_ID, z, x, y, layer: 0, phase: 0, omega: 0, tRef: now() });

    // 1. Sur un axe existant → pignon coaxial, à l'étage libre le plus bas qui ne grippe pas.
    const ax = nearestAxle(cursor, others, snap);
    if (ax) {
      const used = new Set(ax.parts.map((p) => p.layer));
      const layers = [];
      for (let l = 0; l < MAX_LAYERS; l++) if (!used.has(l)) layers.push(l);
      if (!layers.length) return { kind: 'gear', z, x: ax.x, y: ax.y, layer: 0, valid: false, jam: false, partners: [], snap: 'axle' };
      return tryLayers(others, temp(ax.x, ax.y), layers, 'axle', radius);
    }

    // 2. À la distance d'engrènement d'un voisin (ou de deux à la fois).
    const gears = others.filter(isGear);
    const near = gears
      .map((o) => ({ o, err: Math.abs(dist(cursor, o) - (r + pitchRadius(o.z))) }))
      .filter((c) => c.err <= snap)
      .sort((a, b) => a.err - b.err);
    let firstInvalid = null;
    for (let i = 0; i < near.length; i++) {
      const o = near[i].o;
      for (let j = i + 1; j < near.length; j++) {
        const p = near[j].o;
        if (p.layer !== o.layer) continue;
        const pts = circleIntersections(o, r + pitchRadius(o.z), p, r + pitchRadius(p.z))
          .sort((a, b) => dist(a, cursor) - dist(b, cursor));
        if (!pts.length || dist(pts[0], cursor) > snap * 1.5) continue;
        const c = tryLayers(others, temp(pts[0].x, pts[0].y), [o.layer], 'mesh', radius);
        if (c.valid) return c;
        firstInvalid ??= c;
      }
      const d = dist(cursor, o) || 1;
      const k = (r + pitchRadius(o.z)) / d;
      const c = tryLayers(others, temp(o.x + (cursor.x - o.x) * k, o.y + (cursor.y - o.y) * k), [o.layer], 'mesh', radius);
      if (c.valid) return c;
      firstInvalid ??= c;
    }
    if (firstInvalid) return firstInvalid;

    // 3. Pose libre, au demi-millimètre.
    const layers = [];
    for (let l = 0; l < MAX_LAYERS; l++) layers.push(l);
    return tryLayers(others, temp(Math.round(cursor.x * 2) / 2, Math.round(cursor.y * 2) / 2), layers, 'free', radius);
  }

  /** Un échappement s'accroche à ESC_GAP du primitif d'une roue, sur son étage. */
  function escCandidate(cursor, excludeId) {
    const others = model().parts.filter((p) => p.id !== excludeId);
    const snap = snapRadius();
    const temp = (x, y) => ({ id: GHOST_ID, kind: 'escapement', x, y, layer: 0, phase: 0, omega: 0, tRef: now() });
    const near = others.filter(isGear)
      .map((o) => ({ o, err: Math.abs(dist(cursor, o) - (pitchRadius(o.z) + ESC_GAP)) }))
      .filter((c) => c.err <= snap)
      .sort((a, b) => a.err - b.err);
    let firstInvalid = null;
    for (const { o } of near) {
      const d = dist(cursor, o) || 1;
      const k = (pitchRadius(o.z) + ESC_GAP) / d;
      const c = tryLayers(others, temp(o.x + (cursor.x - o.x) * k, o.y + (cursor.y - o.y) * k), [o.layer], 'esc', ESC_FOOT);
      c.wheelId = o.id;
      c.dir = Math.atan2(o.y - c.y, o.x - c.x) * 180 / Math.PI;
      if (c.valid) return c;
      firstInvalid ??= c;
    }
    if (firstInvalid) return firstInvalid;
    const layers = [];
    for (let l = 0; l < MAX_LAYERS; l++) layers.push(l);
    return tryLayers(others, temp(Math.round(cursor.x * 2) / 2, Math.round(cursor.y * 2) / 2), layers, 'free', ESC_FOOT);
  }

  /** L'aiguille se pose sur un axe qui porte une roue. */
  function handCandidate(cursor) {
    const ax = nearestAxle(cursor, model().parts, snapRadius() * 1.4, true);
    if (!ax) return { kind: 'hand', x: cursor.x, y: cursor.y, valid: false };
    const top = ax.parts.reduce((a, b) => (b.layer > a.layer ? b : a));
    return { kind: 'hand', x: ax.x, y: ax.y, valid: true, partId: top.id };
  }

  /** Un bout d'arbre de renvoi : sur un axe, ou n'importe où dans la platine. */
  function shaftEndCandidate(cursor, from, excludeLinkEnd) {
    const ax = nearestAxle(cursor, model().parts, snapRadius(), false, excludeLinkEnd);
    const x = ax ? ax.x : Math.round(cursor.x * 2) / 2, y = ax ? ax.y : Math.round(cursor.y * 2) / 2;
    let valid = inBounds(x, y, 6);
    let reason = valid ? '' : 'hors de la platine';
    if (valid && from) {
      const len = dist(from, { x, y });
      if (len < SHAFT_MIN) { valid = false; reason = 'arbre trop court'; }
      else if (len > SHAFT_MAX) { valid = false; reason = 'arbre trop long'; }
      else {
        // L'arbre passe sous la platine : il doit rester sous la platine, coin manquant compris.
        for (let i = 1; i < 12 && valid; i++) {
          const t = i / 12;
          if (!inBounds(from.x + (x - from.x) * t, from.y + (y - from.y) * t, 3)) { valid = false; reason = 'l’arbre sortirait de la platine'; }
        }
      }
    }
    return { kind: 'shaft', x, y, x1: from?.x, y1: from?.y, valid, snap: ax ? 'axle' : 'free', reason };
  }

  function describe(c) {
    if (!c) return '';
    if (c.kind === 'hand') return c.valid ? 'Poser l’aiguille sur cet axe' : 'L’aiguille se pose sur un axe qui porte une roue';
    if (c.kind === 'shaft') {
      if (!c.valid) return c.reason ? `Impossible : ${c.reason}` : 'Impossible ici';
      return c.x1 === undefined ? 'Poser le premier bout de l’arbre' : 'Cliquer pour poser le second bout';
    }
    if (c.outside) return 'Hors de la platine';
    if (c.kind === 'esc') {
      if (!c.valid) return 'L’ancre gênerait une roue : impossible ici';
      return c.wheelId ? `L’ancre bat sur ${names([c.wheelId])}` + (c.jam ? ' — mais le mécanisme gripperait' : '') : 'Pose libre : l’ancre n’est sur aucune roue';
    }
    if (!c.valid) return c.snap === 'axle' ? 'Plus d’étage libre sur cet axe' : 'Les dentures se chevauchent : impossible ici';
    const where = c.layer ? ` à l’étage ${c.layer + 1}` : '';
    if (c.snap === 'axle') return `Sur le même axe${where}` + (c.partners.length ? ', engrène ' + names(c.partners) : '');
    if (c.partners.length) return `Engrène ${names(c.partners)}${where}` + (c.jam ? ' — mais le mécanisme gripperait' : '');
    return `Pose libre${where}`;
  }
  function names(ids) {
    return ids.map((id) => { const p = findPart(id); return p?.isSource ? 'le barillet' : p?.kind === 'escapement' ? 'l’ancre' : `la roue de ${p?.z} dents`; }).join(' et ');
  }

  // ---------------------------------------------------------------------------
  // Pièces, arbres, aiguille

  function addPart(c, piece) {
    const m = model();
    const base = { id: `p${m.nextId++}`, x: c.x, y: c.y, layer: c.layer, phase: Math.random() * 2 * Math.PI, omega: 0, tRef: now() };
    m.parts.push(piece === 'escapement' ? { ...base, kind: 'escapement' } : { ...base, z: c.z });
  }

  function removePart(id) {
    const m = model();
    const part = findPart(id);
    if (!part || part.isSource) return;
    m.parts = m.parts.filter((p) => p.id !== id);
    if (m.hand === id) {
      const sibling = m.parts.find((p) => isGear(p) && dist(p, part) <= AXLE_TOLERANCE);
      m.hand = sibling ? sibling.id : null;
    }
    if (hovered?.id === id) hovered = null;
    commit();
  }

  function removeLink(id) {
    model().links = model().links.filter((l) => l.id !== id);
    commit();
  }

  function clearAll() {
    const m = model();
    m.parts = m.parts.filter((p) => p.isSource);
    m.links = [];
    m.hand = null;
    commit();
  }

  // ---------------------------------------------------------------------------
  // Événements

  function onDownSvg(e) {
    if (drag?.kind === 'shaftB') { e.preventDefault(); return; }   // le second bout se pose au relâchement
    if (drag) return;
    const gearEl = e.target.closest('.gear, .escapement');
    const handEl = e.target.closest('.hand-piece');
    const endEl = e.target.closest('.shaft-end');
    const shaftEl = e.target.closest('.shaft');
    if (e.button === 2) {
      if (gearEl) removePart(gearEl.dataset.id);
      else if (shaftEl) removeLink(shaftEl.dataset.link);
      return;
    }
    if (e.button === 1 || (e.button === 0 && !gearEl && !handEl && !endEl)) {
      drag = { kind: 'pan', last: { x: e.clientX, y: e.clientY }, moved: false };
      svg.classList.add('panning');
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    if (handEl) {
      drag = { kind: 'hand', previous: model().hand };
      model().hand = null;
      commit();
      updateGhost(e);
      return;
    }
    if (endEl) {
      const link = findLink(endEl.dataset.link);
      drag = { kind: 'shaftEnd', link, end: Number(endEl.dataset.end) };
      updateGhost(e);
      return;
    }
    const part = findPart(gearEl.dataset.id);
    if (!part) return;
    if (part.isSource && part.fixed) { drag = { kind: 'source-click' }; return; }
    const cur = toPlate(e);
    drag = { kind: 'move', part, piece: part.kind === 'escapement' ? 'escapement' : 'gear', z: part.z,
      original: { x: part.x, y: part.y, layer: part.layer }, offset: { x: cur.x - part.x, y: cur.y - part.y } };
    model().parts = model().parts.filter((p) => p.id !== part.id);
    hovered = null;
    onHover(null, e);
    commit();
    updateGhost(e);
  }

  function onDownInventory(e) {
    if (drag || e.button !== 0) return;
    const item = e.target.closest('[data-z], [data-hand], [data-shaft], [data-escapement]');
    if (!item) return;
    e.preventDefault();
    if (item.dataset.hand !== undefined) {
      drag = { kind: 'hand', previous: model().hand };
      if (model().hand) { model().hand = null; commit(); }
    } else if (item.dataset.shaft !== undefined) {
      drag = { kind: 'shaftA' };
    } else if (item.dataset.escapement !== undefined) {
      drag = { kind: 'new', piece: 'escapement', offset: { x: 0, y: 0 } };
    } else {
      drag = { kind: 'new', piece: 'gear', z: Number(item.dataset.z), offset: { x: 0, y: 0 } };
    }
  }

  function candidateFor(d, cur) {
    const target = d.offset ? { x: cur.x - d.offset.x, y: cur.y - d.offset.y } : cur;
    if (d.kind === 'hand') return handCandidate(cur);
    if (d.kind === 'shaftA') return shaftEndCandidate(cur, null);
    if (d.kind === 'shaftB') return shaftEndCandidate(cur, { x: d.x1, y: d.y1 });
    if (d.kind === 'shaftEnd') {
      const other = d.end === 1 ? { x: d.link.x2, y: d.link.y2 } : { x: d.link.x1, y: d.link.y1 };
      return shaftEndCandidate(cur, other, { link: d.link, end: d.end });
    }
    if (d.piece === 'escapement') return escCandidate(target, null);
    return gearCandidate(d.z, target, null);
  }

  function updateGhost(e) {
    if (!drag || drag.kind === 'pan' || drag.kind === 'source-click') return;
    const cur = toPlate(e);
    drag.cand = overInventory(e) && drag.kind !== 'shaftB' ? null : candidateFor(drag, cur);
    renderer.showGhost(drag.cand);
    onStatus(drag.cand ? describe(drag.cand) : (drag.kind === 'move' ? 'Lâcher ici pour ranger la pièce' : ''));
  }

  function onMove(e) {
    if (!drag) return;
    if (drag.kind === 'pan') {
      renderer.panBy(pxToMm(e.clientX - drag.last.x), pxToMm(e.clientY - drag.last.y));
      drag.last = { x: e.clientX, y: e.clientY };
      drag.moved = true;
      return;
    }
    if (drag.kind === 'source-click') return;
    e.preventDefault();
    updateGhost(e);
  }

  function onUp(e) {
    if (!drag) return;
    const d = drag;
    const c = d.cand;
    if (d.kind === 'shaftA') {
      drag = c?.valid ? { kind: 'shaftB', x1: c.x, y1: c.y } : null;
      if (drag) { onStatus('Cliquer pour poser le second bout'); return; }
    } else {
      drag = null;
    }
    renderer.showGhost(null);
    onStatus('');
    const m = model();
    switch (d.kind) {
      case 'pan': svg.classList.remove('panning'); return;
      case 'source-click': onSourceClick?.(); return;
      case 'new': if (c?.valid) { addPart(c, d.piece); commit(); } return;
      case 'move':
        if (c?.valid) { Object.assign(d.part, { x: c.x, y: c.y, layer: c.layer }); m.parts.push(d.part); }
        else if (overInventory(e)) { if (m.hand === d.part.id) m.hand = null; }
        else { Object.assign(d.part, d.original); m.parts.push(d.part); }
        commit();
        return;
      case 'hand': m.hand = c?.valid ? c.partId : null; commit(); return;
      case 'shaftB':
        if (c?.valid) { m.links.push({ id: `l${m.nextId++}`, x1: d.x1, y1: d.y1, x2: c.x, y2: c.y }); commit(); }
        return;
      case 'shaftEnd':
        if (c?.valid) { d.link[`x${d.end}`] = c.x; d.link[`y${d.end}`] = c.y; commit(); }
        return;
      default: return;
    }
  }

  function cancelDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    renderer.showGhost(null);
    onStatus('');
    svg.classList.remove('panning');
    if (d.kind === 'move') { Object.assign(d.part, d.original); model().parts.push(d.part); commit(); }
    if (d.kind === 'hand') { model().hand = d.previous && findPart(d.previous) ? d.previous : null; commit(); }
  }

  function onKey(e) {
    if (e.key === 'Escape') cancelDrag();
    if ((e.key === 'Delete' || e.key === 'Backspace') && hovered && !drag && !e.target.closest('input, textarea')) removePart(hovered.id);
  }

  function onWheel(e) {
    e.preventDefault();
    const p = toPlate(e);
    renderer.zoomAt(p.x, p.y, e.deltaY > 0 ? 1.12 : 1 / 1.12);
  }

  svg.addEventListener('pointerdown', onDownSvg);
  inventoryEl.addEventListener('pointerdown', onDownInventory);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', cancelDrag);
  window.addEventListener('keydown', onKey);
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('pointerover', (e) => {
    if (drag) return;
    const g = e.target.closest('.gear, .escapement');
    hovered = g ? findPart(g.dataset.id) : null;
    onHover(hovered, e);
  });
  svg.addEventListener('pointermove', (e) => { if (!drag && hovered) onHover(hovered, e); });
  svg.addEventListener('pointerleave', () => { hovered = null; onHover(null); });

  return { removePart, removeLink, clearAll, cancelDrag, gearCandidate, escCandidate, handCandidate, get dragging() { return !!drag; } };
}
