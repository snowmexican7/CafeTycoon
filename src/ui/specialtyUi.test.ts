import { describe, expect, it } from 'vitest';
import { nightHtml, type NightUiState } from './night';
import { hudViewModel, nightViewModel } from './viewModels';
import { createRun, startDay, startNight } from '../sim/run';
import type { DayStats, DrinkId, GameState } from '../sim/types';

const ui = (over: Partial<NightUiState> = {}): NightUiState => ({ tab: 'menu', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'promo', text: '' }, ...over } as NightUiState);

function scored(day: number, drinks: Partial<Record<DrinkId, number>>): DayStats {
  const served = Object.values(drinks).reduce((a, n) => a + (n ?? 0), 0);
  return { day, served, lost: 0, turnedAway: 0, sales: served * 4, tips: 1, rent: 10, drinks: { ...drinks } as Record<DrinkId, number> };
}

function named(): GameState {
  const s = createRun({ seed: 4, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], gear: true, tier: 'cafe' });
  s.days = [
    scored(1, { latte: 32, cappuccino: 14, espresso: 10, drip: 4, coldBrew: 4 }),
    scored(2, { latte: 32, cappuccino: 14, espresso: 10, drip: 4, coldBrew: 4 }),
  ];
  startNight(s);
  return s;
}

describe('specialty shops on screen', () => {
  it('the night menu says what the shop is known for and how orders move', () => {
    const html = nightHtml(nightViewModel(named(), 'p1'), undefined, null, ui());
    const line = html.match(/<p class="shop-line"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
    expect(line).toContain('known for lattes');
    expect(line).toContain('People walking in ask for espresso and lattes more often');
    expect(line.toLowerCase()).not.toContain('tap');
  });

  it('the day sign names the shop in big, plain words', () => {
    const s = startDay(named());
    const shop = hudViewModel(s).shop;
    expect(shop?.badge).toBe('Latte bar');
    expect(shop?.demand).toBe('People ask for espresso and lattes more often');
    expect(shop?.line.toLowerCase()).not.toContain('tap');
  });

  it('night 1, before any cups, shows neither', () => {
    const s = createRun({ seed: 4, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], gear: true });
    expect(nightViewModel(s, 'p1').shop).toBeUndefined();
    const day = startDay(s);
    expect(hudViewModel(day).shop).toBeUndefined();
  });
});
