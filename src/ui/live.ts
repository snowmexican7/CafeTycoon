import { seasonNow } from '../sim/season';
import { money } from './viewModels';
import { recipeFor } from '../sim/stations';
import { TILL, tillNext } from '../sim/till';
import { passSlots, pickupTarget, spotOf } from '../sim/pickup';
import { CONDIMENTS, canTakeBox } from '../sim/condiments';
import { CONDIMENTS_ID } from '../data/layout';
import { DRINK_INFO } from '../data/drinks';
import { GEAR } from '../data/gear';
import { podsOnly } from '../sim/gear';
import { ACCURACY } from '../sim/accuracy';
import { ROLES } from '../sim/roles';
import { closeEarlyVM, type CloseEarlyVM } from './closeEarly';
import { CALL, callRinging } from '../sim/call';
import { AREAS } from '../data/areas';
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
import type { CatalogueItem, DrinkId, GameState, ItemKind, PlayerId, Station, StationKind, SupplyId } from '../sim/types';

export const PLAYER_HEX = ['#e0564a', '#4c8fd6', '#4fae7b', '#8a6bbf'] as const;
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const ITEM_LABEL: Record<ItemKind, string> = {
  grounds: 'Grounds', espresso: 'Espresso', latte: 'Latte', coldBrew: 'Cold brew',
  icedLatte: 'Iced latte', mocha: 'Mocha', matcha: 'Matcha latte', special: 'Maple cold foam', drip: 'Drip coffee', americano: 'Americano', cappuccino: 'Cappuccino', doppio: 'Doppio', sweetCream: 'Sweet-cream cold brew', cafeAuLait: 'Café au lait', redEye: 'Red-eye', pourOver: 'Pour-over',
};
export const STATION_NAME: Record<StationKind, string> = {
  grinder: 'Grinder',
  espresso: 'Espresso machine',
  steamer: 'Steamer',
  coldBrewTap: 'Cold brew tap',
  drip: 'Drip machine',
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
  drip: ['Pour', 'Hand off'],
  americano: ['Grind', 'Pull', 'Water', 'Hand off'],
  doppio: ['Grind', 'Pull', 'Pull again', 'Hand off'],
  sweetCream: ['Tap', 'Cream', 'Hand off'],
  cafeAuLait: ['Drip', 'Milk', 'Hand off'],
  redEye: ['Drip', 'Shot', 'Hand off'],
  pourOver: ['Pour', 'Hand off'],
  cappuccino: ['Grind', 'Pull', 'Steam', 'Foam', 'Hand off'],
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
  /** Batch/pickup (Gear): rung up at the till, now waiting at the pickup area. */
  pickup?: true;
}

