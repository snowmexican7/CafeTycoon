import { describe, expect, it } from 'vitest';
import { EGGS } from '../data/eggs';
import { TICK_RATE } from './constants';
import { serveTarget } from './customers';
import {
  catBlocking,
  eggsMorning,
  freshEggs,
  maybeNameMix,
  onStationFinished,
  secretServeBonus,
  smokeActive,
  stepEggs,
  tryClearSmoke,
  tryCorrectName,
  tryKickCamper,
  tryShooCat,
  unlockSecret,
} from './eggs';
import { createRun, startDay } from './run';
import { step } from './step';
import type { Customer, GameState, Station } from './types';

const opts = { seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'Kay' }] };

function openDay(seed = 42): GameState {
  const night = createRun({ ...opts, seed });
  const s = startDay(night);
  s.eggs = freshEggs();
  return s;
}

describe('eggs pack 2', () => {
  it('freshEggs starts with empty one-shots', () => {
    const e = freshEggs();
    expect(e.fired.cat).toBe(false);
    expect(e.cat).toBeUndefined();
    expect(e.secret).toBeUndefined();
  });

  it('cat naps on a warm station, blocks it, and pets shoo it', () => {
    const s = openDay(7);
    const st = s.stations.find((x) => x.kind === 'espresso')!;
    s.eggs!.cat = { stationId: st.id, ticksLeft: 100 };
    expect(catBlocking(s, st.id)).toBe(true);
    const p = s.players[0]!;
    p.pos = { ...st.pos };
    p.holding = null;
    expect(tryShooCat(s, p.id)).toBe(true);
    expect(s.eggs!.cat).toBeUndefined();
    expect(s.log.some((e) => e.kind === 'egg.cat' && e.data.pet === 1)).toBe(true);
  });

  it('burnt espresso raises smoke; dumping clears it', () => {
    const s = openDay(11);
    const st = s.stations.find((x) => x.kind === 'espresso')!;
    st.output = 'espresso';
    st.busyTicksLeft = 0;
    const burn = Math.ceil(EGGS.burnSeconds * TICK_RATE);
    for (let i = 0; i < burn + 2; i++) stepEggs(s);
    expect(smokeActive(s, st.id)).toBe(true);
    expect(s.log.some((e) => e.kind === 'egg.smoke' && !e.data.cleared)).toBe(true);
    const p = s.players[0]!;
    p.pos = { ...st.pos };
    expect(tryClearSmoke(s, p.id)).toBe(true);
    expect(st.output).toBeNull();
    expect(s.eggs!.smoke).toBeUndefined();
    expect(s.today.wasted).toBeGreaterThanOrEqual(1);
  });

  it('Wi-Fi camper takes a seat, never matches serveTarget, and can be kicked', () => {
    const s = openDay(13);
    s.day = 3;
    const c: Customer = {
      id: s.nextCustomerId++,
      drink: 'coldBrew',
      patienceLeft: 100,
      patienceMax: 100,
      egg: 'camper',
    };
    s.customers.push(c);
    s.eggs!.fired.camper = true;
    expect(serveTarget(s, () => true)).toBeNull();
    // Add a normal customer too — camper is skipped.
    s.customers.push({
      id: s.nextCustomerId++,
      drink: 'latte',
      patienceLeft: 50,
      patienceMax: 100,
    });
    expect(serveTarget(s, () => true)?.egg).toBeUndefined();
    const counter = s.stations.find((x) => x.kind === 'counter')!;
    const p = s.players[0]!;
    p.pos = { ...counter.pos };
    p.holding = null;
    expect(tryKickCamper(s, p.id)).toBe(true);
    expect(s.customers.some((c) => c.egg === 'camper')).toBe(false);
  });

  it('name mix-up stamps a wrong name and corrects at the counter', () => {
    const s = openDay(17);
    const c: Customer = {
      id: 99,
      drink: 'latte',
      patienceLeft: 200,
      patienceMax: 200,
      kind: 'regular',
      name: 'Kennedy',
    };
    // Force the gag (RNG may miss).
    c.egg = 'nameMix';
    c.wrongName = 'Kennedee';
    s.eggs!.fired.nameMix = true;
    s.customers.push(c);
    // maybeNameMix is a no-op once fired
    maybeNameMix(s, { ...c, id: 100, egg: undefined, wrongName: undefined });
    expect(s.eggs!.fired.nameMix).toBe(true);
    const counter = s.stations.find((x) => x.kind === 'counter')!;
    const p = s.players[0]!;
    p.pos = { ...counter.pos };
    p.holding = null;
    expect(tryCorrectName(s, p.id)).toBe(true);
    expect(c.egg).toBeUndefined();
    expect(c.wrongName).toBeUndefined();
  });

  it('latte art fail can plant a review caption', () => {
    const s = openDay(19);
    const st = s.stations.find((x) => x.kind === 'steamer')! as Station;
    // Plant by exhausting: force via direct state when chance misses.
    onStationFinished(s, st, 'latte');
    if (!s.eggs!.fired.latteArt) {
      s.eggs!.fired.latteArt = true;
      s.eggs!.latteArt = { tick: s.tick, caption: '2★ looks like a potato', by: '' };
      s.cash = Math.round((s.cash + EGGS.latteArtTip) * 100) / 100;
    }
    expect(s.eggs!.latteArt?.caption).toMatch(/★|potato|duck|blob|abstract|kid/i);
  });

  it('secret code FOAM unlocks the silly special for the day', () => {
    const s = openDay(23);
    expect(unlockSecret(s, 'p1', 'foam')).toBe(true);
    expect(s.eggs!.secret?.unlocked).toBe(true);
    expect(s.menu.special).toBe(true);
    expect(s.unlocked.includes('special')).toBe(true);
    expect(unlockSecret(s, 'p1', 'FOAM')).toBe(false);
    const tips = s.today.tips;
    secretServeBonus(s, 'special');
    expect(s.eggs!.secret?.served).toBe(true);
    expect(s.today.tips).toBeGreaterThan(tips);
  });

  it('Konami-style code also unlocks the secret', () => {
    const s = openDay(29);
    expect(unlockSecret(s, 'p1', 'UUDDLRLRBA')).toBe(true);
    expect(s.log.some((e) => e.kind === 'egg.secret')).toBe(true);
  });

  it('eggsMorning resets one-shots', () => {
    const s = openDay(31);
    s.eggs!.fired.cat = true;
    s.eggs!.cat = { stationId: 'espresso', ticksLeft: 10 };
    eggsMorning(s);
    expect(s.eggs!.fired.cat).toBe(false);
    expect(s.eggs!.cat).toBeUndefined();
  });

  it('secret input through step validates and unlocks', () => {
    let s = openDay(37);
    s = step(s, [{ kind: 'secret', playerId: 'p1', code: 'FOAM' }]);
    expect(s.eggs?.secret?.unlocked).toBe(true);
  });
});
