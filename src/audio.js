// Le son est le second dispositif : chaque étage a son battement. Une erreur s'entend avant de se voir.

export function createAudio() {
  let ctx = null, master = null, enabled = false;
  const counters = new Map(); // clé d'engrènement -> dernier nombre de dents passées

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function setEnabled(v) {
    enabled = v && ensure();
    return enabled;
  }

  function click(freq, gain = 1) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.5), t + 0.04);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  function grind() {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 900;
    filt.Q.value = 2.5;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(filt).connect(env).connect(master);
    src.start(t);
  }

  /**
   * À chaque image : pour chaque engrènement assez lent (≤ 14 dents/s), joue un clic par dent.
   * Les étages profonds battent plus grave.
   */
  function update(edges, byId, now) {
    if (!enabled) return;
    for (const e of edges) {
      if (e.type !== 'mesh') continue;
      const a = byId.get(e.a);
      const rate = Math.abs(a.omega) * a.z; // dents par seconde
      const key = `${e.a}|${e.b}`;
      if (!rate || rate > 14) { counters.delete(key); continue; }
      const n = Math.floor(rate * (now - a.tRef));
      const prev = counters.get(key);
      counters.set(key, n);
      if (prev !== undefined && n !== prev) {
        const stage = Math.max(a.stage, byId.get(e.b).stage);
        click(Math.max(220, 1400 - stage * 160), Math.min(1, 0.35 + stage * 0.12));
      }
    }
  }

  return { setEnabled, get enabled() { return enabled; }, click, grind, update };
}
