/**
 * P4 B4: a second shop (franchise). At the café tier a Gear crew can open a branch in another area.
 * It never runs the live floor: at each closing it serves an expected-demand day (walk-ins × the
 * home shop's reputation and weather × how well tonight's menu suits its area, with seeded noise,
 * capped by its hired staff) and its profit lands in the till. Deterministic: the noise is a hash of
 * seed and day, so it never draws from the run's RNG and replays stay identical.
 */
import { CALL, callOutcome, type CallKind } from './call';
import { AREAS, AREA_TIP, DRINK_FAMILY, type AreaId } from '../data/areas';
import { DRINK_IDS } from '../data/drinks';
import { computeModifiers } from './effects';
import { gearArea } from './gear';
import { menuPrice, unitCost } from './pricing';
import { wageEach } from './staff';
import { roleSupplyCost } from './roles';
import { ECONOMY } from '../data/economy';
import type { DrinkId, GameState, PlayerInput, SupplyId } from './types';

export const BRANCH = {
  /** Opening price (the lease and a bar); counts at half in the score like other fittings. */
  cost: 300,
  /** Base walk-ins a day before reputation, weather and area fit. */
  walkIns: 20,
  /** Cups one hired barista can hand over in a day. */
  perStaff: 12,
  staff: { min: 1, max: 3, start: 2 },
  rent: 28,
  /** No owner behind the bar: tips are thin. */
  tipRate: 0.05,
  /** ±share of seeded day-to-day noise. */
  noise: 0.15,
  /** P4 B5: extra cups per barista while someone holds the Manager role (they run both rotas). */
  managerCups: 2,
};

/** P4 B5: supplies that can be driven over to the branch at night. */
export const BRANCH_SUPPLIES: SupplyId[] = ['beans', 'milk', 'concentrate', 'flavour'];

/** Someone on the crew holds the Manager role. */
export const hasManager = (state: GameState): boolean => state.players.some((p) => p.role === 'manager');

const r2 = (n: number) => Math.round(n * 100) / 100;

export const BRANCH_AREAS: AreaId[] = ['campus', 'drizzleton', 'office', 'arts', 'gym', 'tourist'];

/** Areas a branch can open in: anywhere but home. */
export function branchAreas(state: GameState): AreaId[] {
  const home = gearArea(state);
  return BRANCH_AREAS.filter((a) => a !== home);
}

export function canOpenBranch(state: GameState): boolean {
  return !!state.gear && (state.tier ?? 'cafe') === 'cafe' && !state.branch && state.cash >= BRANCH.cost;
}

/** The drinks on tonight's board. */
function menuDrinks(state: GameState): DrinkId[] {
  return DRINK_IDS.filter((d) => (state.menu as Partial<Record<DrinkId, boolean>>)[d]);
}

/** How well the menu suits an area: the average loved/meh multiplier over the board (1 = neutral). */
export function areaFit(state: GameState, area: AreaId): number {
  const a = AREAS[area];
  const drinks = menuDrinks(state);
  if (!drinks.length) return 0;
  const mul = drinks.map((d) => {
    const fam = DRINK_FAMILY[d];
    if (a.lovesDrink?.includes(d)) return AREA_TIP.loved;
    if (a.mehDrink?.includes(d)) return AREA_TIP.meh;
    if (fam && a.loves.includes(fam)) return AREA_TIP.loved;
    if (fam && a.meh.includes(fam)) return AREA_TIP.meh;
    return 1;
  });
  return r2((mul.reduce((x, y) => x + y, 0) / mul.length) * (a.all ?? 1));
}

