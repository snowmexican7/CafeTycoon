import type { CardSetId, Effect } from '../sim/types';

/** A card set (B6): own `need` permanent cards that share it and the bonus switches on. */
export interface CardSet {
  id: CardSetId;
  name: string;
  need: number;
  bonus: Effect[];
}

export const CARD_SETS: Record<CardSetId, CardSet> = {
  espressoBar: {
    id: 'espressoBar', name: 'Espresso bar', need: 2,
    bonus: [{ kind: 'stationSpeed', station: 'espresso', mul: 1.1 }, { kind: 'stationSpeed', station: 'grinder', mul: 1.1 }],
  },
  milkLab: {
    id: 'milkLab', name: 'Milk lab', need: 2,
    bonus: [{ kind: 'stationSpeed', station: 'steamer', mul: 1.15 }, { kind: 'supplyCost', supply: 'milk', mul: 0.9 }],
  },
  coldBar: {
    id: 'coldBar', name: 'Cold bar', need: 2,
    bonus: [{ kind: 'stationSpeed', station: 'coldBrewTap', mul: 1.2 }, { kind: 'orderTag', tag: 'iced', mul: 1.1 }],
  },
  cosyCorner: { id: 'cosyCorner', name: 'Cosy corner', need: 2, bonus: [{ kind: 'patience', mul: 1.1 }] },
  kerbAppeal: { id: 'kerbAppeal', name: 'Kerb appeal', need: 2, bonus: [{ kind: 'traffic', mul: 1.06 }] },
  craft: { id: 'craft', name: 'Craft coffee', need: 2, bonus: [{ kind: 'quality', add: 0.1 }, { kind: 'tipRate', add: 0.03 }] },
  crewKit: { id: 'crewKit', name: 'Crew kit', need: 2, bonus: [{ kind: 'moveSpeed', mul: 1.08 }] },
  fullMenu: {
    id: 'fullMenu', name: 'Full menu', need: 2,
    bonus: [{ kind: 'price', drink: 'mocha', mul: 1.05 }, { kind: 'price', drink: 'matcha', mul: 1.05 }, { kind: 'price', drink: 'special', mul: 1.05 }],
  },
};
