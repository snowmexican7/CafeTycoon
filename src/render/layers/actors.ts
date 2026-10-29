import { Container, Graphics, Text } from 'pixi.js';
import { LAYOUT } from '../../data/layout';
import type { Customer, DrinkId, ItemKind, Player, PlayerId, Vec2 } from '../../sim/types';
import { ECONOMY } from '../../data/economy';
import { TICK_RATE } from '../../sim/constants';
import { type Facing, PALETTE, TILE, baristaLook, customerLook, nextFacing, patienceColor, sx, sy } from '../theme';
import { dashedEllipse, drawHeart, drawItem, drawMop, drawStar, halfDome, label } from './draw';
import { flashOn } from '../eventsModel';
import { botLook, botTag, emotePhase, type BotLook } from '../crewModel';
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
  /** Bot personality accessories (Block 3). */
  shades?: boolean;
  headphones?: boolean;
  badge?: boolean;
  headband?: boolean;
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
  if (o.shades && o.facing === 'down' && !o.dizzy) {
    g.roundRect(-11, -57, 9, 6, 2.5).fill(0x1f1a24);
    g.roundRect(2, -57, 9, 6, 2.5).fill(0x1f1a24);
    g.moveTo(-2, -55).lineTo(2, -55).stroke({ width: 1.5, color: 0x1f1a24 });
    g.moveTo(-9, -56).lineTo(-6, -53).stroke({ width: 1, color: 0xffffff, alpha: 0.6 });
  }
  if (o.headphones) {
    g.moveTo(-17, -58).arc(0, -58, 17, Math.PI, 0).stroke({ width: 3.5, color: 0x2b2b30 });
    g.roundRect(-21, -62, 7, 12, 3).fill(0x2b2b30);
    g.roundRect(14, -62, 7, 12, 3).fill(0x2b2b30);
    g.roundRect(-20, -60, 3, 8, 1.5).fill(PALETTE.mint);
    g.roundRect(17, -60, 3, 8, 1.5).fill(PALETTE.mint);
  }
  if (o.headband) {
    g.roundRect(-17, -67, 34, 6, 3).fill(0xe0564a);
    g.roundRect(-17, -65, 34, 1.6, 0.8).fill(0xffffff);
    if (o.facing === 'up') {
      // the knot's tails flap at the back
      g.moveTo(0, -64).lineTo(-6, -54).stroke({ width: 3, color: 0xe0564a, cap: 'round' });
      g.moveTo(0, -64).lineTo(5, -55).stroke({ width: 3, color: 0xe0564a, cap: 'round' });
    }
  }
  if (o.badge && o.facing === 'down') {
    g.circle(9, -33, 5.5).fill(0x4fae7b).stroke({ width: 1.5, color: 0xffffff });
    drawStar(g, 9, -33, 3.2, 0xffffff);
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

/** A little stopwatch badge (impatient customers), its hand sweeping. */
function drawStopwatch(g: Graphics, x: number, y: number, t: number): void {
  g.rect(x - 2, y - 11, 4, 4).fill(0x3a2418);
  g.circle(x, y, 8).fill(0xf0a63a).stroke({ width: 2, color: 0xffffff });
  const a = t * 4;
  g.moveTo(x, y).lineTo(x + Math.sin(a) * 5.5, y - Math.cos(a) * 5.5).stroke({ width: 2, color: 0x3a2418, cap: 'round' });
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
  /** Bot emote bubble and the away "z z z". */
  emote: Graphics;
  zzz: Text;
}

interface CustomerSprite {
  root: Container;
  body: Graphics;
  bubble: Graphics;
  /** Per-kind tells drawn each frame (the influencer's ring light; B3 kinds). */
  extra: Graphics;
  x: number;
  /** Group companions (one per extra drink, hidden as they are served) and the regular's name tag. */
  companions: Graphics[];
  count: Text | null;
  nameTag: Container | null;
}

/**
 * Baristas and customers. Bodies live in the shared depth-sorted layer (so they overlap stations correctly);
 * name tags live in the overlay layer so they're never hidden behind a machine.
 */
export class Actors {
  /** P3 B13: where the line stands (it shortens and shifts with the shop's size). */
  queueSlots: { x: number; y: number }[] = LAYOUT.queueSlots;
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
      const bl = p.bot ? botLook(p.bot.personality) : null;
      const key = `${sprite.facing}|${p.holding}|${me}|${index}|${stunned}|${p.bot?.personality ?? ''}|${p.tool}`;
      if (key !== sprite.key) {
        sprite.body.clear();
        drawPerson(sprite.body, {
          shirt: look.cap, cap: bl?.headphones || bl?.headband ? undefined : look.cap, skin: look.skin, hair: look.hair, apron: true, facing: sprite.facing,
          holding: p.tool === 'mop' ? null : p.holding, ring: me ? look.cap : null, dizzy: stunned,
          shades: bl?.shades, headphones: bl?.headphones, badge: bl?.badge, headband: bl?.headband,
        });
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
      // bots: a white tag in their colour ("Bo · bot"); away humans: a grey "· away" tag and z z z
      const text = p.bot ? (p.tool === 'mop' ? `${botTag(p.name)} · mop` : botTag(p.name)) : p.connected ? name : `${p.name} · away`;
      const tagKey = `${text}|${index}|${!!p.bot}|${p.connected}`;
      if (tagKey !== sprite.tagKey) {
        sprite.tagText.text = text;
        const w = Math.max(40, sprite.tagText.width + 18);
        sprite.tagBg.clear();
        if (p.bot) {
          sprite.tagBg.roundRect(-w / 2, -9, w, 18, 9).fill(0xfffaf2).stroke({ width: 2, color: look.cap });
          sprite.tagText.style.fill = look.cap;
        } else {
          sprite.tagBg.roundRect(-w / 2, -9, w, 18, 9).fill(p.connected ? look.cap : 0x9a8a7a).stroke({ width: 2, color: 0xffffff });
          sprite.tagText.style.fill = 0xffffff;
        }
        sprite.tagKey = tagKey;
      }
      sprite.tag.position.set(x, feet - 95 + bob);
      sprite.tag.alpha = p.connected ? 1 : 0.8;
      const away = !p.connected && !p.bot;
      sprite.zzz.visible = away && !out;
      if (away) {
        const k = (timeSec * 0.7) % 1;
        sprite.zzz.position.set(x + 34 + k * 12, feet - 116 - k * 16);
        sprite.zzz.alpha = 1 - k * 0.7;
      }
      this.drawEmote(sprite, bl, index, timeSec, stunned || out);
    });
    for (const [id, sprite] of this.players) {
      if (!seen.has(id)) {
        sprite.root.destroy({ children: true });
        sprite.tag.destroy({ children: true });
        sprite.zzz.destroy();
        sprite.trail.destroy();
        this.players.delete(id);
      }
    }

    const seenC = new Set<number>();
    customers.forEach((c, i) => {
      seenC.add(c.id);
      const slots = this.queueSlots;
      const slot = slots[Math.min(i, slots.length - 1)];
      const targetX = sx(slot.x);
      let sprite = this.customers.get(c.id);
      if (!sprite) sprite = this.addCustomer(c, targetX + TILE * 0.8);
      sprite.x += (targetX - sprite.x) * 0.15;
      const feet = sy(slot.y) + CUSTOMER_FEET_PX;
      const shuffling = Math.abs(targetX - sprite.x) > 1;
      sprite.root.position.set(sprite.x, feet + (shuffling ? -Math.abs(Math.sin(timeSec * 12)) * 2 : 0));
      sprite.root.zIndex = feet;
      sprite.bubble.clear();
      if (c.egg === 'camper') {
        // B8: Wi-Fi camper — laptop bubble, no order.
        const bob = Math.sin(timeSec * 3) * 1;
        sprite.bubble.roundRect(-18, -110 + bob, 36, 24, 4).fill(0x2a2a32).stroke({ width: 2, color: 0x111116 });
        sprite.bubble.roundRect(-14, -106 + bob, 28, 16, 2).fill(0x6fb6e6);
        sprite.bubble.rect(-10, -86 + bob, 20, 3).fill(0x44444c);
      } else {
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
      }
      sprite.extra.clear();
      if (c.kind === 'influencer') drawInfluencer(sprite.extra, timeSec);
      const frac = c.patienceLeft / c.patienceMax;
      if (c.kind === 'impatient' && !c.upset) {
        // a stopwatch on the bubble, a tapping foot, and a sweat drop when it gets close
        drawStopwatch(sprite.extra, -22, -116, timeSec);
        if (frac < 0.5) sprite.body.y = -Math.abs(Math.sin(timeSec * 14)) * 2;
        if (frac < 0.35) {
          const k = (timeSec * 1.5) % 1;
          sprite.extra.moveTo(-16, -66 + k * 6).quadraticCurveTo(-12, -60 + k * 6, -16, -56 + k * 6).quadraticCurveTo(-20, -60 + k * 6, -16, -66 + k * 6).fill({ color: 0x6fb6e6, alpha: 1 - k });
        }
      } else sprite.body.y = 0;
      const more = c.extra?.length ?? 0;
      sprite.companions.forEach((g, k) => (g.visible = k < more));
      if (sprite.count) {
        sprite.count.visible = more > 0;
        if (more > 0) {
          const ct = `\u00d7${more + 1}`;
          if (sprite.count.text !== ct) sprite.count.text = ct;
          sprite.extra.roundRect(13, -125, 26, 16, 8).fill(0x4c8fd6).stroke({ width: 2, color: 0xffffff });
        }
      }
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

  /** A bot's personality emote now and then: a rookie's sweat drop, a steady hum, a veteran's coffee, a hurried stopwatch. */
  private drawEmote(sprite: PlayerSprite, look: BotLook | null, index: number, timeSec: number, hidden: boolean): void {
    const g = sprite.emote;
    const k = look && !hidden ? emotePhase(timeSec, index, look.every) : null;
    if (k === null) {
      if (g.visible) g.clear();
      g.visible = false;
      return;
    }
    g.visible = true;
    g.clear();
    const pop = k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1;
    const x = 30;
    const y = -64 - k * 6;
    g.circle(x, y, 11 * pop).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ width: 1.5, color: 0x3a2418, alpha: 0.4 });
    if (pop < 0.6) return;
    if (look!.emote === 'sweat') {
      g.moveTo(x, y - 7).quadraticCurveTo(x + 6, y + 1, x, y + 5).quadraticCurveTo(x - 6, y + 1, x, y - 7).fill(0x6fb6e6);
      g.circle(x - 1.5, y + 1, 1.3).fill(0xffffff);
    } else if (look!.emote === 'clock') {
      drawStopwatch(g, x, y + 1, timeSec * 2);
    } else if (look!.emote === 'note') {
      g.circle(x - 3, y + 4, 3).fill(0x3a2418);
      g.moveTo(x - 0.5, y + 4).lineTo(x - 0.5, y - 6).lineTo(x + 5, y - 4).stroke({ width: 1.8, color: 0x3a2418, cap: 'round', join: 'round' });
    } else {
      drawItem(g, 'espresso', x, y + 2, 0.6);
      g.moveTo(x - 2, y - 4).quadraticCurveTo(x - 4, y - 7, x - 2, y - 10).stroke({ width: 1.3, color: 0x9a8a7a });
      g.moveTo(x + 2, y - 4).quadraticCurveTo(x, y - 7, x + 2, y - 10).stroke({ width: 1.3, color: 0x9a8a7a });
    }
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
    const emote = new Graphics();
    root.addChild(tool, stars, emote);
    const zzz = label('z z z', 13, 0xfffaf2, '700');
    zzz.style.stroke = { color: 0x3a2418, width: 3 };
    zzz.visible = false;
    this.tagLayer.addChild(zzz);
    const sprite: PlayerSprite = { root, body, key: '', tag, tagBg, tagText, tagKey: '', facing: 'down', trail, history: [], tool, stars, emote, zzz };
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
    // a group brings friends: smaller people either side, one per extra drink
    const companions: Graphics[] = [];
    for (let k = 0; k < (c.extra?.length ?? 0); k++) {
      const g = new Graphics();
      drawPerson(g, { ...customerLook(c.id * 7 + k + 1), facing: 'up' });
      g.scale.set(0.74);
      g.position.set(k % 2 === 0 ? -20 : 20, -4);
      companions.push(g);
    }
    root.addChild(...companions, body, extra, bubble);
    let count: Text | null = null;
    if (c.kind === 'group') {
      count = label('', 11, 0xffffff, '800');
      count.position.set(26, -117);
      root.addChild(count);
    }
    let nameTag: Container | null = null;
    if (c.kind === 'regular' && c.name) {
      nameTag = new Container();
      const shown = c.egg === 'nameMix' && c.wrongName ? c.wrongName : c.name;
      const t = label(shown, 11, c.egg === 'nameMix' ? 0xc0392b : 0xb34a6b, '700');
      const w = t.width + 26;
      const bg = new Graphics();
      bg.roundRect(-w / 2, -9, w, 18, 4).fill(0xfffaf2).stroke({ width: 2, color: 0xe98aa6 });
      bg.circle(-w / 2 + 2, 0, 2).fill(0xe98aa6);
      drawHeart(bg, w / 2 - 9, -2, 4.5, PALETTE.cherry);
      t.x = -5;
      nameTag.addChild(bg, t);
      nameTag.position.set(0, -134);
      nameTag.rotation = -0.05;
      root.addChild(nameTag);
    }
    this.depthLayer.addChild(root);
    const sprite: CustomerSprite = { root, body, bubble, extra, x: startX, companions, count, nameTag };
    this.customers.set(c.id, sprite);
    return sprite;
  }
}

