// Le jeu n'écrit jamais 3,15·10⁷ s mais « un an ». Unités humaines, virgule française.

const MIN = 60, HOUR = 3600, DAY = 86400;
const MONTH = 30.436875 * DAY;
const YEAR = 365.2425 * DAY;

export const UNITS = { MIN, HOUR, DAY, MONTH, YEAR };

const NBSP = '\u00a0';
/** Format français ; les séparateurs de milliers deviennent des espaces insécables classiques. */
function nf(v, digits, minDigits = 0) {
  return v
    .toLocaleString('fr-FR', { minimumFractionDigits: minDigits, maximumFractionDigits: digits })
    .replace(/[\u202f\u00a0 ]/g, NBSP);
}
function near(v, ref) { return Math.abs(v - ref) <= 1e-6 * ref; }
function plural(n, one, many) { return n === 1 ? one : many; }

function twoParts(s, bigUnit, bigLabel, smallUnit, smallLabel) {
  let big = Math.floor(s / bigUnit);
  let small = Math.round((s - big * bigUnit) / smallUnit);
  if (small * smallUnit >= bigUnit - 1e-9) { big += 1; small = 0; }
  const bigTxt = `${nf(big, 0)} ${typeof bigLabel === 'function' ? bigLabel(big) : bigLabel}`;
  if (!small) return bigTxt;
  return `${bigTxt} ${nf(small, 0)} ${typeof smallLabel === 'function' ? smallLabel(small) : smallLabel}`;
}

const jours = (n) => plural(n, 'jour', 'jours');
const ans = (n) => plural(n, 'an', 'ans');

/** Durée d'un tour, en mots. */
export function formatPeriod(s) {
  if (!Number.isFinite(s) || s <= 0) return 'à l’arrêt';
  if (near(s, 1)) return 'une seconde';
  if (s < MIN) return `${nf(s, 2)} s`;
  if (near(s, MIN)) return 'une minute';
  if (s < HOUR) return twoParts(s, MIN, 'min', 1, 's');
  if (near(s, HOUR)) return 'une heure';
  if (s < DAY) return twoParts(s, HOUR, 'h', MIN, 'min');
  if (near(s, DAY)) return 'un jour';
  if (s < 2 * MONTH) return twoParts(s, DAY, jours, HOUR, 'h');
  if (s < YEAR) return twoParts(s, MONTH, 'mois', DAY, jours);
  if (near(s, YEAR)) return 'un an';
  if (near(s, 100 * YEAR)) return 'un siècle';
  if (near(s, 1000 * YEAR)) return 'un millénaire';
  const years = s / YEAR;
  if (years < 100) return twoParts(s, YEAR, ans, MONTH, 'mois');
  if (years < 1e6) return `${nf(Math.round(years), 0)} ans`;
  if (years < 1e9) return `${nf(years / 1e6, 2)} millions d’années`;
  return `${nf(years / 1e9, 2)} milliards d’années`;
}

function sig(v) {
  if (v >= 100) return nf(Math.round(v), 0);
  if (v >= 10) return nf(v, 1, 1);
  return nf(v, 2, 2);
}

/** Couple en unités physiques (N·m, mN·m, µN·m…), jamais en notation scientifique. */
export function formatTorque(t) {
  if (!Number.isFinite(t) || t <= 0) return '—';
  const units = [[1e3, 'kN·m'], [1, 'N·m'], [1e-3, 'mN·m'], [1e-6, 'µN·m'], [1e-9, 'nN·m']];
  for (const [k, label] of units) if (t >= k * 0.9995) return `${sig(t / k)} ${label}`;
  return `${sig(t / 1e-12)} pN·m`;
}

/** Vitesse, pour les infobulles : « 3 tours/min », « un tour toutes les 4 h ». */
export function formatSpeed(omega) {
  const w = Math.abs(omega);
  if (!w) return 'immobile';
  if (w >= 1) return `${nf(w, 1)} ${plural(Math.round(w), 'tour', 'tours')}/s`;
  if (w * MIN >= 1) return `${nf(w * MIN, 1)} tours/min`;
  return `un tour en ${formatPeriod(1 / w)}`;
}

/** Surface, en cm². */
export function formatArea(mm2) {
  return `${nf(Math.round(mm2 / 100), 0)} cm²`;
}

export function formatPercent(v) {
  const pct = v * 100;
  return `${nf(pct, pct < 10 && Math.abs(pct - Math.round(pct)) > 1e-9 ? 1 : 0)}${NBSP}%`;
}
