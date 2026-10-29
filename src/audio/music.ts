import { bell, filter, gain, midiHz, noiseBuffer, osc, perc, prng } from './dsp';
import type { MusicMode } from './cues';

/**
 * The background music and the crowd murmur are composed here as plain note lists, then rendered
 * once into AudioBuffers with an OfflineAudioContext (no music files to download). Each loop is
 * rendered with a tail, and the tail is folded back onto the start, so `loop = true` is seamless.
 */

export type Inst = 'ep' | 'bass' | 'vibe' | 'kick' | 'rim' | 'hat' | 'shaker';

export interface Note {
  inst: Inst;
  /** Start, in beats from the top of the loop. */
  beat: number;
  /** Length in beats. */
  len: number;
  midi: number;
  vel: number;
}

export interface Score {
  bpm: number;
  beats: number;
  notes: Note[];
  /** Overall low-pass, for the warm lo-fi tone. */
  tone: number;
}

interface Chord {
  bass: number;
  keys: number[];
  /** Notes a melody may use over this chord. */
  scale: number[];
}

// F major, a lazy ii-V turnaround: Fmaj9 | Em9 A7 | Dm9 | Cm9 F13 | Bbmaj9 | Bbm6 Eb9 | Am7 D7 | Gm9 C13
const F_PENTA = [65, 67, 69, 72, 74, 77, 79, 81];
const DAY_BARS: Chord[][] = [
  [{ bass: 41, keys: [57, 60, 64, 67], scale: F_PENTA }],
  [{ bass: 40, keys: [55, 59, 62, 66], scale: [67, 71, 74, 76, 79] }, { bass: 45, keys: [55, 61, 66], scale: [69, 73, 76, 79] }],
  [{ bass: 38, keys: [53, 57, 60, 64], scale: [65, 69, 72, 74, 76, 77] }],
  [{ bass: 36, keys: [58, 62, 63, 67], scale: [67, 70, 72, 74, 75] }, { bass: 41, keys: [57, 63, 67], scale: [69, 72, 75, 77] }],
  [{ bass: 46, keys: [62, 65, 69, 72], scale: [65, 69, 70, 72, 74, 77] }],
  [{ bass: 46, keys: [61, 65, 67], scale: [65, 70, 73, 77] }, { bass: 39, keys: [55, 61, 65], scale: [67, 70, 73, 75] }],
  [{ bass: 45, keys: [55, 60, 64], scale: [67, 69, 72, 76] }, { bass: 38, keys: [54, 60, 64], scale: [66, 69, 72, 74] }],
  [{ bass: 43, keys: [58, 62, 65, 69], scale: [65, 67, 70, 74, 77] }, { bass: 48, keys: [58, 64, 69], scale: [67, 69, 72, 76] }],
];

// Eb major, slow and open for the night shop: Ebmaj9 | Cm9 | Abmaj9 | Bb13sus | Gm7 | Cm9 | Abmaj7 | Bbsus
const NIGHT_BARS: Chord[] = [
  { bass: 39, keys: [55, 58, 62, 65], scale: [70, 74, 75, 77, 79, 82] },
  { bass: 36, keys: [55, 58, 62, 63], scale: [70, 72, 74, 75, 79] },
  { bass: 44, keys: [60, 63, 67, 70], scale: [72, 75, 77, 79, 82] },
  { bass: 46, keys: [56, 60, 63, 67], scale: [70, 72, 75, 77, 79] },
  { bass: 43, keys: [53, 58, 62], scale: [70, 74, 77, 79] },
  { bass: 36, keys: [55, 58, 62, 63], scale: [70, 72, 74, 75, 79] },
  { bass: 44, keys: [55, 60, 63], scale: [72, 75, 79, 80] },
  { bass: 46, keys: [56, 60, 63, 65], scale: [70, 72, 75, 77] },
];

/** Lazy swing: the off-beat eighth lands late. */
const SWING = 0.62;
const swing = (beat: number) => (beat % 1 === 0.5 ? Math.floor(beat) + SWING : beat);

