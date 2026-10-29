import type { DrinkId } from '../sim/types';

/**
 * Daily optional goals (B7). Pure data: the sim deals 1–2 per day from the seed, tracks progress,
 * and pays a small tip + cheer when one is met by closing.
 */
export type ChallengeKind =
  | { kind: 'perfect'; need: number }
  | { kind: 'floor'; min: number }
  | { kind: 'noStorms' }
  | { kind: 'sellDrink'; drink: DrinkId; need: number }
  | { kind: 'beforeGrace' }
  | { kind: 'noSpills' }
  | { kind: 'serve'; need: number }
  | { kind: 'serveInfluencer' };

export interface ChallengeDef {
  id: string;
  /** Short label for the HUD chip. */
  label: string;
  /** One line for the paper / morning note. */
  blurb: string;
  goal: ChallengeKind;
  /** Cash tip paid at closing if met. */
  reward: number;
  /** Day of the scored week (1–7) the challenge is first eligible; later days keep it. */
  fromDay: number;
  /** Skip when the needed drink is not yet unlocked. */
  needsDrink?: DrinkId;
  /** Only when an influencer is scheduled today. */
  needsInfluencer?: boolean;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'perfect4', label: '4 perfect serves', blurb: 'Serve 4 drinks with the customer still smiling (plenty of patience left).', goal: { kind: 'perfect', need: 4 }, reward: 8, fromDay: 1 },
  { id: 'perfect8', label: '8 perfect serves', blurb: 'Serve 8 drinks with plenty of patience left. A tight crew can do it.', goal: { kind: 'perfect', need: 8 }, reward: 14, fromDay: 4 },
  { id: 'floor80', label: 'Floor above 80%', blurb: 'Keep the floor above 80% clean all day. Grab the mop early.', goal: { kind: 'floor', min: 80 }, reward: 10, fromDay: 2 },
  { id: 'floor90', label: 'Floor above 90%', blurb: 'Keep the floor above 90% clean all day. Spotless is the vibe.', goal: { kind: 'floor', min: 90 }, reward: 14, fromDay: 5 },
  { id: 'noStorms', label: 'No storm-outs', blurb: 'Nobody storms out today. Watch the tickets and the queue.', goal: { kind: 'noStorms' }, reward: 12, fromDay: 1 },
  { id: 'noSpills', label: 'No spills', blurb: 'Not a single drink wasted (spilled or stale). Steady hands.', goal: { kind: 'noSpills' }, reward: 10, fromDay: 2 },
  { id: 'serve10', label: 'Serve 10', blurb: 'Serve 10 customers today. Keep the line moving.', goal: { kind: 'serve', need: 10 }, reward: 8, fromDay: 1 },
  { id: 'serve16', label: 'Serve 16', blurb: 'Serve 16 customers today. A busy-day stretch goal.', goal: { kind: 'serve', need: 16 }, reward: 14, fromDay: 5 },
  { id: 'beforeGrace', label: 'Clear before close', blurb: 'Have the shop empty when the doors lock — no one left in the closing grace.', goal: { kind: 'beforeGrace' }, reward: 12, fromDay: 3 },
  { id: 'sellMatcha5', label: 'Sell 5 matchas', blurb: 'Sell 5 matcha lattes. Whisk, steam, smile.', goal: { kind: 'sellDrink', drink: 'matcha', need: 5 }, reward: 12, fromDay: 3, needsDrink: 'matcha' },
  { id: 'sellMocha4', label: 'Sell 4 mochas', blurb: 'Sell 4 mochas. The cocoa tin earns its keep.', goal: { kind: 'sellDrink', drink: 'mocha', need: 4 }, reward: 12, fromDay: 4, needsDrink: 'mocha' },
  { id: 'sellIced6', label: 'Sell 6 iced lattes', blurb: 'Sell 6 iced lattes. Shot over cold milk, keep going.', goal: { kind: 'sellDrink', drink: 'icedLatte', need: 6 }, reward: 10, fromDay: 3, needsDrink: 'icedLatte' },
  { id: 'sellCold8', label: 'Sell 8 cold brews', blurb: 'Sell 8 cold brews. The tap is your friend.', goal: { kind: 'sellDrink', drink: 'coldBrew', need: 8 }, reward: 10, fromDay: 2 },
  { id: 'sellSpecial3', label: 'Sell 3 specials', blurb: 'Sell 3 maple cold foams. The seasonal board wants a workout.', goal: { kind: 'sellDrink', drink: 'special', need: 3 }, reward: 14, fromDay: 5, needsDrink: 'special' },
  { id: 'influencer', label: 'Serve the influencer', blurb: 'Serve the influencer before they leave. Smile for the camera.', goal: { kind: 'serveInfluencer' }, reward: 15, fromDay: 2, needsInfluencer: true },
];

export const challengeById = Object.fromEntries(CHALLENGES.map((c) => [c.id, c])) as Record<string, ChallengeDef>;

/**
 * Soft pressure by day-of-week (1–7). Day 1 is a warm-up; day 7 is the finale.
 * Multiplies traffic and patience on top of the existing weekRamp; eventBias shifts the
 * 0/1/2-event schedule weights toward more events on later days.
 */
export const DAY_CURVE: ReadonlyArray<{ traffic: number; patience: number; eventBias: number }> = [
  { traffic: 0.88, patience: 1.12, eventBias: -0.12 }, // Mon / day 1
  { traffic: 0.94, patience: 1.06, eventBias: -0.06 }, // Tue
  { traffic: 1.0, patience: 1.0, eventBias: 0 }, // Wed
  { traffic: 1.05, patience: 0.96, eventBias: 0.06 }, // Thu
  { traffic: 1.1, patience: 0.92, eventBias: 0.1 }, // Fri
  { traffic: 1.16, patience: 0.88, eventBias: 0.16 }, // Sat
  { traffic: 1.3, patience: 0.8, eventBias: 0.22 }, // Sun / day 7 finale
];

/** Day-of-week index 0..6 for a 1-based day number (repeats in unlimited mode). */
export function dayOfWeekIndex(day: number): number {
  return ((day - 1) % DAY_CURVE.length + DAY_CURVE.length) % DAY_CURVE.length;
}

export function dayCurveFor(day: number): (typeof DAY_CURVE)[number] {
  return DAY_CURVE[dayOfWeekIndex(day)]!;
}
