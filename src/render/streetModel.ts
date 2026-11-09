import { LAYOUT } from '../data/layout';
import { driveUpThisTick, streetHash } from '../sim/driveUp';
import { TICK_RATE } from '../sim/constants';
import type { TierId } from '../sim/types';
import { T, CURB_Y, PARK_X } from './espressoPose';
import { SIDEWALK, TILE, sx, sy } from './theme';

/**
 * The street in front of the shop. Render-only: car position is a function of the run seed and
 * the tick, so a co-op guest draws the same cars as the host with no packet and no sim field.
 *
 * The road is its own band (`STREET_TOP` down to the bottom of `FRONT`). It is not part of the
 * stand's sidewalk or the cart's park. When the sidewalk scene (growth PR) reseats the small
 * shops, move `STREET_TOP` if that scene's kerb sits at a different height. Do not fold the
 * cars into `outdoor.ts`.
 *
 * Two lanes sit under the kerb, clear of the queue's feet and of the espresso-collapse ambulance
 * (`CURB_Y` / `PARK_X`). Passing cars leave that kerb clear while the gag is on screen.
 */

/** Top of the asphalt, just under the sidewalk the stand already paints. */
export const STREET_TOP = sy(LAYOUT.height) + SIDEWALK;

/** How tall a car is, from its wheels up to the roof. The lanes are placed from this. */
export const ROOF_PX = 30;

/** Wheel line of the lane nearer the shop (cars drive to the right). */
export const NEAR_LANE_Y = STREET_TOP + 46;
/** Wheel line of the far lane (cars drive to the left). */
export const FAR_LANE_Y = STREET_TOP + 80;

export const CAR_COUNT = 4;

/** Full diorama width. Cars cross the whole scene, including the unleased lot. */
export const STREET_WIDTH = LAYOUT.width * TILE;

/** Where a drive-up car waits. Clear of the ambulance bay at `PARK_X`. */
export const DRIVE_UP_PARK_X = sx(4.5);

/** How long a complaint bubble owns the sidewalk before cars may talk again. */
export const BUBBLE_QUIET_TICKS = 8 * 60;

const APPROACH = 45;
const HOLD = 90;
const LEAVE = 36;

const BODY = [0xe0564a, 0x4c8fd6, 0xf6c35b, 0xfffaf2, 0x7fcfb4, 0x8a6bbf, 0xe08a3c, 0x3a2418] as const;

/** Long line. */
const LONG = ['That line though', "I'll come back", 'Busy in there', 'What a queue'] as const;
/** Nobody waiting. */
const EMPTY = ['Nobody in line', 'Walk right in', 'Quiet little shop', 'Easy morning'] as const;
/** Reputation at 4 or better. */
const GOOD = ['Smells good', "Heard it's good", 'They know coffee', 'Love that smell'] as const;
/** Reputation under 2. */
const POOR = ['Maybe next time', 'Looks sleepy', 'Not their day'] as const;
/** The shop is still a cart. */
const CART = ['Is that a café yet?', 'Cute little cart', 'Coffee from a cart'] as const;
/** Sidewalk stall. */
const STAND = ['Sidewalk coffee', 'Smells like coffee', 'Nice little stall'] as const;
/** Indoors, nothing louder to say. */
const CAFE = ['Smells good', 'Love that smell', 'Fresh coffee', 'Nice little café'] as const;

/** Every line a car can say. Tests check these stay short, plain, and free of "tap". */
export const STREET_LINES = [LONG, EMPTY, GOOD, POOR, CART, STAND, CAFE] as const;

export interface StreetCar {
  x: number;
  y: number;
  /** 1 while this car is held at the kerb for a drive-up. */
  parked: number;
  /** A comment, or '' when this car is quiet. At most one car talks. */
  say: string;
}

export interface StreetRead {
  seed: number;
  tick: number;
  day: number;
  night: boolean;
  /** People in the order line (`customers.length`). */
  queue: number;
  reputation: number;
  tier: TierId;
  /** The line just complained ("Line's too long!"). Cars stay quiet. */
  complained: boolean;
  /** The espresso ambulance is in the kerb bay. Cars leave that stretch clear. */
  curbBusy: boolean;
  width: number;
}

export function blankCars(): StreetCar[] {
  const out: StreetCar[] = [];
  for (let i = 0; i < CAR_COUNT; i++) out.push({ x: 0, y: 0, parked: 0, say: '' });
  return out;
}

/** Stable paint of car `index` for this seed: lane, facing, hatch or van, body colour. */
export function carStyle(seed: number, index: number): { lane: 0 | 1; dir: 1 | -1; kind: 0 | 1; color: number } {
  const lane = (index % 2) as 0 | 1;
  return {
    lane,
    dir: lane === 0 ? 1 : -1,
    kind: streetHash(seed, index + 1, 13) % 5 === 0 ? 1 : 0,
    color: BODY[streetHash(seed, index + 1, 14) % BODY.length]!,
  };
}

/** The line is already saying "Line's too long!". */
export function lineIsShouting(tick: number, complainedAt: number | undefined): boolean {
  return complainedAt != null && tick - complainedAt >= 0 && tick - complainedAt < BUBBLE_QUIET_TICKS;
}

/** True while the collapse gag's ambulance is parked at the kerb. */
export function ambulanceOnKerb(players: readonly { espresso?: { collapsedAt?: number | null } | null }[], tick: number): boolean {
  for (let i = 0; i < players.length; i++) {
    const at = players[i]!.espresso?.collapsedAt;
    if (at == null) continue;
    const age = (tick - at) / TICK_RATE;
    if (age >= T.fall && age < T.gone) return true;
  }
  return false;
}

