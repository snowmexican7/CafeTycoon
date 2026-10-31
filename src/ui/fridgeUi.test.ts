import { describe, it, expect } from 'vitest';
import { createRun, startDay } from '../sim/run';
import { finishDay } from '../sim/closing';
import { ensureCounterSpots, stationsFromSlots } from '../sim/slots';
import { FRIDGE_ID } from '../data/layout';
import { FRIDGES, type FridgeId } from '../data/fridges';
import { GEAR, type GearId } from '../data/gear';
import type { GameState, Player, SimEvent, TierId } from '../sim/types';
import { closingListVM, checklistKey, hudLive, toolLabel } from './live';
import { fridgeVM, gearVM } from './gearVM';
import { fridgePanel } from './night';
import { cartonsFor, fridgeGlow, fridgeLabel, fridgeToast, isFridgeEvent, milkSpot, FRIDGE_EVENTS } from '../render/fridgeModel';
import { stationCounts } from '../render/countsModel';
import { FRIDGE_RISE } from '../render/layers/fridgeArtRise';
import { diffCues } from '../audio/cues';
import { nightViewModel } from './viewModels';

/** FB2 C9: 'steamer' in a test kit is a plain steam station with no gear (a Gear shop only gets one as an espresso machine's wand; the steam station itself works the same). */
type Kit = GearId | 'steamer';

