import { Container, Graphics, type Text } from 'pixi.js';
import { layoutFor } from '../../data/layout';
import type { DrinkId, GameState } from '../../sim/types';
import { boxStackOffset, PICKUP_Y, pickupCups, servingsGauge } from '../pickupModel';
import { passTraySlots, trayTableView } from '../trayModel';
import { PALETTE, sx, sy } from '../theme';
import { drawItem, label, shadow } from './draw';
import { pickupSlotXY, stationDepth } from './stations';
import { passCool } from '../countsModel';
import { drawCoolRing } from './counts';

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
/** FB2 B7: a wood tray board with cups (and optional cool rings) centred at (x, y). */
export function drawTrayBoard(g: Graphics, x: number, y: number, drinks: readonly DrinkId[], cool: readonly number[] = [], k = 1): void {
  const n = Math.max(1, drinks.length);
  const w = Math.max(28, 10 + n * 14) * k;
  g.roundRect(x - w / 2, y - 6 * k, w, 14 * k, 3 * k).fill(0xc49a6c).stroke({ width: 1.5, color: 0x8a6238 });
  drinks.forEach((d, i) => {
    const cx = x - ((n - 1) * 7 * k) / 2 + i * 14 * k;
    drawItem(g, d, cx, y - 2 * k, 0.55 * k);
    const c = cool[i];
    if (c !== undefined) drawCoolRing(g, cx, y - 16 * k, 4 * k, 1 - c);
  });
}

export class PickupVisuals {
  /** Under the actors: the floor mark. */
  readonly floor = new Container();
  /** Depth-sorted with the stations: the cups and the box stack. */
  private readonly cups = new Graphics();
  private readonly boxes = new Graphics();
  private readonly trayArt = new Graphics();
  /** Above everything: the gauge + tray live list + pass-tray name tags. */
  readonly overlay = new Container();
  private readonly gauge = new Graphics();
  private readonly gaugeText: Text;
  private readonly boxText: Text;
  private readonly trayListBg = new Graphics();
  private readonly trayListText: Text;
  private readonly trayNameTags: { root: Container; bg: Graphics; text: Text }[] = [];
  private readonly mark = new Graphics();
  private readonly markText: Text;
  private floorKey = '';

