import type { Scenario, ScenarioId } from '../sim/types';

/** Run-wide twists, rolled once per run and announced on day one. */
export const SCENARIOS: Scenario[] = [
  { id: 'normal', name: 'Normal week', note: 'A normal week. Nothing special in the air.', effects: [] },
  {
    id: 'campusTown',
    name: 'Campus town',
    note: 'Campus town: students everywhere, and they want cold brew.',
    effects: [
      { kind: 'traffic', mul: 1.1 },
      { kind: 'orderBias', drink: 'coldBrew', mul: 1.5 },
    ],
  },
  {
    id: 'rainyWeek',
    name: 'Rainy week',
    note: "Rainy week: everyone's grumpy and wants a latte.",
    effects: [
      { kind: 'patience', mul: 0.85 },
      { kind: 'orderBias', drink: 'latte', mul: 1.5 },
    ],
  },
  {
    id: 'touristSeason',
    name: 'Tourist season',
    note: 'Tourist season: crowds, short tempers, big tips.',
    effects: [
      { kind: 'traffic', mul: 1.25 },
      { kind: 'patience', mul: 0.9 },
      { kind: 'tipRate', add: 0.1 },
    ],
  },
];

export const scenarioById = Object.fromEntries(SCENARIOS.map((s) => [s.id, s])) as Record<ScenarioId, Scenario>;
