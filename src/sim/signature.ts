/**
 * P3 B7: the signature drink. At night the crew designs one house drink: a name, a base drink,
 * a twist from the taste map and a premium. Some walk-ins then ask for it by name; it sells at
 * the premium, and a well-rated combo earns a bonus (a flop costs rating instead).
 */
import { DRINK_IDS, DRINK_INFO } from '../data/drinks';
import { unlockedDrinks } from './unlocks';
import { TWIST_INFO, TWISTS, type TwistId } from './taste';
import type { DayStats, DrinkId, GameState, PlayerInput, Signature } from './types';

export const SIG = {
  /** Chance a single walk-in asks for the signature, before the premium's drag. */
  share: 0.2,
  /** Each premium step is +$0.50 and drops the share by this fraction of the base. */
  premiumStep: 0.5,
  maxPremium: 6,
  shareDropPerStep: 0.1,
  /** Cash bonus per signature serve by combo stars (index = stars). */
  bonus: [0, 0, 0, 0, 0.75, 1.5],
  /** Rating per signature serve per star away from 3; summed, then capped. */
  repPerServe: 0.012,
  repCap: 0.2,
  nameMax: 20,
};

export type SignatureDraft = Pick<Signature, 'name' | 'drink' | 'twist' | 'premium'>;

export function cleanName(raw: unknown, drink: DrinkId, twist: TwistId): string {
  const s = typeof raw === 'string' ? raw.replace(/[<>&"`\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, SIG.nameMax).trim() : '';
  return s || `${TWIST_INFO[twist].name} ${DRINK_INFO[drink].short.toLowerCase()}`;
}

/** Validate a draft from the wire: null when it can't be made sense of. */
export function cleanDraft(raw: unknown): SignatureDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!DRINK_IDS.includes(r.drink as DrinkId) || !TWISTS.includes(r.twist as TwistId)) return null;
  if (!Number.isInteger(r.premium) || (r.premium as number) < 0 || (r.premium as number) > SIG.maxPremium) return null;
  const drink = r.drink as DrinkId;
  const twist = r.twist as TwistId;
  return { name: cleanName(r.name, drink, twist), drink, twist, premium: r.premium as number };
}

export function sigShare(sig: Signature): number {
  return SIG.share * Math.max(0.2, 1 - sig.premium * SIG.shareDropPerStep);
}

export function sigPremium(sig: Signature): number {
  return sig.premium * SIG.premiumStep;
}

/** Night input: design, change or retire the signature. A new recipe (drink or twist) restarts `since`. */
export function applySignatureInput(state: GameState, input: Extract<PlayerInput, { kind: 'signature' }>): GameState {
  if (state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  if (input.sig === null) {
    delete state.signature;
    return state;
  }
  const d = cleanDraft(input.sig);
  if (!d || !unlockedDrinks(state).includes(d.drink)) return state;
  const old = state.signature;
  const same = old && old.drink === d.drink && old.twist === d.twist;
  state.signature = { ...d, since: same ? old.since : state.day };
  return state;
}

/** Book one signature serve; returns the cash bonus (also tallied into `today.bonus`). */
export function signatureServed(today: DayStats, stars: number): number {
  today.sigServed = (today.sigServed ?? 0) + 1;
  today.sigStarSum = (today.sigStarSum ?? 0) + (stars - 3);
  const bonus = SIG.bonus[stars] ?? 0;
  if (bonus) {
    today.sigBonus = Math.round(((today.sigBonus ?? 0) + bonus) * 100) / 100;
    today.bonus = Math.round(((today.bonus ?? 0) + bonus) * 100) / 100;
  }
  return bonus;
}

/** Closing rating change from today's signature serves: capped either way. */
export function sigRating(today: DayStats): number {
  const raw = (today.sigStarSum ?? 0) * SIG.repPerServe;
  return Math.max(-SIG.repCap, Math.min(SIG.repCap, raw));
}
