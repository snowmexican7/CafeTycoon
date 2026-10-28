import { Container, Graphics } from 'pixi.js';
import { MAT, WALL, sx, sy } from '../theme';
import { dashedEllipse, label } from './draw';

/**
 * The floor: wood planks for the work area, a checker-tile customer strip at the front, the rug and the
 * doormat. All of it is flat (actors walk over it); nothing here implies a blocked tile.
 */
export function buildFloor(width: number, height: number, door: { x: number; y: number }): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const top = WALL;
  const bottom = sy(7.15);
  const ph = 32;
  for (let y = top, row = 0; y < bottom; y += ph, row++) {
    const off = (row * 37) % 96;
    const h = Math.min(ph, bottom - y);
    for (let x = -off, i = 0; x < width; x += 96, i++) {
      g.rect(x, y, 96, h).fill(MAT.planks[(row + i) % 3]);
      g.rect(x, y, 2, h).fill({ color: MAT.seam, alpha: 0.7 });
      if ((row + i) % 4 === 1) g.ellipse(x + 60, y + 16, 5, 2).fill({ color: MAT.seam, alpha: 0.35 });
    }
    g.rect(0, y + ph - 2, width, 2).fill({ color: MAT.seam, alpha: 0.55 });
  }
  g.rect(0, top, width, 14).fill({ color: 0x3a2418, alpha: 0.12 }); // wall contact shadow

  // customer side: checker tiles to the bottom edge (includes the render-only front margin)
  const ts = 28;
  g.rect(0, bottom, width, height - bottom).fill(MAT.tileA);
  for (let y = bottom, r = 0; y < height; y += ts, r++) {
    for (let x = 0, c = 0; x < width; x += ts, c++) if ((r + c) % 2 === 0) g.rect(x, y, ts, Math.min(ts, height - y)).fill({ color: MAT.tileB, alpha: 0.55 });
  }
  g.rect(0, bottom - 3, width, 6).fill({ color: MAT.trim, alpha: 0.9 });

  // rug in the work area
  const rx = sx(4.7);
  const ry = sy(3.4);
  g.ellipse(rx, ry, 200, 92).fill({ color: 0xb9573f, alpha: 0.92 });
  g.ellipse(rx, ry, 170, 74).fill({ color: 0xc8644a, alpha: 0.8 });
  dashedEllipse(g, rx, ry, 184, 80, 2, 9, 0xf3cf9b, 3);
  g.ellipse(rx, ry, 150, 58).stroke({ width: 2, color: 0xe7a77b, alpha: 0.7 });

  // doormat at the door tile
  const dx = sx(door.x);
  const dy = sy(door.y + 0.3);
  g.roundRect(dx - 42, dy, 84, 40, 8).fill(0x6b8f5e);
  g.roundRect(dx - 36, dy + 6, 72, 28, 5).stroke({ width: 2, color: 0xa8c48f });
  const hello = label('HELLO', 12, 0xeef5df, '600');
  hello.position.set(dx, dy + 20);
  root.addChild(hello);
  return root;
}
