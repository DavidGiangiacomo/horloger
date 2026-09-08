// Géométrie des pignons : rayon primitif, engrènement, collisions, profils en développante.
// « Tout le jeu tient dans cette ligne » : engrènement si |d(A,B) − (r_A + r_B)| < ε.

export const MODULE = 2;                       // mm par dent (module)
export const PRESSURE_ANGLE = (20 * Math.PI) / 180;
export const MESH_TOLERANCE = 0.6;             // mm — tolérance d'engrènement
export const AXLE_TOLERANCE = 0.6;             // mm — deux centres confondus = même axe
export const MAX_LAYERS = 4;                   // étages superposables sur un même axe
export const ESC_GAP = 22;                     // mm — pivot de l'ancre au-delà du primitif de la roue
export const ESC_FOOT = 16;                    // mm — encombrement d'un échappement sur son étage

export function pitchRadius(z, m = MODULE) { return (m * z) / 2; }
export function tipRadius(z, m = MODULE) { return pitchRadius(z, m) + m; }
export function rootRadius(z, m = MODULE) { return Math.max(pitchRadius(z, m) - 1.25 * m, 1); }

export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Deux pignons du même étage engrènent si leurs cercles primitifs sont tangents. */
export function meshes(a, b, eps = MESH_TOLERANCE) {
  if (a.layer !== b.layer) return false;
  const d = dist(a, b);
  if (d <= AXLE_TOLERANCE) return false;
  return Math.abs(d - (pitchRadius(a.z) + pitchRadius(b.z))) <= eps;
}

/** Même centre (à n'importe quel étage) : les pignons partagent un axe. */
export function coaxial(a, b, eps = AXLE_TOLERANCE) { return dist(a, b) <= eps; }

/** Même étage, dentures qui se chevauchent sans engrener : le mécanisme grippe. */
export function collides(a, b) {
  if (a.layer !== b.layer) return false;
  const d = dist(a, b);
  if (d <= AXLE_TOLERANCE) return true; // deux pièces sur le même axe et le même étage
  if (meshes(a, b)) return false;
  return d < tipRadius(a.z) + tipRadius(b.z);
}

/** Un disque (x, y, r) tient-il dans la platine, union de rectangles ? Échantillonnage du contour. */
export function insideShape(rects, x, y, r, samples = 16) {
  const inside = (px, py) => rects.some((q) => px >= q.x - 1e-9 && px <= q.x + q.w + 1e-9 && py >= q.y - 1e-9 && py <= q.y + q.h + 1e-9);
  if (!inside(x, y)) return false;
  for (let i = 0; i < samples; i++) {
    const a = (i * 2 * Math.PI) / samples;
    if (!inside(x + r * Math.cos(a), y + r * Math.sin(a))) return false;
  }
  return true;
}

/** Intersections de deux cercles (pour accrocher un pignon à deux voisins à la fois). */
export function circleIntersections(c1, r1, c2, r2) {
  const d = dist(c1, c2);
  if (d < 1e-9 || d > r1 + r2 || d < Math.abs(r1 - r2)) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const h = Math.sqrt(Math.max(0, h2));
  const ux = (c2.x - c1.x) / d, uy = (c2.y - c1.y) / d;
  const px = c1.x + a * ux, py = c1.y + a * uy;
  if (h < 1e-9) return [{ x: px, y: py }];
  return [
    { x: px + h * -uy, y: py + h * ux },
    { x: px - h * -uy, y: py - h * ux },
  ];
}

// ---------------------------------------------------------------------------
// Profil de denture en développante de cercle, généré une fois par valeur de z.

const profileCache = new Map();

function polar(r, ang) { return [r * Math.cos(ang), r * Math.sin(ang)]; }
function fmt(v) { return Number(v.toFixed(3)); }

/**
 * Chemin SVG (attribut d) de la silhouette d'un pignon de z dents, dent n°0 centrée sur l'angle 0.
 * Les roues (z ≥ 24) reçoivent des ajours entre les rayons, comme une roue de laiton réelle.
 */
