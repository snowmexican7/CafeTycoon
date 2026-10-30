import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { finishDay } from './closing';
import { step } from './step';
import { applyGearInput } from './gear';
import { applyGrowInput } from './growth';
import { ensureCounterSpots, stationsFromSlots } from './slots';
import { interact } from './stations';
import { drinkEspresso } from './espresso';
import { blocked, nearestStation } from './movement';
import { addStandIns } from './bots/roster';
import { findPath, targetNodes, walkableNodes } from './bots/path';
import { SINK_ID, LAYOUT, layoutFor } from '../data/layout';
import { GEAR, type GearId } from '../data/gear';
import { EQUIPMENT_KINDS } from '../data/equipment';
import { ECONOMY } from '../data/economy';
import { needsDump } from './sink';
import type { GameState, Station, TierId } from './types';

const gearRun = (tier: TierId = 'stand'): GameState =>
  createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'L' }], settings: { bots: 0 }, tier, gear: true });

/** A stand with a drip machine, a steamer, a grinder and the bin, open for the day. */
function stand(gear: GearId[] = ['d1', 's3', 'g2', 'b0']): GameState {
  const s = gearRun('stand');
  s.slotGear = [...gear];
  s.slots = gear.map((id) => GEAR[id].station);
  s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear);
  s.supplies.beans = 10;
  s.supplies.milk = 10;
  s.unlocked = [...(s.unlocked ?? []), 'drip'];
  s.menu.drip = true;
  return startDay(s);
}

const st = (s: GameState, id: string): Station => s.stations.find((x) => x.id === id)!;
const p1 = (s: GameState) => s.players[0]!;
const p2 = (s: GameState) => s.players[1]!;
/** Stand `who` one tile below a station (the side baristas work from). */
const below = (s: GameState, who: GameState['players'][number], id: string) => {
  const at = st(s, id).pos;
  who.pos = { x: at.x, y: at.y + 1 };
};
/** Stand `who` at the sink (left of it). */
const atSink = (s: GameState, who: GameState['players'][number]) => {
  const at = st(s, SINK_ID).pos;
  who.pos = { x: at.x - 1, y: at.y };
};
const coldPot = (s: GameState, cups = 3) => {
  const d = st(s, 'drip');
  d.output = 'drip';
  d.potLeft = cups;
  d.potColdAt = s.tick - 1;
  return d;
};
const events = (s: GameState, kind: string) => s.log.filter((e) => e.kind === kind).map((e) => e.data);

