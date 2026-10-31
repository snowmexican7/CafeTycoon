/*
 * FB2 B8: hand-made lattes and cappuccinos (Gear runs). Each step is a quick press, not a minigame; the meters live in
 * sim state, so the host stays authoritative and a peer's press lands on the host's tick.
 *
 * - Milk jug. A person with a shot in hand at a wand with milk out presses E: the jug starts filling (`Player.jug`,
 *   0→1 over `HANDMADE.fillSeconds`); E again stops it (anywhere), or it stops itself full. `jug.line` is the
 *   ticket's mark (`JUG_LINES`: cappuccino, latte, large). Within `lineWindow` of it is right; under makes a weaker
 *   drink (−1★, tip ×0.8); over wastes a second milk from `milkOut` when the shot goes on. `milk.fill { by, level,
 *   line, grade }`. The milk itself is the wand recipe's one serving (no double count).
 * - Steam meter. E with the filled jug puts the shot on the wand (it steams at the wand's speed, as before) and starts
 *   the meter (`Player.steam`; position `steamPos`, a triangle wave 0..1 every `steamSeconds`). E in reach of that
 *   wand stops it: within `perfect` of the middle is perfect (+1★, tip ×1.2), within `ok` ok, else a miss (−1★,
 *   tip ×0.8). Not stopped before the wand finishes: scalded, a miss. The drink is made either way.
 *   `steam.result { by, grade }`.
 * - Shots. About `doubleChance` of latte and cappuccino asks want a double (`Customer.shots` / `OrderItem.shots`).
 *   While more doubles are owed than are in flight, the next pull is a double: ×`doubleTime` and a second bean.
 * - Syrups. About `syrupChance` of latte asks want vanilla or caramel (only while the shop has flavour stock). The
 *   rack is a fixed spot (`SYRUP_ID`) in any Gear shop with a wand; the `syrup` input there puts one flavour serving
 *   in the cup in hand (`syrup.add { by, flavour }`). A ticket that wanted one and got another or none grumbles
 *   (`syrup.miss { customer }`) and tips ×0.5. A syrup nobody asked for costs nothing.
 * - Bots skip the meters (their cups count as right and ok), pull doubles the same way, and add the ticket's syrup.
 * - How a cup was made travels with it as `HandMade` (`made` on the player, the station and the pickup counter).
 * Randomness only at the ticket (`addCustomerAsks`, rngNext), and only for latte and cappuccino asks.
 */
import { ECONOMY } from '../data/economy';
import { recipeChain, type Recipe } from '../data/drinks';
import { SYRUP_ID, SYRUP_SPOT } from '../data/layout';
import { ACCURACY } from './accuracy';
import { secondsToTicks } from './constants';
import { readyStock, useStock } from './fridge';
import { emitLog } from './log';
import { rngNext } from './rng';
import type { Customer, DrinkId, FillGrade, Flavour, GameState, HandMade, ItemKind, OrderItem, PassItem, Player, PlayerInput, Station, SteamGrade } from './types';

/** The marks on the jug, as a share of full. A ticket's line: cappuccino, else latte ('large' is the top mark). */
export const JUG_LINES = { cappuccino: 0.35, latte: 0.6, large: 0.85 } as const;

export const HANDMADE = {
  /** Seconds for the jug to go from empty to full. */
  fillSeconds: 2,
  /** Within this of the line is the right fill. */
  lineWindow: 0.08,
  /** One back-and-forth of the steam meter, in seconds (at speed 1). */
  steamSeconds: 1.2,
  steamSpeed: 1,
  /** Distance from the middle (0.5) for a perfect, and for an ok, stop. */
  perfect: 0.08,
  ok: 0.25,
  tip: { under: 0.8, perfect: 1.2, miss: 0.8, syrupMiss: 0.5 },
  /** Share of latte and cappuccino asks that want a double; of latte asks that want a syrup. */
  doubleChance: 0.3,
  syrupChance: 0.25,
  /** A double pull takes this much longer (and a second bean). */
  doubleTime: 1.5,
} as const;

