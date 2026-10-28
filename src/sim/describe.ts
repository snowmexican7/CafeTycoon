import { catalogueById } from '../data/catalogue';
import { scenarioById } from '../data/scenarios';
import type { DrinkId, Effect, GameState, StationKind, SupplyId } from './types';

const DRINK_NAMES: Record<DrinkId, string> = { espresso: 'espresso', latte: 'latte', coldBrew: 'cold brew' };
const STATION_NAMES: Record<StationKind, string> = {
  grinder: 'grinder',
  espresso: 'espresso machine',
  steamer: 'steamer',
  coldBrewTap: 'cold brew tap',
  counter: 'counter',
  trash: 'trash',
};
const SUPPLY_NAMES: Record<SupplyId, string> = { beans: 'beans', milk: 'milk', concentrate: 'concentrate' };

function pct(mul: number): string {
  const n = Math.round((mul - 1) * 100);
  return `${n >= 0 ? '+' : '-'}${Math.abs(n)}%`;
}

function times(mul: number): string {
  return `×${Number.isInteger(mul) ? mul : mul.toFixed(1)}`;
}

function describeOne(e: Effect): string {
  switch (e.kind) {
    case 'traffic':
      return `${pct(e.mul)} customers`;
    case 'patience':
      return `${pct(e.mul)} patience`;
    case 'price':
      return e.drink ? `${DRINK_NAMES[e.drink]} price ${pct(e.mul)}` : `prices ${pct(e.mul)}`;
    case 'stationSpeed':
      return `${STATION_NAMES[e.station]} ${pct(e.mul)} faster`;
    case 'moveSpeed':
      return `${pct(e.mul)} move speed`;
    case 'tipRate': {
      const n = Math.round(e.add * 100);
      return `tips ${n >= 0 ? '+' : '-'}${Math.abs(n)}%`;
    }
    case 'orderBias':
      return `${DRINK_NAMES[e.drink]} orders ${times(e.mul)}`;
    case 'supplyCost': {
      const n = Math.round(Math.abs(1 - e.mul) * 100);
      return `${SUPPLY_NAMES[e.supply]} ${n}% ${e.mul < 1 ? 'cheaper' : 'dearer'}`;
    }
    case 'gamble':
      return 'a gamble';
  }
}

/** Plain-words summary of a list of effects, for cards and morning notes. */
export function describeEffects(effects: Effect[]): string {
  return effects.map(describeOne).join(', ');
}

/** What the day opens with: the scenario on day one, then everything bought last night. */
export function morningNotes(state: GameState): string[] {
  const notes: string[] = [];
  if (state.day === 1) notes.push(scenarioById[state.scenario].note);
  for (const o of state.activeTomorrow) {
    notes.push(`${catalogueById[o.itemId].name} is live: ${describeEffects(o.effects)}`);
  }
  for (const id of state.boughtTonight) {
    const item = catalogueById[id];
    if (item && item.duration === 'permanent') notes.push(`${item.name} installed`);
  }
  return notes;
}