describe('FB2 A3: the back sink fixture', () => {
  it('every Gear tier has the sink against the right wall, in the back half, clear of the bar; classic runs have none', () => {
    expect(SINK_ID).toBe('sink');
    const FRIDGE = [{ x: 1, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 2 }]; // A4: the fridge and its access tiles
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      const s = gearRun(tier);
      const at = layoutFor(tier).sink;
      expect(at.x).toBe(layoutFor(tier).width - 1);
      expect(at.y).toBeGreaterThan(2); // a row of floor between it and the bar
      expect(at.y).toBeLessThan(6); // behind the counter row
      expect(FRIDGE.some((f) => f.x === at.x && f.y === at.y)).toBe(false);
      const sink = s.stations.find((x) => x.id === SINK_ID)!;
      expect(sink).toEqual({ id: SINK_ID, kind: 'counter', pos: at, busyTicksLeft: 0, output: null, occupiedBy: null });
      // FB2 A3 fix round 1 (I1): no tile in reach of the sink is also in reach of any other station (no ties).
      const near = (n: { x: number; y: number }, p: { x: number; y: number }) => Math.hypot(n.x - p.x, n.y - p.y) <= ECONOMY.interactRangeTiles;
      expect(targetNodes(s, sink, LAYOUT.door).length).toBeGreaterThan(0);
      for (const n of walkableNodes(s).filter((x) => near(x, at))) {
        expect(FRIDGE.some((f) => f.x === n.x && f.y === n.y), `${tier} fridge tile`).toBe(false);
        for (const o of s.stations) if (o !== sink) expect(near(n, o.pos), `${tier} ${o.id} shares ${n.x},${n.y}`).toBe(false);
      }
      const classic = createRun({ seed: 7, hostId: 'p1', players: [], settings: { bots: 0 }, tier });
      expect(classic.stations.some((x) => x.id === SINK_ID)).toBe(false);
    }
  });

  it('nobody starts the day inside the sink (the stand\'s fourth spawn point is its tile)', () => {
    const s = createRun({ seed: 7, hostId: 'p1', players: [], settings: { bots: 0 }, tier: 'stand', gear: true });
    addStandIns(s, 4);
    expect(s.players.some((p) => p.pos.x === layoutFor('stand').sink.x && p.pos.y === layoutFor('stand').sink.y)).toBe(true);
    startDay(s);
    for (const p of s.players) expect(blocked(p.pos, s.stations, layoutFor('stand').width), p.id).toBe(false);
  });

  it('is not gear, not equipment and not a slot: nothing buys, sells or moves it', () => {
    expect(Object.values(GEAR).some((g) => (g.station as string) === 'sink' || (g.id as string) === SINK_ID)).toBe(false);
    expect((EQUIPMENT_KINDS as string[]).includes('sink')).toBe(false);
    const s = gearRun('stand');
    expect(s.slots).not.toContain('sink');
    s.cash = 10_000;
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'c1' });
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'sell', index: s.slots!.length - 1 });
    expect(st(s, SINK_ID).pos).toEqual(layoutFor('stand').sink);
    applyGrowInput(s, { kind: 'grow', playerId: 'p1', tier: 'cart' });
    expect(s.stations.filter((x) => x.id === SINK_ID).map((x) => x.pos)).toEqual([layoutFor('cart').sink]);
  });

  it('old Gear saves get the sink once (ensureCounterSpots)', () => {
    const s = gearRun('stand');
    s.stations = s.stations.filter((x) => x.id !== SINK_ID);
    ensureCounterSpots(s);
    ensureCounterSpots(s);
    expect(s.stations.filter((x) => x.id === SINK_ID)).toHaveLength(1);
  });

  it('a bot can reach it, it blocks no path, and every back-bar machine keeps a barista tile', () => {
    const FULL: Record<TierId, GearId[]> = {
      stand: ['d1', 'e1', 's1', 'b0'],
      cart: ['g1', 'e1', 's1', 'd1', 'b0'],
      cafe: ['g1', 'e1', 's1', 'd1', 'c1', 'b0'],
    };
    for (const tier of ['stand', 'cart', 'cafe'] as const) {
      const s = gearRun(tier);
      s.slotGear = [...FULL[tier]];
      s.slots = FULL[tier].map((id) => GEAR[id].station);
      s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear);
      for (const x of s.stations) expect(targetNodes(s, x, LAYOUT.door).length, `${tier} ${x.id}`).toBeGreaterThan(0);
      expect(findPath(s, LAYOUT.rogueStart, LAYOUT.door)).not.toBeNull();
      expect(findPath(s, LAYOUT.door, { x: 1, y: 2 })).not.toBeNull();
      expect(nearestStation(s, layoutFor(tier).mopHome)).toBeNull();
      expect(nearestStation(s, layoutFor(tier).boxCorner)).toBeNull();
    }
  });
});

