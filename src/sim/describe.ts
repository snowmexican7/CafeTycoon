import { catalogueById } from '../data/catalogue';
import { scenarioById } from '../data/scenarios';
import { forecastName, forecastOf } from './forecast';
import { secondsToTicks } from './constants';
import type { DrinkId, Effect, EventKind, GameState, StationKind, SupplyId } from './types';

const DRINK_NAMES: Record<DrinkId, string> = {
  espresso: 'espresso', latte: 'latte', coldBrew: 'cold brew', icedLatte: 'iced latte', mocha: 'mocha', matcha: 'matcha latte', special: 'maple cold foam', drip: 'drip coffee', americano: 'americano', cappuccino: 'cappuccino', doppio: 'doppio', sweetCream: 'sweet-cream cold brew', cafeAuLait: 'café au lait', redEye: 'red-eye', pourOver: 'pour-over',
};
const STATION_NAMES: Record<StationKind, string> = {
  grinder: 'grinder',
  espresso: 'espresso machine',
  steamer: 'steam wand', // FB2 C9: the 'steamer' kind is the wand on the espresso machine
  coldBrewTap: 'cold brew',
  drip: 'drip machine',
  counter: 'counter',
  trash: 'trash',
};
const SUPPLY_NAMES: Record<SupplyId, string> = { beans: 'beans', milk: 'milk', concentrate: 'concentrate', flavour: 'flavours', pastry: 'pastries' };

const EVENT_NAMES: Record<EventKind, string> = {
  rushHour: 'rush hour', powerFlicker: 'power flicker', influencerVisit: 'influencer', healthInspector: 'inspector',
};

function pct(mul: number): string {
  const n = Math.round((mul - 1) * 100);
  return `${n >= 0 ? '+' : '-'}${Math.abs(n)}%`;
}

function times(mul: number): string {
  return `×${Number.isInteger(mul) ? mul : mul.toFixed(1)}`;
}

const RADIO_WHEN = (frac: number) => (frac < 0.33 ? 'in the morning' : frac < 0.6 ? 'around midday' : 'in the afternoon');

/** The weather radio's report on tomorrow, if it was heard tonight. */
/** B11: what the radio says when tomorrow has no events, so a quiet report still has some character. */
const QUIET_RADIO = [
  'Nothing on the wire but smooth jazz. No surprises tomorrow; plan for the forecast.',
  'The traffic reporter is bored: no events tomorrow, just the crowd.',
  'Static, a weather jingle, then nothing. A clean day: no surprises.',
] as const;

export function quietRadio(state: GameState): string {
  if (state.forecast === 'opening') return 'Opening-day chatter only: no surprises, just a curious street. Learn the stations.';
  return QUIET_RADIO[state.day % QUIET_RADIO.length]!;
}

export function radioLine(state: GameState): string | undefined {
  if (state.radio?.day !== state.day) return undefined;
  if (state.radio.events.length === 0) return quietRadio(state);
  const dayTicks = secondsToTicks(state.settings.dayLengthSec);
  return state.radio.events
    .slice()
    .sort((a, b) => a.offset - b.offset)
    .map((e) => `${EVENT_NAMES[e.kind]} ${RADIO_WHEN(e.offset / dayTicks)}`)
    .join(', then ');
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
    case 'spoil': {
      const n = Math.round(Math.abs(1 - e.mul) * 100);
      return `milk and pastries spoil ${n}% ${e.mul < 1 ? 'less' : 'more'}`;
    }
    case 'gamble':
      return 'a gamble';
    case 'orderTag':
      return `${e.tag} drinks ${times(e.mul)}`;
    case 'customerMix':
      return `${e.customer === 'group' ? 'groups' : e.customer === 'regular' ? 'regulars' : 'impatient customers'} ${times(e.mul)}`;
    case 'eventOdds':
      return `${EVENT_NAMES[e.event]} ${e.mul >= 1 ? 'likelier' : 'rarer'} (${times(e.mul)})`;
    case 'queue':
      return `${e.add > 0 ? '+' : '−'}${Math.abs(e.add)} queue spot${Math.abs(e.add) === 1 ? '' : 's'}`;
    case 'unlock':
      return `adds ${DRINK_NAMES[e.drink]} to the menu`;
    case 'quality':
      return `${e.add >= 0 ? '+' : '−'}${Math.abs(e.add).toFixed(2)}★ rating a day`;
    case 'temp':
      return 'a temp barista for the day';
    case 'reveal':
      return "hear tomorrow's events each night";
  }
}

