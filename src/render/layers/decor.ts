import { Container, Graphics } from 'pixi.js';
import { MAT, PALETTE, sx, sy } from '../theme';
import { label, shadow } from './draw';

/**
 * Depth-sorted decorations. They sit only on tiles nobody can walk on: the queue rope runs along the
 * floor's front edge (the sim boundary) and the plant + sandwich board stand in the render-only front margin.
 */
export function buildDecor(width: number, floorHeightTiles: number): Container[] {
  const edge = sy(floorHeightTiles);

  const rope = new Graphics();
  const ry = edge - 2;
  const posts = [4.6, 6.6, 8.6, 10.6].map(sx).concat([width - 10]);
  rope.moveTo(posts[0], ry - 18);
  for (let i = 1; i < posts.length; i++) {
    const mid = (posts[i - 1] + posts[i]) / 2;
    rope.quadraticCurveTo(mid, ry - 4, posts[i], ry - 18);
  }
  rope.stroke({ width: 4, color: 0xb8343a, cap: 'round' });
  for (const x of posts) {
    rope.ellipse(x, ry, 9, 4).fill({ color: 0x000000, alpha: 0.19 });
    rope.roundRect(x - 2.5, ry - 24, 5, 24, 2).fill(0xd6b25c);
    rope.circle(x, ry - 25, 5).fill(0xf1cf6e);
  }
  rope.zIndex = ry;

  const plant = new Container();
  const pg = new Graphics();
  const px = sx(0.55);
  const py = edge + 46;
  shadow(pg, px, py, 22, 7);
  pg.poly([px - 14, py, px - 17, py - 24, px + 17, py - 24, px + 14, py]).fill(0xd9774f);
  pg.roundRect(px - 18, py - 28, 36, 7, 3).fill(0xc0653f);
  for (const [dx, dy, r] of [[-14, -48, 12], [8, -52, 13], [-3, -66, 14], [12, -36, 10], [-16, -34, 10]]) pg.ellipse(px + dx, py + dy, r, r * 0.7).fill(r > 12 ? 0x6fb36b : 0x82c47c);
  plant.addChild(pg);
  plant.zIndex = py;

  const board = new Container();
  const bg = new Graphics();
  const bx = sx(2.1);
  const by = edge + 48;
  shadow(bg, bx, by, 20, 5);
  bg.poly([bx, by - 40, bx - 14, by, bx + 14, by]).fill(0xe3c9a2);
  bg.roundRect(bx - 22, by - 52, 44, 40, 6).fill(MAT.chalk).stroke({ width: 4, color: MAT.frame });
  const t1 = label('TODAY', 9, 0xf6efe2, '600');
  t1.position.set(bx, by - 39);
  const t2 = label('fresh!', 8, PALETTE.honey, '800');
  t2.position.set(bx, by - 26);
  board.addChild(bg, t1, t2);
  board.zIndex = by;

  return [rope, plant, board];
}
