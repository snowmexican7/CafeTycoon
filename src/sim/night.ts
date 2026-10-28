import { CATALOGUE, catalogueById } from '../data/catalogue';
import { ECONOMY } from '../data/economy';
import { computeModifiers, resolveGamble } from './effects';
import { rngNext } from './rng';
import { startDay } from './run';
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
      !(item.excludes ?? []).some((id) => ownedIds.has(id)),
  );
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

/** Deal tonight's hand: up to handSize eligible items, with at least one cheap option when one exists. */
export function dealHand(state: GameState, pool: CatalogueItem[] = CATALOGUE): GameState {
  const candidates = eligibleItems(state, pool);
  const hand: CatalogueItem[] = [];
  while (hand.length < ECONOMY.handSize && candidates.length > 0) hand.push(drawWeighted(state, candidates));
  const isCheap = (i: CatalogueItem) => i.cost < ECONOMY.cheapThreshold;
  if (hand.length > 0 && !hand.some(isCheap)) {
    const cheap = candidates.filter(isCheap);
    if (cheap.length > 0) hand[hand.length - 1] = drawWeighted(state, cheap);
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
  state.hand = state.hand.filter((id) => id !== itemId);
  state.boughtTonight.push(itemId);
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
  const connected = state.players.filter((p) => p.connected);
  const everyoneReady = connected.length > 0 && connected.every((p) => state.ready.includes(p.id));
  if (state.phaseTicksLeft <= 0 || everyoneReady) return startDay(state);
  return state;
}
