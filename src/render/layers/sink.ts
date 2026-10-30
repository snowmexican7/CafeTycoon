import { Container, Graphics, type Text } from 'pixi.js';
import { LAYOUT, SINK_ID } from '../../data/layout';
import { potMachine } from '../../sim/sink';
import type { GameState, PlayerId } from '../../sim/types';
import { carafeLook, heldIsCold, potBadge, type CarafeTone, type PotTone } from '../sinkModel';
import { PALETTE, PROGRESS_BAR_RISE, TILE, sx, sy } from '../theme';

const SCENE_WIDTH = LAYOUT.width * TILE;
import { label } from './draw';
import { stationDepth } from './stations';

const COFFEE: Record<CarafeTone, number> = { fresh: 0x5a3320, brewing: 0x6b3d24, cold: 0x4a4c63, stale: 0x45401f, empty: 0x5a3320 };

/**
 * FB2 A3: a drip carafe, standing with its base at (x, y). `fill` 0..1 is how full the glass is; `tone` tints the
 * coffee (cold goes grey-blue, stale goes murky). Shared by the machine's hot plate and a barista carrying it.
 */
export function drawCarafe(g: Graphics, x: number, y: number, k: number, fill: number, tone: CarafeTone, timeSec = 0): void {
  const h = 28 * k;
  const wTop = 12 * k;
  const wBot = 14 * k;
  // the handle, on the right
  g.roundRect(x + wBot - 1 * k, y - h + 8 * k, 6 * k, 14 * k, 3 * k).stroke({ width: 2.5 * k, color: 0x2d2a30 });
  // glass
  g.poly([x - wTop, y - h, x + wTop, y - h, x + wBot, y, x - wBot, y]).fill({ color: 0xdde8ee, alpha: 0.9 }).stroke({ width: 1.5 * k, color: 0x8d989f });
  const f = Math.max(0, Math.min(1, fill));
  if (f > 0) {
    const top = y - h * 0.85 * f;
    const wAt = (yy: number) => wBot - ((y - yy) / h) * (wBot - wTop);
    g.poly([x - wAt(top) + 1, top, x + wAt(top) - 1, top, x + wBot - 1, y - 1, x - wBot + 1, y - 1]).fill(COFFEE[tone]);
    if (tone === 'stale') {
      // a dull film on yesterday's coffee
      g.moveTo(x - wAt(top) + 2, top + 1.5).lineTo(x + wAt(top) - 2, top + 1.5).stroke({ width: 1.5, color: 0x8a8a3a, alpha: 0.8 });
    }
  }
  // lid
  g.roundRect(x - wTop - 1 * k, y - h - 4 * k, wTop * 2 + 2 * k, 5 * k, 2 * k).fill(0x2d2a30);
  g.moveTo(x - wBot + 3 * k, y - h + 4 * k).lineTo(x - wBot + 5 * k, y - 4 * k).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
  if (tone === 'fresh' || tone === 'brewing') {
    // steam
    const sway = Math.sin(timeSec * 3) * 2 * k;
    g.moveTo(x - 4 * k, y - h - 8 * k).quadraticCurveTo(x - 1 * k + sway, y - h - 14 * k, x + 2 * k, y - h - 8 * k).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
  } else if (tone === 'cold') {
    // a little frost star: this pot is done
    g.moveTo(x - 4 * k, y - h - 10 * k).lineTo(x + 4 * k, y - h - 10 * k).moveTo(x, y - h - 14 * k).lineTo(x, y - h - 6 * k).stroke({ width: 2, color: 0x9fd3ff });
  }
}

interface Badge { root: Container; bg: Graphics; text: Text; key: string }

const BADGE: Record<PotTone, { bg: number; edge: number }> = {
  stale: { bg: 0x5a4a12, edge: 0xf6c35b },
  cold: { bg: 0x23466a, edge: 0x9fd3ff },
  out: { bg: 0x3a2a20, edge: 0xfff4e2 },
};

/**
 * FB2 A3, the per-frame half: each drip machine's carafe (full, cold, stale, or gone to the sink), the badge over
 * a pot that needs dumping ("STALE: dump at sink"), and a blue pulse on the sink while the local barista holds
 * the pot or a cold cup. Gear runs only.
 */
