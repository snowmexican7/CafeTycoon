import { ECONOMY } from '../data/economy';
import { computeModifiers, rentForDay } from '../sim/effects';
import { restockCost } from '../sim/night';
import type { DrinkId, GameState, SupplyId } from '../sim/types';

/**
 * Night-shop heads-ups, worked out from GameState alone (the sim is not changed). They never block
 * Ready; they just name the problem before the crew opens the doors.
 */
export interface NightWarning {
  /** Stable id, so the structure key only changes when the set of warnings does. */
  id: string;
  kind: 'cash' | 'supply';
  /** 'danger': short on rent or out of stock. 'low': cutting it fine. */
  level: 'danger' | 'low';
  title: string;
  detail: string;
  supply?: SupplyId;
}

const DRINKS: DrinkId[] = ['espresso', 'latte', 'coldBrew'];
const SUPPLIES: SupplyId[] = ['beans', 'milk', 'concentrate'];
const NAME: Record<SupplyId, string> = { beans: 'beans', milk: 'milk', concentrate: 'cold brew' };
const DRINK_PLURAL: Record<DrinkId, string> = { espresso: 'Espressos', latte: 'Lattes', coldBrew: 'Cold brews' };

const dollars = (n: number) => `$${Math.abs(n).toFixed(2).replace(/\.00$/, '')}`;
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** Rent due at tomorrow's closing. At night `state.day` is already tomorrow. Wages do not exist yet (phase 3). */
export function rentTomorrow(state: GameState): number {
  return rentForDay(state);
}

/**
 * Roughly how many of each supply tomorrow will use: expected arrivals over the day, split across
 * the drinks on the menu by order bias. Each drink uses one unit of each supply it needs.
 */
export function expectedUse(state: GameState): Record<SupplyId, number> {
  const m = computeModifiers(state);
  const arrivals = ECONOMY.baseArrivalsPerSecond * state.settings.dayLengthSec * m.traffic;
  const menu = DRINKS.filter((d) => state.menu[d]);
  const total = menu.reduce((s, d) => s + m.orderBias[d], 0) || 1;
  const use: Record<SupplyId, number> = { beans: 0, milk: 0, concentrate: 0 };
  for (const d of menu) for (const s of ECONOMY.drinkSupplies[d]) use[s] += (arrivals * m.orderBias[d]) / total;
  for (const s of SUPPLIES) use[s] = Math.ceil(use[s]);
  return use;
}

/**
 * Not every arrival gets served (some walk out), so a supply only counts as "low" when it would not
 * cover this share of the expected orders. Keeps a fresh run's starting stock from nagging.
 */
export const LOW_SUPPLY_SHARE = 0.75;

export function nightWarnings(state: GameState): NightWarning[] {
  const out: NightWarning[] = [];
  const rent = rentTomorrow(state);
  const after = Math.round((state.cash - rent) * 100) / 100;
  const opening = state.days.length === 0;
  if (after < 0) {
    out.push({
      id: 'cash:short',
      kind: 'cash',
      level: 'danger',
      title: `You'll be ${dollars(after)} short on rent`,
      detail: `Rent is ${dollars(rent)} at closing. Tomorrow's sales have to cover the gap, or the landlord changes the locks.`,
    });
  } else if (after < rent) {
    out.push({
      id: 'cash:low',
      kind: 'cash',
      level: 'low',
      title: `Only ${dollars(after)} spare after rent`,
      detail: opening
        ? `Rent is ${dollars(rent)} tomorrow night and there are no sales yet. Keep enough back for rent and stock.`
        : `Rent is ${dollars(rent)}. One slow day could leave you short.`,
    });
  }

  const use = expectedUse(state);
  for (const s of SUPPLIES) {
    const needs = DRINKS.filter((d) => state.menu[d] && ECONOMY.drinkSupplies[d].includes(s));
    if (needs.length === 0) continue;
    const have = state.supplies[s];
    const afford = state.cash >= restockCost(state, s, 1);
    const fix = afford ? 'Restock before you open.' : `A pack costs ${dollars(restockCost(state, s, 1))}, more than you have.`;
    if (have <= 0) {
      out.push({
        id: `supply:${s}:out`,
        kind: 'supply',
        level: 'danger',
        supply: s,
        title: `Out of ${NAME[s]}!`,
        detail: `${listJoin(needs.map((d) => DRINK_PLURAL[d]))} can't be made. ${fix}`,
      });
    } else if (have < Math.ceil(use[s] * LOW_SUPPLY_SHARE)) {
      out.push({
        id: `supply:${s}:low`,
        kind: 'supply',
        level: 'low',
        supply: s,
        title: `Low on ${NAME[s]}: ${have} left`,
        detail: `A day like tomorrow uses about ${use[s]}. ${fix}`,
      });
    }
  }
  return out;
}

/** True when buying something that costs `cost` leaves less than tomorrow's rent in the till. */
export function cutsIntoRent(state: GameState, cost: number): boolean {
  return state.cash >= cost && state.cash - cost < rentTomorrow(state);
}
