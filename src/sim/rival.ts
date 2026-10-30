/**
 * P3 B9: Starbuck$, the rival down the street. At night the crew can pay to scout it: its menu and
 * prices for tomorrow, and whether it's eyeing your signature. A few days after you set a signature
 * it launches a knock-off a little cheaper, and fewer walk-ins ask for yours. Counter-moves: price
 * yours at or under the knock-off (it re-undercuts after a while, down to a floor), or design a new
 * signature (it needs a few days to copy that one too). The menu is a pure hash; no RNG draws.
 *
 * P4 B1 (Gear runs): the rival grows with you. From week 2 it runs "happy hour" promo days (one a
 * week in week 2, two from week 3, picked by hash from days 2–7 of the week) that pull walk-ins away;
 * the crew can counter the night before (our prices down, the walk-ins stay). From week 3 it copies
 * a signature after 2 days instead of 3.
 *
 * P4 F2 (Gear runs): from week 3 the rival also runs a loyalty card that keeps pulling a share of
 * walk-ins every day, announced the night before it launches. The crew can answer once with its own
 * stamp card: a one-off print cost and every 10th cup free (prices a little lower), walk-ins back.
 */
import { DRINK_INFO } from '../data/drinks';
import { ECONOMY } from '../data/economy';
import { menuPrice } from './pricing';
import { sigPremium } from './signature';
import { hash32 } from './taste';
import { unlockedDrinks } from './unlocks';
import type { Modifiers } from './effects';
import type { DrinkId, GameState, PlayerInput, Rival, Signature } from './types';

