import { Container, Graphics, Text } from 'pixi.js';
import { LAYOUT } from '../../data/layout';
import type { Customer, DrinkId, ItemKind, Player, PlayerId, Vec2 } from '../../sim/types';
import { ECONOMY } from '../../data/economy';
import { TICK_RATE } from '../../sim/constants';
import { type Facing, PALETTE, TILE, baristaLook, customerLook, nextFacing, patienceColor, sx, sy } from '../theme';
import { dashedEllipse, drawHeart, drawItem, drawMop, drawStar, halfDome, label } from './draw';
import { flashOn } from '../eventsModel';
import { jitterPx, type CollapsePose } from '../espressoPose';

/** Feet sit a little below the sim centre so a barista reads as standing on its tile. */
export const FEET_OFFSET = 0.3;
/** Customers stand in the queue strip, drawn a bit lower so they line up behind the rope. */
const CUSTOMER_FEET_PX = 30;

interface PersonOpts {
  shirt: number;
  skin: number;
  hair: number;
  cap?: number;
  apron?: boolean;
  facing: Facing;
  holding?: ItemKind | null;
  ring?: number | null;
  /** Chaos pack: swirly eyes after a slip, furrowed brows and red cheeks when cross. */
  dizzy?: boolean;
  angry?: boolean;
}

const darker = (c: number, k = 0.8) => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);

/** A chunky toy person with its feet at (0, 0). */
export function drawPerson(g: Graphics, o: PersonOpts): void {
  g.ellipse(0, 1, 17, 6).fill({ color: 0x2a1608, alpha: 0.25 });
  if (o.ring != null) dashedEllipse(g, 0, 1, 24, 9, 6, 5, o.ring, 3);
  g.roundRect(-11, -15, 9, 15, 4).fill(0x4a3a33);
  g.roundRect(2, -15, 9, 15, 4).fill(0x4a3a33);
  g.roundRect(-16, -42, 32, 34, 13).fill(o.shirt);
  if (o.apron && o.facing === 'down') {
    g.moveTo(-10, -36).lineTo(10, -36).lineTo(10, -14).quadraticCurveTo(0, -8, -10, -14).closePath().fill(0xfffaf2);
    g.roundRect(-5, -25, 10, 6, 2).stroke({ width: 1.5, color: 0xe2cfb4 });
  }
  if (o.apron && o.facing === 'up') g.moveTo(-14, -24).lineTo(14, -24).stroke({ width: 3, color: 0xfffaf2 });
  g.circle(-17, -24, 6).fill(o.shirt);
  g.circle(17, -24, 6).fill(o.shirt);
  g.circle(-18, -19, 4.5).fill(o.skin);
  g.circle(18, -19, 4.5).fill(o.skin);
  g.circle(0, -58, 17).fill(o.skin);
  if (o.facing === 'down') {
    halfDome(g, 0, -56, 17, 15).fill(o.hair);
    if (o.dizzy) {
      // swirly @ eyes and a wobbly little "o" mouth
      for (const ex of [-6, 6]) {
        g.circle(ex, -53, 3).stroke({ width: 1.3, color: 0x2b1a12 });
        g.circle(ex + 0.6, -53.4, 1.3).stroke({ width: 1.1, color: 0x2b1a12 });
      }
      g.ellipse(0, -45.5, 2.2, 2.6).stroke({ width: 1.5, color: 0x2b1a12 });
    } else {
      g.ellipse(-6, -53, 2.3, 3).fill(0x2b1a12);
      g.ellipse(6, -53, 2.3, 3).fill(0x2b1a12);
      g.circle(-5.2, -54.2, 0.8).fill(0xffffff);
      g.circle(6.8, -54.2, 0.8).fill(0xffffff);
    }
    if (o.angry) {
      g.moveTo(-10, -60).lineTo(-3, -57).stroke({ width: 2.2, color: 0x2b1a12, cap: 'round' });
      g.moveTo(10, -60).lineTo(3, -57).stroke({ width: 2.2, color: 0x2b1a12, cap: 'round' });
    }
    g.ellipse(-11, -47, 3.6, 2.2).fill({ color: o.angry ? 0xe0564a : 0xf08a7a, alpha: o.angry ? 0.8 : 0.55 });
    g.ellipse(11, -47, 3.6, 2.2).fill({ color: o.angry ? 0xe0564a : 0xf08a7a, alpha: o.angry ? 0.8 : 0.55 });
    if (o.angry) g.moveTo(-3.5, -44.5).quadraticCurveTo(0, -47.5, 3.5, -44.5).stroke({ width: 1.6, color: 0x2b1a12, cap: 'round' });
    else if (!o.dizzy) g.moveTo(-3.5, -46.5).quadraticCurveTo(0, -43.5, 3.5, -46.5).stroke({ width: 1.6, color: 0x2b1a12, cap: 'round' });
  } else {
    g.circle(0, -59, 17).fill(o.hair);
    g.ellipse(-16, -56, 3, 4).fill(o.skin);
    g.ellipse(16, -56, 3, 4).fill(o.skin);
  }
  if (o.cap != null) {
    halfDome(g, 0, -64, 16, 14).fill(o.cap);
    if (o.facing === 'down') g.roundRect(-18, -66, 36, 5, 2.5).fill(darker(o.cap));
    else g.roundRect(-16, -66, 32, 5, 2.5).fill(darker(o.cap));
    g.circle(0, -77, 3).fill(o.cap);
  }
  if (o.holding) drawItem(g, o.holding, 20, -24, 0.95);
}

