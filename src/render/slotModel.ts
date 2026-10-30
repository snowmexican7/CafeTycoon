/**
 * FB1 WP5: which back-bar slots are empty, for the renderer's plinths. Pure (no Pixi), so it is unit-tested.
 * A slot is empty when no station stands on its tile; that is the same as `slots[i] === null`, because the
 * floor's stations are rebuilt from the slots.
 */
import { SLOT_POSITIONS } from '../data/layout';
import type { DrinkId, GameState, Station, TierId, Vec2 } from '../sim/types';
import { menuPrice } from '../sim/pricing';
import { menuDrinks } from '../sim/unlocks';

export function emptySlotPositions(tier: TierId | undefined, stations: readonly Pick<Station, 'pos'>[]): Vec2[] {
  return SLOT_POSITIONS[tier ?? 'cafe'].filter((p) => !stations.some((s) => s.pos.x === p.x && s.pos.y === p.y)).map((p) => ({ ...p }));
}

/**
 * The number badge each station gets (1 = no badge). Gear G9 twins never get one and are not counted, so a
 * separate steamer next to a dual boiler's built-in wand stays "steamer", not "steamer 2".
 */
export function stationBadges(stations: readonly { kind: string; twin?: boolean }[]): number[] {
  const seen: Record<string, number> = {};
  return stations.map((s) => (s.twin ? 1 : (seen[s.kind] = (seen[s.kind] ?? 0) + 1)));
}

/** Short chalk names for the wall menu (it is 86 px wide). */
const WALL_NAME: Record<DrinkId, string> = {
  espresso: 'Espresso', latte: 'Latte', coldBrew: 'Cold brew', icedLatte: 'Iced latte', mocha: 'Mocha', matcha: 'Matcha', special: 'Special',
  drip: 'Drip', americano: 'Americano', cappuccino: 'Cappuccino', doppio: 'Doppio', sweetCream: 'Sw. cream', cafeAuLait: 'Au lait', redEye: 'Red-eye', pourOver: 'Pour-over',
};
export const WALL_MENU_ROWS = 4;

/**
 * The wall chalkboard's rows: what's on tonight's menu and can be made, at today's price (price mods
 * included, as on the HUD). At most four rows; a fifth or later drink becomes "+N more".
 */
export function wallMenuRows(state: GameState, priceMod: Partial<Record<DrinkId, number>> = {}): [string, string][] {
  const ids = menuDrinks(state);
  const rows = ids.map((d): [string, string] => [WALL_NAME[d] ?? d, (menuPrice(state, d) * (priceMod[d] ?? 1)).toFixed(2)]);
  if (rows.length <= WALL_MENU_ROWS) return rows;
  return [...rows.slice(0, WALL_MENU_ROWS - 1), [`+${rows.length - WALL_MENU_ROWS + 1} more`, '']];
}