/** Day: 82 bpm lo-fi jazz, 16 bars (the 8-bar progression twice, melody and fills vary). */
export function composeDay(seed = 11): Score {
  const r = prng(seed);
  const notes: Note[] = [];
  const add = (inst: Inst, beat: number, len: number, midi: number, vel: number) => notes.push({ inst, beat: swing(beat), len, midi, vel });
  for (let pass = 0; pass < 2; pass++) {
    DAY_BARS.forEach((bar, b) => {
      const at = (pass * 8 + b) * 4;
      const half = bar.length === 2;
      bar.forEach((c, i) => {
        const t = at + i * 2;
        // Rhodes comping
        const hits = half ? [[0, 1.4]] : [[0, 1.4], [1.5, 2.2]];
        for (const [o, len] of hits) for (const k of c.keys) add('ep', t + o, len, k, 0.75 + r() * 0.2);
        // bass: root, fifth, and a walk-up into the next chord
        add('bass', t, half ? 1.4 : 1.4, c.bass, 0.95);
        if (!half) {
          add('bass', t + 2, 0.9, c.bass + 7, 0.75);
          add('bass', t + 3.5, 0.45, c.bass + (r() < 0.5 ? 10 : 5), 0.6);
        } else {
          add('bass', t + 1.5, 0.4, c.bass + 7, 0.6);
        }
      });
      // drums: soft kick, rimshot on 2 and 4, swung hats
      add('kick', at, 0.5, 0, 1);
      add('kick', at + 2.5, 0.5, 0, 0.8);
      if (r() < 0.35) add('kick', at + 3.5, 0.5, 0, 0.55);
      add('rim', at + 1, 0.5, 0, 0.9);
      add('rim', at + 3, 0.5, 0, 0.9);
      for (let e = 0; e < 8; e++) add('hat', at + e * 0.5, 0.25, 0, e % 2 ? 0.55 + r() * 0.2 : 0.85);
      // melody: a sparse vibes phrase every other bar, a little busier on the second pass
      if (b % 2 === 1 || (pass === 1 && r() < 0.5)) {
        const c = bar[bar.length - 1];
        const count = 2 + Math.floor(r() * (pass ? 4 : 3));
        let beat = at + (b % 2 ? 0.5 : 1.5);
        let idx = Math.floor(r() * c.scale.length);
        for (let n = 0; n < count && beat < at + 4; n++) {
          idx = Math.max(0, Math.min(c.scale.length - 1, idx + (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 2))));
          const len = r() < 0.3 ? 1 : 0.5;
          add('vibe', beat, len * 1.6, c.scale[idx], 0.7 + r() * 0.3);
          beat += len;
        }
      }
    });
  }
  return { bpm: 82, beats: 64, notes, tone: 5200 };
}

/** Night: 64 bpm, long Rhodes chords, a slow vibes arpeggio, a shaker, no kit. */
export function composeNight(seed = 23): Score {
  const r = prng(seed);
  const notes: Note[] = [];
  NIGHT_BARS.forEach((c, b) => {
    const at = b * 4;
    for (const k of c.keys) notes.push({ inst: 'ep', beat: at, len: 3.8, midi: k, vel: 0.6 + r() * 0.15 });
    if (r() < 0.5) for (const k of c.keys.slice(1)) notes.push({ inst: 'ep', beat: at + 2.5, len: 1.4, midi: k, vel: 0.35 });
    notes.push({ inst: 'bass', beat: at, len: 3.6, midi: c.bass, vel: 0.7 });
    for (let e = 0; e < 8; e++) {
      if (r() < 0.6) {
        const m = c.scale[(e + b) % c.scale.length];
        notes.push({ inst: 'vibe', beat: swing(at + e * 0.5), len: 1.5, midi: m, vel: 0.35 + r() * 0.3 });
      }
      notes.push({ inst: 'shaker', beat: swing(at + e * 0.5), len: 0.25, midi: 0, vel: e % 2 ? 0.4 : 0.7 });
    }
  });
  return { bpm: 64, beats: 32, notes, tone: 3800 };
}

export const SCORES: Record<MusicMode, () => Score> = { day: composeDay, night: composeNight };

export const loopSeconds = (s: Score) => (s.beats * 60) / s.bpm;

type Voice = (ctx: BaseAudioContext, out: AudioNode, t: number, len: number, hz: number, vel: number) => void;

