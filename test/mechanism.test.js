import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, applySolution, currentAngle, meshPhase, periodOf, ETA } from '../src/mechanism.js';

const TAU = 2 * Math.PI;
function part(id, z, x, y, layer = 0, extra = {}) {
  return { id, z, x, y, layer, phase: 0, omega: 0, tRef: 0, ...extra };
}
const source = (z = 40, x = 0, y = 0) => part('src', z, x, y, 0, { isSource: true, omega0: 1, torque0: 1 });

test('un pignon engrené tourne en sens inverse, au rapport z_entrée/z_sortie, couple × inverse × η', () => {
  const parts = [source(40), part('b', 60, 100, 0)];
  const r = solve(parts, 0);
  assert.ok(!r.jammed);
  const sb = r.states.get('b');
  assert.ok(Math.abs(sb.omega - (-40 / 60)) < 1e-12);
  assert.ok(Math.abs(sb.torque - (60 / 40) * ETA) < 1e-12);
  assert.equal(sb.stage, 1);
  assert.equal(periodOf(sb.omega), 1.5);
});

test('des pignons coaxiaux partagent la vitesse ; un train composé multiplie les rapports', () => {
  // source 40 → roue 60 (axe B) ; pignon 8 sur l'axe B (étage 1) → roue 60 (axe C, étage 1)
  const parts = [source(40), part('b60', 60, 100, 0), part('b8', 8, 100, 0, 1), part('c60', 60, 168, 0, 1)];
  const r = solve(parts, 0);
  assert.ok(!r.jammed);
  assert.ok(Math.abs(r.states.get('b8').omega - r.states.get('b60').omega) < 1e-12);
  const wc = r.states.get('c60').omega;
  assert.ok(Math.abs(wc - (40 / 60) * (8 / 60)) < 1e-12); // deux inversions = sens direct
  assert.ok(Math.abs(r.states.get('c60').torque - (60 / 40) * (60 / 8) * ETA * ETA) < 1e-12);
  assert.equal(r.states.get('c60').stage, 2);
  assert.ok(Math.abs(periodOf(wc) - 11.25) < 1e-9);
});

test('une pièce non reliée ne tourne pas', () => {
  const r = solve([source(), part('loin', 20, 300, 300)], 0);
  const s = r.states.get('loin');
  assert.equal(s.connected, false);
  assert.equal(s.omega, 0);
  assert.equal(periodOf(0), Infinity);
});

test('une collision bloque tout le mécanisme', () => {
  const parts = [source(40), part('b', 60, 100, 0), part('c', 30, 120, 0)];
  const r = solve(parts, 0);
  assert.ok(r.jammed);
  assert.equal(r.jams[0].type, 'collision');
  for (const [, s] of r.states) assert.equal(s.omega, 0);
  assert.ok(r.states.get('b').colliding && r.states.get('c').colliding);
});

test('deux chemins incompatibles vers la même roue : mécanisme bloqué', () => {
  // axe B : roue 60 (étage 0) + pignon 8 (étage 1). Axe C à 68 mm : roue 60 sur l'étage 1
  // (entraînée par le pignon 8) ET roue 60 sur l'étage 0, qui engrène aussi la roue 60 de B
  // (68 = 60 + 8 ? non : 60 + 60 = 120). On construit plutôt un vrai cycle :
  // B: 60@0 ; C (à 68 mm de B) : 8@0 engrène B60, et 60@1 ; B: 8@1 engrène C60 → rapports contradictoires.
  const parts = [source(40), part('b60', 60, 100, 0), part('b8', 8, 100, 0, 1), part('c8', 8, 168, 0, 0), part('c60', 60, 168, 0, 1)];
  const r = solve(parts, 0);
  assert.ok(r.jammed);
  assert.ok(r.jams.some((j) => j.type === 'cycle'));
});

test('une même roue peut servir à deux trains si les rapports sont compatibles', () => {
  // source 40 engrène deux roues 60 ; un pignon 8 sur chaque axe (étage 1) — aucun cycle contradictoire.
  const parts = [source(40), part('b', 60, 100, 0), part('c', 60, -100, 0)];
  const r = solve(parts, 0);
  assert.ok(!r.jammed);
  assert.equal(r.states.get('b').omega, r.states.get('c').omega);
});

test('la phase d’engrènement place une dent de A dans un creux de B', () => {
  const a = { x: 0, y: 0, z: 10 }, b = { x: 40, y: 0, z: 30 };
  const phaseB = meshPhase(a, 0, b);
  // b a une dent tous les 2π/30 rad à partir de phaseB ; un creux doit être centré sur π (face à A).
  const teeth = [];
  for (let k = 0; k < 30; k++) teeth.push(((phaseB + (k * TAU) / 30) % TAU + TAU) % TAU);
  const nearest = Math.min(...teeth.map((t) => Math.abs(t - Math.PI)));
  assert.ok(Math.abs(nearest - Math.PI / 30) < 1e-9, `écart au creux : ${nearest}`);
});

test('l’angle courant se calcule depuis l’horloge, sans saut lors d’un recalcul', () => {
  const parts = [source(40), part('b', 60, 100, 0)];
  applySolution(parts, solve(parts, 0), 0);
  const angleBefore = currentAngle(parts[1], 10);
  applySolution(parts, solve(parts, 10), 10);   // recalcul dix secondes plus tard
  const angleAfter = currentAngle(parts[1], 10);
  const diff = ((angleAfter - angleBefore) % TAU + TAU) % TAU;
  assert.ok(diff < 1e-9 || Math.abs(diff - TAU) < 1e-9);
  assert.ok(Math.abs(currentAngle(parts[0], 11) - (parts[0].phase + TAU)) < 1e-9);
});
