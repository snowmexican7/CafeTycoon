import { Container, Graphics, Text } from 'pixi.js';
import { ECONOMY } from '../../data/economy';
import { LAYOUT } from '../../data/layout';
import { TICK_RATE, secondsToTicks } from '../../sim/constants';
import type { DrinkId, GameState, Mess, Rogue } from '../../sim/types';
import { approach, chaosBursts, hash32, messRadius, rogueLine, roguePose, type Burst } from '../chaosModel';
import { FONT_DISPLAY, PALETTE, PROGRESS_BAR_RISE, TILE, customerLook, sx, sy, type Facing } from '../theme';
import { drawPerson } from './actors';
import { bubbleBox, drawMop, drawStar, label } from './draw';

/** Messes are drawn at this radius and scaled to their real size, so spreading never redraws. */
const UNIT_R = 20;
const MAX_PARTICLES = 80;
const MAX_COMICS = 8;

interface MessSprite {
  g: Graphics;
  kind: Mess['kind'];
  shown: number;
  target: number;
  /** seconds since the last growth (drives the ripple ring) */
  ripple: number;
  dying: number | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: number;
  age: number;
  life: number;
  gravity: number;
  shape: 'dot' | 'star' | 'puff';
}

interface Comic {
  text: Text;
  age: number;
  life: number;
  rot: number;
  big: boolean;
}

interface RogueSprite {
  root: Container;
  body: Graphics;
  steam: Graphics;
  bubble: Container;
  bubbleBg: Graphics;
  bubbleText: Text;
  bubbleKey: string;
  key: string;
  x: number;
  y: number;
  facing: Facing;
  id: number;
}

/** Ground mess: a heap of coffee grounds with speckles. Drawn at UNIT_R around (0, 0). */
function drawGrounds(g: Graphics, id: number): void {
  const h = hash32(id);
  const R = UNIT_R;
  g.ellipse(0, 2, R * 1.5, R * 0.7).fill({ color: 0x5e3a22, alpha: 0.28 });
  g.ellipse(0, 3, R * 1.05, R * 0.5).fill({ color: 0x2a1608, alpha: 0.3 });
  g.ellipse(0, 0, R, R * 0.5).fill(0x4a2c1a);
  g.ellipse(-R * 0.15, -R * 0.12, R * 0.7, R * 0.34).fill(0x5e3a22);
  g.ellipse(-R * 0.25, -R * 0.22, R * 0.35, R * 0.16).fill(0x7a4e30);
  g.ellipse(-R * 0.1, -R * 0.36, R * 0.16, R * 0.07).fill({ color: 0xc89a70, alpha: 0.8 });
  for (let i = 0; i < 9; i++) {
    const a = ((h >>> (i * 3)) & 63) / 10;
    const d = R * (1.05 + (((h >>> i) & 7) / 7) * 0.45);
    g.circle(Math.cos(a) * d, Math.sin(a) * d * 0.5, 1.6 + ((h >>> (i + 5)) & 1)).fill(0x4a2c1a);
  }
}

