import { BASE_DRINKS, DRINK_IDS, dayUnlocks } from '../data/drinks';
import { ECONOMY } from '../data/economy';
import type { DrinkId, GameState, SupplyId } from './types';

export const SUPPLY_IDS: SupplyId[] = ['beans', 'milk', 'concentrate', 'flavour'];

const needsFlavour = (d: DrinkId) => ECONOMY.drinkSupplies[d].includes('flavour');

/**
 * Put a drink on the menu for good (no-op when already known). The first drink that needs flavours
 * brings a free starter pack, so the crew can try it the next morning. Returns whether it was new.
 */
export function unlockDrink(state: GameState, drink: DrinkId): boolean {
  const known = state.unlocked ?? [...BASE_DRINKS];
  if (known.includes(drink)) return false;
  if (needsFlavour(drink) && !known.some(needsFlavour)) state.supplies.flavour = (state.supplies.flavour ?? 0) + ECONOMY.flavourStarter;
  state.unlocked = DRINK_IDS.filter((d) => d === drink || known.includes(d));
  state.menu[drink] = true;
  return true;
}

/** Drinks whose unlock day is `state.day` and that were not already known: they join tonight. */
export function unlockForDay(state: GameState): DrinkId[] {
  const fresh: DrinkId[] = [];
  for (const d of dayUnlocks(state.day)) if (unlockDrink(state, d)) fresh.push(d);
  return fresh;
}

/** Drinks the café knows how to make (old saves without the field: the classics). */
export function unlockedDrinks(state: GameState): DrinkId[] {
  return state.unlocked ?? [...BASE_DRINKS];
}

/** Known drinks that are switched on tonight. */
export function menuDrinks(state: GameState): DrinkId[] {
  return unlockedDrinks(state).filter((d) => state.menu[d]);
}

/** Supplies the known drinks use, in pantry order (flavours only once a flavour drink is known). */
export function neededSupplies(state: GameState): SupplyId[] {
  const known = unlockedDrinks(state);
  return SUPPLY_IDS.filter((s) => s !== 'flavour' || known.some(needsFlavour) || (state.supplies.flavour ?? 0) > 0);
}
