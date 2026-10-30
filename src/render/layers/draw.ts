import { FillGradient, Graphics, Text } from 'pixi.js';
import type { ItemKind } from '../../sim/types';
import { FONT_DISPLAY, MAT, PALETTE } from '../theme';

/** Small Graphics helpers shared by every layer. Pure drawing; no game logic. */

export function shadow(g: Graphics, x: number, y: number, rx = 36, ry = 9, alpha = 0.22): void {
  g.ellipse(x, y, rx, ry).fill({ color: MAT.shadow, alpha });
}

/** A dashed ellipse outline (Pixi has no native dashes). */
export function dashedEllipse(g: Graphics, cx: number, cy: number, rx: number, ry: number, dash: number, gap: number, color: number, width: number, alpha = 1): void {
  const circumference = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const step = (dash + gap) / circumference;
  const on = dash / circumference;
  for (let t = 0; t < 1; t += step) {
    const a0 = t * Math.PI * 2;
    const a1 = Math.min(t + on, 1) * Math.PI * 2;
    g.moveTo(cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry);
    const n = 4;
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      g.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    }
  }
  g.stroke({ width, color, alpha, cap: 'round' });
}

/** Upper half of an ellipse, closed along its base (cap domes, lamp shades, bells). */
export function halfDome(g: Graphics, cx: number, baseY: number, rx: number, ry: number): Graphics {
  const pts: number[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI + (Math.PI * i) / 16;
    pts.push(cx + Math.cos(a) * rx, baseY + Math.sin(a) * ry);
  }
  return g.poly(pts);
}

/** Horizontal metal/plastic sheen: dark → light → dark across the shape (local texture space). */
export function sheen(stops: [number, number, number]): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    colorStops: [
      { offset: 0, color: stops[0] },
      { offset: 0.45, color: stops[1] },
      { offset: 1, color: stops[2] },
    ],
    textureSpace: 'local',
  });
}

export function vertical(top: number, bottom: number): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: top },
      { offset: 1, color: bottom },
    ],
    textureSpace: 'local',
  });
}

/** Radial glow from `rgb` at `alpha` in the centre to transparent at the edge. */
export function glow(rgb: string, alpha: number): FillGradient {
  return new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    colorStops: [
      { offset: 0, color: `rgba(${rgb},${alpha})` },
      { offset: 1, color: `rgba(${rgb},0)` },
    ],
    textureSpace: 'local',
  });
}

export function label(text: string, size: number, fill: number, weight: '500' | '600' | '700' | '800' = '600', family = FONT_DISPLAY, letterSpacing = 0): Text {
  const t = new Text({ text, style: { fontFamily: family, fontWeight: weight, fontSize: size, fill, letterSpacing } });
  t.anchor.set(0.5, 0.5);
  return t;
}

export const CHROME = sheen([0xb7c3c9, 0xf6fafb, 0x9fadb4]);

