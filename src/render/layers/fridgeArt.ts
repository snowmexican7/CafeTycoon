import { Container, Graphics } from 'pixi.js';
import type { FridgeId } from '../../data/fridges';
import type { Vec2 } from '../../sim/types';
import { PALETTE, sx, sy } from '../theme';
import { CHROME, label, shadow } from './draw';

/**
 * ui-3.4.1 (FB2 A4): the fridge's art, one look per fridge (the Dorm Room Cube on a milk crate, the yellowed Garage Beer
 * Fridge, the steel-and-glass Chrome Reach-In, the cow-spotted Udder-Matic 3000), and the two things carried to and
 * from it: a milk carton and the condiment bar's caddy. Drawing only; which fridge is the sim's `fridgeGear`.
 */

/** A milk carton standing with its base at (x, y): white with a blue gable top and a blue band. */
export function drawCarton(g: Graphics, x: number, y: number, k = 1): void {
  const w = 9 * k;
  const h = 18 * k;
  g.rect(x - w, y - h, w * 2, h).fill(0xfdfdfb).stroke({ width: 1.4 * k, color: 0x6f8aa6 });
  // the gable roof and its seam
  g.poly([x - w, y - h, x + w, y - h, x + w * 0.5, y - h - 7 * k, x - w * 0.5, y - h - 7 * k]).fill(0x3d79b0).stroke({ width: 1.2 * k, color: 0x2c5a85 });
  g.rect(x - w * 0.55, y - h - 10 * k, w * 1.1, 3.5 * k).fill(0x2c5a85);
  // the band, a drop of milk on it
  g.rect(x - w, y - h * 0.62, w * 2, 5 * k).fill(0x7fb8e0);
  g.ellipse(x, y - h * 0.3, 3 * k, 3.6 * k).fill(0x3d79b0);
  g.moveTo(x - w + 2 * k, y - h + 2 * k).lineTo(x - w + 2 * k, y - 2 * k).stroke({ width: 1.4 * k, color: 0xffffff, alpha: 0.9 });
}

/** The condiment bar lifted to put away: a wire caddy with a cream jug, a sugar shaker and stirrers. */
export function drawBarCaddy(g: Graphics, x: number, y: number, k = 1): void {
  const w = 15 * k;
  // the cream jug and the shaker poking out of the caddy
  g.roundRect(x - 11 * k, y - 20 * k, 9 * k, 13 * k, 3 * k).fill(0xffffff).stroke({ width: 1.2 * k, color: 0x9aa7ae });
  g.moveTo(x - 11 * k, y - 18 * k).lineTo(x - 14 * k, y - 21 * k).stroke({ width: 1.6 * k, color: 0x9aa7ae });
  g.roundRect(x + 1 * k, y - 22 * k, 8 * k, 15 * k, 2 * k).fill({ color: 0xe8f1f5, alpha: 0.95 }).stroke({ width: 1.2 * k, color: 0x9aa7ae });
  g.roundRect(x + 1 * k, y - 25 * k, 8 * k, 4 * k, 1.5 * k).fill(0xb7c3c9);
  g.rect(x + 2 * k, y - 15 * k, 6 * k, 7 * k).fill(0xffffff);
  for (const dx of [10.5, 12.5]) g.moveTo(x + dx * k, y - 8 * k).lineTo(x + (dx + 1.5) * k, y - 24 * k).stroke({ width: 1.3 * k, color: 0xc8443a });
  // the caddy: a kraft tray with wire handles
  g.roundRect(x - w, y - 9 * k, w * 2, 10 * k, 2.5 * k).fill(0xc99a62).stroke({ width: 1.3 * k, color: 0x8a6236 });
  g.moveTo(x - w + 2 * k, y - 9 * k).quadraticCurveTo(x, y - 30 * k, x + w - 2 * k, y - 9 * k).stroke({ width: 1.4 * k, color: 0x6f7a82, alpha: 0.8 });
  g.rect(x - w, y - 5 * k, w * 2, 2 * k).fill({ color: 0xe8d2a8, alpha: 0.8 });
}

/** What the plate under each fridge says. */
export const FRIDGE_PLATE: Record<FridgeId, string> = { f1: 'MINI FRIDGE', f2: 'FRIDGE', f3: 'FRIDGE', f4: 'UDDER-MATIC' };

function namePlate(root: Container, g: Graphics, cx: number, cy: number, text: string, color: number): void {
  const w = 62;
  g.roundRect(cx - w / 2, cy + 34, w, 15, 7.5).fill({ color, alpha: 0.86 });
  const t = label(text, 9.5, 0xfff4e2, '600', undefined, 0.6);
  if (t.width > w - 8) t.scale.x *= (w - 8) / t.width;
  t.position.set(cx, cy + 41.5);
  root.addChild(t);
}

