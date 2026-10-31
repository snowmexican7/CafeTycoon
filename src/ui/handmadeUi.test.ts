import { describe, expect, it } from 'vitest';
import { createRun, startDay } from '../sim/run';
import { stationsFromSlots } from '../sim/slots';
import { GEAR, type GearId } from '../data/gear';
import { SYRUP_ID } from '../data/layout';
import { JUG_LINES } from '../sim/handmade';
import type { GameState } from '../sim/types';
import { handHint, hudLive, ordersKey } from './live';
import { ticketAsks, ticketsHtml } from './tickets';
import {
  canAddSyrup,
  handmadeHeldRecipe,
  handmadeToast,
  isHandmadeEvent,
  jugMeter,
  steamMeter,
  syrupRackBlock,
} from '../render/handmadeModel';
import { crewBursts, newCrewMemory } from '../render/crewModel';
import { diffCues, logCursor, type CueId } from '../audio/cues';

function gearDay(gear: GearId[] = ['e5', 'c1']): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'cafe', gear: true });
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => { slots[i] = GEAR[id].station; slotGear[i] = id; });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  return startDay(s);
}

const at = (s: GameState, id: string) => { s.players[0].pos = { ...s.stations.find((x) => x.id === id)!.pos }; };
const emit = (s: GameState, kind: GameState['log'][number]['kind'], data: GameState['log'][number]['data'] = {}) => {
  s.log.push({ seq: s.nextLogSeq++, tick: s.tick, kind, data });
};

describe('FB2 B8 handmade UI (jug, steam, syrup, tickets)', () => {
  it('jugMeter shows fill, ticket line and the three marks', () => {
    const s = gearDay();
    const p = s.players[0];
    expect(jugMeter(s, p)).toBeNull();
    p.jug = { fill: 0, startedAt: s.tick, line: JUG_LINES.latte };
    const m = jugMeter(s, p)!;
    expect(m.fill).toBe(0);
    expect(m.line).toBe(JUG_LINES.latte);
    expect(m.done).toBe(false);
    expect(m.marks).toEqual([JUG_LINES.cappuccino, JUG_LINES.latte, JUG_LINES.large]);
    p.jug = { fill: 0.6, startedAt: s.tick, line: JUG_LINES.cappuccino, done: true };
    expect(jugMeter(s, p)).toMatchObject({ fill: 0.6, done: true, line: JUG_LINES.cappuccino });
  });

  it('steamMeter follows steamPos with perfect/ok bands', () => {
    const s = gearDay();
    const p = s.players[0];
    expect(steamMeter(s, p)).toBeNull();
    const wand = s.stations.find((x) => x.kind === 'steamer')!;
    p.steam = { startedAt: s.tick, speed: 1, station: wand.id };
    const m = steamMeter(s, p)!;
    expect(m.pos).toBeGreaterThanOrEqual(0);
    expect(m.pos).toBeLessThanOrEqual(1);
    expect(m.station).toBe(wand.id);
    expect(m.middle).toBe(0.5);
  });

  it('handmadeHeldRecipe uses handmade.ts steps (not the generic ticket strip)', () => {
    const s = gearDay();
    const p = s.players[0];
    s.customers = [{ id: 1, drink: 'latte', patienceLeft: 900, patienceMax: 1200, shots: 2, syrup: 'vanilla' }];
    p.holding = 'espresso';
    p.made = { shots: 2 };
    const r = handmadeHeldRecipe(s, p)!;
    expect(r.drink).toBe('latte');
    expect(r.shots).toBe(2);
    expect(r.syrup).toBe('vanilla');
    expect(r.steps.map((x) => x.step)).toEqual(['double', 'vanilla', 'milk', 'steam']);
    expect(r.steps[0].state).toBe('done');
    expect(r.steps[1].state).toBe('next');
    expect(r.steps.every((x) => x.icon.length > 0)).toBe(true);
  });

  it('canAddSyrup mirrors addSyrup gates; syrup rack block names the reason', () => {
    const s = gearDay();
    const rack = s.stations.find((x) => x.id === SYRUP_ID);
    expect(rack).toBeTruthy();
    s.supplies = { ...s.supplies, flavour: 2 };
    const p = s.players[0];
    at(s, SYRUP_ID);
    expect(canAddSyrup(s, p)).toBe(false);
    expect(syrupRackBlock(s, p)).toMatch(/shot or a latte/i);
    p.holding = 'latte';
    expect(canAddSyrup(s, p)).toBe(true);
    expect(syrupRackBlock(s, p)).toBeNull();
    expect(handHint(s, 'p1')).toMatchObject({ go: true, key: '1·2', title: 'Add a syrup' });
    p.made = { syrup: 'caramel' };
    expect(canAddSyrup(s, p)).toBe(false);
    expect(syrupRackBlock(s, p)).toMatch(/Already has caramel/);
  });

  it('tickets show double shot and syrup asks', () => {
    const s = gearDay();
    s.customers = [
      { id: 11, drink: 'latte', patienceLeft: 900, patienceMax: 1200, shots: 2, syrup: 'vanilla' },
      { id: 12, drink: 'cappuccino', patienceLeft: 800, patienceMax: 1200, shots: 2 },
    ];
    const live = hudLive(s, 'p1');
    expect(live.orders[0]).toMatchObject({ shots: 2, syrup: 'vanilla' });
    expect(live.orders[1]).toMatchObject({ shots: 2 });
    expect(ticketAsks(live.orders[0]!)).toBe('Double shot · Vanilla syrup');
    expect(ticketAsks(live.orders[1]!)).toBe('Double shot');
    const html = ticketsHtml(live.orders, { mode: 'off', open: new Set(), day: 3, holding: null, prices: { latte: '$5', cappuccino: '$5' }, gear: true });
    expect(html).toContain('Double shot · Vanilla syrup');
    expect(html).toContain('Double shot');
    expect(ordersKey(live)).toContain('×2');
    expect(ordersKey(live)).toContain('~v');
  });

  it('jug / steam hints: stop the jug anywhere, stop steam at the wand', () => {
    const s = gearDay();
    const p = s.players[0];
    p.holding = 'espresso';
    p.jug = { fill: 0.4, startedAt: s.tick, line: JUG_LINES.latte };
    expect(handHint(s, 'p1')).toMatchObject({ go: true, title: 'Stop the jug' });
    delete p.jug;
    const wand = s.stations.find((x) => x.kind === 'steamer')!;
    p.steam = { startedAt: s.tick, speed: 1, station: wand.id };
    p.pos = { x: wand.pos.x + 5, y: wand.pos.y };
    expect(handHint(s, 'p1')).toMatchObject({ go: false, title: 'Steam meter running' });
    p.pos = { ...wand.pos };
    expect(handHint(s, 'p1')).toMatchObject({ go: true, title: 'Stop the steam' });
  });
});

