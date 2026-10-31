import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { stepCustomers } from './customers';
import { stepPickup } from './pickup';
import { noteCondiments } from './condiments';
import { finishDay } from './closing';
import { enterClosing } from './step';
import { dayReviews, noteFeedMoment, weekRating } from './feed';
import { FEED } from '../data/feed';
import { ECONOMY } from '../data/economy';
import { TICK_RATE } from './constants';
import { COOLING_SECONDS } from './cooling';
import type { Customer, DayStats, GameState } from './types';

function gearDay(day = 2, seed = 7): GameState {
  const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true });
  s.day = day;
  return startDay(s);
}

const cust = (id: number, more: Partial<Customer> = {}): Customer => ({ id, drink: 'latte', patienceLeft: 900, patienceMax: 1800, stage: 'pickup', rungAt: 0, ...more });
const posts = (s: GameState) => s.log.filter((e) => e.kind === 'review.post').map((e) => e.data);

/** How many of `n` customers post for this reason (each on a fresh day so the cap and the one-post rule stay out of it). */
function rate(s: GameState, reason: Parameters<typeof noteFeedMoment>[1], n = 3000): number {
  let hits = 0;
  for (let id = 1; id <= n; id++) {
    s.today.posts = [];
    s.today.feedMoments = {};
    const before = s.log.length;
    noteFeedMoment(s, reason, cust(id), 'latte');
    if (s.log.length > before) hits += 1;
  }
  return hits / n;
}

describe('live posts (FB2 C11)', () => {
  it('a cold cup can post: review.post carries the customer, drink, a bad sentiment, a reason, stars, the tick and funny text', () => {
    const s = gearDay();
    s.tick = 1234;
    let id = 1;
    for (; id < 500; id++) {
      s.log = [];
      s.today.posts = [];
      noteFeedMoment(s, 'cold', cust(id), 'latte');
      if (posts(s).length) break;
    }
    const [p] = posts(s);
    expect(p).toMatchObject({ customer: id, drink: 'latte', sentiment: 'bad', reason: 'cold', at: 1234 });
    expect(p.stars).toBeGreaterThanOrEqual(1);
    expect(p.stars).toBeLessThanOrEqual(2);
    expect(String(p.text).length).toBeGreaterThan(8);
    expect(String(p.text)).not.toContain('{');
    expect(String(p.name).startsWith('@')).toBe(true);
    expect(s.today.posts).toHaveLength(1);
  });

  it('a real cold cup at the pickup counter posts for some customers (and review.bad still fires for all)', () => {
    let posted = 0;
    for (let id = 1; id <= 60; id++) {
      const s = gearDay();
      const c = cust(id, { patienceLeft: 900 });
      s.customers.push(c);
      s.pass.push({ item: 'latte', ticksLeft: 9999, by: 'p1', madeAt: s.tick - Math.round(COOLING_SECONDS.latte! * TICK_RATE) - 5 });
      stepPickup(s);
      expect(s.log.filter((e) => e.kind === 'review.bad')).toHaveLength(1);
      if (posts(s).length === 1) posted += 1;
    }
    expect(posted).toBeGreaterThan(5);
    expect(posted).toBeLessThan(40);
  });

  it('the chance is respected over many draws: about 35% for bad moments, about 10% for a great serve', () => {
    const s = gearDay();
    for (const reason of ['cold', 'lukewarm', 'black', 'wait', 'bump'] as const) {
      expect(rate(s, reason)).toBeGreaterThan(FEED.badChance - 0.04);
      expect(rate(s, reason)).toBeLessThan(FEED.badChance + 0.04);
    }
    expect(rate(s, 'great')).toBeGreaterThan(FEED.goodChance - 0.03);
    expect(rate(s, 'great')).toBeLessThan(FEED.goodChance + 0.03);
  });

  it('draws nothing from state.rng and repeats for the same seed, day and customer', () => {
    const a = gearDay(2, 11);
    const b = gearDay(2, 11);
    const rngBefore = a.rng;
    for (let id = 1; id <= 200; id++) {
      noteFeedMoment(a, 'cold', cust(id), 'latte');
      noteFeedMoment(b, 'cold', cust(id), 'latte');
    }
    expect(a.rng).toBe(rngBefore);
    expect(posts(a)).toEqual(posts(b));
  });

  it('counts every moment, posts at most once per customer and keeps a day cap', () => {
    const s = gearDay();
    const c = cust(5);
    for (let i = 0; i < 40; i++) noteFeedMoment(s, 'cold', c, 'latte');
    expect(s.today.feedMoments?.cold).toBe(40);
    expect(s.today.posts!.length).toBeLessThanOrEqual(1);
    s.today.posts = [];
    for (let id = 100; id < 1100; id++) noteFeedMoment(s, 'cold', cust(id), 'latte');
    expect(s.today.posts).toHaveLength(FEED.maxLive);
  });

  it('office runs never post', () => {
    const s = gearDay();
    for (let id = 1; id < 300; id++) noteFeedMoment(s, 'cold', cust(id, { order: 'office' }), 'latte');
    expect(posts(s)).toEqual([]);
  });

  it('a lukewarm cup counts a lukewarm moment (and is still paid); black coffee counts a black one', () => {
    const s = gearDay();
    const c = cust(3);
    s.customers.push(c);
    const half = Math.round(COOLING_SECONDS.latte! * TICK_RATE * 0.6);
    s.pass.push({ item: 'latte', ticksLeft: 9999, by: 'p1', madeAt: s.tick - half });
    stepPickup(s);
    expect(s.today.feedMoments).toEqual({ lukewarm: 1 });
    expect(s.today.served).toBe(1);
    noteCondiments(s, cust(4, { drink: 'drip' }), true);
    expect(s.today.feedMoments?.black).toBe(1);
  });

  it('a patience walk-out counts as a long wait', () => {
    const s = gearDay();
    for (let id = 1; id <= 40; id++) s.customers.push(cust(id, { stage: 'order', patienceLeft: 1 }));
    stepCustomers(s);
    expect(s.today.feedMoments?.wait).toBe(40);
    expect(posts(s).every((p) => p.reason === 'wait')).toBe(true);
    expect(posts(s).length).toBeGreaterThan(3);
  });
});

