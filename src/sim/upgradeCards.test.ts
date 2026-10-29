import { describe, it, expect } from 'vitest';
import { CATALOGUE, catalogueById } from '../data/catalogue';
import { CARD_SETS, FULL_SET } from '../data/cardSets';
import { ECONOMY } from '../data/economy';
import { activeSets, computeModifiers, fullSets } from './effects';
import { fittingsValue, scoreRun } from './score';
import { drawEvents, scheduleEvents } from './events';
import { applyNightInput, dealHand, rerollCost } from './night';
import { createRun, startDay, startNight } from './run';
import { finishDay } from './closing';
import { isDownside, splitEffects } from './describe';
import { TEMP_ID, isBotId, resetBotsForNight } from './bots/roster';
import { migrateSnapshot } from '../storage/snapshotStore';
import { nightViewModel, forecastViewModel } from '../ui/viewModels';
import type { CardSetId, GameState } from './types';

const solo = (seed = 4, bots: number | 'auto' = 0) =>
  createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots, dayLengthSec: 600 } });
const own = (s: GameState, ...ids: string[]) => {
  for (const id of ids) s.owned.push({ itemId: id, effects: catalogueById[id].effects });
  return s;
};

describe('upgrade cards: the catalogue', () => {
  it('has 40+ cards with unique ids, a path each, and every path and rarity represented', () => {
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CATALOGUE.map((c) => c.id)).size).toBe(CATALOGUE.length);
    for (const path of ['speed', 'quality', 'reach'] as const) expect(CATALOGUE.filter((c) => c.path === path).length).toBeGreaterThanOrEqual(10);
    for (const r of ['common', 'uncommon', 'rare'] as const) expect(CATALOGUE.some((c) => c.rarity === r)).toBe(true);
  });

  it('every spicy card has a real downside and a real upside', () => {
    const spicy = CATALOGUE.filter((c) => c.spicy);
    expect(spicy.length).toBeGreaterThanOrEqual(5);
    for (const c of spicy) {
      const { ups, downs } = splitEffects(c.effects);
      expect(downs, c.id).not.toBe('');
      expect(ups, c.id).not.toBe('');
    }
    expect(splitEffects(catalogueById.cheapBeans.effects)).toEqual({ ups: 'beans 50% cheaper', downs: '−0.10★ rating a day, tips -3%' });
  });

  it('every set has at least two permanent cards, and only permanent cards carry a set', () => {
    for (const id of Object.keys(CARD_SETS) as CardSetId[]) {
      expect(CATALOGUE.filter((c) => c.set === id && c.duration === 'permanent').length, id).toBeGreaterThanOrEqual(2);
    }
    expect(CATALOGUE.filter((c) => c.set && c.duration !== 'permanent')).toEqual([]);
  });

  it('cheap beans and single-origin rule each other out', () => {
    const s = own(solo(), 'cheapBeans');
    s.hand = ['singleOrigin'];
    dealHand(s);
    expect(s.hand).not.toContain('singleOrigin');
  });

  it('marks downsides by direction', () => {
    expect(isDownside({ kind: 'traffic', mul: 0.9 })).toBe(true);
    expect(isDownside({ kind: 'supplyCost', supply: 'beans', mul: 1.3 })).toBe(true);
    expect(isDownside({ kind: 'supplyCost', supply: 'beans', mul: 0.5 })).toBe(false);
    expect(isDownside({ kind: 'quality', add: 0.1 })).toBe(false);
  });
});

describe('upgrade cards: set bonuses', () => {
  it('switch on at two cards of a set, not one', () => {
    const s = own(solo(), 'milkJugs');
    const one = computeModifiers(s).stationSpeed.steamer;
    expect(activeSets(s)).toEqual([]);
    own(s, 'autoSteamPitcher');
    expect(activeSets(s)).toEqual(['milkLab']);
    const two = computeModifiers(s);
    const pitcher = catalogueById.autoSteamPitcher.effects.find((e) => e.kind === 'stationSpeed');
    expect(two.stationSpeed.steamer).toBeCloseTo(one * (pitcher as { mul: number }).mul * 1.15); // the card, then the set's ×1.15
    expect(two.supplyCost.milk).toBeCloseTo(0.9);
  });

  it('show on the card: progress, a "completes" nudge, and the bonus once on', () => {
    const s = own(solo(), 'tamperStation');
    s.hand = ['shotTimer', 'neonSign'];
    const vm = nightViewModel(s, 'p1');
    expect(vm.hand[0].set).toMatchObject({ name: 'Espresso bar', have: 1, need: 2, completes: true, active: false });
    expect(vm.hand[0].set!.bonus).toContain('espresso machine +10% faster');
    expect(vm.hand[1].set).toMatchObject({ name: 'Kerb appeal', have: 0, completes: false });
    own(s, 'shotTimer');
    s.hand = ['dualBoiler'];
    const after = nightViewModel(s, 'p1');
    expect(after.hand[0].set).toMatchObject({ active: true, completes: false });
    expect(after.sets).toEqual(['Espresso bar']);
  });

  it('craft adds rating at closing, cheap beans takes it away', () => {
    const closeWith = (...ids: string[]) => {
      const s = startDay(own(solo(), ...ids));
      s.today.served = 10; // a good day: +delta
      finishDay(s);
      return s.reputation;
    };
    const base = closeWith();
    expect(closeWith('singleOrigin', 'latteArtClass')).toBeCloseTo(base + 0.05 + 0.1); // card + craft set
    expect(closeWith('cheapBeans')).toBeCloseTo(base - 0.1);
  });
});

