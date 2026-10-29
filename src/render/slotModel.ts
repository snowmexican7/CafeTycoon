/**
 * FB1 WP5: which back-bar slots are empty, for the renderer's plinths. Pure (no Pixi), so it is unit-tested.
 * A slot is empty when no station stands on its tile; that is the same as `slots[i] === null`, because the
 * floor's stations are rebuilt from the slots.
 */
import { SLOT_POSITIONS } from '../data/layout';
import type { Station, TierId, Vec2 } from '../sim/types';

export function emptySlotPositions(tier: TierId | undefined, stations: readonly Pick<Station, 'pos'>[]): Vec2[] {
  return SLOT_POSITIONS[tier ?? 'cafe'].filter((p) => !stations.some((s) => s.pos.x === p.x && s.pos.y === p.y)).map((p) => ({ ...p }));
}
