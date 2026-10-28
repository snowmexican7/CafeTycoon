import type { DayStats, DrinkId } from './types';

export type TallyKey = 'wasted' | 'fines' | 'bonus' | 'botMistakes' | 'lostRegulars';

export function tally(today: DayStats, key: TallyKey, by = 1): void {
  today[key] = (today[key] ?? 0) + by;
}

export function tallyDrink(today: DayStats, drink: DrinkId): void {
  const drinks = (today.drinks ??= { espresso: 0, latte: 0, coldBrew: 0 });
  drinks[drink] += 1;
}
