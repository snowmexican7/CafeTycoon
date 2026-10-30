import { describe, expect, it } from 'vitest';
import { playGear } from '../scripts/gearBalance';
import type { GameState } from './sim/types';

// FB2 balance pass: the scripted balance crew (scripts/gearBalance.ts) restocks by its own rule and takes the
// planner's steep advice. The planner sizes the steep from what *its* budget would restock, so on a tight night
// (the stand's first night, after the Dorm Room Cube) it said "steep 0" while the crew had just bought concentrate:
// the tap sat empty all of day 1. The crew's steep must follow the concentrate it actually bought.
describe('gearBalance crew', () => {
  it('steeps the concentrate it bought on the first night (cold brew on day 1)', () => {
    let end: GameState | null = null;
    const r = playGear(2, 100, null, 1, 0, undefined, (s) => (end = s));
    const s = end as unknown as GameState;
    expect(s.slotGear).toContain('c1');
    expect(r.drinks.coldBrew ?? 0).toBeGreaterThan(0);
  }, 60_000);
});
