// Le mécanisme est un graphe résolu par parcours depuis la source : vitesse multipliée par
// z_entrée/z_sortie, couple par l'inverse × η. Résolution événementielle : on recalcule à chaque
// pose ou retrait, jamais par image.
//
// Deux sortes de moteurs :
//  - le moteur régulé (banc d'essai) impose sa vitesse ω₀ ;
//  - le ressort libre ne fournit qu'un couple. Sa vitesse est fixée par l'échappement qui bat sur
//    une roue du train ; sans échappement il s'emballe, et sous le couple minimal il ne bat pas.

import { meshes, coaxial, collides, dist, pitchRadius, tipRadius, AXLE_TOLERANCE, MESH_TOLERANCE, ESC_GAP, ESC_FOOT } from './geometry.js';

export const ETA = 0.97;           // rendement d'un étage (frottement, incompressible)
export const SHAFT_ETA = 0.9;      // un arbre de renvoi : deux couples coniques
export const RUNAWAY = 3;          // tours/s d'un ressort qui s'emballe sans échappement
const TAU = 2 * Math.PI;

export const isGear = (p) => !p.kind || p.kind === 'gear';

/** Angle courant d'une pièce (rad), calculé depuis l'horloge, jamais intégré image par image. */
export function currentAngle(part, now) {
  return part.phase + TAU * part.omega * (now - part.tRef);
}

/** Roue sur laquelle un échappement est engagé (même étage, ancre à ESC_GAP du primitif). */
export function escapementWheel(esc, gears) {
  let best = null;
  for (const g of gears) {
    if (g.layer !== esc.layer) continue;
    const err = Math.abs(dist(esc, g) - (pitchRadius(g.z) + ESC_GAP));
    if (err <= MESH_TOLERANCE && (!best || err < best.err)) best = { g, err };
  }
  return best ? best.g : null;
}

/**
 * Résout le mécanisme.
 * @param parts  pièces : pignons {id, z, x, y, layer, …}, la source (isSource), échappements (kind)
 * @param now    horloge (secondes)
 * @param opts   { links: arbres de renvoi [{x1,y1,x2,y2}], beat, cmin, eta, shaftEta }
 */
export function solve(parts, now, opts = {}) {
  const eta = opts.eta ?? ETA;
  const shaftEta = opts.shaftEta ?? SHAFT_ETA;
  const links = opts.links ?? [];
  const states = new Map();
  for (const p of parts) {
    states.set(p.id, { ratio: 0, omega: 0, torque: 0, phase: currentAngle(p, now), stage: 0, connected: false, colliding: false });
  }
  const gears = parts.filter(isGear);
  const escs = parts.filter((p) => p.kind === 'escapement');

  const edges = [];
  const jams = [];
  const adj = new Map(parts.map((p) => [p.id, []]));
  const addEdge = (a, b, type) => {
    edges.push({ a: a.id, b: b.id, type });
    adj.get(a.id).push({ to: b, type });
    adj.get(b.id).push({ to: a, type });
  };
  const addCollision = (a, b) => {
    jams.push({ type: 'collision', a: a.id, b: b.id });
    states.get(a.id).colliding = true;
    states.get(b.id).colliding = true;
  };

  for (let i = 0; i < gears.length; i++) {
    for (let j = i + 1; j < gears.length; j++) {
      const a = gears[i], b = gears[j];
      if (coaxial(a, b)) { if (a.layer === b.layer) addCollision(a, b); else addEdge(a, b, 'axle'); }
      else if (meshes(a, b)) addEdge(a, b, 'mesh');
      else if (collides(a, b)) addCollision(a, b);
    }
  }

  // Arbres de renvoi : chaque bout est un axe ; les deux bouts tournent ensemble.
  for (const link of links) {
    const endA = gears.find((g) => dist(g, { x: link.x1, y: link.y1 }) <= AXLE_TOLERANCE);
    const endB = gears.find((g) => dist(g, { x: link.x2, y: link.y2 }) <= AXLE_TOLERANCE);
    if (endA && endB && endA !== endB) addEdge(endA, endB, 'shaft');
  }

  // Échappements : engagés sur une roue, et encombrants.
  const engaged = new Map(); // esc.id -> roue
  for (const e of escs) {
    const wheel = escapementWheel(e, gears);
    if (wheel) { engaged.set(e.id, wheel); addEdge(e, wheel, 'escapement'); }
    for (const g of gears) {
      if (g.layer !== e.layer || g === wheel) continue;
      if (dist(e, g) < tipRadius(g.z) + ESC_FOOT) addCollision(e, g);
    }
    for (const f of escs) {
      if (f === e || f.layer !== e.layer || parts.indexOf(f) < parts.indexOf(e)) continue;
      if (dist(e, f) < 2 * ESC_FOOT) addCollision(e, f);
    }
  }

  // Parcours depuis la source : rapports (relatifs à ω₀), couples, phases.
  const source = parts.find((p) => p.isSource);
  if (source) {
    const s0 = states.get(source.id);
    Object.assign(s0, { ratio: 1, torque: source.torque0, connected: true });
    const queue = [source.id];
    const byId = new Map(parts.map((p) => [p.id, p]));
    while (queue.length) {
      const aId = queue.shift();
      const a = byId.get(aId), sa = states.get(aId);
      for (const { to: b, type } of adj.get(aId)) {
        if (type === 'escapement') continue;
        const sb = states.get(b.id);
        let ratio, torque, phase = sb.phase, stage = sa.stage;
        if (type === 'axle') { ratio = sa.ratio; torque = sa.torque; }
        else if (type === 'shaft') { ratio = sa.ratio; torque = sa.torque * shaftEta; }
        else {
          ratio = -sa.ratio * (a.z / b.z);
          torque = sa.torque * (b.z / a.z) * eta;
          // Parmi les phases équivalentes (à une dent près), on garde la plus proche de l'angle
          // courant : la roue ne saute pas à l'écran quand on recalcule.
          phase = nearestEquivalent(meshPhase(a, sa.phase, b), sb.phase, b.z);
          stage = sa.stage + 1;
        }
        if (sb.connected) {
          // Deuxième chemin vers la même roue : les rapports doivent être compatibles.
          if (Math.abs(sb.ratio - ratio) > 1e-9 * (Math.abs(ratio) + 1e-12)) jams.push({ type: 'cycle', a: aId, b: b.id });
          continue;
        }
        Object.assign(sb, { ratio, torque, phase, stage, connected: true });
        queue.push(b.id);
      }
    }
  }

  // Vitesse de la source.
  let omega0 = 0, beat = null, status = 'idle', escapement = null;
  if (source && source.regulated !== false) {
    omega0 = source.omega0;
    status = 'ok';
  } else if (source) {
    const beatHz = opts.beat ?? 2, cmin = opts.cmin ?? 0;
    const active = escs.filter((e) => engaged.has(e.id) && states.get(engaged.get(e.id).id).connected);
    if (!active.length) { omega0 = RUNAWAY; status = 'runaway'; }
    else {
      const e = active[0], w = engaged.get(e.id), sw = states.get(w.id);
      omega0 = (beatHz / w.z) / sw.ratio;
      escapement = { id: e.id, wheelId: w.id, torque: sw.torque, cmin };
      for (const f of active.slice(1)) {
        const w2 = engaged.get(f.id), o2 = (beatHz / w2.z) / states.get(w2.id).ratio;
        if (Math.abs(o2 - omega0) > 1e-9 * Math.abs(omega0)) jams.push({ type: 'escapements', a: e.id, b: f.id });
      }
      if (sw.torque < cmin) status = 'weak';
      else { status = 'ok'; beat = beatHz; }
    }
    if ((status === 'ok' || status === 'runaway') && source.capacity !== undefined && (source.wound ?? source.capacity) <= 0) status = 'empty';
  }

  const jammed = jams.length > 0;
  const running = !jammed && (status === 'ok' || status === 'runaway');
  for (const [, s] of states) s.omega = running && s.connected ? s.ratio * omega0 : 0;
  // Réserve : ce qu'il reste maintenant, et ce que tiendrait le ressort remonté à bloc.
  const finite = source && source.capacity !== undefined && (running || status === 'empty') && omega0;
  const autonomy = finite ? (source.wound ?? source.capacity) / Math.abs(omega0) : Infinity;
  const autonomyFull = finite ? source.capacity / Math.abs(omega0) : Infinity;

  return { states, edges, jams, jammed, omega0: running ? omega0 : 0, beat: running ? beat : null, status, escapement, autonomy, autonomyFull, running };
}

