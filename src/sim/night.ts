import { canMake, hasStation, nextTierAffordable } from './growth';
import { emitLog } from './log';
import { roleSupplyCost } from './roles';
import { CATALOGUE, catalogueById } from '../data/catalogue';
import { ECONOMY, RESTOCK } from '../data/economy';
import { computeModifiers, resolveGamble } from './effects';
import { rngNext } from './rng';
import { tuneRadio } from './events';
import { startDay } from './run';
import { beginPreOpen } from './rearrange';
import { TICK_RATE, secondsToTicks } from './constants';
import { unlockDrink } from './unlocks';
import { packsThatFit } from './fridge';
import type { CatalogueItem, Effect, GameState, OwnedItem, PlayerId, PlayerInput, SupplyId } from './types';

/** Relaxed night: seconds the last call runs once enough of the room is ready. */
const LAST_CALL_SECONDS = 30;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Items the night may deal: not already owned (if permanent), prerequisites met, nothing excluded. */
export function eligibleItems(state: GameState, pool: CatalogueItem[] = CATALOGUE): CatalogueItem[] {
  const ownedIds = new Set(state.owned.map((o) => o.itemId));
  return pool.filter(
    (item) =>
      !(item.duration === 'permanent' && ownedIds.has(item.id)) &&
      (item.requires ?? []).every((id) => ownedIds.has(id)) &&
      !(item.excludes ?? []).some((id) => ownedIds.has(id)) &&
      !teachesNothing(state, item) &&
      !uselessAtTier(state, item),
  );
}

/** P3 B13: a card that only speeds up a station the shop does not have, or only teaches drinks it cannot make yet (FB1 WP5: read from the floor, so a full café hides nothing). */
function uselessAtTier(state: GameState, item: CatalogueItem): boolean {
  if (item.effects.length === 0) return false;
  return item.effects.every(
    (e) => (e.kind === 'stationSpeed' && !hasStation(state, e.station)) || (e.kind === 'unlock' && !canMake(state, e.drink)),
  );
}

/** A card whose only point is unlocking drinks the menu already has. */
function teachesNothing(state: GameState, item: CatalogueItem): boolean {
  const unlocks = item.effects.filter((e): e is Extract<Effect, { kind: 'unlock' }> => e.kind === 'unlock');
  if (unlocks.length === 0) return false;
  const known = state.unlocked ?? [];
  return unlocks.every((e) => known.includes(e.drink));
}

/** Pick one item by rarity weight and remove it from the array. */
function drawWeighted(state: GameState, items: CatalogueItem[]): CatalogueItem {
  const total = items.reduce((sum, i) => sum + ECONOMY.rarityWeights[i.rarity], 0);
  let roll = rngNext(state) * total;
  for (let i = 0; i < items.length; i++) {
    roll -= ECONOMY.rarityWeights[items[i].rarity];
    if (roll < 0) return items.splice(i, 1)[0];
  }
  return items.splice(items.length - 1, 1)[0];
}

/**
 * Deal tonight's hand: up to handSize eligible items, with at least one cheap option and at least two
 * upgrade paths when the pool allows. `skip` keeps cards out (a re-roll never re-deals the same hand).
 */
export function dealHand(state: GameState, pool: CatalogueItem[] = CATALOGUE, skip: string[] = []): GameState {
  let candidates = eligibleItems(state, pool).filter((i) => !skip.includes(i.id));
  // A re-roll late in a run can run the pool dry; then the skipped cards come back.
  if (candidates.length < ECONOMY.handSize) candidates = eligibleItems(state, pool).filter((i) => !state.boughtTonight.includes(i.id));
  const hand: CatalogueItem[] = [];
  while (hand.length < ECONOMY.handSize && candidates.length > 0) hand.push(drawWeighted(state, candidates));
  const isCheap = (i: CatalogueItem) => i.cost < ECONOMY.cheapThreshold;
  if (hand.length > 0 && !hand.some(isCheap)) {
    const cheap = candidates.filter(isCheap);
    if (cheap.length > 0) {
      const pick = drawWeighted(state, cheap);
      candidates.splice(candidates.indexOf(pick), 1);
      hand[hand.length - 1] = pick;
    }
  }
  if (hand.length > 1 && hand.every((i) => i.path === hand[0].path)) {
    const other = candidates.filter((i) => i.path !== hand[0].path);
    // Swap the first card for another path, unless that would lose the only cheap option.
    if (other.length > 0) {
      const pick = drawWeighted(state, other);
      const onlyCheap = isCheap(hand[0]) && !hand.slice(1).some(isCheap);
      if (!onlyCheap || isCheap(pick)) hand[0] = pick;
    }
  }
  state.hand = hand.map((i) => i.id);
  return state;
}