const VOICES: Record<Inst, Voice> = {
  // Two-operator FM electric piano: a bell-ish attack that mellows as the modulation decays.
  ep(ctx, out, t, len, hz, vel) {
    const end = t + len + 0.6;
    const car = osc(ctx, 'sine', hz, t, end);
    const mod = osc(ctx, 'sine', hz, t, end);
    const idx = gain(ctx);
    idx.gain.setValueAtTime(hz * 1.4, t);
    idx.gain.setTargetAtTime(hz * 0.15, t, 0.25);
    mod.connect(idx).connect(car.frequency);
    const g = gain(ctx);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07 * vel, t + 0.008);
    g.gain.setTargetAtTime(0.025 * vel, t + 0.008, 0.7);
    g.gain.setTargetAtTime(0, t + len, 0.15);
    car.connect(g).connect(out);
    const tine = osc(ctx, 'sine', hz * 4, t, t + 0.4);
    const tg = gain(ctx);
    perc(tg.gain, t, 0.008 * vel, 0.05);
    tine.connect(tg).connect(out);
  },
  bass(ctx, out, t, len, hz, vel) {
    const end = t + len + 0.3;
    const g = gain(ctx);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22 * vel, t + 0.012);
    g.gain.setTargetAtTime(0.13 * vel, t + 0.012, 0.35);
    g.gain.setTargetAtTime(0, t + len, 0.06);
    const lp = filter(ctx, 'lowpass', 520, 0.9);
    osc(ctx, 'sine', hz, t, end).connect(g);
    const tri = osc(ctx, 'triangle', hz, t, end);
    tri.connect(gain(ctx, 0.35)).connect(g);
    g.connect(lp).connect(out);
  },
  vibe(ctx, out, t, len, hz, vel) {
    const end = t + len + 1.5;
    const g = gain(ctx);
    perc(g.gain, t, 0.05 * vel, 0.55, 0.003);
    const trem = osc(ctx, 'sine', 5, t, end);
    trem.connect(gain(ctx, 0.012 * vel)).connect(g.gain);
    osc(ctx, 'sine', hz, t, end).connect(g).connect(out);
    const g4 = gain(ctx);
    perc(g4.gain, t, 0.012 * vel, 0.12, 0.002);
    osc(ctx, 'sine', hz * 4, t, t + 0.6).connect(g4).connect(out);
  },
  kick(ctx, out, t, _len, _hz, vel) {
    const o = osc(ctx, 'sine', 110, t, t + 0.5);
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    const g = gain(ctx);
    perc(g.gain, t, 0.32 * vel, 0.1, 0.003);
    o.connect(g).connect(out);
  },
  rim(ctx, out, t, _len, _hz, vel) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.start(t, (t * 0.37) % 1.5);
    src.stop(t + 0.4);
    const g = gain(ctx);
    perc(g.gain, t, 0.09 * vel, 0.05, 0.002);
    src.connect(filter(ctx, 'bandpass', 1900, 1.1)).connect(g).connect(out);
    const body = osc(ctx, 'triangle', 330, t, t + 0.15);
    const bg = gain(ctx);
    perc(bg.gain, t, 0.03 * vel, 0.02, 0.001);
    body.connect(bg).connect(out);
  },
  hat(ctx, out, t, _len, _hz, vel) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.start(t, (t * 0.61) % 1.5);
    src.stop(t + 0.2);
    const g = gain(ctx);
    perc(g.gain, t, 0.028 * vel, 0.02, 0.001);
    src.connect(filter(ctx, 'highpass', 7000)).connect(g).connect(out);
  },
  shaker(ctx, out, t, _len, _hz, vel) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.start(t, (t * 0.53) % 1.5);
    src.stop(t + 0.25);
    const g = gain(ctx);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.018 * vel, t + 0.025);
    g.gain.setTargetAtTime(0, t + 0.03, 0.03);
    src.connect(filter(ctx, 'bandpass', 6500, 1.2)).connect(g).connect(out);
  },
};

type OfflineFactory = (channels: number, length: number, sampleRate: number) => OfflineAudioContext;
const defaultOffline: OfflineFactory = (c, l, s) => new OfflineAudioContext(c, l, s);

export const TAIL_SEC = 3;
export const MUSIC_RATE = 32000;

/** Add the rendered tail (past the loop end) back onto the loop's start, then cut it off. */
export function foldTail(ctx: BaseAudioContext, rendered: AudioBuffer, loopLen: number): AudioBuffer {
  const out = ctx.createBuffer(rendered.numberOfChannels, loopLen, rendered.sampleRate);
  for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
    const src = rendered.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(0, loopLen));
    for (let i = loopLen; i < src.length; i++) dst[i - loopLen] += src[i];
  }
  return out;
}

