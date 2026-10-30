import { ECONOMY } from '../../data/economy';
import { ACCURACY } from '../accuracy';
import { availableDrinks } from '../customers';
import { secondsToTicks } from '../constants';
import { eventActive } from '../events';
import type { Modifiers } from '../effects';
import { nearestStation } from '../movement';
import { emitLog } from '../log';
import { rngInt, rngNext } from '../rng';
import { STATION_RECIPES, recipeAt, stocked } from '../stations';
import { RECIPES, recipeChain, usesShot } from '../../data/drinks';
import { GEAR } from '../../data/gear';
import { zeroDrinks } from '../tally';
import { tally } from '../tally';
import type { BotAction, BotState, BotStep, Customer, DrinkId, GameState, ItemKind, Mess, Player, Station, StationKind, Vec2 } from '../types';
import { byDistance, findPath, floorDropNode, idleNode, nodeOf, targetNodes, walkableNodes } from './path';
import { spillHeld, spillTiles } from '../floor';
import { floorWidth } from '../growth';
import { gearArea } from '../gear';
import { nearestMess, returnMop } from '../mop';
import { rogueNear, rogueTiles } from '../rogue';

const BOTS = ECONOMY.bots;
const MESS = ECONOMY.mess;

type RecipeKind = keyof typeof STATION_RECIPES;

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const isDrink = (item: ItemKind | null): item is DrinkId => item !== null && item !== 'grounds';
const isRecipeKind = (kind: StationKind): kind is RecipeKind => kind in STATION_RECIPES;

const isIdle = (st: Station): boolean => st.busyTicksLeft === 0 && st.output === null && st.occupiedBy === null;

/** Another bot's plan already has a step at `st` (it is on its way there, or will be). */
function plannedByOther(state: GameState, self: Player, st: Station): boolean {
  return state.players.some((o) => o !== self && o.bot?.plan.some((x) => x.kind === 'use' && x.station === st.id));
}

/**
 * The nearest station of `kind` that is idle and no other bot plans to use, ties to the lower array
 * index, excluding `skip`; null when there is none.
 */
function idleOfKind(state: GameState, p: Player, kind: StationKind, skip: Station | null = null): Station | null {
  let best: Station | null = null;
  for (const st of state.stations) {
    if (st.kind !== kind || st === skip || !isIdle(st) || plannedByOther(state, p, st)) continue;
    if (best === null || dist(st.pos, p.pos) < dist(best.pos, p.pos)) best = st;
  }
  return best;
}

/**
 * Station resolution: a step names a concrete station id, fixed when the plan is made. Among the
 * shop's stations of `kind` (read from `state.stations`, so any slot layout works): the idle one
 * (not busy, no output, no rogue) that no other bot's plan already uses, nearest the bot (ties: the
 * lower array index); else the first of the kind; null when the shop has none of that kind, and the
 * caller then emits no step for it. With one station per kind (every default layout) this is always
 * that station, so default runs plan exactly as before. `act` may still move an insert/take pair to
 * an idle twin when the machine turns out busy (see `retarget`).
 */
function use(state: GameState, p: Player, kind: StationKind, action: BotAction): BotStep | null {
  const ofKind = state.stations.filter((st) => st.kind === kind);
  if (ofKind.length === 0) return null;
  const st = ofKind.length === 1 ? ofKind[0] : (idleOfKind(state, p, kind) ?? ofKind[0]);
  return { kind: 'use', station: st.id, action };
}

/** Put what is in hand in the bin; with no bin in the shop, on the floor away from every station. */
function binStep(state: GameState, p: Player): BotStep {
  return use(state, p, 'trash', 'trash') ?? { kind: 'floor', node: floorDropNode(state, p.pos), action: 'drop' };
}

/**
 * Getting rid of grounds in hand. To the bin; with no bin, on the floor. With no bin and the floor
 * at the mess cap (a floor drop would fail, so the bot would hold them for good, unable to take an
 * order or the mop), pull them through an espresso machine that takes grounds (never a pod machine)
 * and park the shot on the pass instead; with no such machine either, the floor drop stays (it is
 * re-planned until a mess is cleaned).
 */
function groundsPlan(state: GameState, p: Player): BotStep[] {
  const bin = binStep(state, p);
  if (bin.kind === 'use' || state.messes.length < MESS.max) return [bin];
  const shot = pick(state, p, { kind: 'espresso', held: 'grounds', gives: 'espresso' });
  const put = use(state, p, 'counter', 'put');
  if (shot === null || put === null) return [bin];
  return [...pair(shot.st, 'espresso'), put];
}

