/**
 * P3 B9: Starbuck$, the rival down the street. At night the crew can pay to scout it: its menu and
 * prices for tomorrow, and whether it's eyeing your signature. A few days after you set a signature
 * it launches a knock-off a little cheaper, and fewer walk-ins ask for yours. Counter-moves: price
 * yours at or under the knock-off (it re-undercuts after a while, down to a floor), or design a new
 * signature (it needs a few days to copy that one too). The menu is a pure hash; no RNG draws.
 */
import { DRINK_INFO } from '../data/drinks';
import { ECONOMY } from '../data/economy';
import { menuPrice } from './pricing';
import { sigPremium } from './signature';
import { hash32 } from './taste';
import { unlockedDrinks } from './unlocks';
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
  return Math.max(0, sig.since + RIVAL.copyAfter - state.day);
}

/** Morning: copy a signature that has stood long enough, or re-undercut one that was matched. Returns a note. */
export function rivalMorning(state: GameState): string | null {
  const sig = state.signature;
  if (!sig) return null;
  const mine = sigPrice(state, sig);
  const floor = round2(ECONOMY.prices[sig.drink] * RIVAL.floor);
  const target = Math.max(floor, round2(mine - RIVAL.undercut));
  if (!copyIsLive(state)) {
    if (state.day - sig.since < RIVAL.copyAfter) return null;
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

export function rivalDrinkName(d: DrinkId): string {
  return DRINK_INFO[d].name;
}
