import { describe, it, expect } from 'vitest';
import { createRun } from './run';
import { gearPullMul, noteFamilyTip, GEAR_PULL } from './gear';
import { drawDrink } from './customers';
import { computeModifiers } from './effects';
import { DRINK_IDS } from '../data/drinks';
import { familyTips, nightViewModel } from '../ui/viewModels';
import type { GameState } from './types';

const run = (gear: boolean, seed = 7) =>
  createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', ...(gear ? { gear: true } : {}) });
const withGear = (s: GameState, kind: string, gear: string) => {
  const st = s.stations.find((x) => x.kind === kind);
  if (st) (st as { gear?: string }).gear = gear;
  else s.stations.push({ ...s.stations[0], id: `${kind}-t`, kind, gear } as never);
  return s;
};

describe('Gear G7: gear pulls customers', () => {
  it('classic runs never reweight orders', () => {
    const s = run(false);
    for (const d of DRINK_IDS) expect(gearPullMul(s, d)).toBe(1);
  });

  it('adds 5% per tier above 1 to the whole family, not other families or specials', () => {
    const s = withGear(run(true), 'espresso', 'e5');
    expect(gearPullMul(s, 'espresso')).toBeCloseTo(1 + 4 * GEAR_PULL);
    expect(gearPullMul(s, 'americano')).toBeCloseTo(1 + 4 * GEAR_PULL);
    expect(gearPullMul(s, 'special')).toBe(1);
    withGear(s, 'espresso', 'e1');
    expect(gearPullMul(s, 'espresso')).toBe(1);
  });

  it('better gear shifts the order draw toward its family (same rng)', () => {
    const count = (tier: string) => {
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const s = withGear(run(true, seed), 'espresso', tier);
        const m = computeModifiers(s);
        if (drawDrink(s, ['espresso', 'latte'], m) === 'espresso') n++;
      }
      return n;
    };
    expect(count('e6')).toBeGreaterThan(count('e1'));
  });
});

describe('Gear G7: receipt tips by drink type', () => {
  it('tallies tips per family in Gear runs only', () => {
    const g = run(true);
    noteFamilyTip(g, 'latte', 1.25);
    noteFamilyTip(g, 'cappuccino', 0.5);
    noteFamilyTip(g, 'espresso', 0.4);
    noteFamilyTip(g, 'special', 3);
    noteFamilyTip(g, 'espresso', 0);
    expect(g.today.tipsByFamily).toEqual({ milky: 1.75, espresso: 0.4 });
    const c = run(false);
    noteFamilyTip(c, 'latte', 1);
    expect(c.today.tipsByFamily).toBeUndefined();
  });

  it('the receipt lists families biggest first and nothing for old days', () => {
    expect(familyTips({ day: 1, served: 0, lost: 0, turnedAway: 0, sales: 0, tips: 0, rent: 0 })).toBeUndefined();
    expect(familyTips({ day: 1, served: 0, lost: 0, turnedAway: 0, sales: 0, tips: 0, rent: 0, tipsByFamily: { espresso: 0.4, iced: 2 } }))
      .toEqual([{ label: '🧊 Iced', amount: '$2.00' }, { label: '☕ Espresso', amount: '$0.40' }]);
    const s = run(true);
    s.day = 2;
    s.days = [{ day: 1, served: 3, lost: 0, turnedAway: 0, sales: 9, tips: 2, rent: 0, tipsByFamily: { milky: 2 } }];
    expect(nightViewModel(s, 'p1').takings?.familyTips).toEqual([{ label: '🥛 Milky', amount: '$2.00' }]);
  });
});
