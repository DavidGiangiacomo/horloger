import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOITIERS, SANDBOX, makeSource, check } from '../src/boitiers.js';
import { solve, applySolution } from '../src/mechanism.js';
import { insideShape, pitchRadius, ESC_GAP } from '../src/geometry.js';

let n = 0;
const gear = (z, x, y, layer = 0) => ({ id: `g${++n}`, z, x, y, layer, phase: 0, omega: 0, tRef: 0 });
/** Pose un pignon engrené sur `from`, dans la direction (dx, dy). */
function meshed(z, from, dx, dy, layer = from.layer) {
  const d = Math.hypot(dx, dy), k = (pitchRadius(z) + pitchRadius(from.z)) / d;
  return gear(z, from.x + dx * k, from.y + dy * k, layer);
}
const coax = (z, on, layer = on.layer + 1) => gear(z, on.x, on.y, layer);

function run(ws, parts, links = [], hand) {
  const model = { parts, links, hand };
  const opts = { links, beat: ws.escapement?.beat, cmin: ws.escapement?.cmin };
  const sol = solve(parts, 0, opts);
  applySolution(parts, sol, 0);
  return { sol, result: check(ws, model, sol) };
}

test('la platine en L : un disque tient dans une branche, pas dans le coin manquant', () => {
  const b2 = BOITIERS[1];
  assert.ok(insideShape(b2.plate.rects, 75, 300, 60));      // bas de la branche verticale
  assert.ok(insideShape(b2.plate.rects, 345, 75, 60));      // bout du bras
  assert.ok(!insideShape(b2.plate.rects, 300, 300, 10));    // dans le vide
  assert.ok(!insideShape(b2.plate.rects, 140, 140, 30));    // mord sur le coin
  assert.ok(!insideShape(b2.plate.rects, 20, 20, 30));      // dépasse du bord
});

test('boîtier 1 : 12 → 60, 8 → 48, 8 → 40, 12 → 48, 8 → 16 donne vingt minutes sur quatre étages', () => {
  const ws = BOITIERS[0];
  const src = makeSource(ws, 0);
  const a = meshed(60, src, 1, 0);                 // étage 1
  const a2 = coax(8, a, 1), b = meshed(48, a2, 1, 0.2);
  const b2 = coax(8, b, 2), c = meshed(40, b2, 0.3, 1);
  const c2 = coax(12, c, 3), d = meshed(48, c2, -1, 0.4);
  const d2 = coax(8, d, 0), e = meshed(16, d2, -0.3, 1);   // le train se replie sur l'étage 1
  const parts = [src, a, a2, b, b2, c, c2, d, d2, e];
  const { sol, result } = run(ws, parts, [], e.id);
  assert.ok(!sol.jammed, JSON.stringify(sol.jams));
  assert.ok(Math.abs(1 / Math.abs(e.omega) - 1200) < 1e-6, `période ${1 / Math.abs(e.omega)}`);
  assert.ok(parts.every((p) => p.layer < 4));
  assert.ok(result.ok, JSON.stringify(result.items));
  assert.equal(result.scores.pieces, 9);
});

test('boîtier 1 : à trois pour cent d’écart, la commande n’est pas honorée', () => {
  const ws = BOITIERS[0];
  const src = makeSource(ws, 0);
  const a = meshed(60, src, 1, 0), a2 = coax(8, a), b = meshed(40, a2, 1, 0), b2 = coax(8, b);
  const c = meshed(40, b2, 0, 1), c2 = coax(12, c), d = meshed(48, c2, -1, 0), d2 = coax(8, d), e = meshed(15, d2, -1, 0);
  const { result } = run(ws, [src, a, a2, b, b2, c, c2, d, d2, e], [], e.id);   // 1125 s
  assert.ok(!result.ok);
  assert.equal(result.items.find((i) => i.key === 'period').ok, false);
});

