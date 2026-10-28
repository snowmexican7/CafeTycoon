import { ECONOMY } from '../../data/economy';
import { LAYOUT } from '../../data/layout';
import { availableDrinks } from '../customers';
import { eventActive } from '../events';
import type { Modifiers } from '../effects';
import { nearestStation } from '../movement';
import { rngInt } from '../rng';
import { STATION_RECIPES } from '../stations';
import type { BotAction, BotState, BotStep, Customer, DrinkId, GameState, ItemKind, Player, Station, StationKind, Vec2 } from '../types';
import { findPath, idleNode, targetNodes } from './path';

const BOTS = ECONOMY.bots;

type RecipeKind = keyof typeof STATION_RECIPES;

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const isDrink = (item: ItemKind | null): item is DrinkId => item !== null && item !== 'grounds';
const isRecipeKind = (kind: StationKind): kind is RecipeKind => kind in STATION_RECIPES;

function stationId(kind: StationKind): string {
  return LAYOUT.stations.find((s) => s.kind === kind)!.id;
}

function use(kind: StationKind, action: BotAction): BotStep {
  return { kind: 'use', station: stationId(kind), action };
}

/** The steps to make `drink` from scratch and hand it over (`serve`) or park it on the pass (`put`). */
export function chainFor(drink: DrinkId, finish: 'serve' | 'put'): BotStep[] {
  const make = (kind: StationKind): BotStep[] => [use(kind, 'insert'), use(kind, 'take')];
  const prep =
    drink === 'coldBrew'
      ? make('coldBrewTap')
      : [...make('grinder'), ...make('espresso'), ...(drink === 'latte' ? make('steamer') : [])];
  return [...prep, use('counter', finish)];
}

/** What to do with whatever is in hand when the plan falls through: park a drink, bin anything else. */
export function dropPlan(_state: GameState, p: Player): BotStep[] {
  if (p.holding === null) return [];
  return isDrink(p.holding) ? [use('counter', 'put')] : [use('trash', 'trash')];
}

function claimedByOther(state: GameState, self: Player, customerId: number): boolean {
  return state.players.some((p) => p !== self && p.bot?.claim === customerId);
}

/** A claiming bot whose next step is to take from `st`: that drink is already accounted for by its claim. */
function claimedAtStation(state: GameState, st: Station): boolean {
  return state.players.some((p) => p.bot?.claim != null && isTakeAt(p.bot.plan[0], st));
}

/**
 * Drinks already on their way: held by non-claiming players, waiting or brewing at stations (unless a
 * claiming bot is about to take them), or on the pass.
 */
function coveragePool(state: GameState): Record<DrinkId, number> {
  const pool: Record<DrinkId, number> = { espresso: 0, latte: 0, coldBrew: 0 };
  for (const p of state.players) {
    if (p.bot?.claim != null) continue;
    if (isDrink(p.holding)) pool[p.holding] += 1;
  }
  for (const st of state.stations) {
    if (claimedAtStation(state, st)) continue;
    if (isDrink(st.output)) pool[st.output] += 1;
    if (st.busyTicksLeft > 0 && isRecipeKind(st.kind)) {
      const gives = STATION_RECIPES[st.kind].gives;
      if (isDrink(gives)) pool[gives] += 1;
    }
  }
  for (const item of state.pass) pool[item.item] += 1;
  return pool;
}

/** The first customer in queue order that no other bot claimed, is on the menu, and no drink in flight covers. */
export function uncoveredOrder(state: GameState, self: Player): Customer | null {
  const pool = coveragePool(state);
  const menu = availableDrinks(state);
  for (const c of state.customers) {
    if (claimedByOther(state, self, c.id)) continue;
    if (!menu.includes(c.drink)) continue;
    if (pool[c.drink] > 0) {
      pool[c.drink] -= 1;
      continue;
    }
    return c;
  }
  return null;
}

function coldBrewsAhead(state: GameState): number {
  const onPass = state.pass.filter((i) => i.item === 'coldBrew').length;
  const held = state.players.filter((p) => p.holding === 'coldBrew').length;
  const inTap = state.stations.filter(
    (st) => st.kind === 'coldBrewTap' && (st.busyTicksLeft > 0 || st.output === 'coldBrew'),
  ).length;
  return onPass + held + inTap;
}

