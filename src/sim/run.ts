import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { secondsToTicks } from './constants';
import { rngInt, seedRng } from './rng';
import { SCENARIOS } from '../data/scenarios';
import { scheduleEvents } from './events';
import { morningNotes } from './describe';
import { dealHand } from './night';
import type { CreateRunOptions, DayStats, GameState, Player, Settings } from './types';

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
    drinks: { espresso: 0, latte: 0, coldBrew: 0 },
    influencer: null,
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
  const players: Player[] = opts.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    pos: { ...(LAYOUT.spawnPoints[i] ?? LAYOUT.door) },
    moveDir: { x: 0, y: 0 },
    interactQueued: false,
    holding: null,
    connected: true,
    idleTicks: 0,
  }));
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
    stations: LAYOUT.stations.map((s) => ({ id: s.id, kind: s.kind, pos: { ...s.pos }, busyTicksLeft: 0, output: null })),
    customers: [],
    nextCustomerId: 1,
    today: freshDayStats(1),
    days: [],
    morningNotes: [],
    pass: [],
    menu: { espresso: true, latte: true, coldBrew: true },
    eventSchedule: [],
    events: [],
    regulars: [],
    log: [],
    nextLogSeq: 1,
  };
  state.scenario = SCENARIOS[rngInt(state, SCENARIOS.length)].id;
  return startNight(state);
}

/** Enter the night before `state.day`: timer, fresh ready-ups, tonight's hand. */
export function startNight(state: GameState): GameState {
  state.phase = 'night';
  state.phaseTicksLeft = secondsToTicks(state.settings.nightLengthSec);
  state.ready = [];
  state.boughtTonight = [];
  return dealHand(state);
}

/** Open the doors for `state.day`. */
export function startDay(state: GameState): GameState {
  state.phase = 'day';
  state.phaseTicksLeft = secondsToTicks(state.settings.dayLengthSec);
  state.customers = [];
  state.today = freshDayStats(state.day);
  state.events = [];
  state.eventSchedule = [];
  scheduleEvents(state);
  state.morningNotes = morningNotes(state);
  return state;
}