/** Order bubble with a drink icon and a patience ring, centred at (x, y). */
export function drawOrderBubble(g: Graphics, x: number, y: number, drink: DrinkId, patience: number, upset = false): void {
  const r = 22;
  const p = Math.max(0, Math.min(1, patience));
  g.circle(x, y, r).fill({ color: upset ? 0xffe2dc : 0xffffff, alpha: 0.95 });
  g.circle(x, y, r).stroke({ width: 5, color: 0x000000, alpha: 0.09 });
  if (p > 0) {
    g.moveTo(x, y - r);
    g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    // an upset customer's ring is their remake window: it drains in angry red
    g.stroke({ width: 5, color: upset ? 0xc0392b : patienceColor(p), cap: 'round' });
  }
  g.poly([x - 5, y + r - 2, x, y + r + 7, x + 5, y + r - 2]).fill(0xffffff);
  drawItem(g, drink, x, y + 2, 1.05);
}

/** The influencer's tell: a selfie stick with a ring light (it flashes) and likes floating up. */
function drawInfluencer(g: Graphics, t: number): void {
  const on = flashOn(t);
  g.moveTo(16, -20).lineTo(30, -104).stroke({ width: 2.5, color: 0x2b2b30, cap: 'round' });
  if (on) g.circle(31, -112, 26).fill({ color: 0xffffff, alpha: 0.35 });
  g.circle(31, -112, 11).stroke({ width: 5, color: on ? 0xffffff : 0xf3eefa });
  g.roundRect(26, -119, 10, 15, 2).fill(0x33294a);
  g.roundRect(27.5, -117, 7, 10, 1).fill(on ? 0xffffff : 0xe98aa6);
  if (on) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.moveTo(31 + Math.cos(a) * 15, -112 + Math.sin(a) * 15).lineTo(31 + Math.cos(a) * 24, -112 + Math.sin(a) * 24).stroke({ width: 2, color: 0xfff6c9, cap: 'round' });
    }
  }
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.6 + i / 3) % 1;
    drawHeart(g, -26 + Math.sin(k * 7 + i) * 4, -60 - k * 50, 5 * (1 - k * 0.3), PALETTE.cherry);
  }
}

interface PlayerSprite {
  root: Container;
  body: Graphics;
  key: string;
  tag: Container;
  tagBg: Graphics;
  tagText: Text;
  tagKey: string;
  facing: Facing;
  /** Espresso speed trail: recent screen positions, drawn as fading ghosts while boosted. */
  trail: Graphics;
  history: { x: number; y: number }[];
  /** The mop in hand (drawn once, rotated while scrubbing) and the dizzy stars after a slip. */
  tool: Graphics;
  stars: Graphics;
}

interface CustomerSprite {
  root: Container;
  body: Graphics;
  bubble: Graphics;
  /** Per-kind tells drawn each frame (the influencer's ring light; B3 kinds). */
  extra: Graphics;
  x: number;
}

/**
 * Baristas and customers. Bodies live in the shared depth-sorted layer (so they overlap stations correctly);
 * name tags live in the overlay layer so they're never hidden behind a machine.
 */
export class Actors {
  private readonly players = new Map<PlayerId, PlayerSprite>();
  private readonly customers = new Map<number, CustomerSprite>();

  constructor(
    private readonly depthLayer: Container,
    private readonly tagLayer: Container,
  ) {}

