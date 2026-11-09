/**
 * How full the milk counter's shelf looks. The count bubble already shows the number; the
 * cartons on the shelf follow the same stock (`GameState.supplyMilk`). A carton from the
 * fridge is `FRIDGE.carton` servings (8).
 */
import { FRIDGE } from '../sim/fridge';

export type MilkShelfLevel = 'empty' | 'low' | 'partial' | 'full';

/** 0 empty, 1–2 a splash (low), 3 up to a carton (partial), a full carton or more (full). */
export function milkShelfLevel(servings: number | undefined): MilkShelfLevel {
  const n = Math.floor(typeof servings === 'number' && Number.isFinite(servings) ? servings : 0);
  if (n <= 0) return 'empty';
  if (n <= 2) return 'low';
  if (n < FRIDGE.carton) return 'partial';
  return 'full';
}

/** What the shelf draws for a level. The station art follows this so the picture and the tests agree. */
export interface MilkShelfParts {
  /** A jug on the top shelf, full or half poured. */
  jug: 'full' | 'half' | 'none';
  /** Cartons standing on the shelves. */
  cartons: number;
  /** The only carton is a short one with a little milk in the bottom (low). */
  short: boolean;
}

export function milkShelfParts(level: MilkShelfLevel): MilkShelfParts {
  switch (level) {
    case 'full':
      return { jug: 'full', cartons: 2, short: false };
    case 'partial':
      return { jug: 'half', cartons: 1, short: false };
    case 'low':
      return { jug: 'none', cartons: 1, short: true };
    case 'empty':
      return { jug: 'none', cartons: 0, short: false };
  }
}
