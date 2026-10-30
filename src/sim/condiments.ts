/*
 * Batch/pickup (docs/superpowers/specs/2026-10-30-batch-pickup-design.md §4): the condiment bar and its stock box.
 * Gear runs only. The bar holds `CONDIMENTS.servings`; boxes are bought at night ($6 each, never on credit)
 * and wait in the corner (`state.condimentBoxes`) until someone carries one (`Player.tool === 'box'`) to the bar.
 *
 *  - `applyCondimentBoxInput(state, input)`: the night input (Gear, night, connected people only).
 *  - `takeBox(state, p)` / `refillBar(state, p)`: carry a box from the corner (empty hands, in range) and use it on the bar.
 *  - `returnBox(state, p)`: a carried box goes back to the corner (R, leaving, closing): never lost, never doubled.
 *  - `wantsCondiments` / `noteCondiments`: the stop at the bar after pickup (Task 10; called from `stepPickup`).
 *
 * Must not import ./gear. Pure, no RNG.
 */
import { ECONOMY } from '../data/economy';
import { CONDIMENTS_ID, layoutFor } from '../data/layout';
import { emitLog } from './log';
import { nearestStation } from './movement';
import { tally } from './tally';
import type { Customer, DrinkId, GameState, Player, PlayerInput } from './types';

export const CONDIMENTS = { servings: 20, share: 0.6, blackTip: 0.8, boxCost: 6, maxBoxes: 10 } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Night input: buy `boxes` condiment boxes at $6 each, only if the cash covers all of them. */
export function applyCondimentBoxInput(state: GameState, input: Extract<PlayerInput, { kind: 'condimentBox' }>): GameState {
  if (state.gear !== true || state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  const cost = round2(input.boxes * CONDIMENTS.boxCost);
  if (state.cash < cost) return state;
  state.cash = round2(state.cash - cost);
  state.condimentBoxes = (state.condimentBoxes ?? 0) + input.boxes;
  return state;
}

/** Put a carried box back in the corner. */
export function returnBox(state: GameState, p: Player): void {
  if (p.tool !== 'box') return;
  p.tool = null;
  state.condimentBoxes = (state.condimentBoxes ?? 0) + 1;
  const at = layoutFor(state.tier).boxCorner;
  emitLog(state, 'drop', { item: 'box', x: at.x, y: at.y });
}

/** Gear, empty hands and no tool, a box waiting, and within interact range of the box corner. */
export function canTakeBox(state: GameState, p: Player): boolean {
  if (state.gear !== true || p.tool !== null || p.holding !== null) return false;
  if ((state.condimentBoxes ?? 0) <= 0) return false;
  const at = layoutFor(state.tier).boxCorner;
  return Math.hypot(p.pos.x - at.x, p.pos.y - at.y) <= ECONOMY.interactRangeTiles;
}

/** Pick a box up from the corner. False when nothing was taken. */
export function takeBox(state: GameState, p: Player): boolean {
  if (!canTakeBox(state, p)) return false;
  p.tool = 'box';
  state.condimentBoxes = (state.condimentBoxes ?? 0) - 1;
  return true;
}

/** Empty a carried box into the bar: refills it to full. A full bar, or any other spot, keeps the box in hand. */
export function refillBar(state: GameState, p: Player): boolean {
  if (state.gear !== true || p.tool !== 'box' || !state.condiments) return false;
  if (nearestStation(state, p.pos)?.id !== CONDIMENTS_ID) return false;
  if (state.condiments.servings >= CONDIMENTS.servings) return false;
  state.condiments.servings = CONDIMENTS.servings;
  p.tool = null;
  emitLog(state, 'condiment.refill', { by: p.id });
  return true;
}

/** What a customer who wanted cream or sugar says at an empty bar (picked by customer id). */
export const BLACK_LINES = ['"No milk? Fine. Black it is."', '"Out of sugar. Bold choice."', '"Guess I take it black now."'] as const;

/**
 * The "wants condiments" roll for a customer, in [0, 1): a pure hash of the customer id and how many of their
 * group's drinks are still to come (`left`), so it draws nothing from the run's RNG and replays agree.
 */
export function condimentRoll(cid: number, left: number): number {
  return (Math.imul(cid * 8 + left + 1, 2654435761) >>> 0) / 4294967296;
}

/** Gear, a bar in the shop, plain drip or cold brew, and the roll says yes (about 60%). */
export function wantsCondiments(state: GameState, c: Customer, drink: DrinkId): boolean {
  if (state.gear !== true || !state.condiments) return false;
  if (drink !== 'drip' && drink !== 'coldBrew') return false;
  return condimentRoll(c.id, c.extra?.length ?? 0) < CONDIMENTS.share;
}

/** After a wanting customer is served: one serving off the bar, or (`black`, the bar was empty) a black coffee and a grumble. */
export function noteCondiments(state: GameState, c: Customer, black: boolean): void {
  if (black) {
    tally(state.today, 'blackCoffees');
    emitLog(state, 'condiment.black', { customer: c.id, text: BLACK_LINES[c.id % BLACK_LINES.length] });
    return;
  }
  if (state.condiments) state.condiments.servings = Math.max(0, state.condiments.servings - 1);
  emitLog(state, 'condiment.use', { customer: c.id });
}
