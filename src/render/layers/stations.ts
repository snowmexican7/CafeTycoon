import { Container, Graphics, Text } from 'pixi.js';
import type { ItemKind, StationKind, Vec2 } from '../../sim/types';
import { MAT, PALETTE, PROGRESS_BAR_RISE, STATION_LABELS, sx, sy } from '../theme';
import { CHROME, dashedEllipse, drawItem, halfDome, label, shadow, sheen, vertical } from './draw';

const RED = vertical(0xf07466, 0xc8443a);
const KEG = sheen([0x3f86b8, 0x8fcaf0, 0x2f6f9e]);
const BIN = sheen([0x4f9f6f, 0x7fcf98, 0x438d61]);

/** The y used to depth-sort a station against actors: the bottom of its cabinet's front face. */
export function stationDepth(pos: Vec2): number {
  return sy(pos.y) + 30;
}

function cabinet(g: Graphics, cx: number, cy: number, w = 60): void {
  const x = cx - w / 2;
  shadow(g, cx, cy + 30, w / 2 + 8, 8);
  g.roundRect(x, cy - 6, w, 36, 6).fill(MAT.cab);
  g.roundRect(x + 5, cy + 1, w / 2 - 7, 23, 3).stroke({ width: 2, color: MAT.cabDk });
  g.roundRect(cx + 2, cy + 1, w / 2 - 7, 23, 3).stroke({ width: 2, color: MAT.cabDk });
  g.circle(cx - 5, cy + 12, 2).fill(PALETTE.honey);
  g.circle(cx + 5, cy + 12, 2).fill(PALETTE.honey);
  g.roundRect(x - 3, cy - 30, w + 6, 28, 7).fill(MAT.top);
  g.roundRect(x - 3, cy - 8, w + 6, 6, 3).fill(MAT.topEdge);
}

function plate(root: Container, g: Graphics, cx: number, cy: number, text: string, color: number = PALETTE.espresso, alpha = 0.82): void {
  const w = Math.max(60, text.length * 7 + 14);
  g.roundRect(cx - w / 2, cy + 34, w, 15, 7.5).fill({ color, alpha });
  const t = label(text, 9.5, 0xfff4e2, '600', undefined, 0.6);
  t.position.set(cx, cy + 41.5);
  root.addChild(t);
}

