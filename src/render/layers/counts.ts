import { Container, Graphics, Text } from 'pixi.js';
import type { GameState, PlayerId, StationKind, Vec2 } from '../../sim/types';
import { coolColor, heldRecipe, stationCounts, type HeldRecipe } from '../countsModel';
import { handmadeHeldRecipe, jugMeter, steamMeter, type HandmadeRecipe, type JugMeter, type SteamMeter } from '../handmadeModel';
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
interface Meter { root: Container; g: Graphics; key: string }

/** 3.3.2: floating "how many left" numbers over stations, cooling rings on drip pots, recipe steps over carried cups.
 *  FB2 B8: jug + steam meters, and hand-made recipe icons from `handmade.heldRecipe` (not the generic strip). */
export class CountsLayer {
  readonly root = new Container();
  private readonly badges: Badge[] = [];
  private readonly strips = new Map<PlayerId, Strip>();
  private readonly jugs = new Map<PlayerId, Meter>();
  private readonly steams = new Map<PlayerId, Meter>();

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
    const jugSeen = new Set<PlayerId>();
    const steamSeen = new Set<PlayerId>();
    for (const id of humans) {
      const pos = playerPos.get(id);
      const p = state.players.find((x) => x.id === id);
      // FB2 B8: hand-made latte/cappuccino steps from handmade.ts; else the generic ticket strip.
      const hand = pos && p ? handmadeHeldRecipe(state, p) : null;
      const recipe = pos && !hand ? heldRecipe(state, id) : null;
      const fresh = pos && p ? heldFreshness(state, p) : null;
      if (pos && (hand || recipe || fresh !== null)) {
        seen.add(id);
        const s = this.strips.get(id) ?? this.makeStrip(id);
        if (hand) this.drawHandmadeStrip(s, hand, fresh);
        else this.drawStrip(s, recipe, fresh);
        s.root.position.set(sx(pos.x), sy(pos.y) - 116);
        s.root.visible = true;
      }

      // FB2 B8: jug meter over the barista while they fill (or hold a filled jug).
      if (pos && p) {
        const jug = jugMeter(state, p);
        if (jug) {
          jugSeen.add(id);
          const m = this.jugs.get(id) ?? this.makeMeter(this.jugs, id);
          this.drawJug(m, jug);
          m.root.position.set(sx(pos.x) - 52, sy(pos.y) - 78);
          m.root.visible = true;
        }
        const steam = steamMeter(state, p);
        if (steam) {
          steamSeen.add(id);
          const m = this.steams.get(id) ?? this.makeMeter(this.steams, id);
          this.drawSteam(m, steam);
          const wand = state.stations.find((st) => st.id === steam.station);
          const at = wand?.pos ?? pos;
          m.root.position.set(sx(at.x), sy(at.y) - (wand ? PROGRESS_BAR_RISE.steamer + 18 : 98));
          m.root.visible = true;
        }
      }
    }
    for (const [id, s] of this.strips) if (!seen.has(id)) s.root.visible = false;
    for (const [id, m] of this.jugs) if (!jugSeen.has(id)) m.root.visible = false;
    for (const [id, m] of this.steams) if (!steamSeen.has(id)) m.root.visible = false;
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

  private makeMeter(map: Map<PlayerId, Meter>, id: PlayerId): Meter {
    const root = new Container();
    const g = new Graphics();
    root.addChild(g);
    this.root.addChild(root);
    const m: Meter = { root, g, key: '' };
    map.set(id, m);
    return m;
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

  /** FB2 B8: recipe icons from handmade.heldRecipe (shot/double, syrup, milk, steam, foam). */
  private drawHandmadeStrip(s: Strip, r: HandmadeRecipe, fresh: number | null): void {
    const key = `hm|${r.drink}|${r.steps.map((x) => `${x.step[0]}${x.state[0]}`).join('')}|${fresh === null ? '-' : Math.round(fresh * 40)}`;
    if (key === s.key) return;
    s.key = key;
    const n = r.steps.length;
    const step = 26;
    const ring = fresh !== null ? 22 : 0;
    const w = n * step + 8 + ring;
    s.bg.clear();
    s.bg.roundRect(-w / 2, -14, w, 28, 14).fill({ color: 0xfffaf2, alpha: 0.95 }).stroke({ width: 2, color: PALETTE.espresso });
    if (fresh !== null) drawCoolRing(s.bg, w / 2 - 13, 0, 8, fresh);
    while (s.icons.length < n) {
      const t = label('', 12, 0xffffff, '700', 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif');
      s.root.addChild(t);
      s.icons.push(t);
    }
    r.steps.forEach((st, i) => {
      const x = -w / 2 + 4 + step * i + step / 2;
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

  /** Vertical milk jug with the three marks; fill rises from the bottom. */
  private drawJug(m: Meter, jug: JugMeter): void {
    const key = `${Math.round(jug.fill * 40)}|${jug.line}|${jug.done ? 1 : 0}`;
    if (key === m.key) return;
    m.key = key;
    const g = m.g;
    g.clear();
    const h = 56;
    const w = 22;
    g.roundRect(-w / 2, -h, w, h, 6).fill({ color: 0xfffaf2, alpha: 0.95 }).stroke({ width: 2, color: PALETTE.espresso });
    const fillH = Math.max(2, (h - 6) * jug.fill);
    g.roundRect(-w / 2 + 3, -3 - fillH, w - 6, fillH, 3).fill(jug.done ? PALETTE.caramel : PALETTE.honey);
    for (const mark of jug.marks) {
      const y = -3 - (h - 6) * mark;
      const ticket = Math.abs(mark - jug.line) < 0.001;
      g.moveTo(-w / 2 - 2, y).lineTo(w / 2 + 2, y).stroke({ width: ticket ? 2.5 : 1.5, color: ticket ? PALETTE.cherry : PALETTE.espresso, alpha: ticket ? 1 : 0.55 });
    }
    // little spout
    g.roundRect(w / 2 - 2, -h + 4, 6, 8, 2).fill(PALETTE.espresso);
  }

  /** Horizontal steam meter: a needle sweeping a triangle wave, with perfect / ok bands in the middle. */
  private drawSteam(m: Meter, steam: SteamMeter): void {
    const key = `${Math.round(steam.pos * 80)}`;
    // redraw every frame while the needle moves
    m.key = key;
    const g = m.g;
    g.clear();
    const w = 72;
    const h = 16;
    g.roundRect(-w / 2, -h / 2, w, h, 8).fill({ color: 0xfffaf2, alpha: 0.95 }).stroke({ width: 2, color: PALETTE.espresso });
    // ok band
    const okL = steam.middle - steam.ok;
    const okR = steam.middle + steam.ok;
    g.roundRect(-w / 2 + 4 + (w - 8) * okL, -h / 2 + 3, (w - 8) * (okR - okL), h - 6, 4).fill({ color: PALETTE.honey, alpha: 0.45 });
    // perfect band
    const pL = steam.middle - steam.perfect;
    const pR = steam.middle + steam.perfect;
    g.roundRect(-w / 2 + 4 + (w - 8) * pL, -h / 2 + 3, (w - 8) * (pR - pL), h - 6, 4).fill({ color: PALETTE.mint, alpha: 0.75 });
    // needle
    const nx = -w / 2 + 4 + (w - 8) * steam.pos;
    g.moveTo(nx, -h / 2 - 2).lineTo(nx, h / 2 + 2).stroke({ width: 3, color: PALETTE.cherry, cap: 'round' });
    g.circle(nx, 0, 3.5).fill(PALETTE.cherry).stroke({ width: 1, color: 0xffffff });
  }
}
