import { Container, Graphics, Text } from 'pixi.js';
import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { TICK_RATE } from '../sim/constants';
import { computeModifiers } from '../sim/effects';
import type { DrinkId, ItemKind, PlayerId, StationKind } from '../sim/types';
import type { RenderView } from './interpolate';

export const TILE = 64;

const COLORS = {
  background: 0x2b2118,
  floor: 0xd9c7a7,
  floorLine: 0xc9b58f,
  customer: 0x9e9e9e,
  text: 0xffffff,
  textDark: 0x2b2118,
};
const STATION_COLORS: Record<StationKind, number> = {
  grinder: 0x8d6e63,
  espresso: 0x455a64,
  steamer: 0x90a4ae,
  coldBrewTap: 0x1e3a5f,
  trash: 0x616161,
  counter: 0xa1887f,
};
const STATION_LABELS: Record<StationKind, string> = {
  grinder: 'Grinder',
  espresso: 'Espresso',
  steamer: 'Steamer',
  coldBrewTap: 'Cold brew',
  trash: 'Trash',
  counter: 'Counter',
};
const ITEM_COLORS: Record<ItemKind, number> = { grounds: 0x6d4c41, espresso: 0x3e2723, latte: 0xf5e6c8, coldBrew: 0x1a237e };
const BARISTA_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835];

const px = (tiles: number) => tiles * TILE;

/** Draws the café from a RenderView. Static parts are drawn once; everything that moves is redrawn each frame. */
export class Scene {
  readonly root = new Container();
  private readonly dynamic = new Graphics();
  private readonly labels = new Container();
  private readonly nameTexts = new Map<PlayerId, Text>();

  constructor() {
    const floor = new Graphics();
    floor.rect(0, 0, px(LAYOUT.width), px(LAYOUT.height)).fill(COLORS.floor);
    for (let x = 1; x < LAYOUT.width; x++) floor.rect(px(x) - 1, 0, 2, px(LAYOUT.height)).fill(COLORS.floorLine);
    for (let y = 1; y < LAYOUT.height; y++) floor.rect(0, px(y) - 1, px(LAYOUT.width), 2).fill(COLORS.floorLine);
    for (const s of LAYOUT.stations) {
      floor.roundRect(px(s.pos.x - 0.5) + 4, px(s.pos.y - 0.5) + 4, TILE - 8, TILE - 8, 10).fill(STATION_COLORS[s.kind]);
      const label = new Text({ text: STATION_LABELS[s.kind], style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fill: COLORS.textDark } });
      label.anchor.set(0.5, 0);
      label.position.set(px(s.pos.x), px(s.pos.y + 0.5) + 2);
      this.labels.addChild(label);
    }
    this.root.addChild(floor, this.dynamic, this.labels);
  }

  update(view: RenderView): void {
    const { state } = view;
    const g = this.dynamic;
    g.clear();
    const mods = computeModifiers(state);

    for (const s of state.stations) {
      if (s.busyTicksLeft > 0 && s.kind !== 'counter' && s.kind !== 'trash') {
        const total = Math.round((ECONOMY.stationSeconds[s.kind] / mods.stationSpeed[s.kind]) * TICK_RATE);
        const frac = Math.max(0, Math.min(1, 1 - s.busyTicksLeft / total));
        const x = px(s.pos.x - 0.5) + 6;
        const y = px(s.pos.y - 0.5) - 8;
        g.rect(x, y, TILE - 12, 6).fill(0x000000);
        g.rect(x, y, (TILE - 12) * frac, 6).fill(0x66bb6a);
      }
      if (s.output) g.circle(px(s.pos.x), px(s.pos.y), 10).fill(ITEM_COLORS[s.output]).stroke({ width: 2, color: 0xffffff });
    }

    state.customers.forEach((c, i) => {
      const slot = LAYOUT.queueSlots[Math.min(i, LAYOUT.queueSlots.length - 1)];
      const cx = px(slot.x);
      const cy = px(slot.y);
      g.roundRect(cx - 14, cy - 14, 28, 28, 6).fill(COLORS.customer);
      g.circle(cx, cy, 7).fill(ITEM_COLORS[c.drink as DrinkId]);
      const frac = c.patienceLeft / c.patienceMax;
      const r = Math.round(255 * (1 - frac));
      const gr = Math.round(200 * frac);
      g.rect(cx - 16, cy - 24, 32, 5).fill(0x000000);
      g.rect(cx - 16, cy - 24, 32 * frac, 5).fill((r << 16) | (gr << 8));
    });

    const seen = new Set<PlayerId>();
    state.players.forEach((p, i) => {
      seen.add(p.id);
      const pos = view.baristaPositions[p.id] ?? p.pos;
      const color = BARISTA_COLORS[i % BARISTA_COLORS.length];
      const alpha = p.connected ? 1 : 0.35;
      g.circle(px(pos.x), px(pos.y), TILE * 0.3).fill({ color, alpha }).stroke({ width: 2, color: 0x000000, alpha });
      if (p.holding) g.circle(px(pos.x) + 14, px(pos.y) - 14, 8).fill(ITEM_COLORS[p.holding]).stroke({ width: 2, color: 0xffffff });
      let t = this.nameTexts.get(p.id);
      if (!t) {
        t = new Text({ text: p.name, style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fill: COLORS.text, stroke: { color: 0x000000, width: 3 } } });
        t.anchor.set(0.5, 1);
        this.labels.addChild(t);
        this.nameTexts.set(p.id, t);
      }
      t.text = p.name;
      t.alpha = alpha;
      t.position.set(px(pos.x), px(pos.y) - TILE * 0.35);
    });
    for (const [id, t] of this.nameTexts) {
      if (!seen.has(id)) {
        t.destroy();
        this.nameTexts.delete(id);
      }
    }
  }
}

export const SCENE_BACKGROUND = COLORS.background;