/** Static art for one station (cabinet, machine, nameplate). The footprint stays inside its unit square. */
export function buildStation(kind: StationKind, pos: Vec2): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const cx = sx(pos.x);
  const cy = sy(pos.y);
  root.zIndex = stationDepth(pos);

  if (kind === 'trash') {
    shadow(g, cx, cy + 28, 30, 8);
    g.poly([cx - 22, cy - 22, cx + 22, cy - 22, cx + 17, cy + 28, cx - 17, cy + 28]).fill(BIN);
    for (const dx of [-12, 0, 12]) g.moveTo(cx + dx, cy - 10).lineTo(cx + dx, cy + 20).stroke({ width: 2, color: 0x3b8058, alpha: 0.5 });
    g.roundRect(cx - 26, cy - 32, 52, 12, 6).fill(0x3f8a5d);
    g.roundRect(cx - 8, cy - 38, 16, 7, 3.5).fill(0x2f6d48);
    g.circle(cx, cy + 4, 8).fill({ color: 0xffffff, alpha: 0.85 });
    g.poly([cx - 4, cy + 5, cx, cy - 1, cx + 4, cy + 5]).stroke({ width: 2, color: 0x3f8a5d, join: 'round' });
    plate(root, g, cx, cy, STATION_LABELS.trash);
    return root;
  }

  if (kind === 'counter') {
    // Same footprint as its collision square (the sim blocks exactly one tile).
    const w = 58;
    const x = cx - w / 2;
    shadow(g, cx, cy + 32, 38, 9);
    g.roundRect(x, cy - 8, w, 40, 7).fill(0xa7653c);
    for (let i = 0; i < 4; i++) g.roundRect(x + 5 + i * 13, cy - 4, 9, 32, 3).fill(0x8f5532);
    g.roundRect(x - 3, cy - 34, w + 6, 30, 8).fill(0xf3efe9);
    g.moveTo(x + 6, cy - 24).quadraticCurveTo(x + 20, cy - 18, x + 34, cy - 26).stroke({ width: 1.5, color: 0xd9d1c6 });
    g.moveTo(x + 26, cy - 14).quadraticCurveTo(x + 40, cy - 20, x + 54, cy - 12).stroke({ width: 1.5, color: 0xd9d1c6 });
    g.roundRect(x - 3, cy - 10, w + 6, 6, 3).fill(0xd8cdbf);
    // register tablet on a stand
    g.rect(cx + 12, cy - 48, 4, 16).fill(0x7d8a91);
    g.roundRect(cx + 2, cy - 60, 24, 17, 4).fill(0x2f3440);
    g.roundRect(cx + 4.5, cy - 57.5, 19, 12, 2).fill(PALETTE.mint);
    // service bell
    g.ellipse(cx - 17, cy - 22, 8, 3).fill(0xb88a2a);
    halfDome(g, cx - 17, cy - 23, 7, 7).fill(0xf1cf6e);
    g.circle(cx - 17, cy - 32, 2).fill(0xf1cf6e);
    plate(root, g, cx, cy + 4, STATION_LABELS.counter, PALETTE.cherry, 1);
    return root;
  }

  cabinet(g, cx, cy);
  const top = cy - 20; // where machines sit
  if (kind === 'grinder') {
    g.roundRect(cx - 13, top - 36, 26, 38, 6).fill(0x3d3a40);
    g.roundRect(cx - 13, top - 36, 8, 38, 4).fill(0x57535b);
    const hopper = [cx - 19, top - 72, cx + 19, top - 72, cx + 10, top - 36, cx - 10, top - 36];
    g.poly(hopper).fill({ color: 0xc8874f, alpha: 0.9 });
    g.poly(hopper).stroke({ width: 1.5, color: 0xffffff, alpha: 0.65 });
    for (const [dx, dy] of [[-8, -50], [-2, -58], [6, -48], [9, -62], [-10, -64], [1, -44], [-4, -40]]) g.ellipse(cx + dx, top + dy, 3, 2).fill(0x5a3320);
    g.roundRect(cx - 21, top - 77, 42, 8, 4).fill(0x2d2a30);
    g.circle(cx + 6, top - 18, 4).fill(PALETTE.cherry);
    g.roundRect(cx - 6, top - 2, 12, 4, 2).fill(0x2d2a30);
  } else if (kind === 'espresso') {
    g.roundRect(cx - 28, top - 44, 56, 44, 9).fill(RED);
    g.roundRect(cx - 28, top - 48, 56, 10, 5).fill(CHROME);
    g.roundRect(cx - 22, top - 52, 44, 5, 2.5).fill(MAT.chromeDk);
    for (const d of [-12, 12]) {
      g.roundRect(cx + d - 6, top - 22, 12, 8, 2).fill(CHROME);
      g.poly([cx + d - 2, top - 16, cx + d + 14, top - 12, cx + d + 13, top - 8, cx + d - 3, top - 12]).fill(0x2b2b30);
    }
    g.circle(cx, top - 32, 7).fill(0xfffaf2).stroke({ width: 2, color: MAT.chromeDk });
    g.roundRect(cx - 26, top - 6, 52, 6, 3).fill(0x56616a);
  } else if (kind === 'steamer') {
    g.roundRect(cx - 14, top - 56, 28, 56, 12).fill(CHROME).stroke({ width: 1, color: MAT.chromeDk });
    g.rect(cx - 14, top - 30, 28, 8).fill(PALETTE.sky);
    g.moveTo(cx + 12, top - 44).quadraticCurveTo(cx + 26, top - 42, cx + 24, top - 20).stroke({ width: 3, color: 0x8d989f, cap: 'round' });
    g.poly([cx + 12, top - 18, cx + 30, top - 18, cx + 27, top, cx + 15, top]).fill(CHROME).stroke({ width: 1, color: 0x8d989f });
  } else if (kind === 'coldBrewTap') {
    g.roundRect(cx - 20, top - 62, 40, 60, 11).fill(KEG);
    g.rect(cx - 20, top - 48, 40, 4).fill({ color: 0x2f6f9e, alpha: 0.6 });
    g.rect(cx - 20, top - 18, 40, 4).fill({ color: 0x2f6f9e, alpha: 0.6 });
    g.roundRect(cx - 13, top - 40, 26, 16, 4).fill(0xfff4e2);
    const cold = label('COLD', 8, 0x2f6f9e, '600');
    cold.position.set(cx, top - 32);
    g.roundRect(cx - 4, top - 10, 8, 8, 2).fill(CHROME);
    g.poly([cx - 4, top - 26, cx + 2, top - 27, cx + 5, top - 9, cx - 1, top - 8]).fill(0x2b2b30);
    g.moveTo(cx - 15, top - 56).quadraticCurveTo(cx - 12, top - 60, cx - 9, top - 56).stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
    root.addChild(cold);
  }
  plate(root, g, cx, cy, STATION_LABELS[kind]);
  return root;
}