/** Latte puddle: a lumpy blob with a foam rim and a shine. Drawn at UNIT_R around (0, 0). */
function drawSpill(g: Graphics, id: number, item: DrinkId | 'spill' = 'latte'): void {
  const h = hash32(id);
  const R = UNIT_R;
  const body = item === 'coldBrew' ? 0x6b4026 : item === 'espresso' ? 0x5a3320 : 0xd9ad80;
  const rim = item === 'coldBrew' ? 0x8a5a3a : item === 'espresso' ? 0x7a4a30 : 0xf3dfc1;
  const lobes: [number, number, number][] = [[0, 0, 1]];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + ((h >>> (i * 4)) & 15) / 8;
    lobes.push([Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.3, 0.42 + (((h >>> (i * 2)) & 7) / 7) * 0.22]);
  }
  for (const [x, y, k] of lobes) g.ellipse(x, y + 1.5, R * k + 4.5, (R * k + 4.5) * 0.52).fill({ color: 0x7a4a2a, alpha: 0.55 });
  for (const [x, y, k] of lobes) g.ellipse(x, y, R * k + 3, (R * k + 3) * 0.52).fill(rim);
  for (const [x, y, k] of lobes) g.ellipse(x, y, R * k, R * k * 0.52).fill(body);
  g.ellipse(R * 0.1, R * 0.08, R * 0.55, R * 0.2).fill({ color: 0x000000, alpha: 0.08 });
  g.ellipse(-R * 0.3, -R * 0.12, R * 0.28, R * 0.08).fill({ color: 0xffffff, alpha: 0.55 });
  g.circle(R * 0.35, -R * 0.05, 1.8).fill({ color: 0xffffff, alpha: 0.7 });
  // a couple of droplets
  g.ellipse(R * 1.25, R * 0.25, 3, 1.6).fill(body);
  g.ellipse(-R * 1.15, R * 0.3, 2.4, 1.3).fill(body);
}

/** The mop bucket with its wringer (feet at 0, 0). */
function drawBucket(g: Graphics): void {
  g.ellipse(0, 2, 22, 6).fill({ color: 0x2a1608, alpha: 0.22 });
  g.poly([-18, -30, 18, -30, 14, 0, -14, 0]).fill(PALETTE.honey).stroke({ width: 2, color: 0xb98a2a });
  g.rect(-17, -22, 34, 4).fill({ color: 0xb98a2a, alpha: 0.6 });
  g.ellipse(0, -30, 18, 5).fill(0x7fb6d4).stroke({ width: 2, color: 0xb98a2a });
  g.ellipse(-5, -31, 6, 1.6).fill({ color: 0xffffff, alpha: 0.6 });
  g.circle(-11, 1, 3).fill(0x3a2a24);
  g.circle(11, 1, 3).fill(0x3a2a24);
}

/** The yellow A-frame "wet floor" sign (feet at 0, 0). */
function drawWetSign(g: Graphics): void {
  g.ellipse(0, 2, 16, 4).fill({ color: 0x2a1608, alpha: 0.22 });
  g.poly([-15, 0, -8, -44, 8, -44, 15, 0]).fill(0xf8cf3e).stroke({ width: 2, color: 0x8a6a12, join: 'round' });
  g.roundRect(-9, -47, 18, 5, 2).fill(0xe0b021);
  g.poly([0, -38, 8, -24, -8, -24]).fill(0x2b2b30);
  g.rect(-0.9, -34, 1.8, 6).fill(0xf8cf3e);
  g.circle(0, -26.5, 1.1).fill(0xf8cf3e);
  // a slipping stick figure
  g.circle(-4, -18, 1.8).fill(0x2b2b30);
  g.moveTo(-3, -16).lineTo(1, -11).lineTo(5, -12).stroke({ width: 1.6, color: 0x2b2b30, cap: 'round' });
  g.moveTo(1, -11).lineTo(-2, -7).stroke({ width: 1.6, color: 0x2b2b30, cap: 'round' });
  g.ellipse(2, -5, 6, 1.4).fill(0x2b2b30);
}

/**
 * The chaos pack on screen: grounds piles and spreading puddles on the floor, the mop bucket and wet-floor
 * sign, the rogue customer (angry steam, sneaking behind the counter, storming out), the occupied-station
 * tape, and the comic one-shots (THUD!, SLAM!, splashes, sparkles). Purely visual and driven by the sim
 * state and log; the per-frame cost is a handful of small Graphics, and idle messes never redraw.
 */
