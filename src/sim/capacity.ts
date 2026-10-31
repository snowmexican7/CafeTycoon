/**
 * Round 3 money: what a shop can really pour in a day, so the night's forecast (orders, restock estimate) never
 * promises more cups than the crew and machines could make. Pure reads of the state: no RNG, no mutation.
 *
 *   dripPotCups(state)                       cups in the biggest drip pot the shop owns (the smallest pot with none)
 *   cupsPerArrival(state, m)                 cups a walk-in orders on average (groups and combos add cups)
 *   serveCapacity(state, menu, m)            { perSecond, queue, day }: cups per second, the queue's cap, the day's cups
 *   expectedCups(state, menu, m, walkIns)    walk-ins (after price) -> cups ordered, capped by `day`
 *   shareWeights(state, menu, m)             each menu drink's order weight (bias, price, gear pull)
 *
 * The rate is the slower of two limits: the machines (each station kind: its machines' speed over the seconds an
 * average cup needs there) and the crew (people on the floor, each needing a little time per cup besides the
 * machines: the till, the walk, the hand-off). The day's capacity is that rate over the opening hours, plus the
 * queue's spots (the line is already poured into by the doors locking).
 */
import { ECONOMY } from '../data/economy';
import { DRINK_INFO, recipeChain, type RecipeStation } from '../data/drinks';
import { GEAR } from '../data/gear';
import type { Modifiers } from './effects';
import { gearPullMul, gearSpeed } from './gear';
import { availableDrinks, queueCapacity } from './customers';
import { tierInfo, tierOf } from './growth';
import { demandFactor } from './pricing';
import { latteAddonChance, ORDERS } from './orders';
import { isMilkDrink, milkPush } from './lattes';
import type { DrinkId, GameState } from './types';

export const CAPACITY = {
  /** Hands-on seconds per cup besides the machines (the till, the walk, the hand-off). */
  handlingSeconds: 6,
  /** Hands-on seconds per recipe step (carrying the cup to the next machine). */
  stepSeconds: 2,
} as const;

/** Cups in the biggest drip pot among the shop's machines; the smallest pot (the first one) when there is none. */
export function dripPotCups(state?: GameState): number {
  const smallest = GEAR.d1.pot?.cups ?? 4;
  let best = 0;
  for (const s of state?.stations ?? []) {
    const cups = s.gear ? GEAR[s.gear].pot?.cups : undefined;
    if (cups && cups > best) best = cups;
  }
  return best > 0 ? best : smallest;
}

/** Each menu drink's weight in the order draw: forecast and drink bias, the price's pull and the gear's pull. */
export function shareWeights(state: GameState, menu: DrinkId[], m: Modifiers): number[] {
  const push = milkPush(state, menu, m); // Round 3 item 1
  return menu.map((d) => m.orderBias[d] * DRINK_INFO[d].bias * demandFactor(state, d) * gearPullMul(state, d) * (isMilkDrink(d) ? push : 1));
}

/**
 * Cups a walk-in orders on average: the kind mix as `rollKind` weighs it (a group is 2-3 cups), plus the combo's
 * second drink for the normal and impatient walk-ins who roll one or ask for a latte for a friend (Gear runs, from day 2).
 */
export function cupsPerArrival(state: GameState, m: Modifiers, menu: DrinkId[] = availableDrinks(state)): number {
  const base: Record<string, number> = state.day === 1 ? ECONOMY.customers.mixDay1 : ECONOMY.customers.mix;
  const t = tierInfo(state).mix;
  const kinds = ['normal', 'impatient', 'group', 'regular'] as const;
  const weights = kinds.map((k) => (base[k] ?? 0) * (k === 'normal' ? 1 : m.mix[k] * t[k]));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const g = ECONOMY.customers.group;
  const groupCups = (g.min + g.max) / 2;
  const pair = state.gear === true && state.day >= ORDERS.combo.fromDay ? ORDERS.combo.chance : 0;
  const combo = pair + (1 - pair) * latteAddonChance(state, menu); // Round 3 item 1: the add-on is a second cup too
  let cups = 0;
  kinds.forEach((k, i) => {
    const each = k === 'group' ? groupCups : 1 + (k === 'normal' || k === 'impatient' ? combo : 0);
    cups += (weights[i] / total) * each;
  });
  return cups;
}

/** Cups a day's office run adds on average (0 on the stand, before day 3, and outside Gear runs). */
export function officeCups(state: GameState): number {
  const tier = tierOf(state);
  if (state.gear !== true || tier === 'stand' || state.day < ORDERS.office.fromDay) return 0;
  const [lo, hi] = ORDERS.office.size[tier];
  return ORDERS.office.chance * ((lo + hi) / 2);
}

export interface ServeCapacity {
  /** Cups per second the machines and the crew can pour together. */
  perSecond: number;
  /** The queue's spots today. */
  queue: number;
  /** Cups in a whole day: `perSecond` over the opening hours, plus the queue. */
  day: number;
}

/** What the shop can pour on a day with `menu` on the board (see the file note). */
export function serveCapacity(state: GameState, menu: DrinkId[], m: Modifiers): ServeCapacity {
  const queue = queueCapacity(m, tierInfo(state).queue);
  const w = shareWeights(state, menu, m);
  const total = w.reduce((a, b) => a + b, 0);
  let perSecond = Infinity;
  if (menu.length > 0 && total > 0) {
    // seconds an average cup needs at each station kind, and the recipe steps it walks
    const secs = new Map<RecipeStation, number>();
    let steps = 0;
    menu.forEach((d, i) => {
      const share = w[i] / total;
      for (const { station, recipe } of recipeChain(d)) {
        steps += share;
        const s = recipe.seconds ?? ECONOMY.stationSeconds[station];
        secs.set(station, (secs.get(station) ?? 0) + share * s);
      }
    });
    for (const [kind, seconds] of secs) {
      // pots pour a cup far faster than they brew: the drip machine is never the limit
      if (kind === 'drip' || seconds <= 0) continue;
      const machines = state.stations.filter((s) => s.kind === kind);
      if (machines.length === 0) continue;
      const speed = machines.reduce((a, s) => a + m.stationSpeed[kind] * gearSpeed(s), 0);
      perSecond = Math.min(perSecond, speed / seconds);
    }
    const crew = Math.max(1, state.players.filter((p) => p.connected).length);
    perSecond = Math.min(perSecond, crew / (CAPACITY.handlingSeconds + steps * CAPACITY.stepSeconds));
  } else {
    perSecond = 0;
  }
  return { perSecond, queue, day: Math.floor(perSecond * state.settings.dayLengthSec) + queue };
}

/** Walk-ins (already scaled by price) to cups ordered: groups and combos add cups, an office run adds its drinks, and the day's capacity caps the lot. */
export function expectedCups(state: GameState, menu: DrinkId[], m: Modifiers, walkIns: number): number {
  const raw = walkIns * cupsPerArrival(state, m, menu) + officeCups(state);
  return Math.min(raw, serveCapacity(state, menu, m).day);
}
