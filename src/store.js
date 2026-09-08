// Sauvegarde locale, un emplacement par boîtier. Rien ne tourne en arrière-plan : on stocke
// { pièces, phases, t_ref } et l'angle de chaque roue se recalcule à l'affichage depuis l'horloge.

const KEY_V1 = 'horloger.etabli.v1';
const KEY = 'horloger.atelier.v2';

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, version: 2, savedAt: Date.now() }));
  } catch { /* stockage indisponible : on continue sans sauvegarde */ }
}

/** Charge l'atelier. Un établi v1 (le MVP) devient l'emplacement « libre ». */
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.slots) return data;
    }
    const old = localStorage.getItem(KEY_V1);
    if (old) {
      const v1 = JSON.parse(old);
      if (v1 && Array.isArray(v1.parts)) {
        return { current: 'b1', completed: {}, slots: { libre: { parts: v1.parts, links: [], hand: v1.hand ?? null, nextId: v1.nextId ?? 1 } } };
      }
    }
  } catch { /* données illisibles : on repart de zéro */ }
  return null;
}

export function clear() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(KEY_V1); } catch { /* ignore */ }
}