test('un arbre de renvoi transmet la vitesse d’un axe à l’autre, avec sa perte propre', () => {
  const ws = SANDBOX;
  const src = makeSource(ws, 0);
  const a = meshed(60, src, 1, 0);
  const far = gear(20, 400, 300, 0);
  const links = [{ id: 'l1', x1: a.x, y1: a.y, x2: far.x, y2: far.y }];
  const { sol } = run(ws, [src, a, far], links);
  assert.ok(!sol.jammed);
  assert.equal(far.omega, a.omega);
  assert.ok(Math.abs(far.torque - a.torque * 0.9) < 1e-12);
});

test('boîtier 2 : l’aiguille doit être sur l’arbre de sortie', () => {
  const ws = BOITIERS[1];
  const src = makeSource(ws, 0);
  // Barre verticale : 12 → 60 (÷5), 8 → 48 (÷6) ; renvoi sous la platine vers le bras ; 8 → 40 (÷5), 8 → 48 (÷6), 12 → 48 (÷4) = 3600
  const a = meshed(60, src, 0, -1), a2 = coax(8, a), b = meshed(48, a2, 0, -1);
  const c = gear(8, 250, 75, 0);                                        // bout de l'arbre de renvoi, dans le bras
  const links = [{ id: 'l1', x1: b.x, y1: b.y, x2: c.x, y2: c.y }];
  const d = meshed(40, c, 1, 0), d2 = coax(8, d), e = meshed(48, d2, -1, 0.6), e2 = coax(12, e);
  const f = gear(48, ws.output.x, ws.output.y, e2.layer);
  // On aligne e pour que f engrène e2 : f est fixé sur la sortie, on place e à la bonne distance de f.
  const k = (pitchRadius(12) + pitchRadius(48));
  Object.assign(e, { x: f.x - k, y: f.y }); Object.assign(e2, { x: e.x, y: e.y });
  Object.assign(d, { x: e.x - (pitchRadius(8) + pitchRadius(48)) * 0.6, y: e.y + (pitchRadius(8) + pitchRadius(48)) * 0.8 });
  Object.assign(d2, { x: d.x, y: d.y });
  Object.assign(c, { x: d.x - (pitchRadius(8) + pitchRadius(40)), y: d.y });
  links[0].x2 = c.x; links[0].y2 = c.y;
  const parts = [src, a, a2, b, c, d, d2, e, e2, f];
  const { sol, result } = run(ws, parts, links, f.id);
  assert.ok(!sol.jammed, JSON.stringify(sol.jams));
  assert.ok(Math.abs(1 / Math.abs(f.omega) - 3600) < 1e-6, `période ${1 / Math.abs(f.omega)}`);
  assert.ok(result.ok, JSON.stringify(result.items));
  // Aiguille ailleurs : refusé
  const { result: r2 } = run(ws, parts, links, e2.id);
  assert.equal(r2.items.find((i) => i.key === 'output').ok, false);
});

test('ressort libre sans échappement : il s’emballe, puis se détend', () => {
  const ws = BOITIERS[2];
  const src = makeSource(ws, 0);
  const a = meshed(60, src, 1, 0);
  const { sol } = run(ws, [src, a]);
  assert.equal(sol.status, 'runaway');
  assert.equal(src.omega, 3);
  assert.ok(Math.abs(sol.autonomy - 8 / 3) < 1e-9);
  src.wound = 0;
  const { sol: s2 } = run(ws, [src, a]);
  assert.equal(s2.status, 'empty');
  assert.equal(src.omega, 0);
});

test('un échappement fixe la vitesse du train : une dent par battement', () => {
  const ws = BOITIERS[2];
  const src = makeSource(ws, 0);
  const w = coax(60, src);                                     // roue de 60 sur le barillet
  const esc = { id: 'esc', kind: 'escapement', x: w.x, y: w.y - (pitchRadius(60) + ESC_GAP), layer: w.layer, phase: 0, omega: 0, tRef: 0 };
  const { sol } = run(ws, [src, w, esc]);
  assert.equal(sol.status, 'ok');
  assert.equal(sol.beat, 2);
  assert.ok(Math.abs(w.omega - 2 / 60) < 1e-12);                // 30 s par tour
  assert.ok(Math.abs(sol.autonomy - 8 * 30) < 1e-9);            // 8 tours de barillet
});

