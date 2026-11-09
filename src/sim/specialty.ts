/**
 * Specialty shops, phase 1 (docs/PLAN_SPECIALTY_SHOPS.md). A Gear shop earns an identity from the
 * cups it actually served (`DayStats.drinks`) over a short window. The host sets that at night,
 * from the scored days, and the next day orders lean that way. No bot reads this. No save migration:
 * the new fields ride the snapshot bump.
 *
 * Hysteresis: a latte bar or a quick cup keeps its name until the window falls below the hold line.
 * One mixed day does not rename the shop.
 *
 * The wand's `milkPush` (src/sim/lattes.ts) steps aside while the identity is specialty or
 * fast-casual, and these weights take the job. A neighbourhood café keeps the wand push.
 *
 * Now and then someone asks for a family the window barely sold. They leave politely: no queue,
 * no lost customer, no reputation hit. A substitute would edit the order, which the plan keeps
 * for a later phase, so this phase uses the same walk-on idea as `gearAskedFor`.
 */
import { DRINK_FAMILY, type DrinkFamily } from '../data/areas';
import type { DrinkId, GameState, ShopIdentity, SoldDay } from './types';

/**
 * Every number that tunes this phase. Change them here.
 * Shares are percents of cups in the window (iced counts in the total, and has no shop of its own).
 */
export const SPECIALTY = {
  /** Scored days of `DayStats.drinks` kept on `GameState.soldWindow`. */
  windowDays: 3,
  /** Espresso + milky cups, and that side leads, to become a specialty shop. */
  enterSpecialtyPct: 55,
  /** Filter cups to become a fast-casual (quick cup) shop. */
  enterFastPct: 50,
  /** Stay a specialty shop until espresso + milky falls below this. */
  holdSpecialtyPct: 45,
  /** Stay a quick cup until filter falls below this. */
  holdFastPct: 40,
  /**
   * `drawDrink` multiplier on espresso and milky while specialty.
   * The plan's draft was 1.4. On a four-drink menu the wand push already puts espresso and
   * milk near 62% of orders, and 1.4 with that push turned off slips under it. 1.8 stays
   * ahead of the wand (the earned shop sells more of what it is known for) without stacking
   * both systems.
   */
  specialtyPull: 1.8,
  /** `drawDrink` multiplier on filter while fast-casual. The plan's draft, and it already lifts drip. */
  fastPull: 1.5,
  /** A family under this percent of the window is the light side. An off-menu ask comes from there. */
  lightPct: 15,
  /** Chance an arrival who would have ordered asks for a light-side drink and leaves. */
  oneOff: 0.08,
  /** What they say on the way out. Plain speech, picked from the log sequence so every peer agrees. */
  oneOffLines: ['Not my usual. I\'ll head off.', 'I\'ll try somewhere else.', 'No thanks, another time.'] as const,
} as const;

export interface FamilyShares {
  total: number;
  espresso: number;
  milky: number;
  iced: number;
  filter: number;
}

const emptyShares = (): FamilyShares => ({ total: 0, espresso: 0, milky: 0, iced: 0, filter: 0 });

/** Cups per family across the window. Drinks with no family (the signature special) are skipped. */
export function familyShares(window: readonly SoldDay[]): FamilyShares {
  const acc = emptyShares();
  for (const day of window) {
    for (const [id, n] of Object.entries(day.drinks)) {
      if (!n || n <= 0) continue;
      const fam = DRINK_FAMILY[id as DrinkId];
      if (!fam) continue;
      acc[fam] += n;
      acc.total += n;
    }
  }
  return acc;
}

/** `part` is at least `pct` percent of `total` (integer cups, so 55% of 100 is exactly 55). */
function atLeast(part: number, total: number, pct: number): boolean {
  return total > 0 && part * 100 >= pct * total;
}

function rawIdentity(s: FamilyShares): ShopIdentity {
  const specialtyCups = s.espresso + s.milky;
  const milkyLeads = s.milky > s.filter && s.milky >= s.espresso && s.milky >= s.iced;
  const espressoLeads = s.espresso > s.milky && s.espresso > s.filter && s.espresso >= s.iced;
  if (atLeast(specialtyCups, s.total, SPECIALTY.enterSpecialtyPct) && (milkyLeads || espressoLeads)) return 'specialty';
  if (atLeast(s.filter, s.total, SPECIALTY.enterFastPct)) return 'fastCasual';
  return 'neighbourhood';
}

/**
 * The identity for this window, given the one the shop already has.
 * A held specialty or fast-casual name wins until its share falls through the hold line.
 */
export function chooseShopIdentity(prev: ShopIdentity | undefined, window: readonly SoldDay[]): ShopIdentity {
  const s = familyShares(window);
  if (s.total <= 0) return 'neighbourhood';
  if (prev === 'specialty' && atLeast(s.espresso + s.milky, s.total, SPECIALTY.holdSpecialtyPct)) return 'specialty';
  if (prev === 'fastCasual' && atLeast(s.filter, s.total, SPECIALTY.holdFastPct)) return 'fastCasual';
  return rawIdentity(s);
}

