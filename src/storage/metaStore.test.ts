import { describe, it, expect } from 'vitest';
import { createRun } from '../sim/run';
import { scoreRun } from '../sim/score';
import { ECONOMY } from '../data/economy';
import { GEAR_START } from '../data/gear';
import { memoryStorage } from './storageLike';
import { createMetaStore, emptyMeta, foldMeta, META_BAD_KEY, META_KEY, migrateMeta, RECORDS_KEY } from './metaStore';
import { emptyRecords } from './recordsStore';
import { freshDayStats } from '../sim/run';
import { titleViewModel } from '../ui/viewModels';
import { perkField } from '../ui/title';
import { perkRows, perksHtml } from '../ui/records';
import type { CreateRunOptions, GameState } from '../sim/types';

const opts = (extra: Partial<CreateRunOptions> = {}): CreateRunOptions => ({
  seed: 11, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { dayLengthSec: 150, nightLengthSec: 30 }, tier: 'stand', gear: true, ...extra,
});

/** A Gear run that played `days` days serving `served` a day, sitting on the week-end screen. */
function weekRun(days = 7, served = 10, patch: Partial<GameState> = {}): GameState {
  const s = createRun(opts());
  s.days = Array.from({ length: days }, (_, i) => ({ ...freshDayStats(i + 1), served }));
  s.phase = days >= 7 ? 'weekEnd' : 'night';
  return Object.assign(s, patch);
}

describe('P3 B16: head starts (sim)', () => {
  it('nest egg adds cash and moves the start line, so the score is unchanged', () => {
    const plain = createRun(opts());
    const egg = createRun(opts({ perk: 'nestEgg' }));
    expect(egg.perk).toBe('nestEgg');
    expect(egg.cash).toBe(plain.cash + 20);
    expect(egg.startingCash).toBe(GEAR_START.cash + 20);
    expect(scoreRun(egg)).toBe(scoreRun(plain));
  });
  it('pantry and word of mouth', () => {
    const p = createRun(opts({ perk: 'pantry' }));
    expect(p.supplies.beans).toBe(10);
    expect(p.supplies.milk).toBe(10);
    const w = createRun(opts({ perk: 'wordOfMouth' }));
    expect(w.reputation).toBe(3);
  });
  it('classic runs and unknown ids ignore the perk; same options give the same run', () => {
    const c = createRun(opts({ gear: false, perk: 'nestEgg' }));
    expect(c.perk).toBeUndefined();
    expect(c.cash).toBe(ECONOMY.startingCash);
    const bad = createRun(opts({ perk: 'free-money' as never }));
    expect(bad.perk).toBeUndefined();
    expect(JSON.stringify(createRun(opts({ perk: 'pantry' })))).toBe(JSON.stringify(createRun(opts({ perk: 'pantry' }))));
  });
});

describe('P3 B16: meta save (fold)', () => {
  it('a finished Gear week unlocks the nest egg once; folding twice changes nothing', () => {
    const s = weekRun();
    const a = foldMeta(emptyMeta(), s);
    expect(a.newly).toEqual(['nestEgg']);
    expect(a.meta.weeks).toBe(1);
    expect(a.meta.served).toBe(70);
    const b = foldMeta(a.meta, s);
    expect(b.newly).toEqual([]);
    expect(b.meta).toEqual(a.meta);
  });
  it('keep going then stop: only the new drinks count, the week counts once', () => {
    const s = weekRun();
    const a = foldMeta(emptyMeta(), s).meta;
    s.days.push({ ...freshDayStats(8), served: 40 });
    s.phase = 'ended';
    const b = foldMeta(a, s);
    expect(b.meta.weeks).toBe(1);
    expect(b.meta.served).toBe(110);
    expect(b.newly).toEqual(['pantry']);
  });
  it('a bankrupt week and a classic run do not count as a finished week', () => {
    expect(foldMeta(emptyMeta(), weekRun(7, 5, { bankrupt: true })).meta.weeks).toBe(0);
    const classic = weekRun();
    delete classic.gear;
    expect(foldMeta(emptyMeta(), classic).meta).toEqual(emptyMeta());
  });
  it('growing to the cart unlocks word of mouth and records discovered drinks', () => {
    const s = weekRun(3, 2, { tier: 'cart' });
    const { meta, newly } = foldMeta(emptyMeta(), s);
    expect(newly).toEqual(['wordOfMouth']);
    expect(meta.bestTier).toBe('cart');
    expect(meta.discovered.length).toBeGreaterThan(0);
  });
});