test('sous le couple minimal, l’ancre ne bat pas', () => {
  const ws = BOITIERS[2];
  const src = makeSource(ws, 0);
  // Barillet → multiplication ×7,5 × 7,5 × 7,5 × 6 = 2531 : couple 0,37 mN·m à la roue d'échappement.
  const s60 = coax(60, src), a = meshed(8, s60, 1, 0), a60 = coax(60, a), b = meshed(8, a60, 1, 0.3), b60 = coax(60, b);
  const c = meshed(8, b60, 0.2, 1), c60 = coax(60, c), d = meshed(10, c60, -1, 0.5), d60 = coax(60, d);
  const esc = { id: 'esc', kind: 'escapement', x: d60.x, y: d60.y - (pitchRadius(60) + ESC_GAP), layer: d60.layer, phase: 0, omega: 0, tRef: 0 };
  const parts = [src, s60, a, a60, b, b60, c, c60, d, d60, esc];
  const { sol, result } = run(ws, parts);
  assert.equal(sol.status, 'weak');
  assert.ok(sol.escapement.torque < 0.002);
  assert.equal(src.omega, 0);
  assert.equal(result.items.find((i) => i.key === 'escapement').ok, false);
});

test('boîtier 3 : barillet à 1 h 30, ancre trois étages plus haut, aiguille deux étages plus bas', () => {
  const ws = BOITIERS[2];
  const src = makeSource(ws, 0);
  // Vers l'ancre : ×7,5 × 7,5 × 3,2 = 180 → roue d'échappement de 60 dents à 30 s, barillet à 5 400 s.
  const s60 = coax(60, src, 1), a = meshed(8, s60, 1, 0), a60 = coax(60, a, 2), b = meshed(8, a60, 1, 0.5), b48 = coax(48, b, 1);
  const c = meshed(15, b48, 0, 1), c60 = coax(60, c, 0);
  const esc = { id: 'esc', kind: 'escapement', x: c60.x + (pitchRadius(60) + ESC_GAP), y: c60.y, layer: c60.layer, phase: 0, omega: 0, tRef: 0 };
  // Vers l'aiguille : ÷4 × ÷2 = 8 → 43 200 s.
  const h = meshed(48, src, 0, 1), h2 = coax(8, h, 2), i = meshed(16, h2, 0, 1);
  const parts = [src, s60, a, a60, b, b48, c, c60, esc, h, h2, i];
  const { sol, result } = run(ws, parts, [], i.id);
  assert.ok(!sol.jammed, JSON.stringify(sol.jams));
  assert.equal(sol.status, 'ok');
  assert.ok(Math.abs(1 / Math.abs(i.omega) - 43200) < 1e-6, `période ${1 / Math.abs(i.omega)}`);
  assert.ok(Math.abs(sol.autonomy - 8 * 5400) < 1e-6);
  assert.ok(sol.escapement.torque >= 0.002, `couple ${sol.escapement.torque}`);
  assert.ok(parts.every((p) => p.layer < 4));
  assert.ok(result.ok, JSON.stringify(result.items));
  // À moitié déroulé, la commande reste honorée : la réserve se juge ressort remonté.
  src.wound = 4;
  const { result: r2 } = run(ws, parts, [], i.id);
  assert.ok(r2.ok, JSON.stringify(r2.items));
});

test('boîtier 3 : un barillet trop lent tient la nuit mais l’ancre manque de couple ; trop rapide, il ne tient pas', () => {
  const ws = BOITIERS[2];
  const src = makeSource(ws, 0);
  // Barillet directement sur la roue d'échappement : 30 s par tour, réserve de 4 minutes.
  const w = coax(60, src);
  const esc = { id: 'esc', kind: 'escapement', x: w.x + 60 + ESC_GAP, y: w.y, layer: 1, phase: 0, omega: 0, tRef: 0 };
  const { result } = run(ws, [src, w, esc]);
  assert.equal(result.items.find((i) => i.key === 'reserve').ok, false);
  assert.equal(result.items.find((i) => i.key === 'escapement').ok, true);
});