  update(
    players: Player[],
    positions: Record<PlayerId, Vec2>,
    customers: Customer[],
    localId: PlayerId | null,
    timeSec: number,
    collapsed: Record<PlayerId, CollapsePose> = {},
  ): void {
    const seen = new Set<PlayerId>();
    players.forEach((p, index) => {
      seen.add(p.id);
      const sprite = this.players.get(p.id) ?? this.addPlayer(p.id);
      sprite.facing = nextFacing(sprite.facing, p.moveDir);
      const look = baristaLook(index);
      const me = p.id === localId;
      const stunned = p.stunTicksLeft > 0;
      const key = `${sprite.facing}|${p.holding}|${me}|${index}|${stunned}`;
      if (key !== sprite.key) {
        sprite.body.clear();
        drawPerson(sprite.body, { shirt: look.cap, cap: look.cap, skin: look.skin, hair: look.hair, apron: true, facing: sprite.facing, holding: p.tool === 'mop' ? null : p.holding, ring: me ? look.cap : null, dizzy: stunned });
        sprite.key = key;
      }
      const pos = positions[p.id] ?? p.pos;
      const moving = p.connected && (p.moveDir.x !== 0 || p.moveDir.y !== 0);
      const bob = moving ? -Math.abs(Math.sin(timeSec * 12)) * 2.5 : 0;
      let x = sx(pos.x);
      let feet = sy(pos.y + FEET_OFFSET);
      const esp = p.espresso;
      const boosted = !!esp && !esp.out && esp.boostTicksLeft > 0;
      if (boosted) {
        // the espresso tell: a buzzing, jittery barista
        const j = jitterPx(esp.shots);
        x += Math.sin(timeSec * 71 + index * 1.7) * j;
        feet += Math.cos(timeSec * 57 + index) * j * 0.5;
      }
      this.drawTrail(sprite, boosted && moving, x, feet, look.cap);
      const pose = collapsed[p.id];
      const out = !!esp?.out;
      sprite.root.position.set(pose ? pose.body.x : x, pose ? pose.body.y : feet);
      // slipped: a dizzy wobble on the spot
      sprite.root.rotation = pose ? pose.body.rot : stunned ? Math.sin(timeSec * 9 + index) * 0.16 : 0;
      sprite.root.visible = out ? !!pose?.body.visible : true;
      sprite.body.y = pose ? 0 : bob;
      this.drawTool(sprite, p, timeSec);
      this.drawStars(sprite, stunned, timeSec, bob);
      sprite.root.zIndex = pose ? pose.body.y + (pose.stretcher?.loaded ? 30 : 0) : feet;
      const alpha = p.connected ? 1 : 0.4;
      sprite.root.alpha = alpha;
      sprite.tag.visible = !out;

      // on mop duty: the tag says so, so the crew knows who to shout for
      const name = p.tool === 'mop' ? `${p.name} · mop` : p.name;
      const text = p.connected ? name : `${p.name} · reconnecting…`;
      const tagKey = `${text}|${index}`;
      if (tagKey !== sprite.tagKey) {
        sprite.tagText.text = text;
        const w = Math.max(40, sprite.tagText.width + 18);
        sprite.tagBg.clear();
        sprite.tagBg.roundRect(-w / 2, -9, w, 18, 9).fill(look.cap).stroke({ width: 2, color: 0xffffff });
        sprite.tagKey = tagKey;
      }
      sprite.tag.position.set(x, feet - 95 + bob);
      sprite.tag.alpha = alpha;
    });
    for (const [id, sprite] of this.players) {
      if (!seen.has(id)) {
        sprite.root.destroy({ children: true });
        sprite.tag.destroy({ children: true });
        sprite.trail.destroy();
        this.players.delete(id);
      }
    }

    const seenC = new Set<number>();
    customers.forEach((c, i) => {
      seenC.add(c.id);
      const slot = LAYOUT.queueSlots[Math.min(i, LAYOUT.queueSlots.length - 1)];
      const targetX = sx(slot.x);
      let sprite = this.customers.get(c.id);
      if (!sprite) sprite = this.addCustomer(c, targetX + TILE * 0.8);
      sprite.x += (targetX - sprite.x) * 0.15;
      const feet = sy(slot.y) + CUSTOMER_FEET_PX;
      const shuffling = Math.abs(targetX - sprite.x) > 1;
      sprite.root.position.set(sprite.x, feet + (shuffling ? -Math.abs(Math.sin(timeSec * 12)) * 2 : 0));
      sprite.root.zIndex = feet;
      sprite.bubble.clear();
      const upset = c.upset ? Math.min(1, c.upset.ticksLeft / (ECONOMY.rogue.remakeSeconds * TICK_RATE)) : null;
      if (upset !== null) {
        // wrong drink: a shaking red bubble and angry steam while the remake window drains
        const jig = Math.sin(timeSec * 38) * 1.5;
        drawOrderBubble(sprite.bubble, jig, -96, c.drink, upset, true);
        for (let k = 0; k < 3; k++) {
          const t = (timeSec * 1.3 + k / 3) % 1;
          const side = k % 2 === 0 ? -1 : 1;
          sprite.bubble.circle(side * (12 + t * 8), -70 - t * 18, 3 + t * 5).fill({ color: 0xe9b3a8, alpha: 0.8 * (1 - t) });
        }
        sprite.bubble.roundRect(16, -128, 16, 18, 5).fill(0xc0392b);
        sprite.bubble.rect(22.8, -125, 2.4, 8).fill(0xffffff);
        sprite.bubble.circle(24, -114, 1.5).fill(0xffffff);
      } else drawOrderBubble(sprite.bubble, 0, -96, c.drink, c.patienceLeft / c.patienceMax);
      sprite.extra.clear();
      if (c.kind === 'influencer') drawInfluencer(sprite.extra, timeSec);
    });
    for (const [id, sprite] of this.customers) {
      if (!seenC.has(id)) {
        sprite.root.destroy({ children: true });
        this.customers.delete(id);
      }
    }
  }