/**
 * Where a brand-new customer stands on the frame they appear, if this tick's car stopped
 * and they are the newest person. Null means the usual spot beside the queue. The walk
 * from here to the line is the renderer's existing slide; it is not a sim path.
 */
export function driveUpOrigin(seed: number, tick: number, id: number, newest: number, curbBusy: boolean): { x: number; y: number } | null {
  if (curbBusy || id !== newest || newest < 0) return null;
  if (!driveUpThisTick(seed, tick)) return null;
  return { x: DRIVE_UP_PARK_X + 48, y: STREET_TOP - 8 };
}

function linesOf(r: StreetRead, h: number): string {
  const long = r.queue >= 4;
  const good = r.reputation >= 4;
  const poor = r.reputation < 2;
  const cart = r.tier === 'cart';
  const empty = r.queue === 0;
  const stand = r.tier === 'stand';
  const cafe = !cart && !stand;
  let n = (long ? 1 : 0) + (good ? 1 : 0) + (poor ? 1 : 0) + (cart ? 1 : 0) + (empty ? 1 : 0);
  if (!long && !empty && stand) n += 1;
  if (!long && !empty && cafe) n += 1;
  if (n === 0) return CAFE[h % CAFE.length]!;
  let k = h % n;
  if (long) {
    if (k === 0) return LONG[h % LONG.length]!;
    k -= 1;
  }
  if (good) {
    if (k === 0) return GOOD[h % GOOD.length]!;
    k -= 1;
  }
  if (poor) {
    if (k === 0) return POOR[h % POOR.length]!;
    k -= 1;
  }
  if (cart) {
    if (k === 0) return CART[h % CART.length]!;
    k -= 1;
  }
  if (empty) {
    if (k === 0) return EMPTY[h % EMPTY.length]!;
    k -= 1;
  }
  if (stand) return STAND[h % STAND.length]!;
  return CAFE[h % CAFE.length]!;
}

/**
 * Write the four cars for this tick into `cars` (no allocations). One bubble at a time,
 * a couple of seconds, never at night and never while the queue is already complaining.
 */
export function fillStreet(cars: StreetCar[], r: StreetRead): void {
  const motion = r.night ? r.tick >> 1 : r.tick;
  const span = r.width + 160;
  let driveTick = -1;
  if (!r.curbBusy) {
    const from = r.tick - (HOLD + LEAVE);
    const to = r.tick + APPROACH;
    for (let t = from; t <= to; t++) {
      if (t < 0 || !driveUpThisTick(r.seed, t)) continue;
      if (r.tick >= t - APPROACH && r.tick <= t + HOLD + LEAVE) {
        driveTick = t;
        break;
      }
    }
  }
  const parkIndex = driveTick < 0 ? -1 : (streetHash(r.seed, driveTick, 2) % 2) * 2;
  const window = Math.floor(r.tick / 240);
  const talk = !r.night && !r.complained && streetHash(r.seed, r.day, window) % 4 === 0;
  const showFrom = window * 240 + 40;
  const talking = talk && r.tick >= showFrom && r.tick < showFrom + 130;
  const speaker = talking ? streetHash(r.seed, r.day, window + 9) % CAR_COUNT : -1;
  const line = talking ? linesOf(r, streetHash(r.seed, r.day, window + 3)) : '';

  for (let i = 0; i < CAR_COUNT; i++) {
    const lane = i % 2;
    const dir = lane === 0 ? 1 : -1;
    const period = 380 + (streetHash(r.seed, i + 1, 4) % 220);
    const phase = streetHash(r.seed, i + 1, 5) % period;
    const u = ((motion + phase) % period) / period;
    let x = dir === 1 ? -80 + u * span : r.width + 80 - u * span;
    let y = lane === 0 ? NEAR_LANE_Y : FAR_LANE_Y;
    let parked = 0;
    if (i === parkIndex && driveTick >= 0) {
      const start = driveTick - APPROACH;
      const held = driveTick + HOLD;
      let f = 1;
      if (r.tick < driveTick) f = (r.tick - start) / APPROACH;
      else if (r.tick > held) f = 1 - (r.tick - held) / LEAVE;
      if (f < 0) f = 0;
      else if (f > 1) f = 1;
      x = x + (DRIVE_UP_PARK_X - x) * f;
      y = NEAR_LANE_Y;
      if (r.tick >= driveTick && r.tick <= held) parked = 1;
    } else if (r.curbBusy && lane === 0) {
      const left = PARK_X - 110;
      const right = PARK_X + 110;
      if (x > left && x < right) x = x < PARK_X ? left : right;
    }
    const car = cars[i]!;
    car.x = x;
    car.y = y;
    car.parked = parked;
    car.say = i === speaker && x > 48 && x < r.width - 48 ? line : '';
  }
}

/** A tick in the day phase where a car on screen is talking, and nobody is pulling over. -1 if none. */
export function tickWithBubble(r: StreetRead, cars: StreetCar[], limit = 20000): number {
  const seed = r.seed;
  for (let t = 0; t < limit; t++) {
    if (driveUpThisTick(seed, t)) continue;
    r.tick = t;
    fillStreet(cars, r);
    for (let i = 0; i < cars.length; i++) if (cars[i]!.say) return t;
  }
  return -1;
}
