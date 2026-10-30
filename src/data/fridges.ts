/**
 * FB2 A4 (Kennedy's ruling, 2026-10-30): the fridge follows the café size. It is not a gear line in the night shop.
 *  - The stand starts with no fridge; the Dorm Room Cube (f1) is a one-time buy (a single card).
 *  - Growing into the cart gives the Garage Beer Fridge (f2) free; growing into the café gives the Chrome Reach-In (f3).
 *  - The Udder-Matic 3000 (f4) is a paid extra, offered as a single card once the shop is a café.
 *  - Fridges are never sold or downgraded.
 * Data only; the rules are in src/sim/fridge.ts.
 *
 * Per fridge: `holds` milk (the restock cap), `spoil` × tonight's milk spoil inside it, `auto` = the milk out at the bar
 * tops itself up from the fridge and goes back by itself at close.
 */
import type { TierId } from '../sim/types';

export type FridgeId = 'f1' | 'f2' | 'f3' | 'f4';

export interface FridgeInfo {
  id: FridgeId;
  /** Order: a higher rank is a better fridge (the shop's own fridge is the best of what was bought and what the tier gives). */
  rank: number;
  name: string;
  /** What the card costs (0 = comes with the shop size, never sold). */
  price: number;
  sticker: string;
  holds: number;
  spoil: number;
  auto?: true;
  blurb: string;
}

export const FRIDGES: Record<FridgeId, FridgeInfo> = {
  f1: { id: 'f1', rank: 1, name: 'Dorm Room Cube', price: 20, sticker: '$89', holds: 24, spoil: 1, blurb: 'A mini fridge with a freezer box the size of a sandwich. Holds 24 milk, and keeps the condiment bar overnight.' },
  f2: { id: 'f2', rank: 2, name: 'Garage Beer Fridge', price: 0, sticker: '$250', holds: 48, spoil: 1, blurb: 'Came with the cart. Still has a faded beer logo on the door. Holds 48 milk.' },
  f3: { id: 'f3', rank: 3, name: 'Chrome Reach-In', price: 0, sticker: '$2,400', holds: 96, spoil: 0.5, blurb: 'Came with the café. Holds 96 milk, and half as much goes off overnight.' },
  f4: { id: 'f4', rank: 4, name: 'Udder-Matic 3000', price: 320, sticker: '$6,000', holds: 128, spoil: 0.25, auto: true, blurb: 'Holds 128 milk, barely lets any go off, and pours milk to the bar by itself. It moos when the door is left open.' },
};

export const FRIDGE_IDS = Object.keys(FRIDGES) as FridgeId[];
export const isFridgeId = (x: unknown): x is FridgeId => typeof x === 'string' && Object.prototype.hasOwnProperty.call(FRIDGES, x);

/** The fridge each shop size comes with (the stand has none). */
export const TIER_FRIDGE: Record<TierId, FridgeId | null> = { stand: null, cart: 'f2', cafe: 'f3' };

/** The two fridge cards and where they are offered: the cube at a shop with no fridge, the Udder-Matic at the café. */
export const FRIDGE_CARDS: { id: FridgeId; tier: TierId }[] = [
  { id: 'f1', tier: 'stand' },
  { id: 'f4', tier: 'cafe' },
];
