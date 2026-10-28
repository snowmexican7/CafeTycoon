/**
 * mulberry32: a tiny seeded generator whose whole state is one uint32,
 * so it can live inside the plain GameState object.
 */

/** Initial generator state for a seed (coerced to uint32). */
export function seedRng(seed: number): number {
  return seed >>> 0;
}

/** Advance the generator stored on `state.rng` and return a float in [0, 1). */
export function rngNext(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, maxExclusive). */
export function rngInt(state: { rng: number }, maxExclusive: number): number {
  return Math.floor(rngNext(state) * maxExclusive);
}
