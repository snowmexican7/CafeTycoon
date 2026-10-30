/**
 * FB2 A1: helper bots. CafeTycoon is a game for people; bots on the crew help instead of playing it for them.
 * Whenever a person is in a Gear café (`humanCount >= 1`, which also counts the scripts' 'human' stand-ins),
 * crew bots (any bot that is not a stand-in, temps included):
 *
 * - leave the person's station alone: the station nearest each person, while they are within
 *   `helperGuardTiles` of it, can be theirs. Only machines and the till count (the pickup counter, the
 *   condiment bar and the bin are shared shelves), and only while the person is plausibly using it (review
 *   C1/I1, so a person standing still never stops the café):
 *   - a machine while it is brewing or holds a cup, while the person holds something it takes, or while every
 *     order that needs that kind of machine has waited less than `helperGuardSeconds`;
 *   - the till while the person's hands are empty and the front customer (`tillNext`) is still fresh (the
 *     same first pick as tickets get). Hands full, they can't ring, so a bot may.
 *   A bot neither plans an insert at a held machine nor rings a held till, and an insert already planned
 *   there moves to a free twin or waits (`brain.ts`, `stepBot`), up to the wait cap, then gives the job up. A
 *   bot still takes its own finished cup out of that machine.
 * - leave fresh tickets to free people: a ticket is fresh for `helperTicketSeconds` after it appears and
 *   again after the till rings it up. While fresh, the first N fresh tickets in queue order are held for the
 *   N free people (empty hands, no tool, not cleaning, not stunned, not waiting on a brewing machine; a
 *   stand-in also with no job of its own). With nobody free a bot may claim any ticket at once.
 *
 * Everything else bots do is unchanged: ring up, set drinks on the pickup counter, refill the condiment bar,
 * mop, answer the phone, rescue orphaned drinks, and make the drinks people aren't covering. Pure: no RNG,
 * no state written.
 */
import { ECONOMY } from '../../data/economy';
import { secondsToTicks } from '../constants';
import { STATION_RECIPES, recipeAt } from '../stations';
import { recipeChain } from '../../data/drinks';
import { tillNext } from '../till';
import type { BotStep, Customer, GameState, Player, Station } from '../types';
import { humanCount } from './roster';

const BOTS = ECONOMY.bots;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

/** A person on the floor: a connected human who isn't out for the day, or a tester stand-in (same rule as humanCount). */
export function isPerson(p: Player): boolean {
  return p.bot ? p.bot.personality === 'human' : p.connected && !p.espresso?.out;
}

/** `p` is a crew bot in a Gear café with at least one person in it: the helper rules apply to it. */
export function helping(state: GameState, p: Player): boolean {
  return state.gear === true && !!p.bot && p.bot.personality !== 'human' && humanCount(state) >= 1;
}

/** A station a person can be working: a machine, or the till. */
const guarded = (st: Station): boolean => st.kind in STATION_RECIPES || st.id === 'counter';

/** The station nearest `person` (ties: the lower array index), when it is a machine or the till within the guard distance. */
function personStation(state: GameState, person: Player): Station | null {
  let best: Station | null = null;
  let bestD = Infinity;
  for (const st of state.stations) {
    const d = dist(st.pos, person.pos);
    if (d < bestD) {
      best = st;
      bestD = d;
    }
  }
  return best && guarded(best) && bestD <= BOTS.helperGuardTiles ? best : null;
}

/** People on the floor other than `self`. */
const people = (state: GameState, self: Player): Player[] => state.players.filter((o) => o !== self && isPerson(o));

/** Ticks since the ticket appeared (unrung: patience drains one tick at a time until the ring) or since the till rang it. */
const ticketAge = (state: GameState, c: Customer): number => (c.rungAt === undefined ? c.patienceMax - c.patienceLeft : state.tick - c.rungAt);

/** Some order that needs a machine of `st`'s kind has waited `helperGuardSeconds` or more. */
function staleOrderNeeds(state: GameState, st: Station): boolean {
  const limit = secondsToTicks(BOTS.helperGuardSeconds);
  return state.customers.some((c) => c.egg !== 'camper' && ticketAge(state, c) >= limit && recipeChain(c.drink).some((x) => x.station === st.kind));
}

/** `o` is plausibly using `st`, the station nearest them (review C1/I1: see the header). */
function using(state: GameState, o: Player, st: Station): boolean {
  if (st.id === 'counter') {
    const next = tillNext(state);
    return o.holding === null && !o.tool && next !== undefined && ticketFresh(state, next);
  }
  if (st.busyTicksLeft > 0 || st.output !== null) return true;
  if (o.holding !== null && recipeAt(state, st, o.holding) !== null) return true;
  return !staleOrderNeeds(state, st);
}

/**
 * A helper adopting a ring while a person stands at the till: the person's first pick (the ticket window) was the
 * hesitation, so the bot goes at once instead of drawing a second reaction delay on top (review C1: an idle person
 * at the till must not cost the café walk-outs).
 */
export function ringsAtOnce(state: GameState, self: Player, first: BotStep | undefined): boolean {
  if (first?.kind !== 'use' || first.action !== 'ring' || !helping(state, self)) return false;
  return people(state, self).some((o) => personStation(state, o)?.id === 'counter');
}

/** A person is at `st` (the machine or till nearest them, close by) and using it: a helper bot leaves it alone. */
export function heldByPerson(state: GameState, self: Player, st: Station): boolean {
  if (!helping(state, self) || !guarded(st)) return false;
  return people(state, self).some((o) => personStation(state, o) === st && using(state, o, st));
}

/** Free to take a new ticket: hands empty, no tool, not cleaning or stunned, not waiting on a brewing machine; a stand-in with no job. */
export function personFree(state: GameState, o: Player): boolean {
  if (o.holding !== null || o.tool || (o.cleaningTicksLeft ?? 0) > 0 || o.stunTicksLeft > 0) return false;
  if (o.bot && (o.bot.claim !== null || (o.bot.plan.length > 0 && o.bot.plan[0]!.kind !== 'idle'))) return false;
  const st = personStation(state, o);
  return !(st && st.busyTicksLeft > 0);
}

/**
 * The ticket appeared, or was rung up, less than `helperTicketSeconds` ago. An unrung customer's wait is exact
 * (patience drains one tick at a time until the till rings them up); a rung one counts from the ring.
 */
export function ticketFresh(state: GameState, c: Customer): boolean {
  return ticketAge(state, c) < secondsToTicks(BOTS.helperTicketSeconds);
}

/**
 * The tickets among `orders` (queue order) a helper bot leaves to people right now: the first N fresh ones, N the
 * free people. Empty when `self` is not a helper.
 */
export function heldForPeople(state: GameState, self: Player, orders: readonly Customer[]): Set<number> {
  const held = new Set<number>();
  if (!helping(state, self)) return held;
  let free = people(state, self).filter((o) => personFree(state, o)).length;
  for (const c of orders) {
    if (free <= 0) break;
    if (!ticketFresh(state, c)) continue;
    held.add(c.id);
    free -= 1;
  }
  return held;
}