export interface StationOverlayState {
  kind: StationKind;
  pos: Vec2;
  /** 0..1 while working, null when idle. */
  progress: number | null;
  output: ItemKind | null;
}

/**
 * Per-frame station decorations, drawn above the actors: progress bars, the "ready" output ring,
 * busy animations (steam, gauge needle) and the focus outline + E keycap for the local barista.
 */
export class StationOverlay {
  readonly root = new Container();
  private readonly g = new Graphics();
  private readonly keycap: Text;

  constructor() {
    this.keycap = label('E', 13, PALETTE.espresso, '700');
    this.root.addChild(this.g, this.keycap);
  }

  update(stations: StationOverlayState[], focus: Vec2 | null, timeSec: number): void {
    const g = this.g;
    g.clear();
    for (const s of stations) {
      const cx = sx(s.pos.x);
      const cy = sy(s.pos.y);
      const top = cy - 20;
      if (s.kind === 'espresso') {
        const a = -Math.PI / 4 + (s.progress !== null ? Math.sin(timeSec * 9) * 0.5 + 0.9 : 0);
        g.moveTo(cx, top - 32).lineTo(cx + Math.cos(a) * 5, top - 32 + Math.sin(a) * 5).stroke({ width: 1.6, color: PALETTE.cherry });
      }
      if (s.progress !== null && s.kind === 'steamer') {
        for (const [dx, dy, r, ph] of [[22, -30, 6, 0], [28, -42, 7.5, 0.25], [20, -54, 6.5, 0.5], [30, -62, 5, 0.75]]) {
          const t = (timeSec * 0.9 + ph) % 1;
          g.circle(cx + dx + Math.sin((t + ph) * 6) * 2, top + dy - t * 10, r * (0.7 + t * 0.5)).fill({ color: 0xffffff, alpha: 0.85 * (1 - t * 0.7) });
        }
      }
      if (s.progress !== null && s.kind === 'coldBrewTap') {
        const t = (timeSec * 2) % 1;
        g.circle(cx, top - 2 + t * 8, 2).fill({ color: 0x5b3420, alpha: 1 - t });
      }
      if (s.progress !== null) {
        const by = cy - PROGRESS_BAR_RISE[s.kind];
        g.roundRect(cx - 24, by, 48, 11, 5.5).fill(0xffffff).stroke({ width: 2, color: PALETTE.espresso });
        g.roundRect(cx - 21, by + 2.5, Math.max(6, 42 * s.progress), 6, 3).fill(PALETTE.mint);
      }
      if (s.output) {
        drawItem(g, s.output, cx + 22, cy - 20, 0.9);
        const pulse = 1 + Math.sin(timeSec * 5) * 0.06;
        dashedEllipse(g, cx + 22, cy - 22, 15 * pulse, 15 * pulse, 3, 4, PALETTE.honey, 2.5, 0.95);
      }
    }
    if (focus) {
      const cx = sx(focus.x);
      const cy = sy(focus.y);
      g.roundRect(cx - 36, cy - 34, 72, 66, 10).stroke({ width: 3, color: 0xfff6c9, alpha: 0.95 });
      g.roundRect(cx - 52, cy - 22, 22, 22, 6).fill(0xfff4e2).stroke({ width: 2, color: PALETTE.espresso });
      this.keycap.position.set(cx - 41, cy - 11);
      this.keycap.visible = true;
    } else {
      this.keycap.visible = false;
    }
  }
}
