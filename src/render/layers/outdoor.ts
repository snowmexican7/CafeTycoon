import { Container, FillGradient, Graphics } from 'pixi.js';
import { layoutFor } from '../../data/layout';
import { FRONT, PALETTE, TILE, WALL, sy } from '../theme';
import type { TierLook } from '../tierLook';
import { label, shadow } from './draw';

/**
 * ui-3.4.0: the outdoor scenes for the stand (a sidewalk) and the cart (a park plaza). Render-only. Everything
 * here sits behind the stations or on ground nobody walks on; the stations, slots and line are where they always
 * were. `back` goes over the café floor and wallpaper (between the floor and the depth-sorted layer), `props`
 * join the depth sort, `over` hangs above everyone (the stand's umbrella, the cart's string lights).
 */
export interface OutdoorScene {
  back: Container;
  props: Container[];
  over: Container;
}

const H = WALL + 8 * TILE + FRONT;
const FRONT_EDGE = sy(8);
/** The front strip the line waits on (below the pickup counter row). */
const STRIP_TOP = sy(7.15);

/** A tiny deterministic PRNG so the bricks and cobbles look hand-laid but never shimmer between rebuilds. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildOutdoor(look: Exclude<TierLook, 'cafe'>): OutdoorScene {
  return look === 'stand' ? buildStand() : buildCart();
}

// ------------------------------------------------------------------------------------------------ stand

function buildStand(): OutdoorScene {
  const W = layoutFor('stand').width * TILE;
  const back = new Container();
  const g = new Graphics();
  back.addChild(g);
  const r = rng(7);

  // the building behind: warm red brick, running bond
  g.rect(0, 0, W, WALL).fill(0xb4604a);
  for (let row = 0, y = 0; y < WALL - 14; row++, y += 12) {
    const off = row % 2 ? 16 : 0;
    for (let x = -off; x < W; x += 32) {
      const shade = [0xb4604a, 0xa8573f, 0xbf6b52, 0xad5b45][Math.floor(r() * 4)]!;
      g.rect(x + 1, y + 1, 30, 10).fill(shade);
    }
  }
  // mortar shadow lines give the bricks a little depth
  for (let y = 11; y < WALL - 14; y += 12) g.rect(0, y, W, 1).fill({ color: 0x7d3a2a, alpha: 0.25 });
  // a neighbour's shop window (left) with a planter box
  g.roundRect(34, 46, 112, 56, 4).fill(0xf3ece0);
  g.rect(40, 52, 100, 44).fill(0x5d7f96);
  g.poly([40, 96, 96, 52, 116, 52, 60, 96]).fill({ color: 0xffffff, alpha: 0.16 });
  g.rect(89, 52, 3, 44).fill(0xf3ece0);
  g.roundRect(30, 98, 120, 8, 2).fill(0x8a5a3a);
  for (let i = 0; i < 7; i++) g.circle(38 + i * 17, 96, 6 + (i % 2) * 2).fill(i % 3 ? 0x5fa35a : 0x6fb466);
  for (let i = 0; i < 4; i++) g.circle(46 + i * 30, 92, 2.6).fill(i % 2 ? PALETTE.cherry : 0xffd36b);
  // a gig poster and a drainpipe
  g.roundRect(222, 58, 40, 50, 2).fill(0xfff1c9).stroke({ width: 1.5, color: 0xd8c08a });
  g.rect(226, 62, 32, 18).fill(0x3d79b0);
  g.circle(242, 71, 6).fill(0xffd36b);
  for (let i = 0; i < 3; i++) g.rect(227, 86 + i * 6, 30 - i * 8, 2.5).fill(0x8a6a42);
  g.rect(W - 22, 0, 9, WALL - 12).fill(0x6f7a82);
  for (let y = 18; y < WALL - 12; y += 34) g.rect(W - 25, y, 15, 4).fill(0x59636a);
  // stone plinth where the wall meets the sidewalk
  g.rect(0, WALL - 14, W, 14).fill(0xb2aba0);
  g.rect(0, WALL - 14, W, 3).fill(0xcfc9bf);
  g.rect(0, WALL, W, 6).fill({ color: 0x000000, alpha: 0.12 });

  // the sidewalk: big pale concrete slabs, one per tile
  for (let ty = 0; WALL + ty * TILE < STRIP_TOP; ty++) {
    for (let tx = 0; tx * TILE < W; tx++) {
      const x = tx * TILE;
      const y = WALL + ty * TILE;
      const h = Math.min(TILE, STRIP_TOP - y);
      const c = [0xdcd5c8, 0xd5cdbf, 0xe0dacd][(tx * 7 + ty * 3) % 3]!;
      g.rect(x, y, TILE, h).fill(c);
      g.rect(x, y, TILE, 2).fill({ color: 0xffffff, alpha: 0.35 });
      g.rect(x, y, 2, h).fill({ color: 0xa79e8f, alpha: 0.55 });
    }
  }
  g.rect(0, WALL + 6, W, 2).fill({ color: 0x000000, alpha: 0.05 });
  // a crack, a drain grate, a few fallen leaves
  g.moveTo(150, 330).lineTo(162, 342).lineTo(158, 356).lineTo(170, 372).stroke({ width: 1.5, color: 0x9d9485, alpha: 0.7 });
  g.roundRect(196, 452, 44, 24, 3).fill(0x6f7a82).stroke({ width: 2, color: 0x59636a });
  for (let i = 0; i < 5; i++) g.rect(201 + i * 8, 456, 4, 16).fill(0x3f474d);
  for (const [lx, ly, rot] of [[312, 300, 0.6], [92, 420, -0.4], [380, 520, 1.2], [128, 548, 0.2]] as const) {
    const leaf = new Graphics();
    leaf.ellipse(0, 0, 6, 3).fill(0xd9903f);
    leaf.moveTo(-6, 0).lineTo(6, 0).stroke({ width: 1, color: 0xa8652a });
    leaf.position.set(lx, ly);
    leaf.rotation = rot;
    back.addChild(leaf);
  }

  // the brick paver strip the line waits on
  const kerbTop = FRONT_EDGE + 10;
  g.rect(0, STRIP_TOP, W, kerbTop - STRIP_TOP).fill(0xd9b8a3);
  for (let row = 0, y = STRIP_TOP + 1; y < kerbTop - 2; row++, y += 13) {
    const off = row % 2 ? 14 : 0;
    for (let x = -off; x < W; x += 28) g.roundRect(x + 1, y, 26, 11, 2).fill([0xc0634a, 0xb3573f, 0xc86f55][Math.floor(r() * 3)]!);
  }
  // the kerb and a strip of road
  g.rect(0, kerbTop, W, 6).fill(0xd3cec6);
  g.rect(0, kerbTop + 6, W, 6).fill(0x9d978d);
  g.rect(0, kerbTop + 12, W, H - kerbTop - 12).fill(0x55565f);
  for (let i = 0; i < 70; i++) g.circle(r() * W, kerbTop + 14 + r() * (H - kerbTop - 16), 0.8 + r()).fill({ color: 0x8a8b94, alpha: 0.6 });
  for (let x = 20; x < W; x += 90) g.rect(x, H - 9, 44, 4).fill(0xf2d34a);

  // the umbrella pole, behind the back bar
  g.rect(188, 30, 5, 120).fill(0xe8e2d8);
  g.rect(190, 30, 1.5, 120).fill({ color: 0x000000, alpha: 0.15 });

  const props = [lamppost(24, kerbTop + 2), pot(110, FRONT_EDGE + 26, 0x6fb466), pot(470, FRONT_EDGE + 26, 0x5fa35a, true), aFrame(158, FRONT_EDGE + 30, ['COFFEE', 'hot & cold', 'iced brew ✓'])];

  // the market umbrella over the bar
  const over = new Container();
  const u = new Graphics();
  over.addChild(u);
  // (left of the chalkboard menu, which hangs on the bricks at x 378..476)
  const cx = 190;
  const span = 176;
  const top = 2;
  const rim = 40;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = cx - span + (2 * span * i) / n;
    const b = cx - span + (2 * span * (i + 1)) / n;
    u.poly([cx, top, a, rim, b, rim]).fill(i % 2 ? 0xfff4e2 : 0xe0564a);
  }
  for (let i = 0; i < n; i++) {
    const a = cx - span + (2 * span * i) / n;
    const w = (2 * span) / n;
    u.moveTo(a, rim).arc(a + w / 2, rim, w / 2, Math.PI, 0, true).lineTo(a, rim).fill(i % 2 ? 0xfff4e2 : 0xe0564a);
  }
  u.moveTo(cx - span, rim).lineTo(cx, top).lineTo(cx + span, rim).stroke({ width: 2, color: 0xb8413a, alpha: 0.6, join: 'round' });
  u.circle(cx, top + 2, 5).fill(0xe8e2d8);
  u.ellipse(cx, rim + 26, span * 0.7, 6).fill({ color: 0x000000, alpha: 0.06 });
  return { back, props, over };
}

function lamppost(x: number, foot: number): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  shadow(g, x, foot, 16, 4, 0.25);
  g.roundRect(x - 8, foot - 16, 16, 16, 3).fill(0x2f4a3f);
  g.rect(x - 3, foot - 190, 6, 176).fill(0x2f4a3f);
  g.rect(x - 1.5, foot - 190, 1.5, 176).fill({ color: 0xffffff, alpha: 0.18 });
  // the lantern
  g.poly([x - 12, foot - 194, x + 12, foot - 194, x + 9, foot - 224, x - 9, foot - 224]).fill(0xfff0b8).stroke({ width: 3, color: 0x2f4a3f, join: 'round' });
  g.poly([x - 15, foot - 224, x + 15, foot - 224, x, foot - 238]).fill(0x2f4a3f);
  g.circle(x, foot - 240, 3).fill(0x2f4a3f);
  c.zIndex = foot;
  return c;
}

function pot(x: number, foot: number, leaf: number, flowers = false): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  shadow(g, x, foot, 18, 4);
  for (const [dx, dy, rad] of [[-8, -30, 10], [8, -32, 11], [0, -42, 11], [-12, -40, 7], [12, -42, 7]] as const) g.circle(x + dx, foot + dy, rad).fill(leaf);
  g.circle(x - 4, foot - 44, 4).fill({ color: 0xffffff, alpha: 0.15 });
  if (flowers) for (const [dx, dy] of [[-6, -46], [9, -38], [-12, -32]] as const) g.circle(x + dx, foot + dy, 3).fill(0xffd36b);
  g.poly([x - 16, foot - 22, x + 16, foot - 22, x + 12, foot, x - 12, foot]).fill(0xc9774a);
  g.roundRect(x - 18, foot - 26, 36, 7, 2).fill(0xd98a5c);
  c.zIndex = foot;
  return c;
}

/** The chalk A-frame sign every coffee stall has. */
function aFrame(x: number, foot: number, lines: string[]): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  shadow(g, x, foot, 26, 5);
  g.moveTo(x - 22, foot).lineTo(x - 16, foot - 62).lineTo(x + 16, foot - 62).lineTo(x + 22, foot).stroke({ width: 4, color: 0x8a5a3a, join: 'round' });
  g.roundRect(x - 20, foot - 60, 40, 50, 3).fill(0x2f3a36).stroke({ width: 3, color: 0xa7653c });
  lines.forEach((t, i) => {
    const s = label(t, i === 0 ? 9 : 7, i === 0 ? 0xffffff : 0xe8e2d0, i === 0 ? '800' : '600');
    s.anchor.set(0.5);
    s.position.set(x, foot - 50 + i * 13);
    c.addChild(s);
  });
  c.zIndex = foot;
  return c;
}

