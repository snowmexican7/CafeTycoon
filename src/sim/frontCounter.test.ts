import { describe, expect, it } from 'vitest';
import { counterSegments, isFrontSolid, LAYOUT, layoutFor } from '../data/layout';
import { applyGearInput } from './gear';
import { applyMovement, blocked, nearestStation } from './movement';
import { customerSpots } from './customerSpots';
import { findPath, isWalkable } from './path';
import { createRun, startDay } from './run';
import type { GameState, TierId, Vec2 } from './types';

const TIERS = ['stand', 'cart', 'cafe'] as const;

function shop(tier: TierId, gear: boolean): GameState {
  return startDay(createRun({
    seed: 3,
    hostId: 'p1',
    players: [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Ben' }],
    tier,
    gear,
    settings: { cashier: false },
  }));
}

function stepDir(s: GameState, dirs: Record<string, Vec2>, n: number): void {
  for (let i = 0; i < n; i++) {
    for (const p of s.players) p.moveDir = dirs[p.id] ?? { x: 0, y: 0 };
    applyMovement(s, 1);
  }
  for (const p of s.players) p.moveDir = { x: 0, y: 0 };
}

describe('solid front counter', () => {
  for (const tier of TIERS) {
    for (const gear of [false, true] as const) {
      const label = `${gear ? 'gear' : 'classic'} ${tier}`;

      it(`${label}: the register stays with the pickup, and the line is solid except the door and the flap`, () => {
        const s = shop(tier, gear);
        const lay = layoutFor(tier);
        const fc = lay.frontCounter;
        const till = s.stations.find((x) => x.id === 'counter')!;
        expect(till.pos).toEqual({ x: 6, y: 6 });
        expect(fc.y).toBe(6);
        expect(isFrontSolid(fc, 6)).toBe(true);
        expect(fc.gap.x0).toBeGreaterThan(6);
        if (gear) {
          expect(lay.pickup).toEqual({ x: 4, y: 6 });
          expect(lay.condiments).toEqual({ x: 5, y: 6 });
          for (const x of [4, 5, 6]) expect(isFrontSolid(fc, x), `column ${x}`).toBe(true);
        }
        const w = lay.width;
        expect(blocked(LAYOUT.door, s.stations, w)).toBe(false);
        expect(isWalkable(s, LAYOUT.door)).toBe(true);
        for (let x = fc.x0; x <= fc.x1; x++) {
          const solid = isFrontSolid(fc, x);
          expect(blocked({ x, y: fc.y }, s.stations, w), `column ${x}`).toBe(solid);
          expect(isWalkable(s, { x, y: fc.y }), `column ${x}`).toBe(!solid);
        }
        // Staff tiles in front of the wide pickup stay open, on both sides of the line.
        expect(blocked({ x: 3, y: 5 }, s.stations, w)).toBe(false);
        expect(blocked({ x: 4, y: 5 }, s.stations, w)).toBe(false);
        expect(counterSegments(fc).length).toBeGreaterThan(0);
        expect(counterSegments(fc).every((seg) => seg.y === fc.y && seg.x1 > seg.x0)).toBe(true);
      });

      it(`${label}: customers stay in front, and a path to the front goes through the flap or the door`, () => {
        const s = shop(tier, gear);
        const lay = layoutFor(tier);
        const fc = lay.frontCounter;
        s.customers = [
          { id: 1, drink: 'latte', patienceLeft: 100, patienceMax: 100, stage: 'pickup' },
          { id: 2, drink: 'espresso', patienceLeft: 100, patienceMax: 100, stage: 'order' },
          { id: 3, drink: 'coldBrew', patienceLeft: 100, patienceMax: 100 },
        ];
        for (const spot of customerSpots(s)) expect(spot.y).toBeGreaterThan(fc.y + 0.5);

        const front = { x: 4, y: 7 };
        expect(isWalkable(s, front)).toBe(true);
        const path = findPath(s, { x: 4, y: 5 }, front);
        expect(path).not.toBeNull();
        const via = [{ x: 4, y: 5 }, ...path!];
        expect(via.every((n) => n.y !== fc.y || !isFrontSolid(fc, n.x))).toBe(true);
        expect(via.some((n) => n.y === fc.y && (n.x === LAYOUT.door.x || (n.x >= fc.gap.x0 && n.x <= fc.gap.x1)))).toBe(true);
        expect(findPath(s, { x: 4, y: 5 }, lay.mopHome)).not.toBeNull();
        expect(findPath(s, { x: 4, y: 5 }, lay.boxCorner)).not.toBeNull();
        expect(findPath(s, LAYOUT.rogueStart, LAYOUT.door)).not.toBeNull();
        // Onto the staff side, behind the register. Gear's empty bar may have no espresso yet.
        expect(isWalkable(s, { x: 6, y: 5 })).toBe(true);
        expect(findPath(s, LAYOUT.rogueStart, { x: 6, y: 5 })).not.toBeNull();
      });

      it(`${label}: two people fit side by side at the counter and can still move`, () => {
        const s = shop(tier, gear);
        const lay = layoutFor(tier);
        const a = s.players[0]!;
        const b = s.players[1]!;
        a.pos = { x: 3, y: 5 };
        b.pos = { x: 4, y: 5 };
        if (gear) {
          expect(nearestStation(s, a.pos)?.id).toBe('pickup');
          expect(nearestStation(s, b.pos)?.id).toBe('pickup');
        }
        stepDir(s, { p1: { x: 0, y: 1 }, p2: { x: 0, y: 1 } }, 40);
        expect(a.pos.y).toBeLessThan(5.5);
        expect(b.pos.y).toBeLessThan(5.5);
        expect(a.pos.y).toBeGreaterThan(5);
        const ax = a.pos.x;
        const bx = b.pos.x;
        stepDir(s, { p1: { x: -1, y: 0 }, p2: { x: 1, y: 0 } }, 20);
        expect(a.pos.x).toBeLessThan(ax);
        expect(b.pos.x).toBeGreaterThan(bx);
        expect(blocked(a.pos, s.stations, lay.width)).toBe(false);
        expect(blocked(b.pos, s.stations, lay.width)).toBe(false);

        a.pos = { x: lay.frontCounter.gap.x0, y: 5 };
        stepDir(s, { p1: { x: 0, y: 1 } }, 50);
        expect(a.pos.y).toBeGreaterThan(6.4);
      });
    }
  }

  it('a bought drip keeps its seat, and the flap still reaches the front', () => {
    const seats: Record<TierId, Vec2> = { stand: { x: 1, y: 5 }, cart: { x: 9, y: 5 }, cafe: { x: 8, y: 5 } };
    for (const tier of TIERS) {
      const s = createRun({ seed: 4, hostId: 'p1', players: [{ id: 'p1', name: 'Ana' }], tier, gear: true });
      s.cash = 500;
      applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'd1' });
      const drip = s.stations.find((x) => x.kind === 'drip' && !x.twin)!;
      expect({ x: Math.round(drip.pos.x), y: Math.round(drip.pos.y) }).toEqual(seats[tier]);
      const lay = layoutFor(tier);
      expect(findPath(s, { x: 4, y: 5 }, lay.mopHome), tier).not.toBeNull();
      expect(findPath(s, { x: 4, y: 5 }, LAYOUT.door), tier).not.toBeNull();
      expect(isWalkable(s, { x: lay.frontCounter.gap.x0, y: lay.frontCounter.y }), tier).toBe(true);
    }
  });
});