export class Chaos {
  /** Flat floor layer (messes), between the cached floor and the depth layer. */
  readonly floor = new Container();
  /** Above the actors: station tape, rogue bubble, particles and comic text. */
  readonly overlay = new Container();
  private readonly messes = new Map<number, MessSprite>();
  private readonly ripples = new Graphics();
  private readonly tape = new Graphics();
  private readonly tapeLabels = new Map<string, Text>();
  private readonly particlesG = new Graphics();
  private readonly particles: Particle[] = [];
  private readonly comics: Comic[] = [];
  private readonly bucket = new Container();
  private readonly restingMop = new Graphics();
  private readonly sign = new Container();
  private signX = sx(LAYOUT.mopHome.x) - 30;
  private signY = sy(LAYOUT.mopHome.y) + 20;
  private signPop = 1;
  private rogue: RogueSprite | null = null;
  private prevState: GameState | null = null;
  private lastSeq = -1;
  private slam: { age: number } | null = null;
  /** Spill drink kinds by mess id, from the drop/slip log, so a cold-brew puddle looks dark. */
  private readonly spillItem = new Map<number, DrinkId>();
  private fxDrawn = false;
  /** Seconds of screen jolt left (door slam / thud). */
  jolt = 0;

  constructor(private readonly depth: Container) {
    this.floor.addChild(this.ripples);
    const bg = new Graphics();
    drawBucket(bg);
    this.bucket.addChild(bg, this.restingMop);
    drawMop(this.restingMop, -2, -26, 16, -84);
    this.bucket.position.set(sx(LAYOUT.mopHome.x), sy(LAYOUT.mopHome.y) + 18);
    this.bucket.zIndex = this.bucket.y;
    const sg = new Graphics();
    drawWetSign(sg);
    this.sign.addChild(sg);
    this.depth.addChild(this.bucket, this.sign);
    this.overlay.addChild(this.tape, this.particlesG);
  }

  update(state: GameState, now: number, dt: number): void {
    if (state !== this.prevState) {
      const { bursts, lastSeq } = chaosBursts(this.prevState, state, this.lastSeq);
      this.lastSeq = lastSeq;
      this.prevState = state;
      for (const b of bursts) this.burst(b, state);
    }
    this.updateMesses(state.messes, dt);
    this.updateTape(state, now);
    this.updateMop(state, dt);
    this.updateRogue(state.rogue, now, dt);
    this.stepFx(dt);
    this.jolt = Math.max(0, this.jolt - dt);
  }

  /** Screen offset for the slam/thud jolt, added on top of any other shake. */
  joltPx(now: number): { x: number; y: number } {
    if (this.jolt <= 0) return { x: 0, y: 0 };
    const k = this.jolt * 14;
    return { x: Math.sin(now * 90) * k, y: Math.cos(now * 70) * k * 0.6 };
  }

  private updateMesses(list: Mess[], dt: number): void {
    const seen = new Set<number>();
    for (const m of list) {
      seen.add(m.id);
      let s = this.messes.get(m.id);
      if (!s) {
        const g = new Graphics();
        if (m.kind === 'grounds') drawGrounds(g, m.id);
        else drawSpill(g, m.id, this.spillItem.get(m.id) ?? 'latte');
        g.position.set(sx(m.x), sy(m.y) + 10);
        this.floor.addChildAt(g, 0);
        s = { g, kind: m.kind, shown: 0, target: m.amount, ripple: 0, dying: null };
        this.messes.set(m.id, s);
      }
      if (m.amount > s.target + 0.01) s.ripple = 0.001; // it spread / a merge grew it
      s.target = m.amount;
      s.dying = null;
    }
    for (const [id, s] of this.messes) {
      if (!seen.has(id) && s.dying === null) s.dying = 0;
    }
    this.ripples.clear();
    for (const [id, s] of this.messes) {
      if (s.dying !== null) {
        s.dying += dt;
        const k = Math.max(0, 1 - s.dying / 0.35);
        s.g.scale.set((messRadius(s.kind, s.shown) / UNIT_R) * k);
        s.g.alpha = k;
        if (k <= 0) {
          s.g.destroy();
          this.messes.delete(id);
          this.spillItem.delete(id);
        }
        continue;
      }
      if (s.shown !== s.target) {
        s.shown = approach(s.shown, s.target, dt, s.kind === 'spill' ? 3.5 : 7);
        const r = messRadius(s.kind, s.shown) / UNIT_R;
        s.g.scale.set(r, r);
      }
      if (s.ripple > 0) {
        s.ripple += dt;
        const t = s.ripple / 0.7;
        if (t >= 1) s.ripple = 0;
        else {
          const R = messRadius(s.kind, s.target) * (1 + t * 0.6);
          this.ripples.ellipse(s.g.x, s.g.y, R, R * 0.5).stroke({ width: 2.5, color: s.kind === 'spill' ? 0xfff4e2 : 0x7a4e30, alpha: 0.7 * (1 - t) });
        }
      }
    }
  }