/**
 * Phase de b pour qu'une dent de a tombe dans un creux de b sur la ligne des centres.
 * Invariant : u_a + u_b ≡ ½ (mod 1), où u est la « phase de dent » vue depuis la ligne des centres.
 */
export function meshPhase(a, phaseA, b) {
  const alpha = Math.atan2(b.y - a.y, b.x - a.x);
  const beta = alpha + Math.PI;
  const uA = mod1(((alpha - phaseA) * a.z) / TAU);
  return beta - (TAU / b.z) * (0.5 - uA);
}

function mod1(v) { return v - Math.floor(v); }

/** Phase équivalente à `target` (modulo un pas de dent 2π/z) la plus proche de `current`. */
export function nearestEquivalent(target, current, z) {
  const pitch = TAU / z;
  return target + Math.round((current - target) / pitch) * pitch;
}

/** Applique une solution au modèle : les pièces repartent de leur angle courant, sans saut. */
export function applySolution(parts, result, now) {
  for (const p of parts) {
    const s = result.states.get(p.id);
    p.phase = normalizeAngle(s.phase);
    p.omega = s.omega;
    p.torque = s.torque;
    p.stage = s.stage;
    p.connected = s.connected;
    p.colliding = s.colliding;
    p.tRef = now;
  }
}

/** Fait tourner la réserve du ressort : ce qui s'est déroulé depuis la dernière mise à jour. */
export function drainReserve(source, now) {
  if (!source || source.capacity === undefined) return;
  const elapsed = Math.max(0, now - (source.woundAt ?? now));
  source.wound = Math.max(0, (source.wound ?? source.capacity) - Math.abs(source.omega || 0) * elapsed);
  source.woundAt = now;
}

export function normalizeAngle(a) {
  a = a % TAU;
  return a < 0 ? a + TAU : a;
}

/** Période d'une pièce (s) : durée d'un tour. Infinity si immobile. */
export function periodOf(omega) {
  return omega ? 1 / Math.abs(omega) : Infinity;
}

/** Rendement global entre la source et une pièce : puissance transmise / puissance fournie. */
export function efficiency(source, part, omega0) {
  if (!source || !part || !omega0 || !part.connected) return 0;
  return (part.torque * Math.abs(part.omega)) / (source.torque0 * Math.abs(omega0));
}
