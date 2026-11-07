/*
 * FB2 A4 (docs/CLAUDE_PROMPT_FEEDBACK_2.md): the fridge, morning setup and closing. Gear runs only; every function
 * here is a no-op (or reads like before) when `state.gear !== true`, so classic runs and their goldens don't move.
 *
 *  - The fridge is a fixed counter-kind spot (`FRIDGE_ID`, data/layout.ts). Which one follows the shop size (Kennedy,
 *    data/fridges.ts): the stand has none until it buys the Dorm Room Cube (f1, a single $20 card), the cart comes with
 *    the Garage Beer Fridge (f2), the café with the Chrome Reach-In (f3), and the café can buy the Udder-Matic 3000 (f4).
 *    `fridgeGear` = the better of what was bought (`state.fridge`) and what the size gives. Never sold or downgraded.
 *    With no fridge, nothing needing one happens: no milk is bought, no carton, and the bar can't be put away.
 *  - `supplies.milk` is the milk IN the fridge (capped at the fridge's `holds` by the restock). Machines draw milk
 *    from `state.milkOut`, the milk out at the bar: E with empty hands at the fridge takes a carton (`tool: 'milk'`,
 *    up to `FRIDGE.carton` servings in `carry`), E at a milk station (a steamer, a steam wand, a cold brew tap) puts
 *    it out. The Udder-Matic (f4) tops `milkOut` up by itself whenever it drops below `FRIDGE.autoBelow`.
 *  - Closing soon: the last `ECONOMY.closingSoonSeconds` of the day (`state.closingSoonAt`, `closing.soon` once).
 *    Then empty hands at a milk station lift the milk out as a carton, empty hands at the condiment bar lift what is
 *    left as a box (`tool: 'bar'`), and E at the fridge stores either (`supplies.milk`, `state.barAway`).
 *  - At close (`fridgeClose`, from finishDay): carried cartons and bar boxes go into the fridge, the Udder-Matic
 *    takes its milk back, and whatever is still out goes bad, all of it (`supply.spoil { item, count }`, costed in
 *    today's `spoiled` / `spoiledBar` / `spoiledValue`). The fridge's own overnight spoil is spoilage.ts's (× the
 *    fridge's `spoil`).
 *  - Morning (`fridgeMorning`): nothing is out; the bar starts with what was put away.
 *  - Round 6 block 4 (Kennedy): the milk counter (`SUPPLY_ID`, by the sink) holds its own cold milk,
 *    `state.supplyMilk`. A carton in hand, E there, stocks it (`milk.out { station: SUPPLY_ID }`); a shot or a cold
 *    brew in hand, E there, fills at once into an iced latte / a sweet cream from it (`supply.fill { by, drink }`,
 *    data/drinks.ts MILK_COUNTER_RECIPES). Empty hands there take nothing (cartons only come out of the fridge); in
 *    closing soon they lift the counter's milk to put away, as at a milk station. The steamer / steam wand keep
 *    `milkOut` (the tap no longer takes milk). The Udder-Matic tops up both pools (the counter while a cold milk drink
 *    is on the menu), takes both back at close; otherwise both go bad. `supplyWants` says what a press there would do.
 *
 * Must not import ./gear, ./stations or ./spoilage (they import this). Pure, no RNG.
 */
import { ECONOMY } from '../data/economy';
import { FRIDGES, TIER_FRIDGE, isFridgeId, type FridgeId } from '../data/fridges';
import { CONDIMENTS_ID, FRIDGE_ID, SUPPLY_ID, layoutFor } from '../data/layout';
import { MILK_COUNTER_RECIPES, recipeChain, type Recipe } from '../data/drinks';
import { CONDIMENTS } from './condiments';
import { secondsToTicks } from './constants';
import { emitLog } from './log';
import { menuDrinks, recipeAllowed } from './unlocks';
import type { DrinkId, GameState, ItemKind, Player, Station, StationKind, SupplyId } from './types';

export const FRIDGE = {
  /** Servings in a milk carton taken from the fridge. */
  carton: 8,
  /** The Udder-Matic tops the milk out up whenever it is below this. */
  autoBelow: 4,
} as const;

