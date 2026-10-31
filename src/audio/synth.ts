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

/** An old desk phone: two short trills of alternating bell strikes (the second shop calling, P6). */
export const phone: Synth = (ctx, out, t) => {
  let end = t;
  for (const start of [0, 0.42]) {
    for (let i = 0; i < 8; i++) end = bell(ctx, out, t + start + i * 0.04, i % 2 ? 1568 : 1319, 0.05, 0.25);
  }
  return end - t;
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

/** Espresso shot knocked back: two quick glugs and a satisfied "ahh" of breath. */
export const gulp: Synth = (ctx, out, t) => {
  for (const [dt, f] of [[0, 340], [0.16, 300]] as const) {
    const o = osc(ctx, 'sine', f, t + dt, t + dt + 0.14);
    o.frequency.setValueAtTime(f, t + dt);
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + dt + 0.12);
    const g = gain(ctx);
    perc(g.gain, t + dt, 0.16, 0.09, 0.006);
    o.connect(g).connect(out);
  }
  const g = gain(ctx);
  ahr(g.gain, t + 0.36, 0.04, 0.05, 0.12, 0.25);
  noise(ctx, t + 0.36, 0.5).connect(filter(ctx, 'bandpass', 900, 0.8)).connect(g).connect(out);
  return 0.9;
};

/** Lub-dub: a soft low double thump (the espresso tell). */
export const heartbeat: Synth = (ctx, out, t) => {
  for (const [dt, f, pk] of [[0, 62, 0.5], [0.13, 52, 0.34]] as const) {
    const o = osc(ctx, 'sine', f * 1.6, t + dt, t + dt + 0.18);
    o.frequency.setValueAtTime(f * 1.6, t + dt);
    o.frequency.exponentialRampToValueAtTime(f, t + dt + 0.05);
    const g = gain(ctx);
    perc(g.gain, t + dt, pk, 0.11, 0.005);
    o.connect(filter(ctx, 'lowpass', 220)).connect(g).connect(out);
  }
  return 0.32;
};

/** Cartoon faint: a slide whistle all the way down, then a soft thud on the floor. */
export const faint: Synth = (ctx, out, t) => {
  const w = osc(ctx, 'sine', 1500, t, t + 0.85);
  w.frequency.setValueAtTime(1500, t);
  w.frequency.exponentialRampToValueAtTime(180, t + 0.8);
  const vib = osc(ctx, 'sine', 9, t, t + 0.85);
  const depth = gain(ctx, 30);
  vib.connect(depth).connect(w.frequency);
  const g = gain(ctx);
  ahr(g.gain, t, 0.02, 0.07, 0.6, 0.15);
  w.connect(g).connect(out);
  const thud = osc(ctx, 'sine', 110, t + 0.85, t + 1.2);
  thud.frequency.setValueAtTime(110, t + 0.85);
  thud.frequency.exponentialRampToValueAtTime(40, t + 1.1);
  const tg = gain(ctx);
  perc(tg.gain, t + 0.85, 0.5, 0.18, 0.004);
  thud.connect(tg).connect(out);
  const ng = gain(ctx);
  perc(ng.gain, t + 0.85, 0.18, 0.1, 0.003);
  noise(ctx, t + 0.85, 0.2).connect(filter(ctx, 'lowpass', 400)).connect(ng).connect(out);
  return 1.25;
};

/** Ambulance pulling up and driving off: a hi-lo two-tone siren that swells in and fades away. */
export const siren: Synth = (ctx, out, t) => {
  const len = 7.5;
  const o = osc(ctx, 'triangle', 960, t, t + len);
  for (let i = 0, at = t; at < t + len; i++, at += 0.42) o.frequency.setValueAtTime(i % 2 ? 770 : 960, at);
  const g = gain(ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.05, t + 1.8);
  g.gain.setValueAtTime(0.05, t + 4.2);
  g.gain.linearRampToValueAtTime(0.03, t + 5.5);
  g.gain.linearRampToValueAtTime(0, t + len);
  o.connect(filter(ctx, 'lowpass', 2400)).connect(g).connect(out);
  return len;
};

