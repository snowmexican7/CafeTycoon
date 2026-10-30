import { GEAR } from '../data/gear';
import { ECONOMY } from '../data/economy';
import { TICK_RATE } from '../sim/constants';
import { podsOnly } from '../sim/gear';
import { passSlots } from '../sim/pickup';
import type { DrinkId, GameState, PlayerId, Station, Vec2 } from '../sim/types';
import { nextStepIndex, ticketSteps } from '../ui/tickets';

/**
 * 3.3.2 (Kennedy's playtest): the pure half of three overlays, no Pixi here so it is unit-tested.
 *  - floating counts over each station (how many are left; nothing at all when it's empty),
 *  - cooling rings (a 0..1 "freshness" fraction and its colour: red → orange → yellow → blue when cold),
 *  - recipe step icons over a carried cup (what's done, what's next), from the tickets' own step lists.
 */

export type CountTone = 'ok' | 'low' | 'cold';

export interface StationCount {
  id: string;
  pos: Vec2;
  /** Always ≥ 1: an empty station gets no entry at all (no "0" floating forever). */
  n: number;
  tone: CountTone;
  /** 0..1 freshness of what's waiting (1 = just made, 0 = cold), when the sim has a real timer for it. */
  cool: number | null;
}

/** At or below this many left the count reads low (amber). */
export const COUNT_LOW = 2;

/**
 * One count per station that has something waiting: cold brew cups left on a batch tap, cups left in a drip
 * pot, or a finished item sitting at the machine (a pulled shot = 1). Counters, the bin and empty or
 * still-brewing machines get nothing.
 */
export function stationCounts(state: Pick<GameState, 'stations' | 'tick'>): StationCount[] {
  const out: StationCount[] = [];
  for (const s of state.stations) {
    if (s.kind === 'counter' || s.kind === 'trash') continue;
    let n = 0;
    let cool: number | null = null;
    let cold = false;
    if (s.batchLeft !== undefined) n = s.batchLeft;
    else if (s.potLeft !== undefined && s.busyTicksLeft <= 0) {
      n = s.potLeft;
      cool = potCool(s, state.tick);
      cold = s.potOff === 'cold' || cool === 0;
    } else if (s.output) n = 1;
    if (n <= 0) continue;
    out.push({ id: s.id, pos: s.pos, n, tone: cold ? 'cold' : n <= COUNT_LOW && s.batchLeft !== undefined ? 'low' : 'ok', cool });
  }
  return out;
}

/** Clamp `ticksLeft / total` to 0..1 (a bad or zero total reads as cold). */
export function coolFraction(ticksLeft: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(1, ticksLeft / total));
}

/** A drip pot's freshness: 1 when it finished brewing, 0 at `potColdAt`. Null when it never goes cold (thermal urn). */
export function potCool(s: Pick<Station, 'gear' | 'potColdAt'>, tick: number): number | null {
  const pot = s.gear ? GEAR[s.gear]?.pot : undefined;
  if (!pot || pot.coldAfter === null || s.potColdAt === undefined) return null;
  return coolFraction(s.potColdAt - tick, Math.round(pot.coldAfter * TICK_RATE));
}

/** Each cup on the pickup coasters (left to right): 1 when set down, 0 when it goes stale and is binned. */
export function passCool(state: Pick<GameState, 'pass' | 'gear' | 'stations'>): number[] {
  return state.pass.slice(0, passSlots(state as GameState)).map((p) => coolFraction(p.ticksLeft, Math.round((ECONOMY.pass.staleSeconds[p.item] ?? 60) * TICK_RATE)));
}

/** Ring colours, hot to cold. */
export const COOL_COLORS = { red: 0xe0453a, orange: 0xf08a2e, yellow: 0xf2cf3a, blue: 0x5aa8e6 } as const;

/** Kennedy's ring: red while fresh, orange about halfway, yellow near the end, blue once cold (0). */
export function coolColor(frac: number): number {
  if (frac <= 0) return COOL_COLORS.blue;
  if (frac > 0.6) return COOL_COLORS.red;
  if (frac > 0.25) return COOL_COLORS.orange;
  return COOL_COLORS.yellow;
}

export type StepState = 'done' | 'next' | 'todo';
export interface HeldStep { label: string; icon: string; state: StepState }
export interface HeldRecipe { drink: DrinkId; steps: HeldStep[] }

/** A small icon per ticket step word (src/ui/live.ts DRINK_STEPS + ticketSteps). */
export const STEP_ICON: Record<string, string> = {
  Grind: '⚙️', Pull: '☕', 'Pull again': '☕', Pod: '☕', Shot: '☕', Steam: '♨️', Foam: '☁️', Milk: '🥛', Cream: '🥛',
  Cocoa: '🍫', Tap: '🧊', Whisk: '🍵', Pour: '🫖', Drip: '🫖', Water: '💧', 'Hand off': '🛎️', Pickup: '🛎️',
};

/**
 * What the cup in this barista's hands is on its way to, and which steps are done. The target is the
 * first waiting customer (rung up at pickup first, then the order line) whose drink this item belongs to,
 * the same "oldest ticket" read the tickets use. Null with empty hands, a mop or box, or nobody wanting it.
 */
export function heldRecipe(state: Pick<GameState, 'players' | 'customers' | 'gear' | 'stations'>, playerId: PlayerId): HeldRecipe | null {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.tool !== null || p.holding === null) return null;
  const gear = state.gear === true;
  const pods = podsOnly(state as GameState);
  const wants: DrinkId[] = [];
  const ordered = [...state.customers.filter((c) => c.stage === 'pickup'), ...state.customers.filter((c) => c.stage !== 'pickup')];
  for (const c of ordered) wants.push(c.drink, ...(c.extra ?? []));
  const holding = p.holding;
  // a finished drink goes to whoever ordered exactly it; a half-made one to the first ticket it fits
  let drink = wants.find((d) => d === holding) ?? wants.find((d) => nextStepIndex(d, holding, pods, gear) !== null);
  // a finished drink nobody has ordered (yet): still show it as done
  if (!drink && holding !== 'grounds') drink = holding;
  if (!drink) return null;
  const next = nextStepIndex(drink, holding, pods, gear);
  if (next === null) return null;
  const steps = ticketSteps(drink, pods, gear).map((label, i) => ({ label, icon: STEP_ICON[label] ?? '•', state: (i < next ? 'done' : i === next ? 'next' : 'todo') as StepState }));
  return { drink, steps };
}
