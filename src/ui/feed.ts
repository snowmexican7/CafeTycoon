/**
 * FB2 C11: social feed UI. Pure view helpers over `dayReviews` / `weekRating` (src/sim/feed.ts).
 * Night phone, day pop-up posts, week-end rating card. Never parses `week.rating`'s JSON.
 */
import { dayReviews, weekRating } from '../sim/feed';
import type { FeedPost, FeedSentiment, GameState, SimEvent } from '../sim/types';
import { esc } from './dom';

export interface FeedPostVM {
  name: string;
  text: string;
  sentiment: FeedSentiment;
  stars: number;
}

export interface DayFeedVM {
  posts: FeedPostVM[];
  fans: number;
  fansDelta: number;
  /** True before the first day has closed (nothing to show on the phone). */
  empty: boolean;
}

export interface WeekRatingVM {
  reviewers: { name: string; score: number }[];
  fans: number;
}

const toPost = (p: FeedPost): FeedPostVM => ({
  name: p.name,
  text: p.text,
  sentiment: p.sentiment,
  stars: p.stars,
});

/** Night / closing: last finished day's posts, fans now, and how many moved. */
export function dayFeedVM(state: GameState): DayFeedVM {
  const r = dayReviews(state);
  return {
    posts: r.posts.map(toPost),
    fans: r.fans,
    fansDelta: r.fansDelta,
    empty: state.days.length === 0,
  };
}

/** Week-end card: three silly reviewers from `weekRating(state)`. */
export function weekRatingVM(state: GameState): WeekRatingVM {
  return weekRating(state);
}

/** ★ filled / ○ empty so hollow stars stay readable in Nunito (☆ looks like ★ at small sizes). */
export const starRow = (n: number): string => {
  const filled = Math.max(0, Math.min(5, Math.round(n)));
  return `<span class="fp-star on">${'★'.repeat(filled)}</span><span class="fp-star off">${'○'.repeat(5 - filled)}</span>`;
};

/** "+3 fans" / "−2 fans" / "no change". */
export function fansDeltaLabel(delta: number): string {
  if (delta > 0) return `+${delta} fans`;
  if (delta < 0) return `${delta} fans`;
  return 'no change';
}

/** One post row inside the phone (pure HTML). */
export function feedPostHtml(p: FeedPostVM, i = 0): string {
  return `<article class="fp ${p.sentiment}" style="--i:${i}">
    <header><b>${esc(p.name)}</b><span class="fp-stars" aria-label="${p.stars} stars">${starRow(p.stars)}</span></header>
    <p>${esc(p.text)}</p>
  </article>`;
}

/** Fans strip used on the night phone and the closing receipt. */
export function fansStripHtml(fans: number, fansDelta: number): string {
  const deltaCls = fansDelta > 0 ? 'up' : fansDelta < 0 ? 'down' : '';
  return `<div class="ff-fans" role="status"><span class="ff-count" title="Café fans">♥ ${fans}</span><span class="ff-delta ${deltaCls}">${esc(fansDeltaLabel(fansDelta))}</span></div>`;
}

/**
 * Night phone feed. Hidden before the first day closes; otherwise the day's posts
 * (or a quiet empty state) plus the fans strip.
 */
export function nightPhoneHtml(vm: DayFeedVM): string {
  if (vm.empty) return '';
  const body = vm.posts.length
    ? vm.posts.map((p, i) => feedPostHtml(p, i)).join('')
    : '<p class="fp-empty">Quiet day. Nobody posted.</p>';
  return `<section class="feed-phone" aria-label="Café feed">
    <div class="ff-bezel" aria-hidden="true"><i></i></div>
    <div class="ff-screen">
      <div class="ff-bar"><b>Café Feed</b><small>today</small></div>
      ${fansStripHtml(vm.fans, vm.fansDelta)}
      <div class="ff-list">${body}</div>
    </div>
  </section>`;
}

/** Closing receipt line for today's fan change (absent before day 1 / when delta is 0 and fans stay 0). */
export function closingFansHtml(fans: number, fansDelta: number | undefined): string {
  if (fansDelta === undefined && fans === 0) return '';
  const delta = fansDelta ?? 0;
  const deltaCls = delta > 0 ? 'pos' : delta < 0 ? 'neg' : '';
  const deltaTxt = delta > 0 ? `+${delta}` : String(delta);
  return `<div class="line fans"><span>Fans ♥ ${fans}</span><span class="${deltaCls}">${esc(delta === 0 ? '±0 today' : `${deltaTxt} today`)}</span></div>`;
}

/** Week-end rating card from `weekRating` (never from `week.rating` log JSON). */
export function weekRatingHtml(vm: WeekRatingVM): string {
  if (!vm.reviewers.length) return '';
  const rows = vm.reviewers
    .map(
      (r, i) => `<li class="wr-row" style="--i:${i}"><span class="wr-who">${esc(r.name)}</span>
      <span class="wr-stars" aria-label="${r.score} out of 5">${starRow(r.score)}</span>
      <b>${r.score}</b></li>`,
    )
    .join('');
  return `<section class="week-rating" aria-label="Week rating">
    <div class="sec-h">Week's reviews <span class="chip">♥ ${vm.fans} fans</span></div>
    <ul class="wr-list">${rows}</ul>
  </section>`;
}

/** Live day pop-up from a `review.post` event (name, text, sentiment, stars). */
export function reviewPopVM(e: Pick<SimEvent, 'kind' | 'data'>): FeedPostVM | null {
  if (e.kind !== 'review.post') return null;
  const d = e.data as { name?: string; text?: string; sentiment?: FeedSentiment; stars?: number };
  if (!d.name || !d.text || (d.sentiment !== 'good' && d.sentiment !== 'bad') || typeof d.stars !== 'number') return null;
  return { name: d.name, text: d.text, sentiment: d.sentiment, stars: d.stars };
}

/** Phone-shaped toast HTML for a live post. */
export function reviewPopHtml(p: FeedPostVM): string {
  return `<div class="feed-pop ${p.sentiment}" role="status">
    <div class="fp-bezel" aria-hidden="true"><i></i></div>
    <div class="fp-body">
      <small>New post</small>
      <header><b>${esc(p.name)}</b><span class="fp-stars">${starRow(p.stars)}</span></header>
      <p>${esc(p.text)}</p>
    </div>
  </div>`;
}
