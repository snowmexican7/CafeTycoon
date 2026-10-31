/**
 * FB2 B7 (the rest): pure helpers for the tray table UI — live list over the table, tray in hand,
 * pickup-slot coaster with the customer's name, per-cup cooling, and log → bubble/cue lines.
 * No Pixi here (unit-tested); layers/pickup.ts, actors.ts and scene.ts draw from these.
 */
import { layoutFor, TRAY_ID } from '../data/layout';
import { DRINK_INFO } from '../data/drinks';
import { passSlots } from '../sim/pickup';
import { trayCool } from '../sim/tray';
import type { DrinkId, GameState, Player, PlayerId, TrayCup, TrayItem, Vec2 } from '../sim/types';

/** Customer label for a tray: their name, else "#id". */
export function trayCustomerLabel(state: Pick<GameState, 'customers'>, customerId: number): string {
  const c = state.customers.find((x) => x.id === customerId);
  return c?.name?.trim() || `#${customerId}`;
}

/** Short drink word for a tray line (matches ticket short names). */
export function trayDrinkShort(drink: DrinkId): string {
  return DRINK_INFO[drink]?.short ?? drink;
}

export interface TrayLineView {
  drink: DrinkId;
  short: string;
  done: boolean;
  /** 0 fresh .. 1 cold when the cup is on the tray; null while waiting. */
  cool: number | null;
}

export interface TrayTableView {
  customer: number;
  label: string;
  done: number;
  total: number;
  complete: boolean;
  items: TrayLineView[];
}

/** The live list over the tray table, or null when the table is empty / classic. */
export function trayTableView(state: Pick<GameState, 'gear' | 'tray' | 'customers' | 'tick'>): TrayTableView | null {
  if (state.gear !== true || !state.tray) return null;
  const t = state.tray;
  const items = t.items.map((x) => lineView(state as GameState, x));
  const done = items.filter((x) => x.done).length;
  return {
    customer: t.customer,
    label: trayCustomerLabel(state, t.customer),
    done,
    total: items.length,
    complete: done === items.length && items.length > 0,
    items,
  };
}

function lineView(state: GameState, x: TrayItem): TrayLineView {
  return {
    drink: x.drink,
    short: trayDrinkShort(x.drink),
    done: x.done,
    cool: x.done ? trayCool(state, x) : null,
  };
}

export interface TrayHandView {
  customer: number;
  label: string;
  drinks: DrinkId[];
  /** Per-cup cool 0 fresh .. 1 cold (same length as drinks). */
  cool: number[];
}

/** What a barista carries when `tool === 'tray'`, or null. */
export function trayInHand(state: Pick<GameState, 'customers' | 'tick'>, player: Pick<Player, 'tool' | 'tray'>): TrayHandView | null {
  if (player.tool !== 'tray' || !player.tray) return null;
  const drinks = player.tray.items.map((x) => x.drink);
  const cool = player.tray.items.map((x) => trayCool(state as GameState, x));
  return { customer: player.tray.customer, label: trayCustomerLabel(state, player.tray.customer), drinks, cool };
}

export interface PassTrayView {
  /** Index into `state.pass` / the coaster row. */
  index: number;
  customer: number;
  label: string;
  drinks: DrinkId[];
  /** Per-cup cool 0 fresh .. 1 cold. */
  cool: number[];
}

/** Pickup coasters that are whole trays (PassItem.tray), left to right. */
export function passTraySlots(state: Pick<GameState, 'pass' | 'gear' | 'customers' | 'tick' | 'stations'>): PassTrayView[] {
  if (state.gear !== true) return [];
  const st = state as GameState;
  const out: PassTrayView[] = [];
  state.pass.slice(0, passSlots(st)).forEach((slot, index) => {
    if (!slot.tray) return;
    out.push({
      index,
      customer: slot.tray.customer,
      label: trayCustomerLabel(state, slot.tray.customer),
      drinks: slot.tray.drinks.map((d) => d.drink),
      cool: slot.tray.drinks.map((d) => trayCool(st, d as TrayCup)),
    });
  });
  return out;
}

/** Where the tray table sits (tiles), for bubbles and overlays. */
export function trayTablePos(state: Pick<GameState, 'tier' | 'stations'>): Vec2 {
  const st = state.stations.find((s) => s.id === TRAY_ID);
  if (st) return { ...st.pos };
  return { ...layoutFor(state.tier).trayTable };
}

/** One-shot tray feedback from the sim log. */
export type TrayBurst =
  | { kind: 'refuse'; text: string; by: PlayerId; drink: DrinkId; at: Vec2 }
  | { kind: 'cue'; text: string; tone: 'good' | 'warn' | 'bad'; at: Vec2 };