/** Seeded noise in [1 − noise, 1 + noise] for a day (no RNG draw). */
function noiseFor(seed: number, day: number): number {
  let h = Math.imul((seed >>> 0) ^ 0x9e3779b9, 2654435761) ^ Math.imul(day + 17, 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  return 1 - BRANCH.noise + ((h >>> 0) / 4294967296) * 2 * BRANCH.noise;
}

export interface BranchDay { served: number; walked: number; takings: number; costs: number; profit: number; fromStock?: number; call?: { kind: CallKind; took: boolean; by?: string } }

/** What the branch would do today (pure: the night forecast and closing both use it). */
export function branchDay(state: GameState, day = state.day, withCall = false): BranchDay | null {
  const b = state.branch;
  if (!b) return null;
  const m = computeModifiers({ ...state, phase: 'night' });
  const drinks = menuDrinks(state);
  // The area's taste swings demand twice as hard as it swings tips (a ×1.1 fit draws ×1.2 the walk-ins).
  const fit = Math.max(0, 1 + 2 * (areaFit(state, b.area) - 1));
  const demand = Math.round(BRANCH.walkIns * m.traffic * fit * noiseFor(state.seed, day));
  // P4 B6: today's phone call (closing only; the night estimate can't know it).
  const call = withCall ? callOutcome(state) : null;
  let cap = b.staff * (BRANCH.perStaff + (hasManager(state) ? BRANCH.managerCups : 0));
  if (call?.kind === 'machine' && !call.took) cap = Math.floor(cap / 2);
  if (call?.kind === 'order' && call.took) cap = Math.max(0, cap - CALL.orderCups);
  const served = Math.min(demand, cap);
  const ticket = drinks.length ? drinks.reduce((x, d) => x + menuPrice(state, d), 0) / drinks.length : 0;
  // The Manager's supplier discount reaches the branch too.
  const cupCost = (drinks.length ? drinks.reduce((x, d) => x + unitCost(d), 0) / drinks.length : 0) * roleSupplyCost(state);
  const takings = r2(served * ticket * (1 + BRANCH.tipRate) + (call?.kind === 'order' && call.took ? CALL.orderProfit : 0));
  const supplies = r2(served * cupCost);
  // P4 B5: stock sent over from home pays for cups first.
  const fromStock = r2(Math.min(b.stockCredit ?? 0, supplies));
  const costs = r2(BRANCH.rent + b.staff * wageEach(state) + supplies - fromStock + (call?.kind === 'machine' && call.took ? CALL.repair : 0));
  return { served, walked: Math.max(0, demand - served), takings, costs, profit: r2(takings - costs), ...(fromStock > 0 ? { fromStock } : {}), ...(call ? { call } : {}) };
}

/** Closing: run the branch's day and bank its profit (or loss). */
export function settleBranch(state: GameState): void {
  const d = branchDay(state, state.day, true);
  delete state.callAnswer;
  delete state.callRang;
  if (!d) return;
  state.cash = r2(state.cash + d.profit);
  state.today.branch = d;
  const b = state.branch!;
  if (d.fromStock) {
    const left = r2((b.stockCredit ?? 0) - d.fromStock);
    if (left > 0) b.stockCredit = left;
    else delete b.stockCredit;
  }
}

/** Night input: open (café tier, cash), set staff 1–3, or sell the lease back at half price. People only. */
export function applyBranchInput(state: GameState, input: Extract<PlayerInput, { kind: 'branch' }>): GameState {
  if (!state.gear || state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || p.bot) return state;
  if (input.action === 'open') {
    if (!canOpenBranch(state) || !input.area || !branchAreas(state).includes(input.area)) return state;
    state.cash = r2(state.cash - BRANCH.cost);
    state.branch = { area: input.area, staff: BRANCH.staff.start, openedDay: state.day, spent: BRANCH.cost, by: p.name };
  } else if (input.action === 'staff') {
    if (!state.branch || input.staff === undefined) return state;
    state.branch.staff = Math.max(BRANCH.staff.min, Math.min(BRANCH.staff.max, Math.round(input.staff)));
  } else if (input.action === 'send') {
    sendStock(state, input.supply);
  } else if (input.action === 'close') {
    if (!state.branch) return state;
    state.cash = r2(state.cash + state.branch.spent / 2);
    delete state.branch;
  }
  return state;
}

/** P4 B5: drive up to one pack of a supply over to the branch; it becomes credit against the branch's cup costs. */
export function sendStock(state: GameState, supply: SupplyId | undefined): void {
  const b = state.branch;
  if (!b || !supply || !BRANCH_SUPPLIES.includes(supply)) return;
  const pack = ECONOMY.packs[supply];
  const units = Math.min(state.supplies[supply] ?? 0, pack.size);
  if (units <= 0) return;
  state.supplies[supply] -= units;
  b.stockCredit = r2((b.stockCredit ?? 0) + (units * pack.cost) / pack.size);
}

/** Score: the branch counts like a fitting (half what it cost). */
export const branchSpent = (state: GameState): number => state.branch?.spent ?? 0;