/** What a serving left out costs when it goes bad: milk at the pack price, the bar at the box price (read late: import cycles). */
const milkServing = () => ECONOMY.packs.milk.cost / ECONOMY.packs.milk.size;
const barServing = () => CONDIMENTS.boxCost / CONDIMENTS.servings;

const round2 = (n: number) => Math.round(n * 100) / 100;
const isGear = (state: GameState) => state.gear === true;

/** The shop's fridge: the better of the one bought and the one its size comes with; null with none (or in a classic run). */
export function fridgeGear(state: GameState): FridgeId | null {
  if (!isGear(state)) return null;
  const bought = state.fridge && isFridgeId(state.fridge) ? state.fridge : null;
  const gift = TIER_FRIDGE[state.tier ?? 'cafe'];
  if (!bought) return gift;
  if (!gift) return bought;
  return FRIDGES[bought].rank >= FRIDGES[gift].rank ? bought : gift;
}

function spec(state: GameState) {
  const id = fridgeGear(state);
  return id ? FRIDGES[id] : undefined;
}

/** Milk the fridge holds (the restock cap): 0 with no fridge, Infinity in a classic run. */
export function fridgeCapacity(state: GameState): number {
  if (!isGear(state)) return Infinity;
  return spec(state)?.holds ?? 0;
}

/** × the overnight milk spoil inside the fridge (1 in a classic run). */
export function fridgeSpoilMul(state: GameState): number {
  return spec(state)?.spoil ?? 1;
}

/** The Udder-Matic: milk out tops itself up and goes back by itself. */
export function autoMilk(state: GameState): boolean {
  return spec(state)?.auto === true;
}

/** Stations that draw milk out at the bar, where a carton can be put out (and lifted back at closing soon). Round 6: the
 *  cold brew tap no longer takes milk (its milk drinks finish at the milk counter). */
export const MILK_KINDS: StationKind[] = ['steamer'];
export const isMilkStation = (st: Station | null | undefined): boolean => !!st && MILK_KINDS.includes(st.kind);
export const isFridge = (st: Station | null | undefined): boolean => st?.id === FRIDGE_ID;
/** Round 5 block 4 / Round 6 block 4: the milk counter by the sink (stocked from a fridge carton; cold milk drinks finish there). */
export const isSupply = (st: Station | null | undefined): boolean => st?.id === SUPPLY_ID;

/** Round 6 block 4: the drink a cup in hand becomes at the milk counter (on tonight's menu), or null. */
export function supplyRecipe(state: GameState, held: ItemKind | null): Recipe | null {
  if (held === null) return null;
  return MILK_COUNTER_RECIPES.find((r) => r.takes === held && recipeAllowed(state, r.gives)) ?? null;
}

/** Round 6 block 4: a drink whose last step is at the milk counter (it draws the counter's cold milk). */
export const coldMilkDrink = (d: DrinkId): boolean => recipeChain(d).some((x) => x.station === SUPPLY_ID);

/** Round 6 block 4: someone in the shop is waiting on a cold milk drink (closing soon then leaves the counter milk out). */
const coldMilkWanted = (state: GameState): boolean =>
  state.customers.some((c) => coldMilkDrink(c.drink) || (c.extra?.some(coldMilkDrink) ?? false) || (c.items?.some((i) => coldMilkDrink(i.drink)) ?? false));

/**
 * Round 6 block 4, for hints: what E at the milk counter would do for `p` (Gear runs; null otherwise).
 *  - `stock`: a carton in hand goes onto the counter (`n` servings).
 *  - `fill`: the cup in hand becomes `gives` from the counter's `milk`.
 *  - `empty`: the cup in hand would become `gives`, but the counter has no milk (bring a carton from the fridge).
 *  - `lift`: closing soon, empty hands lift the counter's `n` servings to put away.
 *  - `idle`: nothing the counter takes (empty hands, or a cup it has no step for); `milk` is what it holds.
 */