const REFUSE_LINES = ["That doesn't go here", 'Wrong tray', "Can't take that"] as const;

/** Plain-English refuse line (picked by log seq so every client matches). */
export function trayRefuseLine(seq: number, drink?: unknown): string {
  const base = REFUSE_LINES[Math.abs(seq) % REFUSE_LINES.length]!;
  if (typeof drink === 'string' && drink in DRINK_INFO) return `${base} · ${trayDrinkShort(drink as DrinkId)}`;
  return base;
}

function playerPos(state: GameState, id: string): Vec2 {
  const p = state.players.find((x) => x.id === id);
  return p ? { ...p.pos } : trayTablePos(state);
}

function customerPos(state: GameState, id: number): Vec2 {
  const c = state.customers.find((x) => x.id === id);
  if (!c) return trayTablePos(state);
  // Approximate: trays are taken at pickup; fall back to the table.
  return { ...layoutFor(state.tier).pickup };
}

/**
 * Tray events between two snapshots → refuse bubble + small cues. Same seq cursor idea as chaos/crew.
 */
export function trayBursts(prev: GameState | null, next: GameState, lastSeq: number): { bursts: TrayBurst[]; lastSeq: number } {
  const cursor = next.nextLogSeq - 1;
  if (!prev || prev.seed !== next.seed || cursor < lastSeq) return { bursts: [], lastSeq: cursor };
  const bursts: TrayBurst[] = [];
  const table = trayTablePos(next);
  for (const e of next.log) {
    if (e.seq <= lastSeq) continue;
    const d = e.data;
    const by = String(d.by ?? '');
    const customer = Number(d.customer);
    const label = Number.isFinite(customer) ? trayCustomerLabel(next, customer) : '';
    switch (e.kind) {
      case 'tray.refuse':
        bursts.push({
          kind: 'refuse',
          text: trayRefuseLine(e.seq, d.drink),
          by: by as PlayerId,
          drink: d.drink as DrinkId,
          at: by ? playerPos(next, by) : table,
        });
        break;
      case 'tray.claim':
        bursts.push({ kind: 'cue', text: `Tray for ${label}`, tone: 'good', at: table });
        break;
      case 'tray.add':
        bursts.push({
          kind: 'cue',
          text: `+${trayDrinkShort(d.drink as DrinkId)}`,
          tone: 'good',
          at: by ? playerPos(next, by) : table,
        });
        break;
      case 'tray.pick':
        bursts.push({ kind: 'cue', text: `Tray up · ${label}`, tone: 'good', at: by ? playerPos(next, by) : table });
        break;
      case 'tray.put':
        bursts.push({ kind: 'cue', text: `Tray ready · ${label}`, tone: 'good', at: { ...layoutFor(next.tier).pickup } });
        break;
      case 'tray.take':
        bursts.push({ kind: 'cue', text: `${label} took the tray`, tone: 'good', at: customerPos(next, customer) });
        break;
      case 'tray.spill':
        bursts.push({
          kind: 'cue',
          text: `Tray spill! ${Number(d.cups) || 0} ${(Number(d.cups) || 0) === 1 ? 'cup' : 'cups'}`,
          tone: 'bad',
          at: by ? playerPos(next, by) : table,
        });
        break;
      case 'tray.void':
        bursts.push({
          kind: 'cue',
          text: Number(d.cups) > 0 ? `Tray voided · ${d.cups} wasted` : 'Tray voided',
          tone: 'warn',
          at: table,
        });
        break;
      default:
        break;
    }
  }
  return { bursts, lastSeq: Math.max(lastSeq, cursor) };
}

/** Hand-slot copy when carrying a tray (extends TOOL_LABEL). */
export function trayToolLabel(state: Pick<GameState, 'customers'>, player: Pick<Player, 'tool' | 'tray'>): { label: string; icon: string } | null {
  if (player.tool !== 'tray' || !player.tray) return null;
  const n = player.tray.items.length;
  const who = trayCustomerLabel(state, player.tray.customer);
  return { label: `Tray · ${who} · ${n} ${n === 1 ? 'cup' : 'cups'}`, icon: '🍽️' };
}

/** Done ticks for a tray list line (✓ / ○), for tests and text overlays. */
export function trayDoneMark(done: boolean): string {
  return done ? '✓' : '○';
}

/** Compact one-line summary of a tray on the table (for HUD/debug-free overlays). */
export function trayListLine(view: TrayTableView): string {
  const marks = view.items.map((x) => `${trayDoneMark(x.done)}${x.short}`).join(' ');
  return `${view.label} · ${view.done}/${view.total} · ${marks}`;
}
