import type { CueId } from './cues';
import * as synth from './synth';

/** CC0 samples shipped in public/audio/sfx (see public/audio/CREDITS.md). */
export const SAMPLES = [
  'click',
  'cup1',
  'cup2',
  'clink',
  'trash',
  'box',
  'coins1',
  'coins2',
  'doorSlam',
  'doorOpen',
  'dayStart',
  'dayEnd',
  'weekEnd',
  'rush',
  'inspector',
  'influencer',
  'pass',
  'fail',
] as const;
export type SampleId = (typeof SAMPLES)[number];

export type SynthId = keyof typeof synth;

/** One layer of a sound: a sample or a procedural synth, with its level and offset. */
export type Layer =
  | { sample: SampleId | SampleId[]; gain: number; delay?: number; rate?: [number, number] }
  | { synth: SynthId; gain: number; delay?: number };

/**
 * What each cue sounds like. A cue is one or more layers; an array of samples picks one at random,
 * and `rate` detunes it a little so repeats don't sound machine-gunned.
 */
export const RECIPES: Record<CueId, Layer[]> = {
  grinder: [{ synth: 'grinder', gain: 1 }],
  espresso: [{ synth: 'espresso', gain: 1 }],
  steam: [{ synth: 'steam', gain: 1 }],
  pour: [{ synth: 'pour', gain: 1 }],
  stationReady: [{ synth: 'ready', gain: 1 }],
  cupDown: [{ sample: ['cup1', 'cup2'], gain: 0.55, rate: [0.92, 1.08] }],
  pickUp: [{ sample: 'clink', gain: 0.35, rate: [0.95, 1.1] }],
  serve: [
    { sample: ['cup1', 'cup2'], gain: 0.5, rate: [0.95, 1.05] },
    { sample: ['coins1', 'coins2'], gain: 0.4, delay: 0.12, rate: [0.97, 1.05] },
    { synth: 'ching', gain: 1, delay: 0.1 },
  ],
  doorBell: [{ synth: 'doorBell', gain: 1 }],
  stormOut: [
    { synth: 'hmph', gain: 1 },
    { sample: 'doorSlam', gain: 0.6, delay: 0.35, rate: [0.95, 1.02] },
  ],
  turnedAway: [{ sample: 'doorOpen', gain: 0.35, rate: [0.9, 1] }],
  trash: [{ sample: 'trash', gain: 0.45, rate: [0.9, 1.05] }],
  botOops: [
    { sample: 'clink', gain: 0.35, rate: [0.7, 0.75] },
    { synth: 'oops', gain: 1, delay: 0.05 },
  ],
  buy: [{ sample: 'coins2', gain: 0.45, rate: [0.97, 1.05] }],
  restock: [{ sample: 'box', gain: 0.55, rate: [0.95, 1.05] }],
  dayStart: [
    { synth: 'doorBell', gain: 0.8 },
    { sample: 'dayStart', gain: 0.5, delay: 0.25 },
  ],
  dayEnd: [{ sample: 'dayEnd', gain: 0.5 }],
  weekEnd: [{ sample: 'weekEnd', gain: 0.5 }],
  gameOver: [{ sample: 'fail', gain: 0.5 }],
  rushHour: [{ sample: 'rush', gain: 0.5 }],
  powerFlicker: [{ synth: 'flicker', gain: 1 }],
  inspector: [{ sample: 'inspector', gain: 0.5 }],
  influencer: [
    { synth: 'shutter', gain: 0.8 },
    { sample: 'influencer', gain: 0.45, delay: 0.4 },
  ],
  inspectPass: [{ sample: 'pass', gain: 0.5 }],
  inspectFail: [{ sample: 'fail', gain: 0.45 }],
  influencerServed: [
    { sample: 'coins1', gain: 0.4 },
    { synth: 'sparkle', gain: 1, delay: 0.08 },
  ],
  gulp: [{ synth: 'gulp', gain: 1 }],
  heartbeat: [{ synth: 'heartbeat', gain: 1 }],
  collapse: [
    { synth: 'faint', gain: 1 },
    { synth: 'siren', gain: 1, delay: 0.9 },
  ],
  click: [{ sample: 'click', gain: 0.3, rate: [0.97, 1.03] }],
};

/** Seconds a cue will sound for, used to hold its voice slot in the gate. */
export function cueSeconds(id: CueId, dur = 0): number {
  if (id === 'grinder' || id === 'espresso' || id === 'steam' || id === 'pour') return Math.max(0.6, dur) + 0.4;
  if (id === 'collapse') return 9;
  if (id === 'heartbeat') return 0.35;
  if (id === 'click' || id === 'pickUp' || id === 'cupDown') return 0.25;
  if (['dayStart', 'dayEnd', 'weekEnd', 'gameOver', 'rushHour', 'inspector', 'influencer', 'inspectPass', 'inspectFail'].includes(id)) return 2.5;
  return 1;
}
