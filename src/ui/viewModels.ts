import { catalogueById } from '../data/catalogue';
import { ECONOMY } from '../data/economy';
import { scenarioById } from '../data/scenarios';
import { TICK_RATE } from '../sim/constants';
import { availableDrinks } from '../sim/customers';
import { describeEffects } from '../sim/describe';
import { computeModifiers, weekOf } from '../sim/effects';
import { restockCost } from '../sim/night';
import { scoreRun } from '../sim/score';
import type { DayStats, DrinkId, GameState, Phase, PlayerId, RunRecord, SupplyId } from '../sim/types';

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
}

export interface NightVM {
  clock: string;
  cash: string;
  takings: { sales: string; tips: string; rent: string; profit: string } | null;
  hand: HandCardVM[];
  restock: { supply: SupplyId; count: number; packSize: number; packCost: string; affordable: boolean }[];
  ready: { id: PlayerId; name: string; ready: boolean }[];
  meReady: boolean;
}

export function nightViewModel(state: GameState, me: PlayerId): NightVM {
  const last = state.days[state.days.length - 1];
  const takings =
    state.days.length > 0 && state.days.length === state.day - 1
      ? { sales: money(last.sales), tips: money(last.tips), rent: money(last.rent), profit: money(profitOf(last)) }
      : null;
  return {
    clock: clockFor(state.phaseTicksLeft),
    cash: money(state.cash),
    takings,
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
      };
    }),
    restock: SUPPLIES.map((supply) => {
      const cost = restockCost(state, supply, 1);
      return { supply, count: state.supplies[supply], packSize: ECONOMY.packs[supply].size, packCost: money(cost), affordable: state.cash >= cost };
    }),
    ready: state.players.map((p) => ({ id: p.id, name: p.name, ready: state.ready.includes(p.id) })),
    meReady: state.ready.includes(me),
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
  };
}

export interface WeekEndVM {
  score: string;
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
}

export function titleViewModel(history: RunRecord[], snapshot: GameState | null): TitleVM {
  return {
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
  const { clock: _clock, cash: _cash, ...rest } = vm;
  return JSON.stringify(rest);
}

/** Everything about the HUD except the clock and cash. */
export function hudStructureKey(vm: HudVM): string {
  const { clock: _clock, cash: _cash, ...rest } = vm;
  return JSON.stringify(rest);
}