describe('P3 B16: meta save (storage and migration)', () => {
  it('nothing saved: fresh, or seeded from Gear-era records (v3.0.0 players keep credit)', () => {
    expect(migrateMeta(null).status).toBe('fresh');
    const rec = { ...emptyRecords(), bestWeek: { score: 50, seed: 1, date: 'x', crew: [], days: 7 } };
    const m = migrateMeta(null, rec);
    expect(m.status).toBe('migrated');
    expect(m.meta.unlocked).toEqual(['nestEgg']);
    // pre-split (classic-only) records do not count
    expect(migrateMeta(null, { ...rec, split: undefined }).meta.unlocked).toEqual([]);
  });
  it('corrupt saves read as fresh, keep a backup, and a new run still records', () => {
    for (const raw of ['{not json', '"text"', '[1,2]', '{"version":"x"}', 'null']) {
      const st = memoryStorage();
      st.setItem(META_KEY, raw);
      const store = createMetaStore(st);
      expect(store.get()).toEqual(raw === 'null' ? emptyMeta() : emptyMeta());
      expect(store.record(weekRun())).toEqual(['nestEgg']);
      expect(JSON.parse(st.getItem(META_KEY)!).weeks).toBe(1);
      if (raw !== 'null') expect(st.getItem(META_BAD_KEY)).toBe(raw);
    }
  });
  it('junk fields are cleaned; unlocks never go away; unknown perks dropped', () => {
    const m = migrateMeta({ version: 1, weeks: -3, served: 'lots', bestTier: 'castle', discovered: ['latte', 'unicorn'], unlocked: ['pantry', 'free-money'], lastPerk: 'free-money', counted: [null, { key: 'a', served: 5 }] });
    expect(m.status).toBe('ok');
    expect(m.meta).toMatchObject({ weeks: 0, served: 0, bestTier: 'stand', discovered: ['latte'], unlocked: ['pantry'], lastPerk: null });
    expect(m.meta.counted).toEqual([{ key: 'a', served: 5, week: false, tier: 'stand' }]);
  });
  it('a save from a newer version is read but never overwritten', () => {
    const st = memoryStorage();
    const raw = JSON.stringify({ version: 2, weeks: 4, unlocked: ['nestEgg'], somethingNew: true });
    st.setItem(META_KEY, raw);
    const store = createMetaStore(st);
    expect(store.get().unlocked).toContain('nestEgg');
    store.record(weekRun());
    store.setLastPerk('nestEgg');
    expect(st.getItem(META_KEY)).toBe(raw);
  });
  it('storage that throws never breaks reads or writes', () => {
    const boom = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => {} };
    const store = createMetaStore(boom);
    expect(store.get()).toEqual(emptyMeta());
    expect(() => store.record(weekRun())).not.toThrow();
    expect(() => store.setLastPerk(null)).not.toThrow();
  });
  it('setLastPerk only keeps unlocked perks; records seed only when nothing is saved', () => {
    const st = memoryStorage();
    st.setItem(RECORDS_KEY, JSON.stringify({ ...emptyRecords(), bestWeek: { score: 9, seed: 1, date: 'x', crew: [], days: 7 } }));
    const store = createMetaStore(st);
    store.setLastPerk('pantry');
    expect(store.get().lastPerk).toBeNull();
    store.setLastPerk('nestEgg');
    expect(store.get().lastPerk).toBe('nestEgg');
    expect(store.get().unlocked).toEqual(['nestEgg']);
  });
});

describe('P3 B16: UI', () => {
  it('the title shows a Head start picker only once something is unlocked', () => {
    expect(perkField(titleViewModel([], null, null, emptyMeta()))).toBe('');
    const html = perkField(titleViewModel([], null, null, { unlocked: ['nestEgg', 'pantry'], lastPerk: 'pantry' }));
    expect(html).toContain('name="perk"');
    expect(html).toContain('Nest egg');
    expect(html).toMatch(/value="pantry" selected/);
  });
  it('the records dialog lists every head start with progress', () => {
    const m = { ...emptyMeta(), served: 42, unlocked: ['nestEgg' as const], discovered: ['latte' as const, 'coldBrew' as const] };
    const rows = perkRows(m);
    expect(rows.map((r) => r.unlocked)).toEqual([true, false, false]);
    expect(rows[1].how).toContain('42/100');
    expect(perksHtml(rows, 2)).toContain('2 drinks discovered');
  });
});