/** f1: a black mini fridge on a blue milk crate, the shop's $89 price sticker still on the corner. */
function dormCube(root: Container, g: Graphics, cx: number, cy: number): void {
  shadow(g, cx, cy + 31, 34, 8);
  // the milk crate
  g.roundRect(cx - 27, cy + 2, 54, 28, 3).fill(0x3d79b0).stroke({ width: 2, color: 0x2c5a85 });
  for (let i = 0; i < 5; i++) g.roundRect(cx - 22 + i * 9.5, cy + 8, 6, 16, 2).fill(0x2c5a85);
  // the cube
  g.roundRect(cx - 25, cy - 46, 50, 48, 6).fill(0x2b2d33).stroke({ width: 2, color: 0x16171b });
  g.roundRect(cx - 21, cy - 42, 42, 40, 4).fill(0x34373f);
  g.moveTo(cx - 21, cy - 28).lineTo(cx + 21, cy - 28).stroke({ width: 1.2, color: 0x16171b });
  g.roundRect(cx + 14, cy - 38, 4, 30, 2).fill(0x8d989f);
  g.moveTo(cx - 18, cy - 40).lineTo(cx - 18, cy - 6).stroke({ width: 1.5, color: 0xffffff, alpha: 0.18 });
  // the yellow price sticker, slapped on crooked
  g.poly([cx - 26, cy - 36, cx - 8, cy - 48, cx - 3, cy - 40, cx - 21, cy - 28]).fill(0xf6d34a).stroke({ width: 1.2, color: 0xb9651f });
  const tag = label('$89', 9, 0x7a3b12, '800', undefined, 0);
  tag.rotation = -0.58;
  tag.position.set(cx - 14.5, cy - 38);
  root.addChild(tag);
  // a magnet
  g.circle(cx + 5, cy - 16, 3.5).fill(PALETTE.cherry).stroke({ width: 1, color: 0xffffff });
  namePlate(root, g, cx, cy, FRIDGE_PLATE.f1, 0x2b2d33);
}

/** f2: a tall yellowed garage fridge with a rusty hem and a faded beer logo on the door. */
function garageFridge(root: Container, g: Graphics, cx: number, cy: number): void {
  shadow(g, cx, cy + 31, 36, 8);
  g.roundRect(cx - 28, cy - 78, 56, 108, 9).fill(0xebe3c9).stroke({ width: 2, color: 0xb8ab86 });
  g.moveTo(cx - 28, cy - 46).lineTo(cx + 28, cy - 46).stroke({ width: 2, color: 0xb8ab86 });
  // handles (chrome gone dull), on the left
  g.roundRect(cx - 24, cy - 70, 4, 18, 2).fill(0xa9b0b2);
  g.roundRect(cx - 24, cy - 38, 4, 34, 2).fill(0xa9b0b2);
  // the faded logo: a red oval with "BEER" half rubbed off
  g.ellipse(cx + 4, cy - 18, 18, 11).fill({ color: 0xc8443a, alpha: 0.32 }).stroke({ width: 1.5, color: 0xc8443a, alpha: 0.45 });
  const logo = label('BEER', 10, 0xffffff, '800', undefined, 1);
  logo.alpha = 0.7;
  logo.rotation = -0.1;
  logo.position.set(cx + 4, cy - 18);
  root.addChild(logo);
  // rust along the bottom and a dent
  for (const [dx, r] of [[-16, 2.4], [-6, 1.6], [12, 2.8], [20, 1.4]] as const) g.circle(cx + dx, cy + 24, r).fill({ color: 0x9a5a2a, alpha: 0.6 });
  g.rect(cx - 28, cy + 26, 56, 4).fill({ color: 0x8a6236, alpha: 0.5 });
  g.moveTo(cx + 10, cy - 64).quadraticCurveTo(cx + 15, cy - 60, cx + 12, cy - 55).stroke({ width: 1.5, color: 0xb8ab86 });
  g.moveTo(cx - 18, cy - 74).lineTo(cx - 18, cy + 20).stroke({ width: 2, color: 0xffffff, alpha: 0.4 });
  // a bottle opener screwed to the side
  g.roundRect(cx + 26, cy - 10, 5, 10, 1.5).fill(0x8d989f);
  namePlate(root, g, cx, cy, FRIDGE_PLATE.f2, 0x8a6236);
}

