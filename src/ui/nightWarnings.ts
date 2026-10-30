import { ECONOMY } from '../data/economy';
import { expectedUse, nightBrief } from '../sim/brief';
import { billsForDay, wagesForDay } from '../sim/staff';
import { restockCost } from '../sim/night';
import { SUPPLY_IDS, menuDrinks } from '../sim/unlocks';
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

const NAME: Record<SupplyId, string> = { beans: 'beans', milk: 'milk', concentrate: 'cold brew', flavour: 'flavours', pastry: 'pastries' };
const DRINK_PLURAL: Record<DrinkId, string> = {
  espresso: 'Espressos', latte: 'Lattes', coldBrew: 'Cold brews', icedLatte: 'Iced lattes', mocha: 'Mochas', matcha: 'Matchas', special: 'Maple foams', drip: 'Drips', americano: 'Americanos', cappuccino: 'Cappuccinos', doppio: 'Doppios', sweetCream: 'Sweet creams', cafeAuLait: 'Cafés au lait', redEye: 'Red-eyes', pourOver: 'Pour-overs',
};

const dollars = (n: number) => `$${Math.abs(n).toFixed(2).replace(/\.00$/, '')}`;
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** Bills due at tomorrow's closing: rent plus the hired crew's wages (P3 B15). At night `state.day` is already tomorrow. */
export function rentTomorrow(state: GameState): number {
  return billsForDay(state);
}

/**
 * Tomorrow's expected use per supply, and the "low" line, come from the sim's night brief
 * (src/sim/brief.ts): the warnings below only add the longer wording and the drinks a supply stops.
 */
export { expectedUse };

export function nightWarnings(state: GameState): NightWarning[] {
  const out: NightWarning[] = [];
  const rent = rentTomorrow(state);
  const wages = wagesForDay(state);
  const bill = wages > 0 ? 'rent and wages' : 'rent';
  const billText = wages > 0 ? `Rent and wages are ${dollars(rent)}` : `Rent is ${dollars(rent)}`;
  const after = Math.round((state.cash - rent) * 100) / 100;
  const opening = state.days.length === 0;
  const brief = new Set(nightBrief(state).alerts.map((a) => a.id));
  if (brief.has('cash:short')) {
    out.push({
      id: 'cash:short',
      kind: 'cash',
      level: 'danger',
      title: `You'll be ${dollars(after)} short on ${bill}`,
      detail: `${billText} at closing. Tomorrow's sales have to cover the gap, or the landlord changes the locks.`,
    });
  } else if (brief.has('cash:low')) {
    out.push({
      id: 'cash:low',
      kind: 'cash',
      level: 'low',
      title: `Only ${dollars(after)} spare after ${bill}`,
      detail: opening
        ? `${billText} tomorrow night and there are no sales yet. Keep enough back for ${bill} and stock.`
        : `${billText}. One slow day could leave you short.`,
    });
  }

  const use = expectedUse(state);
  for (const s of SUPPLY_IDS) {
    const needs = menuDrinks(state).filter((d) => ECONOMY.drinkSupplies[d].includes(s));
    if (needs.length === 0) continue;
    const have = state.supplies[s] ?? 0;
    const afford = state.cash >= restockCost(state, s, 1);
    const fix = afford ? 'Restock before you open.' : `A pack costs ${dollars(restockCost(state, s, 1))}, more than you have.`;
    if (brief.has(`stock:${s}:out`)) {
      out.push({
        id: `stock:${s}:out`,
        kind: 'supply',
        level: 'danger',
        supply: s,
        title: `Out of ${NAME[s]}!`,
        detail: `${listJoin(needs.map((d) => DRINK_PLURAL[d]))} can't be made. ${fix}`,
      });
    } else if (brief.has(`stock:${s}:low`)) {
      out.push({
        id: `stock:${s}:low`,
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
