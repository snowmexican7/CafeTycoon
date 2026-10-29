import { describe, expect, it } from 'vitest';
import { SLOT_POSITIONS } from '../data/layout';
import { defaultSlots, stationsFromSlots } from '../sim/slots';
import { emptySlotPositions } from './slotModel';

describe('emptySlotPositions (FB1 WP5)', () => {
  it('marks exactly the null slots', () => {
    const slots = defaultSlots('cafe');
    const want = SLOT_POSITIONS.cafe.filter((_, i) => slots[i] === null);
    expect(emptySlotPositions('cafe', stationsFromSlots('cafe', slots))).toEqual(want);
  });
  it('an emptied bin slot gets a plinth; a filled slot loses it', () => {
    const slots = defaultSlots('cafe');
    const bin = slots.indexOf('trash');
    slots[bin] = null;
    const free = slots.findIndex((k, i) => k === null && i !== bin);
    if (free >= 0) slots[free] = 'espresso';
    const empty = emptySlotPositions('cafe', stationsFromSlots('cafe', slots));
    expect(empty).toContainEqual(SLOT_POSITIONS.cafe[bin]);
    if (free >= 0) expect(empty).not.toContainEqual(SLOT_POSITIONS.cafe[free]);
  });
});
