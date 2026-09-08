// Sauvegarde locale. Rien ne tourne en arrière-plan : on stocke { pièces, phases, t_ref } et
// l'angle de chaque roue se recalcule à l'affichage depuis l'horloge système.

const KEY = 'horloger.etabli.v1';

export function save(model) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...model, savedAt: Date.now() }));
  } catch { /* stockage indisponible : on continue sans sauvegarde */ }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.parts)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
