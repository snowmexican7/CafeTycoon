import { Container, Graphics, Text } from 'pixi.js';
import { PALETTE } from '../theme';
import { drawHeart, drawStar, label } from './draw';

interface Pop {
  text: Text;
  age: number;
}

interface Toast {
  root: Container;
  age: number;
  /** stack slot: 0 is the newest, older toasts float above it */
  slot: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: number;
  age: number;
  life: number;
  shape: 'confetti' | 'heart' | 'star';
  size: number;
}

const MAX_TOASTS = 4;
const MAX_BITS = 140;
const TOAST_LIFE = 2.4;
const CONFETTI = [0xe0564a, 0x4c8fd6, 0x4fae7b, 0xf6c35b, 0x8a6bbf, 0xe98aa6];

/**
 * Little one-shot effects: text pops, the "Dev served a latte +$6.10" toasts that stack up over the
 * counter, and confetti / hearts / sparkles. Capped (4 toasts, 140 bits) so four busy players stay cheap;
 * the bits share one Graphics that is only redrawn while something is flying.
 */
export class Effects {
  readonly root = new Container();
  private readonly pops: Pop[] = [];
  private readonly toasts: Toast[] = [];
  private readonly bitsG = new Graphics();
  private readonly bits: Bit[] = [];
  private bitsDrawn = false;
  private lastEarned: number | null = null;
  private lastDay = -1;

  constructor() {
    this.root.addChild(this.bitsG);
  }

  /** Call every frame with today's earnings; spawns a pop at (x, y) whenever they go up. */
  track(day: number, earned: number, x: number, y: number): void {
    if (day !== this.lastDay || this.lastEarned === null || earned < this.lastEarned) {
      this.lastDay = day;
      this.lastEarned = earned;
      return;
    }
    const gained = earned - this.lastEarned;
    this.lastEarned = earned;
    if (gained > 0.004) this.spawn(`+$${gained.toFixed(2)}`, x, y);
  }

  spawn(text: string, x: number, y: number, color: number = PALETTE.honey, size = 16): void {
    const t = label(text, size, color, '700');
    t.style.stroke = { color: PALETTE.espresso, width: 4 };
    t.position.set(x, y);
    this.root.addChild(t);
    this.pops.push({ text: t, age: 0 });
  }

  /** A pill toast in the server's colour, stacked above (x, y). */
  toast(text: string, color: number, x: number, y: number, perfect = false): void {
    if (this.toasts.length >= MAX_TOASTS) {
      const old = this.toasts.shift()!;
      old.root.destroy({ children: true });
    }
    for (const t of this.toasts) t.slot += 1;
    const root = new Container();
    const txt = label(text, 12, PALETTE.espresso, '700');
    const w = txt.width + 22 + (perfect ? 16 : 0);
    const bg = new Graphics();
    bg.roundRect(-w / 2, -12, w, 24, 12).fill(0xfffaf2).stroke({ width: 2.5, color });
    bg.circle(-w / 2 + 11, 0, 5).fill(color);
    if (perfect) drawStar(bg, w / 2 - 12, 0, 7, PALETTE.honey);
    txt.x = 4 - (perfect ? 8 : 0);
    root.addChild(bg, txt);
    root.position.set(x, y);
    this.root.addChild(root);
    this.toasts.push({ root, age: 0, slot: 0 });
  }

  confetti(x: number, y: number, n = 26): void {
    for (let i = 0; i < n && this.bits.length < MAX_BITS; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 140 + Math.random() * 120;
      this.bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, color: CONFETTI[i % CONFETTI.length], age: 0, life: 1.1 + Math.random() * 0.4, shape: 'confetti', size: 4 + Math.random() * 3 });
    }
  }

  hearts(x: number, y: number, n = 5): void {
    for (let i = 0; i < n && this.bits.length < MAX_BITS; i++) {
      this.bits.push({ x: x + (i - n / 2) * 8, y, vx: (Math.random() - 0.5) * 30, vy: -50 - Math.random() * 30, rot: 0, vr: 0, color: PALETTE.cherry, age: -i * 0.08, life: 1.3, shape: 'heart', size: 6 + Math.random() * 2 });
    }
  }

  sparkles(x: number, y: number, n = 6): void {
    for (let i = 0; i < n && this.bits.length < MAX_BITS; i++) {
      const a = (i / n) * Math.PI * 2;
      this.bits.push({ x, y, vx: Math.cos(a) * 50, vy: Math.sin(a) * 30 - 30, rot: 0, vr: 6, color: 0xfff2b8, age: 0, life: 0.8, shape: 'star', size: 6 });
    }
  }

  step(dt: number): void {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.age += dt;
      p.text.y -= dt * 40;
      p.text.alpha = Math.max(0, 1 - p.age / 1.2);
      p.text.scale.set(Math.min(1, 0.6 + p.age * 4));
      if (p.age >= 1.2) {
        p.text.destroy();
        this.pops.splice(i, 1);
      }
    }
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.age += dt;
      const targetY = -t.slot * 28 - Math.min(1, t.age * 3) * 10;
      t.root.pivot.y += (-targetY - t.root.pivot.y) * Math.min(1, dt * 12);
      t.root.scale.set(t.age < 0.12 ? 0.6 + (t.age / 0.12) * 0.45 : t.age < 0.2 ? 1.05 - ((t.age - 0.12) / 0.08) * 0.05 : 1);
      t.root.alpha = t.age > TOAST_LIFE - 0.4 ? Math.max(0, (TOAST_LIFE - t.age) / 0.4) : 1;
      if (t.age >= TOAST_LIFE) {
        t.root.destroy({ children: true });
        this.toasts.splice(i, 1);
      }
    }
    const g = this.bitsG;
    if (this.bits.length === 0) {
      if (this.bitsDrawn) g.clear();
      this.bitsDrawn = false;
      return;
    }
    g.clear();
    this.bitsDrawn = true;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.age += dt;
      if (b.age < 0) continue;
      if (b.age >= b.life) {
        this.bits.splice(i, 1);
        continue;
      }
      if (b.shape === 'confetti') b.vy += 380 * dt;
      b.vx *= 1 - dt * 1.5;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      const k = 1 - b.age / b.life;
      if (b.shape === 'confetti') {
        const w = b.size * Math.abs(Math.cos(b.rot));
        g.rect(b.x - w / 2, b.y - b.size / 3, Math.max(1, w), (b.size * 2) / 3).fill({ color: b.color, alpha: Math.min(1, k * 2) });
      } else if (b.shape === 'heart') drawHeart(g, b.x, b.y, b.size * (0.8 + k * 0.2), b.color);
      else drawStar(g, b.x, b.y, b.size * (0.5 + k * 0.5), b.color, b.rot);
    }
  }
}