describe('upgrade cards: the deal and re-roll', () => {
  it('deals 3–4 cards, re-rolls for a rising price, never repeats the hand, and is deterministic', () => {
    const play = () => {
      const s = solo(9);
      s.cash = 500;
      const hands = [[...s.hand]];
      const cash = [s.cash];
      for (let i = 0; i < 3; i++) {
        applyNightInput(s, { kind: 'reroll', playerId: 'p1' });
        hands.push([...s.hand]);
        cash.push(s.cash);
      }
      return { hands, cash, s };
    };
    const a = play();
    expect(a.hands[0].length).toBe(ECONOMY.handSize);
    expect(ECONOMY.handSize).toBeGreaterThanOrEqual(3);
    expect(ECONOMY.handSize).toBeLessThanOrEqual(4);
    expect(a.cash).toEqual([500, 495, 485, 470]);
    for (let i = 1; i < a.hands.length; i++) for (const id of a.hands[i]) expect(a.hands[i - 1]).not.toContain(id);
    expect(play().hands).toEqual(a.hands);
    expect(rerollCost(a.s)).toBe(20);
    startNight(a.s);
    expect(rerollCost(a.s)).toBe(5); // the price resets each night
  });

  it('is refused when the till is short, and outside the night', () => {
    const s = solo();
    s.cash = 4;
    const hand = [...s.hand];
    applyNightInput(s, { kind: 'reroll', playerId: 'p1' });
    expect(s.hand).toEqual(hand);
    expect(s.cash).toBe(4);
    const d = startDay(solo());
    const cash = d.cash;
    applyNightInput(d, { kind: 'reroll', playerId: 'p1' });
    expect(d.cash).toBe(cash);
  });

  it('shows the re-roll price on the night board', () => {
    const s = solo();
    expect(nightViewModel(s, 'p1').reroll).toEqual({ cost: '$5.00', affordable: true, count: 0 });
  });
});

describe('upgrade cards: the weather radio', () => {
  /** A run on the night before day 3, with or without the radio pre-rolling. */
  const night3 = (radio: boolean) => {
    const s = solo(11);
    s.day = 3;
    if (radio) own(s, 'weatherRadio');
    return startNight(s);
  };

  it('hears exactly the events the day would have drawn', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const mk = (radio: boolean) => {
        const s = solo(seed);
        s.day = 3;
        // Same deck either way (an owned card leaves the deal), so only the radio's timing differs.
        if (radio) own(s, 'weatherRadio');
        else s.owned.push({ itemId: 'weatherRadio', effects: [] });
        return startDay(startNight(s));
      };
      const a = mk(false);
      const b = mk(true);
      expect(b.eventSchedule).toEqual(a.eventSchedule);
      expect(b.radio).toBeUndefined();
    }
  });

  it('puts tomorrow on the paper at night', () => {
    const s = night3(true);
    expect(s.radio?.day).toBe(3);
    const radio = forecastViewModel(s).radio!;
    expect(radio).toBeTruthy();
    expect(forecastViewModel(night3(false)).radio).toBeUndefined();
    // the day brings exactly what the radio said
    const heard = s.radio!.events.map((e) => e.kind);
    const day = startDay(s);
    expect([...day.eventSchedule].map((e) => e.kind).sort()).toEqual([...heard].sort());
  });

  it('tunes in the moment it is bought, and a quiet day says so', () => {
    const s = solo(11);
    s.day = 3;
    startNight(s);
    s.hand = ['weatherRadio'];
    s.cash = 100;
    applyNightInput(s, { kind: 'buy', playerId: 'p1', itemId: 'weatherRadio' });
    expect(s.radio?.day).toBe(3);
    s.radio = { day: 3, events: [] };
    expect(forecastViewModel(s).radio).toMatch(/no surprises|no events/i);
    s.radio = { day: 3, events: [{ kind: 'rushHour', offset: 30000 }] }; // 600 s day = 36000 ticks
    expect(forecastViewModel(s).radio).toBe('rush hour in the afternoon');
  });

  it('a stale report (another day) is ignored', () => {
    const s = solo(5);
    s.day = 4;
    s.radio = { day: 2, events: [{ kind: 'healthInspector', offset: 10 }] };
    const expected = drawEvents(structuredClone(s));
    scheduleEvents(s);
    expect(s.eventSchedule.map((e) => e.kind)).toEqual(expected.map((e) => e.kind));
  });
});

