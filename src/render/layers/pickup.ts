import { Container, Graphics, type Text } from 'pixi.js';
import { layoutFor } from '../../data/layout';
import type { GameState } from '../../sim/types';
import { boxStackOffset, PICKUP_Y, pickupCups, servingsGauge } from '../pickupModel';
import { PALETTE, sx, sy } from '../theme';
import { drawItem, label, shadow } from './draw';
import { pickupSlotXY, stationDepth } from './stations';

const TONE = { ok: PALETTE.good, low: PALETTE.warn, empty: PALETTE.bad } as const;

/** A condiment stock box: a kraft carton with a cream-jug and sugar-cube print. */
export function drawBox(g: Graphics, x: number, y: number, k = 1): void {
  g.roundRect(x - 10 * k, y - 9 * k, 20 * k, 13 * k, 2 * k).fill(0xc99a62).stroke({ width: 1.2, color: 0x8a6236 });
  g.rect(x - 10 * k, y - 9 * k, 20 * k, 3 * k).fill(0xb3854f);
  g.rect(x - 1.5 * k, y - 9 * k, 3 * k, 13 * k).fill({ color: 0xe8d2a8, alpha: 0.8 });
  g.circle(x - 5.5 * k, y - 1 * k, 2.2 * k).fill(0xffffff);
  g.roundRect(x + 3.5 * k, y - 3 * k, 3.5 * k, 3.5 * k, 0.6 * k).fill(0xffffff);
}

/**
 * 3.3.1 Gear batch/pickup, the per-frame half: cups waiting on the four pickup coasters, the condiment bar's
 * servings gauge, the stock boxes in the corner, and the "PICKUP" floor mark where rung-up customers wait.
 * Hidden on classic runs.
 */
export class PickupVisuals {
  /** Under the actors: the floor mark. */
  readonly floor = new Container();
  /** Depth-sorted with the stations: the cups and the box stack. */
  private readonly cups = new Graphics();
  private readonly boxes = new Graphics();
  /** Above everything: the gauge. */
  readonly overlay = new Container();
  private readonly gauge = new Graphics();
  private readonly gaugeText: Text;
  private readonly boxText: Text;
  private readonly mark = new Graphics();
  private readonly markText: Text;
  private floorKey = '';

  constructor(depth: Container) {
    depth.addChild(this.cups, this.boxes);
    this.gaugeText = label('', 13, 0xffffff, '800');
    this.gaugeText.style.stroke = { color: 0x3a2418, width: 3 };
    this.boxText = label('', 11, 0xfff4e2, '800');
    this.boxText.style.stroke = { color: 0x3a2418, width: 3 };
    this.overlay.addChild(this.gauge, this.gaugeText, this.boxText);
    this.markText = label('PICKUP · WAIT HERE', 10, 0x2f6d48, '800', undefined, 1.2);
    this.markText.alpha = 0.75;
    this.floor.addChild(this.mark, this.markText);
  }

  update(state: GameState, timeSec: number): void {
    const on = state.gear === true;
    this.floor.visible = on;
    this.overlay.visible = on;
    this.cups.visible = on;
    this.boxes.visible = on;
    if (!on) return;
    const lay = layoutFor(state.tier);

    // the floor mark in front of the pickup counter and the bar, where the pickup crowd stands
    const fk = `${state.tier}`;
    if (fk !== this.floorKey) {
      this.floorKey = fk;
      const x0 = sx(Math.max(1.3, lay.condiments.x - 1.6));
      const x1 = sx(lay.pickup.x + 0.45);
      const y = sy(PICKUP_Y) + 4;
      this.mark.clear();
      this.mark.roundRect(x0, y - 16, x1 - x0, 32, 10).fill({ color: 0x5fae86, alpha: 0.16 }).stroke({ width: 2.5, color: 0x3f8a5d, alpha: 0.45 });
      this.markText.position.set((x0 + x1) / 2, y + 26);
    }

    // cups on the pickup coasters
    const g = this.cups;
    g.clear();
    g.zIndex = Math.max(stationDepth(lay.pickup) + 1, sy(PICKUP_Y) + 40); // never behind the pickup crowd
    pickupCups(state).forEach((c, i) => {
      const { x, y } = pickupSlotXY(lay.pickup, i);
      if (c.stale && Math.floor(timeSec * 4) % 2 === 0) g.ellipse(x, y + 5, 11, 5).fill({ color: PALETTE.bad, alpha: 0.6 });
      else if (c.wanted) g.ellipse(x, y + 5, 11, 5).fill({ color: 0xfff2b8, alpha: 0.75 });
      drawItem(g, c.item, x, y - 4, 0.85);
    });

    // the condiment bar gauge: 20 pips and a count, amber when low, red and blinking when empty
    const sv = servingsGauge(state.condiments?.servings ?? 0);
    const bx = sx(lay.condiments.x);
    const by = sy(lay.condiments.y) - 84;
    const pg = this.gauge;
    pg.clear();
    const t = sv.tone === 'empty' ? 'EMPTY: bring a box' : `${sv.text} left`;
    if (this.gaugeText.text !== t) this.gaugeText.text = t;
    const w = Math.max(60, Math.ceil(this.gaugeText.width) + 6); // the box fits its text
    const blink = sv.tone === 'empty' && Math.floor(timeSec * 2.5) % 2 === 0;
    pg.roundRect(bx - w / 2 - 4, by - 10, w + 8, 34, 8).fill({ color: blink ? 0x7a1f17 : 0x2a1a12, alpha: 0.88 }).stroke({ width: 2.5, color: TONE[sv.tone] });
    const pip = w / sv.max;
    for (let i = 0; i < sv.max; i++) pg.roundRect(bx - w / 2 + i * pip + 0.4, by + 12, pip - 0.8, 7, 1).fill(i < sv.pips ? TONE[sv.tone] : 0x5a4a40);
    this.gaugeText.style.fill = sv.tone === 'ok' ? 0xffffff : TONE[sv.tone];
    this.gaugeText.position.set(bx, by + 2);

    // stock boxes waiting in the corner
    const boxes = state.condimentBoxes ?? 0;
    const cx = sx(lay.boxCorner.x);
    const cy = sy(lay.boxCorner.y) + 20;
    const b = this.boxes;
    b.clear();
    b.zIndex = cy + 4;
    shadow(b, cx, cy + 4, 22, 6);
    if (boxes === 0) b.roundRect(cx - 18, cy - 10, 36, 14, 3).stroke({ width: 2, color: 0x8a6236, alpha: 0.45 });
    for (let i = 0; i < Math.min(boxes, 10); i++) {
      const o = boxStackOffset(i);
      drawBox(b, cx + o.x, cy + o.y);
    }
    const bt = boxes > 0 ? `BOXES ×${boxes}` : 'NO BOXES';
    if (this.boxText.text !== bt) this.boxText.text = bt;
    this.boxText.style.fill = boxes > 0 ? 0xfff4e2 : PALETTE.bad;
    this.boxText.position.set(cx, cy + 16);
  }
}
