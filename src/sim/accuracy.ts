import type { DayStats, GameState, Player, Station } from './types';

/**
 * P3 B5: recipe accuracy. Each cup carries sloppy marks from the hands and machines it passes
 * through, and is served at 3 stars minus its marks:
 *  - pulled early: taking a drink off a machine in the last stretch of its run (saves seconds);
 *  - left sitting: picking a finished drink up after it waited on the machine too long;
 *  - fumbled: offering the cup to a station that has no step for it (wrong order).
 * Stars scale the tip, and the day's average nudges the rating at closing. Deterministic: no RNG.
 */
export const ACCURACY = {
  maxStars: 3,
  /** Share of a machine run, at the end, in which the drink can be pulled early. */
  earlyShare: 0.4,
  /** Seconds a finished drink can wait on the machine before it counts as left sitting. */
  sitSeconds: 8,
  /** Tip multiplier by stars (index = stars). */
  tip: [0.6, 0.8, 0.95, 1.05],
  /** Rating change per star the day's average sits below a perfect 3. */
  repPerStar: 0.15,
};

export function starsFor(slips: number): number {
  return Math.max(0, ACCURACY.maxStars - Math.max(0, Math.floor(slips)));
}

export function accuracyTip(stars: number): number {
  return ACCURACY.tip[Math.max(0, Math.min(ACCURACY.maxStars, stars))] ?? 1;
}

/** One sloppy mark on the cup in a barista's hands. */
export function markCup(p: Player): void {
  p.cupSlips = Math.min(ACCURACY.maxStars, (p.cupSlips ?? 0) + 1);
}

/** The cup goes into a machine: its marks go with it. */
export function cupIntoStation(p: Player, s: Station): void {
  if (p.cupSlips) s.cupSlips = p.cupSlips;
  else delete s.cupSlips;
  delete p.cupSlips;
  delete p.cupTemp;
  // FB2 B8: how the cup was hand-made goes with it.
  if (p.made) s.made = p.made;
  else delete s.made;
  delete p.made;
}

/** The cup comes out of a machine; marks it if it sat too long. `sitTicks` = sitSeconds in ticks. */
export function cupOutOfStation(state: GameState, p: Player, s: Station, sitTicks: number): void {
  let slips = s.cupSlips ?? 0;
  if (s.doneAt !== undefined && state.tick - s.doneAt > sitTicks) slips += 1;
  delete s.cupSlips;
  delete s.doneAt;
  if (slips > 0) p.cupSlips = Math.min(ACCURACY.maxStars, slips);
  else delete p.cupSlips;
  delete p.cupTemp;
  if (s.made) p.made = s.made;
  else delete p.made;
  delete s.made;
}

/** Note a served cup on today's record. */
export function noteCup(today: DayStats, stars: number): void {
  today.cups = (today.cups ?? 0) + 1;
  today.cupStars = (today.cupStars ?? 0) + stars;
  if (stars >= ACCURACY.maxStars) today.perfectCups = (today.perfectCups ?? 0) + 1;
}

/** The day's average stars, or null when no cup was scored. */
export function averageStars(today: DayStats): number | null {
  return today.cups ? today.cupStars! / today.cups : null;
}

/** Rating change at closing from the day's average stars (0 at a perfect 3, never a bonus). */
export function accuracyRating(today: DayStats): number {
  const avg = averageStars(today);
  if (avg === null) return 0;
  return -ACCURACY.repPerStar * (ACCURACY.maxStars - avg);
}