/** Price of `packs` packs of a supply tonight, after supply-cost modifiers. */
export function restockCost(state: GameState, supply: SupplyId, packs: number): number {
  return round2(packs * ECONOMY.packs[supply].cost * computeModifiers(state).supplyCost[supply] * roleSupplyCost(state));
}

function buy(state: GameState, itemId: string): void {
  const item = catalogueById[itemId];
  if (!item || !state.hand.includes(itemId) || state.boughtTonight.includes(itemId) || state.cash < item.cost) return;
  state.cash = round2(state.cash - item.cost);
  const effects: Effect[] = item.effects.flatMap((e) => resolveGamble(e, state));
  const owned: OwnedItem = { itemId, effects };
  (item.duration === 'permanent' ? state.owned : state.activeTomorrow).push(owned);
  for (const e of effects) {
    if (e.kind === 'unlock' && unlockDrink(state, e.drink)) state.freshDrinks = [...(state.freshDrinks ?? []), e.drink];
  }
  state.hand = state.hand.filter((id) => id !== itemId);
  state.boughtTonight.push(itemId);
  // The weather radio crackles on the moment it is bought.
  if (effects.some((e) => e.kind === 'reveal')) tuneRadio(state);
}

/** What the next re-roll of tonight's hand costs. */
export function rerollCost(state: GameState): number {
  return ECONOMY.reroll.base + ECONOMY.reroll.step * (state.rerolls ?? 0);
}

/** Pay to swap tonight's unbought cards for a fresh deal (never the same cards, when the pool allows). */
function reroll(state: GameState): void {
  const cost = rerollCost(state);
  if (state.cash < cost || state.hand.length === 0) return;
  state.cash = round2(state.cash - cost);
  state.rerolls = (state.rerolls ?? 0) + 1;
  dealHand(state, CATALOGUE, [...state.hand, ...state.boughtTonight]);
}

/** Round 4 f follow-up: the same packs bought in the day or the closing phase (a rush delivery, `RESTOCK.rushMul`). */
export function rushCost(state: GameState, supply: SupplyId, packs: number): number {
  return round2(restockCost(state, supply, packs) * RESTOCK.rushMul);
}

/** Buy `want` packs (as many as fit) at `price`; returns the packs and what they cost, or null when nothing was bought. */
function restock(state: GameState, supply: SupplyId, want: number, price = restockCost): { packs: number; cost: number } | null {
  // FB2 A4: Gear milk goes in the fridge, so only whole packs that fit are bought (nothing is lost on the way in).
  const packs = packsThatFit(state, supply, want);
  if (packs <= 0) return null;
  const cost = price(state, supply, packs);
  if (state.cash < cost) return null;
  state.cash = round2(state.cash - cost);
  state.supplies[supply] += packs * ECONOMY.packs[supply].size;
  return { packs, cost };
}

/**
 * The restock input in any phase: at night the normal price (applyNightInput); in the day or the closing phase a
 * connected person's rush delivery at `rushCost`, arriving at once, logged as `restock.rush { by, supply, packs, cost }`.
 * Bots never get here (step.ts drops their inputs).
 */
export function applyRestockInput(state: GameState, input: Extract<PlayerInput, { kind: 'restock' }>): GameState {
  if (state.phase === 'night') return applyNightInput(state, input);
  if (state.phase !== 'day' && state.phase !== 'closing') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  const got = restock(state, input.supply, input.packs, rushCost);
  if (got) emitLog(state, 'restock.rush', { by: p.id, supply: input.supply, packs: got.packs, cost: got.cost });
  return state;
}

