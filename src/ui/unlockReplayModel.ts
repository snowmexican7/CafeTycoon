/**
 * ui-3.10.0 (Round 6, Kennedy Nov 5): the new-drink unlock replay. After the nightly receipt's "On to the night shop",
 * a newly learned drink gets a short, scripted how-to: a ghost barista walks the real recipe chain (grind, pull, step
 * back, press E again, hand it off). Pure and scripted from `recipeChain` — no bot brain, no sim state (bot cut).
 */
import { DRINK_INFO, recipeChain, type ChainStation } from '../data/drinks';
import { SUPPLY_ID } from '../data/layout';
import type { DrinkId, GameState, ItemKind } from '../sim/types';

/** A spot on the replay's little bar: a machine kind, the milk counter, or the pickup counter at the end. */
export type ReplayStop = ChainStation | 'pickup';

export interface ReplayStep {
  /** Where the ghost stands for this beat. */
  stop: ReplayStop;
  /** walk = move to the stop; back = step back from it; press = E; wait = the machine works. */
  act: 'walk' | 'back' | 'press' | 'wait';
  /** What the ghost holds after this beat. */
  holding: ItemKind | null;
  /** The caption line under the stage (numbered beats only). */
  caption?: string;
  /** Beat length in seconds (at 1× speed). */
  sec: number;
}

export interface ReplayScript {
  drink: DrinkId;
  name: string;
  /** The stops left to right, in first-use order, ending at pickup. */
  stops: ReplayStop[];
  steps: ReplayStep[];
}

export const STOP_LABEL: Record<ReplayStop, string> = {
  grinder: 'Grinder',
  espresso: 'Espresso machine',
  steamer: 'Steam wand',
  coldBrewTap: 'Cold brew',
  drip: 'Drip machine',
  [SUPPLY_ID]: 'Milk counter',
  pickup: 'Pickup counter',
} as Record<ReplayStop, string>;

const itemName = (k: ItemKind): string => (k === 'grounds' ? 'grounds' : DRINK_INFO[k].short.toLowerCase());

/** The scripted beats for one drink, from its real recipe chain. */
export function replayScript(drink: DrinkId): ReplayScript {
  const chain = recipeChain(drink);
  const stops: ReplayStop[] = [];
  const steps: ReplayStep[] = [];
  let holding: ItemKind | null = null;
  let at: ReplayStop | null = null;
  for (const { station, recipe } of chain) {
    if (!stops.includes(station)) stops.push(station);
    const where = STOP_LABEL[station];
    if (at === station) {
      // Same machine again (an Americano's water, a doppio's second pull): step back, then walk in and press again.
      steps.push({ stop: station, act: 'back', holding, caption: `Step back with the ${itemName(holding!)}`, sec: 0.9 });
    }
    steps.push({ stop: station, act: 'walk', holding, sec: 1.1 });
    at = station;
    const gives = recipe.gives;
    const handIn = recipe.takes ? `with the ${itemName(recipe.takes)} in hand` : 'with empty hands';
    if (station === 'steamer') {
      // Round 6: fill the jug, stop the foam meter, and the drink is already in your hand.
      steps.push({ stop: station, act: 'press', holding, caption: `${where}: E fills the jug, E again on the line`, sec: 1.3 });
      steps.push({ stop: station, act: 'press', holding: gives, caption: `E stops the foam meter: the ${itemName(gives)} is in your hand`, sec: 1.3 });
    } else if (station === SUPPLY_ID) {
      steps.push({ stop: station, act: 'press', holding: gives, caption: `${where}: E ${handIn} fills it at once`, sec: 1.3 });
    } else if (station === 'coldBrewTap' || station === 'drip') {
      steps.push({ stop: station, act: 'press', holding: gives, caption: `${where}: E ${handIn} pours a cup`, sec: 1.3 });
    } else {
      steps.push({ stop: station, act: 'press', holding: null, caption: `${where}: E ${handIn}`, sec: 0.9 });
      steps.push({ stop: station, act: 'wait', holding: null, sec: 1.1 });
      steps.push({ stop: station, act: 'press', holding: gives, caption: `E again picks up the ${itemName(gives)}`, sec: 0.9 });
    }
    holding = gives;
  }
  stops.push('pickup');
  steps.push({ stop: 'pickup', act: 'walk', holding, sec: 1.2 });
  steps.push({ stop: 'pickup', act: 'press', holding: null, caption: `Pickup counter: E sets the ${itemName(drink)} out to serve`, sec: 1.4 });
  return { drink, name: DRINK_INFO[drink].name, stops, steps };
}

/** Numbered caption lines (the beats that carry one). */
export function replayCaptions(s: ReplayScript): string[] {
  return s.steps.filter((x) => x.caption).map((x) => x.caption!);
}

/** Total length in seconds. */
export const replayLength = (s: ReplayScript): number => s.steps.reduce((t, x) => t + x.sec, 0);

/** Drinks learned since `before` (e.g. the day's start): what to replay after the receipt. */
export function newlyLearned(before: readonly DrinkId[] | undefined, after: Pick<GameState, 'unlocked'>): DrinkId[] {
  const had = new Set(before ?? []);
  return (after.unlocked ?? []).filter((d) => !had.has(d));
}
