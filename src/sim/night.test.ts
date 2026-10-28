import { describe, it, expect } from 'vitest';
import { CATALOGUE, catalogueById } from '../data/catalogue';
import { applyNightInput, dealHand, eligibleItems, restockCost, stepNight } from './night';
import { createRun } from './run';

const run = (seed = 1) => createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }], settings: { bots: 0 } });

describe('night phase', () => {
  it('deals five distinct eligible ids with a cheap option', () => {
    const s = run();
    expect(s.hand).toHaveLength(5);
    expect(new Set(s.hand).size).toBe(5);
    expect(s.hand.some((id) => catalogueById[id].cost < 30)).toBe(true);
    expect(s.hand).not.toContain('laMazzoccaPro'); // requires dualBoiler
  });

  it('respects owned, requires, and excludes', () => {
    const s = run();
    s.owned = [{ itemId: 'dualBoiler', effects: [] }, { itemId: 'digitalKiosk', effects: [] }];
    const ids = eligibleItems(s).map((i) => i.id);
    expect(ids).not.toContain('dualBoiler');
    expect(ids).toContain('laMazzoccaPro');
    expect(ids).not.toContain('squarelyTerminal');
    expect(ids).toContain('chirperThread'); // tomorrow items are always eligible
  });

  it('deals fewer than five when the pool is thin, and zero when empty', () => {
    // Review Focus 3
    const s = run();
    s.owned = CATALOGUE.filter((i) => i.duration === 'permanent').map((i) => ({ itemId: i.id, effects: [] }));
    expect(dealHand(s).hand).toHaveLength(4); // only the four 'tomorrow' ads remain
    expect(dealHand(s, []).hand).toEqual([]);
    expect(dealHand(s, [catalogueById.streetSign]).hand).toEqual([]); // owned permanent: nothing eligible
  });

  it('buys from the hand against shared cash, once per night', () => {
    // Review Focus 2
    const s = run();
    s.hand = ['streetSign', 'dualBoiler'];
    s.cash = 100;
    let t = applyNightInput(s, { kind: 'buy', playerId: 'p2', itemId: 'streetSign' });
    expect(t.cash).toBe(85);
    expect(t.owned.map((o) => o.itemId)).toEqual(['streetSign']);
    expect(t.hand).toEqual(['dualBoiler']);
    expect(t.boughtTonight).toEqual(['streetSign']);
    t = applyNightInput(t, { kind: 'buy', playerId: 'p1', itemId: 'dualBoiler' }); // 120 > 85
    expect(t.cash).toBe(85);
    expect(t.owned).toHaveLength(1);
    t = applyNightInput(t, { kind: 'buy', playerId: 'p1', itemId: 'streetSign' }); // no longer in hand
    expect(t.cash).toBe(85);
  });

  it('puts tomorrow items in activeTomorrow and resolves gambles', () => {
    const s = run();
    s.hand = ['instaGlamStory', 'mysteryRoasterSample'];
    let t = applyNightInput(s, { kind: 'buy', playerId: 'p1', itemId: 'instaGlamStory' });
    expect(t.activeTomorrow.map((o) => o.itemId)).toEqual(['instaGlamStory']);
    expect(t.owned).toHaveLength(0);
    t = applyNightInput(t, { kind: 'buy', playerId: 'p1', itemId: 'mysteryRoasterSample' });
    expect(t.owned[0].effects).toHaveLength(1);
    expect(t.owned[0].effects[0].kind).not.toBe('gamble');
  });

  it('restocks at pack prices with the supplyCost modifier', () => {
    const s = run();
    s.cash = 100;
    const t = applyNightInput(s, { kind: 'restock', playerId: 'p1', supply: 'beans', packs: 2 });
    expect(t.supplies.beans).toBe(40);
    expect(t.cash).toBe(84);
    t.owned.push({ itemId: 'bulkBeanDeal', effects: [{ kind: 'supplyCost', supply: 'beans', mul: 0.6 }] });
    expect(restockCost(t, 'beans', 1)).toBeCloseTo(4.8);
    expect(applyNightInput(t, { kind: 'restock', playerId: 'p1', supply: 'milk', packs: 100 }).cash).toBe(84); // unaffordable: no change
  });

  it('ends the night on the timer or when all connected players are ready', () => {
    let t = applyNightInput(run(), { kind: 'ready', playerId: 'p1' });
    expect(stepNight(t).phase).toBe('night');
    t = applyNightInput(t, { kind: 'ready', playerId: 'p2' });
    expect(stepNight(t).phase).toBe('day');
    const u = run();
    u.phaseTicksLeft = 1;
    expect(stepNight(u).phase).toBe('day');
    let v = run();
    v.players[1].connected = false;
    v = applyNightInput(v, { kind: 'ready', playerId: 'p1' });
    expect(stepNight(v).phase).toBe('day');
  });
});
