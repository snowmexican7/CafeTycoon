import { Container, Graphics } from 'pixi.js';
import { glow } from './draw';

const LAMPS_X = [256, 448, 600];

/** Pendant lamp fixtures (always) — drawn over the wall, under the lighting. */
export function buildLamps(): Graphics {
  const g = new Graphics();
  for (const x of LAMPS_X) {
    g.moveTo(x, 0).lineTo(x, 14).stroke({ width: 2, color: 0x3a2418 });
    g.moveTo(x - 13, 26).quadraticCurveTo(x, 10, x + 13, 26).closePath().fill(0x2f3b36);
    g.ellipse(x, 27, 6, 3).fill(0xffe2a0);
  }
  return g;
}

/**
 * Lighting over the whole scene: soft sun by day; a blue-violet night tint with warm lamp pools at night;
 * a gentle vignette always. Only `setNight` changes anything, so the layer is cheap.
 */
export class Lighting {
  readonly root = new Container();
  private readonly day = new Graphics();
  private readonly night = new Container();
  private isNight: boolean | null = null;

  constructor(width: number, height: number) {
    this.day.rect(width * 0.35, -height * 0.55, width * 1.3, height * 1.2).fill(glow('255,242,207', 0.5));
    const tint = new Graphics();
    tint.rect(0, 0, width, height).fill({ color: 0x1d1640, alpha: 0.52 });
    const pools = new Graphics();
    for (const x of LAMPS_X) pools.ellipse(x, 210, 150, 175).fill(glow('255,210,126', 0.42));
    pools.blendMode = 'add';
    const bulbs = new Graphics();
    for (const x of LAMPS_X) bulbs.ellipse(x, 28, 16, 9).fill(glow('255,226,160', 0.9));
    bulbs.blendMode = 'add';
    this.night.addChild(tint, pools, bulbs);
    const vignette = new Graphics();
    // soft warm edge darkening built from thin inset strokes (gradient alpha stops render too heavy in Pixi)
    for (let i = 0; i < 14; i++) vignette.rect(i * 3 + 1.5, i * 3 + 1.5, width - i * 6 - 3, height - i * 6 - 3).stroke({ width: 3, color: 0x2a1608, alpha: 0.05 * (1 - i / 14) ** 1.6 });
    this.root.addChild(this.day, this.night, vignette);
    this.setNight(false);
  }

  setNight(night: boolean): void {
    if (night === this.isNight) return;
    this.isNight = night;
    this.day.visible = !night;
    this.night.visible = night;
  }
}
