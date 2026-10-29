/**
 * Night brief: a pure, deterministic read of the state that says what to fix before opening the
 * doors. No RNG, no mutation. The UI shows the first three alerts and adds its own playerId to a fix.
 *
 * Final shapes:
 *
 *   type NightFix = DistributiveOmit<PlayerInput, 'playerId'>
 *   interface NightAlert {
 *     id: string;   // cash:short | cash:low | stock:<supply>:out | stock:<supply>:low | soldOut | spoil | grow | checkout | rival | signature
 *     kind: 'cash' | 'stock' | 'soldOut' | 'spoil' | 'grow' | 'checkout' | 'rival' | 'signature';
 *     severity: 'info' | 'warn' | 'danger';
 *     text: string;
 *     fix?: NightFix;   // restock fixes are left off when state.cash < restockCost(state, supply, packs)
 *   }
 *   nightBrief(state): { profit: number | null; headline: string; alerts: NightAlert[] }
 *     profit = profitOf(days.at(-1)) or null on the first night; alerts sorted danger, warn, info,
 *     then in the order cash, stock (pantry order), soldOut, spoil, grow, checkout, rival, signature.
 *   dayClock(fraction: number): string                    // 0..1 -> "8:00 AM".."6:00 PM", ten-minute steps
 *   expectedUse(state): Record<SupplyId, number>          // supplies a normal day should use
 *   runOutFraction(state, supply): number | null          // have / expectedUse clamped 0..1, null when unused
 *
 * Grow and checkout nudges wait until there is a finished day on the books (not on opening night,
 * when cash is for stock and rent). Spoilage counts what is left after a normal day's use.
 */
import { ECONOMY } from '../data/economy';
import { DRINK_INFO } from '../data/drinks';
import { CHECKOUT, nextCheckout } from './checkout';
import { computeModifiers, rentForDay } from './effects';
import { nextTier, TIERS } from './growth';
import { restockCost } from './night';
import { profitOf } from './profit';
import { copyIsLive, RIVAL, sigPrice } from './rival';
import { FRESH, spoilCount } from './spoilage';
import { menuDrinks, neededSupplies, SUPPLY_IDS } from './unlocks';
import type { CheckoutId, DrinkId, GameState, PlayerInput, SupplyId } from './types';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A night input without its playerId: the UI adds its own. */
export type NightFix = DistributiveOmit<PlayerInput, 'playerId'>;

export interface NightAlert {
  id: string;
  kind: 'cash' | 'stock' | 'soldOut' | 'spoil' | 'grow' | 'checkout' | 'rival' | 'signature';
  severity: 'info' | 'warn' | 'danger';
  text: string;
  fix?: NightFix;
}

export interface NightBrief {
  profit: number | null;
  headline: string;
  alerts: NightAlert[];
}

/** A supply counts as "low" when it would not cover this share of the expected use (same as the night warnings). */
const LOW_SUPPLY_SHARE = 0.75;

const STOCK_NAME: Record<SupplyId, string> = { beans: 'Beans', milk: 'Milk', concentrate: 'Cold brew', flavour: 'Flavours', pastry: 'Pastries' };
/** [one, many] */
const SPOIL_NAME: Record<SupplyId, [string, string]> = {
  beans: ['beans', 'beans'],
  milk: ['milk', 'milk'],
  concentrate: ['cold brew', 'cold brew'],
  flavour: ['flavours', 'flavours'],
  pastry: ['pastry', 'pastries'],
};
const CHECKOUT_LABEL: Record<CheckoutId, string> = { register: 'register', kiosk: 'kiosk', squarely: 'tap terminal' };
const SEVERITY_RANK = { danger: 0, warn: 1, info: 2 } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const dollars = (n: number) => `$${Math.abs(n).toFixed(2).replace(/\.00$/, '')}`;
const money2 = (n: number) => `$${Math.abs(n).toFixed(2)}`;

/**
 * The day on a clock: 0 is 8:00 AM, 1 is 6:00 PM, in ten-minute steps ("2:10 PM", "12:00 PM").
 * Out-of-range fractions clamp.
 */
