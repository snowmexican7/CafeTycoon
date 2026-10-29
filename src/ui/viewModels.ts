import { catalogueById } from '../data/catalogue';
import { ECONOMY } from '../data/economy';
import { scenarioById } from '../data/scenarios';
import { TICK_RATE, secondsToTicks } from '../sim/constants';
import { availableDrinks } from '../sim/customers';
import { describeEffects } from '../sim/describe';
import { EVENT_LABELS } from '../sim/events';
import { computeModifiers, weekOf } from '../sim/effects';
import { restockCost } from '../sim/night';
import { scoreRun } from '../sim/score';
import { cutsIntoRent, nightWarnings, type NightWarning } from './nightWarnings';
import type { PeerStatus } from '../net/peerSession';
import type { Member } from '../net/protocol';
import type { DayStats, DrinkId, EventKind, GameState, MessKind, Phase, PlayerId, RogueStage, RunRecord, SupplyId } from '../sim/types';
import type { RoomRecord } from '../storage/roomStore';

const DRINKS: DrinkId[] = ['espresso', 'latte', 'coldBrew'];
const SUPPLIES: SupplyId[] = ['beans', 'milk', 'concentrate'];

/** '$1,234.50' or '-$20.00'. */
export function money(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}$${abs}`;
}

function stars(rep: number): string {
  return `${rep.toFixed(1)}★`;
}

function dayLabelFor(day: number): string {
  const week = weekOf(day);
  return week > 1 ? `Day ${day} (week ${week})` : `Day ${day}`;
}

function clockFor(ticks: number): string {
  const total = Math.max(0, Math.ceil(ticks / TICK_RATE));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Espresso Easter egg receipt lines; absent on a normal day. */
function espressoLines(d: DayStats): { ambulance?: string; tabPaid?: string } {
  return { ...(d.ambulance ? { ambulance: money(d.ambulance) } : {}), ...(d.debtPaid ? { tabPaid: money(d.debtPaid) } : {}) };
}

function profitOf(d: DayStats): number {
  return Math.round((d.sales + d.tips - d.rent) * 100) / 100;
}

export interface HudVM {
  dayLabel: string;
  clock: string;
  cash: string;
  reputation: string;
  supplies: { id: SupplyId; count: number }[];
  menu: { id: DrinkId; price: string; available: boolean }[];
  notes: string[];
  phase: Phase;
  seed: number;
  pass?: { item: DrinkId; secondsLeft: number }[];
  events?: { kind: EventKind; label: string; secondsLeft: number }[];
  messes?: { id: number; kind: MessKind; x: number; y: number; amount: number }[];
  cleanliness?: number;
  mop?: { x: number; y: number; heldBy: string | null };
  stuns?: { playerId: string; secondsLeft: number }[];
  cleaning?: { playerId: string; secondsLeft: number }[];
  rogue?: { stage: RogueStage; drink: DrinkId; x: number; y: number; secondsLeft: number; name?: string };
}

/** Track A fills this: messes, cleanliness, the mop, stuns and cleaning. */
export function floorHud(_state: GameState): Pick<HudVM, 'messes' | 'cleanliness' | 'mop' | 'stuns' | 'cleaning'> {
  return {};
}

export function hudViewModel(state: GameState): HudVM {
  const mods = computeModifiers(state);
  const available = availableDrinks(state);
  return {
    dayLabel: dayLabelFor(state.day),
    clock: clockFor(state.phaseTicksLeft),
    cash: money(state.cash),
    reputation: stars(state.reputation),
    supplies: SUPPLIES.map((id) => ({ id, count: state.supplies[id] })),
    menu: DRINKS.map((id) => ({ id, price: money(ECONOMY.prices[id] * mods.price[id]), available: available.includes(id) })),
    notes: state.morningNotes,
    phase: state.phase,
    seed: state.seed,
    pass: state.pass.map((i) => ({ item: i.item, secondsLeft: Math.ceil(i.ticksLeft / 60) })),
    events: state.events.map((e) => ({ kind: e.kind, label: EVENT_LABELS[e.kind], secondsLeft: Math.ceil(e.ticksLeft / 60) })),
    ...floorHud(state),
    ...rogueHud(state),
  };
}

export interface HandCardVM {
  itemId: string;
  name: string;
  cost: string;
  effect: string;
  flavor: string;
  affordable: boolean;
  duration: 'permanent' | 'tomorrow';
  /** Affordable, but buying it leaves less than tomorrow's rent in the till. */
  cutsRent?: boolean;
}

export interface NightVM {
  clock: string;
  cash: string;
  takings: { sales: string; tips: string; rent: string; profit: string; ambulance?: string; tabPaid?: string } | null;
  /** Espresso Easter egg: unpaid hospital tab, if any. */
  tab?: string;
  hand: HandCardVM[];
  restock: { supply: SupplyId; count: number; packSize: number; packCost: string; affordable: boolean }[];
  ready: { id: PlayerId; name: string; ready: boolean }[];
  meReady: boolean;
  menu?: { drink: DrinkId; on: boolean }[];
  /** Heads-ups before Ready: short on rent, out of or low on a supply. Never blocks. */
  warnings: NightWarning[];
}

export function nightViewModel(state: GameState, me: PlayerId): NightVM {
  const last = state.days[state.days.length - 1];
  const takings =
    state.days.length > 0 && state.days.length === state.day - 1
      ? { sales: money(last.sales), tips: money(last.tips), rent: money(last.rent), profit: money(profitOf(last)), ...espressoLines(last) }
      : null;
  return {
    clock: clockFor(state.phaseTicksLeft),
    cash: money(state.cash),
    takings,
    ...(state.debt ? { tab: money(state.debt) } : {}),
    hand: state.hand.map((id) => {
      const item = catalogueById[id];
      return {
        itemId: id,
        name: item.name,
        cost: money(item.cost),
        effect: describeEffects(item.effects),
        flavor: item.flavor,
        affordable: state.cash >= item.cost,
        duration: item.duration,
        ...(cutsIntoRent(state, item.cost) ? { cutsRent: true } : {}),
      };
    }),
    restock: SUPPLIES.map((supply) => {
      const cost = restockCost(state, supply, 1);
      return { supply, count: state.supplies[supply], packSize: ECONOMY.packs[supply].size, packCost: money(cost), affordable: state.cash >= cost };
    }),
    ready: state.players.filter((p) => !p.bot).map((p) => ({ id: p.id, name: p.name, ready: state.ready.includes(p.id) })),
    meReady: state.ready.includes(me),
    menu: DRINKS.map((drink) => ({ drink, on: state.menu[drink] })),
    warnings: nightWarnings(state),
  };
}

export interface ClosingVM {
  dayLabel: string;
  served: number;
  lost: number;
  turnedAway: number;
  sales: string;
  tips: string;
  rent: string;
  profit: string;
  reputationBefore: string;
  reputationAfter: string;
  /** Espresso Easter egg: today's ambulance ride, tab paid off today, and what's still owed. */
  ambulance?: string;
  tabPaid?: string;
  tab?: string;
  /** Cash in the till after closing (matches the HUD). */
  cash: string;
  /** The run score so far: cash minus starting cash. */
  profitVsStart: string;
  startingCash: string;
}

/** `before` is the last snapshot of the closing phase; `after` is the first of the next phase. */
export function closingViewModel(before: GameState, after: GameState): ClosingVM {
  const d = after.days[after.days.length - 1] ?? before.today;
  return {
    dayLabel: dayLabelFor(d.day),
    served: d.served,
    lost: d.lost,
    turnedAway: d.turnedAway,
    sales: money(d.sales),
    tips: money(d.tips),
    rent: money(d.rent),
    profit: money(profitOf(d)),
    reputationBefore: stars(before.reputation),
    reputationAfter: stars(after.reputation),
    ...espressoLines(d),
    ...(after.debt ? { tab: money(after.debt) } : {}),
    cash: money(after.cash),
    profitVsStart: money(scoreRun(after)),
    startingCash: money(after.startingCash),
  };
}

export interface WeekEndVM {
  /** Profit vs. start (cash minus starting cash): the run's score. */
  score: string;
  /** Cash in the till, the same number the HUD shows. */
  cash: string;
  startingCash: string;
  /** Espresso Easter egg: unpaid hospital tab, if any. */
  tab?: string;
  daysCompleted: number;
  customersServed: number;
  bestDay: { day: number; profit: string } | null;
  itemsBought: string[];
  seed: number;
  isHost: boolean;
  bankrupt: boolean;
}

export function weekEndViewModel(state: GameState, me: PlayerId): WeekEndVM {
  let best: DayStats | null = null;
  for (const d of state.days) if (best === null || profitOf(d) > profitOf(best)) best = d;
  return {
    score: money(scoreRun(state)),
    cash: money(state.cash),
    startingCash: money(state.startingCash),
    ...(state.debt ? { tab: money(state.debt) } : {}),
    daysCompleted: state.days.length,
    customersServed: state.days.reduce((sum, d) => sum + d.served, 0),
    bestDay: best ? { day: best.day, profit: money(profitOf(best)) } : null,
    itemsBought: state.owned.map((o) => catalogueById[o.itemId]?.name ?? o.itemId),
    seed: state.seed,
    isHost: me === state.hostId,
    bankrupt: state.bankrupt,
  };
}

export interface TitleVM {
  history: { date: string; score: string; days: number; scenario: string; players: string }[];
  canResume: boolean;
  rejoinCode: string | null;
}

export function titleViewModel(history: RunRecord[], snapshot: GameState | null, room: RoomRecord | null = null): TitleVM {
  return {
    rejoinCode: room?.role === 'peer' ? room.code : null,
    history: history.map((r) => ({
      date: r.date,
      score: money(r.score),
      days: r.daysCompleted,
      scenario: scenarioById[r.scenario]?.name ?? r.scenario,
      players: r.players.join(', '),
    })),
    canResume: snapshot !== null && snapshot.phase !== 'ended',
  };
}

/** Everything about the night screen except the two values that change every snapshot. */
export function nightStructureKey(vm: NightVM): string {
  const { clock: _clock, cash: _cash, warnings, ...rest } = vm;
  // warning text carries dollar amounts that move with cash; it is patched, so only ids and levels key a rebuild
  return JSON.stringify({ ...rest, warnings: warnings.map((w) => `${w.id}:${w.level}`) });
}

/** Everything about the HUD except the clock and cash. */
export function hudStructureKey(vm: HudVM): string {
  const { clock: _clock, cash: _cash, pass, events, messes, cleanliness: _cleanliness, mop, stuns, cleaning, rogue, ...rest } = vm;
  // per-tick values are patched, not rebuilt: the pass keys on its items only
  return JSON.stringify({
    ...rest,
    pass: pass?.map((i) => i.item),
    events: events?.map((e) => e.kind),
    messes: messes?.map((m) => [m.id, m.kind, m.x, m.y]),
    mop: mop?.heldBy,
    stuns: stuns?.map((x) => x.playerId),
    cleaning: cleaning?.map((x) => x.playerId),
    rogue: rogue && { stage: rogue.stage, drink: rogue.drink, name: rogue.name },
  });
}

export interface LobbyVM {
  code: string;
  members: string[];
  isHost: boolean;
  canStart: boolean;
  statusText: string;
}

export function lobbyViewModel(input: { code: string; members: Member[]; isHost: boolean; status: PeerStatus | 'hosting'; started: boolean }): LobbyVM {
  const { status, started } = input;
  let statusText = '';
  if (status === 'hosting') statusText = started ? 'Room open. Friends can still join.' : 'Share the code. Start when everyone is in.';
  else if (status === 'connecting') statusText = 'Finding the host…';
  else if (status === 'connected') statusText = started ? '' : 'Waiting for the host to start…';
  else if (status === 'hostAway') statusText = 'Waiting for the host to come back…';
  else if (status === 'rejected') statusText = 'Version mismatch. Both of you reload.';
  else if (status === 'failed') statusText = 'Could not connect.';
  return {
    code: input.code,
    members: input.members.map((m) => m.name),
    isHost: input.isHost,
    canStart: input.isHost && !started,
    statusText,
  };
}

export interface ReceiptVM {
  wasted: number;
  fines: string;
  bonus: string;
  inspection: 'pass' | 'fail' | null;
  events: string[];
  botMistakes: number;
  lostRegulars: number;
  rogues: number;
  drinks: { drink: DrinkId; count: number }[];
}

/** The closing receipt's extra lines; every phase-2 field is optional on old days. */
export function receiptViewModel(d: DayStats): ReceiptVM {
  return {
    wasted: d.wasted ?? 0,
    fines: money(d.fines ?? 0),
    bonus: money(d.bonus ?? 0),
    inspection: d.inspection ?? null,
    events: (d.events ?? []).map((k) => EVENT_LABELS[k]),
    botMistakes: d.botMistakes ?? 0,
    lostRegulars: d.lostRegulars ?? 0,
    rogues: d.rogues ?? 0,
    drinks: DRINKS.map((drink) => ({ drink, count: d.drinks?.[drink] ?? 0 })),
  };
}

/** The rogue customer on the floor: where they are, and seconds left making (or waiting for a player to move). */
export function rogueHud(state: GameState): Pick<HudVM, 'rogue'> {
  const r = state.rogue;
  if (!r) return {};
  let secondsLeft = 0;
  if (r.stage === 'making') secondsLeft = Math.ceil(r.ticksLeft / TICK_RATE);
  else if (r.stage === 'waiting') secondsLeft = Math.ceil((secondsToTicks(ECONOMY.rogue.waitSeconds) - r.waitTicks) / TICK_RATE);
  return {
    rogue: { stage: r.stage, drink: r.drink, x: r.pos.x, y: r.pos.y, secondsLeft, ...(r.name !== undefined ? { name: r.name } : {}) },
  };
}
