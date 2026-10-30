import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../data/economy';
import { TICK_RATE } from '../sim/constants';
import { applyGearInput } from '../sim/gear';
import { createRun } from '../sim/run';
import type { Customer, GameState } from '../sim/types';
import { ticketSteps } from '../ui/tickets';
import { COOL_COLORS, coolColor, coolFraction, heldRecipe, passCool, potCool, stationCounts, STEP_ICON } from './countsModel';

const run = () => createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
const buy = (s: GameState, gear: string) => applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: gear as never });
const cust = (drink: Customer['drink'], stage: Customer['stage'] = 'order', extra?: Customer['drink'][]) =>
  ({ id: `c-${drink}-${stage}`, drink, stage, extra, patienceLeft: 100, patienceMax: 100 }) as unknown as Customer;

describe('stationCounts (3.3.2 floating counts)', () => {
  it('shows cold brew cups left, nothing at 0, low under 3', () => {
    const s = run();
    buy(s, 'c1');
    const tap = s.stations.find((x) => x.kind === 'coldBrewTap')!;
    tap.batchLeft = 7;
    expect(stationCounts(s).find((c) => c.id === tap.id)).toMatchObject({ n: 7, tone: 'ok', cool: null });
    tap.batchLeft = 2;
    expect(stationCounts(s).find((c) => c.id === tap.id)?.tone).toBe('low');
    tap.batchLeft = 0;
    expect(stationCounts(s).find((c) => c.id === tap.id)).toBeUndefined();
  });

  it('shows drip cups left with a cooling fraction, hidden while brewing, cold when the pot is cold', () => {
    const s = run();
    buy(s, 'd1');
    const st = s.stations.find((x) => x.kind === 'drip')!;
    expect(stationCounts(s).find((c) => c.id === st.id)).toBeUndefined(); // empty pot
    st.busyTicksLeft = 10;
    st.potLeft = 4;
    expect(stationCounts(s).find((c) => c.id === st.id)).toBeUndefined(); // brewing
    st.busyTicksLeft = 0;
    st.potLeft = 3;
    st.potColdAt = s.tick + 100;
    const c = stationCounts(s).find((x) => x.id === st.id)!;
    expect(c.n).toBe(3);
    expect(c.tone).toBe('ok');
    expect(c.cool).toBeGreaterThan(0);
    s.tick += 200;
    expect(stationCounts(s).find((x) => x.id === st.id)).toMatchObject({ n: 3, tone: 'cold', cool: 0 });
  });

  it('a finished shot waiting at a machine counts as 1; counters and the bin never show', () => {
    const s = run();
    buy(s, 'e1');
    const esp = s.stations.find((x) => x.kind === 'espresso')!;
    esp.output = 'espresso';
    for (const x of s.stations) if (x.kind === 'counter' || x.kind === 'trash') x.output = 'latte';
    const counts = stationCounts(s);
    expect(counts.find((c) => c.id === esp.id)).toMatchObject({ n: 1, cool: null });
    expect(counts.every((c) => !['counter', 'trash'].includes(s.stations.find((x) => x.id === c.id)!.kind))).toBe(true);
    esp.output = null;
    expect(stationCounts(s).find((c) => c.id === esp.id)).toBeUndefined();
  });
});

describe('cooling ring (3.3.2)', () => {
  it('coolFraction clamps and treats a bad total as cold', () => {
    expect(coolFraction(50, 100)).toBe(0.5);
    expect(coolFraction(150, 100)).toBe(1);
    expect(coolFraction(-5, 100)).toBe(0);
    expect(coolFraction(5, 0)).toBe(0);
  });

  it('goes red → orange → yellow → blue', () => {
    expect(coolColor(1)).toBe(COOL_COLORS.red);
    expect(coolColor(0.7)).toBe(COOL_COLORS.red);
    expect(coolColor(0.5)).toBe(COOL_COLORS.orange);
    expect(coolColor(0.1)).toBe(COOL_COLORS.yellow);
    expect(coolColor(0)).toBe(COOL_COLORS.blue);
  });

  it('pickup cups use their stale timer, drip pots their cold time, thermal urns none', () => {
    const s = run();
    const full = ECONOMY.pass.staleSeconds.latte * TICK_RATE;
    s.pass = [{ item: 'latte', ticksLeft: full }, { item: 'latte', ticksLeft: full / 4 }];
    expect(passCool(s)).toEqual([1, 0.25]);
    expect(potCool({ gear: 'd1', potColdAt: undefined }, 0)).toBeNull();
    expect(potCool({ gear: undefined, potColdAt: 10 }, 0)).toBeNull();
  });
});

describe('heldRecipe (3.3.2 step icons over a carried cup)', () => {
  it('nothing with empty hands, a tool, or nobody wanting it', () => {
    const s = run();
    const p = s.players[0];
    expect(heldRecipe(s, 'p1')).toBeNull();
    p.holding = 'grounds';
    expect(heldRecipe(s, 'p1')).toBeNull(); // nobody ordered anything yet
    p.tool = 'mop';
    s.customers = [cust('latte')];
    expect(heldRecipe(s, 'p1')).toBeNull();
  });

  it('marks done / next / todo against the first ticket the cup fits, finished drinks to an exact match', () => {
    const s = run();
    const p = s.players[0];
    s.customers = [cust('latte', 'order')];
    p.holding = 'grounds';
    const r = heldRecipe(s, 'p1')!;
    expect(r.drink).toBe('latte');
    const steps = ticketSteps('latte', false, true);
    expect(r.steps.map((x) => x.label)).toEqual(steps);
    expect(r.steps[0].state).toBe('done');
    expect(r.steps.filter((x) => x.state === 'next')).toHaveLength(1);
    expect(r.steps.at(-1)!.state).not.toBe('done');
    for (const x of r.steps) expect(x.icon).toBe(STEP_ICON[x.label] ?? '•');
    // an espresso goes to the espresso customer, even behind a latte ticket
    s.customers = [cust('latte', 'pickup'), cust('espresso', 'order')];
    p.holding = 'espresso';
    expect(heldRecipe(s, 'p1')!.drink).toBe('espresso');
  });
});
