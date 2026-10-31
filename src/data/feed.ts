/**
 * FB2 C11: the social feed. Numbers and the post text, kept as data so the UI only draws them.
 * Templates use `{drink}` (the drink's name in lower case). Variants are picked by a hash (src/sim/feed.ts).
 */
import type { FeedReason, FeedSentiment } from '../sim/types';

export const FEED = {
  /** Chance a bad moment (cold cup, lukewarm cup, black coffee, long-wait walk-out, bump walk-out) posts live. */
  badChance: 0.35,
  /** Chance a great serve (fast, hot, tipped well) posts live. */
  goodChance: 0.1,
  /** Live posts kept per day (cap on the rest). */
  maxLive: 10,
  /** A great serve tips at least this share of the price. */
  greatTipRate: 0.2,
  /** End-of-day posts: three to five. */
  dayPosts: { min: 3, max: 5 },
  /** Thresholds the day's summary posts read the stats against. */
  day: { lostMid: 0.2, busy: 12, waitMidSeconds: 50, starsMid: 2.4, tipsGood: 0.2 },
  /** Fans per unit of the day's stats; the day's change is clamped to [minDelta, maxDelta], and fans never go below 0. */
  fans: { perServed: 0.3, perPerfect: 0.5, perLost: 0.8, perBadMoment: 0.5, perPost: 3, minDelta: -15, maxDelta: 25 },
  /** Week rating: reviewer scores run 1..5. */
  rating: { lostMid: 0.5, tipsFull: 0.25, coldPenalty: 8 },
} as const;

/** Handles for the people who post. */
export const HANDLES: string[] = [
  '@beanbae', '@sippy_steve', '@latte_larry', '@crema_queen', '@decaf_dave', '@mugshot_mo',
  '@foamfiend', '@java_jen', '@grounds_keeper', '@oat_flat_white', '@brewtus', '@espresso_yo_self',
];

export type FeedText = Partial<Record<FeedSentiment, string[]>>;

export const FEED_TEXT: Record<FeedReason, FeedText> = {
  cold: {
    bad: [
      'My {drink} arrived at room temperature. The room was also cold. 1 star.',
      'Ordered a hot {drink}, received a science project.',
      'This {drink} had the warmth of a handshake from a ghost.',
      'Cold {drink}. I have had warmer breakups.',
    ],
  },
  lukewarm: {
    bad: [
      'Lukewarm {drink}. Not hot. Not cold. Just disappointed.',
      'My {drink} was the temperature of a bath someone else already used.',
      'Sat on the counter long enough to get its own mailbox. Meh {drink}.',
    ],
  },
  black: {
    bad: [
      'The condiment bar was empty so I had my {drink} black. I am built different now. Not happy though.',
      'No milk, no sugar, no mercy. Empty bar.',
      'Stood at the condiment bar like it owed me money. Empty.',
    ],
  },
  wait: {
    bad: [
      'Waited so long for a {drink} I forgot my own name.',
      'Left before my {drink}. Grew a beard in the queue.',
      'Walked out after a very long wait. The {drink} is still in my heart, but not in my hand.',
    ],
  },
  bump: {
    bad: [
      'A barista walked right into me. Rude. Mind the personal space.',
      'Got elbowed in line, never got my {drink}. Zero stars for choreography.',
      'Bumped three times for a {drink}. I am a customer, not a doorframe.',
    ],
  },
  great: {
    good: [
      'The {drink} was hot, fast and perfect. Telling everyone.',
      'Got my {drink} before I finished my sentence. Wizardry.',
      'Tipped extra for that {drink}. Worth every coin.',
    ],
  },
  service: {
    good: [
      'Everyone got served today. No tears. Tiny bit of wow.',
      'Café ran like a clock today. Slightly smug clock.',
      'Nobody stormed out. This is basically a miracle.',
    ],
    bad: [
      'Left without a drink again. Speedrun category: any% walkout.',
      'So many people left empty-handed today. The queue is a trap.',
      'Heard a lot of sighing at the café today. Mostly from the queue.',
    ],
  },
  crowd: {
    good: [
      'Packed house at the café today. Worth the queue!',
      'Every table was full and the {drink} was flying. Buzzing.',
      'Whole town seems to be at the café. Good sign.',
    ],
  },
  quiet: {
    bad: [
      'Quiet day at the café. Had the place to myself and a long think.',
      'Nobody there today. I could hear the {drink} machine thinking.',
      'Tumbleweed passed through the café. Was it a customer?',
    ],
  },
  speed: {
    good: [
      'Fast service today. My {drink} showed up while I was still looking at the menu.',
      'Quickest barista crew in town. Blink and the {drink} is gone.',
      'In and out, {drink} in hand. Speed demons.',
    ],
    bad: [
      'Long waits at the café today. I aged a little.',
      'Waited ages for a {drink}. Ordered a snack in the meantime. Then a second one.',
      'Slow day at the bar. My {drink} was made by the tortoise from the fable.',
    ],
  },
  quality: {
    good: [
      'Every cup looked right today. Who are these people?',
      'Neat, tidy, tasty {drink}. Frame-worthy.',
      'Clean cups, good {drink}. Calm baristas. 10 out of 10.',
    ],
    bad: [
      'Cup looked like it lost a fight. {drink} was fine, it just looked scared.',
      'Sloppy cups today. Somebody check the baristas for butterfingers.',
      'The {drink} was a little rough around the edges. Like my Monday.',
    ],
  },
  tips: {
    good: [
      'Tipped the baristas twice today. Do not tell my accountant.',
      'Left a big tip. The {drink} earned it.',
      'The tip jar and I are best friends now.',
    ],
  },
};

/** The week rating's silly reviewers: one pool per judge. A name is picked from each pool by a hash. */
export const REVIEWERS = {
  /** Judges service: how many people went home empty-handed. */
  service: ['Sir Slurps-a-Lot', 'Duchess Drip', 'The Queue Inspector', 'Baron von Brew'],
  /** Judges the cups: stars, cold and lukewarm. */
  quality: ['Madame Crema', 'Chef Foamington', 'Grumpy Gus', 'Dr. Bean'],
  /** Judges the vibes: tips and perfect serves. */
  vibes: ['Big Tipper Greg', 'Aunt Mocha', 'Captain Cappuccino', 'Lady Latte'],
} as const;
