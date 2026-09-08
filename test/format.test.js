import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPeriod, formatTorque, formatSpeed, UNITS } from '../src/format.js';

const { MIN, HOUR, DAY, MONTH, YEAR } = UNITS;

test('la période s’écrit en unités humaines', () => {
  assert.equal(formatPeriod(0), 'à l’arrêt');
  assert.equal(formatPeriod(Infinity), 'à l’arrêt');
  assert.equal(formatPeriod(1), 'une seconde');
  assert.equal(formatPeriod(1.5), '1,5 s');
  assert.equal(formatPeriod(11.25), '11,25 s');
  assert.equal(formatPeriod(MIN), 'une minute');
  assert.equal(formatPeriod(20 * MIN), '20 min');
  assert.equal(formatPeriod(20 * MIN + 30), '20 min 30 s');
  assert.equal(formatPeriod(HOUR), 'une heure');
  assert.equal(formatPeriod(12 * HOUR + 25 * MIN), '12 h 25 min');
  assert.equal(formatPeriod(DAY), 'un jour');
  assert.equal(formatPeriod(8 * DAY + 3 * HOUR), '8 jours 3 h');
  assert.equal(formatPeriod(1 * DAY + 3 * HOUR), '1 jour 3 h');
  assert.equal(formatPeriod(3 * MONTH), '3 mois');
  assert.equal(formatPeriod(YEAR), 'un an');
  assert.equal(formatPeriod(4 * YEAR + 2 * MONTH), '4 ans 2 mois');
  assert.equal(formatPeriod(100 * YEAR), 'un siècle');
  assert.equal(formatPeriod(400 * YEAR), '400 ans');
  assert.equal(formatPeriod(1000 * YEAR), 'un millénaire');
  assert.equal(formatPeriod(26000 * YEAR), '26\u00a0000 ans');
  assert.equal(formatPeriod(2.6e6 * YEAR), '2,6 millions d’années');
});

test('le couple s’écrit en unités physiques, jamais en notation scientifique', () => {
  assert.equal(formatTorque(1), '1,00 N·m');
  assert.equal(formatTorque(1.455), '1,46 N·m');
  assert.equal(formatTorque(0.23), '230 mN·m');
  assert.equal(formatTorque(0.0123), '12,3 mN·m');
  assert.equal(formatTorque(4.5e-5), '45,0 µN·m');
  assert.equal(formatTorque(0), '—');
});

test('vitesse lisible', () => {
  assert.equal(formatSpeed(0), 'immobile');
  assert.equal(formatSpeed(1), '1 tour/s');
  assert.equal(formatSpeed(-2.5), '2,5 tours/s');
  assert.equal(formatSpeed(1 / 20), '3 tours/min');
  assert.equal(formatSpeed(1 / (4 * HOUR)), 'un tour en 4 h');
});
