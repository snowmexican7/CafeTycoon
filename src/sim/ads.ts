/**
 * P3 B10: parody ad campaigns. At night the crew can buy one campaign for tomorrow on a parody
 * platform; each targets a crowd type. How it lands (flop, fine or viral) is a pure hash of the
 * run seed, the day and the platform: hidden until the doors open, then announced in the morning
 * notes and on the receipt. No RNG draws: an ad only reweighs probabilities the sim already rolls.
 */
import { hash32 } from './taste';
import type { AdId, AdOutcome, GameState, PlayerInput } from './types';
import type { Modifiers } from './effects';

export type AdTarget = 'group' | 'regular' | 'impatient' | 'influencer' | 'everyone';

export interface AdInfo {
  name: string;
  icon: string;
  target: AdTarget;
  /** Who it reaches, for the card. */
  reach: string;
  cost: number;
  /** The ad itself, as it runs. */
  copy: string;
  /** Percent chances of a flop and of going viral (the rest lands fine). */
  odds: { flop: number; viral: number };
  /** What the comments said, by outcome. */
  result: Record<AdOutcome, string>;
}

export const AD_IDS: AdId[] = ['palmbook', 'nextdoorish', 'linkedout', 'glimpse', 'tiktak'];

export const ADS: Record<AdId, AdInfo> = {
  palmbook: {
    name: 'Palm Book',
    icon: '📘',
    target: 'group',
    reach: 'families and big groups',
    cost: 14,
    copy: 'Your aunt shared this: GROUP HUG LATTES ☕☕☕ Bring the whole cul-de-sac. Type AMEN for a free biscotti.*',
    odds: { flop: 30, viral: 20 },
    result: {
      flop: 'Shared once, by your aunt, with the caption "is this a scam".',
      ok: '212 likes, mostly from people called Linda. Groups are coming.',
      viral: 'Every book club in town has it pinned. Here come the groups.',
    },
  },
  nextdoorish: {
    name: 'Nextdoorish',
    icon: '🏡',
    target: 'regular',
    reach: 'locals and regulars',
    cost: 10,
    copy: 'Who keeps leaving that lovely coffee smell on our street?? Asking for a café. (It\'s us. Come say hi.)',
    odds: { flop: 25, viral: 15 },
    result: {
      flop: 'The thread became an argument about a parked van. Nobody mentioned coffee.',
      ok: 'Gerald from number 12 says he\'ll "pop in". The locals are curious.',
      viral: 'Declared "the street\'s living room". The regulars are rallying.',
    },
  },
  linkedout: {
    name: 'LinkedOut',
    icon: '💼',
    target: 'impatient',
    reach: 'commuters in a hurry',
    cost: 12,
    copy: 'Thrilled to announce our espresso has been promoted to Senior Espresso. Agree? 👇 #Hustle #Grindset #CoffeeIsALeadershipSkill',
    odds: { flop: 30, viral: 20 },
    result: {
      flop: '3 reactions, all "Insightful", all from recruiters.',
      ok: 'A VP of Synergy reposted it. Busy commuters incoming (they won\'t wait long).',
      viral: 'Trending in "Thought Leadership". A stampede of very impatient commuters.',
    },
  },
  glimpse: {
    name: 'Glimpse',
    icon: '📸',
    target: 'influencer',
    reach: 'influencers and the selfie crowd',
    cost: 18,
    copy: 'POV: the foam art is looking back at you ✨ #NoFilter (one filter) #CafeCore',
    odds: { flop: 35, viral: 20 },
    result: {
      flop: 'The algorithm showed it to eleven bots and a cat account.',
      ok: 'A few creators saved it "for later". An influencer might drop by.',
      viral: 'Saved 40k times. An influencer is almost certainly coming.',
    },
  },
  tiktak: {
    name: 'Tik Tak',
    icon: '🎵',
    target: 'everyone',
    reach: 'everyone (it\'s chaos)',
    cost: 16,
    copy: 'Barista does the "Steam Wand Shuffle" for 8 seconds, then the milk explodes. Link in bio.',
    odds: { flop: 40, viral: 25 },
    result: {
      flop: 'Ratioed by a duet titled "health code violation?". A few people stay away.',
      ok: 'Mid views, good vibes. A little more foot traffic.',
      viral: 'Four million views and a remix. The whole town wants to see the shuffle.',
    },
  },
};

/** How much an outcome moves traffic, the target's share of the mix, and the influencer odds. */
export const AD_EFFECT: Record<AdOutcome, { traffic: number; mix: number; everyone: number; influencer: number }> = {
  flop: { traffic: 1, mix: 1, everyone: 0.95, influencer: 1 },
  ok: { traffic: 1.04, mix: 1.5, everyone: 1.08, influencer: 2.5 },
  viral: { traffic: 1.1, mix: 2.2, everyone: 1.22, influencer: 6 },
};

export function isAdId(x: unknown): x is AdId {
  return typeof x === 'string' && (AD_IDS as string[]).includes(x);
}

/** How the campaign on `id` lands on `day`: a pure hash, no RNG. */
export function adOutcome(seed: number, day: number, id: AdId): AdOutcome {
  const { flop, viral } = ADS[id].odds;
  const r = hash32(seed * 17 + day * 104729 + AD_IDS.indexOf(id) * 7919 + 3) % 100;
  return r < flop ? 'flop' : r >= 100 - viral ? 'viral' : 'ok';
}

/** The campaign running today (outcome known), if any. */
export function liveAd(state: GameState): { id: AdId; outcome: AdOutcome } | null {
  const a = state.ad;
  return a && a.day === state.day && a.outcome ? { id: a.id, outcome: a.outcome } : null;
}

/** Fold today's live campaign into the modifiers (called from computeModifiers). */
export function applyAd(state: GameState, m: Modifiers): void {
  const ad = liveAd(state);
  if (!ad) return;
  const fx = AD_EFFECT[ad.outcome];
  const target = ADS[ad.id].target;
  if (target === 'everyone') {
    m.traffic *= fx.everyone;
    return;
  }
  m.traffic *= fx.traffic;
  if (target === 'influencer') m.eventOdds.influencerVisit *= fx.influencer;
  else m.mix[target] *= fx.mix;
}

/** Morning: reveal how tonight's campaign landed. Returns the note for the morning notes. */
export function adMorning(state: GameState): string | null {
  const a = state.ad;
  if (!a || a.day !== state.day) return null;
  a.outcome = adOutcome(state.seed, state.day, a.id);
  state.today.ad = { id: a.id, outcome: a.outcome };
  const info = ADS[a.id];
  const head = a.outcome === 'viral' ? 'went viral' : a.outcome === 'ok' ? 'did fine' : 'flopped';
  return `${info.icon} ${info.name} ad ${head}: ${info.result[a.outcome]}`;
}

/** Night input: book (or swap, or cancel for a refund) tomorrow's campaign. Humans only, one at a time. */
export function applyAdInput(state: GameState, input: Extract<PlayerInput, { kind: 'ad' }>): GameState {
  if (state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  const booked = state.ad && state.ad.day === state.day ? state.ad : null;
  if (booked && booked.id === input.ad) return state;
  const refund = booked ? ADS[booked.id].cost : 0;
  if (input.ad === null) {
    if (!booked) return state;
    state.cash = Math.round((state.cash + refund) * 100) / 100;
    delete state.ad;
    return state;
  }
  const cost = ADS[input.ad].cost;
  if (state.cash + refund < cost) return state;
  state.cash = Math.round((state.cash + refund - cost) * 100) / 100;
  state.ad = { id: input.ad, day: state.day, by: p.name };
  return state;
}
