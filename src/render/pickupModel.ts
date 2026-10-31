import { CONDIMENTS_ID, FRIDGE_ID, PICKUP_ID, SINK_ID } from '../data/layout';
import { CONDIMENTS } from '../sim/condiments';
import { TICK_RATE } from '../sim/constants';
import { passSlots } from '../sim/pickup';
import { coolsOnCounter, slotCool } from '../sim/cooling';
import type { Customer, DrinkId, GameState, ItemKind, Vec2 } from '../sim/types';
import type { CounterSpot } from './layers/stations';

/**
 * 3.3.1 Gear batch/pickup, the pure half of the drawing: which counter art each spot gets, where the order
 * line and the pickup crowd stand, the condiment bar gauge, the box stack, and the cups on the coasters.
 * No Pixi here, so it is unit-tested.
 */

/** Which counter art a station gets. Classic runs (no pickup counter in the list) keep the one PICK-UP counter. */
export function counterSpotOf(s: { id: string; kind: string }, list: readonly { id: string }[]): CounterSpot | undefined {
  if (s.kind !== 'counter') return undefined;
  if (s.id === PICKUP_ID) return 'pickup';
  if (s.id === CONDIMENTS_ID) return 'condiments';
  if (s.id === SINK_ID) return 'sink';
  if (s.id === FRIDGE_ID) return 'fridge';
  return list.some((x) => x.id === PICKUP_ID) ? 'till' : undefined;
}

/**
 * How far up the floor the pickup crowd stands: the order line's y (7.6), but left of the till, so their
 * order bubbles stay below the cups on the coasters.
 */
export const PICKUP_Y = 7.6;
/** Space between people waiting at pickup, in tiles. */
export const PICKUP_GAP = 0.75;
/** The pickup crowd never stands left of this (the box corner and the door are there). */
export const PICKUP_MIN_X = 1.7;

export interface SpotsLayout {
  width: number;
  queueSlots: readonly Vec2[];
  /** The till (front of the order line) and the pickup counter. */
  till: Vec2;
  pickup: Vec2;
}

/**
 * Where each customer stands, in the order of `customers`. Classic: the layout's queue slots by index (the last
 * slot holds the overflow). Gear: customers still ordering line up from the till to the right; customers who were
 * rung up (`stage === 'pickup'`) wait in front of the pickup counter and the condiment bar, to the left.
 */
export function customerSpots(customers: readonly Pick<Customer, 'stage'>[], gear: boolean, lay: SpotsLayout): Vec2[] {
  const slots = lay.queueSlots;
  if (!gear) return customers.map((_, i) => slots[Math.min(i, slots.length - 1)]);
  const lineY = slots[0]?.y ?? 7.6;
  const ordering = customers.filter((c) => c.stage !== 'pickup').length;
  const right = lay.width - 0.45;
  const step = ordering > 1 ? Math.max(0.45, Math.min(1, (right - lay.till.x) / (ordering - 1))) : 1;
  let o = 0;
  let p = 0;
  return customers.map((c) => {
    if (c.stage === 'pickup') {
      const x = Math.max(PICKUP_MIN_X, lay.pickup.x - p * PICKUP_GAP);
      p++;
      return { x, y: PICKUP_Y };
    }
    const x = Math.min(right, lay.till.x + o * step);
    o++;
    return { x, y: lineY };
  });
}

export type GaugeTone = 'ok' | 'low' | 'empty';
/** At or below this many servings the bar reads low (matches the hint's CONDIMENTS_LOW). */
export const GAUGE_LOW = 5;

/** The condiment bar's servings gauge: 20 pips, green, amber when low, red and "EMPTY" when out. */
export function servingsGauge(servings: number, max: number = CONDIMENTS.servings): { pips: number; max: number; tone: GaugeTone; text: string } {
  const n = Math.max(0, Math.min(max, Math.round(servings)));
  const tone: GaugeTone = n === 0 ? 'empty' : n <= GAUGE_LOW ? 'low' : 'ok';
  return { pips: n, max, tone, text: n === 0 ? 'EMPTY: bring a box' : `${n}/${max}` };
}

/** Box `i` of the corner stack: two columns, stacking up, in px from the corner's centre. */
export function boxStackOffset(i: number): { x: number; y: number } {
  const col = i % 2;
  const row = Math.floor(i / 2);
  return { x: (col === 0 ? -9 : 9) + (row % 2 === 0 ? 0 : col === 0 ? 3 : -3), y: row === 0 ? 0 : -row * 11 };
}

export interface CupOnCounter {
  item: ItemKind;
  /** About to go stale (≤ 5 s left): it blinks. */
  stale: boolean;
  /** A rung-up customer is waiting for exactly this drink. */
  wanted: boolean;
  /** FB2 A2: a hot cup that has gone cold (a customer who takes it won't pay). */
  cold?: true;
}

/** A hot cup on the counter blinks from this much cold (0..1 by `slotCool`). */
export const COLD_BLINK = 0.85;

/** The cups on the pickup coasters, left to right (at most the counter's slots). */
export function pickupCups(state: Pick<GameState, 'pass' | 'gear' | 'customers' | 'tick'>): CupOnCounter[] {
  const want = new Set<DrinkId>();
  for (const c of state.customers) if (c.stage === 'pickup') want.add(c.drink), (c.extra ?? []).forEach((d) => want.add(d));
  const st = state as GameState;
  return state.pass.slice(0, passSlots(st)).map((i) => {
    // 3.3.3 (FB2 A2): hot Gear cups never go stale on the pass timer now; they blink once nearly cold, by `slotCool`
    const cools = coolsOnCounter(st, i);
    const c = cools ? slotCool(st, i) : 0;
    return { item: i.item, stale: cools ? c >= COLD_BLINK : i.ticksLeft <= 5 * TICK_RATE, wanted: want.has(i.item as DrinkId), ...(cools && c >= 1 ? { cold: true as const } : {}) };
  });
}
