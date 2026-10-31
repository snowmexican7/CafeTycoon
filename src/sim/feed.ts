/**
 * FB2 C11: the social feed. Light and data-only: the UI draws it.
 *
 *  - Live posts (`noteFeedMoment`): after a bad moment (a cold or lukewarm cup, black coffee, a walk-out after a long
 *    wait, a bump walk-out) there is a `FEED.badChance` of a `review.post`; after a great serve a `FEED.goodChance`.
 *  - End of day (`closeDayFeed`, from `finishDay`): three to five posts built from the day's stats, and the fans move by
 *    the day's net sentiment. `dayReviews(state)` reads them back.
 *  - Week end: `weekRating(state)` has three silly reviewers score the week 1..5; `finishDay` logs `week.rating`.
 *
 * Randomness: none from `state.rng`. Every roll is a hash of the run seed, the day, the customer and a salt, so adding
 * this changes no other roll in the sim. No imports from customers/pickup (they call in here).
 */
import { DRINK_INFO } from '../data/drinks';
import { ECONOMY } from '../data/economy';
import { FEED, FEED_TEXT, HANDLES, REVIEWERS } from '../data/feed';
import { TICK_RATE } from './constants';
import { ACCURACY } from './accuracy';
import { emitLog } from './log';
import type { Customer, DayStats, DrinkId, FeedPost, FeedReason, FeedSentiment, GameState } from './types';

const REASONS: FeedReason[] = ['cold', 'lukewarm', 'black', 'wait', 'bump', 'great', 'service', 'crowd', 'quiet', 'speed', 'quality', 'tips'];
const BAD_MOMENTS: FeedReason[] = ['cold', 'lukewarm', 'black', 'wait', 'bump'];