  constructor(depth: Container) {
    depth.addChild(this.cups, this.boxes, this.trayArt);
    this.gaugeText = label('', 13, 0xffffff, '800');
    this.gaugeText.style.stroke = { color: 0x3a2418, width: 3 };
    this.boxText = label('', 11, 0xfff4e2, '800');
    this.boxText.style.stroke = { color: 0x3a2418, width: 3 };
    this.trayListText = label('', 11, 0xfff8ef, '800');
    this.trayListText.style.stroke = { color: 0x3a2418, width: 3 };
    this.overlay.addChild(this.gauge, this.gaugeText, this.boxText, this.trayListBg, this.trayListText);
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
    this.trayArt.visible = on;
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

    // cups on the pickup coasters (a PassItem.tray draws as one wood coaster with every cup)
    const g = this.cups;
    g.clear();
    g.zIndex = Math.max(stationDepth(lay.pickup) + 1, sy(PICKUP_Y) + 40); // never behind the pickup crowd
    const cool = passCool(state);
    const trays = passTraySlots(state);
    const trayAt = new Map(trays.map((t) => [t.index, t]));
    pickupCups(state).forEach((c, i) => {
      const { x, y } = pickupSlotXY(lay.pickup, i);
      const tray = trayAt.get(i);
      if (tray) {
        // FB2 B7: a tray coaster — wood board, cups, cooling rings (never a lone first-cup)
        g.ellipse(x, y + 6, 16, 6).fill({ color: 0xe8d4b8, alpha: 0.9 });
        drawTrayBoard(g, x, y - 2, tray.drinks, tray.cool, 1);
        return;
      }
      // 3.3.3 (FB2 A2): a cold hot cup sits on a steady blue coaster (no pay if taken: dump it at the sink)
      if (c.cold) g.ellipse(x, y + 5, 11, 5).fill({ color: 0x3d79b0, alpha: 0.7 });
      else if (c.stale && Math.floor(timeSec * 4) % 2 === 0) g.ellipse(x, y + 5, 11, 5).fill({ color: PALETTE.bad, alpha: 0.6 });
      else if (c.wanted) g.ellipse(x, y + 5, 11, 5).fill({ color: 0xfff2b8, alpha: 0.75 });
      drawItem(g, c.item, x, y - 4, 0.85);
      // 3.3.2: the cooling ring: empties red → orange → yellow → blue (3.3.3: by the A2 cooling clock for hot cups)
      if (cool[i] !== undefined) drawCoolRing(g, x, y - 26, 5, cool[i]);
    });

    // FB2 B7: customer name tags over tray coasters
    this.syncTrayNames(trays.map((t) => {
      const { x, y } = pickupSlotXY(lay.pickup, t.index);
      return { text: t.label, x, y: y - 44 };
    }));

    // FB2 B7: live list over the tray table (name + done ticks + cooling on done cups)
    const tv = trayTableView(state);
    const tg = this.trayArt;
    tg.clear();
    if (tv) {
      const tx = sx(lay.trayTable.x);
      const ty = sy(lay.trayTable.y);
      tg.zIndex = stationDepth(lay.trayTable) + 2;
      const doneCups = tv.items.filter((x) => x.done).map((x) => x.drink);
      const doneCool = tv.items.filter((x) => x.done).map((x) => x.cool ?? 0);
      if (doneCups.length) drawTrayBoard(tg, tx, ty - 22, doneCups, doneCool, 1);
      else {
        // empty claimed tray silhouette waiting for cups
        tg.roundRect(tx - 18, ty - 28, 36, 12, 3).fill({ color: 0xf4ebe0, alpha: 0.7 }).stroke({ width: 1.5, color: 0x8a6238 });
      }
      const lines = tv.items.map((x) => `${x.done ? '✓' : '○'} ${x.short}`).join('\n');
      const text = `${tv.label} · ${tv.done}/${tv.total}\n${lines}`;
      if (this.trayListText.text !== text) this.trayListText.text = text;
      const tw = Math.max(72, Math.ceil(this.trayListText.width) + 16);
      const th = Math.max(28, Math.ceil(this.trayListText.height) + 12);
      this.trayListBg.clear();
      this.trayListBg.roundRect(-tw / 2, -th / 2, tw, th, 8).fill({ color: 0x2a1a12, alpha: 0.88 }).stroke({ width: 2, color: tv.complete ? PALETTE.good : 0xc49a6c });
      this.trayListBg.position.set(tx, ty - 70);
      this.trayListText.position.set(tx, ty - 70);
      this.trayListBg.visible = true;
      this.trayListText.visible = true;
    } else {
      this.trayListBg.clear();
      this.trayListBg.visible = false;
      this.trayListText.visible = false;
      if (this.trayListText.text) this.trayListText.text = '';
    }

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

  /** Keep a pool of name-pill tags over tray coasters (create/destroy as the pass row changes). */
  private syncTrayNames(tags: { text: string; x: number; y: number }[]): void {
    while (this.trayNameTags.length > tags.length) {
      const t = this.trayNameTags.pop()!;
      this.overlay.removeChild(t.root);
      t.root.destroy({ children: true });
    }
    tags.forEach((tag, i) => {
      let t = this.trayNameTags[i];
      if (!t) {
        const root = new Container();
        const bg = new Graphics();
        const text = label('', 11, 0x5a3a18, '800');
        root.addChild(bg, text);
        this.trayNameTags.push((t = { root, bg, text }));
        this.overlay.addChild(root);
      }
      if (t.text.text !== tag.text) t.text.text = tag.text;
      const w = Math.max(36, Math.ceil(t.text.width) + 14);
      t.bg.clear();
      t.bg.roundRect(-w / 2, -10, w, 18, 9).fill(0xfff8ef).stroke({ width: 2, color: 0x8a6238 });
      t.root.position.set(tag.x, tag.y);
      t.root.visible = true;
    });
  }
}
