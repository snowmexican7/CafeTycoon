import { Container, Graphics, Text } from 'pixi.js';
import type { GameState } from '../../sim/types';
import { label } from './draw';
import { isNightLook, PALETTE } from '../theme';
import {
  CAR_COUNT,
  FAR_LANE_Y,
  NEAR_LANE_Y,
  ROOF_PX,
  STREET_TOP,
  blankCars,
  carStyle,
  fillStreet,
  lineIsShouting,
  type StreetCar,
  type StreetRead,
} from '../streetModel';

/**
 * The road, the cars and one comment bubble. Built once; each tick only moves the cars.
 * Nothing here allocates on the frames where the tick (and the handful of facts) has not changed,
 * which is the co-op guest's steady state between snapshots.
 *
 * Sits under the lighting and over the lot, so the same band covers the cart, the stand and the
 * café. `STREET_TOP` is the seam if a later sidewalk scene moves the kerb.
 */
export class Street {
  readonly root = new Container();
  private readonly cars = blankCars();
  private readonly read: StreetRead = {
    seed: 0,
    tick: -1,
    day: 0,
    night: false,
    queue: 0,
    reputation: 0,
    tier: 'cafe',
    complained: false,
    curbBusy: false,
    width: 0,
  };
  private readonly body: Graphics[] = [];
  private readonly fleet: Container[] = [];
  private readonly bubble = new Container();
  private readonly bubbleBg = new Graphics();
  private readonly bubbleText: Text;
  private say = '';
  private builtFor = Number.NaN;
  private seenSeed = Number.NaN;
  private seenTick = -2;
  private seenDay = -1;
  private seenNight = false;
  private seenQueue = -1;
  private seenRep = Number.NaN;
  private seenTier: GameState['tier'] = undefined;
  private seenShout = false;
  private seenCurb = false;
  private readonly dim: Graphics;

  constructor(width: number, height: number) {
    this.read.width = width;
    const road = new Graphics();
    road.rect(0, STREET_TOP, width, 6).fill(0xd8d2c8);
    road.rect(0, STREET_TOP + 6, width, 5).fill(0x8e887e);
    road.rect(0, STREET_TOP + 11, width, height - STREET_TOP - 11).fill(0x55565f);
    road.rect(0, STREET_TOP + 11, width, 2).fill({ color: 0xffffff, alpha: 0.28 });
    const mid = (NEAR_LANE_Y + FAR_LANE_Y) / 2;
    for (let x = 10; x < width; x += 38) road.roundRect(x, mid - 2, 18, 4, 2).fill(0xf2d34a);
    road.rect(0, height - 8, width, 2).fill({ color: 0xffffff, alpha: 0.22 });
    road.cacheAsTexture(true);

    this.dim = new Graphics();
    this.dim.rect(0, STREET_TOP, width, height - STREET_TOP).fill({ color: 0x14101c, alpha: 0.45 });
    this.dim.visible = false;

    const fleet = new Container();
    for (let i = 0; i < CAR_COUNT; i++) {
      const c = new Container();
      const g = new Graphics();
      c.addChild(g);
      this.fleet.push(c);
      this.body.push(g);
    }
    for (let i = 0; i < CAR_COUNT; i++) if (i % 2 === 1) fleet.addChild(this.fleet[i]!);
    for (let i = 0; i < CAR_COUNT; i++) if (i % 2 === 0) fleet.addChild(this.fleet[i]!);

    this.bubbleText = label('', 15, PALETTE.espresso, '800');
    this.bubble.addChild(this.bubbleBg, this.bubbleText);
    this.bubble.visible = false;

    this.root.addChild(road, this.dim, fleet, this.bubble);
  }

