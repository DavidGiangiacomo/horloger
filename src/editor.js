// Éditeur de pose : glisser, accrocher, poser. C'est ici que le jeu se joue (risque R1).
// Accrochage automatique : sur un axe existant (pignons coaxiaux), à la distance d'engrènement
// d'un voisin, ou à l'intersection des distances d'engrènement de deux voisins (roue partagée).

import { pitchRadius, tipRadius, dist, circleIntersections, MAX_LAYERS, AXLE_TOLERANCE } from './geometry.js';
import { solve } from './mechanism.js';

const GHOST_ID = '__fantome__';

export function createEditor({ svg, inventoryEl, model, plate, renderer, commit, onHover, onStatus }) {
  let drag = null;
  let hovered = null;

  const now = () => Date.now() / 1000;

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
  const findPart = (id) => model.parts.find((p) => p.id === id);

  /** Regroupe les pièces par axe (centres confondus). */
  function axlesOf(parts) {
    const axles = [];
    for (const p of parts) {
      let ax = axles.find((a) => dist(a, p) <= AXLE_TOLERANCE);
      if (!ax) { ax = { x: p.x, y: p.y, parts: [] }; axles.push(ax); }
      ax.parts.push(p);
    }
    return axles;
  }

  function inBounds(x, y, z) {
    const r = tipRadius(z);
    return x - r >= 0 && y - r >= 0 && x + r <= plate.w && y + r <= plate.h;
  }

  /** Essaie une position sur une liste d'étages : le solveur dit si ça grippe. */
  function tryLayers(others, z, x, y, layers, snap) {
    let firstValid = null;
    for (const layer of layers) {
      const temp = { id: GHOST_ID, z, x, y, layer, phase: 0, omega: 0, tRef: now() };
      const res = solve([...others, temp], now());
      const collision = res.jams.some((j) => j.type === 'collision' && (j.a === GHOST_ID || j.b === GHOST_ID));
      const partners = res.edges
        .filter((e) => e.type === 'mesh' && (e.a === GHOST_ID || e.b === GHOST_ID))
        .map((e) => (e.a === GHOST_ID ? e.b : e.a));
      const valid = !collision && inBounds(x, y, z);
      const c = { kind: 'gear', z, x, y, layer, valid, jam: res.jammed, partners, snap };
      if (valid && !res.jammed) return c;
      if (valid && !firstValid) firstValid = c;
    }
    return firstValid || { kind: 'gear', z, x, y, layer: layers[0] ?? 0, valid: false, jam: false, partners: [], snap };
  }

  /** Où irait un pignon de z dents si on le lâchait ici ? */
  function gearCandidate(z, cursor, excludeId) {
    const others = model.parts.filter((p) => p.id !== excludeId);
    const r = pitchRadius(z);
    const snap = snapRadius();

    // 1. Sur un axe existant → pignon coaxial, à l'étage libre le plus bas qui ne grippe pas.
    let nearest = null;
    for (const ax of axlesOf(others)) {
      const d = dist(cursor, ax);
      if (d <= snap && (!nearest || d < nearest.d)) nearest = { ax, d };
    }
    if (nearest) {
      const used = new Set(nearest.ax.parts.map((p) => p.layer));
      const layers = [];
      for (let l = 0; l < MAX_LAYERS; l++) if (!used.has(l)) layers.push(l);
      if (!layers.length) return { kind: 'gear', z, x: nearest.ax.x, y: nearest.ax.y, layer: 0, valid: false, jam: false, partners: [], snap: 'axle' };
      return tryLayers(others, z, nearest.ax.x, nearest.ax.y, layers, 'axle');
    }

    // 2. À la distance d'engrènement d'un voisin (ou de deux à la fois).
    const near = others
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
        const c = tryLayers(others, z, pts[0].x, pts[0].y, [o.layer], 'mesh');
        if (c.valid) return c;
        firstInvalid ??= c;
      }
      const d = dist(cursor, o) || 1;
      const k = (r + pitchRadius(o.z)) / d;
      const c = tryLayers(others, z, o.x + (cursor.x - o.x) * k, o.y + (cursor.y - o.y) * k, [o.layer], 'mesh');
      if (c.valid) return c;
      firstInvalid ??= c;
    }
    if (firstInvalid) return firstInvalid;

    // 3. Pose libre, au demi-millimètre.
    const layers = [];
    for (let l = 0; l < MAX_LAYERS; l++) layers.push(l);
    return tryLayers(others, z, Math.round(cursor.x * 2) / 2, Math.round(cursor.y * 2) / 2, layers, 'free');
  }

  /** L'aiguille se pose sur un axe. */
  function handCandidate(cursor) {
    const snap = snapRadius() * 1.4;
    let best = null;
    for (const ax of axlesOf(model.parts)) {
      const d = dist(cursor, ax);
      if (d <= snap && (!best || d < best.d)) best = { ax, d };
    }
    if (!best) return { kind: 'hand', x: cursor.x, y: cursor.y, valid: false };
    const top = best.ax.parts.reduce((a, b) => (b.layer > a.layer ? b : a));
    return { kind: 'hand', x: best.ax.x, y: best.ax.y, valid: true, partId: top.id };
  }

  function describe(c) {
    if (!c) return '';
    if (c.kind === 'hand') return c.valid ? 'Poser l’aiguille sur cet axe' : 'L’aiguille se pose sur un axe';
    if (!c.valid) return c.snap === 'axle' ? 'Plus d’étage libre sur cet axe' : 'Les dentures se chevauchent : impossible ici';
    const where = c.layer ? ` à l’étage ${c.layer + 1}` : '';
    if (c.snap === 'axle') return `Sur le même axe${where}` + (c.partners.length ? ', engrène ' + names(c.partners) : '');
    if (c.partners.length) return `Engrène ${names(c.partners)}${where}` + (c.jam ? ' — mais le mécanisme gripperait' : '');
    return `Pose libre${where}`;
  }
  function names(ids) {
    return ids.map((id) => { const p = findPart(id); return p?.isSource ? 'le barillet' : `la roue de ${p?.z} dents`; }).join(' et ');
  }

  // ---------------------------------------------------------------------------
  // Pièces et aiguille

  function addPart(z, c) {
    model.parts.push({ id: `p${model.nextId++}`, z, x: c.x, y: c.y, layer: c.layer, phase: Math.random() * 2 * Math.PI, omega: 0, tRef: now() });
  }

  function removePart(id) {
    const part = findPart(id);
    if (!part || part.isSource) return;
    model.parts = model.parts.filter((p) => p.id !== id);
    if (model.hand === id) {
      const sibling = model.parts.find((p) => dist(p, part) <= AXLE_TOLERANCE);
      model.hand = sibling ? sibling.id : null;
    }
    if (hovered?.id === id) hovered = null;
    commit();
  }

  function clearAll() {
    model.parts = model.parts.filter((p) => p.isSource);
    model.hand = null;
    commit();
  }

  // ---------------------------------------------------------------------------
  // Événements

  function onDownSvg(e) {
    if (drag) return;
    const gearEl = e.target.closest('.gear');
    const handEl = e.target.closest('.hand-piece');
    if (e.button === 2) {
      if (gearEl) removePart(gearEl.dataset.id);
      return;
    }
    if (e.button === 1 || (e.button === 0 && !gearEl && !handEl)) {
      drag = { kind: 'pan', last: { x: e.clientX, y: e.clientY } };
      svg.classList.add('panning');
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    if (handEl) {
      drag = { kind: 'hand', previous: model.hand };
      model.hand = null;
      commit();
      updateGhost(e);
      return;
    }
    const part = findPart(gearEl.dataset.id);
    if (!part) return;
    const cur = toPlate(e);
    drag = { kind: 'move', part, z: part.z, original: { x: part.x, y: part.y, layer: part.layer }, offset: { x: cur.x - part.x, y: cur.y - part.y } };
    model.parts = model.parts.filter((p) => p.id !== part.id);
    hovered = null;
    onHover(null, e);
    commit();
    updateGhost(e);
  }

  function onDownInventory(e) {
    if (drag || e.button !== 0) return;
    const item = e.target.closest('[data-z], [data-hand]');
    if (!item) return;
    e.preventDefault();
    if (item.dataset.hand !== undefined) {
      drag = { kind: 'hand', previous: model.hand };
      if (model.hand) { model.hand = null; commit(); }
    } else {
      drag = { kind: 'new', z: Number(item.dataset.z), offset: { x: 0, y: 0 } };
    }
  }

  function updateGhost(e) {
    if (!drag || drag.kind === 'pan') return;
    const cur = toPlate(e);
    if (drag.kind === 'hand') {
      drag.cand = overInventory(e) ? null : handCandidate(cur);
    } else {
      const target = { x: cur.x - drag.offset.x, y: cur.y - drag.offset.y };
      drag.cand = overInventory(e) ? null : gearCandidate(drag.z, target, null);
    }
    renderer.showGhost(drag.cand);
    onStatus(drag.cand ? describe(drag.cand) : (drag.kind === 'move' ? 'Lâcher ici pour ranger la pièce' : ''));
  }

  function onMove(e) {
    if (!drag) return;
    if (drag.kind === 'pan') {
      renderer.panBy(pxToMm(e.clientX - drag.last.x), pxToMm(e.clientY - drag.last.y));
      drag.last = { x: e.clientX, y: e.clientY };
      return;
    }
    e.preventDefault();
    updateGhost(e);
  }

  function onUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    renderer.showGhost(null);
    onStatus('');
    if (d.kind === 'pan') { svg.classList.remove('panning'); return; }
    const c = d.cand;
    if (d.kind === 'new') {
      if (c?.valid) { addPart(d.z, c); commit(); }
      return;
    }
    if (d.kind === 'move') {
      if (c?.valid) {
        Object.assign(d.part, { x: c.x, y: c.y, layer: c.layer });
        model.parts.push(d.part);
      } else if (overInventory(e) && !d.part.isSource) {
        if (model.hand === d.part.id) model.hand = null;
      } else {
        Object.assign(d.part, d.original);
        model.parts.push(d.part);
      }
      commit();
      return;
    }
    if (d.kind === 'hand') {
      model.hand = c?.valid ? c.partId : null;
      commit();
    }
  }

  function cancelDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    renderer.showGhost(null);
    onStatus('');
    svg.classList.remove('panning');
    if (d.kind === 'move') { Object.assign(d.part, d.original); model.parts.push(d.part); commit(); }
    if (d.kind === 'hand') { model.hand = d.previous && findPart(d.previous) ? d.previous : null; commit(); }
  }

  function onKey(e) {
    if (e.key === 'Escape') cancelDrag();
    if ((e.key === 'Delete' || e.key === 'Backspace') && hovered && !drag) removePart(hovered.id);
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
    const g = e.target.closest('.gear');
    hovered = g ? findPart(g.dataset.id) : null;
    onHover(hovered, e);
  });
  svg.addEventListener('pointermove', (e) => { if (!drag && hovered) onHover(hovered, e); });
  svg.addEventListener('pointerleave', () => { hovered = null; onHover(null); });

  return { removePart, clearAll, gearCandidate, handCandidate, get dragging() { return !!drag; } };
}
