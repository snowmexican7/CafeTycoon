/*
 * Gear Tree G6 (doc §6): drinks level up with use. A Gear run counts every drink served this run;
 * hitting a count learns the next drink for good, puts it on the menu at once and logs an "unlocked!"
 * line (toasted like a gear quirk) plus a note for the next morning. Classic runs never count or learn.
 * Built so far: 12 espressos → Americano, 12 lattes → Cappuccino, 10 espressos + 10 cold brews → Iced latte,
 * 25 lattes → Mocha (G6b: Gear runs skip the classic day-3/day-5 unlocks). No RNG; old saves start at zero.
 */
import type { DrinkId, GameState } from './types';
import { emitLog } from './log';
import { unlockDrink } from './unlocks';

export interface LevelUp { from: DrinkId; count: number; unlocks: DrinkId; text: string; /** A second drink that must also hit its count (iced latte). */ also?: { from: DrinkId; count: number } }

export const LEVEL_UPS: LevelUp[] = [
  { from: 'espresso', count: 12, unlocks: 'americano', text: "You've pulled 12 shots. Somebody asked for it watered down: Americano unlocked! (Espresso in hand at the espresso machine.)" },
  { from: 'latte', count: 12, unlocks: 'cappuccino', text: "12 lattes out the door. A regular wants more foam: Cappuccino unlocked! (Latte in hand at the steamer again.)" },
  // G6b: these replace the classic day-3 / day-5 unlocks in Gear runs.
  { from: 'espresso', count: 10, also: { from: 'coldBrew', count: 10 }, unlocks: 'icedLatte', text: '10 shots and 10 cold brews: someone wants both in one cup. Iced latte unlocked!' },
  { from: 'latte', count: 25, unlocks: 'mocha', text: '25 lattes! A kid points at the cocoa tin: Mocha unlocked! (Latte in hand at the steamer, needs flavours.)' },
];

const reached = (state: GameState, l: LevelUp): boolean =>
  (state.gearServed?.[l.from] ?? 0) >= l.count && (!l.also || (state.gearServed?.[l.also.from] ?? 0) >= l.also.count);

/** Count a served drink and learn whatever it unlocks. Returns the drinks learned (usually none). */
export function levelUpOnServe(state: GameState, drink: DrinkId): DrinkId[] {
  if (state.gear !== true) return [];
  const served = (state.gearServed ??= {});
  served[drink] = (served[drink] ?? 0) + 1;
  const fresh: DrinkId[] = [];
  for (const l of LEVEL_UPS) {
    if ((l.from !== drink && l.also?.from !== drink) || !reached(state, l)) continue;
    if (!unlockDrink(state, l.unlocks)) continue;
    fresh.push(l.unlocks);
    emitLog(state, 'gear.quirk', { gear: '', text: `🎉 ${l.text}` });
    (state.gearLearned ??= []).push(l.text);
  }
  return fresh;
}

/** Progress toward each level-up not yet learned (for the night board). */
export function levelUpProgress(state: GameState): { from: DrinkId; unlocks: DrinkId; served: number; count: number }[] {
  if (state.gear !== true) return [];
  const known = state.unlocked ?? [];
  return LEVEL_UPS.filter((l) => !known.includes(l.unlocks)).map((l) => ({ from: l.from, unlocks: l.unlocks, served: Math.min(l.count, state.gearServed?.[l.from] ?? 0), count: l.count }));
}
