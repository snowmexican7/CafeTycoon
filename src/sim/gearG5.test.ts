import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { applyGearInput, gearAfterUse, gearMorning } from './gear';
import { ECONOMY } from '../data/economy';
import { interact, stepStations } from './stations';
import { GEAR, type GearId } from '../data/gear';
import type { CreateRunOptions, GameState } from './types';

const opts = (gear?: boolean, seed = 7): CreateRunOptions => ({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear });
const buy = (s: GameState, gear: GearId) => applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear });
const at = (s: GameState, kind: string) => {
  const st = s.stations.find((x) => x.kind === kind)!;
  s.players[0].pos = { ...st.pos, y: st.pos.y + 1 };
  return st;
};
const finish = (s: GameState) => { while (s.stations.some((x) => x.busyTicksLeft > 0)) { s.tick += 1; stepStations(s); } };

describe('Gear Tree G5: downsides and funny events', () => {
  it('the battery whisk dies after its uses for the day and is back next morning', () => {
    const s = createRun(opts(true));
    buy(s, 's1');
    s.supplies.milk = 50;
    startDay(s);
    const st = at(s, 'steamer');
    const left = st.usesToDie!;
    expect(left).toBeGreaterThanOrEqual(GEAR.s1.quirks!.dieAfter!);
    let uses = 0;
    for (let i = 0; i < 40 && !st.dead; i++) {
      const before = st.usesToDie;
      s.players[0].holding = 'espresso';
      interact(s, 'p1');
      finish(s);
      s.players[0].holding = null;
      interact(s, 'p1'); // pick up the latte
      s.players[0].holding = null;
      if (st.dead || st.usesToDie !== before) uses++;
    }
    expect(uses).toBe(left);
    expect(st.dead).toBe(true);
    expect(s.log.some((e) => e.kind === 'gear.quirk' && String(e.data.text).includes('batteries died'))).toBe(true);
    s.players[0].holding = 'espresso';
    const milk = s.supplies.milk;
    interact(s, 'p1');
    expect([st.making ?? null, s.supplies.milk, s.players[0].holding]).toEqual([null, milk, 'espresso']);
    gearMorning(s);
    expect(st.dead).toBeUndefined();
    expect(st.usesToDie).toBeGreaterThan(0);
  });

  it('a jammed Pod-o-Matic blocks until empty hands whack it', () => {
    const s = createRun(opts(true));
    buy(s, 'e1');
    s.supplies.beans = 10;
    startDay(s);
    const st = at(s, 'espresso');
    st.jammed = true;
    interact(s, 'p1'); // whack
    expect([st.jammed, st.making ?? null, s.supplies.beans]).toEqual([undefined, null, 10]);
    interact(s, 'p1'); // now it brews
    expect(st.making).toBe('espresso');
  });

  it('jams happen at about the listed rate, deterministically per seed', () => {
    const count = (seed: number) => {
      const s = createRun(opts(true, seed));
      buy(s, 'e1');
      s.supplies.beans = 1000;
      startDay(s);
      const st = at(s, 'espresso');
      let jams = 0;
      for (let i = 0; i < 500; i++) {
        interact(s, 'p1');
        if (st.jammed) { jams++; finish(s); s.players[0].holding = null; interact(s, 'p1'); s.players[0].holding = null; interact(s, 'p1'); }
        finish(s);
        s.players[0].holding = null;
        interact(s, 'p1');
        s.players[0].holding = null;
      }
      return jams;
    };
    const a = count(3);
    expect(a).toBe(count(3));
    expect(a).toBeGreaterThan(5);
    expect(a).toBeLessThan(45);
  });

  it('Lucky Sock removes the lint mark; morning quirks only roll in Gear runs', () => {
    const s = createRun(opts(true));
    buy(s, 'c1');
    s.supplies.concentrate = 5;
    startDay(s);
    const tap = at(s, 'coldBrewTap');
    tap.lucky = true;
    interact(s, 'p1');
    expect(tap.cupSlips ?? 0).toBe(0);
    const classic = createRun(opts());
    const before = classic.rng;
    gearMorning(classic);
    expect(classic.rng).toBe(before);
  });

  it('the sock question and the jar crack show up as morning notes over many mornings', () => {
    const s = createRun(opts(true));
    buy(s, 'c1');
    let asked = 0;
    for (let i = 0; i < 400; i++) { s.morningNotes = []; gearMorning(s); if (s.morningNotes.some((n) => n.includes('sock?'))) asked++; }
    expect(asked).toBeGreaterThan(0);
    const j = createRun(opts(true));
    buy(j, 'c2');
    j.supplies.concentrate = 10_000; // every morning steeps a full jar shelf
    let cracked = 0;
    for (let i = 0; i < 400; i++) { j.morningNotes = []; gearMorning(j); const tap = j.stations.find((x) => x.kind === 'coldBrewTap')!; if (tap.batchLeft === 12) cracked++; }
    expect(cracked).toBeGreaterThan(0);
  });

  it('the goose spill only says "coffee on the floor" when a puddle actually lands', () => {
    const s = createRun(opts(true));
    buy(s, 'e2');
    startDay(s);
    const st = at(s, 'espresso');
    const spills = () => s.log.filter((e) => e.kind === 'gear.quirk' && String(e.data.text).includes('portafilter')).length;
    s.messes = Array.from({ length: ECONOMY.mess.max }, () => ({ ...s.messes[0], kind: 'spill' as const, tile: { x: 0, y: 0 }, amount: 1 })) as GameState['messes'];
    for (let i = 0; i < 300; i++) gearAfterUse(s, st, s.players[0]);
    expect(spills()).toBe(0);
    s.messes = [];
    for (let i = 0; i < 300 && spills() === 0; i++) gearAfterUse(s, st, s.players[0]);
    expect(spills()).toBe(1);
    expect(s.messes.length).toBeGreaterThan(0);
  });
});
