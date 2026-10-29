import { ECONOMY } from '../../data/economy';
import { LAYOUT } from '../../data/layout';
import { availableDrinks } from '../customers';
import { eventActive } from '../events';
import type { Modifiers } from '../effects';
import { nearestStation } from '../movement';
import { emitLog } from '../log';
import { rngInt, rngNext } from '../rng';
import { STATION_RECIPES } from '../stations';
import { tally } from '../tally';
import type { BotAction, BotState, BotStep, Customer, DrinkId, GameState, ItemKind, Mess, Player, Station, StationKind, Vec2 } from '../types';
import { byDistance, findPath, idleNode, nodeOf, targetNodes, walkableNodes } from './path';
import { spillHeld, spillTiles } from '../floor';
import { nearestMess, returnMop } from '../mop';
import { rogueNear, rogueTiles } from '../rogue';

const BOTS = ECONOMY.bots;
const MESS = ECONOMY.mess;

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

/** Finished drinks already on their way, plus `pending`: shots-to-be that will end up as an espresso or a latte. */
interface Coverage { drinks: Record<DrinkId, number>; pending: number }

/**
 * Drinks already on their way: held by non-claiming players, waiting or brewing at stations (unless a
 * claiming bot is about to take them), or on the pass. A person's chain in progress counts as pending:
 * grounds they hold or in/at the grinder, and a shot they hold or in/at the espresso machine.
 */
function coveragePool(state: GameState): Coverage {
  const drinks: Record<DrinkId, number> = { espresso: 0, latte: 0, coldBrew: 0 };
  let pending = 0;
  for (const p of state.players) {
    if (p.bot?.claim != null) continue;
    if (!p.bot && (p.holding === 'grounds' || p.holding === 'espresso')) pending += 1;
    else if (isDrink(p.holding)) drinks[p.holding] += 1;
  }
  for (const st of state.stations) {
    if (st.occupiedBy !== null) continue; // a rogue's drink is not for the queue
    if (claimedAtStation(state, st)) continue;
    const brewing = st.busyTicksLeft > 0 && isRecipeKind(st.kind) ? STATION_RECIPES[st.kind].gives : null;
    for (const item of [st.output, brewing]) {
      if (item === null) continue;
      if (st.kind === 'grinder' || st.kind === 'espresso') pending += 1;
      else if (isDrink(item)) drinks[item] += 1;
    }
  }
  for (const item of state.pass) drinks[item.item] += 1;
  return { drinks, pending };
}

