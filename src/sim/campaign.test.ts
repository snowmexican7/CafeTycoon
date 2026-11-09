import { describe, expect, it } from 'vitest';
import { CAMPAIGN_START } from '../data/campaign';
import { GEAR, GEAR_START } from '../data/gear';
import { DRINK_IDS } from '../data/drinks';
import { checkoutOf } from './checkout';
import { campaignMorning } from './gear';
import { menuDrinks } from './unlocks';
import { availableDrinks } from './customers';
import { createRun, startDay } from './run';
import { scoreRun } from './score';
import { applyGearInput } from './gear';
import type { CreateRunOptions } from './types';

const opts = (over: Partial<CreateRunOptions> = {}): CreateRunOptions => ({
  seed: 7,
  hostId: 'p1',
  players: [{ id: 'p1', name: 'K' }],
  tier: 'cart',
  gear: true,
  ...over,
});

describe('Campaign and Blitz setup', () => {
  it('a run with no mode is still Blitz: $120, an empty bar, and the free bin', () => {
    const s = createRun(opts());
    expect(s.mode).toBeUndefined();
    expect([s.cash, s.startingCash]).toEqual([GEAR_START.cash, GEAR_START.cash]);
    expect(s.slotGear).toEqual([null, null, null, 'b0']);
    expect(s.stations.some((st) => st.kind === 'drip')).toBe(false);
    expect(menuDrinks(s)).not.toContain('drip');
  });

  it('an explicit Blitz run matches that start and stores the mode', () => {
    const s = createRun(opts({ mode: 'blitz' }));
    expect(s.mode).toBe('blitz');
    expect(s.cash).toBe(120);
    expect(s.slotGear).toEqual([null, null, null, 'b0']);
    expect(checkoutOf(s)).toEqual({ owned: ['register'], active: 'register' });
  });

  it('Campaign starts on the cart with the register, the Thrift Store pot, about $40, and drip only', () => {
    const s = createRun(opts({ mode: 'campaign' }));
    const again = createRun(opts({ mode: 'campaign' }));
    expect(JSON.stringify(again)).toBe(JSON.stringify(s));
    expect(s.mode).toBe('campaign');
    expect(s.tier).toBe('cart');
    expect(s.gear).toBe(true);
    expect([s.cash, s.startingCash]).toEqual([CAMPAIGN_START.cash, CAMPAIGN_START.cash]);
    expect(s.cash).toBeGreaterThanOrEqual(36);
    expect(s.cash).toBeLessThanOrEqual(45);
    expect(s.slotGear).toEqual([CAMPAIGN_START.pot, null, null, CAMPAIGN_START.bin]);
    expect(s.slotGear).toEqual(['d1', null, null, 'b0']);
    const pot = s.stations.find((st) => st.gear === 'd1');
    const till = s.stations.find((st) => st.id === 'counter');
    expect(pot?.kind).toBe('drip');
    expect(till).toBeTruthy();
    expect(pot!.pos.y).toBe(till!.pos.y - 1);
    expect(checkoutOf(s)).toEqual({ owned: ['register'], active: 'register' });
    expect(s.supplies).toEqual({ beans: CAMPAIGN_START.beans, milk: 0, concentrate: 0, flavour: 0, pastry: 0 });
    expect(s.supplies.beans).toBeGreaterThan(0);
    for (const d of DRINK_IDS) expect(s.menu[d]).toBe(d === 'drip');
    expect(menuDrinks(s)).toEqual(['drip']);
    expect(availableDrinks(s)).toEqual(['drip']);
    expect(s.gearLog ?? []).toEqual([]);
    expect(scoreRun(s)).toBe(0);
    expect(s.cash).toBeLessThan(GEAR.e1.price);
    expect(s.cash).toBeGreaterThanOrEqual(GEAR.d1.price);
    const broke = applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear: 'e1' });
    expect(broke.cash).toBe(CAMPAIGN_START.cash);
    expect(broke.slotGear).toEqual(['d1', null, null, 'b0']);
  });

  it('two people share one Campaign till and one pot', () => {
    const s = createRun(opts({
      mode: 'campaign',
      players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'Sam' }],
    }));
    expect(s.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(s.cash).toBe(CAMPAIGN_START.cash);
    expect(s.stations.filter((st) => st.gear === 'd1')).toHaveLength(1);
  });

  it('day 1 morning says the pot is on the cart; a later morning does not', () => {
    const s = startDay(createRun(opts({ mode: 'campaign' })));
    expect(s.phase).toBe('day');
    expect(s.morningNotes[0]).toBe(campaignMorning(s));
    expect(s.morningNotes[0]).toMatch(/Thrift Store pot/);
    expect(s.morningNotes[0]).not.toMatch(/\btap\b/i);
    s.day = 2;
    expect(campaignMorning(s)).toBeNull();
    expect(campaignMorning(createRun(opts({ mode: 'blitz' })))).toBeNull();
  });
});