/** The little tag on an order ticket for the customer kinds worth planning around. */
export function ticketTag(c: GameState['customers'][number], snobs?: ReadonlySet<string>): OrderTicket['tag'] {
  if (c.upset) return { text: 'Wrong drink! Remake it', tone: 'upset' };
  switch (c.kind) {
    case 'regular':
      return snobs?.has(c.name ?? '') ? { text: `\u{1F3A9} ${c.name} \u00b7 snob: wants it perfect`, tone: 'regular' } : { text: `${c.name ?? 'Regular'} \u00b7 regular`, tone: 'regular' };
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
  /** Every espresso machine is a pod machine: tickets show "Pod" instead of Grind + Pull. */
  pods?: boolean;
  /** Batch/pickup: a Gear run (tickets end in "Pickup"). */
  gear?: boolean;
  meName: string;
  hint: HandHint;
  /** FB1 WP3: the close-early vote (button by the clock). */
  closeEarly?: CloseEarlyVM;
  /** P4 B6: the second shop is ringing. */
  call?: CallVM;
}

export interface CallVM { kind: 'machine' | 'order'; where: string; title: string; detail: string; yes: string; no: string; secsLeft: number }

export function callVM(state: GameState, me: PlayerId): CallVM | undefined {
  const c = callRinging(state);
  const p = state.players.find((x) => x.id === me);
  if (!c || !state.branch || !p || p.bot) return undefined;
  const where = AREAS[state.branch.area]?.name ?? 'the other shop';
  return c.kind === 'machine'
    ? { kind: c.kind, where, title: 'Their espresso machine just died!', detail: `Fix it now for $${CALL.repair}, or it serves half its cups today.`, yes: `🔧 Send a fix · $${CALL.repair}`, no: 'Let it ring', secsLeft: c.secsLeft }
    : { kind: c.kind, where, title: `An office wants ${CALL.orderCups} coffees delivered!`, detail: `+$${CALL.orderProfit} for the order, but it uses ${CALL.orderCups} of the shop's cups today.`, yes: `☕ Take the order · +$${CALL.orderProfit}`, no: 'Turn it down', secsLeft: c.secsLeft };
}

export const callKey = (c: CallVM | undefined): string => (c ? `${c.kind}|${c.secsLeft}` : '');

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

const VERB: Record<'grinder' | 'espresso' | 'steamer' | 'coldBrewTap' | 'drip', string> = {
  grinder: 'Grind beans',
  espresso: 'Pull a shot',
  steamer: 'Steam milk',
  coldBrewTap: 'Pour cold brew',
  drip: 'Brew a pot',
};
const TAKES: Record<keyof typeof VERB, ItemKind | null> = { grinder: null, espresso: 'grounds', steamer: 'espresso', coldBrewTap: null, drip: null };
const USES: Record<keyof typeof VERB, SupplyId | null> = { grinder: 'beans', espresso: null, steamer: 'milk', coldBrewTap: 'concentrate', drip: 'beans' };

/** Gear names for the three counter-kind spots (the till keeps the counter's id). */
export function counterName(station: { id: string }): string {
  const spot = spotOf(station as Station);
  return spot === 'pickup' ? 'Pickup counter' : spot === 'condiments' ? 'Condiment bar' : 'Till';
}

/**
 * Gear (batch/pickup, mirrors sim/pass.ts gearCounter): a drink in hand at any counter spot goes on the pickup
 * counter. Empty hands: the till rings up the next order, the pickup counter takes a cup back, the bar needs a box.
 */
function gearCounterHint(state: GameState, player: GameState['players'][number], station: Station): HandHint {
  const where = counterName(station);
  const held = player.holding;
  const spot = spotOf(station);
  if (held && held !== 'grounds') {
    if (state.pass.length >= passSlots(state)) return { go: false, title: 'Pickup counter is full', detail: `${where} · ${state.pass.length}/${passSlots(state)} slots` };
    const taker = pickupTarget(state, held);
    return { go: true, title: 'Set on the pickup counter', detail: taker ? `${where} · a customer is waiting for it` : `${where} · nobody rung up for it yet` };
  }
  if (spot === 'till') {
    const next = tillNext(state);
    if (!next) return { go: false, title: 'Nobody to ring up', detail: where };
    const ready = state.pass.some((i) => i.item === next.drink);
    const rung = state.customers.filter((c) => c.stage === 'pickup').length;
    return {
      go: true,
      title: `Ring up: ${DRINK_INFO[next.drink].short.toLowerCase()}`,
      detail: ready ? `${where} · it's already on the counter, they take it right away` : `${where} · on the counter in ${TILL.fast.seconds}s = +$${TILL.fast.tip.toFixed(2)} tip${rung ? ` · ${rung} at pickup` : ''}`,
    };
  }
  if (spot === 'pickup') {
    if (state.pass.length === 0) return { go: false, title: 'Bring a drink here', detail: `${where} · ${passSlots(state)} slots` };
    return { go: true, title: 'Take a cup back', detail: `${where} · ${state.pass.length}/${passSlots(state)} on the counter` };
  }
  const servings = state.condiments?.servings ?? 0;
  if (servings <= 0) return { go: false, title: 'Bar is empty: bring a box', detail: `${where} · ${state.condimentBoxes ?? 0} in the corner` };
  return { go: false, title: servings <= CONDIMENTS_LOW ? 'Bar is running low' : 'Cream & sugar', detail: `${where} · ${servings}/${CONDIMENTS.servings} servings` };
}

/** At or below this many servings the bar reads as low (the bots fetch a box at ≤ 2). */
export const CONDIMENTS_LOW = 5;

/** A plain-words hint for the nearest station, mirroring the interact rules (display only). */
export function handHint(state: GameState, me: PlayerId): HandHint {
  const player = state.players.find((p) => p.id === me);
  const idle = (title: string, detail: string): HandHint => ({ go: false, title, detail });
  const go = (title: string, detail: string): HandHint => ({ go: true, title, detail });
  if (!player || (state.phase !== 'day' && state.phase !== 'closing')) return idle('', '');
  const station = nearestStation(state, player.pos);
  // Batch/pickup: a condiment box in hand only goes in the bar.
  if (player.tool === 'box') {
    if (station?.id !== CONDIMENTS_ID) return idle('Carry the box to the condiment bar', 'R puts it back in the corner');
    const servings = state.condiments?.servings ?? 0;
    return servings >= CONDIMENTS.servings ? idle('The bar is full: keep the box', `Condiment bar · ${servings}/${CONDIMENTS.servings}`) : go('Refill the condiment bar', `Condiment bar · ${servings}/${CONDIMENTS.servings} → ${CONDIMENTS.servings}`);
  }
  if (!station) {
    if (player.tool === null && player.holding === null && canTakeBox(state, player)) return go('Pick up a condiment box', `${state.condimentBoxes} in the corner · fills the bar to ${CONDIMENTS.servings}`);
    return idle('Walk up to a station', 'E uses the nearest one');
  }
  const where = STATION_NAME[station.kind];
  const held = player.holding;
  if (station.kind === 'trash') return held ? go(`Bin the ${ITEM_LABEL[held].toLowerCase()}`, where) : idle('Hands are empty', where);
  if (station.kind === 'counter') {
    if (state.gear === true) return gearCounterHint(state, player, station);
    if (held && held !== 'grounds') return go(`Hand off ${ITEM_LABEL[held].toLowerCase()}`, where);
    return idle('Bring a drink here', where);
  }
  const kind = station.kind;
  // Gear G4d: a drip pot pours a cup per press.
  if (station.output !== null && held === null && station.potLeft !== undefined) {
    const cold = station.potOff === 'cold' || (station.potColdAt !== undefined && state.tick >= station.potColdAt);
    const temp = cold ? ' · pot went cold, −1★' : station.potOff === 'hot' ? ' · scalding, −1★' : '';
    return go(`Pour a cup of drip`, `${where} · ${station.potLeft} left${temp}`);
  }
  if (station.output !== null && held === null) {
    const sat = station.doneAt !== undefined && state.tick - station.doneAt > ACCURACY.sitSeconds * TICK_RATE;
    return go(`Pick up ${ITEM_LABEL[station.output].toLowerCase()}`, sat ? `${where} · sat too long, −1★` : where);
  }
  // P3 B5: near the end of a run, empty hands can rush it.
  if (station.busyTicksLeft > 0 && held === null && station.making && station.busyTotal && station.busyTicksLeft <= station.busyTotal * ACCURACY.earlyShare)
    return go(`Rush it out now (−1★)`, `${where} · ready in ${Math.ceil(station.busyTicksLeft / TICK_RATE)} s`);
  if (station.busyTicksLeft > 0) return idle(`Ready in ${Math.ceil(station.busyTicksLeft / TICK_RATE)} s`, where);
  if (station.output !== null) return idle('Hands full', where);
  // Gear G5: dead or jammed machines.
  if (station.dead) return idle('Dead till tonight', where);
  if (station.jammed) return held === null ? go('Whack it!', `${where} · jammed`) : idle('Jammed: empty hands to whack it', where);
  // Gear G4: the Pod-o-Matic takes empty hands (a pod), not grounds.
  if (station.gear && GEAR[station.gear].pods) {
    if (held === 'grounds') return idle('Pods only: no grounds here', where);
    if (held === null) return state.supplies.beans < 1 ? idle('Out of pods (beans)', where) : go('Pop in a pod', `${where} · ${(5 / GEAR[station.gear].speed).toFixed(1)} s`);
  }
  const need = TAKES[kind];
  // Smoke fix: a pod machine never wants grounds, so don't tell the player it does.
  const needText = station.gear && GEAR[station.gear].pods ? 'empty hands (it takes pods)' : need ? ITEM_LABEL[need].toLowerCase() : 'empty hands';
  if (held !== null && held !== 'grounds' && !recipeFor(state, kind, held)) return idle(`Wrong station: E fumbles it (−1★)`, `${where} needs ${needText}`);
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
  const snobs = new Set(state.regulars.filter((r) => r.snob).map((r) => r.name));
  return {
    day: state.day,
    dayInWeek: (state.day - 1) % 7,
    progress,
    open: state.phase === 'day',
    orders: state.customers.map((c) => {
      const tag = ticketTag(c, snobs);
      return { id: c.id, drink: c.drink, patience: c.patienceMax > 0 ? c.patienceLeft / c.patienceMax : 0, ...(tag ? { tag } : {}), ...(c.stage === 'pickup' ? { pickup: true as const } : {}) };
    }),
    crew: crewOf(state, me),
    holding: player?.holding ?? null,
    ...(podsOnly(state) ? { pods: true } : {}),
    ...(state.gear === true ? { gear: true } : {}),
    meName: player?.role ? `${ROLES[player.role].icon} ${player.name} the ${ROLES[player.role].name}` : (player?.name ?? ''),
    hint: handHint(state, me),
    closeEarly: closeEarlyVM(state, me),
    ...(state.branch ? { call: callVM(state, me) } : {}),
  };
}

/** Keys for the HUD's independently rebuilt blocks (everything except per-tick values). */
export const ordersKey = (l: HudLive) => l.orders.map((o) => `${o.id}${o.drink}${o.patience < 0.28 ? '!' : ''}${o.tag ? `#${o.tag.text}` : ''}${o.pickup ? '^' : ''}`).join(',');
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
  /** P4 B2: e.g. "Week 2 of 4 · $12 of $30" while a season runs. */
  season?: string;
}

export function nightExtras(state: GameState, me: PlayerId): NightExtras {
  const last = state.days.length ? state.days[state.days.length - 1] : null;
  const total = state.settings.nightLengthSec * TICK_RATE;
  const sn = seasonNow(state);
  return {
    day: state.day,
    weekday: WEEKDAYS[(state.day - 1) % 7],
    left: total > 0 ? Math.max(0, Math.min(1, state.phaseTicksLeft / total)) : 0,
    served: last?.served ?? 0,
    lost: (last?.lost ?? 0) + (last?.turnedAway ?? 0),
    reputation: state.reputation,
    crew: crewOf(state, me),
    bought: state.boughtTonight.map((id) => ({ itemId: id, name: catalogueById[id]?.name ?? id, category: catalogueById[id]?.category ?? 'oddball' })),
    ...(sn ? { season: `Week ${sn.week} of ${sn.of} · ${money(sn.soFar)} of ${money(sn.target)}` } : {}),
  };
}

export const nightExtrasKey = (n: NightExtras) =>
  `${n.day}|${n.served}|${n.lost}|${n.reputation}|${crewKey({ crew: n.crew } as HudLive)}|${n.bought.map((b) => b.itemId).join(',')}`;

export function categoryOf(itemId: string): CatalogueItem['category'] {
  return catalogueById[itemId]?.category ?? 'oddball';
}
