import { recipeFor } from '../sim/stations';
import { ACCURACY } from '../sim/accuracy';
import { ROLES } from '../sim/roles';
import { closeEarlyVM, type CloseEarlyVM } from './closeEarly';
/**
 * Presentational helpers for the restyled overlays. They read GameState directly for the things
 * the view models do not carry (order tickets, crew, what you hold, the day bar), and never change
 * the sim or the view models. Each block has its own key so the DOM only rebuilds when it changes.
 */
import { catalogueById } from '../data/catalogue';
import { ECONOMY } from '../data/economy';
import { TICK_RATE } from '../sim/constants';
import { computeModifiers } from '../sim/effects';
import { nearestStation } from '../sim/movement';
import type { CatalogueItem, DrinkId, GameState, ItemKind, PlayerId, StationKind, SupplyId } from '../sim/types';

export const PLAYER_HEX = ['#e0564a', '#4c8fd6', '#4fae7b', '#8a6bbf'] as const;
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const ITEM_LABEL: Record<ItemKind, string> = {
  grounds: 'Grounds', espresso: 'Espresso', latte: 'Latte', coldBrew: 'Cold brew',
  icedLatte: 'Iced latte', mocha: 'Mocha', matcha: 'Matcha latte', special: 'Maple cold foam',
};
export const STATION_NAME: Record<StationKind, string> = {
  grinder: 'Grinder',
  espresso: 'Espresso machine',
  steamer: 'Steamer',
  coldBrewTap: 'Cold brew tap',
  counter: 'Pick-up counter',
  trash: 'Trash',
};
export const SUPPLY_NAME: Record<SupplyId, string> = { beans: 'Beans', milk: 'Milk', concentrate: 'Cold brew', flavour: 'Flavours', pastry: 'Pastries' };
/** The steps on an order ticket, in the order a barista does them. */
export const DRINK_STEPS: Record<DrinkId, string[]> = {
  espresso: ['Grind', 'Pull', 'Hand off'],
  latte: ['Grind', 'Pull', 'Steam', 'Hand off'],
  coldBrew: ['Tap', 'Hand off'],
  icedLatte: ['Grind', 'Pull', 'Tap', 'Hand off'],
  mocha: ['Grind', 'Pull', 'Steam', 'Cocoa', 'Hand off'],
  matcha: ['Whisk', 'Hand off'],
  special: ['Tap', 'Foam', 'Hand off'],
};

export interface CrewMember {
  id: PlayerId;
  name: string;
  initial: string;
  color: string;
  me: boolean;
  connected: boolean;
  /** A bot barista (and its personality), shown with a gear badge. */
  bot?: string;
}

export interface OrderTicket {
  id: number;
  drink: DrinkId;
  /** Patience left, 0..1. Changes every tick: patch it, do not key on it. */
  patience: number;
  /** Who's asking, when it matters: "Ada · regular", "In a hurry", "Group · 2 more", "Influencer", "Wrong drink!". */
  tag?: { text: string; tone: 'regular' | 'impatient' | 'group' | 'influencer' | 'upset' };
}

/** The little tag on an order ticket for the customer kinds worth planning around. */
export function ticketTag(c: GameState['customers'][number]): OrderTicket['tag'] {
  if (c.upset) return { text: 'Wrong drink! Remake it', tone: 'upset' };
  switch (c.kind) {
    case 'regular':
      return { text: `${c.name ?? 'Regular'} \u00b7 regular`, tone: 'regular' };
    case 'impatient':
      return { text: 'In a hurry', tone: 'impatient' };
    case 'group': {
      const more = c.extra?.length ?? 0;
      return { text: more > 0 ? `Group \u00b7 ${more} more after this` : 'Group \u00b7 last one', tone: 'group' };
    }
    case 'influencer':
      return { text: 'Influencer \u00b7 bonus', tone: 'influencer' };
    default:
      return undefined;
  }
}

export interface HandHint {
  /** True when pressing E would do something right now. */
  go: boolean;
  /** "Grind beans", "Needs grounds", "Walk up to a station"... */
  title: string;
  /** Where, and how long it takes. */
  detail: string;
}

export interface HudLive {
  /** Run day (1-based): day 1 auto-opens the first ticket's recipe steps. */
  day?: number;
  dayInWeek: number;
  /** 0..1 through today's opening hours (or through the closing grace). */
  progress: number;
  open: boolean;
  orders: OrderTicket[];
  crew: CrewMember[];
  holding: ItemKind | null;
  meName: string;
  hint: HandHint;
  /** FB1 WP3: the close-early vote (button by the clock). */
  closeEarly?: CloseEarlyVM;
}

export function crewOf(state: GameState, me: PlayerId): CrewMember[] {
  return state.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    initial: (p.name.trim()[0] ?? '?').toUpperCase(),
    color: PLAYER_HEX[i % PLAYER_HEX.length],
    me: p.id === me,
    connected: p.connected,
    ...(p.bot ? { bot: p.bot.personality } : {}),
  }));
}

const VERB: Record<'grinder' | 'espresso' | 'steamer' | 'coldBrewTap', string> = {
  grinder: 'Grind beans',
  espresso: 'Pull a shot',
  steamer: 'Steam milk',
  coldBrewTap: 'Pour cold brew',
};
const TAKES: Record<keyof typeof VERB, ItemKind | null> = { grinder: null, espresso: 'grounds', steamer: 'espresso', coldBrewTap: null };
const USES: Record<keyof typeof VERB, SupplyId | null> = { grinder: 'beans', espresso: null, steamer: 'milk', coldBrewTap: 'concentrate' };

