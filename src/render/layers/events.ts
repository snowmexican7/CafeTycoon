import { Container, Graphics, Text } from 'pixi.js';
import type { EventKind, GameState } from '../../sim/types';
import { flashOn, flickerDarkness, inspectorLine, patrolAt, PATROL } from '../eventsModel';
import { PALETTE, sx, sy, type Facing } from '../theme';
import { FEET_OFFSET, drawPerson } from './actors';
import { bubbleBox, label } from './draw';

const INSPECTOR = { shirt: 0x8d8f86, cap: 0x3d3b38, skin: 0xe8b896, hair: 0x5c5a55 };

/** The inspector's clipboard, held at the chest (feet at 0, 0). */
function drawClipboard(g: Graphics, writing: boolean): void {
  g.roundRect(4, -40, 18, 24, 2).fill(0xb98654).stroke({ width: 1.5, color: 0x6e4129 });
  g.roundRect(6, -37, 14, 19, 1).fill(0xfffaf2);
  g.roundRect(9, -42, 8, 4, 1.5).fill(0x9aa7ae);
  for (const y of [-33, -29, -25]) g.moveTo(8, y).lineTo(18, y).stroke({ width: 1, color: 0x9a8a7a });
  if (writing) g.moveTo(16, -28).lineTo(24, -36).stroke({ width: 2, color: 0x3a2418, cap: 'round' });
}

/** A chalk A-frame by the door that lights up for rush hour. */
function drawRushBoard(g: Graphics): void {
  g.ellipse(0, 2, 30, 6).fill({ color: 0x2a1608, alpha: 0.22 });
  g.moveTo(-24, 0).lineTo(-18, -58).stroke({ width: 4, color: 0x8b5a3a, cap: 'round' });
  g.moveTo(24, 0).lineTo(18, -58).stroke({ width: 4, color: 0x8b5a3a, cap: 'round' });
  g.roundRect(-26, -62, 52, 46, 5).fill(0x2f3b36).stroke({ width: 3, color: 0x8b5a3a });
}

interface Sprite {
  root: Container;
  body: Graphics;
  clip: Graphics;
  bubble: Container;
  bubbleBg: Graphics;
  bubbleText: Text;
  text: string;
  facing: Facing;
  t0: number;
}

/**
 * Event visuals in the room: the lights dimming and stuttering in a power flicker (with sparks off
 * the busy machines), the health inspector patrolling with a clipboard and muttering, the rush-hour
 * board by the door, and the influencer's camera flashes washing the room. Everything is derived from
 * `state.events` and local time; nothing touches the sim.
 */
export class EventVisuals {
  /** Above the lighting, below the overlay: the blackout and the camera flash. */
  readonly wash = new Container();
  private readonly dim = new Graphics();
  private readonly sparks = new Graphics();
  private readonly flash = new Graphics();
  private readonly started = new Map<EventKind, number>();
  private inspector: Sprite | null = null;
  private readonly board = new Container();
  private readonly boardBulbs = new Graphics();
  /** A one-off camera flash (the influencer's group photo), seconds left. */
  private flashLeft = 0;
  private lastNow = 0;

  constructor(
    private readonly depth: Container,
    private readonly overlay: Container,
    width: number,
    height: number,
  ) {
    this.dim.rect(0, 0, width, height).fill(0x0b0820);
    this.dim.alpha = 0;
    this.dim.visible = false;
    this.flash.rect(0, 0, width, height).fill(0xffffff);
    this.flash.alpha = 0;
    this.flash.visible = false;
    this.wash.addChild(this.dim, this.sparks, this.flash);
    const bg = new Graphics();
    drawRushBoard(bg);
    const t1 = label('RUSH', 13, 0xfff4e2, '800');
    t1.position.set(0, -48);
    const t2 = label('HOUR!', 13, PALETTE.honey, '800');
    t2.position.set(0, -32);
    this.board.addChild(bg, t1, t2, this.boardBulbs);
    this.board.position.set(sx(2.7), sy(7.25));
    this.board.zIndex = this.board.y;
    this.board.visible = false;
    this.depth.addChild(this.board);
  }

  update(state: GameState, now: number): void {
    const open = state.phase === 'day' || state.phase === 'closing';
    const active = new Set(open ? state.events.map((e) => e.kind) : []);
    for (const k of active) if (!this.started.has(k)) this.started.set(k, now);
    for (const k of [...this.started.keys()]) if (!active.has(k)) this.started.delete(k);

    this.updatePower(state, active.has('powerFlicker') ? now - this.started.get('powerFlicker')! : null, now);
    this.updateInspector(state, active.has('healthInspector') ? this.started.get('healthInspector')! : null, now);
    this.updateRush(active.has('rushHour'), now);
    const influencer = open && state.customers.some((c) => c.kind === 'influencer');
    this.flashLeft = Math.max(0, this.flashLeft - Math.max(0, now - this.lastNow));
    this.lastNow = now;
    const on = (influencer && flashOn(now)) || this.flashLeft > 0;
    this.flash.visible = on;
    this.flash.alpha = this.flashLeft > 0 ? 0.5 * Math.min(1, this.flashLeft / 0.12) : on ? 0.16 : 0;
  }

