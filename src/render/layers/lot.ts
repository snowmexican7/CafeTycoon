import { Container, Graphics } from 'pixi.js';
import { LAYOUT, layoutFor } from '../../data/layout';
import type { TierId } from '../../sim/types';
import { FONT_BODY, FRONT, MAT, TILE, WALL } from '../theme';
import { leaseLines } from '../tierLook';
import { label } from './draw';

const LOT_W = LAYOUT.width * TILE;
const LOT_H = WALL + LAYOUT.height * TILE + FRONT;

/**
 * P3 B13: the part of the lot the shop hasn't grown into yet (plywood hoarding with a FOR LEASE sign),
 * and the striped awning over a stand or a cart. Render-only, drawn above the depth-sorted floor so the
 * queue rope and the window behind it disappear; nothing walks there (the sim's walls stop at the floor's width).
 */
export function buildLot(tier: TierId | undefined): Container {
  const root = new Container();
  const t = tier ?? 'cafe';
  if (t === 'cafe') return root;
  const x0 = layoutFor(t).width * TILE;
  const g = new Graphics();
  root.addChild(g);

  // awning over the serving side (ui-3.4.0: the cart only; the stand has a market umbrella, see outdoor.ts)
  if (t === 'cart') {
    const stripe = 0x3f9e80;
    const aw = 26;
    g.rect(0, 0, x0, aw).fill(0xfff4e2);
    for (let x = 0; x < x0; x += 32) g.rect(x, 0, 16, aw).fill(stripe);
    for (let x = 0; x < x0; x += 32) {
      g.moveTo(x, aw).arc(x + 8, aw, 8, Math.PI, 0, true).lineTo(x, aw).fill(stripe);
      g.moveTo(x + 16, aw).arc(x + 24, aw, 8, Math.PI, 0, true).lineTo(x + 16, aw).fill(0xfff4e2);
    }
    g.rect(0, aw + 8, x0, 3).fill({ color: 0x000000, alpha: 0.1 });
  }

  // hoarding: plywood panels from the top of the wall to the front edge
  const w = LOT_W - x0;
  g.rect(x0, 0, w, LOT_H).fill(0xcfae7e);
  for (let x = x0; x < LOT_W; x += 48) {
    g.rect(x, 0, 2, LOT_H).fill({ color: 0x8a6a42, alpha: 0.5 });
    for (let y = 30; y < LOT_H; y += 120) g.circle(x + 6, y, 1.6).fill(0x8a6a42);
  }
  for (let y = 0; y < LOT_H; y += 160) g.rect(x0, y, w, 2).fill({ color: 0x8a6a42, alpha: 0.35 });
  // grain
  for (let i = 0; i < 18; i++) {
    const gx = x0 + ((i * 53) % w);
    const gy = 40 + ((i * 97) % (LOT_H - 80));
    g.moveTo(gx, gy).quadraticCurveTo(gx + 14, gy + 3, gx + 28, gy).stroke({ width: 1, color: 0xb08d5e, alpha: 0.6 });
  }
  // the edge post and its shadow onto the plywood
  g.rect(x0, 0, 10, LOT_H).fill(MAT.trim);
  g.rect(x0 + 10, 0, 8, LOT_H).fill({ color: 0x000000, alpha: 0.14 });
  // hazard tape along the floor
  const ty = WALL + LAYOUT.height * TILE - 14;
  g.rect(x0 + 10, ty, w - 10, 12).fill(0xf6c35b);
  for (let x = x0 + 10; x < LOT_W; x += 20) g.poly([x, ty + 12, x + 10, ty, x + 16, ty, x + 6, ty + 12]).fill(0x3a2418);

  // FOR LEASE sign (a tall narrow one on the cart's two-tile strip)
  const cx = x0 + 9 + (w - 9) / 2;
  const lease = leaseLines(t)!;
  const narrow = lease.narrow;
  const sw = narrow ? w - 30 : Math.min(w - 36, 220);
  const sh = narrow ? 142 : 112;
  const sy0 = WALL + 40;
  g.roundRect(cx - sw / 2 - 4, sy0 - 4, sw + 8, sh + 8, 8).fill({ color: 0x000000, alpha: 0.18 });
  g.roundRect(cx - sw / 2, sy0, sw, sh, 6).fill(0xfffaf2).stroke({ width: 3, color: 0xb8343a });
  // ui-3.4.0: the panel says what the next size is, what it costs and where to buy it (leaseLines).
  const red = 0xb8343a;
  const ink = 0x4a3523;
  const soft = 0x8a7560;
  const styles: [number, number, '700' | '800', string | undefined][] = narrow
    ? [[18, red, '800', undefined], [18, red, '800', undefined], [10, ink, '800', FONT_BODY], [11, ink, '800', FONT_BODY], [13, 0x2f8c70, '800', undefined], [10, soft, '700', FONT_BODY]]
    : [[22, red, '800', undefined], [13, ink, '800', FONT_BODY], [10, soft, '700', FONT_BODY], [10, 0x2f8c70, '800', FONT_BODY]];
  const gaps = narrow ? [20, 42, 68, 83, 102, 124] : [24, 52, 74, 94];
  lease.lines.forEach((text, i) => {
    const [size, color, weight, font] = styles[i]!;
    const l = font ? label(text, size, color, weight, font) : label(text, size, color, weight);
    l.position.set(cx, sy0 + gaps[i]!);
    root.addChild(l);
  });

  // a poster and a cone
  const py = WALL + (narrow ? 250 : 230);
  const pw = Math.min(88, w - 40);
  g.roundRect(cx - pw / 2, py, pw, 70, 4).fill(0xf3dfc1).stroke({ width: 2, color: 0x8a6a42 });
  g.circle(cx, py + 28, 16).fill(0x6b4430);
  g.ellipse(cx, py + 22, 11, 5).fill(0xfff4e2);
  const soon = label(narrow ? 'SOON' : 'COMING SOON', 9, 0x3a2418, '800');
  soon.position.set(cx, py + 58);
  root.addChild(soon);
  const kx = x0 + 40;
  const ky = WALL + LAYOUT.height * TILE + 30;
  g.ellipse(kx, ky + 4, 18, 5).fill({ color: 0x000000, alpha: 0.2 });
  g.poly([kx - 12, ky, kx - 4, ky - 34, kx + 4, ky - 34, kx + 12, ky]).fill(0xf08a3c);
  g.rect(kx - 8, ky - 20, 16, 5).fill(0xfff4e2);
  g.roundRect(kx - 16, ky - 2, 32, 5, 2).fill(0xd06a26);
  return root;
}
