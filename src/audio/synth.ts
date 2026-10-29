import { ahr, bell, filter, gain, noise, osc, perc } from './dsp';

/** A procedural sound: schedules nodes into `out` starting at `t`, returns how long it rings (s). */
export type Synth = (ctx: BaseAudioContext, out: AudioNode, t: number, dur: number, rnd: () => number) => number;

/** Coffee grinder: a motor that spins up, burr crunch on top, spins down at the end. */
export const grinder: Synth = (ctx, out, t, dur) => {
  const len = Math.max(0.6, dur);
  const end = t + len + 0.3;
  const bus = gain(ctx);
  ahr(bus.gain, t, 0.06, 0.32, len - 0.06, 0.3);
  bus.connect(out);
  // motor
  const motor = osc(ctx, 'sawtooth', 55, t, end);
  motor.frequency.setValueAtTime(55, t);
  motor.frequency.exponentialRampToValueAtTime(118, t + 0.18);
  motor.frequency.setValueAtTime(118, t + len);
  motor.frequency.exponentialRampToValueAtTime(48, t + len + 0.3);
  const mlp = filter(ctx, 'lowpass', 700, 1.2);
  motor.connect(mlp).connect(gain(ctx, 0.35)).connect(bus);
  // burrs: band-passed noise, chopped by a fast irregular flutter
  const burr = noise(ctx, t, len + 0.3);
  const bp = filter(ctx, 'bandpass', 2400, 0.9);
  const chop = gain(ctx, 0.55);
  const flutter = osc(ctx, 'square', 31, t, end);
  const depth = gain(ctx, 0.35);
  flutter.connect(depth).connect(chop.gain);
  burr.connect(bp).connect(chop).connect(bus);
  const body = noise(ctx, t, len + 0.3);
  body.connect(filter(ctx, 'bandpass', 900, 0.6)).connect(gain(ctx, 0.45)).connect(bus);
  return len + 0.4;
};

/** Espresso pull: pump hum, a building hiss, the shot dribbling into the cup, a release clunk. */
export const espresso: Synth = (ctx, out, t, dur) => {
  const len = Math.max(1.2, dur);
  const end = t + len + 0.3;
  const bus = gain(ctx);
  ahr(bus.gain, t, 0.12, 0.3, len - 0.12, 0.35);
  bus.connect(out);
  const pump = osc(ctx, 'sawtooth', 50, t, end);
  const vib = osc(ctx, 'sine', 6.5, t, end);
  vib.connect(gain(ctx, 1.5)).connect(pump.frequency);
  pump.connect(filter(ctx, 'lowpass', 220, 2)).connect(gain(ctx, 0.9)).connect(bus);
  const hiss = noise(ctx, t, len + 0.3);
  const hg = gain(ctx);
  hg.gain.setValueAtTime(0, t);
  hg.gain.linearRampToValueAtTime(0.16, t + Math.min(1, len * 0.4));
  hg.gain.linearRampToValueAtTime(0.08, t + len);
  hiss.connect(filter(ctx, 'highpass', 2600)).connect(filter(ctx, 'peaking', 5200, 1)).connect(hg).connect(bus);
  const drip = noise(ctx, t, len + 0.3);
  const dg = gain(ctx);
  dg.gain.setValueAtTime(0, t);
  dg.gain.linearRampToValueAtTime(0.35, t + Math.min(1.2, len * 0.5));
  const dripLfo = osc(ctx, 'triangle', 11, t, end);
  dripLfo.connect(gain(ctx, 0.15)).connect(dg.gain);
  drip.connect(filter(ctx, 'bandpass', 750, 1.4)).connect(dg).connect(bus);
  // portafilter clunk when done
  const clunk = gain(ctx);
  perc(clunk.gain, t + len, 0.28, 0.05);
  noise(ctx, t + len, 0.3).connect(filter(ctx, 'lowpass', 500, 2)).connect(clunk).connect(out);
  return len + 0.5;
};

/** Steam wand: a bright hiss that "stretches" (dips) then rolls, with a milky gurgle underneath. */
export const steam: Synth = (ctx, out, t, dur) => {
  const len = Math.max(1, dur);
  const end = t + len + 0.3;
  const bus = gain(ctx);
  ahr(bus.gain, t, 0.04, 0.26, len - 0.04, 0.25);
  bus.connect(out);
  const hiss = noise(ctx, t, len + 0.3);
  const bp = filter(ctx, 'bandpass', 3800, 0.8);
  bp.frequency.setValueAtTime(5200, t);
  bp.frequency.linearRampToValueAtTime(2600, t + len * 0.35);
  bp.frequency.linearRampToValueAtTime(4200, t + len);
  hiss.connect(filter(ctx, 'highpass', 1500)).connect(bp).connect(gain(ctx, 0.9)).connect(bus);
  const gurgle = noise(ctx, t, len + 0.3);
  const gg = gain(ctx, 0.3);
  const lfo = osc(ctx, 'sine', 9, t, end);
  lfo.connect(gain(ctx, 0.25)).connect(gg.gain);
  gurgle.connect(filter(ctx, 'lowpass', 520, 3)).connect(gg).connect(bus);
  // a faint squeal of the pitcher
  const sq = osc(ctx, 'sine', 1180, t, end);
  sq.frequency.linearRampToValueAtTime(980, t + len);
  const sg = gain(ctx);
  ahr(sg.gain, t + len * 0.4, 0.3, 0.012, len * 0.4, 0.2);
  sq.connect(sg).connect(bus);
  return len + 0.35;
};

