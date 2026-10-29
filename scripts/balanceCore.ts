/**
 * Headless balance tester: plays whole weeks with stand-ins and bots, no browser.
 * No Node APIs here, so tsc checks it through src/balance.test.ts; scripts/balance.ts is the CLI shell.
 */
import { CATALOGUE } from '../src/data/catalogue';
import { ECONOMY } from '../src/data/economy';
import { SCENARIOS } from '../src/data/scenarios';
import { addStandIns } from '../src/sim/bots/roster';
import { secondsToTicks } from '../src/sim/constants';
import { restockCost } from '../src/sim/night';
import { createRun } from '../src/sim/run';
import { step } from '../src/sim/step';
import type { BotSkill, DrinkId, EventKind, GameState, Pace, PlayerInput, ScenarioId, SupplyId } from '../src/sim/types';

export interface BalanceOptions {
  weeks: number; seed: number; humans: number; bots: number; skill: BotSkill; pace: Pace;
  scenario: ScenarioId | 'random'; menus: DrinkId[][]; compare: boolean; json: boolean; daySeconds: number;
}
export interface DayRow { day: number; cash: number; served: number; lost: number; turnedAway: number; wasted: number; botMistakes: number; events: EventKind[] }
export interface WeekResult { seed: number; menu: DrinkId[]; days: DayRow[]; finalCash: number; bankrupt: boolean; drinks: Record<DrinkId, number> }
export interface BalanceReport { options: BalanceOptions; weeks: WeekResult[]; warnings: string[] }

export class UsageError extends Error {}

const DRINKS: DrinkId[] = ['espresso', 'latte', 'coldBrew'];
const SUPPLIES: SupplyId[] = ['beans', 'milk', 'concentrate'];
const SCENARIO_IDS = SCENARIOS.map((s) => s.id);
const RESTOCK_TARGET: Record<SupplyId, number> = { beans: 40, milk: 20, concentrate: 30 };
const NIGHT_SECONDS = 30;
const TESTER = 'tester';
const NO_BARISTAS = 'No baristas: nothing will be served.';

export const USAGE = `Usage: npm run balance -- [options]
  --weeks N          weeks to play, each an independent run (1-1000, default 10)
  --seed N           seed of the first week; week i uses seed+i (default 1)
  --humans N         stand-in human baristas (0-4, default 2)
  --bots N           ordinary bots (0-3, default 1); humans + bots <= 4
  --skill N          bot skill 1-5 (default 3)
  --pace N           pace 1-5 (default 3)
  --scenario ID      random | ${SCENARIO_IDS.join(' | ')} (default random)
  --menu M           all | a drink | comma list of ${DRINKS.join(',')} (default all)
  --compare menus    run all, espresso, latte, coldBrew on the same seeds (overrides --menu)
  --day N            day length in seconds (30-600, default 150)
  --json             print the report as JSON
  --help             show this text`;

export function defaultOptions(): BalanceOptions {
  return {
    weeks: 10, seed: 1, humans: 2, bots: 1, skill: 3, pace: 3, scenario: 'random',
    menus: [[...DRINKS]], compare: false, json: false, daySeconds: 150,
  };
}

function intArg(flag: string, raw: string | undefined, lo: number, hi: number): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) throw new UsageError(`${flag} needs a whole number`);
  const n = Number(raw);
  if (n < lo || n > hi) throw new UsageError(`${flag} must be between ${lo} and ${hi}`);
  return n;
}

function parseMenu(raw: string | undefined): DrinkId[] {
  if (raw === undefined) throw new UsageError('--menu needs a value');
  if (raw === 'all') return [...DRINKS];
  const parts = raw.split(',').map((s) => s.trim());
  for (const p of parts) if (!DRINKS.includes(p as DrinkId)) throw new UsageError(`unknown drink '${p}'`);
  return DRINKS.filter((d) => parts.includes(d));
}

