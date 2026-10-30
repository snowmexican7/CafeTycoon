import type { DrinkId, ItemKind, StationKind, SupplyId } from '../sim/types';

/** Every drink, in menu order. Hot or iced decides how weather and forecasts tilt orders. */
export const DRINK_IDS: DrinkId[] = ['espresso', 'latte', 'coldBrew', 'icedLatte', 'mocha', 'matcha', 'special', 'drip', 'americano', 'cappuccino', 'doppio', 'sweetCream', 'cafeAuLait', 'redEye', 'pourOver'];

/** Drinks that only exist in Gear runs (drip machines and level-ups). */
export const GEAR_ONLY_DRINKS: DrinkId[] = ['drip', 'americano', 'cappuccino', 'doppio', 'sweetCream', 'cafeAuLait', 'redEye', 'pourOver'];

/** On the menu from day 1. The rest unlock by day or by a night card (Phase 2 B5). */
export const BASE_DRINKS: DrinkId[] = ['espresso', 'latte', 'coldBrew'];

export type DrinkTemp = 'hot' | 'iced';
export const DRINK_TEMP: Record<DrinkId, DrinkTemp> = {
  espresso: 'hot',
  latte: 'hot',
  coldBrew: 'iced',
  icedLatte: 'iced',
  mocha: 'hot',
  matcha: 'hot',
  special: 'iced',
  drip: 'hot',
  americano: 'hot',
  cappuccino: 'hot',
  doppio: 'hot',
  sweetCream: 'iced',
  cafeAuLait: 'hot',
  redEye: 'hot',
  pourOver: 'hot',
};

export interface DrinkInfo {
  name: string;
  /** Short label for tickets and toasts. */
  short: string;
  icon: string;
  /** How often it is ordered next to the classics (orderBias multiplies this). */
  bias: number;
  /** Patience multiplier: people wait a little longer for a fancy drink (default 1). */
  wait?: number;
  /** The day it joins the menu by itself; absent = only a night card unlocks it. */
  unlockDay?: number;
  /** The recipe ticket: the stations in order, as the barista walks them. */
  ticket: string[];
  blurb: string;
}

export const DRINK_INFO: Record<DrinkId, DrinkInfo> = {
  espresso: { name: 'Espresso', short: 'Espresso', icon: '☕', bias: 1, ticket: ['Grind', 'Pull'], blurb: 'A short shot.' },
  latte: { name: 'Latte', short: 'Latte', icon: '🥛', bias: 1, ticket: ['Grind', 'Pull', 'Steam'], blurb: 'Shot plus steamed milk.' },
  coldBrew: { name: 'Cold brew', short: 'Cold brew', icon: '🧊', bias: 1, ticket: ['Tap'], blurb: 'Straight from the tap.' },
  icedLatte: {
    name: 'Iced latte', short: 'Iced latte', icon: '🥤', bias: 0.8, wait: 1.15, unlockDay: 3,
    ticket: ['Grind', 'Pull', 'Tap (milk + ice)'], blurb: 'A shot over cold milk at the tap.',
  },
  mocha: {
    name: 'Mocha', short: 'Mocha', icon: '🍫', bias: 0.6, wait: 1.3, unlockDay: 5,
    ticket: ['Grind', 'Pull', 'Steam', 'Steam again (cocoa)'], blurb: 'A latte that goes back on the steamer with cocoa.',
  },
  matcha: {
    name: 'Matcha latte', short: 'Matcha', icon: '🍵', bias: 0.7,
    ticket: ['Steamer, empty hands (matcha + milk)'], blurb: 'No shot: whisk matcha into milk at the steamer.',
  },
  special: {
    name: 'Maple cold foam', short: 'Maple foam', icon: '🍁', bias: 0.5, wait: 1.2,
    ticket: ['Tap', 'Steamer (maple foam)'], blurb: 'Seasonal special: cold brew topped with maple foam.',
  },
  // G4d: Gear runs only (a drip machine on the floor). One press brews a pot; each press after pours a cup.
  drip: { name: 'Drip coffee', short: 'Drip', icon: '🫖', bias: 0.9, ticket: ['Drip (brew a pot, then pour)'], blurb: 'Filter coffee from a pot. Cheap and fast once it is brewed.' },
  // G6: Gear runs only, learned by serving (sim/levelUp.ts): 12 espressos → americano, 12 lattes → cappuccino.
  americano: { name: 'Americano', short: 'Americano', icon: '☕', bias: 0.8, ticket: ['Grind', 'Pull', 'Espresso machine again (hot water)'], blurb: 'A shot topped up with hot water. Learned after 12 espressos.' },
  cappuccino: { name: 'Cappuccino', short: 'Cappuccino', icon: '☁️', bias: 0.8, wait: 1.1, ticket: ['Grind', 'Pull', 'Steam', 'Steam again (extra foam)'], blurb: 'A latte with a tall cap of foam. Learned after 12 lattes.' },
  // G6c: more level-ups (Gear runs only).
  doppio: { name: 'Doppio', short: 'Doppio', icon: '⚡', bias: 0.6, ticket: ['Grind', 'Pull', 'Espresso machine again (second shot)'], blurb: 'A double shot. Learned after 30 espressos on a Sylvia or better.' },
  sweetCream: { name: 'Sweet-cream cold brew', short: 'Sweet cream', icon: '🧋', bias: 0.8, wait: 1.1, ticket: ['Tap', 'Tap again (sweet cream)'], blurb: 'Cold brew under a float of sweet cream. Learned after 15 cold brews.' },
  cafeAuLait: { name: 'Café au lait', short: 'Au lait', icon: '🫗', bias: 0.8, ticket: ['Drip', 'Steamer (hot milk)'], blurb: 'Drip coffee and hot milk, half and half. Learned after 12 drips.' },
  redEye: { name: 'Red-eye', short: 'Red-eye', icon: '👁️', bias: 0.6, ticket: ['Drip', 'Espresso machine (shot on top)'], blurb: 'Drip coffee with a shot dropped in. Learned after 20 drips with a real espresso machine.' },
  // G10a: comes with the Pour-Over Bar (Gear runs).
  pourOver: { name: 'Pour-over', short: 'Pour-over', icon: '🫘', bias: 0.7, wait: 1.15, ticket: ['Pour-over bar (handmade)'], blurb: 'One cup, poured by hand through a paper cone. Slow and fancy.' },
};

