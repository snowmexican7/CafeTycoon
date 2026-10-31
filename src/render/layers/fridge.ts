import { Container, Graphics, type Text } from 'pixi.js';
import { FRIDGE_ID } from '../../data/layout';
import type { GameState, PlayerId } from '../../sim/types';
import { cartonsFor, fridgeGlow, milkSpot } from '../fridgeModel';
import { PALETTE, sx, sy } from '../theme';
import { label } from './draw';
import { drawCarton } from './fridgeArt';
import { stationDepth } from './stations';

/**
 * ui-3.4.1 (FB2 A4), the per-frame half: the milk out at the bar (cartons beside the steamer, with a "N milk out"
 * tag), and a pulsing ring on the floor where the local barista's carton or bar box goes next. Gear runs only.
 */
export class FridgeVisuals {
  readonly overlay = new Container();
  private readonly cartons = new Graphics();
  private readonly glow = new Graphics();
  private readonly tag = new Container();
  private readonly tagBg = new Graphics();
  private readonly tagText: Text;
  private tagKey = '';

  constructor(depth: Container) {
    depth.addChild(this.glow, this.cartons);
    this.tagText = label('', 14, 0xffffff, '800');
    this.tag.addChild(this.tagBg, this.tagText);
    this.overlay.addChild(this.tag);
  }

  update(state: GameState, localId: PlayerId | null, timeSec: number): void {
    const live = state.gear === true && (state.phase === 'day' || state.phase === 'closing');
    this.cartons.clear();
    this.glow.clear();
    this.tag.visible = false;
    if (!live) return;
    const out = state.milkOut ?? 0;
    const spot = out > 0 ? milkSpot(state) : null;
    if (spot) {
      const x = sx(spot.pos.x) + 26;
      const y = sy(spot.pos.y) - 22;
      this.cartons.zIndex = stationDepth(spot.pos) + 0.6;
      const k = cartonsFor(out);
      for (let i = 0; i < k; i++) drawCarton(this.cartons, x - i * 7, y + i * 2, 0.8);
      const text = `${out} milk out`;
      if (text !== this.tagKey) {
        this.tagKey = text;
        this.tagText.text = `🥛 ${text}`;
        const w = this.tagText.width + 16;
        this.tagBg.clear();
        this.tagBg.roundRect(-w / 2, -12, w, 24, 12).fill({ color: out < 4 ? 0xb9651f : 0x3d79b0, alpha: 0.95 }).stroke({ width: 2, color: 0xffffff });
      }
      this.tag.position.set(x - 4, y + 36);
      this.tag.visible = true;
    }
    const me = localId ? state.players.find((p) => p.id === localId) : undefined;
    const go = fridgeGlow(state, me);
    const at = go ? state.stations.find((s) => s.id === go.at) : undefined;
    if (go && at) {
      const a = 0.35 + 0.25 * Math.sin(timeSec * 5);
      const color = go.tone === 'fridge' ? 0x7fb8e0 : PALETTE.honey;
      const edge = go.tone === 'fridge' ? 0x3d79b0 : PALETTE.caramelDk;
      this.glow.zIndex = stationDepth(at.pos) - 1;
      this.glow.ellipse(sx(at.pos.x), sy(at.pos.y) + 30, at.id === FRIDGE_ID ? 44 : 46, 14).fill({ color, alpha: a * 0.6 }).stroke({ width: 3, color: edge, alpha: a + 0.2 });
    }
  }
}