/** f3: a steel reach-in with a glass door, milk cartons on its shelves and a little blue temperature readout. */
function chromeReachIn(root: Container, g: Graphics, cx: number, cy: number): void {
  shadow(g, cx, cy + 31, 38, 8);
  g.roundRect(cx - 30, cy - 98, 60, 128, 6).fill(CHROME).stroke({ width: 2, color: 0x6f7a82 });
  // the header with its readout
  g.roundRect(cx - 26, cy - 94, 52, 13, 3).fill(0x2d2a30);
  const temp = label('3°C', 9, 0x7fd7ff, '800', undefined, 0.5);
  temp.position.set(cx - 12, cy - 87.5);
  root.addChild(temp);
  g.circle(cx + 16, cy - 87.5, 2.4).fill(0x7fcf98);
  // the glass door, three shelves of cartons
  g.roundRect(cx - 25, cy - 77, 46, 98, 4).fill({ color: 0xcfe7f2, alpha: 0.95 }).stroke({ width: 2.5, color: 0x8d989f });
  for (let s = 0; s < 3; s++) {
    const shelfY = cy - 50 + s * 30;
    g.rect(cx - 23, shelfY, 42, 2).fill(0x9aa7ae);
    for (let i = 0; i < 4; i++) {
      const x = cx - 18 + i * 10.5;
      g.rect(x - 3.5, shelfY - 13, 7, 13).fill(0xffffff).stroke({ width: 0.8, color: 0x6f8aa6 });
      g.poly([x - 3.5, shelfY - 13, x + 3.5, shelfY - 13, x + 2, shelfY - 17, x - 2, shelfY - 17]).fill(0x3d79b0);
    }
  }
  g.moveTo(cx - 20, cy - 74).lineTo(cx - 8, cy + 16).stroke({ width: 3, color: 0xffffff, alpha: 0.45 });
  // a long bar handle
  g.roundRect(cx + 23, cy - 64, 4, 64, 2).fill(0xf6fafb).stroke({ width: 1, color: 0x6f7a82 });
  g.rect(cx - 30, cy + 22, 60, 8).fill(0x3c4349);
  for (let i = 0; i < 6; i++) g.rect(cx - 24 + i * 9, cy + 24, 5, 4).fill(0x6f7a82);
  namePlate(root, g, cx, cy, FRIDGE_PLATE.f3, 0x3d79b0);
}

/** f4: the Udder-Matic 3000, a white fridge in black cow spots with horns, a cowbell and a pink milk spout. */
function udderMatic(root: Container, g: Graphics, cx: number, cy: number): void {
  shadow(g, cx, cy + 31, 40, 9);
  // horns, behind the cabinet
  g.moveTo(cx - 22, cy - 98).quadraticCurveTo(cx - 36, cy - 106, cx - 34, cy - 118).stroke({ width: 6, color: 0xefe3c4, cap: 'round' });
  g.moveTo(cx + 22, cy - 98).quadraticCurveTo(cx + 36, cy - 106, cx + 34, cy - 118).stroke({ width: 6, color: 0xefe3c4, cap: 'round' });
  g.roundRect(cx - 31, cy - 102, 62, 132, 12).fill(0xffffff).stroke({ width: 2.5, color: 0x2d2a30 });
  // the spots
  for (const [dx, dy, rx, ry] of [[-16, -84, 10, 7], [14, -62, 12, 9], [-18, -38, 8, 11], [16, -14, 9, 6], [-8, 14, 11, 6], [4, -92, 5, 4]] as const) {
    g.ellipse(cx + dx, cy + dy, rx, ry).fill(0x1f1d22);
  }
  g.moveTo(cx - 31, cy - 56).lineTo(cx + 31, cy - 56).stroke({ width: 2, color: 0x9aa7ae });
  g.roundRect(cx - 26, cy - 96, 4, 30, 2).fill(0xd6b25c);
  // the gold "3000" plaque
  g.roundRect(cx - 14, cy - 52, 28, 11, 3).fill(0xd6b25c).stroke({ width: 1, color: 0x8a6236 });
  const three = label('3000', 8, 0x5a3320, '800', undefined, 0.5);
  three.position.set(cx, cy - 46.5);
  root.addChild(three);
  // the spout: a pink udder with four teats over a drip tray
  g.ellipse(cx, cy - 10, 15, 8).fill(0xf3a5b6).stroke({ width: 1.5, color: 0xc9708a });
  for (const dx of [-9, -3, 3, 9]) g.roundRect(cx + dx - 2, cy - 5, 4, 8, 2).fill(0xf3a5b6).stroke({ width: 1, color: 0xc9708a });
  g.roundRect(cx - 16, cy + 8, 32, 5, 2).fill(0x8d989f);
  // the cowbell on a strap
  g.moveTo(cx - 12, cy - 56).quadraticCurveTo(cx, cy - 50, cx + 12, cy - 56).stroke({ width: 2, color: 0x8a5d3a });
  g.poly([cx + 20, cy - 40, cx + 26, cy - 40, cx + 28, cy - 30, cx + 18, cy - 30]).fill(0xd6b25c).stroke({ width: 1, color: 0x8a6236 });
  g.circle(cx + 23, cy - 28, 1.6).fill(0x5a3320);
  namePlate(root, g, cx, cy, FRIDGE_PLATE.f4, 0xc9708a);
}

/** The fridge standing at `pos`, drawn as `id`. */
export function buildFridgeArt(pos: Vec2, id: FridgeId): { root: Container; g: Graphics } {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const cx = sx(pos.x);
  const cy = sy(pos.y);
  if (id === 'f1') dormCube(root, g, cx, cy);
  else if (id === 'f2') garageFridge(root, g, cx, cy);
  else if (id === 'f3') chromeReachIn(root, g, cx, cy);
  else udderMatic(root, g, cx, cy);
  return { root, g };
}

export { FRIDGE_RISE } from './fridgeArtRise';
