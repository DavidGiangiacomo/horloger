// Le mécanisme est un graphe résolu par parcours depuis la source : vitesse multipliée par
// z_entrée/z_sortie, couple par l'inverse × η. Résolution événementielle : on recalcule à chaque
// pose ou retrait, jamais par image.

import { meshes, coaxial, collides } from './geometry.js';

export const ETA = 0.97;           // rendement d'un étage (frottement, incompressible)
const TAU = 2 * Math.PI;

/** Angle courant d'une pièce (rad), calculé depuis l'horloge, jamais intégré image par image. */
export function currentAngle(part, now) {
  return part.phase + TAU * part.omega * (now - part.tRef);
}

/**
 * Résout le mécanisme.
 * @param parts pièces {id, z, x, y, layer, isSource?, omega0?, torque0?, phase, omega, tRef}
 * @param now   horloge (secondes)
 * @returns {states: Map<id, {omega, torque, phase, stage, connected, colliding}>, edges, jams, jammed}
 */
export function solve(parts, now, opts = {}) {
  const eta = opts.eta ?? ETA;
  const states = new Map();
  for (const p of parts) {
    states.set(p.id, { omega: 0, torque: 0, phase: currentAngle(p, now), stage: 0, connected: false, colliding: false });
  }

  const edges = [];
  const jams = [];
  const adj = new Map(parts.map((p) => [p.id, []]));
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], b = parts[j];
      let type = null;
      if (coaxial(a, b)) type = a.layer === b.layer ? 'collision' : 'axle';
      else if (meshes(a, b)) type = 'mesh';
      else if (collides(a, b)) type = 'collision';
      if (!type) continue;
      if (type === 'collision') {
        jams.push({ type: 'collision', a: a.id, b: b.id });
        states.get(a.id).colliding = true;
        states.get(b.id).colliding = true;
        continue;
      }
      edges.push({ a: a.id, b: b.id, type });
      adj.get(a.id).push({ to: b, type });
      adj.get(b.id).push({ to: a, type });
    }
  }

  const byId = new Map(parts.map((p) => [p.id, p]));
  const source = parts.find((p) => p.isSource);
  if (source) {
    const s0 = states.get(source.id);
    s0.omega = source.omega0;
    s0.torque = source.torque0;
    s0.connected = true;
    const queue = [source.id];
    while (queue.length) {
      const aId = queue.shift();
      const a = byId.get(aId), sa = states.get(aId);
      for (const { to: b, type } of adj.get(aId)) {
        const sb = states.get(b.id);
        let omega, torque, phase, stage;
        if (type === 'axle') {
          omega = sa.omega; torque = sa.torque; phase = sb.phase; stage = sa.stage;
        } else {
          omega = -sa.omega * (a.z / b.z);
          torque = sa.torque * (b.z / a.z) * eta;
          // Parmi les phases équivalentes (à une dent près), on garde la plus proche de l'angle
          // courant : la roue ne saute pas à l'écran quand on recalcule.
          phase = nearestEquivalent(meshPhase(a, sa.phase, b), sb.phase, b.z);
          stage = sa.stage + 1;
        }
        if (sb.connected) {
          // Deuxième chemin vers la même roue : les rapports doivent être compatibles.
          if (Math.abs(sb.omega - omega) > 1e-9 * (Math.abs(omega) + 1e-12)) {
            jams.push({ type: 'cycle', a: aId, b: b.id });
          }
          continue;
        }
        Object.assign(sb, { omega, torque, phase, stage, connected: true });
        queue.push(b.id);
      }
    }
  }

  const jammed = jams.length > 0;
  if (jammed) {
    for (const [, s] of states) { s.omega = 0; }
  }
  return { states, edges, jams, jammed };
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

export function normalizeAngle(a) {
  a = a % TAU;
  return a < 0 ? a + TAU : a;
}

/** Période d'une pièce (s) : durée d'un tour. Infinity si immobile. */
export function periodOf(omega) {
  return omega ? 1 / Math.abs(omega) : Infinity;
}