/** Cold brew tap: a splashing stream plus little bubble bloops, then the tap closes. */
export const pour: Synth = (ctx, out, t, dur, rnd) => {
  const len = Math.max(0.8, dur);
  const bus = gain(ctx);
  ahr(bus.gain, t, 0.05, 0.5, len - 0.05, 0.2);
  bus.connect(out);
  const stream = noise(ctx, t, len + 0.3);
  const sb = filter(ctx, 'bandpass', 1100, 0.7);
  sb.frequency.setValueAtTime(1500, t);
  sb.frequency.linearRampToValueAtTime(800, t + len); // the cup fills, the pitch drops
  const sg = gain(ctx, 0.32);
  const lfo = osc(ctx, 'sine', 17, t, t + len + 0.3);
  lfo.connect(gain(ctx, 0.12)).connect(sg.gain);
  stream.connect(sb).connect(sg).connect(bus);
  const n = Math.round(len * 16);
  for (let i = 0; i < n; i++) {
    const bt = t + 0.05 + rnd() * (len - 0.1);
    const f0 = 450 + rnd() * 900;
    const b = osc(ctx, 'sine', f0, bt, bt + 0.08);
    b.frequency.setValueAtTime(f0, bt);
    b.frequency.exponentialRampToValueAtTime(f0 * 1.8, bt + 0.045);
    const g = gain(ctx);
    perc(g.gain, bt, 0.05 + rnd() * 0.05, 0.018, 0.002);
    b.connect(g).connect(bus);
  }
  return len + 0.3;
};

/** A small ding: a station finished and its item is waiting. */
export const ready: Synth = (ctx, out, t) => bell(ctx, out, t, 1760, 0.05, 0.5) - t;

/** The shop door's bell: two quick notes, the second softer. */
export const doorBell: Synth = (ctx, out, t) => {
  bell(ctx, out, t, 1318.5, 0.09, 1.1);
  return bell(ctx, out, t + 0.14, 1046.5, 0.07, 1.3) - t;
};

/** Register "ching": two bright bell strikes. */
export const ching: Synth = (ctx, out, t) => {
  bell(ctx, out, t, 2093, 0.05, 0.5);
  return bell(ctx, out, t + 0.07, 2637, 0.06, 0.9) - t;
};

/** A grumpy "hmph" through a vowel filter. */
export const hmph: Synth = (ctx, out, t, _dur, rnd) => {
  const f0 = 150 + rnd() * 60;
  const v = osc(ctx, 'sawtooth', f0, t, t + 0.4);
  v.frequency.setValueAtTime(f0 * 1.15, t);
  v.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 0.3);
  const g = gain(ctx);
  ahr(g.gain, t, 0.03, 0.09, 0.18, 0.12);
  v.connect(filter(ctx, 'bandpass', 650, 3)).connect(g).connect(out);
  const g2 = gain(ctx);
  ahr(g2.gain, t, 0.03, 0.05, 0.18, 0.12);
  v.connect(filter(ctx, 'bandpass', 1150, 5)).connect(g2).connect(out);
  return 0.4;
};

/** A soft descending "boop" for a bot's slip-up. */
export const oops: Synth = (ctx, out, t) => {
  const o = osc(ctx, 'triangle', 520, t, t + 0.4);
  o.frequency.setValueAtTime(520, t);
  o.frequency.exponentialRampToValueAtTime(300, t + 0.28);
  const g = gain(ctx);
  ahr(g.gain, t, 0.01, 0.08, 0.15, 0.15);
  o.connect(g).connect(out);
  return 0.4;
};

/** Power flicker: a crackling electric buzz that cuts in and out, then a power-down sweep. */
export const flicker: Synth = (ctx, out, t, _dur, rnd) => {
  const buzz = osc(ctx, 'square', 120, t, t + 1.2);
  const g = gain(ctx);
  g.gain.setValueAtTime(0, t);
  let at = t;
  while (at < t + 0.8) {
    const on = 0.03 + rnd() * 0.08;
    g.gain.setValueAtTime(0.05 + rnd() * 0.05, at);
    g.gain.setValueAtTime(0, at + on);
    at += on + 0.02 + rnd() * 0.07;
  }
  buzz.connect(filter(ctx, 'bandpass', 1800, 0.8)).connect(g).connect(out);
  const sweep = osc(ctx, 'sine', 420, t + 0.7, t + 1.6);
  sweep.frequency.setValueAtTime(420, t + 0.7);
  sweep.frequency.exponentialRampToValueAtTime(40, t + 1.5);
  const sg = gain(ctx);
  ahr(sg.gain, t + 0.7, 0.02, 0.12, 0.6, 0.2);
  sweep.connect(sg).connect(out);
  return 1.7;
};

/** Phone camera shutter, twice: the influencer is snapping pictures. */
export const shutter: Synth = (ctx, out, t) => {
  for (const at of [t, t + 0.22]) {
    for (const [dt, pk] of [[0, 0.3], [0.045, 0.22]] as const) {
      const g = gain(ctx);
      perc(g.gain, at + dt, pk, 0.012, 0.001);
      noise(ctx, at + dt, 0.08).connect(filter(ctx, 'highpass', 3000)).connect(g).connect(out);
    }
  }
  return 0.45;
};

/** Rising sparkle of bells. */
export const sparkle: Synth = (ctx, out, t) => {
  [1568, 1976, 2349, 3136].forEach((hz, i) => bell(ctx, out, t + i * 0.07, hz, 0.04, 0.6));
  return 1;
};

/** Soft UI tick for buttons. */
export const tick: Synth = (ctx, out, t) => {
  const o = osc(ctx, 'sine', 1400, t, t + 0.06);
  o.frequency.exponentialRampToValueAtTime(900, t + 0.04);
  const g = gain(ctx);
  perc(g.gain, t, 0.06, 0.012, 0.001);
  o.connect(g).connect(out);
  return 0.08;
};
