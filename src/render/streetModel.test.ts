import { describe, expect, it } from 'vitest';
import { LAYOUT } from '../data/layout';
import { driveUpThisTick } from '../sim/driveUp';
import { CURB_Y, PARK_X } from './espressoPose';
import { FRONT, SIDEWALK, sy } from './theme';
import {
  CAR_COUNT,
  DRIVE_UP_PARK_X,
  FAR_LANE_Y,
  NEAR_LANE_Y,
  ROOF_PX,
  STREET_LINES,
  STREET_TOP,
  STREET_WIDTH,
  blankCars,
  carStyle,
  fillStreet,
  tickWithBubble,
  type StreetRead,
} from './streetModel';

function read(over: Partial<StreetRead> = {}): StreetRead {
  return {
    seed: 7,
    tick: 0,
    day: 3,
    night: false,
    queue: 1,
    reputation: 4.6,
    tier: 'cafe',
    complained: false,
    curbBusy: false,
    width: STREET_WIDTH,
    ...over,
  };
}

function shot(r: StreetRead) {
  const cars = blankCars();
  fillStreet(cars, r);
  return cars.map((c) => ({ x: c.x, y: c.y, parked: c.parked, say: c.say }));
}

/** A tick whose pull-over window does not cover `tick` (so the loop position is the whole story). */
function quietTick(seed: number, tick: number): boolean {
  for (let t = tick - 200; t <= tick + 60; t++) if (driveUpThisTick(seed, t)) return false;
  return true;
}

describe('street cars', () => {
  it('puts both lanes under the kerb, clear of feet and of the ambulance', () => {
    const feet = sy(7.6) + 30; // actors.ts CUSTOMER_FEET_PX, the lowest a queue customer stands
    expect(STREET_TOP).toBe(sy(LAYOUT.height) + SIDEWALK);
    expect(NEAR_LANE_Y - ROOF_PX).toBeGreaterThan(feet + 20);
    expect(NEAR_LANE_Y - ROOF_PX).toBeGreaterThan(CURB_Y + 8);
    expect(FAR_LANE_Y).toBeGreaterThan(NEAR_LANE_Y);
    expect(FAR_LANE_Y + 8).toBeLessThan(sy(LAYOUT.height) + FRONT);
  });

  it('draws the same cars for the same seed and tick', () => {
    const a = shot(read({ tick: 400 }));
    const b = shot(read({ tick: 400 }));
    expect(b).toEqual(a);
    expect(a).toHaveLength(CAR_COUNT);
    expect(shot(read({ tick: 401 }))).not.toEqual(a);
    expect(shot(read({ seed: 8, tick: 400 }))).not.toEqual(a);
  });

  it('moves at half speed at night and says nothing', () => {
    let t = 900;
    for (; t < 9000; t++) if (quietTick(4, t) && quietTick(4, t * 2)) break;
    expect(t).toBeLessThan(9000);
    const day = shot(read({ seed: 4, tick: t, night: false, queue: 0, reputation: 3 }));
    const night = shot(read({ seed: 4, tick: t * 2, night: true, queue: 0, reputation: 3 }));
    expect(night).toEqual(day);
    expect(night.every((c) => c.say === '')).toBe(true);
  });

  it('gives one on-screen car a short line, and stays quiet when the queue is complaining', () => {
    const cars = blankCars();
    const r = read();
    const tick = tickWithBubble(r, cars);
    expect(tick).toBeGreaterThanOrEqual(0);
    const said = cars.filter((c) => c.say);
    expect(said).toHaveLength(1);
    expect(said[0]!.x).toBeGreaterThan(48);
    expect(said[0]!.x).toBeLessThan(STREET_WIDTH - 48);
    r.tick = tick;
    r.complained = true;
    fillStreet(cars, r);
    expect(cars.every((c) => c.say === '')).toBe(true);
  });

  it('talks about the line, the rating, and a cart', () => {
    const lines = STREET_LINES.flat();
    expect(lines).toEqual(expect.arrayContaining(['That line though', 'Smells good', 'Is that a café yet?']));
    for (const line of lines) {
      expect(line.toLowerCase()).not.toContain('tap');
      expect(line.length).toBeLessThan(28);
    }
    const cars = blankCars();
    const busy = read({ queue: 6, reputation: 4.8 });
    expect(tickWithBubble(busy, cars)).toBeGreaterThanOrEqual(0);
    const busySay = cars.find((c) => c.say)!.say;
    expect([...STREET_LINES[0], ...STREET_LINES[2]]).toContain(busySay);

    const cart = read({ seed: 5, queue: 1, reputation: 2.5, tier: 'cart' });
    expect(tickWithBubble(cart, cars)).toBeGreaterThanOrEqual(0);
    expect(STREET_LINES[4]).toContain(cars.find((c) => c.say)!.say);
  });

  it('parks one car at the kerb on a drive-up, and leaves the ambulance bay clear', () => {
    let t = 0;
    while (t < 100000 && !driveUpThisTick(9, t)) t += 1;
    const cars = blankCars();
    const r = read({ seed: 9, tick: t + 10, queue: 0, reputation: 3 });
    fillStreet(cars, r);
    const parked = cars.filter((c) => c.parked === 1);
    expect(parked).toHaveLength(1);
    expect(parked[0]!.x).toBe(DRIVE_UP_PARK_X);
    expect(parked[0]!.y).toBe(NEAR_LANE_Y);

    r.curbBusy = true;
    fillStreet(cars, r);
    expect(cars.every((c) => c.parked === 0)).toBe(true);
    const left = PARK_X - 110;
    const right = PARK_X + 110;
    for (const c of cars) if (c.y === NEAR_LANE_Y) expect(c.x <= left || c.x >= right).toBe(true);
  });

  it('paints each car from the seed alone', () => {
    expect(carStyle(3, 0)).toEqual(carStyle(3, 0));
    expect(carStyle(3, 0).dir).toBe(1);
    expect(carStyle(3, 1).dir).toBe(-1);
    expect(carStyle(3, 0).lane).toBe(0);
    expect(carStyle(3, 1).lane).toBe(1);
    const kinds = new Set([0, 1, 2, 3].map((i) => carStyle(3, i).color));
    expect(kinds.size).toBeGreaterThan(1);
  });
});