/**
 * Record the last scored days and set `shopIdentity`. Gear runs only. No RNG.
 * Safe to call twice on the same days: the hold rule makes the second call agree with the first.
 */
export function noteShopIdentity(state: GameState): void {
  if (state.gear !== true) {
    delete state.soldWindow;
    delete state.shopIdentity;
    return;
  }
  const scored = state.days.slice(-SPECIALTY.windowDays);
  if (scored.length === 0) {
    delete state.soldWindow;
    delete state.shopIdentity;
    return;
  }
  const window: SoldDay[] = scored.map((d) => ({ day: d.day, drinks: { ...(d.drinks ?? {}) } }));
  state.shopIdentity = chooseShopIdentity(state.shopIdentity, window);
  state.soldWindow = window;
}

/** True when the wand's latte push should get out of the way (specialty or fast-casual, not neighbourhood). */
export function identityStepsAside(state: GameState): boolean {
  return state.shopIdentity === 'specialty' || state.shopIdentity === 'fastCasual';
}

/** Extra order weight for this drink from the shop's identity (1 when the identity does not pull it). */
export function identityWeight(state: GameState, drink: DrinkId): number {
  const fam: DrinkFamily | null = DRINK_FAMILY[drink];
  if (!fam) return 1;
  if (state.shopIdentity === 'specialty' && (fam === 'espresso' || fam === 'milky')) return SPECIALTY.specialtyPull;
  if (state.shopIdentity === 'fastCasual' && fam === 'filter') return SPECIALTY.fastPull;
  return 1;
}

/** Menu drinks whose family is under `lightPct` of the window. Empty when the window has no cups. */
export function lightDrinks(state: GameState, menu: readonly DrinkId[]): DrinkId[] {
  const shares = familyShares(state.soldWindow ?? []);
  if (shares.total <= 0) return [];
  return menu.filter((d) => {
    const fam = DRINK_FAMILY[d];
    return !!fam && shares[fam] * 100 < SPECIALTY.lightPct * shares.total;
  });
}

export interface ShopFacing {
  id: ShopIdentity;
  /** The sign in the shop. */
  badge: string;
  /** The short line under that sign. */
  demand: string;
  /** The night-screen line: what the shop is known for, the recent split, and how orders move. */
  line: string;
}

function percentSplit(s: FamilyShares): { latte: number; drip: number; iced: number } {
  if (s.total <= 0) return { latte: 0, drip: 0, iced: 0 };
  const parts = [s.espresso + s.milky, s.filter, s.iced];
  const raw = parts.map((n) => (n * 100) / s.total);
  const floors = raw.map((n) => Math.floor(n));
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((n, i) => ({ i, frac: n - floors[i]! }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i] = (floors[o.i] ?? 0) + 1;
    left -= 1;
  }
  return { latte: floors[0] ?? 0, drip: floors[1] ?? 0, iced: floors[2] ?? 0 };
}

function mixClause(p: { latte: number; drip: number; iced: number }): string {
  const bits: string[] = [];
  if (p.latte > 0) bits.push(`${p.latte}% of cups were lattes and espresso`);
  if (p.drip > 0) bits.push(`${p.drip}% were drip and filter coffee`);
  if (p.iced > 0) bits.push(`${p.iced}% were iced drinks`);
  if (bits.length === 0) return 'no cups were sold';
  if (bits.length === 1) return bits[0]!;
  if (bits.length === 2) return `${bits[0]} and ${bits[1]}`;
  return `${bits[0]}, ${bits[1]}, and ${bits[2]}`;
}

function overDays(n: number): string {
  return n <= 1 ? 'the last day' : `the last ${n} days`;
}

/** What to show the player. Null until a Gear shop has a scored day. */
export function shopFacing(state: GameState): ShopFacing | null {
  if (state.gear !== true || !state.shopIdentity || !state.soldWindow?.length) return null;
  const id = state.shopIdentity;
  const shares = familyShares(state.soldWindow);
  const mix = mixClause(percentSplit(shares));
  const days = overDays(state.soldWindow.length);
  if (id === 'specialty') {
    const espresso = shares.espresso > shares.milky;
    return {
      id,
      badge: espresso ? 'Espresso bar' : 'Latte bar',
      demand: 'People ask for espresso and lattes more often',
      line: `This shop is known for ${espresso ? 'espresso' : 'lattes'}. Over ${days}, ${mix}. People walking in ask for espresso and lattes more often.`,
    };
  }
  if (id === 'fastCasual') {
    return {
      id,
      badge: 'Quick cup',
      demand: 'People ask for drip more often',
      line: `This shop is a quick cup counter, known for drip. Over ${days}, ${mix}. People walking in ask for drip more often.`,
    };
  }
  const line = shares.total <= 0
    ? `No cups sold over ${days}, so this stays a neighbourhood café. Orders follow the menu you wrote.`
    : `This is a neighbourhood café. Over ${days}, ${mix}. Orders stay mixed, the way the menu is written.`;
  return { id, badge: 'Neighbourhood café', demand: 'Orders follow the menu', line };
}