/** Whether an effect hurts: slower, fewer, cheaper prices, dearer supplies, lower tips or rating, fewer queue spots. */
export function isDownside(e: Effect): boolean {
  switch (e.kind) {
    case 'stationSpeed':
    case 'moveSpeed':
    case 'price':
    case 'traffic':
    case 'patience':
      return e.mul < 1;
    case 'supplyCost':
    case 'spoil':
      return e.mul > 1;
    case 'tipRate':
    case 'quality':
    case 'queue':
      return e.add < 0;
    default:
      return false;
  }
}

/** A card's effects split into upsides and downsides, each in plain words (downsides shown in red). */
export function splitEffects(effects: Effect[]): { ups: string; downs: string } {
  return { ups: describeEffects(effects.filter((e) => !isDownside(e))), downs: describeEffects(effects.filter(isDownside)) };
}

/** Plain-words summary of a list of effects, for cards and morning notes. */
export function describeEffects(effects: Effect[]): string {
  return effects.map(describeOne).join(', ');
}

/** Yesterday's one-line review when a customer went rogue. */
export const ROGUE_REVIEW = 'Had to make it myself. Two stars. Good beans though.';

/**
 * A heads-up for each event the sim already drew for today (scheduleEvents runs before the notes),
 * as a rumour: what's coming, never exactly when.
 */
export const EVENT_FORESHADOW: Record<EventKind, string> = {
  rushHour: 'The radio says a tour bus is due today. Brace for a rush: split the jobs up.',
  powerFlicker: 'The lights blinked while we set up. The old wiring might act up today.',
  healthInspector: 'Word is the health inspector is doing rounds on our street today. Keep the floor spotless.',
  influencerVisit: 'Someone with a ring light just followed us. An influencer might drop by today.',
};

/** What the day opens with: the scenario on day one, then everything bought last night. */
export function morningNotes(state: GameState): string[] {
  const notes: string[] = [];
  if (state.day === 1) notes.push(scenarioById[state.scenario].note);
  const f = forecastOf(state);
  notes.push(`${f.icon} ${forecastName(f, state.day)}: ${f.blurb}`);
  for (const o of state.activeTomorrow) {
    notes.push(`${catalogueById[o.itemId].name} is live: ${describeEffects(o.effects)}`);
  }
  for (const id of state.boughtTonight) {
    const item = catalogueById[id];
    if (item && item.duration === 'permanent') notes.push(`${item.name} installed`);
  }
  if ((state.days.at(-1)?.rogues ?? 0) > 0) notes.push(ROGUE_REVIEW);
  const walked = state.days.at(-1)?.soldOutWalkouts ?? 0;
  if (walked > 0) notes.push(`${walked === 1 ? '1 person' : `${walked} people`} walked away from a sold-out board yesterday.`);
  const early = state.days.at(-1)?.closedEarly;
  if (early !== undefined) notes.push(`You closed early yesterday with ${Math.floor(early / 60)}:${String(early % 60).padStart(2, '0')} still on the clock.`);
  for (const kind of new Set(state.eventSchedule.map((e) => e.kind))) notes.push(EVENT_FORESHADOW[kind]);
  for (const ch of state.challenges ?? []) notes.push(`🎯 Challenge: ${ch.blurb} (+$${ch.reward})`);
  return notes;
}

/** One line for the night paper listing tonight's optional goals. */
export function challengePaperLine(state: GameState): string | undefined {
  const list = state.challenges ?? [];
  if (!list.length) return undefined;
  if (list.length === 1) return `🎯 Optional: ${list[0]!.label} (+$${list[0]!.reward})`;
  return `🎯 Optional: ${list.map((c) => `${c.label} (+$${c.reward})`).join(' · ')}`;
}