// ---------------------------------------------------------------------------------------------- station choice
// Gear runs put different machines on the same station kind: a pod machine and an E2+ are both 'espresso',
// a pot drip machine and a pour-over bar are both 'drip'. So every insert step is chosen by what the
// machine will make from what the bot will be holding there (`recipeAt`, exactly what `interact` runs).

/** One machine visit: at a station of `kind`, holding `held`, the machine should make `gives` (`last`: the drink itself). */
interface Need { kind: RecipeKind; held: ItemKind | null; gives: ItemKind; last?: boolean }

/**
 * Gear G9: stations a bot can work, i.e. with a walkable whole-tile node from which it is the station "use"
 * hits (`targetNodes` non-empty). A twin on an edge slot can sit out of reach of every node: that side is
 * for people only. Depends only on the floor and where the stations stand, so it is cached per layout.
 */
let reach: { key: string; ids: Set<string> } | null = null;
function reachable(state: GameState, st: Station): boolean {
  const key = `${floorWidth(state)}|${state.stations.map((x) => `${x.id}@${x.pos.x},${x.pos.y}`).join(';')}`;
  if (reach === null || reach.key !== key) {
    const ids = new Set<string>();
    for (const x of state.stations) if (targetNodes(state, x, x.pos).length > 0) ids.add(x.id);
    reach = { key, ids };
  }
  return reach.ids.has(st.id);
}

/** Gear G4d: a drip machine that brews pots (one press brews, each press after pours a cup). */
export const hasPot = (st: Station): boolean => !!st.gear && !!GEAR[st.gear].pot;

/** G4d: the pot in `st` would pour a too-hot or too-cold cup (a missed brew, or it sat past going cold). */
const potBad = (state: GameState, st: Station): boolean =>
  st.potOff !== undefined || (st.potColdAt !== undefined && state.tick >= st.potColdAt);

/** Other bots with a step at `st` (each will take a cup from a pot). */
const plannersAt = (state: GameState, self: Player, st: Station): number =>
  state.players.filter((o) => o !== self && o.bot?.plan.some((x) => x.kind === 'use' && x.station === st.id)).length;

/**
 * G4d, a cup of drip from a pot machine: 0 pour from a hot pot that has a cup left for this bot; 1 brew a
 * pot in an empty machine nobody else is about to brew; 2 wait for a pot that is brewing (or about to);
 * 3 pour from a pot gone cold or brewed off (only plain drip minds: a steamer or a shot on top reheats it);
 * 4 something else sits in it. A cold pot can't be rebrewed until it is poured out, so with no hot pot and
 * no empty machine a cold cup (half tip) still beats a walk-out.
 */
function potScore(state: GameState, p: Player, st: Station, need: Need): number {
  const others = plannersAt(state, p, st);
  if (st.output === 'drip' && st.potLeft !== undefined) {
    if (need.last && potBad(state, st)) return 3;
    return others < st.potLeft ? 0 : 2;
  }
  if (st.busyTicksLeft > 0) return 2;
  if (st.output === null) return others === 0 ? 1 : 2;
  return 4;
}

/** The insert/take pair at `st`; the insert remembers what it should make. */
const pair = (st: Station, gives: ItemKind): BotStep[] => [
  { kind: 'use', station: st.id, action: 'insert', makes: gives },
  { kind: 'use', station: st.id, action: 'take' },
];

/**
 * `st` can take this visit: the recipe it would run for `held` makes `gives` (a gear recipe first, the
 * menu, and the oldest-ticket clash rule all included, as in `interact`), a capped batch is not used up,
 * the machine is not dead, it is not jammed unless the bot arrives empty-handed (to whack it), and a bot
 * can stand at it (G9: not an out-of-reach twin).
 */
function canMake(state: GameState, st: Station, need: Need): boolean {
  if (st.kind !== need.kind || st.batchLeft === 0) return false;
  // G5: a dead machine is gone until tonight; a jammed one is fine for empty hands (they whack it first).
  if (st.dead || (st.jammed && need.held !== null) || !reachable(state, st)) return false;
  return recipeAt(state, st, need.held)?.gives === need.gives;
}

