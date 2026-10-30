import { EGGS, LATTE_ART_CAPTIONS, NAME_MANGLES } from '../data/eggs';
import { ECONOMY } from '../data/economy';
import { secondsToTicks, TICK_RATE } from './constants';
import { emitLog } from './log';
import { rngInt, rngNext, seedRng } from './rng';
import type { Customer, DrinkId, GameState, PlayerId, Station } from './types';

export interface EggsState {
  /** Cat napping on a warm station; blocks it until shoos or timer. */
  cat?: { stationId: string; ticksLeft: number };
  /** Soft smoke alarm on an espresso left too long. */
  smoke?: { stationId: string; ticksLeft: number };
  /** Ticks the espresso output has been sitting (per station id). */
  outputAge?: Record<string, number>;
  /** Latest latte-art fail (for a floating review card). */
  latteArt?: { tick: number; caption: string; by: string };
  /** Secret menu unlocked for this day. */
  secret?: { unlocked: boolean; served: boolean };
  /** One-shots so each gag stays rare per day. */
  fired: { cat: boolean; camper: boolean; nameMix: boolean; latteArt: boolean; smoke: boolean };
}

export function freshEggs(): EggsState {
  return { fired: { cat: false, camper: false, nameMix: false, latteArt: false, smoke: false }, outputAge: {} };
}

export function eggsOf(state: GameState): EggsState {
  return (state.eggs ??= freshEggs());
}

/** True while the shop cat is napping on this station. */
export function catBlocking(state: GameState, stationId: string): boolean {
  return state.eggs?.cat?.stationId === stationId;
}

/** Soft smoke currently puffing on this station. */
export function smokeActive(state: GameState, stationId: string): boolean {
  return state.eggs?.smoke?.stationId === stationId;
}

function warmStation(st: Station): boolean {
  return st.kind === 'espresso' || st.kind === 'steamer';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Independent stream so egg rolls never perturb customers/events/bots
 * (same pattern as challengeRng in B7). Salt separates simultaneous rolls.
 */
function eggRng(state: GameState, salt: number): { rng: number } {
  const h = (state.seed ^ Math.imul(state.day, 0x9e3779b9) ^ Math.imul(state.tick, 0x85ebca6b) ^ salt) >>> 0;
  return { rng: seedRng(h) };
}

/** After a warm station finishes a brew: maybe the cat, maybe latte art. */
export function onStationFinished(state: GameState, st: Station, output: string, byHint?: string): void {
  const eggs = eggsOf(state);
  if (warmStation(st) && !eggs.fired.cat && !eggs.cat && rngNext(eggRng(state, 0xc47)) < EGGS.catChance) {
    eggs.fired.cat = true;
    eggs.cat = { stationId: st.id, ticksLeft: secondsToTicks(EGGS.catNapSeconds) };
    emitLog(state, 'egg.cat', { station: st.id });
  }
  const artDrinks = new Set(['latte', 'mocha', 'matcha', 'special']);
  if (artDrinks.has(output) && !eggs.fired.latteArt && rngNext(eggRng(state, 0x1a77)) < EGGS.latteArtChance) {
    eggs.fired.latteArt = true;
    const caption = LATTE_ART_CAPTIONS[rngInt(eggRng(state, 0x1a78), LATTE_ART_CAPTIONS.length)]!;
    eggs.latteArt = { tick: state.tick, caption, by: byHint ?? '' };
    state.cash = round2(state.cash + EGGS.latteArtTip);
    state.today.tips = round2(state.today.tips + EGGS.latteArtTip);
    emitLog(state, 'egg.latteArt', { caption, tip: EGGS.latteArtTip });
  }
}

/** Track sitting espresso output → soft smoke alarm. */
export function tickOutputAge(state: GameState): void {
  const eggs = eggsOf(state);
  const age = (eggs.outputAge ??= {});
  const burnTicks = secondsToTicks(EGGS.burnSeconds);
  for (const st of state.stations) {
    if (st.kind === 'espresso' && st.output === 'espresso' && st.busyTicksLeft === 0) {
      age[st.id] = (age[st.id] ?? 0) + 1;
      if (!eggs.fired.smoke && !eggs.smoke && age[st.id]! >= burnTicks) {
        eggs.fired.smoke = true;
        eggs.smoke = { stationId: st.id, ticksLeft: secondsToTicks(12) };
        emitLog(state, 'egg.smoke', { station: st.id });
      }
    } else if (st.kind === 'espresso') {
      age[st.id] = 0;
      if (eggs.smoke?.stationId === st.id && st.output !== 'espresso') {
        eggs.smoke = undefined;
      }
    }
  }
  if (eggs.smoke) {
    eggs.smoke.ticksLeft -= 1;
    if (eggs.smoke.ticksLeft <= 0) eggs.smoke = undefined;
  }
}

/** Advance cat nap; free the station when time is up. */
export function tickCat(state: GameState): void {
  const eggs = state.eggs;
  if (!eggs?.cat) return;
  eggs.cat.ticksLeft -= 1;
  if (eggs.cat.ticksLeft <= 0) {
    emitLog(state, 'egg.cat', { station: eggs.cat.stationId, left: 1 });
    eggs.cat = undefined;
  }
}

/** Pet/shoo the cat if the player is at its station. */
export function tryShooCat(state: GameState, playerId: PlayerId): boolean {
  const eggs = state.eggs;
  if (!eggs?.cat) return false;
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.holding !== null) return false;
  const st = state.stations.find((s) => s.id === eggs.cat!.stationId);
  if (!st) return false;
  if (Math.hypot(p.pos.x - st.pos.x, p.pos.y - st.pos.y) > ECONOMY.interactRangeTiles) return false;
  emitLog(state, 'egg.cat', { station: st.id, pet: 1, by: playerId });
  eggs.cat = undefined;
  return true;
}

