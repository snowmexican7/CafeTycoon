import type { Effect, EventKind } from '../sim/types';

/**
 * Neighbourhood forecasts: what kind of day tomorrow is on our street. One per day, drawn from the
 * run seed a week at a time (src/sim/forecast.ts), shown at night so the crew can plan stock and
 * stations, and in force all day. Data only: adding one means adding a record here.
 */
export type ForecastId =
  | 'opening' | 'rainy' | 'examWeek' | 'market' | 'payday' | 'heatWave' | 'officeClosed'
  | 'coldSnap' | 'streetFestival' | 'roadworks' | 'lazySunday' | 'commuterRush'
  | 'ordinary';

/** How foot traffic moves through the day (multiplies arrivals; each averages about 1). */
export type TrafficShape = 'flat' | 'slowStart' | 'lateCrowd' | 'lunchPeak' | 'morningRush';

export interface Forecast {
  id: ForecastId;
  /** `{day}` becomes the weekday: "Rainy {day}" → "Rainy Monday". */
  name: string;
  /** The newspaper headline. */
  headline: string;
  /** One line of what it means, said plainly. */
  blurb: string;
  /** What a good crew does about it. */
  plan: string;
  /** A small glyph for the card and HUD chip. */
  icon: string;
  effects: Effect[];
  shape: TrafficShape;
  /** Weekdays it can fall on (0 = Monday); absent = any. */
  days?: number[];
  /** Draw weight within the week. */
  weight: number;
  /** Two days of one family never run back to back, so the week keeps changing. */
  family: 'calm' | 'wet' | 'hot' | 'busy' | 'quiet' | 'money';
  /** Only the very first day of a run: a gentle start. */
  firstDayOnly?: boolean;
  /** A heads-up about events this day makes likelier (shown with the forecast). */
  eventNote?: string;
}

