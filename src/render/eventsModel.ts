import type { Vec2 } from '../sim/types';

/**
 * Pure timing and paths for the event visuals (power flicker, inspector patrol, influencer flashes).
 * No Pixi, so it is unit-tested; src/render/layers/events.ts draws from it.
 */

/** Cheap stable noise in 0..1 for an integer. */
function noise(n: number): number {
  const h = Math.imul((n | 0) ^ 0x5bd1e995, 2654435761) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * How dark the room is during a power flicker, 0 (lights on) to ~0.62, at `t` seconds into it.
 * The lights stutter for the first half second, then sag with brief blinks back on.
 */
export function flickerDarkness(t: number): number {
  if (t < 0) return 0;
  const frame = Math.floor(t * 14);
  if (t < 0.5) return noise(frame) > 0.45 ? 0.6 : 0.1;
  const blink = noise(frame + 1000) > 0.9;
  return blink ? 0.18 : 0.5 + noise(frame + 2000) * 0.12;
}

/** The influencer's camera flash: on for a few frames every 1.6 s (plus a double-tap now and then). */
export function flashOn(t: number): boolean {
  const cycle = t % 1.6;
  if (cycle < 0.07) return true;
  return Math.floor(t / 1.6) % 3 === 1 && cycle > 0.16 && cycle < 0.22;
}

/** The inspector's loop around the work floor, in tile coordinates. */
export const PATROL: Vec2[] = [
  { x: 2, y: 3.2 },
  { x: 4.5, y: 2.5 },
  { x: 7.5, y: 2.5 },
  { x: 10, y: 3.4 },
  { x: 8.5, y: 4.9 },
  { x: 4, y: 4.9 },
];
const WALK = 1.1; // tiles per second
const PAUSE = 1.4; // seconds at each stop

/** Where the inspector is `t` seconds into their visit, and whether they are stopped to take notes. */
export function patrolAt(t: number): { pos: Vec2; stopped: boolean; stop: number; dir: Vec2 } {
  const legs = PATROL.map((a, i) => {
    const b = PATROL[(i + 1) % PATROL.length];
    return { a, b, len: Math.hypot(b.x - a.x, b.y - a.y) };
  });
  const lap = legs.reduce((n, l) => n + PAUSE + l.len / WALK, 0);
  let r = ((t % lap) + lap) % lap;
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    if (r < PAUSE) return { pos: { ...l.a }, stopped: true, stop: i, dir: { x: 0, y: 1 } };
    r -= PAUSE;
    const walk = l.len / WALK;
    if (r < walk) {
      const k = r / walk;
      return { pos: { x: l.a.x + (l.b.x - l.a.x) * k, y: l.a.y + (l.b.y - l.a.y) * k }, stopped: false, stop: i, dir: { x: (l.b.x - l.a.x) / l.len, y: (l.b.y - l.a.y) / l.len } };
    }
    r -= walk;
  }
  return { pos: { ...PATROL[0] }, stopped: true, stop: 0, dir: { x: 0, y: 1 } };
}

const MUTTERS = ['Hmm.', 'Noted.', 'Is that\u2026 a crumb?', 'Mm-hm.', 'Interesting.', 'Clean grinder. Good.'];

/** What the inspector mutters at a stop: a tut at a nearby mess, otherwise a rotating remark. */
export function inspectorLine(stop: number, lap: number, nearMess: boolean): string {
  if (nearMess) return 'Tsk tsk.';
  return MUTTERS[(stop + lap * 2) % MUTTERS.length];
}
