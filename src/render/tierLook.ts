import { layoutFor, LAYOUT } from '../data/layout';
import { TIER_IDS, TIERS } from '../sim/growth';
import type { TierId } from '../sim/types';

/**
 * ui-3.4.0: each shop size gets its own scene. The stations, slots and line never move (TIER_LAYOUTS and
 * SLOT_POSITIONS as they are); only the backdrop, the ground, the back bar's skin and the props change.
 *
 *  - stand: outdoors on the sidewalk. A folding table, a market umbrella, pavement slabs, a brick kerb strip, the
 *    street edge, a lamppost, plant pots and a chalk A-frame. The line waits on the sidewalk.
 *  - cart: a coffee cart on a park plaza. Painted cart panels on little wheels, a striped awning, string lights,
 *    trees and a hedge behind, cobbles and a gravel path in front.
 *  - cafe: the indoor café exactly as before.
 */
export type TierLook = 'stand' | 'cart' | 'cafe';

/** Absent tier = the café (every run before P3 B13). */
export function tierLook(tier: TierId | undefined | null): TierLook {
  return tier === 'stand' || tier === 'cart' ? tier : 'cafe';
}

/** Outdoor looks hide the café's wallpaper, planks, pendants, rug, doormat and queue rope. */
export function isOutdoor(look: TierLook): boolean {
  return look !== 'cafe';
}

/** The back bar's skin: a folding table at the stand, painted cart panels at the cart, wood cabinets in the café. */
export type BarSkin = 'table' | 'cart' | 'cabinet';
export function barSkin(look: TierLook): BarSkin {
  return look === 'stand' ? 'table' : look === 'cart' ? 'cart' : 'cabinet';
}

const money = (n: number) => `$${Math.round(n)}`;

/**
 * The FOR LEASE panel's lines for a tier: what the next size is and how to get it. Null at the café (no hoarding).
 * `narrow` is the cart's two-tile strip, so its lines are short.
 */
export function leaseLines(tier: TierId | undefined | null): { narrow: boolean; lines: string[] } | null {
  const t = tier ?? 'cafe';
  const next = TIER_IDS[TIER_IDS.indexOf(t) + 1];
  if (!next) return null;
  const tiles = LAYOUT.width - layoutFor(t).width;
  const narrow = tiles <= 2;
  const nt = TIERS[next];
  if (narrow) return { narrow, lines: ['FOR', 'LEASE', 'Next:', nt.short, money(nt.cost), `+${tiles} tiles`] };
  return { narrow, lines: ['FOR LEASE', `Room to grow: a ${nt.short}`, `${money(nt.cost)} · line of ${nt.queue} · ${Math.round(nt.price * 100)}% prices`, 'Extras ▸ Shopfront, any night'] };
}
