import { DRINK_IDS } from '../data/drinks';
import type { DayStats, DrinkId } from './types';

/** A zero count for every drink. */
export function zeroDrinks(): Record<DrinkId, number> {
  return Object.fromEntries(DRINK_IDS.map((d) => [d, 0])) as Record<DrinkId, number>;
}

export type TallyKey = 'wasted' | 'fines' | 'bonus' | 'botMistakes' | 'lostRegulars' | 'rogues' | 'slips' | 'soldOutWalkouts';

export function tally(today: DayStats, key: TallyKey, by = 1): void {
  today[key] = (today[key] ?? 0) + by;
}

export function tallyDrink(today: DayStats, drink: DrinkId): void {
  const drinks = (today.drinks ??= zeroDrinks());
  drinks[drink] = (drinks[drink] ?? 0) + 1;
}
