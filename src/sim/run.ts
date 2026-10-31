import { cleanLook } from './look';
import { ECONOMY } from '../data/economy';
import { LAYOUT, layoutFor } from '../data/layout';
import { canMake, growthMorning } from './growth';
import { defaultSlots, ensureCounterSpots, stationsFromSlots } from './slots';
import { secondsToTicks } from './constants';
import { rngInt, seedRng } from './rng';
import { SCENARIOS } from '../data/scenarios';
import { scheduleEvents, tuneRadio } from './events';
import { computeModifiers } from './effects';
import { morningNotes } from './describe';
import { loyaltyMorning, promoMorning, rivalMorning } from './rival';
import { adMorning } from './ads';
import { checkoutMorning } from './checkout';
import { pitchMorning } from './pitch';
import { dealHand } from './night';
import { forecastFor } from './forecast';
import { syncBots } from './bots/roster';
import { espressoMorning } from './espresso';
import { floorFields, tileOf } from './tiles';
import { BASE_DRINKS, DRINK_IDS } from '../data/drinks';
import { zeroDrinks } from './tally';
import { unlockForDay } from './unlocks';
import { dealChallenges, pruneChallenges } from './challenges';
import { eggsMorning } from './eggs';
import { gearMorning, gearStart } from './gear';
import { fridgeMorning } from './fridge';
import { potMorning } from './sink';
import { settle } from './spawn';
import { applyPerk } from './perks';
import { officeMorning } from './orders';
import { topUpDevCash } from './dev';
import type { CreateRunOptions, DayStats, DrinkId, GameState, Player, Settings } from './types';

export function freshDayStats(day: number): DayStats {
  return {
    day,
    served: 0,
    lost: 0,
    turnedAway: 0,
    sales: 0,
    tips: 0,
    rent: 0,
    wasted: 0,
    fines: 0,
    bonus: 0,
    botMistakes: 0,
    lostRegulars: 0,
    inspection: null,
    events: [],
    drinks: zeroDrinks(),
    influencer: null,
    rogues: 0,
  };
}

/** Build a new run on its first night. Same options and seed give an identical state. */
export function createRun(opts: CreateRunOptions): GameState {
  const settings: Settings = {
    dayLengthSec: ECONOMY.dayLengthSec,
    nightLengthSec: ECONOMY.nightLengthSec,
    pace: 3,
    bots: 'auto',
    botSkill: 3,
    ...opts.settings,
  };
  const players: Player[] = opts.players.map((p, i) => {
    const pos = { ...(LAYOUT.spawnPoints[i] ?? LAYOUT.door) };
    const look = cleanLook(p.look);
    return {
      id: p.id,
      name: p.name,
      ...(look ? { look } : {}),
      pos,
      moveDir: { x: 0, y: 0 },
      interactQueued: false,
      holding: null,
      connected: true,
      idleTicks: 0,
      ...floorFields(pos),
    };
  });
  const state: GameState = {
    seed: opts.seed,
    rng: seedRng(opts.seed),
    tick: 0,
    phase: 'night',
    phaseTicksLeft: 0,
    day: 1,
    unlimited: false,
    bankrupt: false,
    hostId: opts.hostId,
    settings,
    cash: ECONOMY.startingCash,
    startingCash: ECONOMY.startingCash,
    reputation: ECONOMY.startingReputation,
    supplies: { ...ECONOMY.startingSupplies },
    scenario: 'normal',
    owned: [],
    activeTomorrow: [],
    hand: [],
    boughtTonight: [],
    ready: [],
    players,
    slots: defaultSlots(opts.tier),
    equipment: [],
    stations: stationsFromSlots(opts.tier, defaultSlots(opts.tier)),
    ...(opts.tier && opts.tier !== 'cafe' ? { tier: opts.tier } : {}),
    customers: [],
    nextCustomerId: 1,
    today: freshDayStats(1),
    days: [],
    morningNotes: [],
    pass: [],
    menu: Object.fromEntries(DRINK_IDS.map((d) => [d, true])) as Record<DrinkId, boolean>,
    eventSchedule: [],
    events: [],
    regulars: [],
    log: [],
    nextLogSeq: 1,
    crew: { seen: 0, players: [] },
    messes: [],
    nextMessId: 1,
    cleanliness: 100,
    mop: { pos: { ...layoutFor(opts.tier).mopHome }, heldBy: null },
    rogue: null,
    forecast: forecastFor(opts.seed, 1),
    unlocked: [...BASE_DRINKS],
  };
  state.scenario = SCENARIOS[rngInt(state, SCENARIOS.length)].id;
  if (opts.gear) gearStart(state);
  for (const p of state.players) settle(state, p); // FB2 A3: the Gear fixtures (the sink) may cover a spawn point
  applyPerk(state, opts.perk);
  if (opts.dev) {
    state.dev = true;
    topUpDevCash(state);
  }
  return startNight(state);
}

