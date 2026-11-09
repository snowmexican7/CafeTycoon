import { Container, Graphics, Text } from 'pixi.js';
import { LAYOUT } from '../../data/layout';
import type { Customer, DrinkId, ItemKind, Player, PlayerId, TierId, Vec2 } from '../../sim/types';
import { ECONOMY } from '../../data/economy';
import { TICK_RATE } from '../../sim/constants';
import { type Facing, PALETTE, TILE, baristaLook, customerLook, nextFacing, patienceColor, sx, sy } from '../theme';
import { dashedEllipse, drawHeart, drawItem, drawMop, drawStar, halfDome, label } from './draw';
import { flashOn } from '../eventsModel';
import { jitterPx, type CollapsePose } from '../espressoPose';
import { customerSpots, type SpotsLayout } from '../pickupModel';
import { drawBox, drawTrayBoard } from './pickup';
import { drawCarafe } from './sink';
import { CARRIED_FILL } from '../sinkModel';
import { drawBarCaddy, drawCarton } from './fridgeArt';
import { lookArt, type BodyStyle, type HairStyle, type OutfitStyle } from '../lookModel';
import { CROWN_RY, HEAD, HEAD_TOP, frontHairGeom } from '../hairGeom';
import { waitingSpots } from '../waitingModel';
import { driveUpOrigin } from '../streetModel';

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
  /** ui-3.5.2 (R4 e): a player-made look's body, hairstyle and outfit (absent = the classic capped barista). */
  style?: { body: BodyStyle; hairStyle: HairStyle; outfit: OutfitStyle };
}

const darker = (c: number, k = 0.8) => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);

const DENIM = 0x4a6fa5;
const SHOES = 0x3a2a22;
const TROUSERS = 0x4a3a33;
const SKIRT = 0x3d4a6b;
const WHITE_SHIRT = 0xf4efe6;

/** Soft S-curve lobes for long wavy (opaque overlapping ellipses — not translucent). */
function wavyLobes(g: Graphics, hair: number, facing: Facing): void {
  if (facing === 'down') {
    for (const [cx, cy, rx, ry] of [
      [-18, HEAD.hairline + 10, 7, 14],
      [-16, HEAD.hairline + 26, 8, 12],
      [-14, HEAD.hairline + 40, 7, 10],
      [18, HEAD.hairline + 10, 7, 14],
      [16, HEAD.hairline + 26, 8, 12],
      [14, HEAD.hairline + 40, 7, 10],
      [-6, HEAD.hairline + 2, 6, 5],
      [6, HEAD.hairline + 2, 6, 5],
    ] as const) {
      g.ellipse(cx, cy, rx, ry).fill(hair);
    }
  } else {
    for (const [cx, cy, rx, ry] of [
      [-10, HEAD.hairline + 14, 9, 12],
      [10, HEAD.hairline + 14, 9, 12],
      [-8, HEAD.hairline + 30, 10, 12],
      [8, HEAD.hairline + 30, 10, 12],
      [0, HEAD.hairline + 44, 11, 10],
    ] as const) {
      g.ellipse(cx, cy, rx, ry).fill(hair);
    }
  }
}

/** ui-3.5.2 / Round 5–6: hair that hangs behind the head and body (drawn first). Fully opaque. */
function backHair(g: Graphics, style: HairStyle, hair: number, facing: Facing): void {
  if (facing !== 'down') return;
  // Long / wavy / ponytail hang behind; crown coverage is drawn in frontHair.
  if (style === 'long') g.roundRect(-20, HEAD.hairline, 40, 48, 14).fill(hair);
  else if (style === 'wavy') {
    g.roundRect(-20, HEAD.hairline, 40, 44, 14).fill(hair);
    wavyLobes(g, hair, 'down');
  } else if (style === 'ponytail') g.ellipse(20, HEAD.hairline + 10, 5.5, 12).fill(hair);
}

/**
 * Round 6: opaque under-cap over the full head disk, then style details.
 * Gaps between spikes/curls/waves never show skin. No `alpha < 1` on hair fills.
 */
