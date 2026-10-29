import type { DrinkId, StationKind, SupplyId } from '../sim/types';
import { DRINK_IDS, suppliesFor } from './drinks';

/** Every tunable number in one place. Balance lives here, rules live in src/sim. */
export const ECONOMY = {
  startingCash: 100,
  /** B11: at the week's end, permanent fittings count toward the score at this share of their price (the café's worth). */
  fittingsResale: 0.5,
  startingReputation: 2.5,
  rentPerDay: 25,
  startingSupplies: { beans: 20, milk: 10, concentrate: 15, flavour: 0, pastry: 0 } as Record<SupplyId, number>,
  packs: {
    beans: { size: 10, cost: 8 },
    milk: { size: 10, cost: 10 },
    concentrate: { size: 10, cost: 9 },
    flavour: { size: 10, cost: 9 },
    pastry: { size: 6, cost: 7 },
  } as Record<SupplyId, { size: number; cost: number }>,
  prices: { espresso: 3, latte: 4.75, coldBrew: 4, icedLatte: 5.25, mocha: 6, matcha: 5.5, special: 6.25 } as Record<DrinkId, number>,
  stationSeconds: { grinder: 2.5, espresso: 5, steamer: 3.5, coldBrewTap: 1.5 } as Record<
    Exclude<StationKind, 'counter' | 'trash'>,
    number
  >,
  patienceSeconds: 33,
  maxTipRate: 0.35,
  baseArrivalsPerSecond: 1 / 6,
  queueCapacity: 6,
  /** Doors lock at 0:00; whoever is inside can still be served for up to this long. */
  closingGraceSeconds: 30,
  /** The closing beat lasts at least this long, even when the shop is already empty. */
  closingMinSeconds: 1,
  /** Most human baristas in one room (one spawn point each). */
  maxHumans: 4,
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
  handSize: 4,
  /** Re-rolling tonight's hand (B6): base price, plus step for each re-roll already made tonight. */
  reroll: { base: 5, step: 5 },
  rarityWeights: { common: 60, uncommon: 30, rare: 10 },
  cheapThreshold: 30,
  /** Every supply a drink needs from scratch (derived from the station recipes in src/data/drinks.ts). */
  drinkSupplies: Object.fromEntries(DRINK_IDS.map((d) => [d, suppliesFor(d)])) as Record<DrinkId, SupplyId[]>,
  /** Free flavour packs when the first drink that needs them joins the menu (cocoa, matcha, maple). */
  flavourStarter: 10,
  pass: { slots: 3, staleSeconds: { espresso: 45, latte: 60, coldBrew: 600, icedLatte: 180, mocha: 60, matcha: 60, special: 180 } as Record<DrinkId, number> },
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
    /** The agency temp from the hire-temp card (B6). */
    tempName: 'Robin (temp)',
    maxWaitTicks: 900, // above a rogue's make (10 s) plus a power flicker (4 s)
    prepColdBrews: 2, // prepping bots keep at most this many cold brews ahead (pass + hands + tap)
    arriveRadius: 0.08,
  },
  mess: {
    max: 12,
    spreadChance: 0.25,
    spreadMin: 0.5,
    spreadFactor: 0.5,
    slipChance: 0.05,
    stunTicks: [180, 300],
    cleanTicks: 90,
    dirtPerMessPerTick: 0.0025,
    recoverPerTick: 0.01,
    inspectorMin: 60,
    botMopBelow: 70,
    botMopMesses: 3,
    botMopMax: 3,
    patienceFloor: 0.8,
    botSpillChance: 0.5,
    mergeAdd: 0.5,
    spreadLoss: 0.25,
    minAmount: 0.25,
  },
  rogue: { chance: 0.015, remakeSeconds: 15, waitSeconds: 5, makeSeconds: 10, speed: 0.8, repHit: 0.1, minDay: 2 },
} as const;