/** Enter the night before `state.day`: timer, fresh ready-ups, tonight's hand. */
export function startNight(state: GameState): GameState {
  state.phase = 'night';
  state.phaseTicksLeft = secondsToTicks(state.settings.nightLengthSec);
  state.ready = [];
  delete state.lastCall;
  delete state.closeVotes;
  delete state.emptySince;
  state.boughtTonight = [];
  state.forecast = forecastFor(state.seed, state.day);
  state.freshDrinks = unlockForDay(state).filter((d) => canMake(state, d));
  state.rerolls = 0;
  dealHand(state);
  // Weather radio (B6): tomorrow's events are drawn now, so the paper can report them tonight.
  if (computeModifiers(state).reveal) tuneRadio(state);
  // B7: tonight's paper shows tomorrow's optional goals (state.day is the coming day).
  state.challenges = dealChallenges(state);
  return state;
}

/** Open the doors for `state.day`. */
export function startDay(state: GameState): GameState {
  state.phase = 'day';
  // Gear G8: open proposals lapse when the shop opens.
  delete state.gearVote;
  delete state.gearVoteLast;
  delete state.lastCall;
  delete state.devPaused; // R4 a
  state.phaseTicksLeft = secondsToTicks(state.settings.dayLengthSec);
  state.customers = [];
  delete state.closeVotes;
  delete state.emptySince;
  state.today = freshDayStats(state.day);
  state.events = [];
  state.eventSchedule = [];
  state.messes = [];
  state.cleanliness = 100;
  state.mop = { pos: { ...layoutFor(state.tier).mopHome }, heldBy: null };
  state.rogue = null;
  syncBots(state);
  for (const p of state.players) settle(state, p); // FB2 A3: old saves gain the sink on load; growing moves fixtures
  for (const p of state.players) p.tile = tileOf(p.pos);
  const adNote = adMorning(state);
  scheduleEvents(state);
  pruneChallenges(state);
  eggsMorning(state);
  state.morningNotes = morningNotes(state);
  const rivalNote = rivalMorning(state);
  if (rivalNote) state.morningNotes.push(rivalNote);
  const promoNote = promoMorning(state);
  if (promoNote) state.morningNotes.push(promoNote);
  const loyaltyNote = loyaltyMorning(state);
  if (loyaltyNote) state.morningNotes.push(loyaltyNote);
  if (adNote) state.morningNotes.push(adNote);
  const checkoutNote = checkoutMorning(state);
  if (checkoutNote) state.morningNotes.push(checkoutNote);
  const growthNote = growthMorning(state);
  if (growthNote) state.morningNotes.push(growthNote);
  const pitchNote = pitchMorning(state);
  if (pitchNote) state.morningNotes.push(pitchNote);
  espressoMorning(state);
  gearMorning(state);
  potMorning(state); // FB2 A3: yesterday's stale pots
  ensureCounterSpots(state); // FB2 review I1: every fixed Gear spot is on the floor each morning (no-op in classic)
  fridgeMorning(state);
  officeMorning(state); // FB2 B6: does an office run come today (Gear, cart and café, from day 3)
  return state;
}