export type SupplyWant =
  | { kind: 'stock'; n: number }
  | { kind: 'fill'; gives: DrinkId; milk: number }
  | { kind: 'empty'; gives: DrinkId }
  | { kind: 'lift'; n: number }
  | { kind: 'idle'; milk: number };

export function supplyWants(state: GameState, p: Player): SupplyWant | null {
  if (!isGear(state)) return null;
  const milk = state.supplyMilk ?? 0;
  if (p.tool === 'milk') return { kind: 'stock', n: p.carry ?? 0 };
  if (p.tool !== null) return { kind: 'idle', milk };
  const r = supplyRecipe(state, p.holding);
  if (r) return milk >= 1 ? { kind: 'fill', gives: r.gives as DrinkId, milk } : { kind: 'empty', gives: r.gives as DrinkId };
  if (p.holding === null && canLiftSupply(state)) return { kind: 'lift', n: milk };
  return { kind: 'idle', milk };
}

/** Closing soon, the counter has milk, a fridge to put it in, no Udder-Matic, and nobody waiting on a cold milk drink. */
export function canLiftSupply(state: GameState): boolean {
  return closingSoon(state) && (state.supplyMilk ?? 0) > 0 && !autoMilk(state) && state.stations.some(isFridge) && !coldMilkWanted(state);
}

/** Round 6 block 4: E at the milk counter (Gear, a Gear-run press there is always used up here). */
function supplyPress(state: GameState, p: Player, st: Station): void {
  if (p.tool === 'milk') {
    const n = p.carry ?? 0;
    state.supplyMilk = (state.supplyMilk ?? 0) + n;
    clearTool(p);
    emitLog(state, 'milk.out', { by: p.id, n, station: st.id });
    return;
  }
  if (p.tool !== null) return;
  const r = supplyRecipe(state, p.holding);
  if (r && (state.supplyMilk ?? 0) >= 1) {
    state.supplyMilk! -= 1;
    p.holding = r.gives;
    p.heldSince = state.tick; // a fresh cup (iced drinks don't go cold; the clock is for the record)
    delete p.cupTemp; // the shot's temperature mark goes; its slips (and how it was made) stay with the cup
    emitLog(state, 'supply.fill', { by: p.id, drink: r.gives });
    return;
  }
  if (p.holding === null && canLiftSupply(state)) {
    p.tool = 'milk';
    p.carry = state.supplyMilk!;
    state.supplyMilk = 0;
    emitLog(state, 'milk.lift', { by: p.id, n: p.carry, station: st.id });
  }
}

/** What a machine can draw right now: in a Gear run milk is the milk out at the bar, everything else (and classic) is `supplies`. */
export function readyStock(state: GameState, s: SupplyId): number {
  return isGear(state) && s === 'milk' ? (state.milkOut ?? 0) : (state.supplies[s] ?? 0);
}

/** A machine used one serving: milk out at the bar in a Gear run, else the supply itself. */
export function useStock(state: GameState, s: SupplyId): void {
  if (isGear(state) && s === 'milk') state.milkOut = Math.max(0, (state.milkOut ?? 0) - 1);
  else state.supplies[s] -= 1;
}

/** All the shop has of a supply (what the board and the menu go by): Gear milk counts the fridge, the bar, the milk counter and cartons in hand. */
export function stockOf(state: GameState, s: SupplyId): number {
  const have = state.supplies[s] ?? 0;
  if (!isGear(state) || s !== 'milk') return have;
  // Re-review M-1: milk in the pantry with no fridge to take a carton from can't reach a machine.
  return (fridgeGear(state) ? have : 0) + (state.milkOut ?? 0) + (state.supplyMilk ?? 0) + state.players.reduce((n, p) => n + (p.tool === 'milk' ? (p.carry ?? 0) : 0), 0);
}

/** The most packs of `supply` that fit tonight: milk packs only while they fit in the fridge (whole packs, nothing lost). */
export function packsThatFit(state: GameState, supply: SupplyId, packs: number): number {
  if (!isGear(state) || supply !== 'milk') return packs;
  const room = fridgeCapacity(state) - (state.supplies.milk ?? 0);
  return Math.max(0, Math.min(packs, Math.floor(room / ECONOMY.packs.milk.size)));
}