/** A drink left sitting in a machine that no other bot is already on its way to take; nearest first. */
function orphanedDrink(state: GameState, self: Player): Station | null {
  const takenBy = (st: Station) =>
    state.players.some((p) => p !== self && p.bot && isTakeAt(p.bot.plan[0], st));
  const candidates = state.stations
    .filter((st) => isRecipeKind(st.kind) && isDrink(st.output) && !takenBy(st))
    .map((st) => ({ st, d: dist(st.pos, self.pos) }))
    .sort((a, b) => a.d - b.d || a.st.pos.y - b.st.pos.y || a.st.pos.x - b.st.pos.x);
  return candidates[0]?.st ?? null;
}

function shouldPrep(state: GameState, p: Player): boolean {
  return (
    BOTS.personalities[p.bot!.personality].preps &&
    state.pass.length < ECONOMY.pass.slots &&
    coldBrewsAhead(state) < BOTS.prepColdBrews &&
    availableDrinks(state).includes('coldBrew')
  );
}

/** Pick the next job. First match wins. A thinking bot has nothing in progress, so it starts unclaimed. */
export function think(state: GameState, p: Player): BotStep[] {
  const b = p.bot!;
  b.claim = null;
  b.claimDrink = null;
  // 0. Deal with whatever is in hand.
  if (p.holding === 'grounds') return [use('trash', 'trash')];
  if (isDrink(p.holding)) {
    const drink = p.holding;
    if (state.customers.some((c) => c.drink === drink)) return [use('counter', 'serve')];
    if (state.pass.length < ECONOMY.pass.slots) return [use('counter', 'put')];
    return [use('trash', 'trash')];
  }
  // 0b. Collect a drink left in a machine (e.g. its customer left mid-chain); rule 0 then places it.
  const orphan = orphanedDrink(state, p);
  if (orphan) return [{ kind: 'use', station: orphan.id, action: 'take' }];
  // 1. A drink on the pass that a customer (not another bot's) is waiting for.
  const onPass = new Set(state.pass.map((i) => i.item));
  if (state.customers.some((c) => !claimedByOther(state, p, c.id) && onPass.has(c.drink))) return [use('counter', 'serve')];
  // 2. An order nobody is covering: claim it and make it.
  const order = uncoveredOrder(state, p);
  if (order) {
    b.claim = order.id;
    b.claimDrink = order.drink;
    return chainFor(order.drink, 'serve');
  }
  // 3. Prep cold brew for the pass.
  if (shouldPrep(state, p)) return chainFor('coldBrew', 'put');
  // 4. Wait near the counter.
  return [{ kind: 'idle', node: idleNode(state, p) }];
}

/** A long queue or the rush hour: bots react faster and fumble more. */
export function underPressure(state: GameState): boolean {
  return state.customers.length >= BOTS.pressureQueue || eventActive(state, 'rushHour');
}

/** Skill-dial multiplier for the bot's personality; stand-ins ('human') ignore the dial. */
function skillFactor(state: GameState, bot: BotState, dial: readonly number[]): number {
  return bot.personality === 'human' ? 1 : dial[state.settings.botSkill - 1];
}

/**
 * Ticks a bot hesitates before starting a newly adopted job. Always draws from the rng, even for a
 * stand-in (whose reaction is 0), so the stream does not depend on the crew's personalities.
 */
export function reactionDelay(state: GameState, bot: BotState): number {
  const [lo, hi] = BOTS.reactionTicks;
  const base = lo + rngInt(state, hi - lo + 1);
  const personality = BOTS.personalities[bot.personality].reaction;
  const skill = skillFactor(state, bot, BOTS.skill.reaction);
  const pressure = underPressure(state) ? BOTS.pressure.reaction : 1;
  return Math.round(base * personality * skill * pressure);
}

function setPlan(b: BotState, plan: BotStep[]): void {
  b.plan = plan;
  b.path = [];
  b.yields = 0;
  b.nodeRank = 0;
  b.waitTicks = 0;
}

function pop(b: BotState): void {
  b.plan.shift();
  b.path = [];
  b.waitTicks = 0;
}

function abandon(state: GameState, p: Player): void {
  const b = p.bot!;
  b.claim = null;
  b.claimDrink = null;
  setPlan(b, dropPlan(state, p));
}

function wait(state: GameState, p: Player): void {
  const b = p.bot!;
  b.waitTicks += 1;
  if (b.waitTicks > BOTS.maxWaitTicks) abandon(state, p);
}

function execute(p: Player): void {
  p.interactQueued = true;
  pop(p.bot!);
}

function claimLost(state: GameState, b: BotState): boolean {
  const c = state.customers.find((x) => x.id === b.claim);
  return c === undefined || c.drink !== b.claimDrink;
}

function isTakeAt(s: BotStep | undefined, station: Station): boolean {
  return s?.kind === 'use' && s.station === station.id && s.action === 'take';
}

