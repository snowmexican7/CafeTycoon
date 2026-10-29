import { CATALOGUE, catalogueById } from '../data/catalogue';
import { ECONOMY } from '../data/economy';
import { computeModifiers, resolveGamble } from './effects';
import { rngNext } from './rng';
import { tuneRadio } from './events';
import { startDay } from './run';
import { unlockDrink } from './unlocks';
import type { CatalogueItem, Effect, GameState, OwnedItem, PlayerInput, SupplyId } from './types';

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
      !teachesNothing(state, item),
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
  return round2(packs * ECONOMY.packs[supply].cost * computeModifiers(state).supplyCost[supply]);
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

function restock(state: GameState, supply: SupplyId, packs: number): void {
  if (packs <= 0) return;
  const cost = restockCost(state, supply, packs);
  if (state.cash < cost) return;
  state.cash = round2(state.cash - cost);
  state.supplies[supply] += packs * ECONOMY.packs[supply].size;
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

/** One tick of night: count down, and open the doors when time is up or everyone connected is ready. */
export function stepNight(state: GameState): GameState {
  state.phaseTicksLeft -= 1;
  const connected = state.players.filter((p) => p.connected && !p.bot);
  const everyoneReady = connected.length > 0 && connected.every((p) => state.ready.includes(p.id));
  if (state.phaseTicksLeft <= 0 || everyoneReady) return startDay(state);
  return state;
}
