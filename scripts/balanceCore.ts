import { CHECKOUT, CHECKOUT_IDS, checkoutOf, nextCheckout } from '../src/sim/checkout';
import type { CheckoutId } from '../src/sim/types';
import { ADS } from '../src/sim/ads';
import { judgePitch } from '../src/sim/pitch';
import type { AdId, PitchKind } from '../src/sim/types';
import { knownStars, TWISTS, type TwistId } from '../src/sim/taste';
import { DRINK_IDS } from '../src/data/drinks';
import { zeroDrinks } from '../src/sim/tally';
import { SUPPLY_IDS, menuDrinks } from '../src/sim/unlocks';
/**
 * Headless balance tester: plays whole weeks with stand-ins and bots, no browser.
 * No Node APIs here, so tsc checks it through src/balance.test.ts; scripts/balance.ts is the CLI shell.
 */
import { CATALOGUE } from '../src/data/catalogue';
import { ECONOMY } from '../src/data/economy';
import { SCENARIOS } from '../src/data/scenarios';
import { addStandIns } from '../src/sim/bots/roster';
import { secondsToTicks } from '../src/sim/constants';
import { rerollCost, restockCost } from '../src/sim/night';
import { CARD_SETS } from '../src/data/cardSets';
import { setCounts } from '../src/sim/effects';
import { forecastOf } from '../src/sim/forecast';
import { isDownside } from '../src/sim/describe';
import type { CardPath, CatalogueItem } from '../src/sim/types';
import { createRun } from '../src/sim/run';
import { step } from '../src/sim/step';
import { scoreRun } from '../src/sim/score';
import type { BotSkill, DrinkId, EventKind, GameState, Pace, PlayerInput, ScenarioId, SupplyId } from '../src/sim/types';

/** How the tester shops at night: `simple` is the spec's original rule; `smart` plays like a sensible crew (B11). */
export type Policy = 'simple' | 'smart' | 'speed' | 'quality' | 'reach' | 'none' | 'taste' | 'promo' | 'kiosk' | 'squarely';
export const POLICIES: Policy[] = ['simple', 'smart', 'speed', 'quality', 'reach', 'none', 'taste', 'promo', 'kiosk', 'squarely'];

export interface BalanceOptions {
  weeks: number; seed: number; humans: number; bots: number; skill: BotSkill; pace: Pace;
  scenario: ScenarioId | 'random'; menus: DrinkId[][]; compare: boolean; json: boolean; daySeconds: number;
  policies: Policy[];
  /** Print only the aggregate summary (B11), not every week's table. */
  summary: boolean;
}
export interface DayRow {
  day: number; cash: number; served: number; lost: number; turnedAway: number; wasted: number; botMistakes: number; events: EventKind[];
  forecast?: string; challenges?: number; challengesWon?: number;
}
export interface WeekResult {
  seed: number; menu: DrinkId[]; days: DayRow[]; finalCash: number; bankrupt: boolean; drinks: Record<DrinkId, number>;
  policy?: Policy; bought?: string[]; rerolls?: number;
  /** B11: the week's score (cash profit plus fittings at resale). */
  score?: number;
}
export interface BalanceReport { options: BalanceOptions; weeks: WeekResult[]; warnings: string[] }

export class UsageError extends Error {}

