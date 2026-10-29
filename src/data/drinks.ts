import type { DrinkId } from '../sim/types';

/** Every drink, in menu order. Hot or iced decides how weather and forecasts tilt orders. */
export const DRINK_IDS: DrinkId[] = ['espresso', 'latte', 'coldBrew'];

export type DrinkTemp = 'hot' | 'iced';
export const DRINK_TEMP: Record<DrinkId, DrinkTemp> = { espresso: 'hot', latte: 'hot', coldBrew: 'iced' };
