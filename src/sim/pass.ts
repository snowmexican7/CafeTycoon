import { ECONOMY } from '../data/economy';
import { emitLog } from './log';
import { serveCustomer } from './customers';
import { tally } from './tally';
import type { GameState, PlayerId } from './types';

/** The counter pass: hand a drink to a customer, park it on the pass, or take one back. */
export function counterInteract(state: GameState, playerId: PlayerId): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.holding === 'grounds') return state;

  if (player.holding !== null) {
    const drink = player.holding;
    if (state.customers.some((c) => c.drink === drink)) {
      serveCustomer(state, mostImpatient(state, (c) => c.drink === drink), drink);
      player.holding = null;
    } else if (state.pass.length < ECONOMY.pass.slots) {
      state.pass.push({ item: drink, ticksLeft: ECONOMY.pass.staleSeconds[drink] * 60 });
      player.holding = null;
      emitLog(state, 'pass.put', { item: drink, by: playerId });
    }
    return state;
  }

  const onPass = new Set(state.pass.map((i) => i.item));
  const wanting = state.customers.some((c) => onPass.has(c.drink));
  if (wanting) {
    const customer = mostImpatient(state, (c) => onPass.has(c.drink));
    const index = stalestIndex(state, customer.drink);
    const [item] = state.pass.splice(index, 1);
    serveCustomer(state, customer, item.item);
    emitLog(state, 'pass.serve', { item: item.item, by: playerId });
  } else if (state.pass.length > 0) {
    const [item] = state.pass.splice(stalestIndex(state), 1);
    player.holding = item.item;
    emitLog(state, 'pass.take', { item: item.item, by: playerId });
  }
  return state;
}

function mostImpatient(state: GameState, match: (c: GameState['customers'][number]) => boolean) {
  let best = null as GameState['customers'][number] | null;
  for (const c of state.customers) {
    if (match(c) && (best === null || c.patienceLeft < best.patienceLeft)) best = c;
  }
  return best!;
}

function stalestIndex(state: GameState, drink?: string): number {
  let best = -1;
  state.pass.forEach((item, i) => {
    if (drink !== undefined && item.item !== drink) return;
    if (best === -1 || item.ticksLeft < state.pass[best].ticksLeft) best = i;
  });
  return best;
}

/** Drinks on the pass go stale; a stale one is thrown away and counts as waste. */
export function stepPass(state: GameState): GameState {
  const kept = [];
  for (const item of state.pass) {
    item.ticksLeft -= 1;
    if (item.ticksLeft > 0) kept.push(item);
    else {
      tally(state.today, 'wasted');
      emitLog(state, 'pass.stale', { item: item.item });
    }
  }
  state.pass = kept;
  return state;
}