  /** Move the cars for this snapshot. Skips the hash work when nothing the picture reads has changed. */
  update(state: GameState, curbBusy: boolean): void {
    const night = isNightLook(state.phase);
    const tier = state.tier === 'stand' || state.tier === 'cart' ? state.tier : 'cafe';
    const queue = state.customers.length;
    const shout = lineIsShouting(state.tick, state.line?.complainedAt);
    if (
      this.seenSeed === state.seed &&
      this.seenTick === state.tick &&
      this.seenDay === state.day &&
      this.seenNight === night &&
      this.seenQueue === queue &&
      this.seenRep === state.reputation &&
      this.seenTier === tier &&
      this.seenShout === shout &&
      this.seenCurb === curbBusy
    ) {
      return;
    }
    this.seenSeed = state.seed;
    this.seenTick = state.tick;
    this.seenDay = state.day;
    this.seenNight = night;
    this.seenQueue = queue;
    this.seenRep = state.reputation;
    this.seenTier = tier;
    this.seenShout = shout;
    this.seenCurb = curbBusy;
    this.dim.visible = night;

    if (this.builtFor !== state.seed) {
      this.builtFor = state.seed;
      for (let i = 0; i < CAR_COUNT; i++) {
        const style = carStyle(state.seed, i);
        const g = this.body[i]!;
        g.clear();
        drawCar(g, style.kind, style.color);
        this.fleet[i]!.scale.x = style.dir;
      }
    }

    const r = this.read;
    r.seed = state.seed;
    r.tick = state.tick;
    r.day = state.day;
    r.night = night;
    r.queue = queue;
    r.reputation = state.reputation;
    r.tier = tier;
    r.complained = shout;
    r.curbBusy = curbBusy;
    fillStreet(this.cars, r);
    this.place(this.cars);
  }

  private place(cars: StreetCar[]): void {
    let say = '';
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < CAR_COUNT; i++) {
      const car = cars[i]!;
      const node = this.fleet[i]!;
      node.position.set(car.x, car.y);
      if (car.say) {
        say = car.say;
        sx = car.x;
        sy = car.y - ROOF_PX - 6;
      }
    }
    if (!say) {
      this.bubble.visible = false;
      return;
    }
    this.bubble.visible = true;
    if (say !== this.say) {
      this.say = say;
      this.bubbleText.text = say;
      const w = this.bubbleText.width + 22;
      const h = 28;
      this.bubbleBg.clear();
      this.bubbleBg.roundRect(-w / 2, -h - 8, w, h, 12).fill(0xffffff).stroke({ width: 3, color: PALETTE.espresso });
      this.bubbleBg.poly([-7, -9, 7, -9, 0, 2]).fill(0xffffff);
      this.bubbleBg.rect(-5.5, -11, 11, 4).fill(0xffffff);
      this.bubbleText.y = -8 - h / 2;
      this.bubbleHalf = w / 2;
    }
    const half = this.bubbleHalf;
    const x = sx < half + 8 ? half + 8 : sx > this.read.width - half - 8 ? this.read.width - half - 8 : sx;
    this.bubble.position.set(x, sy);
  }

  private bubbleHalf = 40;
}

/** A hatchback (kind 0) or a delivery van (kind 1), wheels on y = 0, facing right. */
function drawCar(g: Graphics, kind: 0 | 1, color: number): void {
  const w = kind === 1 ? 78 : 54;
  const h = kind === 1 ? 26 : 22;
  const roof = kind === 1 ? 40 : 30;
  g.ellipse(0, 3, w * 0.4, 4).fill({ color: 0x1a120c, alpha: 0.28 });
  g.roundRect(-w / 2, -h, w, h - 2, 6).fill(color).stroke({ width: 2, color: 0x2a1608 });
  g.roundRect(-roof / 2, -h - (ROOF_PX - h), roof, ROOF_PX - h + 4, 5).fill(color).stroke({ width: 2, color: 0x2a1608 });
  g.roundRect(-roof / 2 + 3, -h - (ROOF_PX - h) + 3, roof - 6, 8, 2).fill(0xc5e4f6);
  g.circle(-2, -h - 4, 3).fill(0xf2c6a0);
  g.rect(w / 2 - 3, -h + 4, 4, 5).fill(0xffe08a);
  g.rect(-w / 2 - 1, -h + 4, 3, 4).fill(0xe07070);
  for (const wx of [-w / 2 + 12, w / 2 - 12]) {
    g.circle(wx, -1, 6).fill(0x2a241c);
    g.circle(wx, -1, 2.4).fill(0xdfe6ea);
  }
}