function frontHair(g: Graphics, style: HairStyle, hair: number, skin: number, facing: Facing): void {
  const geom = frontHairGeom(style, facing);
  const cap = geom.underCap;
  // 1) Solid under-cap: seals the entire head disk in hair colour (opaque).
  g.circle(cap.cx, cap.cy, cap.r).fill(hair);
  if (facing === 'down') {
    // Restore the open face below the hairline so cheeks/chin stay skin (eyes draw later).
    const pts: number[] = [HEAD.cx - HEAD.r, HEAD.hairline, HEAD.cx + HEAD.r, HEAD.hairline];
    for (let i = 0; i <= 16; i++) {
      const a = (Math.PI * i) / 16;
      pts.push(HEAD.cx + Math.cos(a) * HEAD.r, HEAD.cy + Math.sin(a) * HEAD.r);
    }
    g.poly(pts).fill(skin);
    // Crown half-dome again so the hairline edge is a clean opaque seal after the face plate.
    halfDome(g, HEAD.cx, geom.hairline, geom.rx, CROWN_RY).fill(hair);
  }
  const spikes = () => g.poly([-14, HEAD.hairline - 1, -11, HEAD_TOP - 4, -5, HEAD.hairline - 6, 0, HEAD_TOP - 6, 5, HEAD.hairline - 6, 11, HEAD_TOP - 4, 14, HEAD.hairline - 1]).fill(hair);
  const curls = () => {
    for (const [cx, cy] of [[-15, HEAD.hairline + 1], [-10, HEAD_TOP + 4], [0, HEAD_TOP], [10, HEAD_TOP + 4], [15, HEAD.hairline + 1]] as const) {
      g.circle(cx, cy, 6.5).fill(hair);
    }
  };
  // 2) Style details on top of the under-cap (still opaque).
  if (facing === 'down') {
    if (style === 'spiky') spikes();
    if (style === 'curly') curls();
    if (style === 'bob') {
      g.roundRect(-20, HEAD.hairline - 2, 8, 24, 4).fill(hair);
      g.roundRect(12, HEAD.hairline - 2, 8, 24, 4).fill(hair);
    }
    if (style === 'long') {
      g.roundRect(-20, HEAD.hairline - 2, 7, 34, 3.5).fill(hair);
      g.roundRect(13, HEAD.hairline - 2, 7, 34, 3.5).fill(hair);
    }
    if (style === 'wavy') wavyLobes(g, hair, 'down');
    if (style === 'ponytail') g.roundRect(14, HEAD.hairline, 5, 5, 2).fill(darker(hair, 0.7));
  } else {
    if (style === 'spiky') spikes();
    if (style === 'curly') curls();
    if (style === 'bob') g.roundRect(-19, HEAD.hairline, 38, 20, 8).fill(hair);
    else if (style === 'long') g.roundRect(-18, HEAD.hairline - 2, 36, 40, 12).fill(hair);
    else if (style === 'wavy') wavyLobes(g, hair, 'up');
    else if (style === 'ponytail') {
      g.ellipse(0, HEAD.hairline + 22, 5.5, 12).fill(hair);
      g.roundRect(-3, HEAD.hairline + 12, 6, 4, 2).fill(darker(hair, 0.7));
    } else {
      g.ellipse(-16, HEAD.cy + 2, 3, 4).fill(skin);
      g.ellipse(16, HEAD.cy + 2, 3, 4).fill(skin);
    }
  }
  if (style === 'bun') g.circle(0, HEAD_TOP - 2, 8).fill(hair);
}

