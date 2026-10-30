/*
 * Gear Tree G6 (doc §6): drinks level up with use. A Gear run counts every drink served this run;
 * hitting a count learns the next drink for good, puts it on the menu at once and logs an "unlocked!"
 * line (toasted like a gear quirk) plus a note for the next morning. Classic runs never count or learn.
 * Built so far: 12 espressos → Americano, 12 lattes → Cappuccino. No RNG; old saves start at zero.
 */
import type { DrinkId, GameState } from './types';
import { emitLog } from './log';
import { unlockDrink } from './unlocks';

export interface LevelUp { from: DrinkId; count: number; unlocks: DrinkId; text: string }

export const LEVEL_UPS: LevelUp[] = [
  { from: 'espresso', count: 12, unlocks: 'americano', text: "You've pulled 12 shots. Somebody asked for it watered down: Americano unlocked! (Espresso in hand at the espresso machine.)" },
  { from: 'latte', count: 12, unlocks: 'cappuccino', text: "12 lattes out the door. A regular wants more foam: Cappuccino unlocked! (Latte in hand at the steamer again.)" },
];

/** Count a served drink and learn whatever it unlocks. Returns the drinks learned (usually none). */
export function levelUpOnServe(state: GameState, drink: DrinkId): DrinkId[] {
  if (state.gear !== true) return [];
  const served = (state.gearServed ??= {});
  served[drink] = (served[drink] ?? 0) + 1;
  const fresh: DrinkId[] = [];
  for (const l of LEVEL_UPS) {
    if (l.from !== drink || served[drink]! < l.count) continue;
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
