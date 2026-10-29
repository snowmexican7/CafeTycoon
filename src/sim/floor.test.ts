import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { onTileEntry } from './floor';
import { trackTiles } from './tiles';
import { isWalkable } from './bots/path';
import { seedRng } from './rng';
import type { GameState, Mess, Vec2 } from './types';

function chaosCafe(): GameState {
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 } });
  s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
  return startDay(s);
}

const p1 = (s: GameState) => s.players.find((p) => p.id === 'p1')!;

function addMess(s: GameState, kind: Mess['kind'], x: number, y: number, amount = 1): void {
  s.messes.push({ id: s.nextMessId++, kind, x, y, amount });
}

/** Walk p1 from `from` onto `to` and fire that tile entry. */
function enter(s: GameState, from: Vec2, to: Vec2): void {
  p1(s).pos = { ...from };
  trackTiles(s);
  p1(s).pos = { ...to };
  onTileEntry(s, trackTiles(s));
}

/** Fill the floor up to 12 messes, keeping clear of the tiles in `keep`. */
function fillToCap(s: GameState, keep: Vec2[]): void {
  for (let y = 7; y >= 2 && s.messes.length < 12; y--) {
    for (let x = 1; x <= 11 && s.messes.length < 12; x++) {
      if (keep.some((k) => k.x === x && k.y === y) || !isWalkable(s, { x, y })) continue;
      if (s.messes.some((m) => m.x === x && m.y === y)) continue;
      addMess(s, 'grounds', x, y);
    }
  }
}

describe('floor messes', () => {
  it('grounds spread stays bounded', () => {
    const s = chaosCafe();
    addMess(s, 'grounds', 5, 4);
    let spreads = 0;
    for (let i = 0; i < 200; i++) {
      if (s.messes.length === 0) break;
      const pile = s.messes.reduce((a, b) => (b.amount > a.amount ? b : a));
      const n = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
        .map((d) => ({ x: pile.x + d.x, y: pile.y + d.y }))
        .find((t) => isWalkable(s, t))!;
      const count = s.messes.length;
      enter(s, n, { x: pile.x, y: pile.y });
      if (s.messes.length !== count) spreads++;
      expect(s.messes.length).toBeLessThanOrEqual(12);
      for (const m of s.messes) {
        expect(m.amount).toBeGreaterThanOrEqual(0.25);
        expect(m.amount).toBeLessThanOrEqual(1);
      }
    }
    expect(spreads).toBeGreaterThan(0);
  });

  it('slip rate is about 5% and stuns 180–300 ticks, dropping what is held', () => {
    const s = chaosCafe();
    addMess(s, 'spill', 5, 4);
    let slips = 0;
    let firstSlipRng: number | null = null;
    for (let i = 0; i < 2000; i++) {
      p1(s).stunTicksLeft = 0;
      p1(s).holding = null;
      const rngBefore = s.rng;
      enter(s, { x: 4, y: 4 }, { x: 5, y: 4 });
      const stun = p1(s).stunTicksLeft;
      if (stun > 0) {
        slips++;
        expect(stun).toBeGreaterThanOrEqual(180);
        expect(stun).toBeLessThanOrEqual(300);
        if (firstSlipRng === null) firstSlipRng = rngBefore;
      }
    }
    expect(slips).toBeGreaterThanOrEqual(60);
    expect(slips).toBeLessThanOrEqual(140);

    // One slip while holding grounds: replay the first slip's draws.
    expect(firstSlipRng).not.toBeNull();
    s.rng = firstSlipRng!;
    p1(s).stunTicksLeft = 0;
    p1(s).holding = 'grounds';
    enter(s, { x: 4, y: 4 }, { x: 5, y: 4 });
    expect(p1(s).stunTicksLeft).toBeGreaterThan(0);
    expect(p1(s).holding).toBeNull();
    expect(s.messes).toEqual([{ id: 1, kind: 'spill', x: 5, y: 4, amount: 1 }]);
    const slip = s.log.filter((e) => e.kind === 'slip').at(-1)!;
    expect(slip.data).toMatchObject({ player: 'p1', x: 5, y: 4, item: 'grounds' });
  });

  // Review Focus 1
  it('a slip at the cap keeps the item', () => {
    const s = chaosCafe();
    addMess(s, 'spill', 5, 4);
    fillToCap(s, [{ x: 4, y: 4 }, { x: 5, y: 4 }]);
    expect(s.messes.length).toBe(12);
    const before = structuredClone(s.messes);
    let slipped = false;
    for (let i = 0; i < 2000 && !slipped; i++) {
      p1(s).stunTicksLeft = 0;
      p1(s).holding = 'grounds';
      enter(s, { x: 4, y: 4 }, { x: 5, y: 4 });
      slipped = p1(s).stunTicksLeft > 0;
    }
    expect(slipped).toBe(true);
    expect(p1(s).holding).toBe('grounds');
    expect(s.messes).toEqual(before);
    expect(s.today.wasted ?? 0).toBe(0);
  });

  it('a slipped player does not interact this tick', () => {
    let found = false;
    for (let seed = 1; seed <= 2000 && !found; seed++) {
      let s = chaosCafe();
      s.rng = seedRng(seed);
      addMess(s, 'spill', 2, 1);
      p1(s).pos = { x: 1.9, y: 1.53 };
      trackTiles(s);
      s = step(s, [{ kind: 'move', playerId: 'p1', x: 0, y: -1, interact: true }]);
      if (!s.log.some((e) => e.kind === 'slip')) {
        // Without a slip the same tick does reach the grinder.
        expect(s.stations.find((st) => st.id === 'grinder')!.busyTicksLeft).toBeGreaterThan(0);
        continue;
      }
      found = true;
      expect(p1(s).tile).toEqual({ x: 2, y: 1 });
      expect(s.stations.find((st) => st.id === 'grinder')!.busyTicksLeft).toBe(0);
      expect(p1(s).interactQueued).toBe(false);
    }
    expect(found).toBe(true);
  });
});
