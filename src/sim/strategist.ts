/**
 * Round 3 item 3: the Strategist's job and the price calculator behind it. Pure reads plus the writers
 * (`setPeakPrices`, and Round 4 f's `setStrategistMenu` / `strategistNight` / `strategistNewDrinks`; no rng). The planner's
 * price advice uses the same search (`bestStep`), so a hired Strategist and a bot's advice agree.
 */
import { ECONOMY } from '../data/economy';
import { computeModifiers } from './effects';
import { emitLog } from './log';
import { priceForecast, priceStep } from './pricing';
import { copyIsLive } from './rival';
import { menuDrinks, unlockedDrinks } from './unlocks';
import { canMake } from './growth';
import { BASE_DRINKS } from '../data/drinks';
import { hasStrategist } from './hires';
import type { DrinkId, GameState } from './types';

/** The price steps ($0.25 each, from list) the calculator weighs for each drink. */
export const STRATEGIST_STEPS = { min: -2, max: 4 } as const;

/** The forecast profit on `drink` if its price step were `step` (every other step as it is): always the honest numbers. */
export function drinkProfitAt(state: GameState, menu: DrinkId[], drink: DrinkId, step: number): number {
  const m = computeModifiers(state);
  const walkIns = ECONOMY.baseArrivalsPerSecond * state.settings.dayLengthSec * m.traffic;
  const steps = { ...(state.priceSteps ?? {}) };
  if (step === 0) delete steps[drink];
  else steps[drink] = step;
  const probe: GameState = { ...state, priceSteps: Object.keys(steps).length ? steps : undefined };
  return priceForecast(probe, menu, m, walkIns, true).find((l) => l.drink === drink)?.profit ?? 0;
}

/** The honest forecast profit for the whole menu at the current prices (every drink on the menu, before tips). */
export function forecastProfit(state: GameState): number {
  const m = computeModifiers(state);
  const menu = menuDrinks(state);
  const walkIns = ECONOMY.baseArrivalsPerSecond * state.settings.dayLengthSec * m.traffic;
  return Math.round(priceForecast(state, menu, m, walkIns, true).reduce((n, l) => n + l.profit, 0) * 100) / 100;
}

/**
 * The step with the best forecast profit for `drink` (every other price as it is). Ties keep the current step, then
 * prefer the step nearer list price.
 */
export function bestStep(state: GameState, menu: DrinkId[], drink: DrinkId, range: { min: number; max: number } = STRATEGIST_STEPS): number {
  const now = priceStep(state, drink);
  let best = now;
  let bestProfit = drinkProfitAt(state, menu, drink, now);
  for (let s = range.min; s <= range.max; s++) {
    if (s === now) continue;
    const p = drinkProfitAt(state, menu, drink, s);
    if (p > bestProfit || (p === bestProfit && best !== now && Math.abs(s) < Math.abs(best))) {
      best = s;
      bestProfit = p;
    }
  }
  return best;
}

/**
 * The prices the Strategist would set, without touching `state`: for each drink on the menu, in menu order, the
 * calculator's best step for the current crowd (each drink's search sees the ones chosen before it). A drink off the
 * menu keeps its step, and so does the signature while the rival's knock-off of it is live (that price is the rival
 * rule's call). Returns the whole `priceSteps` (absent when every price is list) and how many drinks moved.
 */
export function peakSteps(state: GameState): { steps: GameState['priceSteps']; changed: number } {
  const menu = menuDrinks(state);
  const held = state.signature && copyIsLive(state) ? state.signature.drink : null;
  const probe: GameState = { ...state };
  let changed = 0;
  for (const d of menu) {
    if (d === held) continue;
    const now = priceStep(probe, d);
    const best = bestStep(probe, menu, d);
    if (best === now) continue;
    const steps = { ...(probe.priceSteps ?? {}) };
    if (best === 0) delete steps[d];
    else steps[d] = best;
    probe.priceSteps = Object.keys(steps).length ? steps : undefined;
    changed += 1;
  }
  return { steps: probe.priceSteps, changed };
}

/**
 * The Strategist's night: replace the crew's prices with `peakSteps`. Runs at every night start and the moment a
 * Strategist is hired; a hand-set price after that stands until the next night start. Logs
 * `strategist.set { changed }` when any price moved.
 */
export function setPeakPrices(state: GameState): void {
  if (!state.gear || !hasStrategist(state)) return;
  const { steps, changed } = peakSteps(state);
  if (steps) state.priceSteps = steps;
  else delete state.priceSteps;
  if (changed > 0) emitLog(state, 'strategist.set', { changed });
}

/**
 * Round 4 f follow-up: the Strategist's menu. Every drink the café knows goes on when the bar can make it and off when
 * it can't (the same test as the planner's menu advice: `canMake`). Logs `strategist.menu { drink, on }` for each drink
 * switched. A bar that can make nothing yet (a Gear run's first night) leaves the menu alone.
 */
export function setStrategistMenu(state: GameState): void {
  if (!state.gear || !hasStrategist(state)) return;
  const known = state.unlocked ?? BASE_DRINKS;
  if (unlockedDrinks(state).length === 0) return;
  for (const d of known) {
    const on = canMake(state, d);
    if (state.menu[d] === on) continue;
    state.menu[d] = on;
    emitLog(state, 'strategist.menu', { drink: d, on });
  }
}

/** The Strategist's night (at every night start and the moment they are hired): the menu, then the peak prices for it. */
export function strategistNight(state: GameState): void {
  setStrategistMenu(state);
  setPeakPrices(state);
}

/**
 * Round 4 f follow-up: after a night input changed the bar (a machine bought, the shop grown), a drink the bar could
 * not make before (`before`, from `unlockedDrinks`) and can now goes on the menu while a Strategist is hired
 * (`strategist.menu { drink, on: true }`). Nothing else is touched, so hand-set changes still stand; its price stays
 * as it is until the next night start.
 */
export function strategistNewDrinks(state: GameState, before: readonly DrinkId[]): void {
  if (!state.gear || !hasStrategist(state) || state.phase !== 'night') return;
  for (const d of unlockedDrinks(state)) {
    if (before.includes(d) || state.menu[d]) continue;
    state.menu[d] = true;
    emitLog(state, 'strategist.menu', { drink: d, on: true });
  }
}
