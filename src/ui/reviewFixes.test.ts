/**
 * Review Block 6: morning-note dismiss, soft open, rough/strategist marks, hire card placement,
 * hireWages / priceWalkouts receipt lines, friendlier tip chip.
 */
import { describe, expect, it } from 'vitest';
import { GEAR, type GearId } from '../data/gear';
import { LAYOUT } from '../data/layout';
import { chaosBursts } from '../render/chaosModel';
import { botTag } from '../render/crewModel';
import { createRun, startNight } from '../sim/run';
import { stationsFromSlots } from '../sim/slots';
import type { GameState } from '../sim/types';
import { handHint } from './live';
import { nightHtml, type NightUiState } from './night';
import { closingViewModel, menuLines, nightViewModel } from './viewModels';
import { strategistSetLine } from './logToasts';
import { NOTE_DISMISS_MS } from './hud';

const ui = (over: Partial<NightUiState> = {}): NightUiState => ({
  tab: 'tonight', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'promo', text: '' }, ...over,
});

function withGear(ids: GearId[], seed = 3): GameState {
  const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, gear: true, tier: 'stand' });
  const slots = [...s.slots!];
  const slotGear = [...s.slotGear!];
  ids.forEach((id, i) => {
    slots[i] = GEAR[id].station;
    slotGear[i] = id;
  });
  s.slots = slots;
  s.slotGear = slotGear;
  s.stations = stationsFromSlots(s.tier, slots, slotGear);
  s.cash = 240;
  s.day = 4;
  return s;
}

describe('Review Block 6: morning note + idle hints + tags', () => {
  it('exports an 8s morning-note dismiss window', () => {
    expect(NOTE_DISMISS_MS).toBe(8000);
  });

  it('bot tags drop the debug "· bot" suffix', () => {
    expect(botTag('Bo')).toBe('Bo');
  });

  it('busy machines and missing cups get specific idle copy', () => {
    const s = withGear(['e2', 'g1']);
    s.phase = 'day';
    const espresso = s.stations.find((x) => x.kind === 'espresso')!;
    espresso.busyTicksLeft = 90;
    s.players[0]!.pos = { ...espresso.pos };
    s.players[0]!.holding = null;
    expect(handHint(s, 'p1')).toMatchObject({ go: false, title: 'Machine is busy' });
    espresso.busyTicksLeft = 0;
    espresso.output = null;
    expect(handHint(s, 'p1').title).toBe('Needs grounds first');
  });

  it('crew tip chips say Try it, not Do it', () => {
    const s = withGear(['e1', 'c1', 'd1']);
    s.days.push({ ...s.today, day: 3, served: 20, sales: 80, tips: 10, rent: 25 });
    s.day = 4;
    const html = nightHtml(nightViewModel(startNight(s), 'p1'), undefined, null, ui());
    if (html.includes('tip-go')) expect(html).toContain('Try it');
    expect(html).not.toContain('>Do it<');
  });
});

describe('Review Block 6: hires leftovers', () => {
  it('Rough guess only when the forecast is rough; Strategist marks when hired', () => {
    const rough = withGear(['e2', 'g1', 'c1']);
    // Turn drinks on so the forecast has lines.
    for (const d of ['espresso', 'latte', 'coldBrew'] as const) rough.menu[d] = true;
    rough.supplies.beans = 40;
    rough.supplies.milk = 40;
    rough.supplies.concentrate = 20;
    rough.days.push({ ...rough.today });
    const roughNight = startNight(rough);
    const roughLines = menuLines(roughNight);
    expect(roughLines.some((l) => l.on && l.rough)).toBe(true);
    expect(nightHtml(nightViewModel(roughNight, 'p1'), undefined, null, ui({ tab: 'menu' }))).toContain('mn-guess');

    const hired = withGear(['e2', 'g1', 'c1'], 5);
    hired.staff = { strategist: true };
    for (const d of ['espresso', 'latte', 'coldBrew'] as const) hired.menu[d] = true;
    hired.supplies.beans = 40;
    hired.supplies.milk = 40;
    hired.supplies.concentrate = 20;
    hired.days.push({ ...hired.today });
    const hiredNight = startNight(hired);
    const lines = menuLines(hiredNight);
    expect(lines.every((l) => !l.rough)).toBe(true);
    expect(lines.some((l) => l.on && l.setByStrategist)).toBe(true);
    const html = nightHtml(nightViewModel(hiredNight, 'p1'), undefined, null, ui({ tab: 'menu' }));
    expect(html).toContain('Set by Strategist');
    expect(html).not.toContain('mn-guess');
  });

  it('hire cards sit in hire-row (high on Tonight), not buried only in tn-more', () => {
    const s = withGear(['e1']);
    s.staff = { strategist: true };
    const html = nightHtml(nightViewModel(s, 'p1'), undefined, null, ui());
    expect(html).toContain('hire-row');
    expect(html).toContain('data-role="strategist"');
    expect(html).toContain('data-role="marketer"');
    const more = html.split('tn-more')[1] ?? '';
    expect(more).not.toContain('data-hire="strategist"');
  });

  it('receipt shows hireWages and priceWalkouts lines', () => {
    const before = withGear(['e1']);
    before.day = 2;
    before.today = {
      ...before.today,
      day: 1,
      served: 30,
      sales: 120,
      tips: 15,
      rent: 25,
      wages: 6,
      hireWages: 3,
      priceWalkouts: 4,
    };
    const after = structuredClone(before);
    // nightViewModel shows takings when days.length === day - 1
    after.days = [{ ...before.today }];
    after.phase = 'night';
    after.day = 2;
    const closing = closingViewModel(before, after);
    expect(closing.hireWages).toBe('$3.00');
    expect(closing.priceWalkouts).toBe(4);
    const night = nightViewModel(after, 'p1');
    expect(night.takings?.hireWages).toBe('$3.00');
    expect(night.takings?.priceWalkouts).toBe(4);
    const receipt = nightHtml(night, { day: 2, weekday: 'Tuesday', left: 1, served: 30, lost: 0, reputation: 3.2, crew: [], bought: [] }, null, ui({ drawer: 'receipt' }));
    expect(receipt).toContain('Specialist wages');
    expect(receipt).toContain('Left over the price');
  });

  it('strategist.set toast names how many prices moved', () => {
    expect(strategistSetLine({ data: { changed: 3 } })).toBe('🧠 Your Strategist set 3 prices');
    expect(strategistSetLine({ data: { changed: 1 } })).toBe('🧠 Your Strategist set 1 price');
  });
});

describe('Review Block 6: soft open + price door walker', () => {
  it('NightVM.makeable is false when nothing can be poured', () => {
    const s = createRun({ seed: 9, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, gear: true });
    // First Gear night: no machines yet → no makeable drinks.
    s.slots = s.slots!.map(() => null);
    s.slotGear = s.slotGear!.map(() => null);
    s.stations = stationsFromSlots(s.tier, s.slots, s.slotGear);
    expect(nightViewModel(s, 'p1').makeable).toBe(false);
    expect(nightHtml(nightViewModel(s, 'p1'), undefined, null, ui())).toContain('Open the shop');
  });

  it('price walkouts burst at the door with door: true', () => {
    const a = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
    a.phase = 'day';
    const b = structuredClone(a);
    b.log.push({ seq: b.nextLogSeq++, tick: b.tick, kind: 'walkout', data: { reason: 'price', drink: 'latte', customer: 9 } });
    const w = chaosBursts(a, b, a.nextLogSeq - 1).bursts.filter((x) => x.kind === 'walkout');
    expect(w[0]).toMatchObject({ door: true, at: { ...LAYOUT.door } });
  });
});
