/**
 * A car sometimes stops and the driver comes in. Kennedy, 2026-11-09: this is an extra customer
 * on top of walk-ins, an occasional quirk, not a second rush. The exact rate is this constant.
 *
 * The roll is a hash of the run seed and the tick. It does not call `rngNext`, so the walk-in
 * dice stay exactly as they were. There is no `Customer` field and no protocol change: both
 * peers already share `seed` and `tick`, and the person is an ordinary customer once they join.
 */

/**
 * How many ticks, on average, between one extra customer. 9000 ticks is about once per
 * 150-second day (a week notices it; a single day does not become a second rush).
 * Set to 0 to turn the quirk off.
 */
export const DRIVE_UP_EVERY = 9000;

/** Unsigned mix of three ints. Same on every machine. No allocations. */
export function streetHash(a: number, b: number, c = 0): number {
  let x = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1) ^ Math.imul(c | 0, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** True on the ticks a car would stop, before the queue check. `every` defaults to `DRIVE_UP_EVERY`. */
export function driveUpThisTick(seed: number, tick: number, every: number = DRIVE_UP_EVERY): boolean {
  if (every <= 0 || tick < 0) return false;
  return streetHash(seed, tick, 1) % every === 0;
}
