import { Container, Graphics } from 'pixi.js';
import type { Player, PlayerId } from '../../sim/types';
import { PALETTE, sx, sy } from '../theme';
import { FEET_OFFSET, drawPerson } from './actors';
import { CURB_Y, collapsePose, type CollapsePose } from '../espressoPose';

export { jitterPx, shakePx, type CollapsePose } from '../espressoPose';

/**
 * Render side of the espresso Easter egg: the jittery boosted barista, and the collapse gag
 * (fall over, ambulance pulls up out front, paramedics stretcher them out). Everything is derived
 * from the sim's `Player.espresso` plus how long ago they collapsed, so every client plays the
 * same gag in sync and nothing here can touch the sim.
 */

function drawAmbulance(g: Graphics, flash: boolean): void {
  // a chunky toy van facing right, wheels at y = 0
  g.ellipse(0, 2, 92, 10).fill({ color: 0x2a1608, alpha: 0.25 });
  g.roundRect(-84, -78, 132, 70, 14).fill(0xfffaf2).stroke({ width: 3, color: 0xd9cbb8 });
  g.roundRect(40, -60, 46, 52, 12).fill(0xfffaf2).stroke({ width: 3, color: 0xd9cbb8 });
  g.roundRect(52, -54, 28, 20, 6).fill(PALETTE.sky);
  g.rect(-84, -40, 170, 9).fill(PALETTE.cherry);
  // red cross
  g.roundRect(-34, -70, 12, 30, 2).fill(PALETTE.cherry);
  g.roundRect(-43, -61, 30, 12, 2).fill(PALETTE.cherry);
  g.roundRect(-78, -70, 30, 26, 6).fill(PALETTE.sky);
  // lights
  g.roundRect(-20, -90, 18, 12, 4).fill(flash ? PALETTE.cherry : 0x8a3a33);
  g.roundRect(0, -90, 18, 12, 4).fill(flash ? 0x5b7fd6 : PALETTE.sky);
  if (flash) g.circle(-11, -84, 20).fill({ color: PALETTE.cherry, alpha: 0.18 });
  else g.circle(9, -84, 20).fill({ color: 0x5b7fd6, alpha: 0.18 });
  for (const wx of [-52, 54]) {
    g.circle(wx, -6, 14).fill(0x3a2a24);
    g.circle(wx, -6, 6).fill(0xdfe6ea);
  }
}

function drawStretcher(g: Graphics): void {
  g.ellipse(0, 22, 50, 6).fill({ color: 0x2a1608, alpha: 0.2 });
  g.roundRect(-46, -6, 92, 10, 5).fill(0xfffaf2).stroke({ width: 2, color: 0x9aa7ae });
  g.roundRect(-46, -12, 22, 8, 4).fill(0xffffff);
  for (const lx of [-36, 36]) {
    g.moveTo(lx, 4).lineTo(lx, 16).stroke({ width: 3, color: 0x9aa7ae });
    g.circle(lx, 18, 4).fill(0x3a2a24);
  }
}

function drawHeart(g: Graphics, x: number, y: number, r: number, color: number): void {
  g.circle(x - r * 0.5, y, r * 0.55).fill(color);
  g.circle(x + r * 0.5, y, r * 0.55).fill(color);
  g.poly([x - r * 1.02, y + r * 0.15, x + r * 1.02, y + r * 0.15, x, y + r * 1.25]).fill(color);
}

const MEDIC = { shirt: 0x3f9e80, cap: 0xffffff, skin: 0xe9b48f, hair: 0x3a2418 };

interface Gag {
  /** local clock time the fall happened (seconds), so the gag animates smoothly between snapshots */
  t0: number;
  ambulance: Graphics;
  stretcher: Container;
  stretcherG: Graphics;
  medics: Graphics[];
  hearts: Graphics;
}

/** One ambulance gag per collapsed barista, drawn into the shared depth-sorted layer. */
export class EspressoGags {
  private readonly gags = new Map<string, Gag>();

  constructor(private readonly depth: Container) {}

