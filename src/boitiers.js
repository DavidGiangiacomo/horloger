// Les boîtiers : une commande écrite à la main, une platine aux dimensions imposées, une période.
// Le texte reste factuel : dimensions, tolérance, période attendue.

import { periodOf, escapementWheel, isGear } from './mechanism.js';
import { dist, AXLE_TOLERANCE } from './geometry.js';

const HOUR = 3600;

const rect = (w, h) => ({ w, h, rects: [{ x: 0, y: 0, w, h }], outline: [[0, 0], [w, 0], [w, h], [0, h]] });

export const ALL_GEARS = [8, 10, 12, 15, 16, 20, 24, 30, 36, 40, 48, 60];

export const BOITIERS = [
  {
    id: 'b1', n: 1, title: 'Minuterie de cuisson',
    target: 20 * 60, tolerance: 0.02,
    plate: rect(360, 260),
    source: { z: 12, x: 50, y: 130, regulated: true, omega0: 1, torque0: 1, fixed: true },
    output: null,
    inventory: { gears: [8, 10, 12, 16, 20, 24, 30, 40, 48, 60], shaft: false, escapement: false },
    fiche: 'Une minuterie pour le four du fournil d’en face. Un tour d’aiguille en vingt minutes, à deux pour cent près. '
      + 'Platine de 360 sur 260. Le moteur d’essai est fourni, régulé : un tour par seconde sur un pignon de douze dents.',
  },
  {
    id: 'b2', n: 2, title: 'Compteur d’eau',
    target: HOUR, tolerance: 0.01,
    plate: { w: 420, h: 380, rects: [{ x: 0, y: 0, w: 420, h: 150 }, { x: 0, y: 0, w: 150, h: 380 }],
      outline: [[0, 0], [420, 0], [420, 150], [150, 150], [150, 380], [0, 380]] },
    source: { z: 12, x: 75, y: 305, regulated: true, omega0: 1, torque0: 1, fixed: true },
    output: { x: 345, y: 75 },
    inventory: { gears: ALL_GEARS, shaft: true, escapement: false },
    fiche: 'Compteur pour la borne-fontaine de la place. L’entraînement arrive par le bas du boîtier, le cadran est au bout du bras : '
      + 'l’aiguille doit être sur l’arbre de sortie marqué. Un tour par heure, à un pour cent près. Le boîtier est en L, on n’y peut rien. '
      + 'Des arbres de renvoi sont fournis pour passer sous la platine.',
  },
  {
    id: 'b3', n: 3, title: 'Réveil d’atelier',
    target: 12 * HOUR, tolerance: 0.005,
    plate: rect(460, 330),
    source: { z: 12, x: 90, y: 165, regulated: false, torque0: 1, capacity: 8, fixed: true },
    escapement: { beat: 2, cmin: 0.002 },
    reserve: 12 * HOUR,
    output: null,
    inventory: { gears: ALL_GEARS, shaft: true, escapement: true },
    fiche: 'Un réveil pour l’atelier, à remonter le soir. Un tour en douze heures, à un demi pour cent près, et il doit tenir la nuit : '
      + 'douze heures de réserve au moins. Le barillet fourni donne 1,00 N·m sur huit tours. L’ancre fournie bat deux fois par seconde '
      + 'et refuse de battre sous 2 mN·m.',
  },
];

/** L'établi libre du MVP : pas de commande, une grande platine, un moteur régulé qu'on peut déplacer. */
export const SANDBOX = {
  id: 'libre', n: 0, title: 'Établi libre',
  target: null, tolerance: 0,
  plate: rect(600, 400),
  source: { z: 40, x: 100, y: 200, regulated: true, omega0: 1, torque0: 1, fixed: false },
  output: null,
  inventory: { gears: ALL_GEARS, shaft: true, escapement: false },
  fiche: 'Établi libre. Le barillet fait un tour par seconde et fournit 1,00 N·m. Le reste vous appartient.',
};

export const WORKSHOPS = [...BOITIERS, SANDBOX];
export const byId = (id) => WORKSHOPS.find((w) => w.id === id);

/** Crée la source d'un atelier. */
export function makeSource(ws, now) {
  const s = ws.source;
  const part = { id: 'source', z: s.z, x: s.x, y: s.y, layer: 0, isSource: true, fixed: s.fixed,
    regulated: s.regulated, torque0: s.torque0, phase: 0, omega: 0, tRef: now };
  if (s.regulated) part.omega0 = s.omega0;
  else { part.capacity = s.capacity; part.wound = s.capacity; part.woundAt = now; }
  return part;
}

/**
 * La commande est-elle honorée ? Retourne la liste des exigences avec leur état, et les scores.
 * @param ws        l'atelier (boîtier)
 * @param model     { parts, links, hand }
 * @param solution  résultat de solve()
 */
export function check(ws, model, solution) {
  const items = [];
  if (!ws.target) return { ok: false, items, scores: scores(ws, model) };
  const hand = model.parts.find((p) => p.id === model.hand) || null;
  const running = solution.running && !solution.jammed;
  const period = hand && running && hand.connected ? periodOf(hand.omega) : Infinity;
  const deviation = Number.isFinite(period) ? Math.abs(period - ws.target) / ws.target : Infinity;

  items.push({ key: 'period', ok: deviation <= ws.tolerance, deviation, period });
  if (ws.output) {
    items.push({ key: 'output', ok: !!hand && dist(hand, ws.output) <= AXLE_TOLERANCE });
  }
  if (ws.escapement) {
    const esc = solution.escapement;
    items.push({ key: 'escapement', ok: !!esc && solution.status === 'ok', status: solution.status, torque: esc?.torque ?? 0 });
    // La réserve se juge ressort remonté à bloc : c'est une propriété du mécanisme, pas de l'heure qu'il est.
    items.push({ key: 'reserve', ok: solution.autonomyFull >= ws.reserve * (1 - 1e-9) && !solution.jammed && solution.status !== 'runaway', autonomy: solution.autonomyFull });
  }
  items.push({ key: 'sound', ok: !solution.jammed });
  return { ok: items.every((i) => i.ok), items, scores: { ...scores(ws, model), deviation } };
}

/** Scores facultatifs d'un boîtier : pièces, place, écart. */
export function scores(ws, model) {
  const pieces = model.parts.filter((p) => !p.isSource).length + (model.links?.length ?? 0);
  const total = ws.plate.rects.reduce((s, r) => s + r.w * r.h, 0);
  return { pieces, area: footprint(model.parts) / total };
}

/** Surface projetée : sur un même axe, la plus grande roue compte. */
export function footprint(parts) {
  const axles = [];
  for (const p of parts) {
    const r = isGear(p) ? p.z + 2 : 11;
    let ax = axles.find((a) => dist(a, p) <= AXLE_TOLERANCE);
    if (!ax) { ax = { x: p.x, y: p.y, r: 0 }; axles.push(ax); }
    ax.r = Math.max(ax.r, r);
  }
  return axles.reduce((s, a) => s + Math.PI * a.r * a.r, 0);
}

export { escapementWheel };