export function dayClock(fraction: number): string {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const minutes = Math.round((f * 600) / 10) * 10;
  const h24 = 8 + Math.floor(minutes / 60);
  const mm = minutes % 60;
  const h12 = h24 % 12 || 12;
  return `${h12}:${mm.toString().padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

/**
 * Roughly how many of each supply a day will use: expected arrivals over the day, split across the
 * drinks on the menu by order bias. Each drink uses one unit of each supply it needs.
 */
export function expectedUse(state: GameState): Record<SupplyId, number> {
  const m = computeModifiers(state);
  const arrivals = ECONOMY.baseArrivalsPerSecond * state.settings.dayLengthSec * m.traffic;
  const menu = menuDrinks(state);
  const w = (d: DrinkId) => m.orderBias[d] * DRINK_INFO[d].bias;
  const total = menu.reduce((s, d) => s + w(d), 0) || 1;
  const use: Record<SupplyId, number> = { beans: 0, milk: 0, concentrate: 0, flavour: 0, pastry: 0 };
  for (const d of menu) for (const s of ECONOMY.drinkSupplies[d]) use[s] += (arrivals * w(d)) / total;
  for (const s of SUPPLY_IDS) use[s] = Math.ceil(use[s]);
  return use;
}

/** How far through the day the stock lasts (0..1), or null when the menu does not use the supply. */
export function runOutFraction(state: GameState, supply: SupplyId): number | null {
  const use = expectedUse(state)[supply];
  if (use <= 0) return null;
  return Math.min(1, Math.max(0, (state.supplies[supply] ?? 0) / use));
}

/** A restock fix, or nothing when the till cannot pay for it (applying it would be a silent no-op). */
function restockFix(state: GameState, supply: SupplyId, packs: number): NightFix | undefined {
  return state.cash < restockCost(state, supply, packs) ? undefined : { kind: 'restock', supply, packs };
}

function packsToCover(use: number, have: number, supply: SupplyId): number {
  return Math.max(1, Math.ceil((use - have) / ECONOMY.packs[supply].size));
}

function headlineFor(state: GameState): { profit: number | null; headline: string } {
  const last = state.days.at(-1);
  if (!last) return { profit: null, headline: 'Opening night: stock up, then open the shop.' };
  const profit = profitOf(last);
  const sign = profit < 0 ? '−' : '+';
  const cups = `${last.served} ${last.served === 1 ? 'cup' : 'cups'}`;
  return { profit, headline: `Yesterday: ${sign}${money2(profit)} from ${cups}, ${last.lost} walked out.` };
}

export function nightBrief(state: GameState): NightBrief {
  const { profit, headline } = headlineFor(state);
  const alerts: NightAlert[] = [];
  const last = state.days.at(-1);
  const use = expectedUse(state);
  const menu = menuDrinks(state);
  const needed = neededSupplies(state).filter((s) => menu.some((d) => ECONOMY.drinkSupplies[d].includes(s)));

  // 1. cash
  const rent = rentForDay(state);
  const after = round2(state.cash - rent);
  if (after < 0) alerts.push({ id: 'cash:short', kind: 'cash', severity: 'danger', text: `You'll be ${dollars(after)} short on rent` });
  else if (after < rent) alerts.push({ id: 'cash:low', kind: 'cash', severity: 'warn', text: `Only ${dollars(after)} spare after rent` });

  // 2. stock
  for (const s of needed) {
    const have = state.supplies[s] ?? 0;
    if (have <= 0) {
      const alert: NightAlert = { id: `stock:${s}:out`, kind: 'stock', severity: 'danger', text: `${STOCK_NAME[s]} stock is out` };
      const fix = restockFix(state, s, 1);
      if (fix) alert.fix = fix;
      alerts.push(alert);
    } else if (have < Math.ceil(use[s] * LOW_SUPPLY_SHARE)) {
      const when = dayClock(runOutFraction(state, s) ?? 0);
      const alert: NightAlert = { id: `stock:${s}:low`, kind: 'stock', severity: 'warn', text: `${STOCK_NAME[s]} stock runs out around ${when}` };
      const fix = restockFix(state, s, packsToCover(use[s], have, s));
      if (fix) alert.fix = fix;
      alerts.push(alert);
    }
  }

  // 3. sold out yesterday: restock whichever needed supply is thinnest against the day's use
  const walkouts = last?.soldOutWalkouts ?? 0;
  if (last && walkouts > 0) {
    const ratio = (s: SupplyId) => (state.supplies[s] ?? 0) / Math.max(1, use[s]);
    const thinnest = needed.reduce<SupplyId | null>((best, s) => (best === null || ratio(s) < ratio(best) ? s : best), null);
    const at = last.soldOutAt === undefined ? '' : ` at ${dayClock(last.soldOutAt / Math.max(1, state.settings.dayLengthSec))}`;
    const alert: NightAlert = {
      id: 'soldOut',
      kind: 'soldOut',
      severity: 'warn',
      text: `You sold out${at} yesterday and ${walkouts} ${walkouts === 1 ? 'person' : 'people'} walked away`,
    };
    const fix = thinnest ? restockFix(state, thinnest, packsToCover(use[thinnest], state.supplies[thinnest] ?? 0, thinnest)) : undefined;
    if (fix) alert.fix = fix;
    alerts.push(alert);
  }

  // 4. spoilage: what is left after a normal day goes off at closing
  const going: string[] = [];
  for (const s of FRESH) {
    const n = spoilCount(state, s, (state.supplies[s] ?? 0) - use[s]);
    if (n >= 1) going.push(`${n} ${SPOIL_NAME[s][n === 1 ? 0 : 1]}`);
  }
  if (going.length > 0) alerts.push({ id: 'spoil', kind: 'spoil', severity: 'info', text: `About ${going.join(' and ')} will go off tonight` });

  // 5 and 6. growth upsells wait for a first finished day
  if (last) {
    const tier = nextTier(state);
    if (tier && state.cash >= TIERS[tier].cost) {
      alerts.push({ id: 'grow', kind: 'grow', severity: 'info', text: `You can grow to the ${TIERS[tier].short} ($${TIERS[tier].cost})`, fix: { kind: 'grow', tier } });
    }
    const co = nextCheckout(state);
    if (co && state.cash >= CHECKOUT[co].cost) {
      alerts.push({ id: 'checkout', kind: 'checkout', severity: 'info', text: `You can afford the ${CHECKOUT_LABEL[co]} ($${CHECKOUT[co].cost})`, fix: { kind: 'checkout', checkout: co } });
    }
  }

  // 7. rival knock-off undercutting the signature
  const sig = state.signature;
  if (sig && copyIsLive(state)) {
    const copy = state.rival!.copy!;
    const mine = sigPrice(state, sig);
    if (copy.price < mine) {
      alerts.push({
        id: 'rival',
        kind: 'rival',
        severity: 'warn',
        text: `${RIVAL.name} sells a knock-off of ${sig.name} for ${money2(copy.price)}, you charge ${money2(mine)}`,
      });
    }
  }

  // 8. signature with no premium
  if (sig && sig.premium === 0) alerts.push({ id: 'signature', kind: 'signature', severity: 'info', text: 'Your signature has no premium' });

  alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return { profit, headline, alerts };
}