describe('FB2 A3: dumping at the sink', () => {
  it('a latte in hand + E at the sink: hands empty, sink.dump logged, no mess, no money back', () => {
    const s = stand();
    const cash = s.cash;
    p1(s).holding = 'latte';
    p1(s).cupSlips = 1;
    atSink(s, p1(s));
    interact(s, 'p1');
    expect(p1(s).holding).toBeNull();
    expect(p1(s).cupSlips).toBeUndefined();
    expect(events(s, 'sink.dump')).toEqual([{ by: 'p1', item: 'latte' }]);
    expect([s.messes, s.cash, s.today.wasted]).toEqual([[], cash, 1]);
  });

  it('R at the sink dumps the drink too (it never lands on the pickup counter)', () => {
    let s = stand();
    p1(s).holding = 'drip';
    atSink(s, p1(s));
    s = step(s, [{ kind: 'drop', playerId: 'p1' }]);
    expect(p1(s).holding).toBeNull();
    expect(s.pass).toEqual([]);
    expect(events(s, 'sink.dump')).toEqual([{ by: 'p1', item: 'drip' }]);
  });

  it('grounds and empty hands do nothing at the sink', () => {
    const s = stand();
    atSink(s, p1(s));
    interact(s, 'p1');
    p1(s).holding = 'grounds';
    interact(s, 'p1');
    expect(p1(s).holding).toBe('grounds');
    expect(events(s, 'sink.dump')).toEqual([]);
  });
});

describe('FB2 A3: carrying a pot to the sink', () => {
  it('cold pot: E lifts it, the machine cannot brew while it is out; dumped at the sink it goes home ready to brew', () => {
    const s = stand();
    const d = coldPot(s);
    expect(needsDump(s, d)).toBe(true);
    below(s, p1(s), 'drip');
    interact(s, 'p1');
    expect([p1(s).tool, p1(s).holding]).toEqual(['pot', null]);
    expect([d.potOut, d.output, d.potLeft, d.potColdAt]).toEqual(['p1', null, undefined, undefined]);
    expect(events(s, 'pot.lift')).toEqual([{ by: 'p1', station: 'drip' }]);
    // nobody can brew in a machine with no pot
    below(s, p2(s), 'drip');
    const beans = s.supplies.beans;
    interact(s, 'p2');
    expect([d.busyTicksLeft, s.supplies.beans, p2(s).tool]).toEqual([0, beans, null]);
    // E with the pot anywhere else does nothing
    interact(s, 'p1');
    expect(p1(s).tool).toBe('pot');
    atSink(s, p1(s));
    interact(s, 'p1');
    expect(p1(s).tool).toBeNull();
    expect(d.potOut).toBeUndefined();
    expect(events(s, 'sink.dump')).toEqual([{ by: 'p1', item: 'pot' }]);
    interact(s, 'p2');
    expect([d.making, s.supplies.beans]).toEqual(['drip', beans - 1]);
  });

  it('a hot pot pours as before (only a cold or stale pot lifts)', () => {
    const s = stand();
    const d = coldPot(s);
    d.potColdAt = s.tick + 600;
    delete d.potOff;
    below(s, p1(s), 'drip');
    interact(s, 'p1');
    expect([p1(s).holding, p1(s).tool, d.potLeft]).toEqual(['drip', null, 2]);
  });

  it('R with the pot away from the sink: it goes home undumped (stale, still needs the sink)', () => {
    let s = stand();
    const d = coldPot(s);
    below(s, p1(s), 'drip');
    interact(s, 'p1');
    p1(s).pos = { x: 4, y: 4 };
    s = step(s, [{ kind: 'drop', playerId: 'p1' }]);
    const back = st(s, 'drip');
    expect([p1(s).tool, back.potOut, back.stale]).toEqual([null, undefined, true]);
    expect(d).not.toBe(back);
  });

  it('R with the pot at the sink dumps it', () => {
    let s = stand();
    coldPot(s);
    below(s, p1(s), 'drip');
    interact(s, 'p1');
    atSink(s, p1(s));
    s = step(s, [{ kind: 'drop', playerId: 'p1' }]);
    expect([p1(s).tool, st(s, 'drip').stale, st(s, 'drip').potOut]).toEqual([null, undefined, undefined]);
    expect(events(s, 'sink.dump')).toEqual([{ by: 'p1', item: 'pot' }]);
  });

  it('leaving with the pot sends it home', () => {
    let s = stand();
    coldPot(s);
    below(s, p1(s), 'drip');
    interact(s, 'p1');
    s = step(s, [{ kind: 'leave', playerId: 'p1' }]);
    expect([p1(s).tool, st(s, 'drip').potOut, st(s, 'drip').stale]).toEqual([null, undefined, true]);
  });
});

