/**
 * FB2 C10: ghost outlines for valid set-down tiles while carrying a machine in the pre-open.
 * Pure model + a thin Pixi layer; spots are set once on pickup (not recomputed every frame).
 * ui-3.8.0 polish: nearest spots stay bright; farther ones dim so the floor isn't a green carpet.
 */
import { Container, Graphics } from 'pixi.js';
import type { Vec2 } from '../sim/types';
import { PALETTE, sx, sy } from './theme';
import { dashedEllipse, shadow } from './layers/draw';

/** Full-bright outlines for the nearest this many tiles (rest are dim). */
export const GHOST_NEAR = 8;

export function ghostSpotKey(spots: readonly Vec2[] | null | undefined, from?: Vec2 | null): string {
  const base = spots?.map((s) => `${s.x},${s.y}`).join('|') ?? '';
  return from ? `${base}@${from.x.toFixed(1)},${from.y.toFixed(1)}` : base;
}

/** Rank spots by distance to `from` (tile centre). Absent `from` keeps input order. */
export function rankGhostSpots(spots: readonly Vec2[], from?: Vec2 | null): Vec2[] {
  if (!from || spots.length <= 1) return [...spots];
  return [...spots].sort((a, b) => {
    const da = (a.x + 0.5 - from.x) ** 2 + (a.y + 0.5 - from.y) ** 2;
    const db = (b.x + 0.5 - from.x) ** 2 + (b.y + 0.5 - from.y) ** 2;
    return da - db;
  });
}

/** Build (or rebuild) dashed green plinths for each valid set-down tile. */
export class GhostSpots {
  readonly root = new Container();
  private key = '';

  setSpots(spots: readonly Vec2[] | null, from?: Vec2 | null): void {
    const key = ghostSpotKey(spots, from);
    if (key === this.key) return;
    this.key = key;
    for (const c of this.root.removeChildren()) c.destroy({ children: true });
    if (!spots?.length) return;
    const ranked = rankGhostSpots(spots, from);
    ranked.forEach((pos, i) => {
      const near = i < GHOST_NEAR;
      const alpha = near ? 0.9 : Math.max(0.18, 0.55 - (i - GHOST_NEAR) * 0.04);
      const fillA = near ? 0.22 : 0.08;
      const g = new Graphics();
      const cx = sx(pos.x);
      const cy = sy(pos.y);
      shadow(g, cx, cy + 28, 26, 7);
      g.roundRect(cx - 24, cy + 6, 48, 22, 6).fill({ color: PALETTE.mint, alpha: fillA });
      dashedEllipse(g, cx, cy + 17, 22, 8, 7, 5, PALETTE.mint, near ? 2.5 : 1.5, alpha);
      g.zIndex = 0;
      this.root.addChild(g);
    });
  }
}
