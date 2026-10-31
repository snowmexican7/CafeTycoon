/**
 * FB2 C10: ghost outlines for valid set-down tiles while carrying a machine in the pre-open.
 * Pure model + a thin Pixi layer; spots are set once on pickup (not recomputed every frame).
 */
import { Container, Graphics } from 'pixi.js';
import type { Vec2 } from '../sim/types';
import { PALETTE, sx, sy } from './theme';
import { dashedEllipse, shadow } from './layers/draw';

export function ghostSpotKey(spots: readonly Vec2[] | null | undefined): string {
  return spots?.map((s) => `${s.x},${s.y}`).join('|') ?? '';
}

/** Build (or rebuild) dashed green plinths for each valid set-down tile. */
export class GhostSpots {
  readonly root = new Container();
  private key = '';

  setSpots(spots: readonly Vec2[] | null): void {
    const key = ghostSpotKey(spots);
    if (key === this.key) return;
    this.key = key;
    for (const c of this.root.removeChildren()) c.destroy({ children: true });
    if (!spots?.length) return;
    for (const pos of spots) {
      const g = new Graphics();
      const cx = sx(pos.x);
      const cy = sy(pos.y);
      shadow(g, cx, cy + 28, 26, 7);
      g.roundRect(cx - 24, cy + 6, 48, 22, 6).fill({ color: PALETTE.mint, alpha: 0.22 });
      dashedEllipse(g, cx, cy + 17, 22, 8, 7, 5, PALETTE.mint, 2.5, 0.9);
      g.zIndex = 0;
      this.root.addChild(g);
    }
  }
}