export const RIVAL = {
  name: 'Starbuck$',
  scoutCost: 5,
  /** Days a signature stands before the rival copies it, and between re-undercuts. */
  copyAfter: 3,
  /** The knock-off sells this much under your signature price. */
  undercut: 0.5,
  /** Share of signature asks you keep while the knock-off is cheaper / while you match it. */
  askCut: 0.5,
  matchedCut: 0.85,
  /** The rival won't price a knock-off under this fraction of the drink's list price. */
  floor: 0.75,
  menuSize: 3,
  /** P4 B1: on a promo day we keep this share of walk-ins, unless we counter. */
  promoTraffic: 0.8,
  /** P4 B1: countering a promo prices every drink at this share (the walk-ins stay). */
  counterPrice: 0.85,
  /** P4 B1: from week 3 the knock-off comes this many days after a new signature. */
  copyAfterLate: 2,
  /** P4 F2: the rival's loyalty card starts on this day (day 1 of week 3) of a Gear run. */
  loyaltyDay: 15,
  /** P4 F2: while it runs and we have no stamp card we keep this share of walk-ins. */
  loyaltyTraffic: 0.93,
  /** P4 F2: our stamp card: one-off cost, and every 10th cup free ≈ prices at this share. */
  stampCost: 30,
  stampPrice: 0.97,
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const quarter = (n: number) => Math.round(n * 4) / 4;

/** Your signature's shelf price: the drink's menu price plus the premium. */
export function sigPrice(state: GameState, sig: Signature): number {
  return round2(menuPrice(state, sig.drink) + sigPremium(sig));
}

/** The rival's menu for `state.day` (at night: tomorrow): a few of your unlocked drinks, priced a touch under list. */
export function rivalMenu(state: GameState): { drink: DrinkId; price: number }[] {
  const pool = [...unlockedDrinks(state)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = hash32(state.seed * 7 + state.day * 92821 + i * 31337) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, RIVAL.menuSize).map((drink, i) => {
    const h = hash32(state.seed * 11 + state.day * 7477 + i * 1009) % 5;
    return { drink, price: quarter(ECONOMY.prices[drink] * (0.85 + h * 0.05)) };
  });
}

/** True when the rival's knock-off is of the signature currently on your board. */
export function copyIsLive(state: GameState): boolean {
  const sig = state.signature;
  const c = state.rival?.copy;
  return !!(sig && c && c.drink === sig.drink && c.twist === sig.twist && c.since === sig.since);
}

/** Multiplier on the signature ask share from the knock-off (1 with none). */
export function rivalAskFactor(state: GameState): number {
  if (!copyIsLive(state)) return 1;
  return sigPrice(state, state.signature!) <= state.rival!.copy!.price ? RIVAL.matchedCut : RIVAL.askCut;
}

/** Days until the rival copies the current signature (0 = it will tomorrow), or null if it already has / there's none. */
export function daysToCopy(state: GameState): number | null {
  const sig = state.signature;
  if (!sig || copyIsLive(state)) return null;
  return Math.max(0, sig.since + copyAfter(state) - state.day);
}

/** Morning: copy a signature that has stood long enough, or re-undercut one that was matched. Returns a note. */
export function rivalMorning(state: GameState): string | null {
  const sig = state.signature;
  if (!sig) return null;
  const mine = sigPrice(state, sig);
  const floor = round2(ECONOMY.prices[sig.drink] * RIVAL.floor);
  const target = Math.max(floor, round2(mine - RIVAL.undercut));
  if (!copyIsLive(state)) {
    if (state.day - sig.since < copyAfter(state)) return null;
    state.rival = { ...(state.rival ?? {}), copy: { drink: sig.drink, twist: sig.twist, since: sig.since, price: target, day: state.day } };
    return `${RIVAL.name} down the street launched a knock-off of “${sig.name}” at $${target.toFixed(2)}. Fewer walk-ins will ask for ours while it's dearer.`;
  }
  const c = state.rival!.copy!;
  if (mine <= c.price && state.day - c.day >= RIVAL.copyAfter && target < c.price) {
    state.rival = { ...state.rival, copy: { ...c, price: target, day: state.day } };
    return `${RIVAL.name} cut its “${sig.name}” knock-off to $${target.toFixed(2)}.`;
  }
  return null;
}

/** Which café week a day belongs to (same as effects.weekOf; kept local to avoid an import cycle). */
const weekNo = (day: number) => Math.ceil(day / ECONOMY.scoredWeekDays);

/** P4 B1: days a signature stands before the knock-off: shorter from week 3 of a Gear run. */
export function copyAfter(state: GameState): number {
  return state.gear && weekNo(state.day) >= 3 ? RIVAL.copyAfterLate : RIVAL.copyAfter;
}

/** P4 B1: how hard the rival pushes: 0 in week 1 (and classic runs), 1 in week 2, 2 from week 3. */
export function promoLevel(state: GameState, day = state.day): number {
  if (!state.gear) return 0;
  return Math.min(2, Math.max(0, weekNo(day) - 1));
}

/** P4 B1: true when `day` (default: today, or tomorrow at night) is one of the rival's happy-hour days. */
export function isPromoDay(state: GameState, day = state.day): boolean {
  const level = promoLevel(state, day);
  if (level === 0 || day < 1) return false;
  const week = weekNo(day);
  const first = (week - 1) * ECONOMY.scoredWeekDays + 1;
  // Days 2–7 of the week, shuffled by a hash of the seed and week; the first `level` are promo days.
  const pool = [1, 2, 3, 4, 5, 6].map((k) => first + k);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = hash32(state.seed * 13 + week * 7919 + i * 104729) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, level).includes(day);
}

/** P4 B1: the crew countered the promo on `state.day`. */
export function countered(state: GameState): boolean {
  return state.rival?.counter === state.day && isPromoDay(state);
}

/** P4 B1 modifiers: a promo day costs walk-ins; a counter keeps them and cuts our prices instead. */
export function applyRivalPromo(state: GameState, m: Modifiers): void {
  if (!isPromoDay(state)) return;
  if (countered(state)) {
    for (const d of Object.keys(m.price) as DrinkId[]) m.price[d] *= RIVAL.counterPrice;
  } else m.traffic *= RIVAL.promoTraffic;
}

