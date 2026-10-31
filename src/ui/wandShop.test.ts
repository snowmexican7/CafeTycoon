import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import { stationsFromSlots } from '../sim/slots';
import { GEAR, type AddOnWand, type GearId } from '../data/gear';
import { gearVM } from './gearVM';
import { gearBoard } from './night';

const run = () => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'cafe', gear: true });
function withGear(ids: GearId[], wands: (AddOnWand | null)[] = []) {
  const s = run();
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  const slotWand = Array.from({ length: slots.length }, (_, i) => wands[i] ?? null);
  ids.forEach((id, i) => { slots[i] = GEAR[id].station; slotGear[i] = id; });
  s.slots = slots; s.slotGear = slotGear; s.slotWand = slotWand;
  s.stations = stationsFromSlots(s.tier, slots, slotGear, slotWand);
  s.day = 3;
  return s;
}

describe('ui-3.5.1 (FB2 C9): steam wands in the Gear shop', () => {
  it('a Sylvia with no wand gets an "Add it" card and a plain note', () => {
    const s = withGear(['e3', 'g1']);
    s.cash = 500;
    const g = gearVM(s, 'p1');
    expect(g.wands.map((w) => w.wand)).toEqual(['weak']);
    expect(g.wandNote).toMatch(/No steam wand yet/);
    const h = gearBoard(g);
    expect(h).toMatch(/data-action="wand-buy" data-station="[^"]+" data-wand="weak"/);
    expect(h).toContain('Add it · $30');
  });
  it('the slot names the wand once fitted, and the note goes away', () => {
    const s = withGear(['e3', 'g1'], ['weak']);
    const g = gearVM(s, 'p1');
    expect(g.slots[0]!.wand).toBe('Little steam wand');
    expect(g.wandNote).toBeNull();
    expect(gearBoard(g)).toContain('🥛 Little steam wand');
  });
  it('E1 says no wand is possible; E5 has one built in', () => {
    expect(gearVM(withGear(['e1']), 'p1').wandNote).toMatch(/Sylvia the Prosumer or better/);
    const g = gearVM(withGear(['e5', 'g1']), 'p1');
    expect(g.slots[0]!.wand).toBe('Built-in steam wand');
    expect(g.wands).toEqual([]);
  });
  it('the Sylvia buy card offers "with a little wand", priced with the machine', () => {
    const s = withGear(['e2', 'g1']);
    s.cash = 1000;
    const e3 = gearVM(s, 'p1').trees.find((t) => t.id === 'espresso')!.tiers.find((t) => t.id === 'e3')!;
    expect(e3.wandBuys).toEqual([{ wand: 'weak', name: 'Little steam wand', price: e3.net + 25, ok: true }]);
    expect(gearBoard(gearVM(s, 'p1'))).toMatch(/data-gear="e3" data-wand="weak"/);
  });
  it('buttons are off when the cash is short', () => {
    const s = withGear(['e3', 'g1']);
    s.cash = 5;
    expect(gearVM(s, 'p1').wands[0]!.ok).toBe(false);
    expect(gearBoard(gearVM(s, 'p1'))).toContain('Need $30');
  });
});

describe('ui-3.5.1 (FB2 C9): a clogged wand on the day HUD', () => {
  it('shows a "clogged" line only while the wand is jammed', async () => {
    const { hudGearVM } = await import('./gearVM');
    const s = withGear(['e3', 'g1'], ['weak']);
    expect(hudGearVM(s).some((r) => r.label === 'Steam wand')).toBe(false);
    s.stations.find((x) => x.twin && x.wand)!.jammed = true;
    expect(hudGearVM(s).find((r) => r.label === 'Steam wand')).toMatchObject({ status: 'clogged! (E)', warn: true });
  });
});