/** A held/finished item icon centred on (x, y), scaled by k. */
export function drawItem(g: Graphics, kind: ItemKind, x: number, y: number, k = 1): void {
  const X = (dx: number) => x + dx * k;
  const Y = (dy: number) => y + dy * k;
  const cupStroke = { width: 1, color: 0xe5d6c2 };
  if (kind === 'grounds') {
    g.roundRect(X(2), Y(-3), 14 * k, 5 * k, 2.5 * k).fill(0x2b2b30);
    g.ellipse(X(-4), Y(0), 10 * k, 6 * k).fill(MAT.chrome).stroke({ width: 1, color: 0x7d8a91 });
    g.ellipse(X(-4), Y(-1), 7 * k, 3.6 * k).fill(0x5b3a24);
  } else if (kind === 'espresso') {
    g.ellipse(X(0), Y(6), 12 * k, 3.5 * k).fill(0xffffff).stroke(cupStroke);
    g.poly([X(-7), Y(-6), X(7), Y(-6), X(5), Y(5), X(-5), Y(5)]).fill(0xffffff).stroke(cupStroke);
    g.ellipse(X(0), Y(-6), 7 * k, 2.2 * k).fill(0x5a3320);
    g.moveTo(X(7), Y(-3)).quadraticCurveTo(X(12), Y(-2), X(8), Y(2)).stroke({ width: 2.4 * k, color: 0xffffff });
  } else if (kind === 'latte') {
    g.poly([X(-8), Y(-12), X(8), Y(-12), X(6), Y(8), X(-6), Y(8)]).fill(0xffffff).stroke(cupStroke);
    g.rect(X(-7.6), Y(-6), 15.2 * k, 6 * k).fill({ color: PALETTE.cherry, alpha: 0.85 });
    g.ellipse(X(0), Y(-12), 8 * k, 2.6 * k).fill(0xe9c79c);
    g.ellipse(X(0), Y(-12.4), 2.6 * k, 1.2 * k).fill(0xffffff);
  } else if (kind === 'coldBrew') {
    g.poly([X(-8), Y(-12), X(8), Y(-12), X(6), Y(8), X(-6), Y(8)]).fill({ color: 0xc9e7f7, alpha: 0.9 }).stroke({ width: 1, color: 0x9fc9e2 });
    g.poly([X(-7.3), Y(-6), X(7.3), Y(-6), X(5.9), Y(7.5), X(-5.9), Y(7.5)]).fill(0x5b3420);
    g.roundRect(X(-5), Y(-5), 5 * k, 5 * k, k).fill({ color: 0xe6f5ff, alpha: 0.85 });
    g.roundRect(X(1), Y(-2), 4.5 * k, 4.5 * k, k).fill({ color: 0xe6f5ff, alpha: 0.8 });
    g.poly([X(2), Y(-21), X(4.6), Y(-20.5), X(4.2), Y(-7), X(1.6), Y(-7.5)]).fill(PALETTE.mint);
  } else if (kind === 'icedLatte') {
    g.poly([X(-8), Y(-12), X(8), Y(-12), X(6), Y(8), X(-6), Y(8)]).fill({ color: 0xc9e7f7, alpha: 0.9 }).stroke({ width: 1, color: 0x9fc9e2 });
    g.poly([X(-7.5), Y(-8), X(7.5), Y(-8), X(5.9), Y(7.5), X(-5.9), Y(7.5)]).fill(0xc89a6a);
    g.poly([X(-6.8), Y(-1), X(6.8), Y(-1), X(5.9), Y(7.5), X(-5.9), Y(7.5)]).fill({ color: 0xe8d2b4, alpha: 0.8 });
    g.roundRect(X(-5), Y(-7), 5 * k, 5 * k, k).fill({ color: 0xe6f5ff, alpha: 0.85 });
    g.roundRect(X(1), Y(-4), 4.5 * k, 4.5 * k, k).fill({ color: 0xe6f5ff, alpha: 0.8 });
    g.poly([X(2), Y(-21), X(4.6), Y(-20.5), X(4.2), Y(-7), X(1.6), Y(-7.5)]).fill(PALETTE.cherry);
  } else if (kind === 'mocha') {
    g.poly([X(-8), Y(-10), X(8), Y(-10), X(6), Y(8), X(-6), Y(8)]).fill(0xffffff).stroke(cupStroke);
    g.rect(X(-7.6), Y(-4), 15.2 * k, 6 * k).fill({ color: 0x6b3a22, alpha: 0.9 });
    for (const [cx, cy, r] of [[-4, -11, 4], [3, -11, 4.5], [0, -15, 3.6]]) g.circle(X(cx), Y(cy), r * k).fill(0xfff8ee).stroke({ width: 1, color: 0xead9c2 });
    g.moveTo(X(-5), Y(-12)).quadraticCurveTo(X(-2), Y(-15), X(0), Y(-12)).quadraticCurveTo(X(3), Y(-15), X(5), Y(-12)).stroke({ width: 1.6 * k, color: 0x6b3a22 });
  } else if (kind === 'matcha') {
    g.poly([X(-8), Y(-12), X(8), Y(-12), X(6), Y(8), X(-6), Y(8)]).fill(0xffffff).stroke(cupStroke);
    g.rect(X(-7.6), Y(-6), 15.2 * k, 6 * k).fill({ color: 0x6fa84a, alpha: 0.9 });
    g.ellipse(X(0), Y(-12), 8 * k, 2.6 * k).fill(0xa8d07a);
    g.ellipse(X(0), Y(-12.4), 3 * k, 1.2 * k).fill(0xe9f5dc);
  } else if (kind === 'special') {
    g.poly([X(-8), Y(-12), X(8), Y(-12), X(6), Y(8), X(-6), Y(8)]).fill({ color: 0xc9e7f7, alpha: 0.9 }).stroke({ width: 1, color: 0x9fc9e2 });
    g.poly([X(-7.3), Y(-4), X(7.3), Y(-4), X(5.9), Y(7.5), X(-5.9), Y(7.5)]).fill(0x5b3420);
    g.poly([X(-7.9), Y(-12), X(7.9), Y(-12), X(7.3), Y(-4), X(-7.3), Y(-4)]).fill(0xf2c48d);
    const leaf: number[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / 5;
      const r = (i % 2 === 0 ? 4.2 : 1.9) * k;
      leaf.push(X(0) + Math.cos(a) * r, Y(-16) + Math.sin(a) * r);
    }
    g.poly(leaf).fill(0xd9542b);
  } else if (kind === 'americano') {
    // G6: a tall black coffee in a white mug with a curl of steam.
    g.poly([X(-7), Y(-11), X(7), Y(-11), X(6), Y(8), X(-6), Y(8)]).fill(0xffffff).stroke(cupStroke);
    g.ellipse(X(0), Y(-11), 7 * k, 2.3 * k).fill(0x3e2416);
    g.moveTo(X(7), Y(-7)).quadraticCurveTo(X(13), Y(-5), X(7), Y(2)).stroke({ width: 2.4 * k, color: 0xffffff });
    g.moveTo(X(-2), Y(-14)).quadraticCurveTo(X(-5), Y(-18), X(-1), Y(-21)).stroke({ width: 1.4 * k, color: 0xffffff, alpha: 0.7 });
  } else if (kind === 'cappuccino') {
    // G6: a wide cup with a tall dome of foam and a cocoa dusting.
    g.ellipse(X(0), Y(7), 11 * k, 3 * k).fill(0xffffff).stroke(cupStroke);
    g.poly([X(-9), Y(-6), X(9), Y(-6), X(6), Y(6), X(-6), Y(6)]).fill(0xffffff).stroke(cupStroke);
    g.rect(X(-8.4), Y(-2), 16.8 * k, 4 * k).fill({ color: 0x4c8fd6, alpha: 0.85 });
    g.ellipse(X(0), Y(-7), 9 * k, 5.5 * k).fill(0xfff8ee).stroke({ width: 1, color: 0xead9c2 });
    for (const [cx, cy] of [[-3, -8], [1, -10], [3, -7]]) g.circle(X(cx), Y(cy), 0.9 * k).fill(0x8a5a3a);
  } else if (kind === 'drip') {
    // G4d follow-up: a diner mug of filter coffee.
    g.poly([X(-7), Y(-9), X(7), Y(-9), X(7), Y(8), X(-7), Y(8)]).fill(0xe8e1d6).stroke({ width: 1, color: 0xc9bca8 });
    g.rect(X(-7), Y(-3), 14 * k, 3 * k).fill({ color: PALETTE.mint, alpha: 0.9 });
    g.ellipse(X(0), Y(-9), 7 * k, 2.2 * k).fill(0x4a2a18);
    g.moveTo(X(7), Y(-5)).quadraticCurveTo(X(13), Y(-3), X(7), Y(4)).stroke({ width: 2.6 * k, color: 0xe8e1d6 });
  } else if (kind === 'doppio') {
    // G6c: a demitasse, two crema rings, a gold band.
    g.ellipse(X(0), Y(6), 13 * k, 3.6 * k).fill(0xffffff).stroke(cupStroke);
    g.poly([X(-8), Y(-7), X(8), Y(-7), X(6), Y(5), X(-6), Y(5)]).fill(0xffffff).stroke(cupStroke);
    g.rect(X(-7.4), Y(-2), 14.8 * k, 2.4 * k).fill(0xd9a63a);
    g.ellipse(X(0), Y(-7), 8 * k, 2.4 * k).fill(0x3a1e10);
    g.ellipse(X(0), Y(-7.2), 4.5 * k, 1.2 * k).fill(0xc98a4a);
    g.moveTo(X(8), Y(-4)).quadraticCurveTo(X(13), Y(-3), X(9), Y(2)).stroke({ width: 2.4 * k, color: 0xffffff });
  } else if (kind === 'sweetCream') {
    // G6c: cold brew with a white float of sweet cream.
    g.poly([X(-8), Y(-12), X(8), Y(-12), X(6), Y(8), X(-6), Y(8)]).fill({ color: 0xc9e7f7, alpha: 0.9 }).stroke({ width: 1, color: 0x9fc9e2 });
    g.poly([X(-7.3), Y(-4), X(7.3), Y(-4), X(5.9), Y(7.5), X(-5.9), Y(7.5)]).fill(0x5b3420);
    g.poly([X(-7.9), Y(-12), X(7.9), Y(-12), X(7.3), Y(-4), X(-7.3), Y(-4)]).fill(0xfff4e0);
    g.poly([X(2), Y(-21), X(4.6), Y(-20.5), X(4.2), Y(-7), X(1.6), Y(-7.5)]).fill(PALETTE.cherry);
  } else if (kind === 'cafeAuLait') {
    // G6c: a wide bowl-cup of milky coffee.
    g.ellipse(X(0), Y(7), 12 * k, 3 * k).fill(0xe8e1d6).stroke({ width: 1, color: 0xc9bca8 });
    g.poly([X(-10), Y(-7), X(10), Y(-7), X(7), Y(6), X(-7), Y(6)]).fill(0xe8e1d6).stroke({ width: 1, color: 0xc9bca8 });
    g.rect(X(-9), Y(-2), 18 * k, 3 * k).fill({ color: PALETTE.mint, alpha: 0.9 });
    g.ellipse(X(0), Y(-7), 10 * k, 2.6 * k).fill(0xb07a50);
  } else if (kind === 'redEye') {
    // G6c: a diner mug of drip with a red stripe and a crema dot on top.
    g.poly([X(-7), Y(-9), X(7), Y(-9), X(7), Y(8), X(-7), Y(8)]).fill(0xe8e1d6).stroke({ width: 1, color: 0xc9bca8 });
    g.rect(X(-7), Y(-3), 14 * k, 3 * k).fill({ color: PALETTE.cherry, alpha: 0.9 });
    g.ellipse(X(0), Y(-9), 7 * k, 2.2 * k).fill(0x3e2214);
    g.ellipse(X(0), Y(-9.2), 3 * k, 1 * k).fill(0xc98a4a);
    g.moveTo(X(7), Y(-5)).quadraticCurveTo(X(13), Y(-3), X(7), Y(4)).stroke({ width: 2.6 * k, color: 0xe8e1d6 });
  }
}

