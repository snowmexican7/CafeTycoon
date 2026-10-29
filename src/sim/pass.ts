import { secondsToTicks } from './constants';
import { ECONOMY } from '../data/economy';
import { emitLog } from './log';
import { serveCustomer, serveTarget } from './customers';
import { tryCorrectName, tryKickCamper } from './eggs';
import { tally } from './tally';
import type { GameState, PlayerId } from './types';

/** The counter pass: hand a drink to a customer, park it on the pass, or take one back. */
export function counterInteract(state: GameState, playerId: PlayerId): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.holding === 'grounds') return state;

  // B8: empty hands at the counter can politely kick a Wi-Fi camper or fix a name mix-up.
  if (player.holding === null) {
    if (tryKickCamper(state, playerId) || tryCorrectName(state, playerId)) return state;
  }

  if (player.holding !== null) {
    const drink = player.holding;
    if (state.customers.some((c) => c.egg !== 'camper' && c.drink === drink)) {
      serveCustomer(state, mostImpatient(state, (c) => c.egg !== 'camper' && c.drink === drink), drink, playerId);
      player.holding = null;
    } else if (state.pass.length < ECONOMY.pass.slots) {
      state.pass.push({ item: drink, ticksLeft: secondsToTicks(ECONOMY.pass.staleSeconds[drink]) });
      player.holding = null;
      emitLog(state, 'pass.put', { item: drink, by: playerId });
    }
    return state;
  }

  const onPass = new Set(state.pass.map((i) => i.item));
  // Skip Wi-Fi campers — they never order (B8).
  const wanting = state.customers.some((c) => c.egg !== 'camper' && onPass.has(c.drink));
  if (wanting) {
    const customer = mostImpatient(state, (c) => c.egg !== 'camper' && onPass.has(c.drink));
    const index = stalestIndex(state, customer.drink);
    const [item] = state.pass.splice(index, 1);
    serveCustomer(state, customer, item.item, playerId);
    emitLog(state, 'pass.serve', { item: item.item, by: playerId });
  } else if (state.pass.length > 0) {
    const [item] = state.pass.splice(stalestIndex(state), 1);
    player.holding = item.item;
    emitLog(state, 'pass.take', { item: item.item, by: playerId });
  }
  return state;
}

/** The matching customer to serve: an upset one first, else the most impatient. */
function mostImpatient(state: GameState, match: (c: GameState['customers'][number]) => boolean) {
  return serveTarget(state, match)!;
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
