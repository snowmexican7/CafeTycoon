import { ESPRESSO } from '../sim/espresso';
import type { Player } from '../sim/types';
import { sy, sx } from './theme';

/**
 * Pure timing/pose math for the espresso Easter egg's visuals (no Pixi here, so it is unit-tested).
 * Everything is derived from the sim's `Player.espresso` plus seconds since the fall, so every
 * client plays the same gag in sync.
 */

/** Where the ambulance parks: in the street strip below the floor, by the door. */
export const CURB_Y = sy(8) + 44;
export const PARK_X = sx(1.9);
const OFFSCREEN_X = -230;

/** Gag timings (s since the fall), from the sim's collapse timeline so the wheel-out lines up. */
export const T = {
  fall: ESPRESSO.collapse.fall,
  arrive: ESPRESSO.collapse.ambulanceArrives,
  reach: ESPRESSO.collapse.medicsReach,
  load: ESPRESSO.collapse.medicsReach + 0.6,
  back: ESPRESSO.collapse.wheeledOut - 1.2,
  gone: ESPRESSO.collapse.wheeledOut + 1.4,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeIn = (k: number) => k * k;

export interface CollapsePose {
  /** The barista's body: position (feet), rotation, and whether to draw it at all. */
  body: { x: number; y: number; rot: number; visible: boolean };
  /** Palpitation hearts over the head (0 = none). */
  hearts: number;
  /** Ambulance centre x (null = not on screen) and whether its lights flash. */
  ambulance: { x: number; lights: boolean } | null;
  /** Paramedics carrying the stretcher (centre of the stretcher), or null. */
  stretcher: { x: number; y: number; loaded: boolean } | null;
}

/** The collapse gag at `age` seconds after the fall, for a barista who fell at screen (fx, fy). */
export function collapsePose(age: number, fx: number, fy: number): CollapsePose {
  const fallK = clamp01(age / T.fall);
  // tips over with a little bounce at the end
  const tip = fallK < 0.8 ? easeIn(fallK / 0.8) : 1 + Math.sin(((fallK - 0.8) / 0.2) * Math.PI) * 0.08;
  const body = { x: fx, y: fy, rot: (-Math.PI / 2) * tip, visible: age < T.back };

  let ambulance: CollapsePose['ambulance'] = null;
  if (age >= T.fall && age < T.gone) {
    let x = PARK_X;
    if (age < T.arrive) x = lerp(OFFSCREEN_X, PARK_X, easeOut((age - T.fall) / (T.arrive - T.fall)));
    else if (age >= T.back) x = lerp(PARK_X, OFFSCREEN_X, easeIn((age - T.back) / (T.gone - T.back)));
    ambulance = { x, lights: true };
  }

  const door = { x: PARK_X + 10, y: CURB_Y - 34 };
  const at = { x: fx + 6, y: fy + 4 };
  let stretcher: CollapsePose['stretcher'] = null;
  if (age >= T.arrive && age < T.reach) {
    const k = (age - T.arrive) / (T.reach - T.arrive);
    stretcher = { x: lerp(door.x, at.x, k), y: lerp(door.y, at.y, k), loaded: false };
  } else if (age >= T.reach && age < T.load) {
    stretcher = { ...at, loaded: false };
  } else if (age >= T.load && age < T.back) {
    const k = (age - T.load) / (T.back - T.load);
    stretcher = { x: lerp(at.x, door.x, k), y: lerp(at.y, door.y, k), loaded: true };
  }
  if (stretcher?.loaded) {
    body.x = stretcher.x - 34;
    body.y = stretcher.y - 16;
    body.rot = Math.PI / 2;
  }
  return { body, hearts: age < T.load ? 3 : 0, ambulance, stretcher };
}

/** How hard the boosted barista vibrates (px) at this many shots today. */
export function jitterPx(shots: number): number {
  return [0, 0, 0.4, 1, 2, 3.2][Math.min(5, shots)] ?? 0;
}

/** How much the local screen shakes (px): from the 4th shot, plus a jolt when they hit the floor. */
export function shakePx(me: Player | undefined, collapseAge: number | null): number {
  if (collapseAge !== null && collapseAge >= T.fall * 0.8 && collapseAge < T.fall + 0.4) return 6;
  const e = me?.espresso;
  if (!e || e.out || e.boostTicksLeft <= 0) return 0;
  return e.shots >= 5 ? 2.6 : e.shots >= 4 ? 1.2 : 0;
}