/* ---- Chaos pack (Block 1): slips, spills, the mop and the rogue customer ---- */

/** Feet go out from under you: a quick slide-whistle up, then a cartoon body thud. */
export const slip: Synth = (ctx, out, t) => {
  const w = osc(ctx, 'sine', 500, t, t + 0.26);
  w.frequency.setValueAtTime(500, t);
  w.frequency.exponentialRampToValueAtTime(1700, t + 0.22);
  const wg = gain(ctx);
  ahr(wg.gain, t, 0.02, 0.07, 0.17, 0.05);
  w.connect(wg).connect(out);
  const at = t + 0.26;
  const body = osc(ctx, 'sine', 130, at, at + 0.35);
  body.frequency.setValueAtTime(130, at);
  body.frequency.exponentialRampToValueAtTime(42, at + 0.25);
  const bg = gain(ctx);
  perc(bg.gain, at, 0.5, 0.07, 0.002);
  body.connect(bg).connect(out);
  const n = noise(ctx, at, 0.2);
  const ng = gain(ctx);
  perc(ng.gain, at, 0.35, 0.03, 0.001);
  n.connect(filter(ctx, 'lowpass', 500, 0.8)).connect(ng).connect(out);
  // dizzy birdies
  [2637, 3136, 2637].forEach((hz, i) => {
    const b = osc(ctx, 'sine', hz, at + 0.35 + i * 0.13, at + 0.45 + i * 0.13);
    b.frequency.setValueAtTime(hz, at + 0.35 + i * 0.13);
    b.frequency.exponentialRampToValueAtTime(hz * 1.25, at + 0.42 + i * 0.13);
    const g = gain(ctx);
    perc(g.gain, at + 0.35 + i * 0.13, 0.03, 0.025);
    b.connect(g).connect(out);
  });
  return 1.1;
};

/** A drink hits the floor: a wet splosh that drops in pitch, plus a few droplets. */
export const splash: Synth = (ctx, out, t, _dur, rnd) => {
  const n = noise(ctx, t, 0.4, rnd);
  const bp = filter(ctx, 'bandpass', 1800, 1.4);
  bp.frequency.setValueAtTime(1800, t);
  bp.frequency.exponentialRampToValueAtTime(380, t + 0.3);
  const g = gain(ctx);
  perc(g.gain, t, 0.45, 0.08, 0.003);
  n.connect(bp).connect(g).connect(out);
  for (let i = 0; i < 4; i++) {
    const at = t + 0.08 + rnd() * 0.25;
    const hz = 900 + rnd() * 900;
    const d = osc(ctx, 'sine', hz, at, at + 0.06);
    d.frequency.setValueAtTime(hz, at);
    d.frequency.exponentialRampToValueAtTime(hz * 1.6, at + 0.04);
    const dg = gain(ctx);
    perc(dg.gain, at, 0.05, 0.012, 0.001);
    d.connect(dg).connect(out);
  }
  return 0.5;
};

/** Grounds spilled: a dry gritty scatter. */
export const scatter: Synth = (ctx, out, t, _dur, rnd) => {
  for (let i = 0; i < 6; i++) {
    const at = t + i * 0.025 + rnd() * 0.02;
    const g = gain(ctx);
    perc(g.gain, at, 0.18 - i * 0.02, 0.02, 0.001);
    noise(ctx, at, 0.08, rnd).connect(filter(ctx, 'highpass', 2500 + rnd() * 2000)).connect(g).connect(out);
  }
  return 0.3;
};