function dayOf(more: Partial<DayStats> = {}, day = 2): DayStats {
  return { day, served: 0, lost: 0, turnedAway: 0, sales: 0, tips: 0, rent: 0, ...more };
}

/** Close a day whose stats are `stats`, through the real closing. */
function closeWith(s: GameState, stats: Partial<DayStats>): GameState {
  Object.assign(s.today, stats);
  enterClosing(s);
  return finishDay(s);
}

describe('end of day feed (FB2 C11)', () => {
  it('closing builds three to five posts from the day and dayReviews returns them with the fans', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = gearDay(2, seed);
      const out = closeWith(s, { served: 20, sales: 80, tips: 12, perfect: 6, cups: 20, cupStars: 54, waitTicks: 20 * 30 * TICK_RATE });
      const r = dayReviews(out);
      expect(r.posts.length).toBeGreaterThanOrEqual(3);
      expect(r.posts.length).toBeLessThanOrEqual(5);
      for (const p of r.posts) {
        expect(p.stars).toBeGreaterThanOrEqual(1);
        expect(p.stars).toBeLessThanOrEqual(5);
        expect(p.text).not.toContain('{');
        expect(['good', 'bad']).toContain(p.sentiment);
      }
      expect(r.fans).toBe(out.fans);
      expect(r.fansDelta).toBe(out.days[out.days.length - 1].fansDelta);
    }
  });

  it('a good day gains fans and the posts lean good; a bad day loses fans but never below zero', () => {
    const good = closeWith(gearDay(), { served: 24, sales: 100, tips: 25, perfect: 10, cups: 24, cupStars: 70, waitTicks: 24 * 20 * TICK_RATE });
    const gr = dayReviews(good);
    expect(gr.fansDelta).toBeGreaterThan(0);
    expect(good.fans).toBe(gr.fansDelta);
    expect(gr.posts.filter((p) => p.sentiment === 'good').length).toBeGreaterThan(gr.posts.filter((p) => p.sentiment === 'bad').length);

    const bad = gearDay();
    bad.fans = 4;
    const out = closeWith(bad, { served: 2, lost: 14, feedMoments: { cold: 3, wait: 6 }, cups: 2, cupStars: 3 });
    const br = dayReviews(out);
    expect(br.fansDelta).toBeLessThan(0);
    expect(out.fans).toBe(0);
    expect(br.posts.filter((p) => p.sentiment === 'bad').length).toBeGreaterThan(br.posts.filter((p) => p.sentiment === 'good').length);
    expect(br.posts.some((p) => p.reason === 'cold' || p.reason === 'wait')).toBe(true);
  });

  it('live posts move the fans too', () => {
    const base = closeWith(gearDay(), { served: 10, sales: 40 });
    const withBad = closeWith(gearDay(), { served: 10, sales: 40, posts: [{ name: '@a', text: 'x', sentiment: 'bad', reason: 'cold', stars: 1 }] });
    expect(withBad.fans!).toBeLessThan(base.fans!);
  });

  it('an empty day still gives three posts', () => {
    const out = closeWith(gearDay(), {});
    expect(dayReviews(out).posts.length).toBeGreaterThanOrEqual(3);
  });

  it('a new run starts with 0 fans, and dayReviews on a fresh run is empty', () => {
    const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, gear: true });
    expect(s.fans).toBe(0);
    expect(dayReviews(s)).toEqual({ posts: [], fans: 0, fansDelta: 0 });
  });
});