/** Apply a buy, restock, or ready input. Anything else, or any input outside the night, is ignored. */
export function applyNightInput(state: GameState, input: PlayerInput): GameState {
  if (state.phase !== 'night') return state;
  switch (input.kind) {
    case 'buy':
      buy(state, input.itemId);
      break;
    case 'restock':
      restock(state, input.supply, input.packs);
      break;
    case 'reroll':
      if (input.playerId === state.hostId || state.players.some((p) => p.id === input.playerId)) reroll(state);
      break;
    case 'ready':
      if (state.players.some((p) => p.id === input.playerId) && !state.ready.includes(input.playerId)) {
        state.ready.push(input.playerId);
      }
      break;
  }
  return state;
}

/**
 * One tick of night. A timed night counts down and opens the doors when time is up or everyone connected
 * is ready. A relaxed night (`nightLengthSec === 0`) never counts down: it opens when everyone connected is
 * ready, or when the last call runs out. The last call (30 s) starts once more than half the connected
 * humans are ready, or at once when no human is connected; once started it runs even if the share drops.
 */
/**
 * R3 6: once a night, the tick the cash first covers the next shop size: `grow.affordable { tier }`. Cash moves at night
 * (selling gear, restocking), so this watches every tick. Not on a Gear run's first night (that night is for the first gear).
 */
function nudgeGrow(state: GameState): void {
  if (state.growNudged || (state.gear === true && state.day <= 1)) return;
  const tier = nextTierAffordable(state);
  if (!tier) return;
  state.growNudged = true;
  emitLog(state, 'grow.affordable', { tier });
}

/** The night ends: the doors open for the day (FB2 C10: on a Gear morning, after the pre-open). */
function openShop(state: GameState): GameState {
  startDay(state);
  beginPreOpen(state);
  return state;
}

export function stepNight(state: GameState): GameState {
  nudgeGrow(state);
  const connected = state.players.filter((p) => p.connected && !p.bot);
  const readyConnected = connected.filter((p) => state.ready.includes(p.id)).length;
  const everyoneReady = connected.length > 0 && readyConnected === connected.length;
  if (state.settings.nightLengthSec === 0) {
    if (everyoneReady) return openShop(state);
    if (state.devPaused) return state; // R4 a: no last call while the host holds the night
    if (state.lastCall === undefined && (connected.length === 0 || readyConnected * 2 > connected.length)) {
      state.lastCall = secondsToTicks(LAST_CALL_SECONDS);
    }
    if (state.lastCall !== undefined) {
      state.lastCall -= 1;
      if (state.lastCall <= 0) return openShop(state);
    }
    return state;
  }
  if (!state.devPaused) state.phaseTicksLeft -= 1; // R4 a: a paused dev night holds still (Ready still opens the shop)
  if (state.phaseTicksLeft <= 0 || everyoneReady) return openShop(state);
  return state;
}

/**
 * Final shape of the selector (spec §3):
 *   nightClock(state): {
 *     mode: 'timed' | 'relaxed';          // relaxed when settings.nightLengthSec === 0
 *     secondsLeft: number | null;         // ceil(phaseTicksLeft / TICK_RATE) when timed, null when relaxed
 *     lastCallSecondsLeft: number | null; // ceil(lastCall / TICK_RATE) once a relaxed last call runs, else null
 *     ready: PlayerId[];                  // connected humans who have readied up tonight
 *     needed: number;                     // connected humans (the ready count that opens the shop)
 *   }
 */
export function nightClock(state: GameState): {
  mode: 'timed' | 'relaxed';
  secondsLeft: number | null;
  lastCallSecondsLeft: number | null;
  ready: PlayerId[];
  needed: number;
} {
  const relaxed = state.settings.nightLengthSec === 0;
  return {
    mode: relaxed ? 'relaxed' : 'timed',
    secondsLeft: relaxed ? null : Math.ceil(state.phaseTicksLeft / TICK_RATE),
    lastCallSecondsLeft: state.lastCall === undefined ? null : Math.ceil(state.lastCall / TICK_RATE),
    ready: state.ready.filter((id) => state.players.some((p) => p.id === id && p.connected && !p.bot)),
    needed: state.players.filter((p) => p.connected && !p.bot).length,
  };
}
