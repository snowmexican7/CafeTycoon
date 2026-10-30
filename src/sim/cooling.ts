/*
 * Feedback 2, A2: cups go cold (Gear runs only). A hot drink starts its clock when it is made (a machine's output
 * appears, or a cup is poured from a pot or tap) and the clock follows the cup: in the machine (`Station.outputSince`),
 * in hand (`Player.heldSince`) and on the pickup counter (`PassItem.madeAt`). Absent = fresh (old saves).
 * Iced drinks never cool. Lukewarm (cool ≥ 0.5) halves the tip; cold (cool ≥ 1) means the customer takes it,
 * doesn't pay and leaves unhappy (src/sim/pickup.ts). A drip pot keeps its own `potColdAt` rules (src/sim/gear.ts).
 * No RNG here.
 */
import { DRINK_TEMP } from '../data/drinks';
import { GEAR } from '../data/gear';
import { TICK_RATE } from './constants';
import { emitLog } from './log';
import type { DrinkId, GameState, ItemKind, PassItem, Player, Station } from './types';

/** Seconds from made to cold, per drink; null = never cools (iced). */
export const COOLING_SECONDS: Record<DrinkId, number | null> = {
  // Espresso-based shots that sit.
  espresso: 45,
  doppio: 45,
  americano: 45,
  redEye: 45,
  // Milky drinks.
  latte: 60,
  mocha: 60,
  matcha: 60,
  cappuccino: 60,
  // Filter cups.
  drip: 60,
  pourOver: 60,
  cafeAuLait: 60,
  // Iced: never cool, never warm.
  coldBrew: null,
  icedLatte: null,
  special: null,
  sweetCream: null,
};

/** At or past this a cup is lukewarm: paid, half tip. At 1 it is cold. */
export const LUKEWARM = 0.5;

/** Ticks from made to cold for this item, or null when it never cools (iced drinks, grounds). */
export function coolTicks(item: ItemKind | null): number | null {
  if (item === null || item === 'grounds' || DRINK_TEMP[item] !== 'hot') return null;
  const s = COOLING_SECONDS[item];
  return s === null ? null : Math.round(s * TICK_RATE);
}

/** 0 = fresh .. 1 = cold, for a cup of `drink` made at `madeAt`. Always 0 for iced drinks, unknown ages and classic runs. */
export function coolFraction(state: GameState, madeAt: number | undefined, drink: ItemKind | null): number {
  if (state.gear !== true || madeAt === undefined) return 0;
  const ticks = coolTicks(drink);
  if (ticks === null) return 0;
  return Math.min(1, Math.max(0, (state.tick - madeAt) / ticks));
}

/** How cold a pickup counter cup is (0..1). */
export function slotCool(state: GameState, item: PassItem): number {
  return coolFraction(state, item.madeAt, item.item);
}

/** How cold the cup in someone's hands is (0..1). */
export function heldCool(state: GameState, p: Player): number {
  return coolFraction(state, p.heldSince, p.holding);
}

/**
 * How cold what a station holds is (0..1): a drip pot by its own hot-plate timer (`potColdAt`; 0 for a pot that
 * never goes cold), else the machine's waiting output by `outputSince`. 0 when it holds nothing.
 */
export function stationCool(state: GameState, st: Station): number {
  if (state.gear !== true) return 0;
  if (st.potLeft !== undefined) {
    const after = st.gear ? GEAR[st.gear].pot?.coldAfter : undefined;
    if (st.potColdAt === undefined || !after) return 0;
    return Math.min(1, Math.max(0, 1 - (st.potColdAt - state.tick) / Math.round(after * TICK_RATE)));
  }
  return coolFraction(state, st.outputSince, st.output);
}

/**
 * The pickup counter cup that has been around longest, or -1: the smallest `madeAt` (unknown = fresh); ties go to
 * the stalest pass timer (today's rule for cups with no clock), then slot order.
 */
export function oldestCupIndex(state: GameState): number {
  let best = -1;
  state.pass.forEach((item, i) => {
    if (best === -1) {
      best = i;
      return;
    }
    const b = state.pass[best];
    const a0 = item.madeAt ?? Infinity;
    const b0 = b.madeAt ?? Infinity;
    if (a0 < b0 || (a0 === b0 && item.ticksLeft < b.ticksLeft)) best = i;
  });
  return best;
}

/** True when the oldest cup on the pickup counter is cold. */
export function oldestCupCold(state: GameState): boolean {
  const i = oldestCupIndex(state);
  return i >= 0 && slotCool(state, state.pass[i]) >= 1;
}

/** A hot cup with a known clock: it cools on the counter instead of going stale on the pass timer. */
export function coolsOnCounter(state: GameState, item: PassItem): boolean {
  return state.gear === true && item.madeAt !== undefined && coolTicks(item.item) !== null;
}

/** The made tick to stamp on a cup leaving someone's hands: their cup's clock, else now. */
export function madeAtFromHand(state: GameState, p: Player): number {
  return p.heldSince ?? state.tick;
}

/**
 * Once a tick (Gear only): `cup.cold { slot, drink }` the tick a pickup counter cup turns cold, `cup.cold { station,
 * drink }` the tick a machine's waiting output (or a drip pot) does; empty hands drop their clock.
 */
export function stepCooling(state: GameState): void {
  if (state.gear !== true) return;
  state.pass.forEach((item, slot) => {
    const ticks = coolTicks(item.item);
    if (ticks !== null && item.madeAt !== undefined && state.tick - item.madeAt === ticks) {
      emitLog(state, 'cup.cold', { slot, drink: item.item });
    }
  });
  for (const st of state.stations) {
    if (st.output === null) continue;
    if (st.potLeft !== undefined) {
      if (st.potColdAt === state.tick) emitLog(state, 'cup.cold', { station: st.id, drink: st.output });
      continue;
    }
    const ticks = coolTicks(st.output);
    if (ticks !== null && st.outputSince !== undefined && state.tick - st.outputSince === ticks) {
      emitLog(state, 'cup.cold', { station: st.id, drink: st.output });
    }
  }
  for (const p of state.players) {
    if (p.heldSince !== undefined && (p.holding === null || p.holding === 'grounds')) delete p.heldSince;
  }
}