describe('week rating (FB2 C11)', () => {
  const weekOfDays = (s: GameState, mk: (d: number) => DayStats) => {
    s.days = Array.from({ length: ECONOMY.scoredWeekDays }, (_, i) => mk(i + 1));
    s.day = ECONOMY.scoredWeekDays;
    return s;
  };

  it('three reviewers with scores from 1 to 5, and the fans', () => {
    for (const mk of [
      (d: number) => dayOf({ served: 25, sales: 100, tips: 30, perfect: 12, cups: 25, cupStars: 75 }, d),
      (d: number) => dayOf({ served: 1, lost: 30, sales: 4, cups: 1, cupStars: 0, feedMoments: { cold: 9, lukewarm: 9 } }, d),
      (d: number) => dayOf({}, d),
    ]) {
      const s = weekOfDays(gearDay(), mk);
      s.fans = 42;
      const r = weekRating(s);
      expect(r.reviewers).toHaveLength(3);
      expect(new Set(r.reviewers.map((x) => x.name)).size).toBe(3);
      for (const x of r.reviewers) {
        expect(Number.isInteger(x.score)).toBe(true);
        expect(x.score).toBeGreaterThanOrEqual(1);
        expect(x.score).toBeLessThanOrEqual(5);
      }
      expect(r.fans).toBe(42);
    }
  });

  it('a great week scores higher than a terrible one, reviewer by reviewer', () => {
    const great = weekRating(weekOfDays(gearDay(), (d) => dayOf({ served: 25, sales: 100, tips: 30, perfect: 12, cups: 25, cupStars: 75 }, d)));
    const awful = weekRating(weekOfDays(gearDay(), (d) => dayOf({ served: 3, lost: 25, sales: 10, tips: 0, cups: 3, cupStars: 3, feedMoments: { cold: 5 } }, d)));
    great.reviewers.forEach((g, i) => expect(g.score).toBeGreaterThan(awful.reviewers[i].score));
  });

  it('the week-end checkpoint emits week.rating once, and weekRating matches it', () => {
    const s = gearDay(ECONOMY.scoredWeekDays);
    s.days = Array.from({ length: ECONOMY.scoredWeekDays - 1 }, (_, i) => dayOf({ served: 10, sales: 40 }, i + 1));
    const out = closeWith(s, { served: 10, sales: 40 });
    expect(out.phase).toBe('weekEnd');
    const ev = out.log.filter((e) => e.kind === 'week.rating');
    expect(ev).toHaveLength(1);
    const r = weekRating(out);
    expect(ev[0].data.fans).toBe(r.fans);
    expect(JSON.parse(String(ev[0].data.reviewers))).toEqual(r.reviewers);
  });

  it('an ordinary day end does not emit week.rating', () => {
    const out = closeWith(gearDay(2), { served: 10 });
    expect(out.log.some((e) => e.kind === 'week.rating')).toBe(false);
  });
});

describe('great serves (FB2 C11)', () => {
  it('a fast, hot, well-tipped serve counts a great moment and can post good', async () => {
    const { serveCustomer } = await import('./customers');
    let goodPosts = 0;
    for (let id = 1; id <= 300; id++) {
      const s = gearDay();
      const c = cust(id, { stage: undefined, patienceLeft: 1800 });
      s.customers.push(c);
      serveCustomer(s, c, c.drink, 'p1', 0, false, 1);
      expect(s.today.feedMoments?.great).toBe(1);
      goodPosts += posts(s).filter((p) => p.sentiment === 'good').length;
    }
    expect(goodPosts).toBeGreaterThan(10);
    expect(goodPosts).toBeLessThan(60);
  });

  it('an off-temperature or black-coffee serve, or a slow one, is not great', async () => {
    const { serveCustomer } = await import('./customers');
    const s = gearDay();
    const c = cust(1, { patienceLeft: 1800 });
    s.customers.push(c);
    serveCustomer(s, c, c.drink, 'p1', 0, true, 1);
    const d = cust(2, { patienceLeft: 500 });
    s.customers.push(d);
    serveCustomer(s, d, d.drink, 'p1', 0, false, 1);
    expect(s.today.feedMoments?.great ?? 0).toBe(0);
  });
});
