import type { CardSetId, Effect } from '../sim/types';

/** A card set (B6): own `need` permanent cards that share it and the bonus switches on. */
export interface CardSet {
  id: CardSetId;
  name: string;
  need: number;
  bonus: Effect[];
  /** B11: owning three of the set adds this on top (every set has at least three cards). */
  tier3: Effect[];
}

/** B11: how many cards a full set takes. */
export const FULL_SET = 3;

export const CARD_SETS: Record<CardSetId, CardSet> = {
  espressoBar: {
    id: 'espressoBar', name: 'Espresso bar', need: 2,
    bonus: [{ kind: 'stationSpeed', station: 'espresso', mul: 1.1 }, { kind: 'stationSpeed', station: 'grinder', mul: 1.1 }],
    tier3: [{ kind: 'stationSpeed', station: 'espresso', mul: 1.08 }],
  },
  milkLab: {
    id: 'milkLab', name: 'Milk lab', need: 2,
    bonus: [{ kind: 'stationSpeed', station: 'steamer', mul: 1.15 }, { kind: 'supplyCost', supply: 'milk', mul: 0.9 }],
    tier3: [{ kind: 'stationSpeed', station: 'steamer', mul: 1.1 }],
  },
  coldBar: {
    id: 'coldBar', name: 'Cold bar', need: 2,
    bonus: [{ kind: 'stationSpeed', station: 'coldBrewTap', mul: 1.2 }, { kind: 'orderTag', tag: 'iced', mul: 1.1 }],
    tier3: [{ kind: 'stationSpeed', station: 'coldBrewTap', mul: 1.1 }],
  },
  cosyCorner: { id: 'cosyCorner', name: 'Cosy corner', need: 2, bonus: [{ kind: 'patience', mul: 1.1 }], tier3: [{ kind: 'patience', mul: 1.05 }] },
  kerbAppeal: { id: 'kerbAppeal', name: 'Kerb appeal', need: 2, bonus: [{ kind: 'traffic', mul: 1.06 }], tier3: [{ kind: 'traffic', mul: 1.04 }] },
  craft: { id: 'craft', name: 'Craft coffee', need: 2, bonus: [{ kind: 'quality', add: 0.1 }, { kind: 'tipRate', add: 0.03 }], tier3: [{ kind: 'tipRate', add: 0.03 }] },
  crewKit: { id: 'crewKit', name: 'Crew kit', need: 2, bonus: [{ kind: 'moveSpeed', mul: 1.08 }], tier3: [{ kind: 'moveSpeed', mul: 1.05 }] },
  fullMenu: {
    id: 'fullMenu', name: 'Full menu', need: 2,
    bonus: [{ kind: 'price', drink: 'mocha', mul: 1.05 }, { kind: 'price', drink: 'matcha', mul: 1.05 }, { kind: 'price', drink: 'special', mul: 1.05 }],
    tier3: [{ kind: 'price', drink: 'latte', mul: 1.04 }, { kind: 'price', drink: 'icedLatte', mul: 1.04 }],
  },
};