export class SinkVisuals {
  /** Above the actors: badges. */
  readonly overlay = new Container();
  private readonly pots = new Map<string, Graphics>();
  private readonly badges = new Map<string, Badge>();
  private readonly glow = new Graphics();

  constructor(private readonly depth: Container) {
    depth.addChild(this.glow);
  }

  update(state: GameState, localId: PlayerId | null, timeSec: number): void {
    const on = state.gear === true;
    this.overlay.visible = on;
    this.glow.visible = on;
    const seen = new Set<string>();
    if (on) {
      for (const st of state.stations) {
        if (!potMachine(st) || st.twin) continue;
        seen.add(st.id);
        const g = this.pots.get(st.id) ?? this.addPot(st.id);
        const cx = sx(st.pos.x);
        const top = sy(st.pos.y) - 20;
        g.clear();
        g.zIndex = stationDepth(st.pos) + 0.5;
        const look = carafeLook(state, st);
        if (look.show) drawCarafe(g, cx - 6, top - 6, 1, look.fill, look.tone, timeSec);
        else g.ellipse(cx - 6, top - 7, 13, 2.6).fill({ color: PALETTE.cherry, alpha: 0.35 + 0.25 * Math.sin(timeSec * 5) }); // a hot plate with nothing on it

        const badge = potBadge(state, st);
        const b = this.badges.get(st.id) ?? this.addBadge(st.id);
        b.root.visible = badge !== null && state.phase !== 'night';
        if (badge) {
          const key = `${badge.tone}|${badge.text}`;
          if (key !== b.key) {
            b.key = key;
            b.text.text = badge.text;
            const w = Math.ceil(b.text.width) + 22;
            b.bg.clear();
            b.bg.roundRect(-w / 2, -14, w, 28, 9).fill({ color: BADGE[badge.tone].bg, alpha: 0.94 }).stroke({ width: 2.5, color: BADGE[badge.tone].edge });
            b.text.style.fill = BADGE[badge.tone].edge;
          }
          const pulse = badge.tone === 'out' ? 1 : 1 + 0.05 * Math.sin(timeSec * 6);
          b.root.scale.set(pulse);
          // keep the whole badge on the floor even for a machine against the left or right wall
          const half = (b.bg.width / 2) * pulse + 4;
          b.root.position.set(Math.max(half, Math.min(SCENE_WIDTH - half, cx)), sy(st.pos.y) - PROGRESS_BAR_RISE.drip - 6);
        }
      }
    }
    for (const [id, g] of this.pots) g.visible = seen.has(id);
    for (const [id, b] of this.badges) if (!seen.has(id)) b.root.visible = false;

    // the sink pulses blue while I carry something that belongs in it
    this.glow.clear();
    const sink = on ? state.stations.find((s) => s.id === SINK_ID) : undefined;
    const me = localId ? state.players.find((p) => p.id === localId) : undefined;
    if (sink && me && (state.phase === 'day' || state.phase === 'closing') && (me.tool === 'pot' || heldIsCold(state, me))) {
      const x = sx(sink.pos.x);
      const y = sy(sink.pos.y) + 30;
      const a = 0.35 + 0.25 * Math.sin(timeSec * 5);
      this.glow.zIndex = stationDepth(sink.pos) - 1;
      this.glow.ellipse(x, y, 46, 14).fill({ color: 0x7fb8e0, alpha: a * 0.6 }).stroke({ width: 3, color: 0x3d79b0, alpha: a + 0.2 });
    }
  }

  private addPot(id: string): Graphics {
    const g = new Graphics();
    this.depth.addChild(g);
    this.pots.set(id, g);
    return g;
  }

  private addBadge(id: string): Badge {
    const root = new Container();
    const bg = new Graphics();
    const text = label('', 15, 0xffffff, '800');
    text.style.stroke = { color: 0x1a120c, width: 3 };
    root.addChild(bg, text);
    this.overlay.addChild(root);
    const b = { root, bg, text, key: '' };
    this.badges.set(id, b);
    return b;
  }
}