/**
 * The fridge cards on offer tonight (the shop shows each as a single card): the Dorm Room Cube while the shop has no
 * fridge, the Udder-Matic once it is a café without one. [] in a classic run.
 */
export function fridgeCards(state: GameState): { id: FridgeId; price: number }[] {
  const now = fridgeGear(state);
  if (!isGear(state)) return [];
  if (!now) return [{ id: 'f1', price: FRIDGES.f1.price }];
  if ((state.tier ?? 'cafe') === 'cafe' && FRIDGES[now].rank < FRIDGES.f4.rank) return [{ id: 'f4', price: FRIDGES.f4.price }];
  return [];
}

/**
 * The fridge card worth buying tonight, and why (planner advice and the night brief): the cube when the shop has none
 * and the bar can make a milk drink (they need it) or the bar went bad last night; the Udder-Matic when a day's
 * expected milk (`milkUse`) won't fit in the café's fridge. Null otherwise.
 */
export function fridgeWanted(state: GameState, milkUse: number): { id: FridgeId; price: number; why: 'none' | 'small' } | null {
  const card = fridgeCards(state)[0];
  if (!card) return null;
  if (card.id === 'f1') {
    const milk = menuDrinks(state).some((d) => ECONOMY.drinkSupplies[d].includes('milk'));
    const barLost = (state.days.at(-1)?.spoiledBar ?? 0) > 0;
    return milk || barLost ? { ...card, why: 'none' } : null;
  }
  return milkUse > fridgeCapacity(state) ? { ...card, why: 'small' } : null;
}

/**
 * Buy fridge card `id` if it is on offer and the cash covers it; the fridge appears at its spot at once. The night input
 * (people only, and a co-op vote at $50+ like gear) is sim/gear.ts `applyFridgeInput`. False when nothing happened.
 */
export function buyFridgeCard(state: GameState, id: FridgeId): boolean {
  if (!isGear(state)) return false;
  const card = fridgeCards(state).find((c) => c.id === id);
  if (!card || state.cash < card.price) return false;
  state.cash = round2(state.cash - card.price);
  state.fridge = card.id;
  ensureFridgeStation(state);
  return true;
}

/** The fridge station, added when the shop has a fridge and the floor doesn't show it yet (idempotent; slots.ensureCounterSpots). */
export function ensureFridgeStation(state: GameState): void {
  if (!fridgeGear(state) || state.stations.some(isFridge)) return;
  state.stations.push({ id: FRIDGE_ID, kind: 'counter', pos: { ...layoutFor(state.tier).fridge }, busyTicksLeft: 0, output: null, occupiedBy: null });
}

// ---------------------------------------------------------------------------------------------- closing soon

export function closingSoon(state: GameState): boolean {
  return isGear(state) && state.closingSoonAt !== undefined;
}

/** Start closing soon now (once a day). */
export function startClosingSoon(state: GameState): void {
  if (!isGear(state) || state.closingSoonAt !== undefined) return;
  state.closingSoonAt = state.tick;
  emitLog(state, 'closing.soon', { left: Math.ceil(Math.max(0, state.phase === 'day' ? state.phaseTicksLeft : 0) / secondsToTicks(1)) });
}

/** Each day tick with the doors open (after the clock moved): the last `closingSoonSeconds` start closing soon. */
export function stepClosingSoon(state: GameState): void {
  if (isGear(state) && state.phase === 'day' && state.phaseTicksLeft <= secondsToTicks(ECONOMY.closingSoonSeconds)) startClosingSoon(state);
}

export interface ClosingChecklist {
  /** No milk out at the bar or on the milk counter, and no carton on its way to the fridge (always true with the Udder-Matic). */
  milkAway: boolean;
  /** The condiment bar is empty and its box is not still in someone's hands. */
  barAway: boolean;
  /** No drip pot has cups left in it. */
  potsEmpty: boolean;
  floorClean: boolean;
  /** Nothing left on the pickup counter. */
  counterClear: boolean;
}