  /**
   * Called every frame. `simAge(p)` is seconds since the sim says they fell; returns the poses so the
   * actor layer can tip the body over / put it on the stretcher.
   */
  update(players: Player[], simAgeSec: (p: Player) => number | null, now: number, fellAtPx: (p: Player) => { x: number; y: number }): Record<PlayerId, CollapsePose> {
    const poses: Record<PlayerId, CollapsePose> = {};
    const live = new Set<string>();
    for (const p of players) {
      const e = p.espresso;
      const sim = simAgeSec(p);
      if (!e?.out || sim === null || e.collapsedAt === null) continue;
      const key = `${p.id}|${e.collapsedAt}`;
      live.add(key);
      let gag = this.gags.get(key);
      if (!gag) gag = this.add(key, now - sim);
      // never run behind the sim by more than a snapshot, never jump ahead of it
      if (now - gag.t0 < sim - 0.25) gag.t0 = now - sim;
      const age = now - gag.t0;
      const fell = fellAtPx(p);
      const pose = collapsePose(age, fell.x, fell.y);
      poses[p.id] = pose;
      this.draw(gag, pose, now);
    }
    for (const [key, gag] of this.gags) {
      if (live.has(key)) continue;
      gag.ambulance.destroy();
      gag.stretcher.destroy({ children: true });
      gag.hearts.destroy();
      this.gags.delete(key);
    }
    return poses;
  }

  private add(key: string, t0: number): Gag {
    const ambulance = new Graphics();
    const stretcher = new Container();
    const stretcherG = new Graphics();
    drawStretcher(stretcherG);
    const medics = [-58, 58].map((dx) => {
      const m = new Graphics();
      drawPerson(m, { ...MEDIC, apron: false, facing: 'down' });
      m.scale.set(0.86);
      m.position.set(dx, 20);
      return m;
    });
    stretcher.addChild(medics[0], stretcherG, medics[1]);
    const hearts = new Graphics();
    this.depth.addChild(ambulance, stretcher, hearts);
    const gag: Gag = { t0, ambulance, stretcher, stretcherG, medics, hearts };
    this.gags.set(key, gag);
    return gag;
  }

  private draw(gag: Gag, pose: CollapsePose, now: number): void {
    const flash = Math.floor(now * 4) % 2 === 0;
    gag.ambulance.visible = pose.ambulance !== null;
    if (pose.ambulance) {
      gag.ambulance.clear();
      drawAmbulance(gag.ambulance, pose.ambulance.lights && flash);
      gag.ambulance.position.set(pose.ambulance.x, CURB_Y);
      gag.ambulance.zIndex = CURB_Y + 40;
    }
    gag.stretcher.visible = pose.stretcher !== null;
    if (pose.stretcher) {
      const walk = Math.sin(now * 14);
      gag.stretcher.position.set(pose.stretcher.x, pose.stretcher.y);
      gag.stretcher.zIndex = pose.stretcher.y + 22;
      gag.medics[0].y = 20 - Math.abs(walk) * 2.5;
      gag.medics[1].y = 20 - Math.abs(Math.cos(now * 14)) * 2.5;
    }
    gag.hearts.clear();
    if (pose.hearts > 0 && pose.body.visible) {
      // little hearts circling the head: palpitations, cartoon style
      const head = { x: pose.body.x - 52 * Math.min(1, -pose.body.rot / (Math.PI / 2)), y: pose.body.y - 58 * (1 - Math.min(1, -pose.body.rot / (Math.PI / 2))) - 20 };
      for (let i = 0; i < pose.hearts; i++) {
        const a = now * 3 + (i * Math.PI * 2) / pose.hearts;
        const beat = 1 + Math.max(0, Math.sin(now * 16)) * 0.35;
        drawHeart(gag.hearts, head.x + Math.cos(a) * 22, head.y + Math.sin(a) * 8, 5.5 * beat, PALETTE.cherry);
      }
      gag.hearts.zIndex = pose.body.y + 200;
    }
  }
}

/** The body's resting feet position for a barista who fell at sim `pos`. */
export const fellAtScreen = (pos: { x: number; y: number }) => ({ x: sx(pos.x), y: sy(pos.y + FEET_OFFSET) });