/** Base drinks plus every drink whose unlock day has come. */
export function dayUnlocks(day: number): DrinkId[] {
  return DRINK_IDS.filter((d) => BASE_DRINKS.includes(d) || (DRINK_INFO[d].unlockDay !== undefined && day >= DRINK_INFO[d].unlockDay!));
}

export type RecipeStation = Exclude<StationKind, 'counter' | 'trash'>;

/** One way to use a station: hold `takes` (null = empty hands), get `gives`, use up `consumes`. */
export interface Recipe {
  takes: ItemKind | null;
  gives: ItemKind;
  consumes: SupplyId[];
  /** Overrides the station's ECONOMY.stationSeconds. */
  seconds?: number;
}

/**
 * Every recipe per station, first match wins. What is in your hands picks the recipe, so the controls
 * stay one button: a shot at the steamer makes a latte, a latte at the steamer makes a mocha.
 */
export const RECIPES: Record<RecipeStation, Recipe[]> = {
  grinder: [{ takes: null, gives: 'grounds', consumes: ['beans'] }],
  espresso: [
    { takes: 'grounds', gives: 'espresso', consumes: [] },
    // G6: an espresso in hand back at the machine gets hot water (Gear runs, once learned).
    { takes: 'espresso', gives: 'americano', consumes: [], seconds: 1.5 },
    // G6c: a second shot (clash with americano: the oldest ticket decides, see recipeFor); a shot on drip.
    { takes: 'espresso', gives: 'doppio', consumes: ['beans'], seconds: 3 },
    { takes: 'drip', gives: 'redEye', consumes: ['beans'], seconds: 3 },
  ],
  steamer: [
    { takes: 'espresso', gives: 'latte', consumes: ['milk'] },
    { takes: 'latte', gives: 'mocha', consumes: ['flavour'], seconds: 2.5 },
    // G6: a latte back on the steamer gets extra foam (Gear runs, once learned). Clash with mocha: see recipeFor.
    { takes: 'latte', gives: 'cappuccino', consumes: ['milk'], seconds: 2 },
    { takes: 'coldBrew', gives: 'special', consumes: ['milk', 'flavour'], seconds: 3 },
    { takes: 'drip', gives: 'cafeAuLait', consumes: ['milk'], seconds: 2 },
    { takes: null, gives: 'matcha', consumes: ['milk', 'flavour'], seconds: 4 },
  ],
  coldBrewTap: [
    { takes: null, gives: 'coldBrew', consumes: ['concentrate'] },
    { takes: 'espresso', gives: 'icedLatte', consumes: ['milk'], seconds: 2.5 },
    { takes: 'coldBrew', gives: 'sweetCream', consumes: ['milk'], seconds: 2 },
  ],
  // G4d: a pot of filter coffee (one unit of beans, no grinder); the pot then pours cups (sim/gear.ts gearPotPour).
  drip: [{ takes: null, gives: 'drip', consumes: ['beans'] }],
};

/** Drinks that start with a shot (grounds or an espresso in flight can still become one). */
export function usesShot(drink: DrinkId): boolean {
  return drink === 'espresso' || drink === 'latte' || drink === 'icedLatte' || drink === 'mocha' || drink === 'americano' || drink === 'cappuccino' || drink === 'doppio';
}

/** The station recipes a drink walks through, in order (the last one gives the drink). */
/** G10a: the pour-over bar's own recipe (seconds vary by gear; this is the bar's). */
export const POUR_OVER_RECIPE: Recipe = { takes: null, gives: 'pourOver', consumes: ['beans'], seconds: 8 };

export function recipeChain(drink: DrinkId): { station: RecipeStation; recipe: Recipe }[] {
  const out: { station: RecipeStation; recipe: Recipe }[] = [];
  let want: ItemKind | null = drink;
  while (want !== null) {
    let found: { station: RecipeStation; recipe: Recipe } | null = null;
    for (const station of Object.keys(RECIPES) as RecipeStation[]) {
      const r = RECIPES[station].find((x) => x.gives === want);
      if (r) found = { station, recipe: r };
    }
    // G10a: the pour-over is made only on pour-over gear (sim/gear.ts gearRecipe), not from RECIPES,
    // so a drip pot never makes one; its one step still shows on tickets and in bot plans.
    if (!found && want === 'pourOver') found = { station: 'drip', recipe: POUR_OVER_RECIPE };
    if (!found) break;
    out.unshift(found);
    want = found.recipe.takes;
  }
  return out;
}

/** Batch/pickup: every drink drawn from the cold brew tap's steeped cups (a `coldBrewTap` step in its chain). */
export const TAP_DRINKS: DrinkId[] = DRINK_IDS.filter((d) => recipeChain(d).some((x) => x.station === 'coldBrewTap'));

/** Every supply a drink uses, from scratch, in first-use order. */
export function suppliesFor(drink: DrinkId): SupplyId[] {
  const out: SupplyId[] = [];
  for (const { recipe } of recipeChain(drink)) for (const s of recipe.consumes) if (!out.includes(s)) out.push(s);
  return out;
}