  private updateMop(state: GameState, dt: number): void {
    this.restingMop.visible = state.mop.heldBy === null;
    // The wet-floor sign follows whoever is mopping; otherwise it waits folded by the bucket.
    const cleaner = state.players.find((p) => p.cleaningTicksLeft > 0 && p.cleaningMess !== null);
    const mess = cleaner ? state.messes.find((m) => m.id === cleaner.cleaningMess) : undefined;
    const tx = mess ? sx(mess.x) + 30 : sx(LAYOUT.mopHome.x) - 34;
    const ty = mess ? sy(mess.y) + 4 : sy(LAYOUT.mopHome.y) + 22;
    if (Math.abs(tx - this.signX) > 1 || Math.abs(ty - this.signY) > 1) {
      if (Math.hypot(tx - this.signX, ty - this.signY) > TILE * 0.6) this.signPop = 0;
      this.signX = tx;
      this.signY = ty;
    }
    this.signPop = Math.min(1, this.signPop + dt * 4);
    const pop = this.signPop < 1 ? 1 + Math.sin(this.signPop * Math.PI) * 0.25 : 1;
    this.sign.position.set(this.signX, this.signY);
    this.sign.scale.set(mess ? pop : 0.85, mess ? pop : 0.85);
    this.sign.alpha = mess ? 1 : 0.9;
    this.sign.zIndex = this.signY;
    // scrub progress: a little ring over the mess being mopped
    if (cleaner && mess) {
      const k = Math.max(0, Math.min(1, 1 - cleaner.cleaningTicksLeft / ECONOMY.mess.cleanTicks));
      const cx = sx(mess.x);
      const cy = sy(mess.y) - 14;
      this.tape.circle(cx, cy, 9).fill({ color: 0xffffff, alpha: 0.9 }).stroke({ width: 2, color: PALETTE.espresso, alpha: 0.5 });
      if (k > 0) this.tape.moveTo(cx, cy).arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).closePath().fill(PALETTE.mint);
    }
  }

  /** Hazard tape and an "OCCUPIED" placard on a station a rogue is using. */
  private updateTape(state: GameState, now: number): void {
    const g = this.tape;
    g.clear();
    const live = new Set<string>();
    for (const st of state.stations) {
      if (st.occupiedBy === null) continue;
      live.add(st.id);
      const cx = sx(st.pos.x);
      const cy = sy(st.pos.y);
      const sway = Math.sin(now * 3 + cx) * 2;
      // tape across the front
      const y0 = cy + 8 + sway * 0.3;
      g.moveTo(cx - 34, y0).lineTo(cx + 34, y0 + 2).stroke({ width: 7, color: 0xf8cf3e });
      for (let i = -30; i < 32; i += 10) g.moveTo(cx + i, y0 + 3.5 + i * 0.03).lineTo(cx + i + 5, y0 - 3.5 + i * 0.03).stroke({ width: 3, color: 0x2b2b30 });
      // placard
      const py = cy - PROGRESS_BAR_RISE[st.kind] - 18 + sway;
      g.roundRect(cx - 34, py - 10, 68, 20, 6).fill(PALETTE.cherry).stroke({ width: 2, color: 0xffffff });
      let t = this.tapeLabels.get(st.id);
      if (!t) {
        t = label('OCCUPIED', 10, 0xffffff, '700');
        this.tapeLabels.set(st.id, t);
        this.overlay.addChild(t);
      }
      t.position.set(cx, py);
      t.visible = true;
    }
    for (const [id, t] of this.tapeLabels) if (!live.has(id)) t.visible = false;
  }

  private updateRogue(r: Rogue | null, now: number, dt: number): void {
    if (!r) {
      if (this.rogue) {
        this.rogue.root.destroy({ children: true });
        this.rogue.bubble.destroy({ children: true });
        this.rogue = null;
      }
      return;
    }
    let s = this.rogue;
    if (!s || s.id !== r.customerId) {
      if (s) {
        s.root.destroy({ children: true });
        s.bubble.destroy({ children: true });
      }
      s = this.addRogue(r);
    }
    const pose = roguePose(r.stage);
    const tx = sx(r.pos.x);
    const ty = sy(r.pos.y + 0.3);
    const dx = tx - s.x;
    const dy = ty - s.y;
    s.x = approach(s.x, tx, dt, 14);
    s.y = approach(s.y, ty, dt, 14);
    if (dy < -0.5) s.facing = 'up';
    else if (dy > 0.5) s.facing = 'down';
    const moving = Math.hypot(dx, dy) > 0.5;
    const key = `${s.facing}|${pose.carrying}`;
    if (key !== s.key) {
      s.key = key;
      s.body.clear();
      const look = customerLook(r.customerId);
      drawPerson(s.body, { ...look, facing: s.facing, holding: pose.carrying ? r.drink : null, angry: true });
    }
    const speed = pose.fast ? 20 : 11;
    const bob = moving ? -Math.abs(Math.sin(now * speed)) * (pose.crouch < 1 ? 4 : 2.5) : pose.tap ? -Math.abs(Math.sin(now * 9)) * 1.5 : 0;
    s.root.position.set(s.x, s.y);
    s.root.zIndex = s.y;
    s.body.y = bob;
    s.body.scale.set(0.92 * (pose.crouch < 1 ? 1.04 : 1), 0.92 * pose.crouch);
    // sneaking: a guilty lean; storming: leaning into it
    s.root.rotation = moving ? (pose.crouch < 1 ? Math.sin(now * 5) * 0.06 : pose.fast ? Math.sign(dx || 1) * 0.12 : 0) : 0;
    // angry vapour from the head
    s.steam.clear();
    if (pose.steam > 0) {
      for (let i = 0; i < 4; i++) {
        const t = (now * (0.9 + pose.steam * 0.6) + i / 4) % 1;
        const side = i % 2 === 0 ? -1 : 1;
        const x = side * (10 + t * 10) + Math.sin(t * 9 + i) * 2;
        const y = -74 - t * 26;
        s.steam.circle(x, y, (3 + t * 6) * Math.min(1.3, pose.steam)).fill({ color: pose.steam > 1 ? 0xf3a99a : 0xf7f1ec, alpha: 0.95 * (1 - t) }).stroke({ width: 1.5, color: 0x9a7f74, alpha: 0.6 * (1 - t) });
      }
      // the anime anger vein, readable from behind too
      const pulse = 1 + Math.sin(now * 10) * 0.12;
      const vx = 11;
      const vy = -70;
      for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        s.steam.moveTo(vx + ax * 2 * pulse, vy + ay * 6 * pulse).quadraticCurveTo(vx + ax * 2 * pulse, vy + ay * 2 * pulse, vx + ax * 6 * pulse, vy + ay * 2 * pulse).stroke({ width: 2.6, color: 0xd8342a, cap: 'round' });
      }
    }
    if (pose.fast && moving) {
      for (const off of [-30, -14, 2]) {
        const sxp = -Math.sign(dx || 1) * 26;
        s.steam.moveTo(sxp, off).lineTo(sxp - Math.sign(dx || 1) * 18, off).stroke({ width: 3, color: 0xffffff, alpha: 0.75, cap: 'round' });
      }
    }
    // speech bubble
    const text = rogueLine(r.stage, secondsLeftOf(r));
    if (text !== s.bubbleKey) {
      s.bubbleKey = text;
      s.bubbleText.text = text;
      const w = Math.max(56, s.bubbleText.width + 20);
      s.bubbleBg.clear();
      bubbleBox(s.bubbleBg, w, 22, r.stage === 'stormingOut' || r.stage === 'waiting' ? 0xffe2dc : 0xffffff, r.stage === 'stormingOut' ? PALETTE.cherry : PALETTE.espresso);
      s.bubbleText.style.fill = r.stage === 'stormingOut' ? PALETTE.cherry : PALETTE.espresso;
    }
    const shake = r.stage === 'waiting' || r.stage === 'stormingOut' ? Math.sin(now * 40) * 1.2 : 0;
    s.bubble.position.set(s.x + shake, s.y - 112 + bob);
  }

  private addRogue(r: Rogue): RogueSprite {
    const root = new Container();
    const body = new Graphics();
    const steam = new Graphics();
    root.addChild(body, steam);
    this.depth.addChild(root);
    const bubble = new Container();
    const bubbleBg = new Graphics();
    const bubbleText = label('', 11, PALETTE.espresso, '700');
    bubble.addChild(bubbleBg, bubbleText);
    this.overlay.addChild(bubble);
    const x = sx(r.pos.x);
    const y = sy(r.pos.y + 0.3);
    const s: RogueSprite = { root, body, steam, bubble, bubbleBg, bubbleText, bubbleKey: '', key: '', x, y, facing: 'up', id: r.customerId };
    this.rogue = s;
    this.puffs(x, y - 40, 0xf2ebe6, 8, 'puff');
    return s;
  }

  private burst(b: Burst, state: GameState): void {
    const x = sx(b.at.x);
    const y = sy(b.at.y);
    switch (b.kind) {
      case 'thud':
        this.comic('THUD!', x, y - 70, PALETTE.honey, true);
        this.puffs(x, y + 14, 0xf3e6d3, 7, 'puff');
        this.jolt = Math.max(this.jolt, 0.18);
        break;
      case 'splash': {
        const m = state.messes.find((mm) => mm.x === b.at.x && mm.y === b.at.y && mm.kind === 'spill');
        if (m && (b.item === 'espresso' || b.item === 'coldBrew' || b.item === 'latte')) this.spillItem.set(m.id, b.item);
        this.comic('Splosh!', x, y - 40, 0xd9ad80, false);
        this.puffs(x, y + 8, b.item === 'coldBrew' ? 0x6b4026 : 0xd9ad80, 12, 'dot');
        break;
      }
      case 'scatter':
        this.puffs(x, y + 8, 0x4a2c1a, 12, 'dot');
        break;
      case 'sparkle':
        this.comic('Squeaky clean!', x, y - 36, PALETTE.mint, false);
        this.puffs(x, y, 0xfff6c9, 8, 'star');
        break;
      case 'slam':
        this.slam = { age: 0 };
        this.comic('SLAM!', x + 20, y - 54, PALETTE.cherry, true);
        this.puffs(x, y + 20, 0xf3e6d3, 10, 'puff');
        this.jolt = Math.max(this.jolt, 0.3);
        break;
      case 'hmph':
        this.comic(b.text, x, y - 100, PALETTE.cherry, false);
        break;
    }
  }

  private comic(text: string, x: number, y: number, color: number, big: boolean): void {
    if (this.comics.length >= MAX_COMICS) {
      const old = this.comics.shift()!;
      old.text.destroy();
    }
    const t = label(text, big ? 26 : 15, color, '800', FONT_DISPLAY);
    t.style.stroke = { color: PALETTE.espresso, width: big ? 6 : 4, join: 'round' };
    t.position.set(x, y);
    const rot = big ? (Math.random() - 0.5) * 0.35 : 0;
    t.rotation = rot;
    this.overlay.addChild(t);
    this.comics.push({ text: t, age: 0, life: big ? 1.1 : 1.4, rot, big });
  }

  private puffs(x: number, y: number, color: number, n: number, shape: Particle['shape']): void {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = shape === 'dot' ? 70 + Math.random() * 60 : 30 + Math.random() * 30;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5 - (shape === 'dot' ? 70 : shape === 'star' ? 40 : 10),
        r: shape === 'puff' ? 6 + Math.random() * 4 : shape === 'star' ? 5 : 2 + Math.random() * 2,
        color,
        age: 0,
        life: shape === 'puff' ? 0.6 : 0.7,
        gravity: shape === 'dot' ? 320 : 0,
        shape,
      });
    }
  }

  private stepFx(dt: number): void {
    const g = this.particlesG;
    if (this.particles.length === 0 && !this.slam) {
      if (this.fxDrawn) g.clear();
      this.fxDrawn = false;
    } else {
      g.clear();
      this.fxDrawn = true;
    }
    if (this.slam) {
      // the front door swings shut on its hinge, then fades
      this.slam.age += dt;
      const t = this.slam.age;
      const dx = sx(LAYOUT.door.x) - 34;
      const dy = sy(LAYOUT.door.y) + 30;
      const open = Math.max(0, 1 - t / 0.16);
      const w = 14 + 50 * (1 - open);
      const a = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
      g.roundRect(dx, dy - 70, w, 70, 4).fill({ color: 0x8b5a3a, alpha: a }).stroke({ width: 3, color: 0x5c3a26, alpha: a });
      g.roundRect(dx + 6, dy - 62, Math.max(2, w - 12), 22, 3).fill({ color: PALETTE.sky, alpha: a * 0.9 });
      g.circle(dx + w - 8, dy - 34, 3).fill({ color: PALETTE.honey, alpha: a });
      if (t > 1) this.slam = null;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.age / p.life;
      if (p.shape === 'star') drawStar(g, p.x, p.y, p.r * (0.6 + k * 0.4), p.color, p.age * 6);
      else if (p.shape === 'puff') g.circle(p.x, p.y, p.r * (1 + p.age * 1.6)).fill({ color: p.color, alpha: 0.8 * k });
      else g.circle(p.x, p.y, p.r).fill({ color: p.color, alpha: Math.min(1, k * 1.5) });
    }
    for (let i = this.comics.length - 1; i >= 0; i--) {
      const c = this.comics[i];
      c.age += dt;
      const t = c.age;
      // punch in with an overshoot, hang, then float off
      const s = t < 0.12 ? 0.4 + (t / 0.12) * 0.9 : t < 0.22 ? 1.3 - ((t - 0.12) / 0.1) * 0.3 : 1;
      c.text.scale.set(s);
      c.text.y -= dt * (c.big ? 12 : 26);
      c.text.alpha = t > c.life - 0.3 ? Math.max(0, (c.life - t) / 0.3) : 1;
      if (t >= c.life) {
        c.text.destroy();
        this.comics.splice(i, 1);
      }
    }
  }
}

function secondsLeftOf(r: Rogue): number {
  if (r.stage === 'making') return Math.ceil(r.ticksLeft / TICK_RATE);
  if (r.stage === 'waiting') return Math.max(0, Math.ceil((secondsToTicks(ECONOMY.rogue.waitSeconds) - r.waitTicks) / TICK_RATE));
  return 0;
}
