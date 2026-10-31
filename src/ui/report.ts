/**
 * P4 B3: the manager's day report on the night screen. Read-only: it turns yesterday's DayStats
 * (plus the day before, for trends) into the lines a manager would want before staffing and
 * pricing: takings vs. wages, the money drinks, the wait, who did what, and one or two notes.
 */
import { DRINK_INFO } from '../data/drinks';
import { TICK_RATE } from '../sim/constants';
import { profitOf } from '../sim/profit';
import type { DayStats, DrinkId, GameState } from '../sim/types';

export interface ReportVM {
  day: number;
  served: number;
  walked: number;
  walkedPct: number;
  /** Average seconds from arrival to the hand-off; null on days without the tally (old saves). */
  waitSec: number | null;
  /** Change in the average wait vs. the day before, in seconds (null without both days). */
  waitDelta: number | null;
  takings: number;
  wages: number;
  wagePct: number;
  rent: number;
  profit: number;
  drinks: { drink: DrinkId; name: string; icon: string; cups: number; takings: number; pct: number }[];
  crew: { id: string; name: string; bot: boolean; serves: number; takings: number; pct: number }[];
  notes: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const avgWait = (d: DayStats | undefined) => (d && d.waitTicks !== undefined && d.served > 0 ? d.waitTicks / d.served / TICK_RATE : null);

/** The report for the last finished day, or null before day 1 ends. */
export function reportViewModel(state: GameState): ReportVM | null {
  const d = state.days[state.days.length - 1];
  if (!d) return null;
  const prev = state.days[state.days.length - 2];
  const takings = r2(d.sales + d.tips);
  const walked = d.lost + (d.turnedAway ?? 0);
  const walkIns = walked + d.served;
  const wages = d.wages ?? 0;
  const wait = avgWait(d);
  const pw = avgWait(prev);
  const byDrink = d.takingsByDrink ?? {};
  const drinks = (Object.entries(d.drinks ?? {}) as [DrinkId, number][])
    .filter(([, n]) => n > 0)
    .map(([drink, cups]) => {
      const t = r2(byDrink[drink] ?? 0);
      return { drink, name: DRINK_INFO[drink]?.short ?? drink, icon: DRINK_INFO[drink]?.icon ?? '☕', cups, takings: t, pct: takings > 0 ? Math.round((100 * t) / takings) : 0 };
    })
    .sort((a, b) => b.takings - a.takings || b.cups - a.cups)
    .slice(0, 4);
  const crew = Object.entries(d.byPlayer ?? {})
    .map(([id, b]) => {
      const p = state.players.find((x) => x.id === id);
      return { id, name: p?.name ?? 'Someone', bot: !!p?.bot, serves: b.serves, takings: r2(b.takings), pct: d.served ? Math.round((100 * b.serves) / d.served) : 0 };
    })
    .sort((a, b) => b.serves - a.serves || a.name.localeCompare(b.name));
  const vm: ReportVM = {
    day: d.day,
    served: d.served,
    walked,
    walkedPct: walkIns ? Math.round((100 * walked) / walkIns) : 0,
    waitSec: wait === null ? null : Math.round(wait),
    waitDelta: wait !== null && pw !== null ? Math.round(wait - pw) : null,
    takings,
    wages,
    wagePct: takings > 0 ? Math.round((100 * wages) / takings) : 0,
    rent: d.rent,
    profit: profitOf(d),
    drinks,
    crew,
    notes: [],
  };
  vm.notes = notesFor(vm, d);
  return vm;
}

/** At most two plain-English notes, worst problem first. */
function notesFor(vm: ReportVM, d: DayStats): string[] {
  const out: string[] = [];
  if (d.soldOutWalkouts) out.push(`${d.soldOutWalkouts} left at a sold-out board. Buy more stock tonight.`);
  if (d.priceWalkouts) out.push(`${d.priceWalkouts} left over the price. A Strategist, or a small cut, wins them back.`);
  if (vm.walkedPct >= 25) out.push(`About ${vm.walkedPct}% of walk-ins left without a drink. Faster hand-offs, another barista, or quicker gear win them back.`);
  if (vm.wages > 0 && vm.wagePct >= 35) out.push(`Wages took ${vm.wagePct}% of takings. A busier day, or one fewer hire, fixes that.`);
  if (vm.waitDelta !== null && vm.waitDelta >= 5) out.push(`Waits were ${vm.waitDelta}s longer than the day before.`);
  const top = vm.drinks[0];
  if (top && top.pct >= 50 && vm.drinks.length > 1) out.push(`${top.name} made ${top.pct}% of the money. It can probably take a higher price.`);
  if (!out.length) out.push(vm.profit >= 0 ? 'A tidy day. Same again tomorrow?' : 'A quiet day. Check tomorrow\'s paper and stock for it.');
  return out.slice(0, 2);
}