/** FB2 A4: the closing-soon checklist (pure). */
export function closingChecklist(state: GameState): ClosingChecklist {
  const carrying = (tool: Player['tool']) => state.players.some((p) => p.tool === tool);
  return {
    milkAway: autoMilk(state) || ((state.milkOut ?? 0) <= 0 && (state.supplyMilk ?? 0) <= 0 && !carrying('milk')),
    barAway: (state.condiments?.servings ?? 0) <= 0 && !carrying('bar'),
    potsEmpty: !state.stations.some((s) => (s.potLeft ?? 0) > 0),
    floorClean: state.messes.length === 0,
    counterClear: state.pass.length === 0,
  };
}

/**
 * Closing waits for the bots to finish putting things away (Gear, closing soon, a bot on the crew, and the milk or the
 * bar still out). The grace timer still ends the day.
 */
export function putAwayPending(state: GameState): boolean {
  if (!closingSoon(state) || !state.stations.some(isFridge)) return false;
  if (!state.players.some((p) => p.bot && p.connected)) return false;
  const c = closingChecklist(state);
  return !c.milkAway || !c.barAway;
}

// ---------------------------------------------------------------------------------------------- hands

function clearTool(p: Player): void {
  p.tool = null;
  delete p.carry;
}

/** Put a carried carton or bar box into the fridge (E at the fridge, R, leaving, the end of the day). */
export function storeInFridge(state: GameState, p: Player, by: string = p.id): void {
  const n = p.carry ?? 0;
  if (p.tool === 'milk') {
    state.supplies.milk = (state.supplies.milk ?? 0) + n;
    emitLog(state, 'fridge.put', { by, item: 'milk', n });
  } else if (p.tool === 'bar') {
    state.barAway = (state.barAway ?? 0) + n;
    emitLog(state, 'fridge.put', { by, item: 'bar', n });
  } else return;
  clearTool(p);
}

/**
 * A press of E that the fridge rules handle (Gear only). Returns true when the press is used up here.
 * `wanted`: the station would make an empty-hands drink someone is waiting for (closing soon lifts the milk only otherwise).
 */
