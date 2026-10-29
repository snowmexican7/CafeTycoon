/**
 * P3 B11: "Pitch an idea". At night one barista types a pitch for tomorrow, either a promo or a
 * new item, and a scripted three-judge panel scores it on keywords (no AI, no RNG). Each judge
 * scores 0-10, so the total is out of 30. 18 or more is green-lit and gives a small boost tomorrow:
 * a promo brings more walk-ins, an item brings bigger tips. 24 or more is a standing ovation,
 * which doubles the boost. Verdict lines are chosen by a hash of the text, so the same pitch
 * always gets the same verdict.
 */
import { DRINK_INFO } from '../data/drinks';
import { hash32, TWIST_INFO, TWISTS } from './taste';
import type { GameState, PitchKind, PitchResult, PitchTier, PlayerInput } from './types';
import type { Modifiers } from './effects';

export const PITCH = {
  maxLen: 140,
  minWords: 4,
  greenlit: 18,
  ovation: 24,
  /** Promo: walk-in traffic multiplier by tier. Item: tip rate added by tier. */
  boost: { promo: { greenlit: 1.04, ovation: 1.08 }, item: { greenlit: 0.02, ovation: 0.04 } },
} as const;

export const PITCH_KINDS: PitchKind[] = ['promo', 'item'];

export interface Judge {
  name: string;
  icon: string;
  /** What they're listening for, for the panel card. */
  likes: string;
  words: string[];
  /** Verdict lines: low (0-3), mid (4-6), high (7-10). */
  lines: [string[], string[], string[]];
}

export const JUDGES: Judge[] = [
  {
    name: 'Gordon Grind',
    icon: '👨‍🍳',
    likes: 'craft and quality',
    words: ['fresh', 'craft', 'handmade', 'hand-made', 'house-made', 'homemade', 'roast', 'bean', 'origin', 'artisan', 'quality', 'smooth', 'rich', 'slow', 'pour', 'real', 'organic', 'crema', 'foam', 'espresso', 'perfect', 'recipe', 'taste'],
    lines: [
      ['This pitch is RAW. Raw like an underpulled shot.', "I've had better ideas from a kettle.", 'Where is the CRAFT? Where is the BEAN?'],
      ['Decent. Not great. Like gas-station crema.', "It's edible. Barely. Go again.", "There's a good idea in there, hiding behind a bad one."],
      ['Finally! Someone who respects the bean.', "That's a pitch with crema on it. Beautiful.", "Stunning. I'd shut up and drink that."],
    ],
  },
  {
    name: 'Auntie Foam',
    icon: '👵',
    likes: 'cozy, family and local',
    words: ['cozy', 'cosy', 'warm', 'family', 'kids', 'grandma', 'local', 'neighbo', 'friend', 'community', 'morning', 'hug', 'love', 'share', 'welcome', 'rain', 'blanket', 'cookie', 'home', 'together', 'smile', 'sweet'],
    lines: [
      ["Oh, sweetie. No. But I'll still knit you a scarf.", 'Where are the grandkids supposed to sit?', 'That gave me a chill, and not the cozy kind.'],
      ["It's nice! Like a casserole someone else brought.", 'I like it, but it needs a hug.', 'Lovely, dear. Add a cookie and call me.'],
      ["I'm crying. Bring the whole neighbourhood!", 'That is the warmest thing since my quilt.', 'Oh, I am telling EVERYONE at bingo.'],
    ],
  },
  {
    name: 'Chad from Marketing',
    icon: '😎',
    likes: 'deals, hype and loyalty',
    words: ['deal', 'free', 'discount', 'bogo', '% off', 'half price', 'loyalty', 'stamp', 'card', 'viral', 'limited', 'exclusive', 'happy hour', 'combo', 'bundle', 'tik tak', 'palm book', 'influencer', 'giveaway', 'contest', 'double', 'launch', 'hype', 'trend'],
    lines: [
      ["Zero engagement. I can't even put this on a slide.", 'This would get ratioed by a fax machine.', "Bro. Where's the hook? Where's the DEAL?"],
      ['Solid B-minus. Needs a hashtag.', "I'd circle back on this. Maybe.", "Not bad. Let's take it offline and add a giveaway."],
      ['This is going VIRAL. I can feel it in my vest.', "Ship it. I'm putting this in my LinkedOut bio.", 'Huge. Massive. Synergy-adjacent. Love it.'],
    ],
  },
];

/** Words the whole panel groans at (Chad secretly loves them). */
export const BUZZWORDS = ['crypto', 'nft', 'synergy', 'blockchain', 'metaverse', 'web3', 'disrupt', 'ai-powered', 'pivot'];

/** Panel lines by tier. */
const PANEL: Record<PitchTier, string[]> = {
  passed: ['The panel passes. Someone slowly closes a laptop.', 'Thanks, but no. Chad is already on his phone.'],
  meh: ['The panel is lukewarm, like coffee left on the counter.', 'Polite applause. Nothing happens.'],
  greenlit: ['Green-lit! It runs tomorrow.', 'The panel nods. Green-lit for tomorrow.'],
  ovation: ['Standing ovation! Auntie Foam threw a cookie.', 'The panel is on its feet. Gordon is wiping a tear.'],
};