/** A chunky toy person with its feet at (0, 0). */
export function drawPerson(g: Graphics, o: PersonOpts): void {
  const st = o.style;
  const half = st?.body === 'broad' ? 18 : st ? 14.5 : 16;
  const outfit = st?.outfit;
  const apron = !!o.apron && outfit !== 'overalls' && outfit !== 'vest';
  const bare = outfit === 'dress' || outfit === 'skirt';
  g.ellipse(0, 1, 17, 6).fill({ color: 0x2a1608, alpha: 0.25 });
  if (o.ring != null) dashedEllipse(g, 0, 1, 24, 9, 6, 5, o.ring, 3);
  if (st) backHair(g, st.hairStyle, o.hair, o.facing);
  if (bare) {
    g.roundRect(-9.5, -15, 7, 15, 3.5).fill(o.skin);
    g.roundRect(2.5, -15, 7, 15, 3.5).fill(o.skin);
    g.roundRect(-11, -4, 9, 4.5, 2).fill(SHOES);
    g.roundRect(2, -4, 9, 4.5, 2).fill(SHOES);
  } else {
    const legs = outfit === 'overalls' ? DENIM : TROUSERS;
    g.roundRect(-11, -15, 9, 15, 4).fill(legs);
    g.roundRect(2, -15, 9, 15, 4).fill(legs);
  }
  if (outfit === 'hoodie') g.ellipse(0, -44, 15, 7).fill(darker(o.shirt, 0.75));
  const top = outfit === 'vest' ? WHITE_SHIRT : o.shirt;
  g.roundRect(-half, -42, half * 2, 34, 13).fill(top);
  if (outfit === 'dress') g.poly([-half, -26, half, -26, half + 6, -10, -half - 6, -10]).fill(o.shirt);
  if (outfit === 'skirt') g.poly([-half, -22, half, -22, half + 5, -10, -half - 5, -10]).fill(SKIRT);
  if (outfit === 'overalls') {
    g.roundRect(-half, -24, half * 2, 14, 6).fill(DENIM);
    if (o.facing === 'down') {
      g.roundRect(-9, -36, 18, 16, 3).fill(DENIM);
      g.moveTo(-8, -36).lineTo(-11, -42).moveTo(8, -36).lineTo(11, -42).stroke({ width: 3, color: DENIM });
      g.circle(-6, -33, 1.6).fill(0xf6c35b);
      g.circle(6, -33, 1.6).fill(0xf6c35b);
    } else g.moveTo(-10, -42).lineTo(10, -24).moveTo(10, -42).lineTo(-10, -24).stroke({ width: 3, color: DENIM });
  }
  if (outfit === 'vest' && o.facing === 'down') {
    g.poly([-half + 1, -40, -2, -30, -2, -12, -half + 2, -12]).fill(o.shirt);
    g.poly([half - 1, -40, 2, -30, 2, -12, half - 2, -12]).fill(o.shirt);
    for (const y of [-26, -20, -14]) g.circle(-4.5, y, 1.3).fill(0xfffaf2);
  } else if (outfit === 'vest') g.roundRect(-half + 1, -40, half * 2 - 2, 28, 10).fill(o.shirt);
  if (outfit === 'hoodie' && o.facing === 'down') {
    g.moveTo(-3, -40).lineTo(-4, -32).moveTo(3, -40).lineTo(4, -32).stroke({ width: 1.5, color: 0xfffaf2 });
  }
  if (apron && o.facing === 'down') {
    const w = st?.body === 'broad' ? 12 : 10;
    g.moveTo(-w, -36).lineTo(w, -36).lineTo(w, -14).quadraticCurveTo(0, -8, -w, -14).closePath().fill(0xfffaf2);
    g.roundRect(-5, -25, 10, 6, 2).stroke({ width: 1.5, color: 0xe2cfb4 });
  }
  if (apron && o.facing === 'up') g.moveTo(-half + 2, -24).lineTo(half - 2, -24).stroke({ width: 3, color: 0xfffaf2 });
  g.circle(-half - 1, -24, 6).fill(top);
  g.circle(half + 1, -24, 6).fill(top);
  g.circle(-half - 2, -19, 4.5).fill(o.skin);
  g.circle(half + 2, -19, 4.5).fill(o.skin);
  g.circle(HEAD.cx, HEAD.cy, HEAD.r).fill(o.skin);
  if (o.facing === 'down') {
    if (st) frontHair(g, st.hairStyle, o.hair, o.skin, o.facing);
    else halfDome(g, 0, -56, 17, 15).fill(o.hair);
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
  } else if (st) frontHair(g, st.hairStyle, o.hair, o.skin, o.facing);
  else {
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

/**
 * ui-3.10.0 (bot cut Phase 2): the solo robot cashier's own look. A boxy steel body on a single wheel, a screen face
 * with two friendly eyes, an antenna with a little light and a till-roll badge, so nobody mistakes it for a crewmate.
 */
export const ROBOT = { body: 0xb9c3cc, dark: 0x6f7c88, screen: 0x24323d, eye: 0x7ee0c3, light: 0xf6c35b } as const;

export function drawRobot(g: Graphics, o: { facing: Facing; holding?: ItemKind | null; ring?: number | null; blink?: boolean }): void {
  g.ellipse(0, 1, 15, 5).fill({ color: 0x2a1608, alpha: 0.25 });
  if (o.ring != null) dashedEllipse(g, 0, 1, 22, 8, 6, 5, o.ring, 3);
  // wheel + stem
  g.circle(0, -5, 6).fill(ROBOT.dark);
  g.circle(0, -5, 2.2).fill(ROBOT.body);
  g.roundRect(-3, -14, 6, 8, 2).fill(ROBOT.dark);
  // body
  g.roundRect(-15, -42, 30, 30, 7).fill(ROBOT.body).stroke({ width: 2, color: ROBOT.dark });
  // arms
  g.roundRect(-20, -36, 6, 16, 3).fill(ROBOT.dark);
  g.roundRect(14, -36, 6, 16, 3).fill(ROBOT.dark);
  if (o.facing === 'down') {
    // till-roll badge on the chest
    g.roundRect(-7, -32, 14, 12, 2).fill(0xfffdf6).stroke({ width: 1.2, color: ROBOT.dark });
    g.rect(-4, -29, 8, 1.6).fill(0xb9ad99);
    g.rect(-4, -25.5, 6, 1.6).fill(0xb9ad99);
  } else {
    g.roundRect(-9, -36, 18, 18, 3).fill(darker(ROBOT.body, 0.88));
  }
  // neck + head
  g.rect(-4, -46, 8, 5).fill(ROBOT.dark);
  g.roundRect(-16, -70, 32, 25, 8).fill(ROBOT.body).stroke({ width: 2, color: ROBOT.dark });
  if (o.facing === 'down') {
    g.roundRect(-12, -66, 24, 17, 5).fill(ROBOT.screen);
    if (o.blink) {
      g.rect(-8, -58.5, 5, 1.6).fill(ROBOT.eye);
      g.rect(3, -58.5, 5, 1.6).fill(ROBOT.eye);
    } else {
      g.roundRect(-8, -62, 5, 6, 2).fill(ROBOT.eye);
      g.roundRect(3, -62, 5, 6, 2).fill(ROBOT.eye);
    }
    g.moveTo(-4, -53).quadraticCurveTo(0, -50.5, 4, -53).stroke({ width: 1.4, color: ROBOT.eye, cap: 'round' });
  } else {
    g.roundRect(-10, -66, 20, 6, 2).fill(darker(ROBOT.body, 0.85));
  }
  // ear bolts + antenna
  g.circle(-16, -58, 2.6).fill(ROBOT.dark);
  g.circle(16, -58, 2.6).fill(ROBOT.dark);
  g.moveTo(0, -70).lineTo(0, -79).stroke({ width: 2, color: ROBOT.dark });
  g.circle(0, -81, 3.2).fill(ROBOT.light);
  if (o.holding) drawItem(g, o.holding, 20, -24, 0.95);
}

/** Gear G4g till: a rung-up order wears a little paper receipt (top-left of the bubble) with a green tick. */
export function drawReceipt(g: Graphics, x: number, y: number): void {
  const w = 20, h = 25;
  const pts: number[] = [x, y, x + w, y, x + w, y + h];
  for (let i = 4; i >= 0; i--) pts.push(x + (i * w) / 4, y + h - (i % 2 ? 4 : 0));
  g.poly(pts).fill(0xfffdf6).stroke({ width: 2, color: 0x6e624f });
  g.rect(x + 4, y + 5, 12, 2).fill(0xb9ad99);
  g.moveTo(x + 5, y + 14).lineTo(x + 9, y + 18).lineTo(x + 15, y + 10).stroke({ width: 3, color: 0x3f9b5a, cap: 'round', join: 'round' });
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
  /** The away "z z z". */
  zzz: Text;
}

interface CustomerSprite {
  root: Container;
  body: Graphics;
  bubble: Graphics;
  /** Per-kind tells drawn each frame (the influencer's ring light; B3 kinds). */
  extra: Graphics;
  x: number;
  /** Feet y, eased like x (3.3.1: a rung-up customer steps over to the pickup area). */
  y: number;
  /** Group companions (one per extra drink, hidden as they are served) and the regular's name tag. */
  companions: Graphics[];
  count: Text | null;
  nameTag: Container | null;
  /** Stepped out of a parked car: slide up to the line a little slower than a door arrival. */
  fromKerb: boolean;
}

/**
 * Baristas and customers. Bodies live in the shared depth-sorted layer (so they overlap stations correctly);
 * name tags live in the overlay layer so they're never hidden behind a machine.
 */
export class Actors {
  /** P3 B13: where the line stands (it shortens and shifts with the shop's size). */
  queueSlots: { x: number; y: number }[] = LAYOUT.queueSlots;
  /** 3.3.1 Gear batch/pickup: where the order line and the pickup crowd stand (set by the scene each frame). */
  spots: (SpotsLayout & { gear: boolean }) | null = null;
  private readonly players = new Map<PlayerId, PlayerSprite>();
  private readonly customers = new Map<number, CustomerSprite>();
  /** Round 3 item 4: browsers in the inside waiting area (`state.waiting`). */
  private readonly browsers = new Map<number, CustomerSprite>();

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
    waiting: Customer[] = [],
    tier: TierId = 'cafe',
    seed = 0,
    tick = 0,
    curbBusy = false,
    doorsOpen = true,
  ): void {
    const seen = new Set<PlayerId>();
    players.forEach((p, index) => {
      seen.add(p.id);
      const sprite = this.players.get(p.id) ?? this.addPlayer(p.id);
      // Idle: match the sim facing (fixtures can set Player.facing). Moving: last vertical move wins.
      const idle = p.moveDir.x === 0 && p.moveDir.y === 0;
      sprite.facing = idle ? (p.facing.y < 0 ? 'up' : 'down') : nextFacing(sprite.facing, p.moveDir);
      const look = baristaLook(index);
      const me = p.id === localId;
      const stunned = p.stunTicksLeft > 0;
      // ui-3.10.0: the only bot body in a real run is the solo robot cashier; it draws as a robot, not a barista
      const robot = !!p.bot;
      const blink = robot && timeSec % 4 < 0.15;
      // ui-3.5.2 (R4 e): a person's own look; the ring and tag keep the player colour
      const art = p.look && !robot ? lookArt(p.look) : null;
      const trayKey = p.tool === 'tray' && p.tray ? `${p.tray.customer}:${p.tray.items.map((x) => x.drink).join(',')}` : '';
      const key = `${sprite.facing}|${p.holding}|${me}|${index}|${stunned}|${robot ? (blink ? 'rb' : 'r') : ''}|${p.tool}|${trayKey}|${art ? JSON.stringify(p.look) : ''}`;
      if (key !== sprite.key) {
        sprite.body.clear();
        if (robot) drawRobot(sprite.body, { facing: sprite.facing, holding: p.tool !== null ? null : p.holding, ring: me ? look.cap : null, blink });
        else drawPerson(sprite.body, {
          ...(art
            ? { shirt: art.shirt, skin: art.skin, hair: art.hair, style: { body: art.body, hairStyle: art.hairStyle, outfit: art.outfit } }
            : { shirt: look.cap, cap: look.cap, skin: look.skin, hair: look.hair }),
          apron: true, facing: sprite.facing,
          holding: p.tool !== null ? null : p.holding, ring: me ? look.cap : null, dizzy: stunned,
        });
        // 3.3.1: a condiment stock box carried in both hands, in front of the apron
        if (p.tool === 'box') drawBox(sprite.body, 0, -24, 1.15);
        // 3.3.3 (FB2 A3): the old drip pot, held out in front on the way to the sink
        else if (p.tool === 'pot') drawCarafe(sprite.body, -2, -14, 0.85, CARRIED_FILL, 'cold');
        // ui-3.4.1 (FB2 A4): a milk carton held out in one hand, or the condiment bar boxed up in both
        else if (p.tool === 'milk') drawCarton(sprite.body, 12, -10, 1.1);
        else if (p.tool === 'bar') drawBarCaddy(sprite.body, 0, -14, 1.05);
        // FB2 B7: a finished tray carried in both hands
        else if (p.tool === 'tray' && p.tray) drawTrayBoard(sprite.body, 0, -18, p.tray.items.map((x) => x.drink), [], 0.95);
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
      const toolTag = p.tool === 'mop' ? ' · mop' : p.tool === 'box' ? ' · box' : p.tool === 'pot' ? ' · pot' : p.tool === 'milk' ? ' · milk' : p.tool === 'bar' ? ' · condiments' : p.tool === 'tray' ? ' · tray' : '';
      const name = `${p.name}${toolTag}`;
      // the robot cashier: its name on a steel tag (no robot emoji, bot cut Phase 2); away humans: grey "· away" and z z z
      const text = robot ? name : p.connected ? name : `${p.name} · away`;
      const tagKey = `${text}|${index}|${robot}|${p.connected}`;
      if (tagKey !== sprite.tagKey) {
        sprite.tagText.text = text;
        const w = Math.max(40, sprite.tagText.width + 18);
        sprite.tagBg.clear();
        if (robot) {
          sprite.tagBg.roundRect(-w / 2, -9, w, 18, 9).fill(ROBOT.screen).stroke({ width: 2, color: ROBOT.body });
          sprite.tagText.style.fill = ROBOT.eye;
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
    const spots = this.spots;
    const where = customerSpots(customers, spots?.gear === true, spots ?? { width: LAYOUT.width, queueSlots: this.queueSlots, till: this.queueSlots[0], pickup: this.queueSlots[0] });
    let newest = -1;
    for (let n = 0; n < customers.length; n++) if (customers[n]!.id > newest) newest = customers[n]!.id;
    for (let n = 0; n < waiting.length; n++) if (waiting[n]!.id > newest) newest = waiting[n]!.id;
    customers.forEach((c, i) => {
      seenC.add(c.id);
      const slot = where[i];
      const targetX = sx(slot.x);
      const targetY = sy(slot.y) + CUSTOMER_FEET_PX;
      let sprite = this.customers.get(c.id);
      if (!sprite) {
        const kerb = driveUpOrigin(seed, tick, c.id, newest, curbBusy, doorsOpen);
        sprite = this.addCustomer(c, kerb ? kerb.x : targetX + TILE * 0.8, kerb ? kerb.y : targetY, kerb != null);
      }
      this.stepToward(sprite, targetX, targetY, 0.15);
      const feet = sprite.y;
      const shuffling = Math.abs(targetX - sprite.x) > 1 || Math.abs(targetY - sprite.y) > 1;
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
      // ui-3.10.0 (Round 6 block 5): an early-bird fan wears a gold star badge (super patient, came in before the doors)
      if (c.kind === 'fan') {
        const pulse = 1 + Math.sin(timeSec * 4) * 0.08;
        sprite.extra.circle(-24, -118, 11 * pulse).fill(0xf6c35b).stroke({ width: 2, color: 0xffffff });
        drawStar(sprite.extra, -24, -118, 7 * pulse, 0xffffff);
      }
      if (c.rungAt !== undefined && !c.upset) drawReceipt(sprite.extra, -42, -128);
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

    // Round 3 item 4: browsers in the inside waiting area (no order bubble — they're not in line yet).
    const seenW = new Set<number>();
    const browseWhere = waitingSpots(tier, waiting.length);
    waiting.forEach((c, i) => {
      seenW.add(c.id);
      const slot = browseWhere[i];
      if (!slot) return;
      const targetX = sx(slot.x);
      const targetY = sy(slot.y) + CUSTOMER_FEET_PX;
      let sprite = this.browsers.get(c.id);
      if (!sprite) {
        const kerb = driveUpOrigin(seed, tick, c.id, newest, curbBusy, doorsOpen);
        sprite = this.addBrowser(c, kerb ? kerb.x : targetX + TILE * 0.4, kerb ? kerb.y : targetY, kerb != null);
      }
      this.stepToward(sprite, targetX, targetY, 0.12);
      const feet = sprite.y;
      const bob = Math.sin(timeSec * 2.4 + c.id) * 1.5;
      sprite.root.position.set(sprite.x, feet + bob);
      sprite.root.zIndex = feet;
      sprite.body.y = Math.sin(timeSec * 5 + c.id * 0.7) * 0.8;
      // a soft "browsing" thought: three dots, no order ticket
      sprite.bubble.clear();
      const bx = 0;
      const by = -88;
      sprite.bubble.roundRect(bx - 16, by - 12, 32, 20, 8).fill(0xffffff).stroke({ width: 2, color: PALETTE.espresso });
      sprite.bubble.poly([bx - 4, by + 8, bx + 4, by + 8, bx, by + 14]).fill(0xffffff);
      for (const [dx, ph] of [[-8, 0], [0, 0.33], [8, 0.66]] as const) {
        const k = 0.55 + 0.45 * Math.sin(timeSec * 4 + ph * Math.PI * 2 + c.id);
        sprite.bubble.circle(bx + dx, by - 2, 2.2 * k).fill(PALETTE.espresso);
      }
      const frac = c.patienceLeft / Math.max(1, c.patienceMax);
      sprite.extra.clear();
      // patience pip under the feet so a long browse still reads
      sprite.extra.roundRect(-14, 4, 28, 5, 2.5).fill(0xffffff).stroke({ width: 1.5, color: PALETTE.espresso });
      sprite.extra.roundRect(-12, 5.5, Math.max(2, 24 * frac), 2, 1).fill(patienceColor(frac));
    });
    for (const [id, sprite] of this.browsers) {
      if (!seenW.has(id)) {
        sprite.root.destroy({ children: true });
        this.browsers.delete(id);
      }
    }
  }

  /** A waiting-area browser: same body as a queue customer, no companions / name tag. */
  /** Slide toward the queue. A driver from the kerb takes about a second; everyone else keeps the old step. */
  private stepToward(sprite: CustomerSprite, targetX: number, targetY: number, near: number): void {
    const dx = targetX - sprite.x;
    const dy = targetY - sprite.y;
    const far = sprite.fromKerb && (dx > 24 || dx < -24 || dy > 24 || dy < -24);
    sprite.x += dx * (far ? 0.045 : near);
    sprite.y += dy * (far ? 0.045 : near);
    if (sprite.fromKerb && !far) sprite.fromKerb = false;
  }

  private addBrowser(c: Customer, startX: number, startY: number, fromKerb = false): CustomerSprite {
    const root = new Container();
    const body = new Graphics();
    drawPerson(body, { ...customerLook(c.id), facing: 'down' });
    body.scale.set(0.9);
    const bubble = new Graphics();
    const extra = new Graphics();
    root.addChild(body, extra, bubble);
    this.depthLayer.addChild(root);
    const sprite: CustomerSprite = { root, body, bubble, extra, x: startX, y: startY, companions: [], count: null, nameTag: null, fromKerb };
    this.browsers.set(c.id, sprite);
    return sprite;
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
    const zzz = label('z z z', 13, 0xfffaf2, '700');
    zzz.style.stroke = { color: 0x3a2418, width: 3 };
    zzz.visible = false;
    this.tagLayer.addChild(zzz);
    const sprite: PlayerSprite = { root, body, key: '', tag, tagBg, tagText, tagKey: '', facing: 'down', trail, history: [], tool, stars, zzz };
    this.players.set(id, sprite);
    return sprite;
  }

  private addCustomer(c: Customer, startX: number, startY: number, fromKerb = false): CustomerSprite {
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
    const sprite: CustomerSprite = { root, body, bubble, extra, x: startX, y: startY, companions, count, nameTag, fromKerb };
    this.customers.set(c.id, sprite);
    return sprite;
  }
}