/** Scale a buffer to a target loudness (never past a 0.9 peak). */
export function normalize(buf: AudioBuffer, targetRms: number): AudioBuffer {
  let sum = 0;
  let peak = 0;
  let n = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    for (const v of buf.getChannelData(ch)) {
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
      n++;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  if (!(rms > 0)) return buf;
  const k = Math.min(targetRms / rms, 0.9 / peak);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
  return buf;
}

/** Vinyl hiss and sparse crackle, the lo-fi bed under the day loop. */
function vinyl(ctx: BaseAudioContext, out: AudioNode, seconds: number, seed: number): void {
  const len = Math.floor(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = prng(seed);
  for (let i = 0; i < len; i++) {
    d[i] = (r() * 2 - 1) * 0.004;
    if (r() < 9 / ctx.sampleRate) d[i] += (r() < 0.5 ? -1 : 1) * (0.05 + r() * 0.12);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.start(0);
  src.connect(filter(ctx, 'bandpass', 2600, 0.5)).connect(out);
}

/** Render a score into a seamlessly looping stereo buffer. */
export async function renderScore(score: Score, offline: OfflineFactory = defaultOffline, rate = MUSIC_RATE): Promise<AudioBuffer> {
  const loopSec = loopSeconds(score);
  const loopLen = Math.round(loopSec * rate);
  const ctx = offline(2, loopLen + TAIL_SEC * rate, rate);
  const spb = 60 / score.bpm;
  const lp = filter(ctx, 'lowpass', score.tone, 0.5);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.2;
  lp.connect(comp).connect(ctx.destination);
  // a little stereo width: keys slightly left, vibes slightly right, everything else centre
  const pan = (p: number) => {
    const sp = ctx.createStereoPanner();
    sp.pan.value = p;
    sp.connect(lp);
    return sp;
  };
  const buses: Record<Inst, AudioNode> = { ep: pan(-0.2), vibe: pan(0.3), bass: lp, kick: lp, rim: pan(0.1), hat: pan(0.25), shaker: pan(-0.25) };
  // tremolo on the electric piano bus
  const epTrem = gain(ctx, 0.85);
  const lfo = osc(ctx, 'sine', 4.2, 0, loopSec + TAIL_SEC);
  lfo.connect(gain(ctx, 0.15)).connect(epTrem.gain);
  epTrem.connect(buses.ep);
  for (const n of score.notes) {
    const out = n.inst === 'ep' ? epTrem : buses[n.inst];
    VOICES[n.inst](ctx, out, n.beat * spb, n.len * spb, midiHz(n.midi), n.vel);
  }
  if (score.bpm > 70) vinyl(ctx, lp, loopSec + TAIL_SEC, 5);
  const rendered = await ctx.startRendering();
  return foldTail(ctx, rendered, loopLen);
}

export const CROWD_SEC = 14;

/**
 * A room full of chatter: each voice is a buzzy source pushed through two moving vowel filters,
 * talking in syllable bursts with pauses, plus the odd spoon clink. Lowpassed and smeared by a
 * small generated room, so no single word stands out.
 */
export async function renderCrowd(voices: number, seed: number, targetRms = 0.04, offline: OfflineFactory = defaultOffline, rate = 22050): Promise<AudioBuffer> {
  const loopLen = CROWD_SEC * rate;
  const total = CROWD_SEC + 2;
  const ctx = offline(2, loopLen + 2 * rate, rate);
  const r = prng(seed);
  const dry = gain(ctx, 1);
  const lp = filter(ctx, 'lowpass', 1700, 0.5);
  const verb = ctx.createConvolver();
  const ir = ctx.createBuffer(2, Math.floor(rate * 0.9), rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (r() * 2 - 1) * Math.exp(-i / (rate * 0.18));
  }
  verb.buffer = ir;
  dry.connect(lp);
  lp.connect(gain(ctx, 0.5)).connect(ctx.destination);
  lp.connect(verb).connect(gain(ctx, 0.35)).connect(ctx.destination);
  for (let v = 0; v < voices; v++) {
    const f0 = r() < 0.5 ? 95 + r() * 40 : 170 + r() * 60;
    const src = osc(ctx, 'sawtooth', f0, 0, total);
    const f1 = filter(ctx, 'bandpass', 500, 4);
    const f2 = filter(ctx, 'bandpass', 1500, 6);
    const amp = gain(ctx, 0);
    const p = ctx.createStereoPanner();
    p.pan.value = r() * 1.6 - 0.8;
    const level = 0.05 + r() * 0.04;
    src.connect(f1).connect(amp);
    src.connect(f2).connect(gain(ctx, 0.6)).connect(amp);
    amp.connect(p).connect(dry);
    // explicit ramps only: chained setTargetAtTime on one param is fragile in some engines
    let t = r() * 1.5;
    amp.gain.setValueAtTime(0, 0);
    while (t < total - 0.8) {
      const syl = 3 + Math.floor(r() * 10);
      amp.gain.setValueAtTime(0, t);
      for (let s = 0; s < syl && t < total - 0.6; s++) {
        const d = 0.1 + r() * 0.16;
        f1.frequency.linearRampToValueAtTime(300 + r() * 500, t + 0.04);
        f2.frequency.linearRampToValueAtTime(900 + r() * 1300, t + 0.05);
        src.frequency.linearRampToValueAtTime(f0 * (0.85 + r() * 0.35), t + d);
        amp.gain.linearRampToValueAtTime(level * (0.6 + r() * 0.4), t + 0.03);
        amp.gain.linearRampToValueAtTime(level * 0.15, t + d);
        t += d;
      }
      amp.gain.linearRampToValueAtTime(0, t + 0.08);
      t += 0.4 + r() * 2.2;
    }
  }
  // spoons and cups
  const clinks = Math.round(voices * 0.6);
  for (let i = 0; i < clinks; i++) bell(ctx, lp, r() * CROWD_SEC, 2200 + r() * 1800, 0.012 + r() * 0.012, 0.25);
  const rendered = await ctx.startRendering();
  return normalize(foldTail(ctx, rendered, loopLen), targetRms);
}