/** Parse CLI arguments. Throws UsageError on anything it does not understand. */
export function parseArgs(argv: string[]): BalanceOptions {
  const o = defaultOptions();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => argv[++i];
    switch (flag) {
      case '--weeks': o.weeks = intArg(flag, next(), 1, 1000); break;
      case '--seed': o.seed = intArg(flag, next(), 0, 0xffffffff); break;
      case '--humans': o.humans = intArg(flag, next(), 0, 4); break;
      case '--bots': o.bots = intArg(flag, next(), 0, ECONOMY.bots.names.length); break;
      case '--skill': o.skill = intArg(flag, next(), 1, 5) as BotSkill; break;
      case '--pace': o.pace = intArg(flag, next(), 1, 5) as Pace; break;
      case '--day': o.daySeconds = intArg(flag, next(), 30, 600); break;
      case '--json': o.json = true; break;
      case '--menu': o.menus = [parseMenu(next())]; break;
      case '--scenario': {
        const v = next();
        if (v !== 'random' && !SCENARIO_IDS.includes(v as ScenarioId)) throw new UsageError(`unknown scenario '${v ?? ''}'`);
        o.scenario = v as ScenarioId | 'random';
        break;
      }
      case '--compare': {
        if (next() !== 'menus') throw new UsageError("--compare takes 'menus'");
        o.compare = true;
        break;
      }
      default: throw new UsageError(`unknown option '${flag}'`);
    }
  }
  if (o.humans + o.bots > 4) throw new UsageError('humans + bots must be at most 4');
  if (o.compare) o.menus = [[...DRINKS], ['espresso'], ['latte'], ['coldBrew']];
  return o;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Tonight's tester inputs: top supplies up to the targets, then buy the cheapest sensible permanent card. */
export function nightInputs(state: GameState): PlayerInput[] {
  const inputs: PlayerInput[] = [];
  let cash = state.cash;
  const onMenu = DRINKS.filter((d) => state.menu[d]);
  for (const supply of SUPPLIES) {
    if (!onMenu.some((d) => ECONOMY.drinkSupplies[d].includes(supply))) continue;
    let packs = Math.ceil((RESTOCK_TARGET[supply] - state.supplies[supply]) / ECONOMY.packs[supply].size);
    while (packs > 0 && restockCost(state, supply, packs) > cash) packs -= 1;
    if (packs <= 0) continue;
    cash = round2(cash - restockCost(state, supply, packs));
    inputs.push({ kind: 'restock', playerId: TESTER, supply, packs });
  }
  const cards = CATALOGUE.filter((c) => state.hand.includes(c.id) && c.duration === 'permanent' && c.cost * 2 < cash);
  const cheapest = cards.reduce<(typeof cards)[number] | null>((best, c) => (!best || c.cost < best.cost ? c : best), null);
  if (cheapest) inputs.push({ kind: 'buy', playerId: TESTER, itemId: cheapest.id });
  return inputs;
}

/** Most ticks a week can take: seven nights, days and closing graces, plus slack. Exceeding it means a stuck sim. */
function tickCap(daySeconds: number): number {
  const perDay = secondsToTicks(daySeconds) + secondsToTicks(ECONOMY.closingGraceSeconds) + secondsToTicks(NIGHT_SECONDS);
  return ECONOMY.scoredWeekDays * perDay + secondsToTicks(60);
}

/** Play one independent week on `seed` with `menu`, as the absent host 'tester'. */
export function runWeek(opts: BalanceOptions, seed: number, menu: DrinkId[]): WeekResult {
  let state = createRun({
    seed, hostId: TESTER, players: [],
    settings: { bots: opts.bots, botSkill: opts.skill, pace: opts.pace, dayLengthSec: opts.daySeconds, nightLengthSec: NIGHT_SECONDS },
  });
  addStandIns(state, opts.humans);
  if (opts.scenario !== 'random') state.scenario = opts.scenario;
  for (const d of DRINKS) state.menu[d] = menu.includes(d);

  const days: DayRow[] = [];
  const cap = tickCap(opts.daySeconds);
  let lastPhase: GameState['phase'] | null = null;
  let ticks = 0;
  while (state.phase !== 'weekEnd' && state.phase !== 'ended') {
    if (++ticks > cap) throw new Error(`week on seed ${seed} did not finish within ${cap} ticks`);
    const inputs = state.phase === 'night' && lastPhase !== 'night' ? nightInputs(state) : [];
    lastPhase = state.phase;
    state = step(state, inputs);
    for (const d of state.days.slice(days.length)) {
      days.push({
        day: d.day, cash: state.cash, served: d.served, lost: d.lost, turnedAway: d.turnedAway,
        wasted: d.wasted ?? 0, botMistakes: d.botMistakes ?? 0, events: [...(d.events ?? [])],
      });
    }
  }
  const drinks: Record<DrinkId, number> = { espresso: 0, latte: 0, coldBrew: 0 };
  for (const d of state.days) for (const k of DRINKS) drinks[k] += d.drinks?.[k] ?? 0;
  return { seed, menu: [...menu], days, finalCash: state.cash, bankrupt: state.bankrupt, drinks };
}