function gearNight(gear: Kit[] = ['steamer', 'e2'], tier: TierId = 'stand', fridge: FridgeId | null = 'f1'): GameState {
  const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier, gear: true });
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  gear.forEach((id, i) => {
    slots[i] = (id === 'steamer' ? 'steamer' : GEAR[id].station);
    slotGear[i] = id === 'steamer' ? null : id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  if (fridge) s.fridge = fridge;
  ensureCounterSpots(s);
  return s;
}
function gearDay(fridge: FridgeId | null = 'f1'): GameState {
  const s = gearNight(['steamer', 'e2'], 'stand', fridge);
  s.supplies.milk = 20;
  s.supplies.beans = 20;
  return startDay(s);
}
const me = (s: GameState): Player => s.players[0]!;
const at = (s: GameState, id: string) => s.stations.find((x) => x.id === id)!;
const besideFridge = (s: GameState) => {
  const st = at(s, FRIDGE_ID);
  me(s).pos = { x: st.pos.x + 1, y: st.pos.y };
};
const ev = (kind: string, data: SimEvent['data'] = {}): Pick<SimEvent, 'kind' | 'data'> => ({ kind: kind as SimEvent['kind'], data });
const names = (id: string) => (id === 'p1' ? 'Kennedy' : id);

describe('ui-3.4.1: fridge bubbles in plain English', () => {
  it('every fridge event gets a bubble', () => {
    expect(FRIDGE_EVENTS).toHaveLength(8);
    for (const k of FRIDGE_EVENTS) expect(isFridgeEvent(k)).toBe(true);
    expect(isFridgeEvent('pass.put')).toBe(false);
  });
  it('words each event', () => {
    expect(fridgeToast(ev('fridge.take', { by: 'p1', item: 'milk', n: 8 }), names)!.text).toBe('🥛 Kennedy grabbed milk (8)');
    expect(fridgeToast(ev('fridge.put', { by: 'p1', item: 'milk', n: 3 }), names)!.text).toBe('❄️ Kennedy put the milk away (3)');
    expect(fridgeToast(ev('fridge.put', { by: 'p1', item: 'bar', n: 5 }), names)!.text).toBe('❄️ Kennedy put the condiment bar away');
    expect(fridgeToast(ev('milk.out', { by: 'p1', n: 8, station: 's' }), names)!.text).toBe('🥛 Kennedy put 8 milk out');
    expect(fridgeToast(ev('milk.lift', { by: 'p1', n: 2, station: 's' }), names)!.text).toContain('picked up the milk');
    expect(fridgeToast(ev('bar.lift', { by: 'p1', n: 2 }), names)!.text).toContain('packed up the condiment bar');
    expect(fridgeToast(ev('supply.spoil', { item: 'milk', count: 4 }), names)!.text).toBe('🥀 Milk left out went bad (4)');
    expect(fridgeToast(ev('closing.soon', { left: 30 }), names)!.text).toContain('Closing soon');
    expect(fridgeToast(ev('fridge.auto', { n: 4 }), names, 'Udder-Matic 3000')!.text).toContain('Moo!');
  });
  it('no jargon like "tap" in any bubble', () => {
    for (const k of FRIDGE_EVENTS) {
      const t = fridgeToast(ev(k, { by: 'p1', item: 'milk', n: 2, count: 2, left: 30 }), names);
      if (t) expect(t.text.toLowerCase()).not.toMatch(/\btap\b/);
    }
  });
  it('cartons out: 1 to 3', () => {
    expect(cartonsFor(0)).toBe(0);
    expect(cartonsFor(1)).toBe(1);
    expect(cartonsFor(30)).toBeLessThanOrEqual(3);
  });
});

describe('ui-3.4.1: the fridge in the shop', () => {
  it('labels the fridge by name and finds the milk spot', () => {
    const s = gearDay('f1');
    expect(fridgeLabel(s)).toContain(FRIDGES.f1.name);
    expect(milkSpot(s)).not.toBeNull();
  });
  it('the fridge count reads "N milk left" and sits above the fridge art', () => {
    const s = gearDay('f2');
    const c = stationCounts(s).find((x) => x.id === FRIDGE_ID);
    expect(c?.unit).toBe('milk left');
    expect(c?.rise).toBe(FRIDGE_RISE.f2);
  });
  it('empty hands at the fridge: "Grab milk"', () => {
    const s = gearDay('f1');
    besideFridge(s);
    const live = hudLive(s, 'p1');
    expect(live.hint.title).toBe('Grab milk');
    expect(fridgeGlow(s, me(s))).toBeNull();
    me(s).tool = 'milk';
    me(s).carry = 8;
    expect(fridgeGlow(s, me(s))).toMatchObject({ tone: 'milk' });
  });
  it('a carton in hand: "Put a carton out" at the steamer, and the hand label counts the milk', () => {
    const s = gearDay('f1');
    const p = me(s);
    p.tool = 'milk';
    p.carry = 8;
    const spot = milkSpot(s)!;
    p.pos = { x: spot.pos.x, y: spot.pos.y + 1 };
    expect(hudLive(s, 'p1').hint.title).toBe('Put a carton out');
    expect(toolLabel(p)!.label).toContain('8 milk');
    besideFridge(s);
    expect(hudLive(s, 'p1').hint.title).toBe('Put the milk away');
  });
  it('the bar label counts servings', () => {
    expect(toolLabel({ tool: 'bar', carry: 1 })!.label).toContain('1 serving');
    expect(toolLabel({ tool: 'bar', carry: 6 })!.label).toContain('6 servings');
  });
});

describe('ui-3.4.1: the closing-soon checklist', () => {
  it('shows only when closing soon, with milk, bar, floor and counter rows', () => {
    const s = gearDay('f1');
    expect(hudLive(s, 'p1').checklist).toBeUndefined();
    s.closingSoonAt = s.tick;
    const list = closingListVM(s)!;
    expect(list.title).toMatch(/Closing soon/);
    const text = list.rows.map((r) => r.text).join(' | ');
    expect(text).toContain('Milk back in the fridge');
    expect(text).toContain('Floor clean');
    expect(text).toContain('Pickup counter clear');
    expect(hudLive(s, 'p1').checklist).toBeDefined();
    expect(checklistKey(list)).toBeTypeOf('string');
  });
  it('warns the bar goes bad with no fridge', () => {
    const s = gearDay(null);
    s.closingSoonAt = s.tick;
    const list = closingListVM(s)!;
    expect(list.rows.some((r) => r.warn)).toBe(true);
  });
});

describe('ui-3.4.1: night fridge cards', () => {
  it('a stand with no fridge is offered the Dorm Room Cube for $20', () => {
    const s = gearNight([], 'stand', null);
    s.cash = 100;
    const f = fridgeVM(s);
    expect(f.have).toBeNull();
    expect(f.cards[0]).toMatchObject({ id: 'f1', price: 20, state: 'buy' });
    const html = fridgePanel(f);
    expect(html).toContain('data-action="fridge-buy"');
    expect(html).toContain('Buy it · $20');
    expect(gearVM(s, 'p1').fridge).toBeDefined();
  });
  it('a café with the Chrome Reach-In sees the Udder-Matic; co-op asks the crew', () => {
    const s = gearNight([], 'cafe', 'f3');
    s.cash = 1000;
    const solo = fridgeVM(s, 1);
    expect(solo.cards[0]).toMatchObject({ id: 'f4', price: 320 });
    const html = fridgePanel(fridgeVM(s, 2));
    expect(html).toContain('Ask the crew · $320');
  });
  it('too little cash: the card is greyed out', () => {
    const s = gearNight([], 'cafe', 'f3');
    s.cash = 10;
    const f = fridgeVM(s);
    expect(f.cards[0]!.state).toBe('poor');
    expect(fridgePanel(f)).toContain('disabled');
  });
});

describe('ui-3.4.1: fridge sounds', () => {
  it('maps each fridge event to a cue', () => {
    const s = gearDay('f1');
    const prev = structuredClone(s);
    const start = s.nextLogSeq - 1;
    const kinds: [string, string][] = [['fridge.take', 'fridgeOpen'], ['fridge.put', 'fridgeShut'], ['milk.out', 'milkOut'], ['supply.spoil', 'spoil'], ['closing.soon', 'closingSoon'], ['fridge.auto', 'moo']];
    kinds.forEach(([kind], i) => s.log.push({ seq: start + i + 1, tick: s.tick, kind, data: { by: 'p1' } } as SimEvent));
    s.nextLogSeq = start + kinds.length + 1;
    const { cues } = diffCues(prev, s, 'p1', start);
    for (const [, id] of kinds) expect(cues.map((c) => c.id)).toContain(id);
  });
});

describe('ui-3.4.1: the brief offers the fridge', () => {
  it('no fridge: a "Buy it · $20" fix', () => {
    const s = gearDay(null);
    s.today.spoiledBar = 3;
    finishDay(s);
    s.cash = 200;
    const row = nightViewModel(s, 'p1').brief.alerts.find((a) => a.id === 'fridge');
    expect(row?.fix?.label).toBe('Buy it · $20');
    expect(row?.fix?.input).toEqual({ kind: 'fridge', fridge: 'f1' });
  });
});