/** The first customer in queue order that no other bot claimed, is on the menu, and no drink in flight covers. */
export function uncoveredOrder(state: GameState, self: Player): Customer | null {
  const { drinks, pending } = coveragePool(state);
  let shots = pending;
  const menu = availableDrinks(state);
  for (const c of state.customers) {
    if (claimedByOther(state, self, c.id)) continue;
    if (!menu.includes(c.drink)) continue;
    if (drinks[c.drink] > 0) {
      drinks[c.drink] -= 1;
      continue;
    }
    if (c.drink !== 'coldBrew' && shots > 0) {
      shots -= 1;
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
  // A person standing at the machine is about to take it themselves.
  const personAt = (st: Station) =>
    state.players.some((p) => !p.bot && p.connected && dist(p.pos, st.pos) <= ECONOMY.interactRangeTiles);
  const candidates = state.stations
    .filter((st) => isRecipeKind(st.kind) && isDrink(st.output) && !takenBy(st) && !personAt(st))
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

/**
 * Where a bot stands to clean `mess`: the walkable node within interact range of it with no spill on
 * it, nearest `from` (ties lower y, then x); else the mess tile itself.
 */
export function cleanNode(state: GameState, mess: Mess, from: Vec2): Vec2 {
  const wet = new Set(spillTiles(state).map((t) => `${t.x},${t.y}`));
  const dry = walkableNodes(state).filter(
    (n) => dist(n, mess) <= ECONOMY.interactRangeTiles && !wet.has(`${n.x},${n.y}`),
  );
  return byDistance(dry, from)[0] ?? { x: mess.x, y: mess.y };
}

/**
 * Take the mop, clean up to botMopMax messes (greedy: the nearest to the previous node next, ties to
 * the lower `messes` index), then put the mop back from the last clean node.
 */
export function mopPlan(state: GameState, _p: Player): BotStep[] {
  let at = nodeOf(state, state.mop.pos);
  const plan: BotStep[] = [{ kind: 'floor', node: at, action: 'takeMop' }];
  const left = [...state.messes];
  for (let i = 0; i < MESS.botMopMax && left.length > 0; i++) {
    let best = 0;
    for (let j = 1; j < left.length; j++) if (dist(left[j], at) < dist(left[best], at)) best = j;
    const [mess] = left.splice(best, 1);
    at = cleanNode(state, mess, at);
    plan.push({ kind: 'floor', node: at, action: 'clean' });
  }
  plan.push({ kind: 'floor', node: at, action: 'returnMop' });
  return plan;
}

/** The mop is free, the floor is dirty enough, and no other bot is already on a mop plan. */
function shouldMop(state: GameState, p: Player): boolean {
  return (
    state.mop.heldBy === null &&
    state.messes.length > 0 &&
    (state.cleanliness < MESS.botMopBelow || state.messes.length >= MESS.botMopMesses) &&
    !state.players.some((o) => o !== p && o.bot?.plan.some((st) => st.kind === 'floor'))
  );
}

/** Pick the next job. First match wins. A thinking bot has nothing in progress, so it starts unclaimed. */
export function think(state: GameState, p: Player): BotStep[] {
  const b = p.bot!;
  b.claim = null;
  b.claimDrink = null;
  // 0. Deal with whatever is in hand (the mop goes back first: it fills the hands).
  if (p.tool === 'mop') return [{ kind: 'floor', node: nodeOf(state, p.pos), action: 'returnMop' }];
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
  // 3b. Nothing waiting: mop a dirty floor.
  if (shouldMop(state, p)) return mopPlan(state, p);
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

/**
 * Right after a bot's "use": a drink just taken from a recipe station with empty hands may be botched.
 * The bot does not know yet; it notices after a while (see stepBot) and bins it.
 */
export function afterBotInteract(state: GameState, p: Player, heldBefore: ItemKind | null): void {
  const b = p.bot;
  if (!b || heldBefore !== null || !isDrink(p.holding)) return;
  const st = nearestStation(state, p.pos);
  if (!st || !isRecipeKind(st.kind)) return;
  const chance =
    BOTS.personalities[b.personality].mistake *
    skillFactor(state, b, BOTS.skill.mistake) *
    (underPressure(state) ? BOTS.pressure.mistake : 1);
  if (rngNext(state) >= chance) return;
  b.mistakes += 1;
  tally(state.today, 'botMistakes');
  emitLog(state, 'bot.mistake', { bot: p.name, drink: p.holding });
  const [lo, hi] = BOTS.noticeTicks;
  b.noticeTicksLeft = lo + rngInt(state, hi - lo + 1);
}

function setPlan(b: BotState, plan: BotStep[]): void {
  b.plan = plan;
  b.path = [];
  b.yields = 0;
  b.nodeRank = 0;
  b.target = null;
  b.waitTicks = 0;
}

function pop(b: BotState): void {
  b.plan.shift();
  b.path = [];
  b.yields = 0;
  b.nodeRank = 0;
  b.target = null;
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
      // A drink not yet checked stays in hand: a botched espresso must not become a latte.
      if (b.noticeTicksLeft > 0 && isDrink(p.holding)) return wait(state, p);
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

/** The bot has yielded during this step: from now on it plans around the other players. */
const hasYielded = (b: BotState): boolean => b.yields > 0 || b.nodeRank > 0;

/**
 * Someone else (person or bot) is standing on the bot's next waypoint. A bot that has run out of
 * other target nodes and yielded another yieldsBeforeRerank times walks through (nobody collides).
 */
function shouldYield(state: GameState, self: Player, waypoint: Vec2, maxRank: number): boolean {
  const b = self.bot!;
  if (b.nodeRank >= maxRank && b.yields >= 2 * BOTS.yieldsBeforeRerank) return false;
  if (rogueNear(state, waypoint)) return true;
  return state.players.some((p) => p !== self && p.connected && dist(p.pos, waypoint) <= BOTS.yieldRadius);
}

/**
 * Stand aside for a moment, then re-plan; after yieldsBeforeRerank yields toward one node, try the
 * next-nearest. At the last node the yields keep counting until shouldYield lets the bot through.
 */
function yieldWay(state: GameState, b: BotState, maxRank: number): void {
  const [lo, hi] = BOTS.yieldTicks;
  b.yieldTicksLeft = lo + rngInt(state, hi - lo + 1);
  b.yields += 1;
  b.path = [];
  if (b.yields >= BOTS.yieldsBeforeRerank && b.nodeRank < maxRank) {
    b.nodeRank += 1;
    b.yields = 0;
    b.target = null; // re-pinned at the new rank next tick
  }
}

/**
 * A path to `node`, around spills when possible; after a yield, also around the nodes other players
 * (and the rogue) stand on. Falls back to fewer avoided tiles, then the plain path.
 */
function planPath(state: GameState, p: Player, node: Vec2): Vec2[] | null {
  const spills = spillTiles(state);
  const people = hasYielded(p.bot!)
    ? [...state.players.filter((o) => o !== p && o.connected).map((o) => nodeOf(state, o.pos)), ...rogueTiles(state)]
    : [];
  for (const avoid of [[...spills, ...people], spills]) {
    if (avoid.length === 0) continue;
    const around = findPath(state, p.pos, node, avoid);
    if (around !== null) return around;
  }
  return findPath(state, p.pos, node);
}

/**
 * A floor step on arrival. takeMop: press "use" when the mop is free, in range and the hands are
 * empty, else drop the plan. clean: press "use" when a mess is in range (with the mop in hand).
 * returnMop: press R (with the mop in hand). clean and returnMop pop either way.
 */
export function stepFloor(state: GameState, p: Player, step: Extract<BotStep, { kind: 'floor' }>): void {
  const b = p.bot!;
  switch (step.action) {
    case 'takeMop': {
      const free = state.mop.heldBy === null;
      const inRange = dist(p.pos, state.mop.pos) <= ECONOMY.interactRangeTiles;
      if (free && inRange && p.holding === null && p.tool === null) return execute(p);
      return setPlan(b, []);
    }
    case 'clean':
      // Without the mop, "use" could take a station's output instead.
      if (p.tool === 'mop' && nearestMess(state, p.pos) !== null) p.interactQueued = true;
      return pop(b);
    case 'returnMop':
      if (p.tool === 'mop') p.dropQueued = true; // with empty hands R does nothing else
      return pop(b);
  }
}

/** Head for `node` along a fresh A* path, one tile centre at a time. */
function walkToward(state: GameState, p: Player, node: Vec2, maxRank: number): void {
  const b = p.bot!;
  if (b.path.length === 0) {
    const path = planPath(state, p, node);
    if (path === null) return abandon(state, p);
    b.path = path;
    if (b.path.length === 0) return;
  }
  if (dist(p.pos, b.path[0]) <= BOTS.arriveRadius) {
    b.path = []; // re-plan from this node next tick
    return;
  }
  if (shouldYield(state, p, b.path[0], maxRank)) return yieldWay(state, b, maxRank);
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
  if (b.noticeTicksLeft > 0) {
    b.noticeTicksLeft -= 1;
    if (b.noticeTicksLeft === 0) {
      // Noticed the botched drink in hand: half the time it hits the floor where the bot stands (not at
      // the cap), else bin it; then remake the claimed order (if still on one).
      const remake = b.claimDrink && b.claim !== null ? chainFor(b.claimDrink, 'serve') : [];
      const spilled = isDrink(p.holding) && rngNext(state) < MESS.botSpillChance && spillHeld(state, p);
      setPlan(b, spilled ? remake : [use('trash', 'trash'), ...remake]);
    }
  }
  // Orders come first: an uncovered order interrupts any floor step, a clean in progress included.
  if ((b.plan[0]?.kind === 'floor' || p.cleaningTicksLeft > 0) && uncoveredOrder(state, p) !== null) {
    p.cleaningTicksLeft = 0;
    p.cleaningMess = null;
    if (p.tool === 'mop') returnMop(state, p);
    setPlan(b, []);
    b.thinkTicksLeft = 0; // think this tick: it claims the order
  }
  // Cleaning: keep still until the clean is done (moving would cancel it).
  if (p.cleaningTicksLeft > 0) return;
  if (b.reactionTicksLeft > 0) {
    b.reactionTicksLeft -= 1;
    return;
  }
  if (b.yieldTicksLeft > 0) {
    b.yieldTicksLeft -= 1;
    return;
  }

  if (b.plan.length === 0 || b.plan[0].kind === 'idle') {
    b.thinkTicksLeft -= 1;
    if (b.thinkTicksLeft <= 0) {
      b.thinkTicksLeft = BOTS.thinkTicks;
      const next = think(state, p);
      if (next.length > 0 && next[0].kind !== 'idle') {
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
  let maxRank = 0;
  if (current.kind === 'idle' || current.kind === 'floor') node = current.node;
  else {
    station = state.stations.find((s) => s.id === current.station) ?? null;
    const nodes = station ? targetNodes(state, station, p.pos) : [];
    if (nodes.length === 0) return abandon(state, p);
    maxRank = nodes.length - 1;
    // Pinned once per step (and per rank): re-ranking from a moving bot would swap tied nodes every tick.
    b.target ??= nodes[Math.min(b.nodeRank, maxRank)];
    node = b.target;
  }

  if (dist(p.pos, node) > BOTS.arriveRadius) return walkToward(state, p, node, maxRank);
  if (current.kind === 'floor') return stepFloor(state, p, current);
  if (current.kind === 'idle' || station === null) return pop(b);
  // Within arriveRadius of a node that ties between two stations, edge onto the node so "use" hits the right one.
  if (nearestStation(state, p.pos)?.id !== station.id) {
    p.moveDir = { x: node.x - p.pos.x, y: node.y - p.pos.y };
    return;
  }
  // noticeTicksLeft is checked in act(): serve, put and insert-with-a-drink wait for it.
  act(state, p, current.action, station);
}

/** Every connected bot, in players order, picks its moveDir and whether to press "use" this tick. */
export function stepBots(state: GameState, _m: Modifiers): GameState {
  for (const p of state.players) {
    if (p.bot && p.connected && p.stunTicksLeft === 0) stepBot(state, p);
  }
  return state;
}