/** Every week for every menu, on seeds seed .. seed+weeks-1. */
export function runBalance(opts: BalanceOptions): BalanceReport {
  const warnings = opts.humans === 0 && opts.bots === 0 ? [NO_BARISTAS] : [];
  const weeks: WeekResult[] = [];
  for (const menu of opts.menus) for (let i = 0; i < opts.weeks; i++) weeks.push(runWeek(opts, opts.seed + i, menu));
  return { options: opts, weeks, warnings };
}

/** Aligned columns: text columns (`left`) padded on the right, numbers on the left. */
function table(header: string[], rows: string[][], left: number[] = [0]): string {
  const widths = header.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c].length)));
  const line = (r: string[]) => r.map((v, c) => (left.includes(c) ? v.padEnd(widths[c]) : v.padStart(widths[c]))).join('  ').trimEnd();
  return [line(header), ...rows.map(line)].join('\n');
}

const money = (n: number) => n.toFixed(2);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const menuName = (m: DrinkId[]) => (m.length === DRINKS.length ? 'all' : m.join(',') || 'none');
const lossRate = (w: WeekResult) => {
  const served = w.days.reduce((n, d) => n + d.served, 0);
  const lost = w.days.reduce((n, d) => n + d.lost, 0);
  return served + lost === 0 ? 0 : lost / (served + lost);
};
const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

function formatWeek(w: WeekResult, index: number): string {
  const sum = (k: 'served' | 'lost' | 'turnedAway' | 'wasted' | 'botMistakes') => String(w.days.reduce((n, d) => n + d[k], 0));
  const rows = w.days.map((d) => [
    String(d.day), money(d.cash), String(d.served), String(d.lost), String(d.turnedAway), String(d.wasted), String(d.botMistakes),
    d.events.join(',') || '-',
  ]);
  rows.push(['total', money(w.finalCash), sum('served'), sum('lost'), sum('turnedAway'), sum('wasted'), sum('botMistakes'), '']);
  const head = `Week ${index + 1}  seed ${w.seed}  menu ${menuName(w.menu)}${w.bankrupt ? '  BANKRUPT' : ''}`;
  const days = table(['day', 'cash', 'served', 'lost', 'away', 'wasted', 'mistakes', 'events'], rows, [0, 7]);
  const drinks = table(['drink', 'served'], DRINKS.map((d) => [d, String(w.drinks[d])]));
  return [head, days, drinks].join('\n');
}

/** Human-readable tables, or JSON when the options ask for it. */
export function formatReport(report: BalanceReport): string {
  if (report.options.json) return JSON.stringify(report, null, 2);
  const o = report.options;
  const out: string[] = report.warnings.map((w) => `Warning: ${w}`);
  out.push(
    `Balance: ${o.weeks} week(s) from seed ${o.seed}, humans ${o.humans}, bots ${o.bots}, skill ${o.skill}, pace ${o.pace}, ` +
      `scenario ${o.scenario}, day ${o.daySeconds}s`,
  );
  if (o.compare) {
    const rows = o.menus.map((m) => {
      const ws = report.weeks.filter((w) => menuName(w.menu) === menuName(m));
      return [menuName(m), money(mean(ws.map((w) => w.finalCash))), pct(mean(ws.map(lossRate))), String(ws.filter((w) => w.bankrupt).length)];
    });
    out.push('', table(['menu', 'mean cash', 'loss rate', 'bankrupt'], rows));
    return out.join('\n');
  }
  report.weeks.forEach((w, i) => out.push('', formatWeek(w, i)));
  const ws = report.weeks;
  out.push(
    '',
    `Overall: mean final cash ${money(mean(ws.map((w) => w.finalCash)))}, loss rate ${pct(mean(ws.map(lossRate)))}, ` +
      `bankrupt ${ws.filter((w) => w.bankrupt).length}/${ws.length}`,
  );
  return out.join('\n');
}

/** CLI entry: 0 on success, 2 with usage text on bad options. Other errors propagate. */
export function main(argv: string[]): { output: string; code: number } {
  if (argv.includes('--help') || argv.includes('-h')) return { output: USAGE, code: 0 };
  let opts: BalanceOptions;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) return { output: `Error: ${e.message}\n\n${USAGE}`, code: 2 };
    throw e;
  }
  return { output: formatReport(runBalance(opts)), code: 0 };
}