describe('FB2 A3 fix round 1: a collapse puts the pot back (I3)', () => {
  it('a barista who collapses on espresso drops no pot: it goes home stale', () => {
    const s = stand(['d1', 'e3', 'g2', 'b0']);
    coldPot(s);
    below(s, p1(s), 'drip');
    interact(s, 'p1');
    expect(p1(s).tool).toBe('pot');
    below(s, p1(s), 'espresso');
    s.supplies.beans = 50;
    for (let i = 0; i < 20 && !p1(s).espresso?.out; i++) drinkEspresso(s, 'p1');
    expect(p1(s).espresso?.out).toBe(true);
    expect([p1(s).tool, st(s, 'drip').potOut, st(s, 'drip').stale]).toEqual([null, undefined, true]);
  });
});

describe('FB2 A3: stale pots', () => {
  it('a pot with cups left at closing is stale next morning: pot.stale logged, no pour, no brew until dumped', () => {
    const s = stand();
    const d = coldPot(s, 2);
    d.potColdAt = s.tick + 10_000; // still hot at closing: it is the cups left that count
    finishDay(s);
    expect(st(s, 'drip').stale).toBe(true);
    expect(st(s, 'drip').potLeft).toBeUndefined();
    s.supplies.beans = 10;
    startDay(s);
    const m = st(s, 'drip');
    expect(m.stale).toBe(true);
    expect(events(s, 'pot.stale')).toEqual([{ station: 'drip' }]);
    // empty hands lift it (no pour, no brew)
    below(s, p1(s), 'drip');
    const beans = s.supplies.beans;
    interact(s, 'p1');
    expect([p1(s).tool, p1(s).holding, m.busyTicksLeft, s.supplies.beans]).toEqual(['pot', null, 0, beans]);
    atSink(s, p1(s));
    interact(s, 'p1');
    expect(m.stale).toBeUndefined();
    below(s, p1(s), 'drip');
    interact(s, 'p1');
    expect(m.making).toBe('drip');
  });

  it('a stale pot takes nothing from full hands either', () => {
    const s = stand();
    st(s, 'drip').stale = true;
    below(s, p1(s), 'drip');
    p1(s).holding = 'espresso';
    interact(s, 'p1');
    expect(p1(s).holding).toBe('espresso');
    expect(st(s, 'drip').stale).toBe(true);
  });

  it('an empty pot at closing is not stale; a pot carried at closing goes home stale; gear deals keep the flag overnight', () => {
    const s = stand();
    coldPot(s);
    below(s, p1(s), 'drip');
    interact(s, 'p1');
    finishDay(s);
    expect([p1(s).tool, st(s, 'drip').stale, st(s, 'drip').potOut]).toEqual([null, true, undefined]);
    s.cash = 10_000;
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'g3' }); // rebuilds the bar
    expect(st(s, 'drip').stale).toBe(true);
    applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'd2' }); // a new drip machine: a clean pot
    expect(st(s, 'drip').stale).toBeUndefined();

    const t = stand();
    finishDay(t);
    expect(st(t, 'drip').stale).toBeUndefined();
  });

  it('cold brew leftovers are untouched (batchOld rule, never stale)', () => {
    const s = stand(['c1', 'd1', 's3', 'b0']);
    const tap = st(s, 'coldBrewTap');
    tap.batchLeft = 3;
    finishDay(s);
    expect(tap.stale).toBeUndefined();
  });
});

describe('FB2 A3: classic runs', () => {
  it('no sink and no stale flags in a classic run', () => {
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    startDay(s);
    expect(s.stations.some((x) => x.id === SINK_ID)).toBe(false);
    finishDay(s);
    expect(s.stations.some((x) => x.stale)).toBe(false);
  });
});
