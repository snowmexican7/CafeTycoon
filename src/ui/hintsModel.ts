import { DRINK_IDS } from '../data/drinks';
import type { GameState, PlayerId } from '../sim/types';
import { TIERS } from '../sim/growth';
import { growNudge } from './growModel';

/**
 * ui-3.4.0: first-time hints for new players. Each one shows once, ever (kept in this browser's localStorage under
 * HINTS_KEY, a UI-owned key next to the storage lane's settings). "Snooze" hides them all for a while; "Turn off"
 * hides them for good until switched back on in the pause menu. Pure: the DOM lives in hints.ts.
 */
export type HintId = 'till' | 'pickup' | 'sink' | 'standPrice' | 'restock' | 'shopfront';

export const HINTS_KEY = 'cafetycoon.tips';
export const SNOOZE_MS = 15 * 60 * 1000;

export interface Hint {
  icon: string;
  title: string;
  text: string;
  /** Where the bubble sits: beside the shop floor by day, or over the night panel's corner. */
  where: 'day' | 'night';
}

export const HINTS: Record<HintId, Hint> = {
  till: { icon: '🧾', title: 'Take the order', text: 'Walk to the till and press E, then make the drink.', where: 'day' },
  pickup: { icon: '☕', title: 'Hand it off', text: 'Carry the drink to PICKUP and press E.', where: 'day' },
  sink: { icon: '🫖', title: 'Dump the cold pot', text: 'Press E on the drip machine, then E at the sink.', where: 'day' },
  standPrice: { icon: '⛱️', title: 'Stand prices are lower', text: `Commuters pay ${Math.round((1 - TIERS.stand.price) * 100)}% less here. Grow to a cart for better pay.`, where: 'day' },
  restock: { icon: '📦', title: 'Restock before open', text: 'Open the Restock tab and top up beans and milk.', where: 'night' },
  shopfront: { icon: '🏪', title: 'Ready to grow?', text: 'Extras → Shopfront unlocks a bigger shop and better prices.', where: 'night' },
};

/** Day hints, most urgent first; then night hints. */
export const HINT_ORDER: HintId[] = ['till', 'pickup', 'sink', 'standPrice', 'shopfront', 'restock'];

export interface HintsState {
  seen: HintId[];
  /** Epoch ms; no hints before this. */
  snoozedUntil?: number;
  off?: boolean;
}

export const NEW_HINTS: HintsState = { seen: [] };

export function parseHints(raw: string | null | undefined): HintsState {
  if (!raw) return { seen: [] };
  try {
    const v = JSON.parse(raw) as Partial<HintsState>;
    const seen = Array.isArray(v.seen) ? v.seen.filter((x): x is HintId => typeof x === 'string' && x in HINTS) : [];
    return { seen: [...new Set(seen)], ...(typeof v.snoozedUntil === 'number' ? { snoozedUntil: v.snoozedUntil } : {}), ...(v.off === true ? { off: true } : {}) };
  } catch {
    return { seen: [] };
  }
}

export const isSnoozed = (s: HintsState, now: number) => (s.snoozedUntil ?? 0) > now;

export function canShow(s: HintsState, id: HintId, now: number): boolean {
  return !s.off && !isSnoozed(s, now) && !s.seen.includes(id);
}

export function markSeen(s: HintsState, id: HintId): HintsState {
  return s.seen.includes(id) ? s : { ...s, seen: [...s.seen, id] };
}

export function snooze(s: HintsState, now: number, ms = SNOOZE_MS): HintsState {
  return { ...s, snoozedUntil: now + ms };
}

export function setOff(s: HintsState, off: boolean): HintsState {
  const { off: _o, snoozedUntil: _s, ...rest } = s;
  return off ? { ...rest, off: true } : rest;
}

/** "Show tips again": forget what was seen and wake them up. */
export function resetHints(s: HintsState): HintsState {
  return { seen: [], ...(s.off ? { off: true } : {}) };
}

/** Status line for the pause menu. */
export function hintsStatus(s: HintsState, now: number): string {
  if (s.off) return 'Off';
  if (isSnoozed(s, now)) return `Snoozed for ${Math.max(1, Math.ceil(((s.snoozedUntil ?? now) - now) / 60000))} min`;
  const left = HINT_ORDER.filter((id) => !s.seen.includes(id)).length;
  return left ? `On · ${left} still to show` : 'On · all seen';
}

/** Which hints the situation calls for right now (in HINT_ORDER), regardless of seen/snoozed. */
export function hintTriggers(state: GameState, me: PlayerId | null): HintId[] {
  const out = new Set<HintId>();
  const gear = state.gear === true;
  if (state.phase === 'day') {
    const p = state.players.find((x) => x.id === me);
    if (gear && state.customers.some((c) => (c.stage ?? 'order') === 'order')) out.add('till');
    if (gear && p?.holding && (DRINK_IDS as string[]).includes(p.holding)) out.add('pickup');
    if (gear && (p?.tool === 'pot' || state.stations.some((s) => s.stale || (s.potLeft !== undefined && s.potLeft > 0 && s.potColdAt !== undefined && s.potColdAt <= state.tick)))) out.add('sink');
    if (state.tier === 'stand' && state.customers.length > 0) out.add('standPrice');
  } else if (state.phase === 'night') {
    if (growNudge(state)) out.add('shopfront');
    if (state.day >= 2) out.add('restock');
  }
  return HINT_ORDER.filter((id) => out.has(id));
}

/** The one hint to show now, or null. */
export function pickHint(s: HintsState, state: GameState, me: PlayerId | null, now: number): HintId | null {
  return hintTriggers(state, me).find((id) => canShow(s, id, now)) ?? null;
}
