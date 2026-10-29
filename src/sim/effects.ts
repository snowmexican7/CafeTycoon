import { ECONOMY } from '../data/economy';
import { scenarioById } from '../data/scenarios';
import { eventActive } from './events';
import { rngNext } from './rng';
import { DRINK_IDS, DRINK_TEMP } from '../data/drinks';
import { dayProgress, forecastOf, shapeAt } from './forecast';
import type { DrinkId, Effect, EventKind, GameState, StationKind, SupplyId } from './types';

/** Every multiplier the simulation reads, already combined. */
export interface Modifiers {
  stationSpeed: Record<StationKind, number>;
  moveSpeed: number;
  price: Record<DrinkId, number>;
  traffic: number;
  patience: number;
  tipRate: number;
  orderBias: Record<DrinkId, number>;
  supplyCost: Record<SupplyId, number>;
  /** Weights on the customer mix's non-normal kinds. */
  mix: Record<'impatient' | 'group' | 'regular', number>;
  eventOdds: Record<EventKind, number>;
  /** Added to the queue's capacity. */
  queue: number;
}

const DRINKS: DrinkId[] = DRINK_IDS;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Neutral modifiers: every multiplier 1, tipRate 0. */
export function baseModifiers(): Modifiers {
  return {
    stationSpeed: { grinder: 1, espresso: 1, steamer: 1, coldBrewTap: 1, counter: 1, trash: 1 },
    moveSpeed: 1,
    price: { espresso: 1, latte: 1, coldBrew: 1 },
    traffic: 1,
    patience: 1,
    tipRate: 0,
    orderBias: { espresso: 1, latte: 1, coldBrew: 1 },
    supplyCost: { beans: 1, milk: 1, concentrate: 1 },
    mix: { impatient: 1, group: 1, regular: 1 },
    eventOdds: { rushHour: 1, powerFlicker: 1, influencerVisit: 1, healthInspector: 1 },
    queue: 0,
  };
}

/** Combine a list of effects: multipliers multiply, additions add. Gambles are skipped (resolved at purchase). */
export function itemModifiers(effects: Effect[]): Modifiers {
  const m = baseModifiers();
  for (const e of effects) {
    switch (e.kind) {
      case 'stationSpeed':
        m.stationSpeed[e.station] *= e.mul;
        break;
      case 'moveSpeed':
        m.moveSpeed *= e.mul;
        break;
      case 'price':
        for (const d of e.drink ? [e.drink] : DRINKS) m.price[d] *= e.mul;
        break;
      case 'traffic':
        m.traffic *= e.mul;
        break;
      case 'patience':
        m.patience *= e.mul;
        break;
      case 'tipRate':
        m.tipRate += e.add;
        break;
      case 'orderBias':
        m.orderBias[e.drink] *= e.mul;
        break;
      case 'supplyCost':
        m.supplyCost[e.supply] *= e.mul;
        break;
      case 'orderTag':
        for (const d of DRINKS) if (DRINK_TEMP[d] === e.tag) m.orderBias[d] *= e.mul;
        break;
      case 'customerMix':
        m.mix[e.customer] *= e.mul;
        break;
      case 'eventOdds':
        m.eventOdds[e.event] *= e.mul;
        break;
      case 'queue':
        m.queue += e.add;
        break;
      case 'gamble':
        break;
    }
  }
  return m;
}

/** Which café week a day belongs to: days 1–7 are week 1. */
export function weekOf(day: number): number {
  return Math.ceil(day / ECONOMY.scoredWeekDays);
}

/** The modifiers in force right now: scenario, today's forecast and items, then reputation, pace, the week ramp and the forecast's traffic shape. */
export function computeModifiers(state: GameState): Modifiers {
  const forecast = forecastOf(state);
  const effects: Effect[] = [
    ...scenarioById[state.scenario].effects,
    ...forecast.effects,
    ...state.owned.flatMap((o) => o.effects),
    ...state.activeTomorrow.flatMap((o) => o.effects),
  ];
  const m = itemModifiers(effects);
  const rep = ECONOMY.trafficFromReputation;
  const paceIndex = state.settings.pace - 1;
  const ramp = weekOf(state.day) - 1;
  m.traffic *= (rep.base + rep.perStar * state.reputation) * ECONOMY.pace.arrival[paceIndex] * ECONOMY.weekRamp.traffic ** ramp;
  m.patience *= ECONOMY.pace.patience[paceIndex] * ECONOMY.weekRamp.patience ** ramp;
  if (state.phase === 'day') m.traffic *= shapeAt(forecast.shape, dayProgress(state));
  if (eventActive(state, 'rushHour')) {
    m.traffic *= ECONOMY.events.rushHour.traffic;
    m.patience *= ECONOMY.events.rushHour.patience;
  }
  if (state.today.influencer === 'served') m.traffic *= ECONOMY.events.influencer.trafficAfter;
  // A dirty floor wears on patience; read once when a customer arrives, so waiting ones keep theirs.
  const { patienceFloor } = ECONOMY.mess;
  m.patience *= patienceFloor + ((1 - patienceFloor) * state.cleanliness) / 100;
  return m;
}

/** Rent due at today's closing, ramping each week in unlimited mode. */
export function rentForDay(state: GameState): number {
  return round2(ECONOMY.rentPerDay * ECONOMY.weekRamp.rent ** (weekOf(state.day) - 1));
}

/** Turn a gamble into its outcome using the run's rng; any other effect passes through. */
export function resolveGamble(effect: Effect, state: GameState): Effect[] {
  if (effect.kind !== 'gamble') return [effect];
  return rngNext(state) < effect.chance ? effect.win : effect.lose;
}
