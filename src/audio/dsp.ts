/** Small Web Audio building blocks shared by the live SFX and the offline-rendered loops. */

/** Deterministic PRNG (mulberry32) so rendered loops come out the same on every machine. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise, made once per context. */
export function noiseBuffer(ctx: BaseAudioContext, seed = 7): AudioBuffer {
  const hit = noiseCache.get(ctx);
  if (hit) return hit;
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = prng(seed);
  for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
  noiseCache.set(ctx, buf);
  return buf;
}

/** A looping noise source starting at a random point (so repeats don't sound identical). */
export function noise(ctx: BaseAudioContext, t: number, dur: number, rnd: () => number = Math.random): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.start(t, rnd() * 1.5);
  src.stop(t + dur + 0.05);
  return src;
}

export function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

export function gain(ctx: BaseAudioContext, value = 0): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/** Attack, hold, release on a gain param, all exponential-ish so nothing clicks. */
export function ahr(p: AudioParam, t: number, attack: number, peak: number, hold: number, release: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setValueAtTime(peak, t + attack + hold);
  p.setTargetAtTime(0, t + attack + hold, release / 4);
  return t + attack + hold + release;
}

/** Percussive envelope: fast attack, exponential decay. */
export function perc(p: AudioParam, t: number, peak: number, decay: number, attack = 0.004): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setTargetAtTime(0, t + attack, decay);
  return t + attack + decay * 6;
}

export function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number, t: number, end: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.start(t);
  o.stop(end + 0.05);
  return o;
}

/** A struck bell / chime: a few inharmonic partials with their own decays. */
export function bell(ctx: BaseAudioContext, out: AudioNode, t: number, hz: number, peak: number, decay = 1.2): number {
  const partials: [number, number, number][] = [
    [1, 1, 1],
    [2.0, 0.35, 0.6],
    [2.76, 0.28, 0.45],
    [5.4, 0.12, 0.25],
    [8.93, 0.05, 0.15],
  ];
  let end = t;
  for (const [ratio, amp, dk] of partials) {
    if (hz * ratio > ctx.sampleRate / 2.2) continue;
    const g = gain(ctx);
    const e = perc(g.gain, t, peak * amp, decay * dk, 0.002);
    osc(ctx, 'sine', hz * ratio, t, e).connect(g).connect(out);
    end = Math.max(end, e);
  }
  return end;
}