/** Mop squeaks on clean tile, twice. */
export const squeak: Synth = (ctx, out, t) => {
  for (const [at, f] of [[t, 1900], [t + 0.16, 2300]] as const) {
    const o = osc(ctx, 'sine', f, at, at + 0.1);
    o.frequency.setValueAtTime(f, at);
    o.frequency.linearRampToValueAtTime(f * 1.3, at + 0.08);
    const vib = osc(ctx, 'sine', 38, at, at + 0.1);
    vib.connect(gain(ctx, 60)).connect(o.frequency);
    const g = gain(ctx);
    ahr(g.gain, at, 0.01, 0.06, 0.06, 0.03);
    o.connect(g).connect(out);
  }
  return 0.35;
};

/** Wooden mop handle knocked against the bucket. */
export const clack: Synth = (ctx, out, t) => {
  const o = osc(ctx, 'triangle', 340, t, t + 0.12);
  o.frequency.setValueAtTime(340, t);
  o.frequency.exponentialRampToValueAtTime(220, t + 0.08);
  const g = gain(ctx);
  perc(g.gain, t, 0.22, 0.03, 0.001);
  o.connect(g).connect(out);
  const ng = gain(ctx);
  perc(ng.gain, t, 0.2, 0.015, 0.001);
  noise(ctx, t, 0.06).connect(filter(ctx, 'bandpass', 1400, 2)).connect(ng).connect(out);
  return 0.2;
};

/** Tiptoe pizzicato: someone is sneaking behind the counter. */
export const sneak: Synth = (ctx, out, t) => {
  // E3 . C3 . Eb3 . B2: the classic sneaky creep
  const notes = [164.8, 130.8, 155.6, 123.5, 164.8, 130.8];
  notes.forEach((hz, i) => {
    const at = t + i * 0.16;
    const o = osc(ctx, 'triangle', hz * 2, at, at + 0.14);
    const g = gain(ctx);
    perc(g.gain, at, 0.16, 0.04, 0.002);
    o.connect(filter(ctx, 'lowpass', 1600, 1)).connect(g).connect(out);
  });
  return 1.1;
};

/** A smug little "ta-da": the rogue finished their own drink. */
export const smug: Synth = (ctx, out, t) => {
  bell(ctx, out, t, 784, 0.06, 0.4);
  return bell(ctx, out, t + 0.12, 1175, 0.07, 0.8) - t;
};

/* ---- Event stings (Block 2) ---- */

/** Rush hour: a quick brassy run up the scale. */
export const rushSting: Synth = (ctx, out, t) => {
  [523.3, 659.3, 784, 1046.5].forEach((hz, i) => {
    const at = t + i * 0.075;
    const o = osc(ctx, 'sawtooth', hz, at, at + (i === 3 ? 0.4 : 0.1));
    const g = gain(ctx);
    if (i === 3) ahr(g.gain, at, 0.01, 0.07, 0.22, 0.15);
    else perc(g.gain, at, 0.07, 0.04, 0.003);
    o.connect(filter(ctx, 'lowpass', 2600, 1.2)).connect(g).connect(out);
  });
  return 0.8;
};

/** Health inspector: "dun, dun, dunnn". */
export const inspectorSting: Synth = (ctx, out, t) => {
  const notes: [number, number, number][] = [[146.8, 0, 0.16], [146.8, 0.24, 0.16], [110, 0.5, 0.8]];
  for (const [hz, dt, len] of notes) {
    const at = t + dt;
    const o = osc(ctx, 'triangle', hz, at, at + len + 0.2);
    const o2 = osc(ctx, 'sawtooth', hz / 2, at, at + len + 0.2);
    const g = gain(ctx);
    ahr(g.gain, at, 0.01, 0.16, len, 0.2);
    o.connect(g);
    o2.connect(filter(ctx, 'lowpass', 400, 1)).connect(gain(ctx, 0.5)).connect(g);
    g.connect(out);
  }
  return 1.6;
};

/** Influencer: a glittery upward glissando. */
export const glitter: Synth = (ctx, out, t) => {
  for (let i = 0; i < 8; i++) bell(ctx, out, t + i * 0.035, 1046.5 * 2 ** (i / 6), 0.03, 0.4);
  return 0.8;
};