// ------------------------------------------------------------------------------------------------- cart

function buildCart(): OutdoorScene {
  const W = layoutFor('cart').width * TILE;
  const back = new Container();
  const g = new Graphics();
  back.addChild(g);
  const r = rng(11);

  // sky, clouds, the park's trees and a clipped hedge
  const sky = new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: [{ offset: 0, color: 0xa9d8f0 }, { offset: 1, color: 0xf3ead2 }] });
  g.rect(0, 0, W, WALL).fill(sky);
  for (const [cx, cy] of [[120, 46], [420, 38]] as const) {
    for (const [dx, dy, rad] of [[-16, 2, 10], [0, -4, 13], [16, 2, 10]] as const) g.circle(cx + dx, cy + dy, rad).fill({ color: 0xffffff, alpha: 0.85 });
  }
  for (let x = -10; x < W + 20; x += 46) {
    const h = 26 + r() * 24;
    g.rect(x + 20, 96 - h + 20, 5, h).fill(0x7a5a3e);
    g.circle(x + 22, 96 - h + 10, 24 + r() * 6).fill(r() > 0.5 ? 0x77b46b : 0x6aa862);
  }
  g.rect(0, 84, W, 26).fill(0x4f8f4c);
  for (let x = 0; x < W; x += 18) g.circle(x + 9, 86, 10).fill(0x5a9e56);
  // the low planter wall
  g.rect(0, WALL - 12, W, 12).fill(0xc9bda7);
  g.rect(0, WALL - 12, W, 3).fill(0xe0d6c2);
  g.rect(0, WALL, W, 6).fill({ color: 0x000000, alpha: 0.1 });
  // string-light poles at either end
  for (const px of [6, W - 6]) {
    g.rect(px - 3, 24, 6, WALL - 24).fill(0x3a2a20);
    g.circle(px, 24, 4).fill(0x3a2a20);
  }

  // the plaza: warm cobbles, with a rosette where the café's rug lies
  g.rect(0, WALL, W, STRIP_TOP - WALL).fill(0xb9a98e);
  for (let row = 0, y = WALL + 2; y < STRIP_TOP - 4; row++, y += 18) {
    const off = row % 2 ? 15 : 0;
    for (let x = -off; x < W; x += 30) g.roundRect(x + 2, y, 26, 15, 5).fill([0xdacbb2, 0xd2c2a7, 0xe2d5bf, 0xcdbb9e][Math.floor(r() * 4)]!);
  }
  const rx = 4.7 * TILE;
  const ry = 3.4 * TILE + WALL;
  for (const [rad, col] of [[118, 0xa98f6c], [96, 0xe7dcc8], [74, 0xb39a77], [50, 0xe7dcc8], [26, 0xa98f6c]] as const) g.ellipse(rx, ry, rad, rad * 0.62).stroke({ width: 7, color: col, alpha: 0.6 });
  // the gravel path the line waits on, edged with timber
  g.rect(0, STRIP_TOP, W, FRONT_EDGE + 12 - STRIP_TOP).fill(0xe8d9b6);
  for (let i = 0; i < 260; i++) g.circle(r() * W, STRIP_TOP + 3 + r() * (FRONT_EDGE + 6 - STRIP_TOP), 0.8 + r() * 1.2).fill({ color: r() > 0.5 ? 0xc8b48c : 0xf6ecd4, alpha: 0.9 });
  g.rect(0, STRIP_TOP, W, 4).fill(0x8a6a42);
  // grass at the front with a few flowers
  g.rect(0, FRONT_EDGE + 12, W, H - FRONT_EDGE - 12).fill(0x86c06f);
  g.rect(0, FRONT_EDGE + 12, W, 4).fill(0x6aa85a);
  for (let i = 0; i < 60; i++) {
    const x = r() * W;
    const y = FRONT_EDGE + 20 + r() * (H - FRONT_EDGE - 24);
    g.moveTo(x, y).lineTo(x - 2, y - 6).moveTo(x, y).lineTo(x + 2, y - 6).stroke({ width: 1.4, color: 0x5f9e4e });
  }
  for (let i = 0; i < 14; i++) g.circle(r() * W, FRONT_EDGE + 22 + r() * 24, 2.6).fill([0xffffff, 0xffd36b, 0xf29bb2][i % 3]!);

  // the cart's push handle, sticking out behind the first station
  g.roundRect(-8, 168, 30, 8, 4).fill(0x8a6a42);

  const props = [bench(72, FRONT_EDGE + 40), aFrame(176, FRONT_EDGE + 34, ['COFFEE', 'steamed milk', 'lattes ✓']), pot(590, FRONT_EDGE + 30, 0x5a9e56, true)];

  // string lights in a soft swag across the top of the cart
  const over = new Container();
  const l = new Graphics();
  over.addChild(l);
  const y0 = 30;
  const sag = 22;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = 6 + t * (W - 12);
    const seg = (t * 3) % 1;
    pts.push([x, y0 + Math.sin(seg * Math.PI) * sag]);
  }
  l.moveTo(pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts.slice(1)) l.lineTo(x, y);
  l.stroke({ width: 1.5, color: 0x3a2a20 });
  const bulbs = [0xffd36b, 0xf29bb2, 0x9ed8f0, 0xb7e08a, 0xffb36b];
  for (let i = 1; i < 40; i += 2) {
    const [x, y] = pts[i]!;
    l.circle(x, y + 5, 7).fill({ color: bulbs[i % bulbs.length]!, alpha: 0.25 });
    l.circle(x, y + 5, 3.6).fill(bulbs[i % bulbs.length]!);
    l.rect(x - 1.5, y, 3, 2.5).fill(0x3a2a20);
  }
  return { back, props, over };
}

function bench(x: number, foot: number): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  shadow(g, x, foot, 46, 5);
  for (const dx of [-36, 36]) g.rect(x + dx - 3, foot - 22, 6, 22).fill(0x3a3f44);
  g.roundRect(x - 46, foot - 26, 92, 8, 3).fill(0xb98654);
  g.roundRect(x - 46, foot - 44, 92, 7, 3).fill(0xa7653c);
  g.roundRect(x - 46, foot - 34, 92, 7, 3).fill(0xa7653c);
  for (const dx of [-38, 38]) g.rect(x + dx - 2, foot - 46, 4, 22).fill(0x3a3f44);
  c.zIndex = foot;
  return c;
}
