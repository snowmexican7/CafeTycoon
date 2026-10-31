import { secondsToTicks } from './constants';
import { ECONOMY } from '../data/economy';
import { emitLog } from './log';
import { tillRingUp } from './till';
import { serveCustomer, serveTarget } from './customers';
import { tryCorrectName, tryKickCamper } from './eggs';
import { tally } from './tally';
import { passSlots, spotOf } from './pickup';
import { coolsOnCounter, madeAtFromHand, takeBackIndex, slotCool } from './cooling';
import { madeOnPass } from './handmade';
import type { GameState, Player, PlayerId, Station } from './types';

/**
 * The counter. Classic: hand a drink to a customer, park it on the pass, or take one back. Gear (batch/pickup):
 * `at` is the counter-kind spot pressed (see `gearCounter`).
 */
export function counterInteract(state: GameState, playerId: PlayerId, at?: Station): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.holding === 'grounds') return state;
  if (state.gear === true) return gearCounter(state, player, at);

  // B8: empty hands at the counter can politely kick a Wi-Fi camper or fix a name mix-up.
  if (player.holding === null) {
    if (tryKickCamper(state, playerId) || tryCorrectName(state, playerId)) return state;
  }

  if (player.holding !== null) {
    const drink = player.holding;
    if (state.customers.some((c) => c.egg !== 'camper' && c.drink === drink)) {
      serveCustomer(state, mostImpatient(state, (c) => c.egg !== 'camper' && c.drink === drink), drink, playerId, player.cupSlips ?? 0, player.cupTemp === true);
      player.holding = null;
      delete player.cupSlips;
      delete player.cupTemp;
    } else if (state.pass.length < ECONOMY.pass.slots) {
      state.pass.push({ item: drink, ticksLeft: secondsToTicks(ECONOMY.pass.staleSeconds[drink]), ...(player.cupSlips ? { slips: player.cupSlips } : {}), ...(player.cupTemp ? { temp: true } : {}) });
      player.holding = null;
      delete player.cupSlips;
      delete player.cupTemp;
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
    serveCustomer(state, customer, item.item, playerId, item.slips ?? 0, item.temp === true);
    emitLog(state, 'pass.serve', { item: item.item, by: playerId });
  } else if (state.pass.length > 0) {
    takeBack(state, player);
  }
  return state;
}

/**
 * Gear: nobody hands a drink over. A drink in hand at any counter spot (the till, the pickup counter and the bar
 * are one long counter) is set on the pickup counter, and its customer takes it (`stepPickup`). Empty hands:
 * the till shoos a camper or rings up the next order; the pickup counter fixes a name mix-up or takes the
 * stalest cup back; the bar does nothing here.
 */
function gearCounter(state: GameState, player: Player, at?: Station): GameState {
  const spot = spotOf(at);
  if (spot === 'sink' || spot === 'syrups') return state; // FB2 A3: the sink has its own rules (src/sim/sink.ts); FB2 B8: so does the syrup rack
  if (player.holding !== null) {
    if (player.holding !== 'grounds' && state.pass.length < passSlots(state)) {
      const drink = player.holding;
      state.pass.push({
        item: drink,
        ticksLeft: secondsToTicks(ECONOMY.pass.staleSeconds[drink]),
        ...(player.cupSlips ? { slips: player.cupSlips } : {}),
        ...(player.cupTemp ? { temp: true } : {}),
        by: player.id,
        madeAt: madeAtFromHand(state, player), // A2: the cup's clock follows it onto the counter
        ...madeOnPass(player), // FB2 B8: and how it was made
      });
      player.holding = null;
      delete player.cupSlips;
      delete player.cupTemp;
      delete player.heldSince;
      delete player.made;
      emitLog(state, 'pass.put', { item: drink, by: player.id });
    }
    return state;
  }
  if (spot === 'till') {
    if (!tryKickCamper(state, player.id)) tillRingUp(state, player.id);
  } else if (spot === 'pickup') {
    if (!tryCorrectName(state, player.id, at) && state.pass.length > 0) takeBack(state, player);
  }
  return state;
}

/** Empty hands take a cup back off the pass: classic, the stalest; Gear (A2), the coldest cooling cup first (`takeBackIndex`), carrying its clock. */
function takeBack(state: GameState, player: Player): void {
  const gear = state.gear === true;
  const [item] = state.pass.splice(gear ? takeBackIndex(state) : stalestIndex(state), 1);
  player.holding = item.item;
  if (item.slips) player.cupSlips = item.slips;
  else delete player.cupSlips;
  if (item.temp) player.cupTemp = true;
  else delete player.cupTemp;
  if (gear && item.madeAt !== undefined) player.heldSince = item.madeAt;
  else delete player.heldSince;
  if (item.made) player.made = item.made;
  else delete player.made;
  emitLog(state, 'pass.take', { item: item.item, by: player.id });
  if (gear) emitLog(state, 'pickup.takeBack', { drink: item.item, by: player.id, cold: slotCool(state, item) >= 1 });
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

/**
 * Drinks on the pass go stale; a stale one is thrown away and counts as waste. Gear (A2): a hot cup with a known
 * made tick cools instead (src/sim/cooling.ts) and stays until someone takes it.
 */
export function stepPass(state: GameState): GameState {
  const kept = [];
  for (const item of state.pass) {
    if (coolsOnCounter(state, item)) {
      kept.push(item);
      continue;
    }
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