  /** The mop in hand: held upright at the side, scrubbing back and forth while cleaning. */
  private drawTool(sprite: PlayerSprite, p: Player, timeSec: number): void {
    const has = p.tool === 'mop';
    sprite.tool.visible = has;
    if (!has) return;
    sprite.tool.rotation = p.cleaningTicksLeft > 0 ? Math.sin(timeSec * 14) * 0.45 - 0.2 : 0;
    sprite.tool.x = 18 + (p.cleaningTicksLeft > 0 ? Math.sin(timeSec * 14) * 6 : 0);
  }

  /** Three stars circling the head after a slip (only redrawn while stunned). */
  private drawStars(sprite: PlayerSprite, on: boolean, timeSec: number, bob: number): void {
    const g = sprite.stars;
    if (!on) {
      if (g.visible) g.clear();
      g.visible = false;
      return;
    }
    g.visible = true;
    g.clear();
    for (let i = 0; i < 3; i++) {
      const a = timeSec * 5 + (i * Math.PI * 2) / 3;
      const x = Math.cos(a) * 20;
      const y = -84 + Math.sin(a) * 6 + bob;
      const front = Math.sin(a) > 0;
      drawStar(g, x, y, front ? 6 : 4.5, front ? PALETTE.honey : 0xf8e3a0, a);
    }
  }

  /** Fading afterimages behind a boosted, moving barista (a cozy "zoom" streak, not a blur). */
  private drawTrail(sprite: PlayerSprite, on: boolean, x: number, feet: number, color: number): void {
    const h = sprite.history;
    sprite.trail.clear();
    if (!on) {
      h.length = 0;
      return;
    }
    h.unshift({ x, y: feet });
    if (h.length > 10) h.length = 10;
    for (let i = 2; i < h.length; i += 2) {
      const a = 0.32 * (1 - i / h.length);
      const pt = h[i];
      sprite.trail.roundRect(pt.x - 15, pt.y - 44, 30, 40, 13).fill({ color, alpha: a });
      sprite.trail.circle(pt.x, pt.y - 58, 15).fill({ color: 0xfffaf2, alpha: a * 0.7 });
    }
    // speed lines
    const last = h[h.length - 1];
    const dx = x - last.x;
    const dy = feet - last.y;
    const len = Math.hypot(dx, dy);
    if (len > 6) {
      const ux = dx / len;
      const uy = dy / len;
      for (const off of [-22, -2, 18]) {
        const bx = x - ux * 26 - uy * off * 0.6;
        const by = feet - 30 + off * 0.9 - uy * 26 + ux * off * 0.1;
        sprite.trail.moveTo(bx, by).lineTo(bx - ux * 22, by - uy * 22).stroke({ width: 3, color: 0xfffaf2, alpha: 0.7, cap: 'round' });
      }
    }
    sprite.trail.zIndex = feet - 1;
  }

  private addPlayer(id: PlayerId): PlayerSprite {
    const root = new Container();
    const body = new Graphics();
    root.addChild(body);
    this.depthLayer.addChild(root);
    const tag = new Container();
    const tagBg = new Graphics();
    const tagText = label('', 11, 0xffffff, '600');
    tag.addChild(tagBg, tagText);
    this.tagLayer.addChild(tag);
    const trail = new Graphics();
    this.depthLayer.addChild(trail);
    const tool = new Graphics();
    drawMop(tool, 12, -2, 34, -78);
    tool.pivot.set(18, -20);
    tool.position.set(18, -20);
    tool.visible = false;
    const stars = new Graphics();
    root.addChild(tool, stars);
    const sprite: PlayerSprite = { root, body, key: '', tag, tagBg, tagText, tagKey: '', facing: 'down', trail, history: [], tool, stars };
    this.players.set(id, sprite);
    return sprite;
  }

  private addCustomer(c: Customer, startX: number): CustomerSprite {
    const root = new Container();
    const body = new Graphics();
    const look = customerLook(c.id);
    drawPerson(body, { ...look, facing: 'up' });
    body.scale.set(0.92);
    const bubble = new Graphics();
    const extra = new Graphics();
    root.addChild(body, extra, bubble);
    this.depthLayer.addChild(root);
    const sprite: CustomerSprite = { root, body, bubble, extra, x: startX };
    this.customers.set(c.id, sprite);
    return sprite;
  }
}

