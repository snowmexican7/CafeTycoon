import { Container, Graphics, Text } from 'pixi.js';
import type { GameState, PlayerId, StationKind, Vec2 } from '../../sim/types';
import { coolColor, heldRecipe, stationCounts, type HeldRecipe } from '../countsModel';
import { heldFreshness } from '../sinkModel';
import { PALETTE, PROGRESS_BAR_RISE, sx, sy } from '../theme';
import { label } from './draw';

/**
 * Draw a cooling ring: a disc that empties clockwise as `frac` falls from 1 to 0, coloured by coolColor()
 * (red → orange → yellow → blue). Exported so any timer (the pickup coasters, a drip pot, later a shot
 * on the machine) can use it with a 0..1 fraction.
 */
export function drawCoolRing(g: Graphics, x: number, y: number, r: number, frac: number): void {
  const f = Math.max(0, Math.min(1, frac));
  const color = coolColor(f);
  g.circle(x, y, r + 1.5).fill({ color: PALETTE.espresso, alpha: 0.75 });
  if (f <= 0) g.circle(x, y, r).fill(color);
  else if (f >= 1) g.circle(x, y, r).fill(color);
  else {
    const a0 = -Math.PI / 2;
    g.moveTo(x, y).arc(x, y, r, a0, a0 + Math.PI * 2 * f).lineTo(x, y).fill(color);
  }
  g.circle(x, y, r + 1.5).stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
}

const TONE: Record<'ok' | 'low' | 'cold', number> = { ok: PALETTE.espresso, low: 0xb9651f, cold: 0x3d79b0 };

interface Badge { root: Container; bg: Graphics; text: Text; key: string }
interface Strip { root: Container; bg: Graphics; icons: Text[]; key: string }

/** 3.3.2: floating "how many left" numbers over stations, cooling rings on drip pots, recipe steps over carried cups. */
export class CountsLayer {
  readonly root = new Container();
  private readonly badges: Badge[] = [];
  private readonly strips = new Map<PlayerId, Strip>();

  update(state: GameState, kinds: Map<string, StationKind>, playerPos: Map<PlayerId, Vec2>, humans: Set<PlayerId>): void {
    const counts = stationCounts(state);
    counts.forEach((c, i) => {
      const b = this.badges[i] ?? this.makeBadge();
      const kind = kinds.get(c.id) ?? 'espresso';
      const cx = sx(c.pos.x);
      const top = c.rise !== undefined ? sy(c.pos.y) - c.rise : sy(c.pos.y) - PROGRESS_BAR_RISE[kind] + 24;
      const key = `${c.n}|${c.tone}|${c.cool === null ? '-' : Math.round(c.cool * 40)}|${c.unit ?? ''}`;
      if (key !== b.key) {
        b.text.text = c.unit ? `${c.n} ${c.unit}` : String(c.n);
        const w = Math.max(28, b.text.width + 14);
        const ring = c.cool !== null;
        b.bg.clear();
        b.bg.roundRect(-w / 2, -13, w, 26, 13).fill(TONE[c.tone]).stroke({ width: 2, color: 0xffffff });
        b.text.position.set(0, 0);
        if (ring) drawCoolRing(b.bg, w / 2 + 11, 0, 8, c.cool!);
        b.key = key;
      }
      // a worded count (the fridge's "24 milk left") sits centred over its art, and on screen at the left wall
      b.root.position.set(c.unit ? Math.max(b.bg.width / 2 + 6, cx) : cx + 38, top);
      b.root.visible = true;
    });
    for (let i = counts.length; i < this.badges.length; i++) this.badges[i].root.visible = false;

    const seen = new Set<PlayerId>();
    for (const id of humans) {
      const pos = playerPos.get(id);
      const recipe = pos ? heldRecipe(state, id) : null;
      // 3.3.3 (FB2 A2): a hot cup in hand gets its cooling ring on the end of the strip (or on its own)
      const p = state.players.find((x) => x.id === id);
      const fresh = pos && p ? heldFreshness(state, p) : null;
      if (!pos || (!recipe && fresh === null)) continue;
      seen.add(id);
      const s = this.strips.get(id) ?? this.makeStrip(id);
      this.drawStrip(s, recipe, fresh);
      s.root.position.set(sx(pos.x), sy(pos.y) - 116);
      s.root.visible = true;
    }
    for (const [id, s] of this.strips) if (!seen.has(id)) s.root.visible = false;
  }

  private makeBadge(): Badge {
    const root = new Container();
    const bg = new Graphics();
    const text = label('', 16, 0xffffff, '800');
    root.addChild(bg, text);
    this.root.addChild(root);
    const b = { root, bg, text, key: '' };
    this.badges.push(b);
    return b;
  }

  private makeStrip(id: PlayerId): Strip {
    const root = new Container();
    const bg = new Graphics();
    root.addChild(bg);
    this.root.addChild(root);
    const s: Strip = { root, bg, icons: [], key: '' };
    this.strips.set(id, s);
    return s;
  }

  private drawStrip(s: Strip, r: HeldRecipe | null, fresh: number | null): void {
    const steps = r?.steps ?? [];
    const key = `${r?.drink ?? '-'}|${steps.map((x) => x.state[0]).join('')}|${fresh === null ? '-' : Math.round(fresh * 40)}`;
    if (key === s.key) return;
    s.key = key;
    const n = steps.length;
    const step = 24;
    const ring = fresh !== null ? 22 : 0;
    const w = n * step + 6 + ring;
    s.bg.clear();
    s.bg.roundRect(-w / 2, -14, w, 28, 14).fill({ color: 0xfffaf2, alpha: 0.95 }).stroke({ width: 2, color: PALETTE.espresso });
    if (fresh !== null) drawCoolRing(s.bg, w / 2 - 13, 0, 8, fresh);
    while (s.icons.length < n) {
      const t = label('', 13, 0xffffff, '700', 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif');
      s.root.addChild(t);
      s.icons.push(t);
    }
    steps.forEach((st, i) => {
      const x = -w / 2 + 3 + step * i + step / 2;
      const t = s.icons[i];
      t.text = st.icon;
      t.position.set(x, 0);
      t.visible = true;
      t.alpha = st.state === 'todo' ? 0.35 : 1;
      if (st.state === 'next') s.bg.circle(x, 0, 11).fill({ color: PALETTE.honey, alpha: 0.55 }).stroke({ width: 2, color: PALETTE.caramelDk });
      if (st.state === 'done') {
        s.bg.circle(x + 7, 8, 5).fill(PALETTE.good).stroke({ width: 1, color: 0xffffff });
        s.bg.moveTo(x + 4.5, 8).lineTo(x + 6.5, 10).lineTo(x + 9.5, 6).stroke({ width: 1.5, color: 0xffffff });
      }
    });
    for (let i = n; i < s.icons.length; i++) s.icons[i].visible = false;
  }
}