describe('FB2 B8 juice + sounds', () => {
  it('handmadeToast lines for milk.fill / steam.result / syrup.add / syrup.miss', () => {
    expect(isHandmadeEvent('milk.fill')).toBe(true);
    expect(handmadeToast({ kind: 'milk.fill', data: { by: 'p1', grade: 'right' } }, () => 'Ada')!.text).toMatch(/right on the line/);
    expect(handmadeToast({ kind: 'steam.result', data: { by: 'p1', grade: 'perfect' } }, () => 'Ada')!.tone).toBe('good');
    expect(handmadeToast({ kind: 'syrup.add', data: { by: 'p1', flavour: 'caramel' } }, () => 'Ada')).toMatchObject({
      text: 'Ada added caramel syrup',
      tone: 'good',
      at: SYRUP_ID,
    });
    expect(handmadeToast({ kind: 'syrup.miss', data: { customer: 3 } }, () => 'Ada')!.tone).toBe('bad');
  });

  it('crewBursts note the four B8 events', () => {
    const a = gearDay();
    const b = structuredClone(a);
    emit(b, 'milk.fill', { by: 'p1', level: 0.6, line: 0.6, grade: 'right' });
    emit(b, 'steam.result', { by: 'p1', grade: 'perfect' });
    emit(b, 'syrup.add', { by: 'p1', flavour: 'vanilla' });
    emit(b, 'syrup.miss', { customer: 1 });
    const notes = crewBursts(a, b, a.nextLogSeq - 1, newCrewMemory()).bursts.filter((x) => x.kind === 'note');
    expect(notes.map((n) => n.text).join('|')).toMatch(/right on the line/);
    expect(notes.map((n) => n.text).join('|')).toMatch(/perfect/);
    expect(notes.map((n) => n.text).join('|')).toMatch(/vanilla syrup/);
    expect(notes.map((n) => n.text).join('|')).toMatch(/tip less/);
  });

  it('diffCues plays milkFill / steamResult / syrupAdd / syrupMiss', () => {
    const a = gearDay();
    const b = structuredClone(a);
    emit(b, 'milk.fill', { by: 'p1', grade: 'under' });
    emit(b, 'steam.result', { by: 'p1', grade: 'miss' });
    emit(b, 'syrup.add', { by: 'p1', flavour: 'vanilla' });
    emit(b, 'syrup.miss', { customer: 2 });
    const ids = diffCues(a, b, 'p1', logCursor(a)).cues.map((c) => c.id) as CueId[];
    expect(ids).toEqual(expect.arrayContaining(['milkFill', 'steamResult', 'syrupAdd', 'syrupMiss']));
  });
});