export const FLAVOURS: readonly Flavour[] = ['vanilla', 'caramel'];
export const isFlavour = (v: unknown): v is Flavour => typeof v === 'string' && (FLAVOURS as readonly string[]).includes(v);

/** The drinks with hand-made asks (a double, a syrup) and recipe icons. */
const HAND_DRINKS: readonly DrinkId[] = ['latte', 'cappuccino'];
/** Cups that can take a syrup at the rack (the shot before it is steamed, or the milk drink after). */
const SYRUP_CUPS: readonly ItemKind[] = ['espresso', 'latte', 'cappuccino'];
/** Cups a double shot can be in. */
const SHOT_CUPS: readonly (ItemKind | null)[] = ['espresso', 'latte', 'cappuccino'];

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ---------------------------------------------------------------------------------------------- grading (pure)

export function fillGrade(level: number, line: number): FillGrade {
  // A hair of slack so a stop exactly on the window's edge reads as right despite float error.
  if (Math.abs(level - line) <= HANDMADE.lineWindow + 1e-9) return 'right';
  return level < line ? 'under' : 'over';
}

export function steamGrade(pos: number): SteamGrade {
  const off = Math.abs(pos - 0.5);
  if (off <= HANDMADE.perfect + 1e-9) return 'perfect';
  return off <= HANDMADE.ok + 1e-9 ? 'ok' : 'miss';
}

/** The jug's level now: as stopped, else rising with the clock. */
export function jugFill(state: GameState, p: Player): number {
  const j = p.jug;
  if (!j) return 0;
  if (j.done) return j.fill;
  return clamp01((state.tick - j.startedAt) / secondsToTicks(HANDMADE.fillSeconds));
}