/** Power trouble: a mains buzz with a crackle, chopped like a failing ballast. */
export const buzz: Synth = (ctx, out, t, _dur, rnd) => {
  const o = osc(ctx, 'sawtooth', 60, t, t + 0.4);
  const o2 = osc(ctx, 'square', 120, t, t + 0.4);
  const g = gain(ctx);
  g.gain.setValueAtTime(0, t);
  let at = t;
  while (at < t + 0.35) {
    const on = 0.02 + rnd() * 0.06;
    g.gain.setValueAtTime(0.04 + rnd() * 0.03, at);
    g.gain.setValueAtTime(0.005, at + on);
    at += on + 0.01 + rnd() * 0.03;
  }
  g.gain.setValueAtTime(0, t + 0.38);
  o.connect(filter(ctx, 'bandpass', 900, 0.7)).connect(g);
  o2.connect(filter(ctx, 'bandpass', 2400, 1.5)).connect(gain(ctx, 0.5)).connect(g);
  g.connect(out);
  return 0.45;
};

/** ui-3.4.1 (FB2 A4): a fridge door unsticking: a soft rubbery pop with a puff of cold air. */
export const fridgeSeal: Synth = (ctx, out, t, _dur, rnd) => {
  const o = osc(ctx, 'sine', 140, t, t + 0.12);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
  const g = gain(ctx);
  perc(g.gain, t, 0.3, 0.09);
  o.connect(g).connect(out);
  const n = noise(ctx, t + 0.02, 0.35, rnd);
  const ng = gain(ctx);
  ahr(ng.gain, t + 0.02, 0.04, 0.05, 0.08, 0.2);
  n.connect(filter(ctx, 'highpass', 2500, 0.6)).connect(ng).connect(out);
  return 0.4;
};

/** ui-3.4.1: something went bad: a sour, sagging two-note wah. */
export const sour: Synth = (ctx, out, t) => {
  let end = t;
  for (const [at, from, to] of [[0, 330, 300], [0.22, 280, 210]] as const) {
    const o = osc(ctx, 'triangle', from, t + at, t + at + 0.32);
    o.frequency.linearRampToValueAtTime(to, t + at + 0.3);
    const g = gain(ctx);
    end = Math.max(end, ahr(g.gain, t + at, 0.02, 0.12, 0.12, 0.16));
    o.connect(filter(ctx, 'lowpass', 1400, 1.2)).connect(g).connect(out);
  }
  return end - t;
};

/** ui-3.4.1: closing soon: a shop-door ding-dong, high then low. */
export const closingChime: Synth = (ctx, out, t) => {
  bell(ctx, out, t, 1046, 0.07, 0.9);
  return bell(ctx, out, t + 0.32, 784, 0.07, 1.1) - t;
};

/** ui-3.4.1: the Udder-Matic 3000's moo: a low, nasal sawtooth that rises then sags, with a little vibrato. */
export const moo: Synth = (ctx, out, t) => {
  const o = osc(ctx, 'sawtooth', 120, t, t + 1.1);
  o.frequency.setValueAtTime(120, t);
  o.frequency.linearRampToValueAtTime(150, t + 0.25);
  o.frequency.linearRampToValueAtTime(138, t + 0.7);
  o.frequency.linearRampToValueAtTime(100, t + 1.05);
  const lfo = osc(ctx, 'sine', 5.5, t, t + 1.1);
  const depth = gain(ctx, 3);
  lfo.connect(depth).connect(o.frequency);
  const vowel = filter(ctx, 'bandpass', 520, 2.2);
  vowel.frequency.setValueAtTime(380, t);
  vowel.frequency.linearRampToValueAtTime(700, t + 0.35);
  vowel.frequency.linearRampToValueAtTime(450, t + 1.0);
  const g = gain(ctx);
  const end = ahr(g.gain, t, 0.12, 0.22, 0.6, 0.3);
  o.connect(filter(ctx, 'lowpass', 1800, 0.7)).connect(vowel).connect(g).connect(out);
  return end - t;
};