/** A float in [0, 1) from the given integers (an FNV-style mix): the same parts always give the same number. */
export function hashUnit(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const pick = <T>(list: readonly T[], u: number): T => list[Math.min(list.length - 1, Math.floor(u * list.length))];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A post's text: a template for the reason and sentiment, `{drink}` filled in. */
function textFor(reason: FeedReason, sentiment: FeedSentiment, drink: string, u: number, shift = 0): string {
  const list = FEED_TEXT[reason][sentiment] ?? FEED_TEXT[reason][sentiment === 'good' ? 'bad' : 'good'] ?? [''];
  const i = (Math.min(list.length - 1, Math.floor(u * list.length)) + shift) % list.length;
  return list[i].replace(/\{drink\}/g, drink);
}

const drinkWord = (drink: DrinkId | undefined) => (drink ? DRINK_INFO[drink].name.toLowerCase() : 'coffee');

/**
 * A bad or great moment with `c` (a cold or lukewarm cup, black coffee, a walk-out, a great serve). Counts it in
 * `today.feedMoments` and, by the hashed chance, makes a live post: `review.post { customer, drink, sentiment,
 * reason, stars, at (the tick), name, text }`. One post per customer, `FEED.maxLive` per day, never for an office run.
 */
export function noteFeedMoment(state: GameState, reason: FeedReason, c: Customer, drink: DrinkId): void {
  if (c.order === 'office') return;
  const today = state.today;
  const moments = (today.feedMoments ??= {});
  moments[reason] = (moments[reason] ?? 0) + 1;
  const live = (today.posts ??= []);
  if (live.length >= FEED.maxLive || live.some((p) => p.customer === c.id)) return;
  const sentiment: FeedSentiment = reason === 'great' ? 'good' : 'bad';
  const salt = REASONS.indexOf(reason) + 1;
  const roll = (n: number) => hashUnit(state.seed, state.day, c.id, salt, n);
  if (roll(1) >= (sentiment === 'good' ? FEED.goodChance : FEED.badChance)) return;
  const stars = sentiment === 'good' ? (roll(2) < 0.7 ? 5 : 4) : reason === 'lukewarm' || reason === 'black' ? 2 : 1;
  const post: FeedPost = {
    name: pick(HANDLES, roll(3)),
    text: textFor(reason, sentiment, drinkWord(drink), roll(4)),
    sentiment,
    reason,
    stars,
    drink,
    customer: c.id,
    at: state.tick,
  };
  live.push(post);
  emitLog(state, 'review.post', { customer: c.id, drink, sentiment, reason, stars, at: state.tick, name: post.name, text: post.text });
}

/** A great serve (fast, hot, well tipped)? `perfect` is the patience-left test; `tempMiss` an off or lukewarm cup. */
export function isGreatServe(perfect: boolean, tempMiss: boolean, tipMul: number, tip: number, price: number): boolean {
  return perfect && !tempMiss && tipMul === 1 && price > 0 && tip >= price * FEED.greatTipRate;
}

interface Candidate { reason: FeedReason; sentiment: FeedSentiment; weight: number }

/** What the day's stats give a post about, each with a weight (how much there is to say). */
function candidates(s: DayStats): Candidate[] {
  const out: Candidate[] = [];
  const m = s.feedMoments ?? {};
  const total = s.served + s.lost;
  const D = FEED.day;
  if (total > 0) {
    const share = s.lost / total;
    out.push({ reason: 'service', sentiment: share <= D.lostMid ? 'good' : 'bad', weight: 1 + Math.abs(share - D.lostMid) * 10 });
  }
  if (s.served >= D.busy) out.push({ reason: 'crowd', sentiment: 'good', weight: 1 + (s.served - D.busy) / D.busy });
  else out.push({ reason: 'quiet', sentiment: 'bad', weight: 1 + (D.busy - s.served) / D.busy });
  if (s.served > 0 && s.waitTicks !== undefined) {
    const wait = s.waitTicks / s.served / TICK_RATE;
    out.push({ reason: 'speed', sentiment: wait <= D.waitMidSeconds ? 'good' : 'bad', weight: 1 + (Math.abs(wait - D.waitMidSeconds) / D.waitMidSeconds) * 3 });
  }
  if ((s.cups ?? 0) > 0) {
    const stars = (s.cupStars ?? 0) / s.cups!;
    out.push({ reason: 'quality', sentiment: stars >= D.starsMid ? 'good' : 'bad', weight: 1 + Math.abs(stars - D.starsMid) * 2 });
  }
  if (s.sales > 0 && s.tips / s.sales >= D.tipsGood) out.push({ reason: 'tips', sentiment: 'good', weight: 1 + (s.tips / s.sales) * 5 });
  for (const r of BAD_MOMENTS) if ((m[r] ?? 0) > 0) out.push({ reason: r, sentiment: 'bad', weight: 2 + (m[r] ?? 0) * 1.5 });
  if ((m.great ?? 0) > 0) out.push({ reason: 'great', sentiment: 'good', weight: 2 + (m.great ?? 0) });
  return out;
}

/** The day's drink most served (any, when nothing was). Ties go to the menu order. */
function topDrink(s: DayStats): DrinkId | undefined {
  let best: DrinkId | undefined;
  let n = 0;
  for (const [d, k] of Object.entries(s.drinks ?? {}) as [DrinkId, number][]) if (k > n) { best = d; n = k; }
  return best;
}

/** Three to five posts summarising the day, from its stats. Pure: the same stats, seed and day give the same posts. */
export function buildDayFeed(state: Pick<GameState, 'seed'>, s: DayStats): FeedPost[] {
  const roll = (n: number, i = 0) => hashUnit(state.seed, s.day, 9000 + n, i);
  const want = FEED.dayPosts.min + Math.floor(roll(0) * (FEED.dayPosts.max - FEED.dayPosts.min + 1));
  const ranked = candidates(s)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.weight - a.c.weight || a.i - b.i)
    .map((x) => x.c)
    .slice(0, want);
  while (ranked.length < FEED.dayPosts.min) ranked.push({ reason: 'quiet', sentiment: 'bad', weight: 0 });
  const drink = drinkWord(topDrink(s));
  return ranked.map((c, i) => ({
    name: pick(HANDLES, roll(1, i)),
    text: textFor(c.reason, c.sentiment, drink, roll(2, i), c.weight === 0 ? i : 0),
    sentiment: c.sentiment,
    reason: c.reason,
    stars: c.sentiment === 'good' ? (roll(3, i) < 0.6 ? 5 : 4) : roll(3, i) < 0.6 ? 1 : 2,
  }));
}

