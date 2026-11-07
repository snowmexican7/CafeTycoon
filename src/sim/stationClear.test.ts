import { describe, expect, it } from 'vitest';
import { BASE_DRINKS } from '../data/drinks';
import { createRun } from './run';
import { interact } from './stations';
import type { DrinkId, GameState } from './types';

const run = (): GameState => {
  // Classic layout has every machine; flip the Gear flag so the pickup counter has its 4 Gear slots.
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
  s.gear = true;
  s.milkOut = 5;
  s.unlocked = [...BASE_DRINKS, 'redEye', 'cafeAuLait', 'icedLatte', 'sweetCream', 'mocha', 'americano'] as DrinkId[];
  for (const d of s.unlocked) s.menu[d] = true;
  return s;
};
const st = (s: GameState, id: string) => s.stations.find((x) => x.id === id)!;
const stand = (s: GameState, id: string) => {
  const x = st(s, id);
  s.players[0].pos = { x: x.pos.x, y: x.pos.y };
  return x;
};

describe('Round 6 block 1: a waiting cup does not lock a machine', () => {
  it('espresso: a sitting shot + drip in hand starts a red-eye; the shot lands on the pickup counter', () => {
    const s = run();
    const esp = stand(s, 'espresso');
    esp.output = 'espresso';
    esp.outputSince = s.tick;
    s.players[0].holding = 'drip';
    interact(s, 'p1');
    expect(esp.making).toBe('redEye');
    expect(esp.busyTicksLeft).toBeGreaterThan(0);
    expect(esp.output).toBeNull();
    expect(s.players[0].holding).toBeNull();
    expect(s.pass.map((p) => p.item)).toEqual(['espresso']);
    expect(s.pass[0].by).toBe('p1');
    const ev = s.log.find((e) => e.kind === 'station.clear')!;
    expect(ev.data).toMatchObject({ by: 'p1', station: 'espresso', drink: 'espresso' });
  });

  it('steamer: a sitting latte + espresso in hand clears the latte and starts a second one', () => {
    const s = run();
    const stm = stand(s, 'steamer');
    stm.output = 'latte';
    s.players[0].jug = { fill: 1, startedAt: 0, done: true } as never; // the jug is already filled
    s.players[0].holding = 'espresso';
    interact(s, 'p1');
    expect(stm.making).toBe('latte');
    expect(s.pass.map((p) => p.item)).toEqual(['latte']);
  });

  it('tap: a held espresso no longer clears a sitting cold brew (iced latte is made at the milk counter now)', () => {
    const s = run();
    const tap = stand(s, 'coldBrewTap');
    tap.output = 'coldBrew';
    tap.batchLeft = undefined;
    s.players[0].holding = 'espresso';
    interact(s, 'p1');
    expect(tap.output).toBe('coldBrew'); // Round 6 block 4: the tap only pours cold brew, so nothing to start here
    expect(s.players[0].holding).toBe('espresso');
    expect(s.pass).toHaveLength(0);
  });

  it('empty hands still take the output first', () => {
    const s = run();
    const esp = stand(s, 'espresso');
    esp.output = 'espresso';
    interact(s, 'p1');
    expect(s.players[0].holding).toBe('espresso');
    expect(s.pass).toHaveLength(0);
    expect(s.log.some((e) => e.kind === 'station.clear')).toBe(false);
  });

  it('a busy machine stays busy', () => {
    const s = run();
    const esp = stand(s, 'espresso');
    esp.busyTicksLeft = 50;
    esp.making = 'espresso';
    s.players[0].holding = 'drip';
    interact(s, 'p1');
    expect(esp.making).toBe('espresso');
    expect(s.players[0].holding).toBe('drip');
    expect(s.pass).toHaveLength(0);
  });

  it('a held cup with no recipe there leaves the sitting cup alone', () => {
    const s = run();
    const esp = stand(s, 'espresso');
    esp.output = 'espresso';
    s.players[0].holding = 'latte';
    interact(s, 'p1');
    expect(esp.output).toBe('espresso');
    expect(s.pass).toHaveLength(0);
  });

  it('a full pickup counter refuses the press: nothing lost, reason logged', () => {
    const s = run();
    const esp = stand(s, 'espresso');
    esp.output = 'espresso';
    s.players[0].holding = 'drip';
    for (let i = 0; i < 4; i++) s.pass.push({ item: 'drip', ticksLeft: 999 });
    interact(s, 'p1');
    expect(esp.output).toBe('espresso');
    expect(esp.making ?? null).toBeNull();
    expect(s.players[0].holding).toBe('drip');
    expect(s.pass).toHaveLength(4);
    expect(s.log.find((e) => e.kind === 'station.clearFull')!.data).toMatchObject({ station: 'espresso', drink: 'espresso', reason: 'counterFull' });
  });

  it('a missing supply refuses without clearing the cup', () => {
    const s = run();
    const esp = stand(s, 'espresso');
    esp.output = 'espresso';
    s.players[0].holding = 'drip';
    s.supplies.beans = 0; // red-eye uses beans
    interact(s, 'p1');
    expect(esp.output).toBe('espresso');
    expect(s.pass).toHaveLength(0);
  });

  it('the cup keeps its marks onto the counter', () => {
    const s = run();
    const esp = stand(s, 'espresso');
    esp.output = 'espresso';
    esp.cupSlips = 1;
    s.players[0].holding = 'drip';
    interact(s, 'p1');
    expect(s.pass[0].slips).toBe(1);
    expect(esp.cupSlips).toBeUndefined();
  });
});
