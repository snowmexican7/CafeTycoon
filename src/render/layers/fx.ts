import { Container, Text } from 'pixi.js';
import { PALETTE } from '../theme';
import { label } from './draw';

interface Pop {
  text: Text;
  age: number;
}

/** Little one-shot effects: "+$4.50" coin pops that float up from the counter when a sale lands. */
export class Effects {
  readonly root = new Container();
  private readonly pops: Pop[] = [];
  private lastEarned: number | null = null;
  private lastDay = -1;

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

  spawn(text: string, x: number, y: number): void {
    const t = label(text, 16, PALETTE.honey, '700');
    t.style.stroke = { color: PALETTE.espresso, width: 4 };
    t.position.set(x, y);
    this.root.addChild(t);
    this.pops.push({ text: t, age: 0 });
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
  }
}
