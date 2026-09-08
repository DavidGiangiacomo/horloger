import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pitchRadius, meshes, collides, coaxial, circleIntersections, gearPath, MODULE } from '../src/geometry.js';

test('rayon primitif r = m·z/2', () => {
  assert.equal(pitchRadius(8), 8);
  assert.equal(pitchRadius(60), 60);
  assert.equal(pitchRadius(10, 1), 5);
});

test('deux pignons engrènent à la distance r_A + r_B, sur le même étage seulement', () => {
  const a = { x: 0, y: 0, z: 10, layer: 0 };
  const b = { x: 40, y: 0, z: 30, layer: 0 };
  assert.ok(meshes(a, b));
  assert.ok(meshes(a, { ...b, x: 40.4 }));
  assert.ok(!meshes(a, { ...b, x: 41 }));
  assert.ok(!meshes(a, { ...b, layer: 1 }));
});

test('les dentures qui se chevauchent sans engrener grippent', () => {
  const a = { x: 0, y: 0, z: 10, layer: 0 };
  assert.ok(collides(a, { x: 30, y: 0, z: 30, layer: 0 }));   // trop près
  assert.ok(collides(a, { x: 43, y: 0, z: 30, layer: 0 }));   // pointes de dents qui se touchent
  assert.ok(!collides(a, { x: 40, y: 0, z: 30, layer: 0 }));  // engrènement correct
  assert.ok(!collides(a, { x: 45, y: 0, z: 30, layer: 0 }));  // libre
  assert.ok(!collides(a, { x: 30, y: 0, z: 30, layer: 1 }));  // étages différents
  assert.ok(collides(a, { x: 0, y: 0, z: 30, layer: 0 }));    // même axe, même étage
});

test('même centre = même axe', () => {
  assert.ok(coaxial({ x: 1, y: 1 }, { x: 1.2, y: 1 }));
  assert.ok(!coaxial({ x: 1, y: 1 }, { x: 3, y: 1 }));
});

test('intersections de cercles', () => {
  const pts = circleIntersections({ x: 0, y: 0 }, 5, { x: 8, y: 0 }, 5);
  assert.equal(pts.length, 2);
  for (const p of pts) {
    assert.ok(Math.abs(Math.hypot(p.x, p.y) - 5) < 1e-9);
    assert.ok(Math.abs(Math.hypot(p.x - 8, p.y) - 5) < 1e-9);
  }
  assert.equal(circleIntersections({ x: 0, y: 0 }, 5, { x: 20, y: 0 }, 5).length, 0);
});

test('le profil de denture est généré et mis en cache, une fonction pour tous les z', () => {
  const p8 = gearPath(8), p60 = gearPath(60);
  assert.ok(p8.startsWith('M'));
  assert.ok(p8.endsWith('Z'));
  assert.equal(gearPath(8), p8);
  assert.ok(p60.length > p8.length);
  // 8 dents : 8 arcs de fond de dent ; 60 dents : 60 arcs + ajours
  assert.equal((p8.match(/ A/g) || []).length, 8);
  assert.ok((p60.match(/ A/g) || []).length >= 60);
  assert.equal(MODULE, 2);
});
