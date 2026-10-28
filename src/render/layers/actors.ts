import { Container, Graphics, Text } from 'pixi.js';
import { LAYOUT } from '../../data/layout';
import type { Customer, DrinkId, ItemKind, Player, PlayerId, Vec2 } from '../../sim/types';
import { type Facing, TILE, baristaLook, customerLook, nextFacing, patienceColor, sx, sy } from '../theme';
import { dashedEllipse, drawItem, halfDome, label } from './draw';

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
    g.ellipse(-6, -53, 2.3, 3).fill(0x2b1a12);
    g.ellipse(6, -53, 2.3, 3).fill(0x2b1a12);
    g.circle(-5.2, -54.2, 0.8).fill(0xffffff);
    g.circle(6.8, -54.2, 0.8).fill(0xffffff);
    g.ellipse(-11, -47, 3.6, 2.2).fill({ color: 0xf08a7a, alpha: 0.55 });
    g.ellipse(11, -47, 3.6, 2.2).fill({ color: 0xf08a7a, alpha: 0.55 });
    g.moveTo(-3.5, -46.5).quadraticCurveTo(0, -43.5, 3.5, -46.5).stroke({ width: 1.6, color: 0x2b1a12, cap: 'round' });
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
export function drawOrderBubble(g: Graphics, x: number, y: number, drink: DrinkId, patience: number): void {
  const r = 22;
  const p = Math.max(0, Math.min(1, patience));
  g.circle(x, y, r).fill({ color: 0xffffff, alpha: 0.92 });
  g.circle(x, y, r).stroke({ width: 5, color: 0x000000, alpha: 0.09 });
  if (p > 0) {
    g.moveTo(x, y - r);
    g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    g.stroke({ width: 5, color: patienceColor(p), cap: 'round' });
  }
  g.poly([x - 5, y + r - 2, x, y + r + 7, x + 5, y + r - 2]).fill(0xffffff);
  drawItem(g, drink, x, y + 2, 1.05);
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
}

interface CustomerSprite {
  root: Container;
  body: Graphics;
  bubble: Graphics;
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

  update(players: Player[], positions: Record<PlayerId, Vec2>, customers: Customer[], localId: PlayerId | null, timeSec: number): void {
    const seen = new Set<PlayerId>();
    players.forEach((p, index) => {
      seen.add(p.id);
      const sprite = this.players.get(p.id) ?? this.addPlayer(p.id);
      sprite.facing = nextFacing(sprite.facing, p.moveDir);
      const look = baristaLook(index);
      const me = p.id === localId;
      const key = `${sprite.facing}|${p.holding}|${me}|${index}`;
      if (key !== sprite.key) {
        sprite.body.clear();
        drawPerson(sprite.body, { shirt: look.cap, cap: look.cap, skin: look.skin, hair: look.hair, apron: true, facing: sprite.facing, holding: p.holding, ring: me ? look.cap : null });
        sprite.key = key;
      }
      const pos = positions[p.id] ?? p.pos;
      const moving = p.connected && (p.moveDir.x !== 0 || p.moveDir.y !== 0);
      const bob = moving ? -Math.abs(Math.sin(timeSec * 12)) * 2.5 : 0;
      const x = sx(pos.x);
      const feet = sy(pos.y + FEET_OFFSET);
      sprite.root.position.set(x, feet);
      sprite.body.y = bob;
      sprite.root.zIndex = feet;
      const alpha = p.connected ? 1 : 0.4;
      sprite.root.alpha = alpha;

      const text = p.connected ? p.name : `${p.name} · reconnecting…`;
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
      drawOrderBubble(sprite.bubble, 0, -96, c.drink, c.patienceLeft / c.patienceMax);
    });
    for (const [id, sprite] of this.customers) {
      if (!seenC.has(id)) {
        sprite.root.destroy({ children: true });
        this.customers.delete(id);
      }
    }
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
    const sprite: PlayerSprite = { root, body, key: '', tag, tagBg, tagText, tagKey: '', facing: 'down' };
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
    root.addChild(body, bubble);
    this.depthLayer.addChild(root);
    const sprite: CustomerSprite = { root, body, bubble, x: startX };
    this.customers.set(c.id, sprite);
    return sprite;
  }
}