const DRINKS: DrinkId[] = DRINK_IDS;
const SUPPLIES: SupplyId[] = SUPPLY_IDS;
const SCENARIO_IDS = SCENARIOS.map((s) => s.id);
const RESTOCK_TARGET: Record<SupplyId, number> = { beans: 40, milk: 20, concentrate: 30, flavour: 10, pastry: 6 };
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
  --compare policies run every night policy on the same seeds (overrides --policy)
  --policy P         night shopping: smart (default) | simple | speed | quality | reach | none | taste (smart + twists and a signature) | promo (taste + an ad and a pitch every night) | kiosk / squarely (smart + install that checkout, and the ones before it, once there's $60 spare)
                     (simple = cheapest permanent card; speed/quality/reach = smart, locked to a path)
  --day N            day length in seconds (30-600, default 150)
  --json             print the report as JSON
  --summary          print only the aggregate summary (per-day loss, card buys, policies)
  --help             show this text`;

export function defaultOptions(): BalanceOptions {
  return {
    weeks: 10, seed: 1, humans: 2, bots: 1, skill: 3, pace: 3, scenario: 'random',
    menus: [[...DRINKS]], compare: false, json: false, daySeconds: 150, policies: ['smart'], summary: false,
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
        const v = next();
        if (v === 'menus') o.compare = true;
        else if (v === 'policies') o.policies = [...POLICIES];
        else throw new UsageError("--compare takes 'menus' or 'policies'");
        break;
      }
      case '--summary':
        o.summary = true;
        break;
      case '--policy': {
        const v = next() as Policy;
        if (!POLICIES.includes(v)) throw new UsageError(`unknown policy '${v ?? ''}'`);
        o.policies = [v];
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
  const onMenu = menuDrinks(state);
  for (const supply of SUPPLIES) {
    if (!onMenu.some((d) => ECONOMY.drinkSupplies[d].includes(supply))) continue;
    let packs = Math.ceil((RESTOCK_TARGET[supply] - (state.supplies[supply] ?? 0)) / ECONOMY.packs[supply].size);
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

const isPermanent = (c: CatalogueItem) => c.duration === 'permanent';
const spicy = (c: CatalogueItem) => c.spicy === true || c.effects.some(isDownside);

/** The path a crew is building: forced by the policy, else whichever path it owns most of (speed first on a tie). */
function focusPath(state: GameState, policy: Policy): CardPath {
  if (policy === 'speed' || policy === 'quality' || policy === 'reach') return policy;
  const n: Record<CardPath, number> = { speed: 0, quality: 0, reach: 0 };
  for (const o of state.owned) {
    const c = CATALOGUE.find((x) => x.id === o.itemId);
    if (c) n[c.path] += 1;
  }
  return (['speed', 'quality', 'reach'] as CardPath[]).reduce((a, b) => (n[b] > n[a] ? b : a), 'speed');
}

/** Cash a sensible crew keeps back for tomorrow's rent and a margin. */
function reserve(state: GameState): number {
  const ramp = 1 + ((ECONOMY.weekRamp.rent - 1) * Math.min(state.day, ECONOMY.scoredWeekDays)) / ECONOMY.scoredWeekDays;
  return Math.round(ECONOMY.rentPerDay * ramp * 1.6);
}

/** How much a crew would want this card tonight (0 = not interested). Pure; no RNG. */
export function cardValue(state: GameState, c: CatalogueItem, policy: Policy): number {
  const path = focusPath(state, policy);
  if (c.effects.some((e) => e.kind === 'temp')) return state.day >= 4 ? 3 : 1.5; // late-week rush help
  if (c.effects.some((e) => e.kind === 'reveal')) return state.day <= 3 ? 1.5 : 0.5;
  if (!isPermanent(c)) return 0.8;
  let v = c.path === path ? 2.5 : 1.2;
  if (c.effects.some((e) => e.kind === 'unlock')) v += 1;
  if (c.set) {
    const have = setCounts(state)[c.set] ?? 0;
    const need = CARD_SETS[c.set].need;
    if (have + 1 === need || have + 1 === (CARD_SETS[c.set].tier3 ? 3 : 0)) v += 1.5;
    else if (have > 0) v += 0.5;
  }
  if (spicy(c)) v -= 0.5;
  // A card bought late has fewer days to pay back.
  v *= 1 - Math.max(0, state.day - 4) * 0.12;
  return v;
}

/** Restock to targets, scaled by tomorrow's forecast traffic and its hot/iced lean. */
function restockInputs(state: GameState, who: string, smart: boolean): { inputs: PlayerInput[]; cash: number } {
  const inputs: PlayerInput[] = [];
  let cash = state.cash;
  const onMenu = menuDrinks(state);
  let scale = 1;
  if (smart) for (const e of forecastOf(state).effects) if (e.kind === 'traffic') scale *= e.mul;
  for (const supply of SUPPLIES) {
    if (!onMenu.some((d) => ECONOMY.drinkSupplies[d].includes(supply))) continue;
    let packs = Math.ceil((RESTOCK_TARGET[supply] * scale - (state.supplies[supply] ?? 0)) / ECONOMY.packs[supply].size);
    while (packs > 0 && restockCost(state, supply, packs) > cash) packs -= 1;
    if (packs <= 0) continue;
    cash = round2(cash - restockCost(state, supply, packs));
    inputs.push({ kind: 'restock', playerId: who, supply, packs });
  }
  return { inputs, cash };
}

/**
 * The smart night (B11), called once per night tick until it returns nothing: restock for the forecast,
 * buy the best-valued card(s) it can afford above a rent reserve, and re-roll (at most once) when the
 * hand has nothing worth buying and the cash is there. Stand-ins are bot-driven, so the inputs come from the host 'tester' (who may re-roll).
 */
export function smartNightInputs(state: GameState, policy: Policy, stage: number): PlayerInput[] {
  const who = TESTER;
  if (stage === 0) return restockInputs(state, who, true).inputs;
  if (stage > 4) return [];
  const keep = reserve(state);
  const hand = CATALOGUE.filter((c) => state.hand.includes(c.id) && !state.boughtTonight.includes(c.id));
  const scored = hand
    .map((c) => ({ c, v: cardValue(state, c, policy) }))
    .filter(({ c }) => c.cost <= state.cash - keep)
    .sort((a, b) => b.v - a.v || a.c.cost - b.c.cost || a.c.id.localeCompare(b.c.id));
  const top = scored[0];
  if (top && top.v >= 2) return [{ kind: 'buy', playerId: who, itemId: top.c.id }];
  const roll = rerollCost(state);
  if ((state.rerolls ?? 0) < 1 && hand.length > 0 && state.cash - keep - roll >= 60) return [{ kind: 'reroll', playerId: who }];
  if (top && top.v >= 1.4 && state.cash - top.c.cost >= keep + 30) return [{ kind: 'buy', playerId: who, itemId: top.c.id }];
  return [];
}

/**
 * P3 B6/B7 'taste' policy: keep a known 4-5★ twist, swap out a known flop for an untried twist
 * (exploring one twist per drink per night), and make the best known 4-5★ combo the signature.
 */
export function tasteNight(state: GameState): void {
  const on = menuDrinks(state);
  const twists = { ...(state.twists ?? {}) };
  let best: { drink: DrinkId; twist: TwistId; stars: number } | null = null;
  for (const d of on) {
    const known = TWISTS.map((t) => ({ t, s: knownStars(state, d, t) }));
    const top = known.filter((k) => k.s !== null).sort((a, b) => b.s! - a.s!)[0];
    if (top && top.s! >= 4) {
      twists[d] = top.t;
      if (!best || top.s! > best.stars) best = { drink: d, twist: top.t, stars: top.s! };
    } else {
      const untried = known.find((k) => k.s === null);
      if (untried) twists[d] = untried.t;
      else delete twists[d];
    }
  }
  if (Object.keys(twists).length) state.twists = twists;
  if (best && (!state.signature || state.signature.drink !== best.drink || state.signature.twist !== best.twist)) {
    state.signature = { name: 'House special', drink: best.drink, twist: best.twist, premium: 2, since: state.day };
  }
}

/** P3 B10/B11 'promo' policy: on top of taste, book a crowd ad when there's cash to spare and pitch the panel. */
const PROMO_PITCHES: [PitchKind, string][] = [
  ['promo', 'Cozy rainy morning deal: bring a friend, loyalty card double stamps on every latte'],
  ['item', 'Fresh house-made honey oat latte, slow pour with real crema, warm and sweet'],
  ['promo', 'Happy hour for locals and family: free cookie with any espresso, share the love'],
];
export function promoNight(state: GameState): void {
  const ad: AdId = state.day % 2 ? 'palmbook' : 'nextdoorish';
  if (!(state.ad && state.ad.day === state.day) && state.cash >= ADS[ad].cost + 60) {
    state.cash = Math.round((state.cash - ADS[ad].cost) * 100) / 100;
    state.ad = { id: ad, day: state.day, by: 'tester' };
  }
  if (!(state.pitch && state.pitch.day === state.day)) {
    const [kind, text] = PROMO_PITCHES[state.day % PROMO_PITCHES.length];
    state.pitch = { day: state.day, by: 'tester', ...judgePitch(state, kind, text, state.pitch?.text) };
  }
}

/** P3 B12 'kiosk' / 'squarely' policies: smart shopping plus walking the checkout path up to the target. */
export function checkoutNight(state: GameState, target: CheckoutId): void {
  const next = nextCheckout(state);
  if (!next || CHECKOUT_IDS.indexOf(next) > CHECKOUT_IDS.indexOf(target)) return;
  if (state.cash < CHECKOUT[next].cost + 60) return;
  state.cash = Math.round((state.cash - CHECKOUT[next].cost) * 100) / 100;
  state.checkout = { owned: [...checkoutOf(state).owned, next], active: next, since: state.day, by: 'tester' };
}

/** Most ticks a week can take: seven nights, days and closing graces, plus slack. Exceeding it means a stuck sim. */
function tickCap(daySeconds: number): number {
  const perDay = secondsToTicks(daySeconds) + secondsToTicks(ECONOMY.closingGraceSeconds) + secondsToTicks(NIGHT_SECONDS);
  return ECONOMY.scoredWeekDays * perDay + secondsToTicks(60);
}

/** Play one independent week on `seed` with `menu`, as the absent host 'tester'. */
export function runWeek(opts: BalanceOptions, seed: number, menu: DrinkId[], policy: Policy = opts.policies[0] ?? 'smart'): WeekResult {
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
  let stage = 0;
  let rerolls = 0;
  const bought: string[] = [];
  let forecast = String(state.forecast);
  let dealt = 0;
  while (state.phase !== 'weekEnd' && state.phase !== 'ended') {
    if (++ticks > cap) throw new Error(`week on seed ${seed} did not finish within ${cap} ticks`);
    // A fixed test menu stays fixed even as drinks unlock through the week ("all" takes them as they come).
    if (state.phase === 'night' && menu.length < DRINKS.length) for (const d of DRINKS) state.menu[d] = menu.includes(d);
    if (state.phase === 'night' && lastPhase !== 'night') stage = 0;
    let inputs: PlayerInput[] = [];
    if (state.phase === 'night') {
      if (policy === 'simple') inputs = lastPhase !== 'night' ? nightInputs(state) : [];
      else if (policy === 'none') inputs = lastPhase !== 'night' ? restockInputs(state, TESTER, false).inputs : [];
      else if (stage >= 0) {
        if ((policy === 'taste' || policy === 'promo') && stage === 0) tasteNight(state);
        if (policy === 'promo' && stage === 0) promoNight(state);
        if ((policy === 'kiosk' || policy === 'squarely') && stage === 0) checkoutNight(state, policy);
        inputs = smartNightInputs(state, policy === 'taste' || policy === 'promo' || policy === 'kiosk' || policy === 'squarely' ? 'smart' : policy, stage);
        stage = inputs.length === 0 && stage > 0 ? -1 : stage + 1;
      }
    }
    if (state.phase === 'day' && lastPhase !== 'day') {
      forecast = String(state.forecast);
      dealt = state.challenges?.length ?? 0;
    }
    lastPhase = state.phase;
    const before = state.boughtTonight.length;
    const r0 = state.rerolls ?? 0;
    state = step(state, inputs);
    if (state.boughtTonight.length > before) bought.push(...state.boughtTonight.slice(before));
    if ((state.rerolls ?? 0) > r0) rerolls += (state.rerolls ?? 0) - r0;
    for (const d of state.days.slice(days.length)) {
      days.push({
        day: d.day, cash: state.cash, served: d.served, lost: d.lost, turnedAway: d.turnedAway,
        wasted: d.wasted ?? 0, botMistakes: d.botMistakes ?? 0, events: [...(d.events ?? [])],
        forecast, challenges: dealt, challengesWon: d.challengesWon?.length ?? 0,
      });
    }
  }
  const drinks: Record<DrinkId, number> = zeroDrinks();
  for (const d of state.days) for (const k of DRINKS) drinks[k] += d.drinks?.[k] ?? 0;
  return { seed, menu: [...menu], days, finalCash: state.cash, bankrupt: state.bankrupt, drinks, policy, bought: [...new Set(bought)], rerolls, score: scoreRun(state) };
}

/** Every week for every menu, on seeds seed .. seed+weeks-1. */
export function runBalance(opts: BalanceOptions): BalanceReport {
  const warnings = opts.humans === 0 && opts.bots === 0 ? [NO_BARISTAS] : [];
  const weeks: WeekResult[] = [];
  for (const policy of opts.policies) for (const menu of opts.menus) for (let i = 0; i < opts.weeks; i++) weeks.push(runWeek(opts, opts.seed + i, menu, policy));
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

export interface CardStat { id: string; weeks: number; meanCash: number; othersCash: number; meanScore: number; othersScore: number }
export interface PolicySummary {
  policy: string; weeks: number; meanCash: number; meanScore: number; lossRate: number; profitable: number; bankrupt: number;
  dayLoss: number[]; dayServed: number[]; rerolls: number; challengesWon: number;
}
export interface BalanceSummary { policies: PolicySummary[]; cards: CardStat[] }

const scoreOf = (w: WeekResult) => w.score ?? w.finalCash - ECONOMY.startingCash;

/** Lost share per day of the week (1..7), pooled over weeks. */
function dayLoss(ws: WeekResult[]): { loss: number[]; served: number[] } {
  const loss: number[] = [];
  const served: number[] = [];
  for (let d = 1; d <= ECONOMY.scoredWeekDays; d++) {
    const rows = ws.flatMap((w) => w.days.filter((r) => r.day === d));
    const s = rows.reduce((n, r) => n + r.served, 0);
    const l = rows.reduce((n, r) => n + r.lost, 0);
    loss.push(s + l === 0 ? 0 : l / (s + l));
    served.push(rows.length ? s / rows.length : 0);
  }
  return { loss, served };
}

/** B11: aggregate a set of weeks (possibly from several processes) by policy, plus card ownership vs final cash. */
export function summarize(weeks: WeekResult[]): BalanceSummary {
  const names = [...new Set(weeks.map((w) => w.policy ?? 'simple'))];
  const policies = names.map((policy) => {
    const ws = weeks.filter((w) => (w.policy ?? 'simple') === policy);
    const { loss, served } = dayLoss(ws);
    return {
      policy, weeks: ws.length, meanCash: mean(ws.map((w) => w.finalCash)), meanScore: mean(ws.map(scoreOf)), lossRate: mean(ws.map(lossRate)),
      profitable: ws.filter((w) => w.finalCash > ECONOMY.startingCash).length / Math.max(1, ws.length),
      bankrupt: ws.filter((w) => w.bankrupt).length / Math.max(1, ws.length),
      dayLoss: loss, dayServed: served, rerolls: mean(ws.map((w) => w.rerolls ?? 0)),
      challengesWon: mean(ws.map((w) => w.days.reduce((n, d) => n + (d.challengesWon ?? 0), 0))),
    };
  });
  const smart = weeks.filter((w) => (w.policy ?? 'simple') !== 'none');
  const ids = [...new Set(smart.flatMap((w) => w.bought ?? []))].sort();
  const cards = ids
    .map((id) => {
      const own = smart.filter((w) => w.bought?.includes(id));
      const rest = smart.filter((w) => !w.bought?.includes(id));
      return {
        id, weeks: own.length, meanCash: mean(own.map((w) => w.finalCash)), othersCash: mean(rest.map((w) => w.finalCash)),
        meanScore: mean(own.map(scoreOf)), othersScore: mean(rest.map(scoreOf)),
      };
    })
    .sort((a, b) => b.weeks - a.weeks || a.id.localeCompare(b.id));
  return { policies, cards };
}

export function formatSummary(sum: BalanceSummary, topCards = 12): string {
  const out: string[] = [];
  out.push(table(
    ['policy', 'weeks', 'mean cash', 'score', 'loss', 'profit', 'bankrupt', 'rerolls', 'ch.won', 'loss by day 1..7'],
    sum.policies.map((p) => [
      p.policy, String(p.weeks), money(p.meanCash), money(p.meanScore), pct(p.lossRate), pct(p.profitable), pct(p.bankrupt),
      p.rerolls.toFixed(1), p.challengesWon.toFixed(1), p.dayLoss.map((x) => (x * 100).toFixed(0)).join('/'),
    ]),
    [0, 9],
  ));
  const top = sum.cards.slice(0, topCards);
  if (top.length) {
    out.push('', table(['card', 'weeks owned', 'score if owned', 'score if not', 'lift'], top.map((c) => [
      c.id, String(c.weeks), money(c.meanScore), money(c.othersScore), money(c.meanScore - c.othersScore),
    ])));
  }
  return out.join('\n');
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
  if (o.summary || o.policies.length > 1) {
    out.push('', formatSummary(summarize(report.weeks)));
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