export function fridgeInteract(state: GameState, p: Player, st: Station | null, wanted: () => boolean): boolean {
  if (!isGear(state)) return false;
  // Round 6 block 4: the milk counter takes every Gear press there (a carton, a cup to fill, a closing-soon lift).
  if (isSupply(st) && (p.tool === null || p.tool === 'milk')) {
    supplyPress(state, p, st!);
    return true;
  }
  if (p.tool === 'milk' || p.tool === 'bar') {
    if (isFridge(st)) storeInFridge(state, p);
    else if (p.tool === 'milk' && isMilkStation(st)) {
      const n = p.carry ?? 0;
      state.milkOut = (state.milkOut ?? 0) + n;
      clearTool(p);
      emitLog(state, 'milk.out', { by: p.id, n, station: st!.id });
    } else if (p.tool === 'bar' && st?.id === CONDIMENTS_ID && state.condiments) {
      state.condiments.servings = Math.min(CONDIMENTS.servings, state.condiments.servings + (p.carry ?? 0));
      clearTool(p);
    }
    return true;
  }
  if (!st) return false;
  // M1: the mop or a condiment box in hand: the press is theirs (mopping next to the fridge works).
  if (p.tool !== null) return false;
  if (isFridge(st)) {
    // Empty hands take a carton; anything else in hand stays there (the fridge is not a counter).
    if (p.holding === null && fridgeGear(state) && (state.supplies.milk ?? 0) >= 1) {
      const n = Math.min(FRIDGE.carton, Math.floor(state.supplies.milk));
      state.supplies.milk -= n;
      p.tool = 'milk';
      p.carry = n;
      emitLog(state, 'fridge.take', { by: p.id, item: 'milk', n });
    }
    return true;
  }
  // Closing soon's lifts need a fridge to put things in.
  if (!closingSoon(state) || p.holding !== null || !state.stations.some(isFridge)) return false;
  if (isMilkStation(st) && (state.milkOut ?? 0) > 0 && !autoMilk(state) && st.output === null && st.busyTicksLeft === 0 && st.occupiedBy === null && !wanted()) {
    p.tool = 'milk';
    p.carry = state.milkOut!;
    state.milkOut = 0;
    emitLog(state, 'milk.lift', { by: p.id, n: p.carry, station: st.id });
    return true;
  }
  if (st.id === CONDIMENTS_ID && state.condiments && state.condiments.servings > 0) {
    p.tool = 'bar';
    p.carry = state.condiments.servings;
    state.condiments.servings = 0;
    emitLog(state, 'bar.lift', { by: p.id, n: p.carry });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------- the day

/**
 * Each day tick: the Udder-Matic pours a carton's worth out when the milk out runs below the mark; Round 6 block 4: then
 * the same for the milk counter, while a cold milk drink is on the menu (`fridge.auto { n, station: SUPPLY_ID }`).
 */
export function stepFridge(state: GameState): void {
  if (!autoMilk(state)) return;
  const pour = (): number => {
    const n = Math.min(FRIDGE.carton, Math.floor(state.supplies.milk ?? 0));
    state.supplies.milk -= n;
    return n;
  };
  if ((state.milkOut ?? 0) < FRIDGE.autoBelow && (state.supplies.milk ?? 0) >= 1) {
    const n = pour();
    state.milkOut = (state.milkOut ?? 0) + n;
    emitLog(state, 'fridge.auto', { n });
  }
  if ((state.supplyMilk ?? 0) < FRIDGE.autoBelow && (state.supplies.milk ?? 0) >= 1 && state.stations.some(isSupply) && menuDrinks(state).some(coldMilkDrink)) {
    const n = pour();
    state.supplyMilk = (state.supplyMilk ?? 0) + n;
    emitLog(state, 'fridge.auto', { n, station: SUPPLY_ID });
  }
}

/** At close, before the overnight spoil: carried things go in the fridge, the dispenser takes its milk back, the rest goes bad. */
export function fridgeClose(state: GameState): void {
  if (!isGear(state)) return;
  delete state.closingSoonAt;
  for (const p of state.players) storeInFridge(state, p);
  // Round 6 block 4: the milk counter's milk goes the same way as the milk out at the bar.
  const out = (state.milkOut ?? 0) + (state.supplyMilk ?? 0);
  delete state.milkOut;
  delete state.supplyMilk;
  if (out > 0 && autoMilk(state)) {
    state.supplies.milk = (state.supplies.milk ?? 0) + out;
    emitLog(state, 'fridge.put', { by: 'auto', item: 'milk', n: out });
  } else if (out > 0) {
    emitLog(state, 'supply.spoil', { item: 'milk', count: out });
    const spoiled = (state.today.spoiled ??= {});
    spoiled.milk = (spoiled.milk ?? 0) + out;
    state.today.spoiledValue = round2((state.today.spoiledValue ?? 0) + out * milkServing());
  }
  const bar = state.condiments?.servings ?? 0;
  if (bar > 0) {
    state.condiments!.servings = 0;
    emitLog(state, 'supply.spoil', { item: 'bar', count: bar });
    state.today.spoiledBar = (state.today.spoiledBar ?? 0) + bar;
    state.today.spoiledValue = round2((state.today.spoiledValue ?? 0) + bar * barServing());
  }
}

/** Morning: nothing is out yet; the bar gets back what was put away last night. */
export function fridgeMorning(state: GameState): void {
  if (!isGear(state)) return;
  delete state.fridgeVote; // an open Udder-Matic proposal lapses when the shop opens (as gear votes do)
  delete state.milkOut;
  delete state.supplyMilk;
  delete state.closingSoonAt;
  const away = state.barAway ?? 0;
  delete state.barAway;
  if (away <= 0 || !state.condiments) return;
  // M2: what doesn't fit on the bar waits in the fridge for another morning (never lost).
  const out = Math.min(away, Math.max(0, CONDIMENTS.servings - state.condiments.servings));
  state.condiments.servings += out;
  if (away > out) state.barAway = away - out;
}
