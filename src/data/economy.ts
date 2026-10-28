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
} as const;