/** P4 B1 morning note for a promo day. */
export function promoMorning(state: GameState): string | null {
  if (!isPromoDay(state)) return null;
  const off = Math.round((1 - RIVAL.counterPrice) * 100);
  return countered(state)
    ? `${RIVAL.name} is running happy hour today, and we matched it: ${off}% off everything, so the walk-ins stay.`
    : `${RIVAL.name} is running happy hour today. Expect about ${Math.round((1 - RIVAL.promoTraffic) * 100)}% fewer walk-ins.`;
}

/** P4 B1 night input: counter tomorrow's promo (prices down for the day). Humans, at night, only before a promo day. */
export function applyRivalCounterInput(state: GameState, input: Extract<PlayerInput, { kind: 'rivalCounter' }>): GameState {
  if (state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  if (!isPromoDay(state)) return state;
  const on = input.on !== false;
  if (on) state.rival = { ...(state.rival ?? {}), counter: state.day };
  else if (state.rival?.counter === state.day) {
    const { counter: _drop, ...rest } = state.rival;
    state.rival = rest;
  }
  return state;
}

/** Night input: pay to peek at the rival's board for tomorrow. Once a night, humans only. */
export function applyScoutInput(state: GameState, input: Extract<PlayerInput, { kind: 'scout' }>): GameState {
  if (state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  if (state.rival?.scouted === state.day || state.cash < RIVAL.scoutCost) return state;
  state.cash = round2(state.cash - RIVAL.scoutCost);
  state.rival = { ...(state.rival ?? {}), scouted: state.day } as Rival;
  return state;
}

/** P4 F2: the rival's loyalty card is running on `day` (default: today, or tomorrow at night). */
export function loyaltyLive(state: GameState, day = state.day): boolean {
  return !!state.gear && day >= RIVAL.loyaltyDay;
}

/** P4 F2: our stamp card is out (bought on or before `state.day`). */
export function hasStamps(state: GameState): boolean {
  const d = state.rival?.stamps;
  return d !== undefined && d <= state.day;
}

/** P4 F2 modifiers: the loyalty card costs walk-ins; our stamp card wins them back for a small price cut. */
export function applyRivalLoyalty(state: GameState, m: Modifiers): void {
  if (!loyaltyLive(state)) return;
  if (hasStamps(state)) {
    for (const d of Object.keys(m.price) as DrinkId[]) m.price[d] *= RIVAL.stampPrice;
  } else m.traffic *= RIVAL.loyaltyTraffic;
}

/** P4 F2 morning note: the launch day, and the day our stamp card comes out. */
export function loyaltyMorning(state: GameState): string | null {
  if (!loyaltyLive(state)) return null;
  const lost = Math.round((1 - RIVAL.loyaltyTraffic) * 100);
  if (state.rival?.stamps === state.day) return `Our stamp card is out: regulars stay with us, and every 10th cup is on the house (about ${Math.round((1 - RIVAL.stampPrice) * 100)}% off takings).`;
  if (state.day === RIVAL.loyaltyDay && !hasStamps(state)) return `${RIVAL.name} launched a loyalty card today. Expect about ${lost}% fewer walk-ins every day until we answer it.`;
  return null;
}

/** P4 F2 night input: print our own stamp card (once, humans, at night, once the rival's card is coming). */
export function applyStampCardInput(state: GameState, input: Extract<PlayerInput, { kind: 'stampCard' }>): GameState {
  if (state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  if (!loyaltyLive(state) || state.rival?.stamps !== undefined || state.cash < RIVAL.stampCost) return state;
  state.cash = round2(state.cash - RIVAL.stampCost);
  state.rival = { ...(state.rival ?? {}), stamps: state.day };
  return state;
}

export function rivalDrinkName(d: DrinkId): string {
  return DRINK_INFO[d].name;
}
