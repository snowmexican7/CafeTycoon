import { layoutFor, LAYOUT } from '../data/layout';
import { TIER_IDS, TIERS } from '../sim/growth';
import type { TierId } from '../sim/types';

/**
 * Each shop size gets its own scene. The stations, slots and line never move (TIER_LAYOUTS and
 * SLOT_POSITIONS as they are); only the backdrop, the ground, the back bar's skin and the props change.
 * Both outdoor shops sit on the sidewalk. The park is not a home for either.
 *
 *  - cart: the small start, on the sidewalk. Painted cart panels on little wheels, a striped awning,
 *    string lights, pavement slabs, a brick kerb and the street. The line waits on the sidewalk.
 *  - stand: a fixed stall on the same street, wider. Wood stall panels (no wheels), a solid awning,
 *    a stall sign. No folding table, no park plaza.
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

/** The back bar's skin: cart panels on the cart, a fixed wood stall on the stand, wood cabinets in the café. */
export type BarSkin = 'stall' | 'cart' | 'cabinet';
export function barSkin(look: TierLook): BarSkin {
  return look === 'cart' ? 'cart' : look === 'stand' ? 'stall' : 'cabinet';
}

const money = (n: number) => `$${Math.round(n)}`;

/**
 * The FOR LEASE panel's lines for a tier: what the next size is and how to get it. Null at the café (no hoarding).
 * `narrow` is the stand's two-tile strip, so its lines are short. The cart's hoarding names the Stand.
 */
export function leaseLines(tier: TierId | undefined | null): { narrow: boolean; lines: string[] } | null {
  const t = tier ?? 'cafe';
  const next = TIER_IDS[TIER_IDS.indexOf(t) + 1];
  if (!next) return null;
  const tiles = LAYOUT.width - layoutFor(t).width;
  const narrow = tiles <= 2;
  const nt = TIERS[next];
  const name = next === 'cafe' ? 'Café' : next === 'stand' ? 'Stand' : 'Cart';
  if (narrow) return { narrow, lines: ['FOR', 'LEASE', 'Next:', name, money(nt.cost), `+${tiles} tiles`] };
  return { narrow, lines: ['FOR LEASE', `Room to grow: a ${name}`, `${money(nt.cost)} · line of ${nt.queue} · ${Math.round(nt.price * 100)}% prices`, 'Extras ▸ Shopfront, any night'] };
}
