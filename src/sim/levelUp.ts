/*
 * Gear Tree G6 (doc §6): drinks level up with use. A Gear run counts every drink served this run;
 * hitting a count learns the next drink for good, puts it on the menu at once and logs an "unlocked!"
 * line (toasted like a gear quirk) plus a note for the next morning. Classic runs never count or learn.
 * Built so far: 12 espressos → Americano (E2+, not pods), 12 lattes → Cappuccino, 10 espressos + 10 cold brews → Iced latte,
 * 25 lattes → Mocha (G6b: Gear runs skip the classic day-3/day-5 unlocks). G6c: 30 espressos → Doppio (E3+),
 * 15 cold brews → Sweet cream, 12 drips → Café au lait (a steam wand, FB2 C9), 20 drips → Red-eye (E2+). No RNG; old saves start at zero.
 */
import type { DrinkId, GameState } from './types';
import { emitLog } from './log';
import { unlockDrink } from './unlocks';
import { GEAR, type GearTree } from '../data/gear';

export interface LevelUp {
  from: DrinkId; count: number; unlocks: DrinkId; text: string;
  /** A second drink that must also hit its count (iced latte). */ also?: { from: DrinkId; count: number };
  /** G6c: gear the crew must own to learn it (best tier in that tree at least this; FB2 C9 `wand`: a steam wand on an espresso machine). */
  needs?: { tree: GearTree; tier: number; label: string } | { wand: true; label: string };
}

export const LEVEL_UPS: LevelUp[] = [
  { from: 'espresso', count: 12, unlocks: 'americano', needs: { tree: 'espresso', tier: 2, label: 'a real espresso machine' }, text: "You've pulled 12 shots. Somebody asked for it watered down: Americano unlocked! (Espresso in hand at the espresso machine.)" },
  { from: 'latte', count: 12, unlocks: 'cappuccino', text: "12 lattes out the door. A regular wants more foam: Cappuccino unlocked! (Latte in hand at the steam wand again.)" },
  // G6b: these replace the classic day-3 / day-5 unlocks in Gear runs.
  { from: 'espresso', count: 10, also: { from: 'coldBrew', count: 10 }, unlocks: 'icedLatte', text: '10 shots and 10 cold brews: someone wants both in one cup. Iced latte unlocked!' },
  { from: 'latte', count: 25, unlocks: 'mocha', text: '25 lattes! A kid points at the cocoa tin: Mocha unlocked! (Latte in hand at the steam wand, needs flavours.)' },
  // G6c: the rest of doc §6.
  { from: 'espresso', count: 30, unlocks: 'doppio', needs: { tree: 'espresso', tier: 3, label: 'a Sylvia or better' }, text: '30 shots! A regular wants two in one cup: Doppio unlocked! (Espresso in hand at the espresso machine.)' },
  { from: 'coldBrew', count: 15, unlocks: 'sweetCream', text: '15 cold brews. Someone asks for "the creamy one": Sweet-cream cold brew unlocked! (Pour a cold brew, then add the cream.)' },
  { from: 'drip', count: 12, unlocks: 'cafeAuLait', needs: { wand: true, label: 'a steam wand' }, text: '12 drips poured. A visitor from Montréal asks for milk in it: Café au lait unlocked! (Drip in hand at the steam wand.)' },
  { from: 'drip', count: 20, unlocks: 'redEye', needs: { tree: 'espresso', tier: 2, label: 'a real espresso machine' }, text: '20 drips! A tired nurse wants a shot in hers: Red-eye unlocked! (Drip in hand at the espresso machine.)' },
];

/** G6c: does the crew own the gear a level-up needs? */
export function levelUpGearOk(state: GameState, l: LevelUp): boolean {
  const n = l.needs;
  if (!n) return true;
  // FB2 C9: a steam wand on an espresso machine (an add-on or built in) is the only way to steam milk.
  if ('wand' in n) return state.stations.some((s) => s.kind === 'steamer' && s.wand !== undefined);
  return (state.slotGear ?? []).some((id) => id && GEAR[id].tree === n.tree && GEAR[id].tier >= n.tier);
}

const reached = (state: GameState, l: LevelUp): boolean =>
  (state.gearServed?.[l.from] ?? 0) >= l.count && (!l.also || (state.gearServed?.[l.also.from] ?? 0) >= l.also.count) && levelUpGearOk(state, l);

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
