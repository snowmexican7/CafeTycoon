/*
 * Round 3 item 1: more lattes. A coffee shop makes its money on milk drinks, so once the bar can make them (a steam
 * wand and milk, FB2 C9) the order draw leans toward `latte` and `cappuccino`; and now and then a walk-in asks for
 * "a latte for my friend" too (a two-item combo ticket, see `latteAddon` in orders.ts).
 *
 * The push is a share target, not a flat multiplier, so it reads the same whatever is on the board: it scales the
 * milk drinks' weights until they come to `milkShare` of the (bias-weighted) order draw, never below ×1 (a naturally
 * milky mix is left alone) and never above `maxPush`. A bar without a wand has no milk drink on its menu, so
 * nothing changes for it, and batch (drip, cold brew) keeps the rest. Gear runs only. Pure: no RNG.
 */
import { DRINK_INFO } from '../data/drinks';
import type { Modifiers } from './effects';
import type { DrinkId, GameState } from './types';

export const LATTES = {
  /** The drinks the push and the add-on ask are about. */
  drinks: ['latte', 'cappuccino'] as readonly DrinkId[],
  /** Milk drinks' target share of orders when the bar makes them (the brief: roughly 40-45%). */
  milkShare: 0.42,
  /** The most the milk drinks' weights are ever scaled by (a menu full of other drinks). */
  maxPush: 4,
  /** Chance a single walk-in (normal or impatient, from the combo's first day) adds a latte "for my friend". */
  addon: 0.05,
} as const;

export const isMilkDrink = (d: DrinkId): boolean => LATTES.drinks.includes(d);

/** The factor on every milk drink's order weight for this menu (1 = no push). */
export function milkPush(state: GameState, menu: DrinkId[], m: Modifiers): number {
  if (state.gear !== true) return 1;
  let milk = 0;
  let rest = 0;
  for (const d of menu) {
    const w = m.orderBias[d] * DRINK_INFO[d].bias;
    if (isMilkDrink(d)) milk += w;
    else rest += w;
  }
  if (milk <= 0 || rest <= 0) return 1;
  const need = (LATTES.milkShare * rest) / ((1 - LATTES.milkShare) * milk);
  return Math.min(LATTES.maxPush, Math.max(1, need));
}
