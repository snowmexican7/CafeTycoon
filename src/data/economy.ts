import type { DrinkId, StationKind, SupplyId } from '../sim/types';

/** Every tunable number in one place. Balance lives here, rules live in src/sim. */
export const ECONOMY = {
  startingCash: 100,
  startingReputation: 2.5,
  rentPerDay: 25,
  startingSupplies: { beans: 20, milk: 10, concentrate: 15 } as Record<SupplyId, number>,
  packs: {
    beans: { size: 10, cost: 8 },
    milk: { size: 10, cost: 10 },
    concentrate: { size: 10, cost: 9 },
  } as Record<SupplyId, { size: number; cost: number }>,
  prices: { espresso: 3, latte: 4.75, coldBrew: 4 } as Record<DrinkId, number>,
  stationSeconds: { grinder: 2.5, espresso: 5, steamer: 3.5, coldBrewTap: 1.5 } as Record<
    Exclude<StationKind, 'counter' | 'trash'>,
    number
  >,
  patienceSeconds: 25,
  maxTipRate: 0.35,
  baseArrivalsPerSecond: 1 / 6,
  queueCapacity: 6,
  closingGraceSeconds: 10,
  reputation: { threshold: 0.7, delta: 0.2, min: 0.5, max: 5 },
  trafficFromReputation: { base: 0.7, perStar: 0.12 },
  pace: {
    arrival: [0.6, 0.8, 1, 1.3, 1.65],
    patience: [1.4, 1.2, 1, 0.85, 0.7],
  },
  weekRamp: { rent: 1.25, traffic: 1.15, patience: 0.95 },
  scoredWeekDays: 7,
  moveSpeedTilesPerSecond: 4,
  interactRangeTiles: 1.1,
  baristaHalfWidth: 0.35,
  dayLengthSec: 150,
  nightLengthSec: 60,
  handSize: 5,
  rarityWeights: { common: 60, uncommon: 30, rare: 10 },
  cheapThreshold: 30,
  drinkSupplies: {
    espresso: ['beans'],
    latte: ['beans', 'milk'],
    coldBrew: ['concentrate'],
  } as Record<DrinkId, SupplyId[]>,
  pass: { slots: 3, staleSeconds: { espresso: 45, latte: 60, coldBrew: 600 } as Record<DrinkId, number> },
  events: {
    scheduleWeights: [0.35, 0.45, 0.2],
    windowStart: 0.15,
    windowEnd: 0.75,
    rushHour: { seconds: 30, traffic: 2.0, patience: 0.9 },
    powerFlicker: { seconds: 4 },
    influencer: { patience: 1.5, bonus: 10, trafficAfter: 1.3 },
    inspector: { seconds: 20, wastedLimit: 4, fine: 15, reputationBonus: 0.1 },
  },
  customers: {
    mixDay1: { normal: 0.85, impatient: 0.15 },
    mix: { normal: 0.65, impatient: 0.15, group: 0.12, regular: 0.08 },
    impatient: { patience: 0.6, tip: 1.5 },
    group: { min: 2, max: 3, patience: 1.3, refill: 0.3 },
    regular: { tip: 1.25, max: 3, lostWeight: 2, names: ['Ada', 'Ravi', 'June'] },
  },
  bots: {
    thinkTicks: 6,
    reactionTicks: [30, 120],
    noticeTicks: [48, 120],
    yieldTicks: [18, 60],
    yieldRadius: 0.7,
    yieldsBeforeRerank: 3, // yields toward one target node before trying the next-nearest
    pressureQueue: 4,
    pressure: { mistake: 1.5, reaction: 0.8 },
    personalities: {
      rookie: { speed: 1.1, reaction: 0.8, mistake: 0.12, preps: false },
      steady: { speed: 1.0, reaction: 1.0, mistake: 0.06, preps: true },
      veteran: { speed: 0.9, reaction: 1.3, mistake: 0.02, preps: true },
      human: { speed: 1, reaction: 0, mistake: 0, preps: true },
    },
    skill: {
      reaction: [1.6, 1.3, 1.0, 0.8, 0.6],
      mistake: [2.0, 1.5, 1.0, 0.7, 0.4],
      speed: [0.85, 0.92, 1.0, 1.05, 1.1],
    },
    names: ['Bo', 'Lu', 'Mo'],
    maxWaitTicks: 600,
    prepColdBrews: 2, // prepping bots keep at most this many cold brews ahead (pass + hands + tap)
    arriveRadius: 0.08,
  },
} as const;