/** 0: start right away (idle, no other bot heading there); 1: it is busy or someone else plans it. Pots: potScore. */
function stationScore(state: GameState, p: Player, st: Station, need: Need): number {
  if (hasPot(st) && need.held === null && need.gives === 'drip') return potScore(state, p, st, need);
  return isIdle(st) && !plannedByOther(state, p, st) ? 0 : 1;
}

/**
 * The station for a visit: among the stations that can make it, the lowest score, then nearest the bot
 * (ties: the lower array index). `skip` is left out; with `freeOnly`, only a score-0 station will do.
 */
function pick(state: GameState, p: Player, need: Need, skip: Station | null = null, freeOnly = false): { st: Station; score: number } | null {
  let best: { st: Station; score: number; d: number } | null = null;
  for (const st of state.stations) {
    if (st === skip || !canMake(state, st, need)) continue;
    const score = stationScore(state, p, st, need);
    if (freeOnly && score > 0) continue;
    const d = dist(st.pos, p.pos);
    if (best === null || score < best.score || (score === best.score && d < best.d)) best = { st, score, d };
  }
  return best && { st: best.st, score: best.score };
}

/** The visits a drink needs from `held` on (null = from scratch), or null when `held` is not on its way. */
function needsFrom(drink: DrinkId, held: ItemKind | null): Need[] | null {
  const chain = recipeChain(drink).map(({ station, recipe }) => ({ kind: station, held: recipe.takes, gives: recipe.gives }));
  const at = chain.findIndex((c) => c.held === held);
  if (at < 0) return null;
  const out: Need[] = chain.slice(at);
  out[out.length - 1] = { ...out[out.length - 1], last: true };
  return out;
}

/** Pick a station for every visit (each pair keeps its station); null when one has no station. */
function route(state: GameState, p: Player, needs: Need[]): { steps: BotStep[]; scores: number[] } | null {
  const steps: BotStep[] = [];
  const scores: number[] = [];
  for (const need of needs) {
    const got = pick(state, p, need);
    if (got === null) return null;
    steps.push(...pair(got.st, need.gives));
    scores.push(got.score);
  }
  return { steps, scores };
}

/**
 * The machine visits for `drink` from `held` (null = from scratch), or null when the shop can't make it now.
 * A shot from scratch has two routes when the bar has both: grinder + a machine that takes grounds, or a pod
 * machine from empty hands. Same beans either way; the pod is quicker (one machine, no walk to the grinder)
 * but marks the cup (−1★), so it is the overflow: the grinder route when its grinder and machine are both
 * free right now, else the pod machine when it is free, else whichever route exists (grinder first).
 */
function machineSteps(state: GameState, p: Player, drink: DrinkId, held: ItemKind | null): BotStep[] | null {
  const needs = needsFrom(drink, held);
  if (needs === null) return null;
  const ground = route(state, p, needs);
  const shotFirst = needs[0]?.kind === 'grinder' && needs[1]?.kind === 'espresso' && needs[1].held === 'grounds';
  if (!shotFirst) return ground?.steps ?? null;
  const pod = route(state, p, [{ kind: 'espresso', held: null, gives: 'espresso' }, ...needs.slice(2)]);
  if (ground && ground.scores[0] === 0 && ground.scores[1] === 0) return ground.steps;
  if (pod && pod.scores[0] === 0) return pod.steps;
  return (ground ?? pod)?.steps ?? null;
}

/**
 * The steps to make `drink` and hand it over (`serve`) or park it on the pass (`put`), from scratch or
 * from `held` (an item already in hand on its way to the drink). [] when the shop can't make it now.
 */
export function chainFor(state: GameState, p: Player, drink: DrinkId, finish: 'serve' | 'put', held: ItemKind | null = null): BotStep[] {
  const steps = machineSteps(state, p, drink, held);
  const last = use(state, p, 'counter', finish);
  return steps === null || last === null ? [] : [...steps, last];
}

