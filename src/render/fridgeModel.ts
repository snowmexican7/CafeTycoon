import { CONDIMENTS_ID, FRIDGE_ID } from '../data/layout';
import { FRIDGES } from '../data/fridges';
import { autoMilk, closingSoon, fridgeGear, isMilkStation } from '../sim/fridge';
import type { GameState, Player, SimEvent, Station } from '../sim/types';

/**
 * ui-3.4.1 (FB2 A4), the pure half of the fridge's drawing: the line each fridge event toasts over the scene, where
 * the milk out at the bar stands, and which spot glows for the local barista. No Pixi here, so it is unit-tested.
 */

export const FRIDGE_EVENTS = ['fridge.take', 'fridge.put', 'milk.out', 'milk.lift', 'bar.lift', 'supply.spoil', 'closing.soon', 'fridge.auto'] as const;
export type FridgeEventKind = (typeof FRIDGE_EVENTS)[number];
export const isFridgeEvent = (k: string): k is FridgeEventKind => (FRIDGE_EVENTS as readonly string[]).includes(k);

export interface FridgeToast { text: string; tone: 'good' | 'warn' | 'bad'; at?: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The line a fridge event shows over the scene (and where), or null for none. */
export function fridgeToast(e: Pick<SimEvent, 'kind' | 'data'>, names: (id: string) => string, fridgeName = 'the fridge'): FridgeToast | null {
  const d = e.data as Record<string, unknown>;
  const n = Number(d.n ?? d.count ?? 0);
  const who = typeof d.by === 'string' && d.by !== 'auto' ? names(d.by) : '';
  switch (e.kind) {
    case 'fridge.take':
      return { text: `🥛 ${who} grabbed milk (${n})`, tone: 'good', at: FRIDGE_ID };
    case 'fridge.put':
      if (d.by === 'auto') return { text: `🐄 The ${fridgeName} took its milk back (${n})`, tone: 'good', at: FRIDGE_ID };
      return d.item === 'bar'
        ? { text: `❄️ ${who} put the condiment bar away`, tone: 'good', at: FRIDGE_ID }
        : { text: `❄️ ${who} put the milk away (${n})`, tone: 'good', at: FRIDGE_ID };
    case 'milk.out':
      return { text: `🥛 ${who} put ${plural(n, 'milk', 'milk')} out`, tone: 'good', ...(typeof d.station === 'string' ? { at: d.station } : {}) };
    case 'milk.lift':
      return { text: `🥛 ${who} picked up the milk: put it in the fridge`, tone: 'warn', ...(typeof d.station === 'string' ? { at: d.station } : {}) };
    case 'bar.lift':
      return { text: `📦 ${who} packed up the condiment bar: put it in the fridge`, tone: 'warn', at: CONDIMENTS_ID };
    case 'supply.spoil':
      return d.item === 'bar'
        ? { text: `🥀 The condiment bar was left out: ${plural(n, 'serving')} went bad`, tone: 'bad', at: CONDIMENTS_ID }
        : { text: `🥀 Milk left out went bad (${n})`, tone: 'bad' };
    case 'closing.soon':
      return { text: '⏰ Closing soon! Put the milk and the condiment bar away', tone: 'warn' };
    case 'fridge.auto':
      return { text: `🐄 Moo! The ${fridgeName} poured ${n} milk`, tone: 'good', at: FRIDGE_ID };
    default:
      return null;
  }
}

/** The fridge's name for a toast ("Udder-Matic 3000"), or "fridge". */
export function fridgeLabel(state: GameState): string {
  const id = fridgeGear(state);
  return id ? FRIDGES[id].name : 'fridge';
}

/** The milk station the milk out at the bar stands beside: the first steamer (or steam wand), else a cold brew tap. */
export function milkSpot(state: Pick<GameState, 'stations'>): Station | null {
  const milk = state.stations.filter((s) => isMilkStation(s) && !s.dead);
  return milk.find((s) => s.kind === 'steamer' && !s.twin) ?? milk.find((s) => s.kind === 'steamer') ?? milk[0] ?? null;
}

/** Cartons to draw by the bar for `n` milk out (one per carton's worth, 1..3). */
export function cartonsFor(n: number): number {
  if (n <= 0) return 0;
  return Math.max(1, Math.min(3, Math.ceil(n / 8)));
}

/**
 * Where the local barista should go next with what they hold: the fridge with a carton or the bar box at closing
 * (or a carton when no milk station is there), a milk station with a carton during the day. Null = nothing to show.
 */
export function fridgeGlow(state: GameState, me: Player | undefined): { at: string; tone: 'fridge' | 'milk' } | null {
  if (!me || state.gear !== true || !state.stations.some((s) => s.id === FRIDGE_ID)) return null;
  if (state.phase !== 'day' && state.phase !== 'closing') return null;
  if (me.tool === 'bar') return { at: FRIDGE_ID, tone: 'fridge' };
  if (me.tool === 'milk') {
    const spot = milkSpot(state);
    return closingSoon(state) || !spot || autoMilk(state) ? { at: FRIDGE_ID, tone: 'fridge' } : { at: spot.id, tone: 'milk' };
  }
  return null;
}