/** At the station: press "use" when the step can happen, wait while the machine is busy, else give up. */
function act(state: GameState, p: Player, action: BotAction, st: Station): void {
  const b = p.bot!;
  switch (action) {
    case 'insert': {
      if (!isRecipeKind(st.kind)) return abandon(state, p);
      const r = STATION_RECIPES[st.kind];
      const idle = st.busyTicksLeft === 0 && st.output === null;
      const stocked = r.consumes === null || state.supplies[r.consumes] >= 1;
      if (idle && p.holding === r.takes && stocked) return execute(p);
      if (p.holding === null && st.output === r.gives) {
        execute(p); // takes the leftover: this step and the following take are both done
        if (isTakeAt(b.plan[0], st)) b.plan.shift();
        return;
      }
      if (st.busyTicksLeft > 0 || st.output !== null) return wait(state, p);
      return abandon(state, p);
    }
    case 'take':
      if (st.output !== null && p.holding === null) return execute(p);
      if (st.busyTicksLeft > 0) return wait(state, p);
      return abandon(state, p);
    case 'serve': {
      if (b.noticeTicksLeft > 0) return wait(state, p);
      const held = p.holding;
      const onPass = new Set(state.pass.map((i) => i.item));
      const wanted = isDrink(held)
        ? state.customers.some((c) => c.drink === held)
        : held === null && state.customers.some((c) => onPass.has(c.drink));
      if (wanted) return execute(p);
      return setPlan(b, dropPlan(state, p));
    }
    case 'put':
      if (b.noticeTicksLeft > 0) return wait(state, p);
      return execute(p);
    case 'trash':
      return execute(p);
  }
}

/** Head for `node` along a fresh A* path, one tile centre at a time. */
function walkToward(state: GameState, p: Player, node: Vec2): void {
  const b = p.bot!;
  if (b.path.length === 0) {
    const path = findPath(state, p.pos, node);
    if (path === null) return abandon(state, p);
    b.path = path;
    if (b.path.length === 0) return;
  }
  if (dist(p.pos, b.path[0]) <= BOTS.arriveRadius) {
    b.path = []; // re-plan from this node next tick
    return;
  }
  p.moveDir = { x: b.path[0].x - p.pos.x, y: b.path[0].y - p.pos.y };
}

function stepBot(state: GameState, p: Player): void {
  const b = p.bot!;
  p.moveDir = { x: 0, y: 0 };
  if (b.claim !== null && claimLost(state, b)) {
    b.claim = null;
    b.claimDrink = null;
    setPlan(b, dropPlan(state, p)); // Review Focus 1
  }
  if (b.reactionTicksLeft > 0) {
    b.reactionTicksLeft -= 1;
    return;
  }
  // Task 13 (yieldTicksLeft) wait slots in here.

  if (b.plan.length === 0 || b.plan[0].kind === 'idle') {
    b.thinkTicksLeft -= 1;
    if (b.thinkTicksLeft <= 0) {
      b.thinkTicksLeft = BOTS.thinkTicks;
      const next = think(state, p);
      if (next.length > 0 && next[0].kind === 'use') {
        setPlan(b, next);
        b.reactionTicksLeft = reactionDelay(state, b);
        if (b.reactionTicksLeft > 0) return; // a moment to react before moving off
      } else if (b.plan.length === 0) b.plan = next;
    }
  }
  if (b.plan.length === 0) return;

  const current = b.plan[0];
  let node: Vec2;
  let station: Station | null = null;
  if (current.kind === 'idle') node = current.node;
  else {
    station = state.stations.find((s) => s.id === current.station) ?? null;
    const nodes = station ? targetNodes(state, station, p.pos) : [];
    if (nodes.length === 0) return abandon(state, p);
    node = nodes[Math.min(b.nodeRank, nodes.length - 1)];
  }

  if (dist(p.pos, node) > BOTS.arriveRadius) return walkToward(state, p, node);
  if (current.kind === 'idle' || station === null) return pop(b);
  // Within arriveRadius of a node that ties between two stations, edge onto the node so "use" hits the right one.
  if (nearestStation(state, p.pos)?.id !== station.id) {
    p.moveDir = { x: node.x - p.pos.x, y: node.y - p.pos.y };
    return;
  }
  // Task 11 (noticeTicksLeft) is checked in act() for serve and put.
  act(state, p, current.action, station);
}

/** Every connected bot, in players order, picks its moveDir and whether to press "use" this tick. */
export function stepBots(state: GameState, _m: Modifiers): GameState {
  for (const p of state.players) {
    if (p.bot && p.connected) stepBot(state, p);
  }
  return state;
}