/** What to do with whatever is in hand when the plan falls through: park a drink, bin anything else (floor if no bin). */
export function dropPlan(state: GameState, p: Player): BotStep[] {
  if (p.holding === null) return [];
  if (p.holding === 'grounds') return groundsPlan(state, p);
  const put = isDrink(p.holding) ? use(state, p, 'counter', 'put') : null;
  return [put ?? binStep(state, p)];
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
 * grounds they hold or in/at the grinder, and a shot they hold or in/at the espresso machine. Grounds
 * parked anywhere but the grinder count for nothing.
 */
function coveragePool(state: GameState): Coverage {
  const drinks: Record<DrinkId, number> = zeroDrinks();
  let pending = 0;
  for (const p of state.players) {
    if (p.bot?.claim != null) continue;
    if (!p.bot && (p.holding === 'grounds' || p.holding === 'espresso')) pending += 1;
    else if (isDrink(p.holding)) drinks[p.holding] += 1;
  }
  for (const st of state.stations) {
    if (st.occupiedBy !== null) continue; // a rogue's drink is not for the queue
    if (hasPot(st)) continue; // G4d: a pot is a source of cups for whoever claims a drip, not one drink in flight
    if (claimedAtStation(state, st)) continue;
    const brewing = st.busyTicksLeft > 0 && isRecipeKind(st.kind) ? (st.making ?? STATION_RECIPES[st.kind].gives) : null;
    for (const item of [st.output, brewing]) {
      if (item === null) continue;
      // Only the machine's own product is a shot-to-be: grounds dropped on the espresso machine are not.
      const own = isRecipeKind(st.kind) && item === STATION_RECIPES[st.kind].gives;
      if (own && (st.kind === 'grinder' || st.kind === 'espresso')) pending += 1;
      else if (isDrink(item)) drinks[item] += 1;
    }
  }
  for (const item of state.pass) drinks[item.item] += 1;
  return { drinks, pending };
}

/** Every customer, in queue order, that no other bot claimed, is on the menu, and no drink in flight covers. */
export function uncoveredOrders(state: GameState, self: Player): Customer[] {
  const { drinks, pending } = coveragePool(state);
  let shots = pending;
  const menu = availableDrinks(state);
  const out: Customer[] = [];
  for (const c of state.customers) {
    if (claimedByOther(state, self, c.id)) continue;
    if (!menu.includes(c.drink)) continue;
    if (drinks[c.drink] > 0) {
      drinks[c.drink] -= 1;
      continue;
    }
    if (usesShot(c.drink) && shots > 0) {
      shots -= 1;
      continue;
    }
    out.push(c);
  }
  return out;
}

/** The first uncovered order (see uncoveredOrders), or null. */
export function uncoveredOrder(state: GameState, self: Player): Customer | null {
  return uncoveredOrders(state, self)[0] ?? null;
}

function coldBrewsAhead(state: GameState): number {
  const onPass = state.pass.filter((i) => i.item === 'coldBrew').length;
  const held = state.players.filter((p) => p.holding === 'coldBrew').length;
  const inTap = state.stations.filter(
    (st) => st.kind === 'coldBrewTap' && ((st.busyTicksLeft > 0 && (st.making ?? 'coldBrew') === 'coldBrew') || st.output === 'coldBrew'),
  ).length;
  return onPass + held + inTap;
}

/** Grounds parked in a machine that does not make them (e.g. dropped there): they block it until binned. */
const strayGrounds = (st: Station): boolean => st.kind !== 'grinder' && st.output === 'grounds';

/**
 * A drink left sitting in a machine, or stray grounds, that no other bot is already on its way to take;
 * nearest first.
 */
function orphanedDrink(state: GameState, self: Player): Station | null {
  const takenBy = (st: Station) =>
    state.players.some((p) => p !== self && p.bot && isTakeAt(p.bot.plan[0], st));
  // A person near the machine, or walking toward it, is about to take (or use) it themselves.
  const personAt = (st: Station) =>
    state.players.some((p) => {
      if (p.bot || !p.connected) return false;
      const d = dist(p.pos, st.pos);
      if (d <= BOTS.orphanGuardTiles) return true;
      return d <= 4 && p.moveDir.x * (st.pos.x - p.pos.x) + p.moveDir.y * (st.pos.y - p.pos.y) > 0;
    });
  // Not its own item until it has sat a while: a drink 12 s, a shot or grounds 15 s. Unknown age (old saves,
  // hand-built states) falls back to `doneAt`, then to "sat long enough" so a leftover never blocks a machine forever.
  const sat = (st: Station) => {
    const since = st.outputSince ?? st.doneAt;
    if (since === undefined) return true;
    const secs = st.output === 'espresso' || st.output === 'grounds' ? BOTS.orphanPrepSeconds : BOTS.orphanDrinkSeconds;
    return state.tick - since >= secondsToTicks(secs);
  };
  const candidates = state.stations
    // G4d: a pot's cups wait in the pot for the orders that claim them (pouring it out would only fill the pass).
    // G9: a drink on an out-of-reach twin is for people only (a bot would pick it, find no node, and loop).
    .filter((st) => isRecipeKind(st.kind) && (isDrink(st.output) || strayGrounds(st)) && !(hasPot(st) && st.output === 'drip') && reachable(state, st) && !takenBy(st) && !personAt(st) && sat(st))
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
    !state.players.some((o) => o !== p && o.bot?.plan.some(isMopStep))
  );
}