/** A chunky five-point star centred on (x, y). */
export function drawStar(g: Graphics, x: number, y: number, r: number, color: number, rot = 0): Graphics {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (Math.PI * i) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  return g.poly(pts).fill(color);
}

/** A cartoon heart centred on (x, y). */
export function drawHeart(g: Graphics, x: number, y: number, r: number, color: number): void {
  g.circle(x - r * 0.5, y, r * 0.55).fill(color);
  g.circle(x + r * 0.5, y, r * 0.55).fill(color);
  g.poly([x - r * 1.02, y + r * 0.15, x + r * 1.02, y + r * 0.15, x, y + r * 1.25]).fill(color);
}

/** A comic speech-bubble label: rounded white box with a tail, text centred at (0, 0) of `t`. */
export function bubbleBox(g: Graphics, w: number, h: number, fill = 0xffffff, stroke = 0x3a2418): void {
  g.roundRect(-w / 2, -h / 2, w, h, h / 2).fill(fill).stroke({ width: 2, color: stroke });
  g.poly([-5, h / 2 - 1, 5, h / 2 - 1, 0, h / 2 + 7]).fill(fill);
  g.moveTo(-5, h / 2).lineTo(0, h / 2 + 7).lineTo(5, h / 2).stroke({ width: 2, color: stroke, join: 'round' });
}

/** A mop: handle from the floor up and to the right, head at (hx, hy). */
export function drawMop(g: Graphics, hx: number, hy: number, tx: number, ty: number): void {
  g.moveTo(hx, hy).lineTo(tx, ty).stroke({ width: 4, color: 0xa0703f, cap: 'round' });
  g.moveTo(hx, hy).lineTo(tx, ty).stroke({ width: 1.5, color: 0xd7a874, cap: 'round' });
  g.roundRect(hx - 9, hy - 3, 18, 6, 3).fill(0x4c8fd6);
  for (let i = -3; i <= 3; i++) g.moveTo(hx + i * 2.6, hy + 2).quadraticCurveTo(hx + i * 3.6, hy + 9, hx + i * 4, hy + 12).stroke({ width: 2.6, color: 0xf1ece4, cap: 'round' });
}