/** A pure, stable hash of a string. */
export function strHash(s: string): number {
  let h = 0x2545f491;
  for (let i = 0; i < s.length; i++) h = hash32(h ^ s.charCodeAt(i));
  return h >>> 0;
}

/** Strip control characters, collapse spaces, and cap the length. */
export function cleanPitch(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PITCH.maxLen);
}

export function isPitchKind(v: unknown): v is PitchKind {
  return PITCH_KINDS.includes(v as PitchKind);
}

export function tierOf(total: number): PitchTier {
  return total >= PITCH.ovation ? 'ovation' : total >= PITCH.greenlit ? 'greenlit' : total >= 12 ? 'meh' : 'passed';
}

/** Names on the menu worth dropping in a pitch: twists, drinks, and the signature. */
function contextWords(state: GameState): string[] {
  const words = TWISTS.map((t) => TWIST_INFO[t].name.toLowerCase());
  for (const d of Object.keys(state.menu ?? {}) as (keyof typeof DRINK_INFO)[]) if (state.menu[d]) words.push(DRINK_INFO[d].name.toLowerCase());
  if (state.signature?.name) words.push(state.signature.name.toLowerCase());
  return [...new Set(words)].filter((w) => w.length >= 3);
}

/**
 * Score a pitch. Pure: the same text on the same state always scores the same.
 * `last` is the previous pitch's text, so a repeat gets booed.
 */
export function judgePitch(state: GameState, kind: PitchKind, raw: string, last?: string): Omit<PitchResult, 'day' | 'by'> {
  const text = cleanPitch(raw);
  const low = text.toLowerCase();
  const letters = text.replace(/[^a-z]/gi, '');
  const shouty = letters.length >= 10 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7;
  const short = text.split(' ').filter(Boolean).length < PITCH.minWords;
  const repeat = !!last && cleanPitch(last).toLowerCase() === low;
  const buzz = BUZZWORDS.filter((w) => low.includes(w)).length;
  const context = Math.min(3, contextWords(state).filter((w) => low.includes(w)).length);
  const notes: string[] = [];
  if (context) notes.push(`+${context} for knowing the menu`);
  if (buzz) notes.push('buzzwords: the panel groans');
  if (shouty) notes.push('ALL CAPS: the panel covers its ears');
  if (short) notes.push('too short to judge');
  if (repeat) notes.push('same pitch as last time');
  const h = strHash(`${kind}:${low}`);
  const scores: number[] = [];
  const verdicts: string[] = [];
  JUDGES.forEach((j, i) => {
    const hits = j.words.filter((w) => low.includes(w)).length;
    // Each judge likes one kind of pitch a bit more: Gordon items, Chad promos, Auntie both.
    const fit = (i === 0 && kind === 'item') || (i === 2 && kind === 'promo') ? 1 : 0;
    let s = 2 + Math.min(3, hits) * 2 + context + fit;
    s -= buzz * (i === 2 ? -1 : 3);
    if (shouty) s -= 2;
    if (short) s -= 3;
    if (repeat) s -= 4;
    s = Math.max(0, Math.min(10, s));
    scores.push(s);
    const band = j.lines[s <= 3 ? 0 : s <= 6 ? 1 : 2];
    verdicts.push(band[hash32(h + i * 7919) % band.length]);
  });
  const total = scores.reduce((a, b) => a + b, 0);
  const tier = tierOf(total);
  const panel = PANEL[tier][h % PANEL[tier].length];
  const boost = tier === 'ovation' || tier === 'greenlit' ? PITCH.boost[kind][tier] : kind === 'promo' ? 1 : 0;
  return { kind, text, scores, verdicts, total, tier, panel, notes, boost };
}

/** Tomorrow's pitch, if green-lit and for today. */
export function livePitch(state: GameState): PitchResult | null {
  const p = state.pitch;
  return p && p.day === state.day && (p.tier === 'greenlit' || p.tier === 'ovation') ? p : null;
}

/** Fold a green-lit pitch into the day's modifiers. */
export function applyPitch(state: GameState, m: Modifiers): void {
  const p = livePitch(state);
  if (!p) return;
  if (p.kind === 'promo') m.traffic *= p.boost;
  else m.tipRate += p.boost;
}

/** Morning note for a green-lit pitch. */
export function pitchMorning(state: GameState): string | null {
  const p = livePitch(state);
  if (!p) return null;
  return p.kind === 'promo'
    ? `🎤 ${p.by}'s promo is running today (${p.total}/30): a few more walk-ins.`
    : `🎤 ${p.by}'s new item is on the board today (${p.total}/30): tips are up a little.`;
}

/** One pitch a night, by a human barista. Scored at once; a repeat of the last pitch is booed. */
export function applyPitchInput(state: GameState, input: Extract<PlayerInput, { kind: 'pitch' }>): GameState {
  if (state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  if (state.pitch && state.pitch.day === state.day) return state;
  const text = cleanPitch(input.text);
  if (!text) return state;
  state.pitch = { day: state.day, by: p.name, ...judgePitch(state, input.pitchKind, text, state.pitch?.text) };
  return state;
}