export const FORECASTS: Forecast[] = [
  {
    id: 'opening', name: 'Grand opening', headline: 'NEW CAFÉ OPENS ITS DOORS', icon: '🎈',
    blurb: 'The street is curious and in no hurry.', plan: 'Learn the stations together. Customers are extra patient today.',
    effects: [{ kind: 'patience', mul: 1.1 }], shape: 'flat', weight: 0, family: 'calm', firstDayOnly: true,
  },
  {
    id: 'rainy', name: 'Rainy {day}', headline: 'DOWNPOUR ALL DAY, UMBRELLAS SOLD OUT', icon: '☔',
    blurb: 'Hot drinks fly, iced ones sit. A slow, soggy start, then everyone ducks in.',
    plan: 'Stock milk and beans; go easy on cold brew. Someone lives on the steamer.',
    effects: [{ kind: 'orderTag', tag: 'hot', mul: 1.7 }, { kind: 'orderTag', tag: 'iced', mul: 0.5 }, { kind: 'traffic', mul: 0.9 }, { kind: 'patience', mul: 1.1 }],
    shape: 'slowStart', weight: 10, family: 'wet',
  },
  {
    id: 'examWeek', name: 'Exam week', headline: 'STUDENTS CRAM, CAFÉS CRAMMED', icon: '📚',
    blurb: 'Students want cold brew and camp at the tables, so the line backs up early. The late crowd is huge.',
    plan: 'Stock concentrate. Keep the queue moving: campers mean one less spot in line.',
    effects: [{ kind: 'orderTag', tag: 'iced', mul: 1.8 }, { kind: 'patience', mul: 1.25 }, { kind: 'queue', add: -1 }, { kind: 'tipRate', add: -0.05 }, { kind: 'traffic', mul: 1.1 }],
    shape: 'lateCrowd', days: [0, 1, 2, 3], weight: 8, family: 'busy',
  },
  {
    id: 'market', name: 'Market Saturday', headline: 'FARMERS MARKET PACKS THE SQUARE', icon: '🧺',
    blurb: 'A big, impatient crowd with groups of friends. Rush hour is very likely.',
    plan: 'Full stock of everything. Split the bar: one on shots, one on milk, one on the pass.',
    effects: [{ kind: 'traffic', mul: 1.35 }, { kind: 'customerMix', customer: 'impatient', mul: 2 }, { kind: 'customerMix', customer: 'group', mul: 1.6 }, { kind: 'patience', mul: 0.92 }, { kind: 'tipRate', add: 0.05 }, { kind: 'eventOdds', event: 'rushHour', mul: 3 }],
    shape: 'lunchPeak', days: [5], weight: 30, family: 'busy', eventNote: 'Tour buses love a market: rush hour is likely.',
  },
  {
    id: 'payday', name: 'Payday {day}', headline: 'PAYCHEQUES LAND ACROSS TOWN', icon: '💸',
    blurb: 'Wallets are full: tips are big, and the lunch hour is packed.',
    plan: 'Serve fast and fresh: patience left is tip money. Lattes pay best.',
    effects: [{ kind: 'tipRate', add: 0.12 }, { kind: 'traffic', mul: 1.05 }, { kind: 'orderBias', drink: 'latte', mul: 1.3 }],
    shape: 'lunchPeak', days: [3, 4], weight: 12, family: 'money',
  },
  {
    id: 'heatWave', name: 'Heat wave', headline: 'MERCURY HITS 34°, CITY MELTS', icon: '🔥',
    blurb: 'Iced drinks spike, hot ones barely sell, and tempers are short. The grid is straining.',
    plan: 'Load up on concentrate. Keep the tap busy. Expect the lights to flicker.',
    effects: [{ kind: 'orderTag', tag: 'iced', mul: 2.4 }, { kind: 'orderTag', tag: 'hot', mul: 0.55 }, { kind: 'patience', mul: 0.9 }, { kind: 'eventOdds', event: 'powerFlicker', mul: 3 }],
    shape: 'flat', weight: 9, family: 'hot', eventNote: "Every AC on the block is on: a power flicker is likely.",
  },
  {
    id: 'officeClosed', name: 'Office closed', headline: 'TOWER NEXT DOOR SHUT FOR A DAY', icon: '🏢',
    blurb: 'The office crowd is gone. A quiet day, mostly regulars.',
    plan: 'Go light on stock and save cash for the shop. Make the regulars happy.',
    effects: [{ kind: 'traffic', mul: 0.72 }, { kind: 'customerMix', customer: 'regular', mul: 2.5 }, { kind: 'patience', mul: 1.15 }],
    shape: 'flat', days: [0, 1, 2, 3, 4], weight: 8, family: 'quiet',
  },
  {
    id: 'coldSnap', name: 'Cold snap', headline: 'FROST OVERNIGHT, SCARVES OUT', icon: '❄️',
    blurb: 'Everyone wants something hot and short, early. The morning commute is a rush.',
    plan: 'Beans, beans, beans. Grind ahead before the doors open.',
    effects: [{ kind: 'orderTag', tag: 'hot', mul: 1.5 }, { kind: 'orderBias', drink: 'espresso', mul: 1.5 }, { kind: 'orderTag', tag: 'iced', mul: 0.6 }],
    shape: 'morningRush', weight: 8, family: 'wet',
  },
  {
    id: 'streetFestival', name: 'Street festival', headline: 'BUSKERS, BALLOONS AND BIG GROUPS', icon: '🎪',
    blurb: 'Big groups wander in all day. Someone with a ring light is in town.',
    plan: 'Groups pay per drink: keep the pass stocked. Best latte art forward.',
    effects: [{ kind: 'traffic', mul: 1.2 }, { kind: 'customerMix', customer: 'group', mul: 2.2 }, { kind: 'eventOdds', event: 'influencerVisit', mul: 3 }],
    shape: 'flat', days: [4, 5, 6], weight: 9, family: 'busy', eventNote: 'Influencers love a festival: one may visit.',
  },
  {
    id: 'roadworks', name: 'Roadworks outside', headline: 'JACKHAMMERS ON MAIN STREET', icon: '🚧',
    blurb: 'Fewer walk-ins and a lot of grumpy hard hats, who tip in cash. The city inspectors are out.',
    plan: 'Fast serves for the impatient ones. Keep the floor spotless.',
    effects: [{ kind: 'traffic', mul: 0.85 }, { kind: 'customerMix', customer: 'impatient', mul: 2.2 }, { kind: 'tipRate', add: 0.06 }, { kind: 'eventOdds', event: 'healthInspector', mul: 3 }],
    shape: 'flat', days: [0, 1, 2, 3, 4], weight: 7, family: 'quiet', eventNote: 'Inspectors are walking the block: a health inspection is likely.',
  },
  {
    id: 'lazySunday', name: 'Lazy Sunday', headline: 'NOBODY SETS AN ALARM', icon: '🥐',
    blurb: 'A slow start and a relaxed crowd that wants lattes and lingers.',
    plan: 'Milk up. Patient customers: take a breath, nail every order.',
    effects: [{ kind: 'patience', mul: 1.3 }, { kind: 'orderBias', drink: 'latte', mul: 1.5 }, { kind: 'customerMix', customer: 'regular', mul: 1.6 }, { kind: 'traffic', mul: 0.95 }],
    shape: 'slowStart', days: [6], weight: 30, family: 'calm',
  },
  {
    id: 'commuterRush', name: 'Commuter crush', headline: 'TRAINS DELAYED, PLATFORMS PACKED', icon: '🚆',
    blurb: 'A huge, impatient morning wave, then it goes quiet.',
    plan: 'Prep before the doors open: grind ahead, pour cold brew onto the pass.',
    effects: [{ kind: 'traffic', mul: 1.1 }, { kind: 'customerMix', customer: 'impatient', mul: 1.6 }, { kind: 'orderBias', drink: 'espresso', mul: 1.3 }],
    shape: 'morningRush', days: [0, 1, 2, 3, 4], weight: 9, family: 'money',
  },
  {
    // Never drawn (weight 0): the neutral day for tests, fixtures and as a safe fallback.
    id: 'ordinary', name: 'An ordinary {day}', headline: 'NOTHING MUCH HAPPENS IN TOWN', icon: '☕',
    blurb: 'A regular day on the block.',
    plan: 'Keep the stations moving and the stock topped up.',
    effects: [], shape: 'flat', weight: 0, family: 'calm',
  },
];

export const forecastById = Object.fromEntries(FORECASTS.map((f) => [f.id, f])) as Record<ForecastId, Forecast>;

/** The events a forecast makes likelier, for the card. */
export function forecastEvents(f: Forecast): EventKind[] {
  return f.effects.flatMap((e) => (e.kind === 'eventOdds' && e.mul > 1 ? [e.event] : []));
}
