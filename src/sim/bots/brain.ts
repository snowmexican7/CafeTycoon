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
import { gearArea, tapCupRecipe } from '../gear';
import { nearestMess, returnMop } from '../mop';
import { rogueNear, rogueTiles } from '../rogue';
import { passSlots } from '../pickup';
import { heldCool, takeBackCold, slotCool, stationCool } from '../cooling';
import { tillNext } from '../till';
import { CONDIMENTS_ID, FRIDGE_ID, PICKUP_ID, SINK_ID, layoutFor } from '../../data/layout';
import { FRIDGE, autoMilk, closingSoon, isMilkStation, readyStock } from '../fridge';
import { CONDIMENTS, canTakeBox, returnBox } from '../condiments';
import { isSink, needsDump } from '../sink';
import { answerPhone } from './phone';
import { undoneDrinks, wantsItem } from '../orders';
import { heldByPerson, heldForPeople, isPerson, ringsAtOnce } from './helper';
import { addSyrup, askedSyrup } from '../handmade';
import { SYRUP_ID } from '../../data/layout';

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

/** A `use` step at the station with this id (batch/pickup: the till is `counter`, the pickup counter `pickup`); null when the shop has none. */
export function spotStep(state: GameState, id: string, action: BotAction): BotStep | null {
  return state.stations.some((st) => st.id === id) ? { kind: 'use', station: id, action } : null;
}

/**
 * Where a finished drink goes. Gear runs (batch/pickup): set down on the pickup counter, whatever the plan
 * meant (its customer takes it there once rung up). Classic: hand it over (`serve`) or park it on the pass (`put`).
 */
function finishStep(state: GameState, p: Player, finish: 'serve' | 'put'): BotStep | null {
  return state.gear === true ? spotStep(state, PICKUP_ID, 'put') : use(state, p, 'counter', finish);
}

/**
 * Put what is in hand in the bin; with no bin in the shop, on the floor away from every station. FB2 A3 (Gear runs): a
 * drink goes down the back sink instead when the sink is as close as the bin or closer (no leak there).
 */