/** How many fans the day earns (negative = loses), from its stats and live posts. */
export function fansDeltaFor(s: DayStats): number {
  const F = FEED.fans;
  const m = s.feedMoments ?? {};
  const bad = BAD_MOMENTS.reduce((n, r) => n + (m[r] ?? 0), 0);
  const live = s.posts ?? [];
  const good = live.filter((p) => p.sentiment === 'good').length;
  const net = s.served * F.perServed + (s.perfect ?? 0) * F.perPerfect - s.lost * F.perLost - bad * F.perBadMoment + (good - (live.length - good)) * F.perPost;
  return clamp(Math.round(net), F.minDelta, F.maxDelta);
}

/** Closing (before the day is filed): build the day's feed and move the fans (never below 0). */
export function closeDayFeed(state: GameState): void {
  const today = state.today;
  const before = state.fans ?? 0;
  const fans = Math.max(0, before + fansDeltaFor(today));
  state.fans = fans;
  today.feed = buildDayFeed(state, today);
  today.fansDelta = fans - before;
  today.fansAfter = fans;
}

/** The night view: the last finished day's posts, the fans now and how many they moved. Empty before the first day ends. */
export function dayReviews(state: GameState): { posts: FeedPost[]; fans: number; fansDelta: number } {
  const last = state.days[state.days.length - 1];
  return { posts: last?.feed ?? [], fans: state.fans ?? 0, fansDelta: last?.fansDelta ?? 0 };
}

/** The days of the week that just ended (the last `scoredWeekDays` filed days of the same week as the last one). */
function weekDays(state: GameState): DayStats[] {
  const last = state.days[state.days.length - 1];
  if (!last) return [];
  const per = ECONOMY.scoredWeekDays;
  const week = Math.ceil(last.day / per);
  return state.days.filter((d) => Math.ceil(d.day / per) === week);
}

/** 1..5 from a 0..1 mark. */
const score5 = (x: number) => clamp(Math.round(1 + 4 * clamp(x, 0, 1)), 1, 5);

/**
 * The week rating: three silly reviewers, one per judge (service, the cups, the vibes), each scoring the week 1..5
 * from its stats. Names are picked from `REVIEWERS` by a hash of the seed and the week. Pure.
 */
export function weekRating(state: GameState): { reviewers: { name: string; score: number }[]; fans: number } {
  const days = weekDays(state);
  const sum = (f: (d: DayStats) => number) => days.reduce((n, d) => n + f(d), 0);
  const served = sum((d) => d.served);
  const lost = sum((d) => d.lost);
  const sales = sum((d) => d.sales);
  const tips = sum((d) => d.tips);
  const perfect = sum((d) => d.perfect ?? 0);
  const cups = sum((d) => d.cups ?? 0);
  const cupStars = sum((d) => d.cupStars ?? 0);
  const offTemp = sum((d) => (d.feedMoments?.cold ?? 0) + (d.feedMoments?.lukewarm ?? 0));
  const R = FEED.rating;
  const week = days.length ? Math.ceil(days[days.length - 1].day / ECONOMY.scoredWeekDays) : 0;
  const name = (pool: readonly string[], n: number) => pick(pool, hashUnit(state.seed, week, 7000 + n));

  const lostShare = served + lost > 0 ? lost / (served + lost) : 0.25;
  const service = score5(1 - lostShare / R.lostMid);
  const stars = cups > 0 ? cupStars / cups / ACCURACY.maxStars : 0.5;
  const quality = score5(stars - (offTemp / Math.max(1, served)) * (R.coldPenalty / 4));
  const tipShare = sales > 0 ? tips / sales : 0;
  const perfectShare = served > 0 ? perfect / served : 0;
  const vibes = score5(perfectShare * 0.5 + Math.min(1, tipShare / R.tipsFull) * 0.5);
  return {
    reviewers: [
      { name: name(REVIEWERS.service, 1), score: service },
      { name: name(REVIEWERS.quality, 2), score: quality },
      { name: name(REVIEWERS.vibes, 3), score: vibes },
    ],
    fans: state.fans ?? 0,
  };
}

/** The week-end checkpoint: log the rating (`reviewers` is a JSON string of `{ name, score }[]`: log data is flat). */
export function logWeekRating(state: GameState): void {
  const r = weekRating(state);
  emitLog(state, 'week.rating', { reviewers: JSON.stringify(r.reviewers), fans: r.fans });
}