export function gearPath(z, m = MODULE) {
  const key = `${z}:${m}`;
  if (profileCache.has(key)) return profileCache.get(key);

  const r = pitchRadius(z, m);
  const rb = r * Math.cos(PRESSURE_ANGLE);
  const ra = tipRadius(z, m);
  const rf = rootRadius(z, m);
  const pitchAngle = (2 * Math.PI) / z;
  const halfThick = pitchAngle / 4;              // demi-épaisseur angulaire au primitif
  const tp = Math.tan(PRESSURE_ANGLE);
  const invp = tp - PRESSURE_ANGLE;              // fonction involute à l'angle de pression
  const tMax = Math.sqrt((ra / rb) ** 2 - 1);
  const tStart = rf > rb ? Math.sqrt((rf / rb) ** 2 - 1) : 0;
  const N = 6;

  // Un flanc, en polaire, de la base vers le sommet.
  const flank = [];
  for (let i = 0; i <= N; i++) {
    const t = tStart + ((tMax - tStart) * i) / N;
    const rad = rb * Math.sqrt(1 + t * t);
    const ang = t - Math.atan(t) - invp - halfThick;
    flank.push([rad, ang]);
  }
  const angStart = flank[0][1];

  let d = '';
  for (let k = 0; k < z; k++) {
    const base = k * pitchAngle;
    const pts = [];
    pts.push(polar(rf, base + angStart));
    if (tStart === 0 && rf < rb) pts.push(polar(rb, base + angStart));
    for (const [rad, ang] of flank) pts.push(polar(rad, base + ang));
    for (let i = flank.length - 1; i >= 0; i--) pts.push(polar(flank[i][0], base - flank[i][1]));
    if (tStart === 0 && rf < rb) pts.push(polar(rb, base - angStart));
    pts.push(polar(rf, base - angStart));
    d += (k === 0 ? 'M' : 'L') + pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' L');
    // arc de fond de dent jusqu'à la dent suivante
    const [nx, ny] = polar(rf, base + pitchAngle + angStart);
    d += ` A${fmt(rf)} ${fmt(rf)} 0 0 1 ${fmt(nx)} ${fmt(ny)}`;
  }
  d += ' Z';

  // Ajours : les roues sont évidées entre les rayons.
  const spokes = z >= 40 ? 5 : z >= 24 ? 4 : 0;
  if (spokes) {
    const hub = hubRadius(z, m) + 3;
    const rim = rf - 4;
    const spokeHalf = 2.2;                       // demi-largeur d'un rayon (mm)
    for (let s = 0; s < spokes; s++) {
      const a0 = (s * 2 * Math.PI) / spokes;
      const a1 = ((s + 1) * 2 * Math.PI) / spokes;
      const dInner = Math.asin(Math.min(1, spokeHalf / hub));
      const dOuter = Math.asin(Math.min(1, spokeHalf / rim));
      if (a1 - a0 <= 2 * dInner) continue;
      const [x1, y1] = polar(hub, a0 + dInner);
      const [x2, y2] = polar(rim, a0 + dOuter);
      const [x3, y3] = polar(rim, a1 - dOuter);
      const [x4, y4] = polar(hub, a1 - dInner);
      const large = (a1 - a0 - 2 * dOuter) > Math.PI ? 1 : 0;
      d += ` M${fmt(x1)} ${fmt(y1)} L${fmt(x2)} ${fmt(y2)} A${fmt(rim)} ${fmt(rim)} 0 ${large} 1 ${fmt(x3)} ${fmt(y3)}`
         + ` L${fmt(x4)} ${fmt(y4)} A${fmt(hub)} ${fmt(hub)} 0 ${large} 0 ${fmt(x1)} ${fmt(y1)} Z`;
    }
  }

  profileCache.set(key, d);
  return d;
}

/** Rayon du moyeu (partie pleine autour de l'axe). */
export function hubRadius(z, m = MODULE) {
  return Math.min(Math.max(rootRadius(z, m) * 0.28, 3), 9);
}