function binStep(state: GameState, p: Player, drink = isDrink(p.holding), from: Vec2 = p.pos): BotStep {
  const bin = use(state, p, 'trash', 'trash');
  // `drink`/`from`: a cup still to be picked up (A2: a cold cup off the pickup counter), judged from where it will be.
  if (state.gear === true && drink) {
    const sink = state.stations.find(isSink);
    const binAt = bin?.kind === 'use' ? state.stations.find((st) => st.id === bin.station) : undefined;
    if (sink && (!binAt || dist(sink.pos, from) <= dist(binAt.pos, from))) return { kind: 'use', station: sink.id, action: 'dump' };
  }
  return bin ?? { kind: 'floor', node: floorDropNode(state, p.pos), action: 'drop' };
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
  const put = finishStep(state, p, 'put');
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

/** FB2 A3: the pot of `st` is out with someone who is not a bot (a person may keep it a while, or have collapsed). */
const personHasPot = (state: GameState, st: Station): boolean =>
  st.potOut !== undefined && !state.players.find((o) => o.id === st.potOut)?.bot;

/** Gear G4d: a drip machine that brews pots (one press brews, each press after pours a cup). */
export const hasPot = (st: Station): boolean => !!st.gear && !!GEAR[st.gear].pot;

/** G4d: the pot in `st` would pour a too-hot or too-cold cup (a missed brew). FB2 A3: a pot gone cold is not poured, it goes to the sink. */
const potBad = (_state: GameState, st: Station): boolean => st.potOff !== undefined;

/** Other bots with a step at `st` (each will take a cup from a pot). */
const plannersAt = (state: GameState, self: Player, st: Station): number =>
  state.players.filter((o) => o !== self && o.bot?.plan.some((x) => x.kind === 'use' && x.station === st.id)).length;

/**
 * G4d, a cup of drip from a pot machine: 0 pour from a hot pot that has a cup left for this bot; 1 brew a
 * pot in an empty machine nobody else is about to brew; 2 wait for a pot that is brewing (or about to), or
 * (FB2 A3) out at the sink, or that another bot is about to dump; 3 dump a cold or stale pot at the sink and
 * brew a fresh one (`route` adds the lift and the dump), or pour from a pot brewed off (only plain drip minds:
 * a steamer or a shot on top reheats it); 4 something else sits in it.
 */
function potScore(state: GameState, p: Player, st: Station, need: Need): number {
  const others = plannersAt(state, p, st);
  if (st.potOut !== undefined) return 2;
  if (needsDump(state, st)) return others === 0 ? 3 : 2;
  if (st.output === 'drip' && st.potLeft !== undefined) {
    if (need.last && potBad(state, st)) return 3;
    return others < st.potLeft ? 0 : 2;
  }
  if (st.busyTicksLeft > 0) return 2;
  if (st.output === null) return others === 0 ? 1 : 2;
  return 4;
}

/**
 * Batch/pickup (Task 14): a Gear tap pours a steeped cup straight into empty hands on the press (`gearTapPour`),
 * so that visit is a single insert with nothing left to take.
 */
const pours = (state: GameState, st: Station, held: ItemKind | null): boolean =>
  state.gear === true && st.kind === 'coldBrewTap' && !!st.gear && held === null;

/** The insert/take pair at `st`; the insert remembers what it should make. A Gear tap's pour is the insert alone. */
const pair = (st: Station, gives: ItemKind, instant = false): BotStep[] => [
  { kind: 'use', station: st.id, action: 'insert', makes: gives },
  ...(instant ? [] : [{ kind: 'use', station: st.id, action: 'take' } as BotStep]),
];

/**
 * `st` can take this visit: the recipe it would run for `held` makes `gives` (a gear recipe first, the
 * menu, and the oldest-ticket clash rule all included, as in `interact`), a capped batch is not used up,
 * the machine is not dead, it is not jammed unless the bot arrives empty-handed (to whack it), and a bot
 * can stand at it (G9: not an out-of-reach twin).
 */
function canMake(state: GameState, p: Player, st: Station, need: Need): boolean {
  if (st.kind !== need.kind) return false;
  // FB2 A3 fix round 1 (I3): a pot a person walked off with may not come back soon; only a bot's carry is worth a wait.
  if (personHasPot(state, st)) return false;
  // G5: a dead machine is gone until tonight; a jammed one is fine for empty hands (they whack it first).
  if (st.dead || (st.jammed && need.held !== null) || !reachable(state, st)) return false;
  const r = recipeAt(state, st, need.held);
  // Batch/pickup: only a recipe that uses a steeped cup minds an empty tap (sweet cream from a cup in hand does not).
  // FB2 A4: a Gear milk step needs milk out at the bar that no other bot has already planned to use.
  return r?.gives === need.gives && (st.batchLeft !== 0 || !tapCupRecipe(r)) && (!r.consumes.includes('milk') || milkFree(state, p) >= 1);
}

/** 0: start right away (idle, no other bot heading there); 1: it is busy or someone else plans it. Pots: potScore. */
function stationScore(state: GameState, p: Player, st: Station, need: Need): number {
  if (hasPot(st) && need.held === null && need.gives === 'drip') return potScore(state, p, st, need);
  return isIdle(st) && !plannedByOther(state, p, st) ? 0 : 1;
}

/**
 * The station for a visit: among the stations that can make it, the lowest score, then nearest the bot
 * (ties: the lower array index). `skip` is left out; with `freeOnly`, only a score-0 station will do.
 * FB2 A1: a helper bot never picks the machine a person is at (`heldByPerson`).
 */
function pick(state: GameState, p: Player, need: Need, skip: Station | null = null, freeOnly = false): { st: Station; score: number } | null {
  let best: { st: Station; score: number; d: number } | null = null;
  for (const st of state.stations) {
    if (st === skip || !canMake(state, p, st, need) || heldByPerson(state, p, st)) continue;
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

/** FB2 A3: lift the cold or stale pot off `st` and pour it down the sink; null when the shop has no sink. */
function dumpSteps(state: GameState, st: Station): BotStep[] | null {
  const dump = spotStep(state, SINK_ID, 'dump');
  return dump && [{ kind: 'use', station: st.id, action: 'lift' }, dump];
}

/** Pick a station for every visit (each pair keeps its station); null when one has no station. */
function route(state: GameState, p: Player, needs: Need[]): { steps: BotStep[]; scores: number[] } | null {
  const steps: BotStep[] = [];
  const scores: number[] = [];
  for (const need of needs) {
    const got = pick(state, p, need);
    if (got === null) return null;
    // FB2 A3: an old pot in the way goes to the sink first (only from empty hands: the drip is the first visit).
    if (need.held === null && hasPot(got.st) && needsDump(state, got.st) && got.score === 3) {
      const dump = dumpSteps(state, got.st);
      if (dump === null) return null;
      steps.push(...dump);
    }
    steps.push(...pair(got.st, need.gives, pours(state, got.st, need.held)));
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
 * from `held` (an item already in hand on its way to the drink). In Gear runs both end on the pickup
 * counter (`finishStep`). [] when the shop can't make it now.
 */
export function chainFor(state: GameState, p: Player, drink: DrinkId, finish: 'serve' | 'put', held: ItemKind | null = null): BotStep[] {
  const steps = machineSteps(state, p, drink, held);
  const last = finishStep(state, p, finish);
  return steps === null || last === null ? [] : [...steps, last];
}

/** A2 (Gear): a cup gone cold in hand is never set down on the pickup counter. */
const coldInHand = (state: GameState, p: Player): boolean => state.gear === true && heldCool(state, p) >= 1;

/** What to do with whatever is in hand when the plan falls through: park a drink, bin anything else (floor if no bin). */
export function dropPlan(state: GameState, p: Player): BotStep[] {
  if (p.holding === null) return [];
  if (p.holding === 'grounds') return groundsPlan(state, p);
  const put = isDrink(p.holding) && !coldInHand(state, p) ? finishStep(state, p, 'put') : null;
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
    else if (isDrink(p.holding) && heldCool(state, p) < 1) drinks[p.holding] += 1; // A2: a cold cup covers nothing
  }
  for (const st of state.stations) {
    if (st.occupiedBy !== null) continue; // a rogue's drink is not for the queue
    if (hasPot(st)) continue; // G4d: a pot is a source of cups for whoever claims a drip, not one drink in flight
    if (claimedAtStation(state, st)) continue;
    const brewing = st.busyTicksLeft > 0 && isRecipeKind(st.kind) ? (st.making ?? STATION_RECIPES[st.kind].gives) : null;
    // A2: a cold output still counts here: the orphan rule (think 0b) collects it and rule 0 bins it, then the
    // order is uncovered again. Not counting it would send claims to a machine it blocks.
    for (const item of [st.output, brewing]) {
      if (item === null) continue;
      // Only the machine's own product is a shot-to-be: grounds dropped on the espresso machine are not.
      const own = isRecipeKind(st.kind) && item === STATION_RECIPES[st.kind].gives;
      if (own && (st.kind === 'grinder' || st.kind === 'espresso')) pending += 1;
      else if (isDrink(item)) drinks[item] += 1;
    }
  }
  for (const item of state.pass) if (slotCool(state, item) < 1) drinks[item.item] += 1;
  return { drinks, pending };
}

/**
 * Every order, in queue order, that no other bot claimed, is on the menu, and no drink in flight covers. FB2 B6: each
 * item still to come on a multi-drink ticket is an order of its own (a copy of the customer with that `drink`), each
 * other bot's claim on the ticket covers one item of its drink, and an office run's items come after everyone else's.
 */
export function uncoveredOrders(state: GameState, self: Player): Customer[] {
  const { drinks, pending } = coveragePool(state);
  let shots = pending;
  const menu = availableDrinks(state);
  const out: Customer[] = [];
  const later: Customer[] = [];
  for (const c of state.customers) {
    if (c.egg === 'camper') continue; // the Wi-Fi camper never orders (pickup review M3)
    // FB2 B6 (fix round 1, I1): an office run keeps one drink in the queue (its first uncovered one, in its queue
    // place) and the rest go after everyone else's: it gets made steadily without starving the walk-ins.
    const office = c.order === 'office';
    const wants = c.items ? undoneDrinks(c) : [c.drink];
    const claims = c.items ? ticketClaims(state, self, c.id) : null;
    // A bot already on one of its drinks fills the office run's queue place (fix round 1: else each bot took the next).
    let queued = office && claims !== null && [...claims.values()].some((n) => n > 0);
    if (!claims && claimedByOther(state, self, c.id)) continue;
    for (const d of wants) {
      if (claims && (claims.get(d) ?? 0) > 0) {
        claims.set(d, claims.get(d)! - 1);
        continue;
      }
      if (!menu.includes(d)) continue;
      if (drinks[d] > 0) {
        drinks[d] -= 1;
        continue;
      }
      if (usesShot(d) && shots > 0) {
        shots -= 1;
        continue;
      }
      (office && queued ? later : out).push(c.items ? { ...c, drink: d } : c);
      queued = true;
    }
  }
  return later.length > 0 ? [...out, ...later] : out;
}

/** FB2 B6: other bots' claims on ticket `id`, counted by drink. */
function ticketClaims(state: GameState, self: Player, id: number): Map<DrinkId, number> {
  const claims = new Map<DrinkId, number>();
  for (const p of state.players) {
    const b = p.bot;
    if (p === self || !b || b.claim !== id || !b.claimDrink) continue;
    claims.set(b.claimDrink, (claims.get(b.claimDrink) ?? 0) + 1);
  }
  return claims;
}

/** The first uncovered order the shop can make now, with its chain (think's rule 2), or null. FB2 A1: a helper skips fresh tickets held for free people. */
function claimable(state: GameState, p: Player): { order: Customer; chain: BotStep[] } | null {
  const orders = uncoveredOrders(state, p);
  const held = heldForPeople(state, p, orders);
  for (const order of orders) {
    if (held.has(order.id)) continue;
    const chain = chainFor(state, p, order.drink, 'serve');
    if (chain.length > 0) return { order, chain };
  }
  return null;
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
 * FB2 B6 (Gear): grounds left in a grinder whose chain was dropped (its customer was served by someone else's cup).
 * They count as a shot on its way (`coveragePool`), so once they have sat as long as any orphan they are collected
 * (and binned, or pulled), or the order they seem to cover would never be claimed.
 */
const leftGrounds = (state: GameState, st: Station): boolean => state.gear === true && st.kind === 'grinder' && st.output === 'grounds';

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
    // A2 fix round 2: no grace for a cold output, nor for one blocking another bot waiting to use the machine.
    if (stationCool(state, st) >= 1 || state.players.some((o) => o !== self && insertAt(o.bot?.plan[0], st))) return true;
    const since = st.outputSince ?? st.doneAt;
    if (since === undefined) return true;
    const secs = st.output === 'espresso' || st.output === 'grounds' ? BOTS.orphanPrepSeconds : BOTS.orphanDrinkSeconds;
    // FB2 B6 (fix round 1, M4): grounds left in a grinder may be a person's (gone to the till): twice as long then.
    // Fix round 2: a person by A1's rule (`isPerson`: stand-ins count), never the bot itself.
    const person = leftGrounds(state, st) && state.players.some((o) => o !== self && isPerson(o));
    return state.tick - since >= secondsToTicks(person ? secs * 2 : secs);
  };
  const candidates = state.stations
    // G4d: a pot's cups wait in the pot for the orders that claim them (pouring it out would only fill the pass).
    // G9: a drink on an out-of-reach twin is for people only (a bot would pick it, find no node, and loop).
    .filter((st) => isRecipeKind(st.kind) && (isDrink(st.output) || strayGrounds(st) || leftGrounds(state, st)) && !(hasPot(st) && st.output === 'drip') && reachable(state, st) && !takenBy(st) && !personAt(st) && sat(st))
    .map((st) => ({ st, d: dist(st.pos, self.pos) }))
    .sort((a, b) => a.d - b.d || a.st.pos.y - b.st.pos.y || a.st.pos.x - b.st.pos.x);
  return candidates[0]?.st ?? null;
}

/**
 * Classic only: park cold brew on the pass ahead of orders. Gear runs never prep (batch/pickup fix round 1): the
 * tap pours a steeped cup at once, and a prepped cup holds a pickup slot until a cold brew order is rung up
 * (600 s), so a crew of four filled all four slots in seconds and binned every drink after.
 */
function shouldPrep(state: GameState, p: Player): boolean {
  return (
    state.gear !== true &&
    BOTS.personalities[p.bot!.personality].preps &&
    state.pass.length < passSlots(state) &&
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

/**
 * The mop is free, the floor is dirty enough, and no other bot is already on a mop plan. FB2 A3: in a Gear run any mess
 * will do (a quiet moment's job; the Gear floor meter barely moves until a mess has done its damage).
 */
function shouldMop(state: GameState, p: Player): boolean {
  return (
    state.mop.heldBy === null &&
    state.messes.length > 0 &&
    (state.gear === true || state.cleanliness < MESS.botMopBelow || state.messes.length >= MESS.botMopMesses) &&
    !state.players.some((o) => o !== p && o.bot?.plan.some(isMopStep))
  );
}

/** Task 15 ruling: an idle bot carries a box over once the bar is down to this many servings (spec: "an empty bar"; the dispatch: "empty or low"). */
export const BOX_LOW = 2;

/** A step of a box run: fetch a box from the corner, or empty it into the bar. */
const isBoxStep = (step: BotStep | undefined): boolean =>
  (step?.kind === 'floor' && step.action === 'takeBox') || (step?.kind === 'use' && step.action === 'refill');

/** The bar can take a box now (it is below full). */
const barTakesBox = (state: GameState): boolean => !!state.condiments && state.condiments.servings < CONDIMENTS.servings;

/**
 * Where a bot stands to take a box: a walkable node within reach of the box corner where "use" hits no station and the
 * corner is strictly nearer than the mop (so `mopInteract` takes the box), nearest the corner; else the corner's node.
 */
export function boxNode(state: GameState): Vec2 {
  const corner = layoutFor(state.tier).boxCorner;
  const ok = walkableNodes(state).filter(
    (n) => dist(n, corner) <= ECONOMY.interactRangeTiles && nearestStation(state, n) === null && dist(n, corner) < dist(n, state.mop.pos),
  );
  return byDistance(ok, corner)[0] ?? nodeOf(state, corner);
}

/** Gear: the bar is empty or low, a box waits in the corner, and no other bot is fetching or carrying one. */
function shouldFetchBox(state: GameState, p: Player): boolean {
  // FB2 review M2: not during closing soon (the box would only be lifted back into the fridge).
  if (state.gear !== true || !state.condiments || state.condiments.servings > BOX_LOW || closingSoon(state)) return false;
  if ((state.condimentBoxes ?? 0) <= 0 || !state.stations.some((st) => st.id === CONDIMENTS_ID)) return false;
  return !state.players.some((o) => o !== p && (o.tool === 'box' || o.bot?.plan.some(isBoxStep)));
}

/** A step that lifts the pot off `st`. */
const isLiftAt = (x: BotStep, st: Station): boolean => x.kind === 'use' && x.station === st.id && x.action === 'lift';

/** Another bot already plans to lift the pot off `st`. */
const liftPlanned = (state: GameState, self: Player, st: Station): boolean =>
  state.players.some((o) => o !== self && o.bot?.plan.some((x) => isLiftAt(x, st)));

/**
 * FB2 A3: a pot machine (nearest first) whose pot needs the sink, that no other bot is on and (A1 helpers) no person is
 * working (`heldByPerson`: they may be about to lift it themselves).
 */
function potToDump(state: GameState, p: Player): Station | null {
  if (state.gear !== true) return null;
  const pots = state.stations.filter((st) => needsDump(state, st) && reachable(state, st) && !liftPlanned(state, p, st) && !heldByPerson(state, p, st));
  return pots.sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0] ?? null;
}

/** FB2 A3: extra wait at a pot machine while its pot is at the sink (the walk there and back). */
const POT_TRIP_TICKS = secondsToTicks(10);

// ---------------------------------------------------------------------------------------------- FB2 A4: the fridge

/** A drink that takes milk (Gear: drawn from the milk out at the bar). */
const milky = (d: DrinkId): boolean => ECONOMY.drinkSupplies[d].includes('milk');

/** An insert step that will draw milk at a milk station (what the machine makes there takes milk). */
function milkInsert(state: GameState, x: BotStep): boolean {
  if (x.kind !== 'use' || x.action !== 'insert' || x.makes === undefined) return false;
  const st = state.stations.find((y) => y.id === x.station);
  return !!st && isMilkStation(st) && isRecipeKind(st.kind) && RECIPES[st.kind].some((r) => r.gives === x.makes && r.consumes.includes('milk'));
}

/** Gear: milk out at the bar that no other bot's plan is already counting on (classic: the stock). */
function milkFree(state: GameState, self: Player): number {
  const have = readyStock(state, 'milk');
  if (state.gear !== true) return have;
  const planned = state.players.reduce((n, o) => n + (o !== self && o.bot ? o.bot.plan.filter((x) => milkInsert(state, x)).length : 0), 0);
  // FB2 review I2: a carton on its way counts (in someone's hands, or a fetch another bot has planned), so a latte's
  // grind and pull start while the milk walks over; the steamer's milk wait (BOTS.milkWaitSeconds) covers the arrival.
  // Not during closing soon: those cartons go into the fridge.
  let coming = 0;
  if (!closingSoon(state)) {
    const fetch = Math.min(FRIDGE.carton, Math.floor(state.supplies.milk ?? 0));
    for (const o of state.players) {
      if (o.tool === 'milk') coming += o.carry ?? 0;
      else if (o !== self && o.bot?.plan.some((x) => x.kind === 'use' && x.action === 'fetch')) coming += fetch;
    }
  }
  return have + coming - planned;
}

/**
 * FB2 review I3: milk still to be steamed: milk orders nobody is covering yet, plus the milk steps already in a bot's
 * plan (a latte made and waiting on the counter needs no more milk).
 */
function milkToSteam(state: GameState, self: Player): number {
  const orders = uncoveredOrders(state, self).filter((c) => milky(c.drink)).length;
  return orders + state.players.reduce((n, o) => n + (o.bot ? o.bot.plan.filter((x) => milkInsert(state, x)).length : 0), 0);
}

/** FB2 review I3: the last seconds of closing: put things away whatever is still wanted (else they go bad at close). */
const LAST_CALL_SECONDS = 8;
const lastCall = (state: GameState): boolean => state.phase === 'closing' && state.phaseTicksLeft <= secondsToTicks(LAST_CALL_SECONDS);

/** Closing soon, doors locked: the milk can go in the fridge (nothing left to steam, or last call). */
const milkDone = (state: GameState, self: Player): boolean => closingSoon(state) && state.phase === 'closing' && (lastCall(state) || milkToSteam(state, self) === 0);
/** Closing soon, doors locked: the bar can go in the fridge (nobody waiting on drip or cold brew, or last call). */
const barDone = (state: GameState): boolean => closingSoon(state) && state.phase === 'closing' && (lastCall(state) || !barWanted(state));

/** Someone in the shop is waiting on a drink that takes milk. */
const milkWanted = (state: GameState): boolean => state.customers.some((c) => milky(c.drink) || (c.extra?.some(milky) ?? false));

/** Someone in the shop will stop at the condiment bar (plain drip or cold brew). */
const barWanted = (state: GameState): boolean =>
  state.customers.some((c) => [c.drink, ...(c.extra ?? [])].some((d) => d === 'drip' || d === 'coldBrew'));

const FRIDGE_ACTIONS: BotAction[] = ['fetch', 'stock', 'stow', 'store'];
/** A step of a fridge run (a carton out, or putting things away). */
const isFridgeStep = (x: BotStep | undefined): boolean => x?.kind === 'use' && FRIDGE_ACTIONS.includes(x.action);

/** Another player is carrying a carton or the bar, or another bot is on a fridge run. */
function fridgeBusy(state: GameState, self: Player): boolean {
  return state.players.some((o) => o !== self && (o.tool === 'milk' || o.tool === 'bar' || (o.bot?.plan.some(isFridgeStep) ?? false)));
}

/** The milk station to put a carton out at (or lift it from): a steamer side a bot can reach first, else a tap. */
function milkStation(state: GameState, p: Player): Station | null {
  let best: Station | null = null;
  for (const st of state.stations) {
    if (!isMilkStation(st) || !reachable(state, st)) continue;
    const rank = (x: Station) => (x.kind === 'steamer' ? 0 : 1);
    if (best === null || rank(st) < rank(best) || (rank(st) === rank(best) && dist(st.pos, p.pos) < dist(best.pos, p.pos))) best = st;
  }
  return best;
}

const fridgeReachable = (state: GameState): Station | null => {
  const f = state.stations.find((st) => st.id === FRIDGE_ID);
  return f && reachable(state, f) ? f : null;
};

/** Where a carried carton or bar box goes: out at the bar during the day, into the fridge when putting away. */
function carryPlan(state: GameState, p: Player): BotStep[] {
  // A lifted bar only ever goes in the fridge during closing soon; a carton goes back once there's nothing left to steam.
  const putAway = p.tool === 'bar' ? closingSoon(state) : milkDone(state, p);
  const fridge = fridgeReachable(state);
  const out = p.tool === 'milk' ? milkStation(state, p) : state.stations.find((st) => st.id === CONDIMENTS_ID && reachable(state, st));
  const at = putAway ? (fridge ?? out) : (out ?? fridge);
  return [at ? { kind: 'use', station: at.id, action: at === fridge ? 'store' : 'stock' } : { kind: 'floor', node: nodeOf(state, p.pos), action: 'drop' }];
}

/** FB2 A4 fix round 1: a bot fetches a carton for waiting milk orders once the milk out (cartons on the way included) is this low. */
export const MILK_LOW = 4;

/** Gear: milk out is low, a milk drink is wanted, the fridge has milk, nobody else is on it: fetch a carton and put it out. */
function cartonPlan(state: GameState, p: Player): BotStep[] | null {
  if (state.gear !== true || autoMilk(state) || (state.supplies.milk ?? 0) < 1 || milkFree(state, p) > MILK_LOW) return null;
  // Re-review I-1: during closing soon only for milk still to steam, and never at last call (no shuttle, nothing put
  // out just to go bad at close).
  const wanted = closingSoon(state) ? milkToSteam(state, p) > 0 && !lastCall(state) : milkWanted(state);
  if (!wanted || fridgeBusy(state, p)) return null;
  const fridge = fridgeReachable(state);
  const out = milkStation(state, p);
  if (!fridge || !out) return null;
  return [{ kind: 'use', station: fridge.id, action: 'fetch' }, { kind: 'use', station: out.id, action: 'stock' }];
}

/** The milk out a bot keeps ready at the bar ahead of orders (FB2 review I2). */
export const MILK_AHEAD = 3;

/** FB2 review I2: open hours, not closing soon, milk drinks on the board and little milk out: fetch a carton ahead of time. */
function proactiveCarton(state: GameState, p: Player): BotStep[] | null {
  if (state.gear !== true || state.phase !== 'day' || closingSoon(state) || autoMilk(state)) return null;
  if ((state.supplies.milk ?? 0) < 1 || milkFree(state, p) > MILK_AHEAD || fridgeBusy(state, p)) return null;
  if (!availableDrinks(state).some(milky)) return null;
  const fridge = fridgeReachable(state);
  const out = milkStation(state, p);
  return fridge && out ? [{ kind: 'use', station: fridge.id, action: 'fetch' }, { kind: 'use', station: out.id, action: 'stock' }] : null;
}

/**
 * Gear, closing soon: lift what is out and nobody needs any more, and put it in the fridge (one bot at a time). Bots wait
 * for the doors to lock (no more walk-ins wanting a latte or cream), and the closing waits for them (`putAwayPending`).
 */
function putAwayPlan(state: GameState, p: Player): BotStep[] | null {
  if (!closingSoon(state) || state.phase !== 'closing' || fridgeBusy(state, p)) return null;
  const fridge = fridgeReachable(state);
  if (!fridge) return null;
  const store: BotStep = { kind: 'use', station: fridge.id, action: 'store' };
  const out = milkStation(state, p);
  if ((state.milkOut ?? 0) > 0 && !autoMilk(state) && out && milkDone(state, p)) return [{ kind: 'use', station: out.id, action: 'stow' }, store];
  const bar = state.stations.find((st) => st.id === CONDIMENTS_ID && reachable(state, st));
  if ((state.condiments?.servings ?? 0) > 0 && bar && barDone(state)) return [{ kind: 'use', station: bar.id, action: 'stow' }, store];
  return null;
}

/** Another bot is already on its way to ring up the queue. */
function ringPlanned(state: GameState, self: Player): boolean {
  return state.players.some((o) => o !== self && o.bot?.plan.some((x) => x.kind === 'use' && x.action === 'ring'));
}

/** A2: a cup on the pickup counter is cold (take-back grabs it first) and no other bot is already on its way to take one back. */
function shouldClearCold(state: GameState, p: Player): boolean {
  if (state.gear !== true || !takeBackCold(state)) return false;
  return !state.players.some((o) => o !== p && o.bot?.plan.some((x) => x.kind === 'use' && x.station === PICKUP_ID && x.action === 'take'));
}

/** FB2 A1: a person stands at the till (a helper bot leaves the ringing to them). */
function tillHeld(state: GameState, p: Player): boolean {
  const till = state.stations.find((st) => st.id === 'counter');
  return !!till && heldByPerson(state, p, till);
}

/**
 * FB2 A1: the next step is an insert or a ring at a station a person has since stepped up to. An insert moves to a
 * free twin, else the bot waits where it is (up to the wait cap, then gives the job up: `wait`); a ring is dropped.
 * A take (the bot's own cup) goes ahead. True when the bot should not walk on this tick.
 */
function yieldToPerson(state: GameState, p: Player, step: Extract<BotStep, { kind: 'use' }>, st: Station): boolean {
  if ((step.action !== 'insert' && step.action !== 'ring' && step.action !== 'lift' && step.action !== 'whack') || !heldByPerson(state, p, st)) return false;
  const b = p.bot!;
  if (step.action === 'ring' || step.action === 'whack') {
    setPlan(b, []);
    return true;
  }
  const twin = step.makes !== undefined && isRecipeKind(st.kind) ? pick(state, p, { kind: st.kind, held: p.holding, gives: step.makes }, st, true)?.st : null;
  if (twin) retarget(b, st, twin);
  else wait(state, p);
  return true;
}

/** Pick the next job. First match wins. A thinking bot has nothing in progress, so it starts unclaimed. */
export function think(state: GameState, p: Player): BotStep[] {
  const b = p.bot!;
  b.claim = null;
  b.claimDrink = null;
  // 0. Deal with whatever is in hand (the mop goes back first: it fills the hands).
  if (p.tool === 'mop') return [{ kind: 'floor', node: nodeOf(state, p.pos), action: 'returnMop' }];
  // Batch/pickup (Task 15): a box goes into the bar; a bar that no longer takes it (filled meanwhile) sends it home (R).
  if (p.tool === 'box') {
    const refill = barTakesBox(state) ? spotStep(state, CONDIMENTS_ID, 'refill') : null;
    return [refill ?? { kind: 'floor', node: nodeOf(state, p.pos), action: 'drop' }];
  }
  // FB2 A3: a pot in hand goes down the sink (no sink: R sends it home, stale).
  if (p.tool === 'pot') return [spotStep(state, SINK_ID, 'dump') ?? { kind: 'floor', node: nodeOf(state, p.pos), action: 'drop' }];
  // FB2 A4: a carton goes out at the bar (or into the fridge when putting away); the lifted bar goes in the fridge.
  if (p.tool === 'milk' || p.tool === 'bar') return carryPlan(state, p);
  if (p.holding === 'grounds') return groundsPlan(state, p);
  if (isDrink(p.holding)) {
    const drink = p.holding;
    // Gear runs: nobody hands over; the drink goes on the pickup counter while it has room.
    const serve = state.gear !== true && state.customers.some((c) => c.drink === drink) ? use(state, p, 'counter', 'serve') : null;
    // A2: never a cold cup.
    const put = state.pass.length < passSlots(state) && !coldInHand(state, p) ? finishStep(state, p, 'put') : null;
    return [serve ?? put ?? binStep(state, p)];
  }
  // 0b. Collect a drink left in a machine (e.g. its customer left mid-chain), or stray grounds; rule 0 then places or bins it.
  const orphan = orphanedDrink(state, p);
  if (orphan) return [{ kind: 'use', station: orphan.id, action: 'take' }];
  // 0c. Gear (A2, fix round 1 I1): a cold cup on the pickup counter is taken back and binned before anyone is rung
  // up, or the next customer for that drink would take it cold. A few seconds' work.
  if (shouldClearCold(state, p)) {
    const take = spotStep(state, PICKUP_ID, 'take');
    const counter = state.stations.find((st) => st.id === PICKUP_ID);
    if (take && counter) return [take, binStep(state, p, true, counter.pos)]; // FB2 A3: the bin or the sink, whichever is nearer the counter
  }
  if (state.gear === true) {
    // 1. Gear (batch/pickup): ring up the queue when nobody else is on their way to the till. Only a thinking
    // bot (nothing in progress) gets here, so it never leaves a machine mid-chain for it.
    // FB2 A1: a helper leaves the till to a person standing at it.
    const ring = tillNext(state) && !ringPlanned(state, p) && !tillHeld(state, p) ? spotStep(state, 'counter', 'ring') : null;
    if (ring) return [ring];
    // 1b. FB2 A4, closing soon: put away the milk and the bar once nobody needs them (one bot does it).
    const away = putAwayPlan(state, p);
    if (away) return away;
    // 1c. FB2 A4: milk out at the bar runs low and a milk drink is wanted: fetch a carton from the fridge.
    const carton = cartonPlan(state, p);
    if (carton) return carton;
    // 1d. FB2 C9: a clogged little wand blocks every milk drink: whack it clear (empty hands; one bot does it).
    const clogged = cloggedWand(state, p);
    if (clogged) return [{ kind: 'use', station: clogged.id, action: 'whack' }];
  } else {
    // 1. Classic: a drink on the pass that a customer (not another bot's) is waiting for.
    const onPass = new Set(state.pass.map((i) => i.item));
    const serve = use(state, p, 'counter', 'serve');
    if (serve && state.customers.some((c) => !claimedByOther(state, p, c.id) && onPass.has(c.drink))) return [serve];
  }
  // 2. An order nobody is covering that the shop can make now (queue order): claim it and make it.
  const job = claimable(state, p);
  if (job) {
    b.claim = job.order.id;
    b.claimDrink = job.order.drink;
    return withSyrup(state, job.order, job.chain);
  }
  // 3. Prep cold brew for the pass.
  const prep = shouldPrep(state, p) ? chainFor(state, p, 'coldBrew', 'put') : [];
  if (prep.length > 0) return prep;
  // 3a. Gear (Task 15): nothing to make, the condiment bar is empty or low and a box waits: carry one over.
  if (shouldFetchBox(state, p)) {
    const refill = spotStep(state, CONDIMENTS_ID, 'refill');
    if (refill) return [{ kind: 'floor', node: boxNode(state), action: 'takeBox' }, refill];
  }
  // 3a'. FB2 review I2: nothing to make: put a carton out ahead of the milk orders (the morning setup, and lulls).
  const ahead = proactiveCarton(state, p);
  if (ahead) return ahead;
  // 3b. Nothing waiting: mop a dirty floor.
  if (shouldMop(state, p)) return mopPlan(state, p);
  // 3c. FB2 A3: still nothing: pour a cold or stale pot down the sink, so the machine is ready for the next drip.
  const pot = potToDump(state, p);
  const dump = pot ? dumpSteps(state, pot) : null;
  if (dump) return dump;
  // 4. Wait near the counter.
  return [{ kind: 'idle', node: idleNode(state, p) }];
}

/**
 * FB2 B8: an order that asks for a syrup gets it at the rack just before the cup is set down (the rack on the floor and
 * flavour in stock; else the cup goes as it is and the customer grumbles).
 */
function withSyrup(state: GameState, order: Customer, chain: BotStep[]): BotStep[] {
  const flavour = askedSyrup(order);
  if (!flavour || chain.length === 0 || (state.supplies.flavour ?? 0) < 1 || !state.stations.some((st) => st.id === SYRUP_ID)) return chain;
  return [...chain.slice(0, -1), { kind: 'use', station: SYRUP_ID, action: 'syrup', flavour }, chain[chain.length - 1]!];
}

/**
 * FB2 C9: a clogged wand (a jammed 'steamer' twin) a bot can stand at, that no other bot is already heading for and no
 * person is at (they can whack it themselves). Only empty hands whack, and only a thinking bot gets here.
 */
function cloggedWand(state: GameState, p: Player): Station | null {
  if (p.holding !== null || p.tool !== null) return null;
  return state.stations.find((st) => st.kind === 'steamer' && st.wand !== undefined && st.jammed && reachable(state, st) && !plannedByOther(state, p, st) && !heldByPerson(state, p, st)) ?? null;
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
 * Right after a bot's "use": a cup that came straight into the hands at an insert completes the planned take.
 * A drink just taken from a recipe station with empty hands may be botched.
 * The bot does not know yet; it notices after a while (see stepBot) and bins it.
 */
export function afterBotInteract(state: GameState, p: Player, heldBefore: ItemKind | null): void {
  const b = p.bot;
  if (b && heldBefore === null && p.holding === null) {
    // Extras review I1: an empty-handed press at a Gear tap that poured nothing (a cat on it, the last cup gone
    // the same tick): give the chain up instead of walking on with empty hands.
    const at = nearestStation(state, p.pos);
    if (at && pours(state, at, null)) abandon(state, p);
    return;
  }
  if (!b || heldBefore !== null || !isDrink(p.holding)) return;
  const st = nearestStation(state, p.pos);
  // A2 (fix round 1 M5): a take-back meant to bin a cold cup came up with a warm one (someone cleared the cold cup
  // earlier this tick): put it back instead of binning it.
  if (st?.id === PICKUP_ID && state.gear === true) {
    if (!coldInHand(state, p)) {
      const put = spotStep(state, PICKUP_ID, 'put');
      if (put) setPlan(b, [put]);
    }
    return;
  }
  if (!st || !isRecipeKind(st.kind)) return;
  // Batch/pickup: the insert press put the cup straight into the hands (a Gear tap pours a steeped cup at once),
  // so the machine has nothing left for the planned take: that take is done too.
  if (isTakeAt(b.plan[0], st) && st.output === null && st.busyTicksLeft === 0) pop(b);
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
  delete b.ringing;
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

/**
 * FB2 B6 (Gear): the claim went (another cup reached that customer first, or they left), but someone else still needs
 * the same drink and nobody covers it: the bot carries on for them instead of dropping its chain mid-way (a shot left
 * in the machine blocks it for everyone). Keeps the plan; true when it found one.
 */
function reclaim(state: GameState, p: Player): boolean {
  const b = p.bot!;
  if (state.gear !== true || b.claimDrink === null) return false;
  const orders = uncoveredOrders(state, p);
  const held = heldForPeople(state, p, orders); // fix round 1 (M2): never onto a ticket a free person is about to make
  const next = orders.find((o) => o.drink === b.claimDrink && !held.has(o.id));
  if (!next) return false;
  b.claim = next.id;
  return true;
}

function claimLost(state: GameState, p: Player): boolean {
  const b = p.bot!;
  const c = state.customers.find((x) => x.id === b.claim);
  if (c?.items) {
    // FB2 B6: an item of its drink is still to come, and (fix round 1, M1) not every one of them is claimed by a bot
    // earlier in the crew: two bots on one item left would make an extra cup, so the later one lets go.
    if (b.claimDrink === null) return true;
    const left = c.items.filter((x) => !x.done && x.drink === b.claimDrink).length;
    let ahead = 0;
    for (const o of state.players) {
      if (o === p) break;
      if (o.bot?.claim === c.id && o.bot.claimDrink === b.claimDrink) ahead += 1;
    }
    return ahead >= left;
  }
  return c === undefined || c.drink !== b.claimDrink;
}

function insertAt(s: BotStep | undefined, station: Station): boolean {
  return s?.kind === 'use' && s.station === station.id && s.action === 'insert';
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

/**
 * A2 fix round 2 (Gear): a finished output stands in a machine that nobody will collect: it is cold, or no bot plans
 * to take it and no person stands by it. Drip pots are sources, not blockers.
 */
function strayOutput(state: GameState, self: Player, st: Station): boolean {
  if (state.gear !== true || st.busyTicksLeft > 0 || st.output === null || hasPot(st)) return false;
  if (stationCool(state, st) >= 1) return true;
  const planned = state.players.some((o) => o !== self && o.bot?.plan.some((x) => isTakeAt(x, st)));
  const person = state.players.some((o) => !o.bot && o.connected && dist(o.pos, st.pos) <= BOTS.orphanGuardTiles);
  return !planned && !person;
}

/** Where a cup just taken off a machine goes: a warm drink on the pickup counter while it has room, else (cold, grounds) the bin. */
function disposeStep(state: GameState, p: Player, warmDrink: boolean): BotStep {
  return warmDrink && state.pass.length < passSlots(state) ? (finishStep(state, p, 'put') ?? binStep(state, p)) : binStep(state, p);
}

/** A2: bin the cold cup in hand (or about to be) and remake the claimed order, if still on one. */
function binColdAndRemake(state: GameState, p: Player): void {
  const b = p.bot!;
  const remake = b.claim !== null && b.claimDrink ? chainFor(state, p, b.claimDrink, 'serve') : [];
  setPlan(b, [binStep(state, p, true), ...remake]); // the cold cup is in hand, or about to be
}

/** At the station: press "use" when the step can happen, wait while the machine is busy, else give up. */
function act(state: GameState, p: Player, step: Extract<BotStep, { kind: 'use' }>, st: Station): void {
  const b = p.bot!;
  switch (step.action) {
    case 'insert': {
      if (!isRecipeKind(st.kind)) return abandon(state, p);
      // FB2 A3: a pot machine with its pot at the sink: wait for it. One that went cold or stale since the plan was
      // made: lift it and take it to the sink first (or wait while another bot does).
      if (hasPot(st) && p.holding === null && p.tool === null) {
        if (personHasPot(state, st)) return abandon(state, p);
        if (st.potOut !== undefined) return wait(state, p, POT_TRIP_TICKS);
        if (needsDump(state, st)) {
          if (liftPlanned(state, p, st)) return wait(state, p, POT_TRIP_TICKS);
          const dump = dumpSteps(state, st);
          return dump ? setPlan(b, [...dump, ...b.plan]) : abandon(state, p);
        }
      }
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
      if (idle && r && right && stocked(state, r) && (st.batchLeft !== 0 || !tapCupRecipe(r))) return execute(p);
      // FB2 A4: only the milk out at the bar is missing and a carton is on its way: wait for it (else give up below).
      if (idle && r && right && state.gear === true && r.consumes.includes('milk') && readyStock(state, 'milk') < 1 && fridgeBusy(state, p)) {
        return wait(state, p, secondsToTicks(BOTS.milkWaitSeconds));
      }
      // A2 fix round 2: a cold or stray output blocks the machine. Empty hands take it and get rid of it, then carry
      // on (a warm one this step would collect anyway stays the leftover below); full hands don't wait it out: a cold
      // cup in hand is binned and remade, anything else tries a free twin, else gives the job up.
      if (strayOutput(state, p, st)) {
        const cold = stationCool(state, st) >= 1;
        if (p.holding === null) {
          if (cold || (step.makes !== undefined && st.output !== step.makes)) {
            const rest = [...b.plan];
            const warm = !cold && isDrink(st.output);
            p.interactQueued = true;
            setPlan(b, [disposeStep(state, p, warm), ...rest]);
            return;
          }
        } else if (coldInHand(state, p)) {
          return binColdAndRemake(state, p);
        } else {
          const twin = step.makes !== undefined ? pick(state, p, { kind: st.kind, held: p.holding, gives: step.makes }, st, true)?.st : null;
          return twin ? retarget(b, st, twin) : abandon(state, p);
        }
      }
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
      // A2: empty hands at the pickup counter take back a cup, only while the one take-back grabs is cold (to bin it).
      if (st.id === PICKUP_ID) return p.holding === null && p.tool === null && takeBackCold(state) ? execute(p) : setPlan(b, []);
      // FB2 A3: never press at a pot that needs the sink (the press would lift it, not pour).
      if (needsDump(state, st) || st.potOut !== undefined) return abandon(state, p);
      // A2 fix round 2: its own cup went cold in the machine: take it, bin it, remake.
      if (st.output !== null && p.holding === null && state.gear === true && !hasPot(st) && stationCool(state, st) >= 1) {
        p.interactQueued = true;
        return binColdAndRemake(state, p);
      }
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
      // Extras review I1: nothing in hand (a pour came up empty) must not lift a cup off the counter and re-put it.
      if (!isDrink(p.holding)) return abandon(state, p);
      if (b.noticeTicksLeft > 0) return wait(state, p);
      // A2: a cup that went cold on the way is never set down: bin it and remake the claimed order (if still on one).
      if (coldInHand(state, p)) return binColdAndRemake(state, p);
      return execute(p);
    case 'refill':
      // Task 15: empty the carried box into the bar; filled meanwhile, take it home (R); no box, the run is moot.
      if (p.tool !== 'box') return abandon(state, p);
      if (barTakesBox(state)) return execute(p);
      return setPlan(b, [{ kind: 'floor', node: nodeOf(state, p.pos), action: 'drop' }]);
    case 'fetch':
      // FB2 A4: empty hands take a carton, while the fridge has milk.
      if (p.tool === null && p.holding === null && (state.supplies.milk ?? 0) >= 1) return execute(p);
      return abandon(state, p);
    case 'stock': {
      // Re-review I-1: closing, and nothing left to steam (or last call): the carton goes into the fridge instead.
      const fridge = p.tool === 'milk' && milkDone(state, p) ? fridgeReachable(state) : null;
      if (fridge) return setPlan(b, [{ kind: 'use', station: fridge.id, action: 'store' }]);
      // A carton out at a milk station, or the lifted bar back on the bar.
      if ((p.tool === 'milk' && isMilkStation(st)) || (p.tool === 'bar' && st.id === CONDIMENTS_ID)) return execute(p);
      return abandon(state, p);
    }
    case 'stow': {
      // Closing soon: lift what is still out (the milk at an idle milk station, or the bar).
      const bar = st.id === CONDIMENTS_ID;
      const has = bar ? (state.condiments?.servings ?? 0) > 0 : (state.milkOut ?? 0) > 0 && isIdle(st);
      if (closingSoon(state) && p.tool === null && p.holding === null && has) return execute(p);
      return setPlan(b, []);
    }
    case 'store':
      if ((p.tool === 'milk' || p.tool === 'bar') && st.id === FRIDGE_ID) return execute(p);
      return setPlan(b, []);
    case 'ring':
      // Round 3 item 5: a ring-up takes time and the ringer has to stay. Press once (the step stays), wait at the
      // till while the ring is mine, and finish the step when it ends (done, or cancelled: the next think decides).
      if (b.ringing) {
        if (state.ringUp?.by === p.id) return wait(state, p);
        delete b.ringing;
        return pop(b);
      }
      // Batch/pickup: ring up the next order, if there still is one and the hands are free.
      if (p.holding === null && !p.tool && tillNext(state)) {
        b.ringing = true;
        p.interactQueued = true;
        return;
      }
      return setPlan(b, []);
    case 'trash':
      return execute(p);
    case 'lift':
      // FB2 A3: lift the old pot; already lifted (or fine again), skip the lift and its trip to the sink.
      if (p.holding === null && p.tool === null && needsDump(state, st)) return execute(p);
      pop(b);
      if (b.plan[0]?.kind === 'use' && b.plan[0].action === 'dump' && p.tool !== 'pot') pop(b);
      return;
    case 'dump':
      // FB2 A3: pour the pot or the drink in hand down the sink; nothing to pour, move on.
      if (p.tool === 'pot' || isDrink(p.holding)) return execute(p);
      return pop(b);
    case 'whack':
      // FB2 C9: still clogged and the hands are empty: whack it (gearBlocked clears it); else someone beat us to it.
      if (st.jammed && p.holding === null && p.tool === null) return execute(p);
      return pop(b);
    case 'syrup':
      // FB2 B8: the ticket's syrup into the cup in hand (no flavour left or a syrup already in: move on regardless).
      if (step.flavour) addSyrup(state, p, step.flavour);
      return pop(b);
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
 * FB2 balance (Gear): not around a bot that is walking. Two bots meeting head-on each re-planned around the other's
 * tile, chose the same spare row, and swapped rows in step for the rest of the day; a walking bot's tile is about to
 * change anyway, and the yield (random length) breaks the tie.
 */
function planPath(state: GameState, p: Player, node: Vec2): Vec2[] | null {
  const spills = spillTiles(state);
  const walking = (o: Player): boolean => state.gear === true && !!o.bot && (o.moveDir.x !== 0 || o.moveDir.y !== 0);
  const people = hasYielded(p.bot!)
    ? [...state.players.filter((o) => o !== p && o.connected && !walking(o)).map((o) => nodeOf(state, o.pos)), ...rogueTiles(state)]
    : [];
  for (const avoid of [[...spills, ...people], spills]) {
    if (avoid.length === 0) continue;
    const around = findPath(state, p.pos, node, avoid);
    if (around !== null) return around;
  }
  return findPath(state, p.pos, node);
}

/** A step of a mop plan (a floor drop and a box fetch are not). */
const isMopStep = (step: BotStep | undefined): boolean =>
  step?.kind === 'floor' && (step.action === 'takeMop' || step.action === 'clean' || step.action === 'returnMop');

/** A clean or returnMop step with no mop in hand (it was taken or sent home): the rest of the plan is moot. */
const mopGone = (p: Player, step: BotStep): boolean =>
  step.kind === 'floor' && (step.action === 'clean' || step.action === 'returnMop') && p.tool !== 'mop';

/**
 * A floor step on arrival. takeMop: press "use" when the mop is free, in range and the hands are
 * empty, else drop the plan. clean: press "use" when a mess is in range. returnMop: press R. Without
 * the mop, clean and returnMop drop the plan; with it they pop either way. takeBox: press "use" when a box can be
 * taken from the corner here, else drop the plan. drop: press R (no station is in reach of the node, so what is in
 * hand lands on the floor, or a carried tool goes home; resolveDrops does the rest).
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
    case 'takeBox': {
      // Task 15: press "use" when a box can be taken here and the corner (not the mop) is what the press picks up.
      const corner = layoutFor(state.tier).boxCorner;
      const boxWins = state.mop.heldBy !== null || dist(p.pos, corner) < dist(p.pos, state.mop.pos);
      if (canTakeBox(state, p) && boxWins && nearestStation(state, p.pos) === null) return execute(p);
      return setPlan(b, []);
    }
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
  if (b.claim !== null && claimLost(state, p) && !reclaim(state, p)) {
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
  // Orders come first: an uncovered order the bar can make now interrupts any floor step, a clean in
  // progress included (one it can't make would cancel the mop every tick and leave the floor dirty).
  if ((isMopStep(b.plan[0]) || p.cleaningTicksLeft > 0) && claimable(state, p) !== null) {
    p.cleaningTicksLeft = 0;
    p.cleaningMess = null;
    if (p.tool === 'mop') returnMop(state, p);
    setPlan(b, []);
    b.thinkTicksLeft = 0; // think this tick: it claims the order
  }
  // Task 15: never carry a box (or go for one) while an order it can make is uncovered; the box goes back to the corner.
  if ((isBoxStep(b.plan[0]) || p.tool === 'box') && claimable(state, p) !== null) {
    returnBox(state, p);
    setPlan(b, []);
    b.thinkTicksLeft = 0;
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
        if (ringsAtOnce(state, p, next[0])) b.reactionTicksLeft = 0; // FB2 A1 (C1): drawn anyway, so the rng stream is unchanged
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
    if (station && yieldToPerson(state, p, current, station)) return;
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
  answerPhone(state);
  for (const p of state.players) {
    if (p.bot && p.connected && p.stunTicksLeft === 0) stepBot(state, p);
  }
  return state;
}
