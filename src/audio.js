// Le son est le second dispositif : chaque étage a son battement. Une erreur s'entend avant de se voir.
// Avec un échappement, c'est le tic-tac qui mène ; sans, les étages lents cliquent dent par dent.

export function createAudio() {
  let ctx = null, master = null, enabled = false;
  const counters = new Map(); // clé d'engrènement -> dernier nombre de dents passées
  let beatCount = null;

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

  function click(freq, gain = 1, decay = 0.06) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.5), t + 0.04);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + decay + 0.02);
  }

  function noise(duration, freq, q, gain) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filt).connect(env).connect(master);
    src.start(t);
  }

  /** Grippage : deux dentures qui se chevauchent. */
  function grind() { noise(0.5, 900, 2.5, 0.9); }
  /** Ressort qui s'emballe : un vrombissement bref. */
  function whirr() { noise(0.35, 2400, 1.2, 0.5); }
  /** Remontage : le cliquet. */
  function ratchet() { for (let i = 0; i < 6; i++) setTimeout(() => click(700 + i * 40, 0.5, 0.03), i * 55); }

  /** À chaque image : tic-tac de l'échappement, ou clics des engrènements lents (≤ 14 dents/s). */
  function update(solution, byId, now) {
    if (!enabled || !solution) return;
    if (solution.beat) {
      const src = [...byId.values()].find((p) => p.isSource);
      const n = Math.floor((now - (src?.tRef ?? 0)) * solution.beat);
      if (beatCount !== null && n !== beatCount) click(n % 2 ? 1500 : 1100, 0.8, 0.05);
      beatCount = n;
      return;
    }
    beatCount = null;
    for (const e of solution.edges) {
      if (e.type !== 'mesh') continue;
      const a = byId.get(e.a);
      if (!a) continue;
      const rate = Math.abs(a.omega) * a.z; // dents par seconde
      const key = `${e.a}|${e.b}`;
      if (!rate || rate > 14) { counters.delete(key); continue; }
      const n = Math.floor(rate * (now - a.tRef));
      const prev = counters.get(key);
      counters.set(key, n);
      if (prev !== undefined && n !== prev) {
        const stage = Math.max(a.stage, byId.get(e.b)?.stage ?? 0);
        click(Math.max(220, 1400 - stage * 160), Math.min(1, 0.35 + stage * 0.12));
      }
    }
  }

  return { setEnabled, get enabled() { return enabled; }, click, grind, whirr, ratchet, update };
}
