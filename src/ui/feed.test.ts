import { describe, expect, it } from 'vitest';
import { createRun, startDay, startNight } from '../sim/run';
import { finishDay } from '../sim/closing';
import { enterClosing } from '../sim/step';
import { dayReviews, weekRating } from '../sim/feed';
import {
  closingFansHtml,
  dayFeedVM,
  fansDeltaLabel,
  nightPhoneHtml,
  reviewPopHtml,
  reviewPopVM,
  starRow,
  weekRatingHtml,
  weekRatingVM,
} from './feed';
import { closingViewModel, nightViewModel, weekEndViewModel } from './viewModels';
import { nightHtml, type NightUiState } from './night';
import { createClosing } from './closing';
import { ceremonyHtml } from './weekEnd';

const run = (seed = 3) => createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, gear: true });

const ui = (): NightUiState => ({ tab: 'tonight', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'promo', text: '' } });

const fakeEl = () =>
  ({ innerHTML: '', hidden: true, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] } as unknown as HTMLElement);

describe('FB2 C11 feed UI', () => {
  it('starRow and fansDeltaLabel are plain English', () => {
    expect(starRow(5)).toContain('★★★★★');
    expect(starRow(5)).not.toContain('○');
    expect(starRow(2)).toContain('★★');
    expect(starRow(2)).toContain('○○○');
    expect(fansDeltaLabel(4)).toBe('+4 fans');
    expect(fansDeltaLabel(-2)).toBe('-2 fans');
    expect(fansDeltaLabel(0)).toBe('no change');
  });

  it('dayFeedVM mirrors dayReviews and stays empty before the first day closes', () => {
    const s = run();
    expect(dayFeedVM(s)).toEqual({ posts: [], fans: 0, fansDelta: 0, empty: true });

    const day = startDay(s);
    Object.assign(day.today, {
      served: 14, lost: 2, sales: 70, tips: 10, rent: 40, perfect: 5, cups: 14, cupStars: 35,
      feedMoments: { great: 2, cold: 1 },
    });
    enterClosing(day);
    const night = finishDay(day); // finishDay → closeDayFeed → startNight (day 1)
    expect(night.phase).toBe('night');
    const vm = dayFeedVM(night);
    const sim = dayReviews(night);
    expect(vm.empty).toBe(false);
    expect(vm.posts.length).toBe(sim.posts.length);
    expect(vm.fans).toBe(sim.fans);
    expect(vm.fansDelta).toBe(sim.fansDelta);
    expect(vm.posts[0]).toMatchObject({ name: expect.stringMatching(/^@/), text: expect.any(String), stars: expect.any(Number) });
  });

  it('night phone HTML shows posts and fans from the NightVM feed', () => {
    let s = run();
    s = startDay(s);
    s.today = {
      ...s.today,
      served: 20, lost: 1, sales: 100, tips: 20, rent: 40, perfect: 8, cups: 20, cupStars: 50,
      feed: [
        { name: '@beanbae', text: 'Everyone got served today. No tears. Tiny bit of wow.', sentiment: 'good', reason: 'service', stars: 5 },
        { name: '@mugshot_mo', text: 'Cold espresso. I have had warmer breakups.', sentiment: 'bad', reason: 'cold', stars: 1 },
      ],
      fansDelta: 5,
      fansAfter: 5,
    };
    s.days = [{ ...s.today }];
    s.fans = 5;
    s = startNight(s);
    const nvm = nightViewModel(s, 'p1');
    expect(nvm.feed?.posts.length).toBe(2);
    expect(nvm.feed?.fans).toBe(5);
    expect(nvm.feed?.fansDelta).toBe(5);
    const html = nightHtml(nvm, undefined, null, ui());
    expect(html).toContain('Café Feed');
    expect(html).toContain('@beanbae');
    expect(html).toContain('♥ 5');
    expect(html).toContain('+5 fans');
    expect(nightPhoneHtml(nvm.feed!)).toContain('@mugshot_mo');
  });

  it('reviewPopVM reads name/text/sentiment/stars from review.post', () => {
    expect(reviewPopVM({ kind: 'served', data: {} })).toBeNull();
    const p = reviewPopVM({
      kind: 'review.post',
      data: { name: '@sippy_steve', text: 'Left before my latte.', sentiment: 'bad', reason: 'wait', stars: 1 },
    });
    expect(p).toEqual({ name: '@sippy_steve', text: 'Left before my latte.', sentiment: 'bad', stars: 1 });
    expect(reviewPopHtml(p!)).toContain('New post');
    expect(reviewPopHtml(p!)).toContain('@sippy_steve');
    expect(reviewPopHtml(p!)).toContain('feed-pop bad');
  });

  it('closing receipt shows fans and fansDelta', () => {
    const before = run();
    before.phase = 'closing';
    before.today = { ...before.today, served: 10, lost: 1, sales: 50, tips: 5, rent: 40, fansDelta: 3, fansAfter: 3 };
    const after = structuredClone(before);
    after.phase = 'night';
    after.fans = 3;
    after.days = [{ ...before.today }];
    const vm = closingViewModel(before, after);
    expect(vm.fans).toBe(3);
    expect(vm.fansDelta).toBe(3);
    expect(closingFansHtml(3, 3)).toContain('Fans ♥ 3');
    expect(closingFansHtml(3, 3)).toContain('+3 today');

    const el = fakeEl();
    createClosing(el).render(vm);
    expect(el.innerHTML).toContain('Fans ♥ 3');
    expect(el.innerHTML).toContain('+3 today');
  });

  it('week rating card uses weekRating(state), not week.rating JSON', () => {
    const s = run();
    s.days = Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      served: 18 + i,
      lost: 2,
      turnedAway: 0,
      sales: 90,
      tips: 15,
      rent: 40,
      perfect: 6,
      cups: 18 + i,
      cupStars: (18 + i) * 3,
    }));
    s.fans = 30;
    s.phase = 'weekEnd';
    const sim = weekRating(s);
    const vm = weekRatingVM(s);
    expect(vm.reviewers).toEqual(sim.reviewers);
    expect(vm.fans).toBe(30);
    const we = weekEndViewModel(s, 'p1');
    expect(we.rating?.reviewers).toEqual(sim.reviewers);
    expect(we.rating?.fans).toBe(30);
    const html = weekRatingHtml(vm);
    expect(html).toContain("Week's reviews");
    expect(html).toContain(sim.reviewers[0]!.name);
    expect(html).not.toContain('JSON.stringify');
    // ceremony still renders; the rating card HTML is what weekEnd embeds
    expect(ceremonyHtml(we.awards).length).toBeGreaterThan(0);
    expect(html).toContain('♥ 30 fans');
    for (const r of sim.reviewers) expect(html).toContain(r.name);
  });
});
