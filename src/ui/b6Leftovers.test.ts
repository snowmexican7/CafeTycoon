/**
 * FB2 B6 leftovers: tall tickets (covered in tickets.test), office phone card,
 * receipt office lines, addon ask (covered in chaosModel.test).
 */
import { describe, expect, it } from 'vitest';
import { TICK_RATE, secondsToTicks } from '../sim/constants';
import { createRun } from '../sim/run';
import type { GameState } from '../sim/types';
import { officePhoneHtml } from './hud';
import { hudLive, officePhoneVM } from './live';
import { nightHtml, type NightUiState } from './night';
import { closingViewModel, nightViewModel } from './viewModels';

const ui = (over: Partial<NightUiState> = {}): NightUiState => ({
  tab: 'tonight',
  spend: 'cards',
  drawer: null,
  sig: null,
  pitch: { kind: 'promo', text: '' },
  ...over,
});

function withGear(seed = 7): GameState {
  const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'Ana' }], gear: true, tier: 'cafe' });
  s.day = 3;
  s.phase = 'day';
  s.phaseTicksLeft = secondsToTicks(s.settings.dayLengthSec) - secondsToTicks(20);
  s.cash = 240;
  return s;
}

describe('FB2 B6 leftovers: office phone card', () => {
  it('officePhoneVM counts down while called and not yet arrived', () => {
    const s = withGear();
    const elapsed = secondsToTicks(s.settings.dayLengthSec) - s.phaseTicksLeft;
    s.office = { day: 3, at: elapsed + 7 * TICK_RATE, called: true };
    expect(officePhoneVM(s)).toEqual({ secsLeft: 7 });
    expect(hudLive(s, 'p1').officePhone).toEqual({ secsLeft: 7 });
    expect(officePhoneHtml({ secsLeft: 7 })).toContain('Office run · 7s');
    expect(officePhoneHtml({ secsLeft: 7 })).toContain("They're on their way");
    s.office.came = 99;
    expect(officePhoneVM(s)).toBeUndefined();
  });

  it('stays quiet before the phone rings', () => {
    const s = withGear();
    s.office = { day: 3, at: 400 };
    expect(officePhoneVM(s)).toBeUndefined();
  });
});

describe('FB2 B6 leftovers: office receipt line', () => {
  it('closing and night receipt show served / lost + extra cups', () => {
    const before = withGear();
    before.today = {
      ...before.today,
      day: 3,
      served: 28,
      sales: 140,
      tips: 22,
      rent: 40,
      office: 'served',
      officeExtra: 4,
    };
    const after = structuredClone(before);
    after.days = [{ ...before.today }];
    after.phase = 'night';
    // nightViewModel shows takings when days.length === day - 1
    after.day = 2;
    after.days[0]!.day = 1;
    const closing = closingViewModel(before, after);
    expect(closing.office).toBe('served');
    expect(closing.officeExtra).toBe(4);
    const night = nightViewModel(after, 'p1');
    expect(night.takings?.office).toBe('served');
    expect(night.takings?.officeExtra).toBe(4);
    const receipt = nightHtml(
      night,
      { day: 2, weekday: 'Tuesday', left: 1, served: 28, lost: 1, reputation: 3.4, crew: [], bought: [] },
      null,
      ui({ drawer: 'receipt' }),
    );
    expect(receipt).toContain('Office run');
    expect(receipt).toContain('served · 4 extra cups');

    after.days[0]!.office = 'lost';
    delete after.days[0]!.officeExtra;
    const lost = closingViewModel(before, after);
    expect(lost.office).toBe('lost');
    expect(lost.officeExtra).toBeUndefined();
  });
});