/** A plain-words hint for the nearest station, mirroring the interact rules (display only). */
export function handHint(state: GameState, me: PlayerId): HandHint {
  const player = state.players.find((p) => p.id === me);
  const idle = (title: string, detail: string): HandHint => ({ go: false, title, detail });
  const go = (title: string, detail: string): HandHint => ({ go: true, title, detail });
  if (!player || (state.phase !== 'day' && state.phase !== 'closing')) return idle('', '');
  const station = nearestStation(state, player.pos);
  if (!station) return idle('Walk up to a station', 'E uses the nearest one');
  const where = STATION_NAME[station.kind];
  const held = player.holding;
  if (station.kind === 'trash') return held ? go(`Bin the ${ITEM_LABEL[held].toLowerCase()}`, where) : idle('Hands are empty', where);
  if (station.kind === 'counter') return held && held !== 'grounds' ? go(`Hand off ${ITEM_LABEL[held].toLowerCase()}`, where) : idle('Bring a drink here', where);
  const kind = station.kind;
  if (station.output !== null && held === null) {
    const sat = station.doneAt !== undefined && state.tick - station.doneAt > ACCURACY.sitSeconds * TICK_RATE;
    return go(`Pick up ${ITEM_LABEL[station.output].toLowerCase()}`, sat ? `${where} · sat too long, −1★` : where);
  }
  // P3 B5: near the end of a run, empty hands can rush it.
  if (station.busyTicksLeft > 0 && held === null && station.making && station.busyTotal && station.busyTicksLeft <= station.busyTotal * ACCURACY.earlyShare)
    return go(`Rush it out now (−1★)`, `${where} · ready in ${Math.ceil(station.busyTicksLeft / TICK_RATE)} s`);
  if (station.busyTicksLeft > 0) return idle(`Ready in ${Math.ceil(station.busyTicksLeft / TICK_RATE)} s`, where);
  if (station.output !== null) return idle('Hands full', where);
  const need = TAKES[kind];
  if (held !== null && held !== 'grounds' && !recipeFor(state, kind, held)) return idle(`Wrong station: E fumbles it (−1★)`, `${where} needs ${need ? ITEM_LABEL[need].toLowerCase() : 'empty hands'}`);
  if (held !== need) return idle(need ? `Needs ${ITEM_LABEL[need].toLowerCase()}` : 'Hands full', where);
  const supply = USES[kind];
  if (supply && state.supplies[supply] < 1) return idle(`Out of ${SUPPLY_NAME[supply].toLowerCase()}`, where);
  const secs = ECONOMY.stationSeconds[kind] / computeModifiers(state).stationSpeed[kind];
  return go(VERB[kind], `${where} · ${secs.toFixed(1)} s`);
}

export function hudLive(state: GameState, me: PlayerId): HudLive {
  const total = state.phase === 'closing' ? ECONOMY.closingGraceSeconds * TICK_RATE : state.settings.dayLengthSec * TICK_RATE;
  const progress = total > 0 ? Math.max(0, Math.min(1, 1 - state.phaseTicksLeft / total)) : 0;
  const player = state.players.find((p) => p.id === me);
  return {
    day: state.day,
    dayInWeek: (state.day - 1) % 7,
    progress,
    open: state.phase === 'day',
    orders: state.customers.map((c) => {
      const tag = ticketTag(c);
      return { id: c.id, drink: c.drink, patience: c.patienceMax > 0 ? c.patienceLeft / c.patienceMax : 0, ...(tag ? { tag } : {}) };
    }),
    crew: crewOf(state, me),
    holding: player?.holding ?? null,
    meName: player?.role ? `${ROLES[player.role].icon} ${player.name} the ${ROLES[player.role].name}` : (player?.name ?? ''),
    hint: handHint(state, me),
    closeEarly: closeEarlyVM(state, me),
  };
}

/** Keys for the HUD's independently rebuilt blocks (everything except per-tick values). */
export const ordersKey = (l: HudLive) => l.orders.map((o) => `${o.id}${o.drink}${o.patience < 0.28 ? '!' : ''}${o.tag ? `#${o.tag.text}` : ''}`).join(',');
export const crewKey = (l: HudLive) => l.crew.map((c) => `${c.id}:${c.name}:${c.connected ? 1 : 0}:${c.me ? 1 : 0}:${c.bot ?? ''}`).join(',');
export const handKey = (l: HudLive) => `${l.holding}|${l.meName}|${l.hint.go}|${l.hint.title}|${l.hint.detail}`;

export interface NightExtras {
  day: number;
  weekday: string;
  /** 0..1 of the night left. Patched, not keyed. */
  left: number;
  served: number;
  lost: number;
  reputation: number;
  crew: CrewMember[];
  bought: { itemId: string; name: string; category: CatalogueItem['category'] }[];
}

export function nightExtras(state: GameState, me: PlayerId): NightExtras {
  const last = state.days.length ? state.days[state.days.length - 1] : null;
  const total = state.settings.nightLengthSec * TICK_RATE;
  return {
    day: state.day,
    weekday: WEEKDAYS[(state.day - 1) % 7],
    left: total > 0 ? Math.max(0, Math.min(1, state.phaseTicksLeft / total)) : 0,
    served: last?.served ?? 0,
    lost: (last?.lost ?? 0) + (last?.turnedAway ?? 0),
    reputation: state.reputation,
    crew: crewOf(state, me),
    bought: state.boughtTonight.map((id) => ({ itemId: id, name: catalogueById[id]?.name ?? id, category: catalogueById[id]?.category ?? 'oddball' })),
  };
}

export const nightExtrasKey = (n: NightExtras) =>
  `${n.day}|${n.served}|${n.lost}|${n.reputation}|${crewKey({ crew: n.crew } as HudLive)}|${n.bought.map((b) => b.itemId).join(',')}`;

export function categoryOf(itemId: string): CatalogueItem['category'] {
  return catalogueById[itemId]?.category ?? 'oddball';
}