  flashNow(): void {
    this.flashLeft = 0.25;
  }

  private updatePower(state: GameState, t: number | null, now: number): void {
    this.sparks.clear();
    if (t === null) {
      this.dim.visible = false;
      return;
    }
    const d = flickerDarkness(t);
    this.dim.visible = true;
    this.dim.alpha = d;
    // the machines that were mid-job spit sparks while the power sags
    for (const st of state.stations) {
      if (st.busyTicksLeft <= 0 || st.kind === 'counter' || st.kind === 'trash') continue;
      if ((Math.floor(now * 9) + st.pos.x) % 3 !== 0) continue;
      const cx = sx(st.pos.x) + 14;
      const cy = sy(st.pos.y) - 62;
      const s = Math.sin(now * 40 + st.pos.x);
      this.sparks.moveTo(cx, cy).lineTo(cx + 6, cy + 5 + s * 2).lineTo(cx + 2, cy + 9).lineTo(cx + 10, cy + 16).stroke({ width: 2.5, color: PALETTE.honey, cap: 'round', join: 'round' });
      this.sparks.circle(cx + 10, cy + 16, 3).fill({ color: 0xfff6c9, alpha: 0.9 });
    }
  }

  private updateInspector(state: GameState, t0: number | null, now: number): void {
    if (t0 === null) {
      if (this.inspector) {
        this.inspector.root.destroy({ children: true });
        this.inspector.bubble.destroy({ children: true });
        this.inspector = null;
      }
      return;
    }
    const s = this.inspector ?? this.addInspector(now);
    const at = patrolAt(now - t0);
    const facing: Facing = at.stopped ? 'down' : at.dir.y < -0.2 ? 'up' : 'down';
    if (facing !== s.facing) {
      s.facing = facing;
      s.body.clear();
      drawPerson(s.body, { ...INSPECTOR, facing });
      s.clip.visible = facing === 'down';
    }
    const x = sx(at.pos.x);
    const feet = sy(at.pos.y + FEET_OFFSET);
    const bob = at.stopped ? 0 : -Math.abs(Math.sin(now * 8)) * 2;
    s.root.position.set(x, feet);
    s.root.zIndex = feet;
    s.body.y = bob;
    s.clip.y = bob;
    s.clip.clear();
    drawClipboard(s.clip, at.stopped && Math.sin(now * 12) > 0);
    // a mutter at each stop; "Tsk tsk." if there's a mess within reach
    const nearMess = state.messes.some((m) => Math.hypot(m.x - at.pos.x, m.y - at.pos.y) < 1.6);
    const lap = Math.floor((now - t0) / 20);
    const text = at.stopped ? inspectorLine(at.stop, lap, nearMess) : '';
    if (text !== s.text) {
      s.text = text;
      s.bubbleText.text = text;
      s.bubbleBg.clear();
      if (text) bubbleBox(s.bubbleBg, Math.max(48, s.bubbleText.width + 18), 22, nearMess ? 0xffe2dc : 0xffffff);
    }
    s.bubble.visible = !!text;
    s.bubble.position.set(x, feet - 104);
  }

  private addInspector(now: number): Sprite {
    const root = new Container();
    const body = new Graphics();
    const clip = new Graphics();
    root.addChild(body, clip);
    root.scale.set(1.02);
    drawPerson(body, { ...INSPECTOR, facing: 'down' });
    this.depth.addChild(root);
    const bubble = new Container();
    const bubbleBg = new Graphics();
    const bubbleText = label('', 11, PALETTE.espresso, '700');
    bubble.addChild(bubbleBg, bubbleText);
    this.overlay.addChild(bubble);
    const p = PATROL[0];
    root.position.set(sx(p.x), sy(p.y));
    this.inspector = { root, body, clip, bubble, bubbleBg, bubbleText, text: '', facing: 'down', t0: now };
    return this.inspector;
  }

  private updateRush(on: boolean, now: number): void {
    this.board.visible = on;
    const g = this.boardBulbs;
    g.clear();
    if (!on) return;
    // marquee bulbs chase round the board
    const n = 10;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const x = k < 0.5 ? -24 + k * 2 * 48 : 24 - (k - 0.5) * 2 * 48;
      const y = k < 0.5 ? -62 : -16;
      const lit = (Math.floor(now * 8) + i) % 3 === 0;
      g.circle(x, y, 3).fill(lit ? 0xfff2b8 : 0x8a6a2a);
      if (lit) g.circle(x, y, 6).fill({ color: 0xfff2b8, alpha: 0.3 });
    }
    this.board.rotation = Math.sin(now * 3) * 0.02;
  }
}