describe('upgrade cards: the temp barista', () => {
  const hired = (bots: number | 'auto') => {
    const s = solo(3, bots);
    s.activeTomorrow.push({ itemId: 'hireTemp', effects: catalogueById.hireTemp.effects });
    return startDay(s);
  };

  it('clocks in for the day as a rookie bot when a spot is free, and leaves at closing', () => {
    const s = hired('auto');
    const temp = s.players.find((p) => p.id === TEMP_ID)!;
    expect(temp).toBeDefined();
    expect(temp.bot?.personality).toBe('rookie');
    expect(s.players.length).toBe(4);
    expect(isBotId(TEMP_ID)).toBe(true);
    resetBotsForNight(s);
    expect(s.players.some((p) => p.id === TEMP_ID)).toBe(false);
  });

  it('does not take a fourth spot that is already filled, and is gone after finishDay', () => {
    const s = createRun({ seed: 3, hostId: 'p1', players: ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, name: id })), settings: { bots: 0, dayLengthSec: 600 } });
    s.activeTomorrow.push({ itemId: 'hireTemp', effects: catalogueById.hireTemp.effects });
    expect(startDay(s).players.some((p) => p.id === TEMP_ID)).toBe(false);
    const t = hired(0);
    expect(t.players.some((p) => p.id === TEMP_ID)).toBe(true);
    finishDay(t);
    expect(t.players.some((p) => p.id === TEMP_ID)).toBe(false);
  });

  it('a person cannot join as the temp', () => {
    expect(isBotId('temp-1')).toBe(true);
  });
});

describe('upgrade cards: saves', () => {
  it('migrates a v5 save (no re-roll count) to v6', () => {
    const s = solo() as GameState & { rerolls?: number };
    delete s.rerolls;
    const m = migrateSnapshot(5, s)!;
    expect(m.rerolls).toBe(0);
  });
});

describe('upgrade cards: B11 balance', () => {
  it('every set has at least three cards and a third-card bonus on top of the pair', () => {
    for (const set of Object.values(CARD_SETS)) {
      expect(CATALOGUE.filter((c) => c.set === set.id).length, set.id).toBeGreaterThanOrEqual(FULL_SET);
      expect(set.tier3.length, set.id).toBeGreaterThan(0);
    }
    const ids = CATALOGUE.filter((c) => c.set === 'espressoBar').map((c) => c.id);
    const two = own(solo(), ...ids.slice(0, 2));
    const three = own(solo(), ...ids.slice(0, 3));
    expect(fullSets(two)).toEqual([]);
    expect(fullSets(three)).toEqual(['espressoBar']);
    const third = catalogueById[ids[2]];
    const solo3 = own(solo(), ids[2]);
    const alone = computeModifiers(solo3).stationSpeed.espresso / computeModifiers(solo()).stationSpeed.espresso;
    expect(computeModifiers(three).stationSpeed.espresso / computeModifiers(two).stationSpeed.espresso).toBeCloseTo(alone * 1.08, 5);
    expect(third).toBeDefined();
  });

  it('scores permanent fittings at half price, not tomorrow-only cards', () => {
    const s = solo();
    const perm = CATALOGUE.find((c) => c.duration === 'permanent' && c.cost > 0)!;
    const temp = CATALOGUE.find((c) => c.duration !== 'permanent' && c.cost > 0)!;
    own(s, perm.id, temp.id);
    expect(fittingsValue(s)).toBe(perm.cost * ECONOMY.fittingsResale);
    s.cash = s.startingCash - 10;
    expect(scoreRun(s)).toBeCloseTo(-10 + perm.cost * ECONOMY.fittingsResale);
  });

  it('the hire-a-temp card costs $30 (B6 note)', () => {
    expect(CATALOGUE.find((c) => c.effects.some((e) => e.kind === 'temp'))!.cost).toBe(30);
  });

  it('lets the host re-roll even when it is not seated, but not a stranger', () => {
    const s = startNight(createRun({ seed: 4, hostId: 'tester', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 } }));
    s.cash = 500;
    applyNightInput(s, { kind: 'reroll', playerId: 'stranger' });
    expect(s.rerolls ?? 0).toBe(0);
    applyNightInput(s, { kind: 'reroll', playerId: 'tester' });
    expect(s.rerolls).toBe(1);
  });
});