/** Pick the next job. First match wins. A thinking bot has nothing in progress, so it starts unclaimed. */
export function think(state: GameState, p: Player): BotStep[] {
  const b = p.bot!;
  b.claim = null;
  b.claimDrink = null;
  // 0. Deal with whatever is in hand (the mop goes back first: it fills the hands).
  if (p.tool === 'mop') return [{ kind: 'floor', node: nodeOf(state, p.pos), action: 'returnMop' }];
  if (p.holding === 'grounds') return groundsPlan(state, p);
  if (isDrink(p.holding)) {
    const drink = p.holding;
    const serve = state.customers.some((c) => c.drink === drink) ? use(state, p, 'counter', 'serve') : null;
    const put = state.pass.length < ECONOMY.pass.slots ? use(state, p, 'counter', 'put') : null;
    return [serve ?? put ?? binStep(state, p)];
  }
  // 0b. Collect a drink left in a machine (e.g. its customer left mid-chain), or stray grounds; rule 0 then places or bins it.
  const orphan = orphanedDrink(state, p);
  if (orphan) return [{ kind: 'use', station: orphan.id, action: 'take' }];
  // 1. A drink on the pass that a customer (not another bot's) is waiting for.
  const onPass = new Set(state.pass.map((i) => i.item));
  const serve = use(state, p, 'counter', 'serve');
  if (serve && state.customers.some((c) => !claimedByOther(state, p, c.id) && onPass.has(c.drink))) return [serve];
  // 2. An order nobody is covering that the shop can make now (queue order): claim it and make it.
  for (const order of uncoveredOrders(state, p)) {
    const chain = chainFor(state, p, order.drink, 'serve');
    if (chain.length === 0) continue;
    b.claim = order.id;
    b.claimDrink = order.drink;
    return chain;
  }
  // 3. Prep cold brew for the pass.
  const prep = shouldPrep(state, p) ? chainFor(state, p, 'coldBrew', 'put') : [];
  if (prep.length > 0) return prep;
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

/** Wait at the station; past the wait cap (plus `extra` ticks) give the plan up. */
function wait(state: GameState, p: Player, extra = 0): void {
  const b = p.bot!;
  b.waitTicks += 1;
  if (b.waitTicks > BOTS.maxWaitTicks + extra) abandon(state, p);
}

/** G4d: a pot takes longer to brew (20 s on the Thrift Store Special) than the wait cap; a brewing pot is worth it. */
const brewSlack = (st: Station): number => (hasPot(st) && st.busyTicksLeft > 0 ? (st.busyTotal ?? 0) : 0);

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

/** The machine is busy and `twin` (same kind) is idle: move this insert and its take there. */
function retarget(b: BotState, from: Station, twin: Station): void {
  if (isTakeAt(b.plan[1], from)) b.plan[1] = { kind: 'use', station: twin.id, action: 'take' };
  b.plan[0] = { ...b.plan[0], kind: 'use', station: twin.id, action: 'insert' };
  b.path = [];
  b.yields = 0;
  b.nodeRank = 0;
  b.target = null;
  b.waitTicks = 0;
}

/**
 * Gear G10b: a cup where a slip costs more than the wait: the arts crowd tips by stars, and a snob regular
 * tips big only for a perfect cup (this bot's claim is one).
 */
function carefulCup(state: GameState, p: Player): boolean {
  if (gearArea(state) === 'arts') return true;
  const c = state.customers.find((x) => x.id === p.bot!.claim);
  return !!c && c.kind === 'regular' && state.regulars.some((r) => r.snob && r.name === c.name && r.drink === c.drink);
}

/** A hurried bot with a queue behind it grabs a cup in the last stretch of its run instead of waiting it out. */
function pullsEarly(state: GameState, p: Player, st: Station): boolean {
  return (
    p.bot!.personality === 'hurried' &&
    !carefulCup(state, p) &&
    p.holding === null &&
    !hasPot(st) && // pulling a brewing pot early would take one cup and lose the rest of the pot
    st.busyTicksLeft > 0 &&
    !!st.making &&
    !!st.busyTotal &&
    st.busyTicksLeft <= st.busyTotal * ACCURACY.earlyShare &&
    state.customers.length >= BOTS.hurriedQueue
  );
}

/**
 * G5: an insert planned at a machine that has died since (the battery whisk). Re-plan from that step with
 * what the bot will be holding there; when nothing else can make it, keep the steps before it and drop the
 * claim (rule 0 of think places whatever ends up in hand). A take at a dead machine still collects its last cup.
 */
function replanAroundDead(state: GameState, p: Player): void {
  const b = p.bot!;
  const dead = (x: BotStep) => x.kind === 'use' && x.action === 'insert' && state.stations.some((st) => st.id === x.station && st.dead);
  const i = b.plan.findIndex(dead);
  if (i < 0) return;
  const inserts = b.plan.filter((x): x is Extract<BotStep, { kind: 'use' }> => x.kind === 'use' && x.action === 'insert');
  const before = b.plan.slice(0, i).filter((x): x is Extract<BotStep, { kind: 'use' }> => x.kind === 'use' && x.action === 'insert');
  const drink = b.claimDrink ?? inserts[inserts.length - 1]?.makes;
  // What the bot will hold at step i: the last insert's product; with none before it but a pending take
  // (the shot still pulling), what that take collects; else what is in hand now.
  const take = b.plan.slice(0, i).find((x): x is Extract<BotStep, { kind: 'use' }> => x.kind === 'use' && x.action === 'take');
  const from = take ? state.stations.find((st) => st.id === take.station) : undefined;
  const held = before.length > 0 ? before[before.length - 1].makes : from ? (from.making ?? from.output ?? undefined) : p.holding;
  const lastStep = b.plan[b.plan.length - 1];
  const finish = lastStep?.kind === 'use' && lastStep.action === 'put' ? 'put' : 'serve';
  const tail = drink && isDrink(drink) && held !== undefined ? chainFor(state, p, drink, finish, held) : [];
  if (tail.length > 0) {
    b.plan = [...b.plan.slice(0, i), ...tail];
    if (i === 0) setPlan(b, b.plan);
    return;
  }
  if (i === 0) return abandon(state, p);
  b.claim = null;
  b.claimDrink = null;
  b.plan = b.plan.slice(0, i);
}

/** At the station: press "use" when the step can happen, wait while the machine is busy, else give up. */
function act(state: GameState, p: Player, step: Extract<BotStep, { kind: 'use' }>, st: Station): void {
  const b = p.bot!;
  switch (step.action) {
    case 'insert': {
      if (!isRecipeKind(st.kind)) return abandon(state, p);
      // A drink not yet checked stays in hand: a botched espresso must not become a latte.
      if (b.noticeTicksLeft > 0 && isDrink(p.holding)) return wait(state, p);
      // The recipe `interact` will run here (gear recipe first: a pod machine pulls a shot from empty hands),
      // and only when it can start: stocked, and a capped cold brew batch not used up.
      const r = recipeAt(state, st, p.holding);
      const idle = st.busyTicksLeft === 0 && st.output === null;
      // The planned product, when the step knows it: a recipe clash (the oldest ticket wants the other drink) waits.
      const right = r !== null && (step.makes === undefined || r.gives === step.makes);
      // G5: a jammed machine. Empty hands whack it (gearBlocked fixes it; this step stays, so the next tick
      // brews). Full hands can't: try a free twin, else wait for someone to whack it, up to the wait cap.
      if (idle && st.jammed) {
        if (p.holding === null) {
          p.interactQueued = true;
          return;
        }
        const twin = step.makes !== undefined ? pick(state, p, { kind: st.kind as RecipeKind, held: p.holding, gives: step.makes }, st, true)?.st : null;
        return twin ? retarget(b, st, twin) : wait(state, p);
      }
      if (idle && r && right && stocked(state, r) && st.batchLeft !== 0) return execute(p);
      const kind = st.kind;
      const leftover =
        st.output !== null &&
        (step.makes === undefined || st.output === step.makes) &&
        (st.output === STATION_RECIPES[kind].gives || RECIPES[kind].some((x) => x.takes === null && x.gives === st.output));
      if (p.holding === null && leftover) {
        execute(p); // takes the leftover: this step and the following take are both done
        if (isTakeAt(b.plan[0], st)) b.plan.shift();
        return;
      }
      if (st.busyTicksLeft > 0 || st.output !== null || (idle && r && !right)) {
        const twin = step.makes !== undefined
          ? pick(state, p, { kind, held: p.holding, gives: step.makes }, st, true)?.st
          : idleOfKind(state, p, kind, st);
        return twin ? retarget(b, st, twin) : wait(state, p, brewSlack(st));
      }
      return abandon(state, p);
    }
    case 'take':
      if (st.output !== null && p.holding === null) return execute(p);
      if (pullsEarly(state, p, st)) return execute(p); // the interact early-pull takes the cup, one star off
      if (st.busyTicksLeft > 0) return wait(state, p, brewSlack(st));
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

/** A step of a mop plan (a floor drop is not one). */
const isMopStep = (step: BotStep | undefined): boolean => step?.kind === 'floor' && step.action !== 'drop';

/** A clean or returnMop step with no mop in hand (it was taken or sent home): the rest of the plan is moot. */
const mopGone = (p: Player, step: BotStep): boolean =>
  step.kind === 'floor' && (step.action === 'clean' || step.action === 'returnMop') && p.tool !== 'mop';

/**
 * A floor step on arrival. takeMop: press "use" when the mop is free, in range and the hands are
 * empty, else drop the plan. clean: press "use" when a mess is in range. returnMop: press R. Without
 * the mop, clean and returnMop drop the plan; with it they pop either way. drop: press R (no station
 * is in reach of the node, so what is in hand lands on the floor; resolveDrops does the rest).
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
      if (mopGone(p, step)) return setPlan(b, []);
      if (nearestMess(state, p.pos) !== null) p.interactQueued = true;
      return pop(b);
    case 'returnMop':
      if (mopGone(p, step)) return setPlan(b, []);
      p.dropQueued = true;
      return pop(b);
    case 'drop':
      p.dropQueued = true;
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
  // A step at a station the shop no longer has (slots changed under the plan): the plan is moot.
  if (b.plan.some((x) => x.kind === 'use' && !state.stations.some((st) => st.id === x.station))) abandon(state, p);
  replanAroundDead(state, p);
  if (b.noticeTicksLeft > 0) {
    b.noticeTicksLeft -= 1;
    if (b.noticeTicksLeft === 0) {
      // Noticed the botched drink in hand: half the time it hits the floor where the bot stands (not at
      // the cap), else bin it; then remake the claimed order (if still on one).
      const remake = b.claimDrink && b.claim !== null ? chainFor(state, p, b.claimDrink, 'serve') : [];
      const spilled = isDrink(p.holding) && rngNext(state) < MESS.botSpillChance && spillHeld(state, p);
      setPlan(b, spilled ? remake : [binStep(state, p), ...remake]);
    }
  }
  // G4d: a too-hot or too-cold cup of drip for a claim: one retry from a better pot (bin it, pour again);
  // after that, or with no better pot, it is served as it is (half tip beats a walk-out). Never loops.
  if (p.cupTemp && p.holding === 'drip' && b.claim !== null && b.claimDrink === 'drip' && b.retried !== b.claim) {
    b.retried = b.claim;
    const better = pick(state, p, { kind: 'drip', held: null, gives: 'drip', last: true });
    const again = better && better.score < 3 ? chainFor(state, p, 'drip', 'serve') : [];
    if (again.length > 0) setPlan(b, [binStep(state, p), ...again]);
  }
  // Orders come first: an uncovered order interrupts any floor step, a clean in progress included.
  if ((isMopStep(b.plan[0]) || p.cleaningTicksLeft > 0) && uncoveredOrder(state, p) !== null) {
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
  // Lost the mop on the way: do not walk the leftover clean nodes (and block other bots' mop plans).
  if (mopGone(p, current)) return setPlan(b, []);
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
  act(state, p, current, station);
}

/** Every connected bot, in players order, picks its moveDir and whether to press "use" this tick. */
export function stepBots(state: GameState, _m: Modifiers): GameState {
  for (const p of state.players) {
    if (p.bot && p.connected && p.stunTicksLeft === 0) stepBot(state, p);
  }
  return state;
}