/** Dump a burnt espresso shot: clears smoke and wastes the drink. */
export function tryClearSmoke(state: GameState, playerId: PlayerId): boolean {
  const eggs = state.eggs;
  if (!eggs?.smoke) return false;
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return false;
  const st = state.stations.find((s) => s.id === eggs.smoke!.stationId);
  if (!st || st.output !== 'espresso') return false;
  if (Math.hypot(p.pos.x - st.pos.x, p.pos.y - st.pos.y) > ECONOMY.interactRangeTiles) return false;
  // Dump from the machine directly (no hands needed) — soft clear, one waste.
  st.output = null;
  delete st.outputSince;
  eggs.smoke = undefined;
  if (eggs.outputAge) eggs.outputAge[st.id] = 0;
  state.today.wasted = (state.today.wasted ?? 0) + 1;
  emitLog(state, 'egg.smoke', { cleared: 1, by: playerId });
  return true;
}

/** Maybe spawn a Wi-Fi camper (takes a seat, never orders). Returns true if spawned. */
export function maybeSpawnCamper(state: GameState): boolean {
  const eggs = eggsOf(state);
  if (eggs.fired.camper || state.day < 2) return false;
  if (rngNext(eggRng(state, 0xca3e)) >= EGGS.camperChance) return false;
  eggs.fired.camper = true;
  const patienceMax = Math.round(EGGS.camperSitSeconds * TICK_RATE);
  const c: Customer = {
    id: state.nextCustomerId++,
    drink: 'coldBrew',
    patienceLeft: patienceMax,
    patienceMax,
    egg: 'camper',
  };
  state.customers.push(c);
  emitLog(state, 'egg.camper', { id: c.id });
  return true;
}

/** Politely kick a camper at the counter (empty hands). */
export function tryKickCamper(state: GameState, playerId: PlayerId): boolean {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.holding !== null) return false;
  const camper = state.customers.find((c) => c.egg === 'camper');
  if (!camper) return false;
  const counter = state.stations.find((s) => s.kind === 'counter');
  if (!counter) return false;
  if (Math.hypot(p.pos.x - counter.pos.x, p.pos.y - counter.pos.y) > ECONOMY.interactRangeTiles) return false;
  state.customers = state.customers.filter((c) => c !== camper);
  emitLog(state, 'egg.camper', { id: camper.id, kicked: 1, by: playerId });
  return true;
}

/** Maybe stamp a wrong name on a newly arrived regular. */
export function maybeNameMix(state: GameState, customer: Customer): void {
  if (!customer.name || customer.egg) return;
  const eggs = eggsOf(state);
  if (eggs.fired.nameMix) return;
  if (rngNext(eggRng(state, 0x4e3e)) >= EGGS.nameMixChance) return;
  eggs.fired.nameMix = true;
  const wrong = NAME_MANGLES[rngInt(eggRng(state, 0x4e3f), NAME_MANGLES.length)]!;
  customer.egg = 'nameMix';
  customer.wrongName = wrong;
  emitLog(state, 'egg.nameMix', { id: customer.id, name: customer.name, wrong });
}

/** Correct a name mix-up at the counter (empty hands) — they stay happy, no remake needed. In range of `at` (Gear: the pickup counter), else the till. */
export function tryCorrectName(state: GameState, playerId: PlayerId, at?: Station): boolean {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.holding !== null) return false;
  const c = state.customers.find((x) => x.egg === 'nameMix');
  if (!c) return false;
  const counter = at ?? state.stations.find((s) => s.kind === 'counter');
  if (!counter) return false;
  if (Math.hypot(p.pos.x - counter.pos.x, p.pos.y - counter.pos.y) > ECONOMY.interactRangeTiles) return false;
  delete c.egg;
  delete c.wrongName;
  emitLog(state, 'egg.nameMix', { id: c.id, fixed: 1, by: playerId });
  return true;
}

/** Serving a name-mix customer with the right drink also clears the gag (they accept the remake). */
export function clearNameMixOnServe(customer: Customer): void {
  if (customer.egg === 'nameMix') {
    delete customer.egg;
    delete customer.wrongName;
  }
}

/** Unlock the secret menu for the day. Returns true if newly unlocked. */
export function unlockSecret(state: GameState, playerId: PlayerId, code: string): boolean {
  const eggs = eggsOf(state);
  if (eggs.secret?.unlocked) return false;
  const norm = code.trim().toUpperCase();
  if (norm !== EGGS.secretCode && norm !== EGGS.secretKonami) return false;
  eggs.secret = { unlocked: true, served: false };
  // Silly drink = today's special, forced onto the menu for the day.
  if (!state.unlocked.includes('special')) state.unlocked = [...state.unlocked, 'special'];
  state.menu.special = true;
  emitLog(state, 'egg.secret', { by: playerId, label: EGGS.secretLabel });
  return true;
}

/** First secret-menu special serve of the day pays a little bonus tip. */
export function secretServeBonus(state: GameState, drink: DrinkId): void {
  const eggs = state.eggs;
  if (!eggs?.secret?.unlocked || eggs.secret.served) return;
  if (drink !== 'special') return;
  eggs.secret.served = true;
  state.cash = round2(state.cash + EGGS.secretTip);
  state.today.tips = round2(state.today.tips + EGGS.secretTip);
  emitLog(state, 'egg.secret', { served: 1, tip: EGGS.secretTip });
}

/** Per-tick egg maintenance during the day. */
export function stepEggs(state: GameState): void {
  if (!state.eggs) return;
  tickCat(state);
  tickOutputAge(state);
}

/** Reset per-day one-shots when doors open. */
export function eggsMorning(state: GameState): void {
  state.eggs = freshEggs();
}