/** Where the steam meter is (0..1, a triangle wave starting at 0), or null when this person has none running. For the UI. */
export function steamPos(state: GameState, p: Player): number | null {
  const m = p.steam;
  if (!m) return null;
  const phase = ((((state.tick - m.startedAt) * m.speed) / secondsToTicks(HANDMADE.steamSeconds)) % 1 + 1) % 1;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

/**
 * What a hand-made cup is worth to the ticket that takes it: stars added (a perfect foam wipes a mark; an under-fill
 * or a miss adds one), a tip multiplier, and whether a wanted syrup was wrong or missing.
 */
export function judgeCup(want: { shots?: 2; syrup?: Flavour }, made: HandMade | undefined): { stars: number; tip: number; syrupMiss: boolean } {
  let stars = 0;
  let tip = 1;
  if (made?.milk === 'under') {
    stars -= 1;
    tip *= HANDMADE.tip.under;
  }
  if (made?.foam === 'perfect') {
    stars += 1;
    tip *= HANDMADE.tip.perfect;
  } else if (made?.foam === 'miss') {
    stars -= 1;
    tip *= HANDMADE.tip.miss;
  }
  const syrupMiss = want.syrup !== undefined && made?.syrup !== want.syrup;
  if (syrupMiss) tip *= HANDMADE.tip.syrupMiss;
  return { stars, tip, syrupMiss };
}

/** A cup's sloppy marks after judging: stars added take marks off (never below 0), stars lost add them (capped). */
export function judgedSlips(slips: number, stars: number): number {
  return Math.max(0, Math.min(ACCURACY.maxStars, slips - stars));
}

// ---------------------------------------------------------------------------------------------- tickets

type Ask = { drink: DrinkId; shots?: 2; syrup?: Flavour };

/** What a customer still wants, one entry per drink: a ticket's undone items, else the customer's one drink. */
function asksOf(c: Customer): Ask[] {
  return c.items ? c.items.filter((x) => !x.done) : [c];
}

/** The cup fits this ask exactly: the same syrup (or none) and the same shots. */
export function fitsAsk(ask: { shots?: 2; syrup?: Flavour }, made: HandMade | undefined): boolean {
  return ask.syrup === made?.syrup && (ask.shots ?? 1) === (made?.shots ?? 1);
}

/** Customer `c` has an ask for `drink` that the cup fits exactly (pickup prefers them). Only latte and cappuccino have asks. */
export function customerFits(c: Customer, drink: DrinkId, made: HandMade | undefined): boolean {
  if (!HAND_DRINKS.includes(drink)) return false;
  return asksOf(c).some((a) => a.drink === drink && fitsAsk(a, made));
}

/** The ticket item a taken cup of `drink` marks: the first undone one it fits exactly, else the first undone one. */
export function itemFor(c: Customer, drink: DrinkId, made: HandMade | undefined): OrderItem | undefined {
  const open = (c.items ?? []).filter((x) => !x.done && x.drink === drink);
  return open.find((x) => fitsAsk(x, made)) ?? open[0];
}

/**
 * A new ticket's asks (Gear runs): each latte or cappuccino may want a double (one rngNext), and each latte a syrup
 * while the shop has flavour stock (one rngNext, and one more for the flavour on a hit). Nothing else draws.
 */
export function addCustomerAsks(state: GameState, c: Customer): void {
  if (state.gear !== true) return;
  for (const a of c.items ?? [c]) {
    if (!HAND_DRINKS.includes(a.drink)) continue;
    if (rngNext(state) < HANDMADE.doubleChance) a.shots = 2;
    if (a.drink === 'latte' && (state.supplies.flavour ?? 0) > 0 && rngNext(state) < HANDMADE.syrupChance) {
      a.syrup = rngNext(state) < 0.5 ? 'vanilla' : 'caramel';
    }
  }
}

/** The syrup a bot's claimed order wants (FB2 B6: a ticket's first undone item of that drink with one). */
export function askedSyrup(order: Customer): Flavour | undefined {
  if (order.items) return order.items.find((x) => !x.done && x.drink === order.drink && x.syrup)?.syrup;
  return order.syrup;
}

/** Double shots asked for and still owed, beyond those already in flight (in hand, in a machine, on the counter). */
export function wantsDouble(state: GameState): boolean {
  let owed = 0;
  for (const c of state.customers) {
    if (c.egg === 'camper') continue;
    for (const a of asksOf(c)) if (HAND_DRINKS.includes(a.drink) && a.shots === 2) owed += 1;
  }
  if (owed === 0) return false;
  let flight = 0;
  for (const p of state.players) if (SHOT_CUPS.includes(p.holding) && p.made?.shots === 2) flight += 1;
  for (const st of state.stations) {
    const item = st.output ?? (st.busyTicksLeft > 0 ? (st.making ?? null) : null);
    if (SHOT_CUPS.includes(item) && st.made?.shots === 2) flight += 1;
  }
  for (const item of state.pass) if (SHOT_CUPS.includes(item.item) && item.made?.shots === 2) flight += 1;
  return owed > flight;
}

// ---------------------------------------------------------------------------------------------- the held cup

/** `held` is on its way to `drink` (or is it). */
function leadsTo(held: ItemKind, drink: DrinkId): boolean {
  return held === drink || recipeChain(drink).some((x) => x.recipe.takes === held);
}

/** The latte or cappuccino ask a cup in hand is heading for: the first in queue order, one the cup fits first. */
function cupTarget(state: GameState, held: ItemKind, made: HandMade | undefined): Ask | null {
  const asks: Ask[] = [];
  for (const c of state.customers) {
    if (c.egg === 'camper') continue;
    for (const a of asksOf(c)) if (HAND_DRINKS.includes(a.drink) && leadsTo(held, a.drink)) asks.push(a);
  }
  return asks.find((a) => a.syrup === made?.syrup) ?? asks[0] ?? null;
}

export type RecipeStep = 'shot' | 'double' | Flavour | 'milk' | 'steam' | 'foam';
export interface HeldRecipe {
  /** The drink the cup is heading for, and what its ticket asks: shots and syrup. */
  drink: DrinkId;
  shots: 1 | 2;
  syrup?: Flavour;
  steps: { step: RecipeStep; done: boolean }[];
}

/**
 * The recipe icons over a person's cup (for the UI): the steps of the latte or cappuccino it is heading for (see
 * cupTarget), each done or still to do. Null when the hands hold no shot, latte or cappuccino, or no ticket wants one.
 */
export function heldRecipe(state: GameState, p: Player): HeldRecipe | null {
  const held = p.holding;
  if (held === null || !(held === 'grounds' || SHOT_CUPS.includes(held))) return null;
  const want = cupTarget(state, held, p.made);
  if (!want) return null;
  const pulled = held !== 'grounds';
  const steamed = held === 'latte' || held === 'cappuccino';
  const shots = want.shots ?? 1;
  const steps: HeldRecipe['steps'] = [{ step: shots === 2 ? 'double' : 'shot', done: pulled && (shots === 1 || p.made?.shots === 2) }];
  if (want.syrup) steps.push({ step: want.syrup, done: p.made?.syrup === want.syrup });
  steps.push({ step: 'milk', done: steamed || p.jug?.done === true });
  steps.push({ step: 'steam', done: steamed });
  if (want.drink === 'cappuccino') steps.push({ step: 'foam', done: held === 'cappuccino' });
  return { drink: want.drink, shots, ...(want.syrup ? { syrup: want.syrup } : {}), steps };
}

/** The jug's line for the cup in hand: the cappuccino mark when it is heading for one, else the latte mark. */
export function jugLine(state: GameState, p: Player): number {
  const want = p.holding ? cupTarget(state, p.holding, p.made) : null;
  return want?.drink === 'cappuccino' ? JUG_LINES.cappuccino : JUG_LINES.latte;
}

// ---------------------------------------------------------------------------------------------- presses

/** A person's shot going on a wand needs the jug first (Gear runs; bots skip it). */
function needsJug(state: GameState, p: Player, station: Station, recipe: Recipe): boolean {
  return state.gear === true && !p.bot && station.kind === 'steamer' && recipe.takes === 'espresso' && recipe.gives === 'latte';
}

function stopJug(state: GameState, p: Player): void {
  const j = p.jug!;
  j.fill = jugFill(state, p);
  j.done = true;
  emitLog(state, 'milk.fill', { by: p.id, level: j.fill, line: j.line, grade: fillGrade(j.fill, j.line) });
}

function stopSteam(state: GameState, p: Player, grade: SteamGrade): void {
  const st = state.stations.find((x) => x.id === p.steam!.station);
  // The cup is still on the wand (steaming, or done and waiting): it takes the grade.
  if (st && (st.busyTicksLeft > 0 || st.output !== null)) st.made = { ...st.made, foam: grade };
  delete p.steam;
  emitLog(state, 'steam.result', { by: p.id, grade });
}

/**
 * The first thing an E press does (stations.ts interact): stop a filling jug (anywhere), or stop the steam meter while
 * in reach of its wand. True when the press was used up.
 */
export function handmadePress(state: GameState, p: Player): boolean {
  if (p.jug && !p.jug.done) {
    stopJug(state, p);
    return true;
  }
  if (p.steam) {
    const st = state.stations.find((x) => x.id === p.steam!.station);
    if (st && dist(p.pos, st.pos) <= ECONOMY.interactRangeTiles) {
      stopSteam(state, p, steamGrade(steamPos(state, p)!));
      return true;
    }
  }
  return false;
}

/**
 * At a wand that would steam the shot in hand right now (stations.ts interact, inside its "can start" branch): a
 * person with no filled jug starts filling one instead. True when the press was used up (the shot stays in hand).
 */
export function jugFirst(state: GameState, p: Player, station: Station, recipe: Recipe): boolean {
  if (!needsJug(state, p, station, recipe) || p.jug?.done) return false;
  if (!p.jug) p.jug = { fill: 0, startedAt: state.tick, line: jugLine(state, p) };
  return true;
}

/**
 * Just after a cup went into `station` (stations.ts interact; its marks already moved over): a pull owed as a double
 * takes a second bean and ×1.5 time; a person's shot on a wand takes the jug's grade (an over-fill wastes a second
 * milk) and starts the steam meter. Returns the run's ticks.
 */
export function afterInsert(state: GameState, p: Player, station: Station, recipe: Recipe, ticks: number): number {
  let out = ticks;
  if (state.gear === true && station.kind === 'espresso' && recipe.gives === 'espresso' && (state.supplies.beans ?? 0) >= 1 && wantsDouble(state)) {
    useStock(state, 'beans');
    station.made = { ...station.made, shots: 2 };
    out = Math.round(ticks * HANDMADE.doubleTime);
  }
  if (needsJug(state, p, station, recipe) && p.jug?.done) {
    const grade = fillGrade(p.jug.fill, p.jug.line);
    station.made = { ...station.made, milk: grade };
    if (grade === 'over' && readyStock(state, 'milk') >= 1) useStock(state, 'milk');
    delete p.jug;
    p.steam = { startedAt: state.tick, speed: HANDMADE.steamSpeed, station: station.id };
  }
  return out;
}

/**
 * Each day tick, after the stations: a filling jug rises (stopping itself full); a jug whose shot left the hands is
 * gone; a steam meter whose wand finished (or went away) scalds the milk (a miss); empty hands carry no marks.
 */
export function stepHandmade(state: GameState): void {
  for (const p of state.players) {
    if (p.jug && (p.bot || p.holding !== 'espresso')) delete p.jug;
    if (p.jug && !p.jug.done) {
      p.jug.fill = jugFill(state, p);
      if (p.jug.fill >= 1) stopJug(state, p);
    }
    if (p.steam) {
      const st = state.stations.find((x) => x.id === p.steam!.station);
      if (!st || st.busyTicksLeft === 0) stopSteam(state, p, 'miss');
    }
    if (p.holding === null) delete p.made;
  }
}

// ---------------------------------------------------------------------------------------------- the syrup rack

export const isSyrupRack = (st: Station | null | undefined): boolean => st?.id === SYRUP_ID && st.kind === 'counter';

/** The rack is on the floor of a Gear shop with a wand, and only then (idempotent; slots.ensureCounterSpots). */
export function ensureSyrupRack(state: GameState): void {
  if (state.gear !== true) return;
  const wand = state.stations.some((s) => s.kind === 'steamer');
  const has = state.stations.some(isSyrupRack);
  if (wand && !has) state.stations.push({ id: SYRUP_ID, kind: 'counter', pos: { ...SYRUP_SPOT }, busyTicksLeft: 0, output: null, occupiedBy: null });
  if (!wand && has) state.stations = state.stations.filter((s) => !isSyrupRack(s));
}

/** One `flavour` syrup into the cup in hand at the rack: a shot, latte or cappuccino with none yet, and flavour in stock. */
export function addSyrup(state: GameState, p: Player, flavour: Flavour): boolean {
  if (state.gear !== true || p.tool !== null || p.holding === null || !SYRUP_CUPS.includes(p.holding)) return false;
  if (p.made?.syrup || (state.supplies.flavour ?? 0) < 1) return false;
  const rack = state.stations.find(isSyrupRack);
  if (!rack || dist(p.pos, rack.pos) > ECONOMY.interactRangeTiles) return false;
  state.supplies.flavour -= 1;
  p.made = { ...p.made, syrup: flavour };
  emitLog(state, 'syrup.add', { by: p.id, flavour });
  return true;
}

/** The `syrup` input (people; bots call addSyrup from their plan): day or closing only. */
export function applySyrupInput(state: GameState, input: Extract<PlayerInput, { kind: 'syrup' }>): void {
  if (state.phase !== 'day' && state.phase !== 'closing') return;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || p.bot || !p.connected) return;
  addSyrup(state, p, input.flavour);
}

// ---------------------------------------------------------------------------------------------- serving

/** How the cup on the counter was made, for a pass entry (absent when nothing special). */
export function madeOnPass(p: Player): Pick<PassItem, 'made'> {
  return p.made ? { made: p.made } : {};
}
