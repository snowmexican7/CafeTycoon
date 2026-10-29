import type { DrinkId, GameState, Personality } from '../sim/types';

/**
 * Pure helpers for customer and crew personality visuals: serve toasts, perfect-serve celebrations,
 * bot looks and emotes. No Pixi here; Actors and Effects draw from it.
 */

const DRINK_PHRASE: Record<DrinkId, string> = { espresso: 'an espresso', latte: 'a latte', coldBrew: 'a cold brew' };

/** "Dev served a latte +$6.10" (amount is price plus tip). */
export function toastText(name: string, item: DrinkId, amount: number): string {
  return `${name} served ${DRINK_PHRASE[item]} +$${amount.toFixed(2)}`;
}

export type CrewBurst =
  | { kind: 'serve'; text: string; by: string; playerIndex: number; perfect: boolean; customerKind: string; regular?: string; cid: number }
  | { kind: 'oops'; playerIndex: number; by: string }
  | { kind: 'selfie' }
  | { kind: 'teamwork'; from: string; to: string }
  | { kind: 'streak'; count: number };

/** Visual-only memory between snapshots: who last parked each drink on the pass, and the perfect-serve streak. */
export interface CrewMemory {
  putters: Partial<Record<DrinkId, string[]>>;
  streak: number;
}
export const newCrewMemory = (): CrewMemory => ({ putters: {}, streak: 0 });

/** Perfect serves in a row that earn a streak shout-out (and every 3 after). */
export const STREAK_AT = 3;

/** New serve / bot-mistake / influencer-served log entries since `lastSeq`, as one-shot visuals. */
export function crewBursts(prev: GameState | null, next: GameState, lastSeq: number, mem: CrewMemory = newCrewMemory()): { bursts: CrewBurst[]; lastSeq: number } {
  const cursor = next.nextLogSeq - 1;
  if (!prev || prev.seed !== next.seed || cursor < lastSeq) return { bursts: [], lastSeq: cursor };
  const bursts: CrewBurst[] = [];
  for (const e of next.log) {
    if (e.seq <= lastSeq) continue;
    if (e.kind === 'served') {
      const by = String(e.data.by ?? '');
      const playerIndex = next.players.findIndex((p) => p.id === by);
      const name = playerIndex >= 0 ? next.players[playerIndex].name : 'Someone';
      bursts.push({
        kind: 'serve',
        text: toastText(name, e.data.item as DrinkId, Number(e.data.amount) || 0),
        by,
        playerIndex,
        perfect: e.data.perfect === true,
        customerKind: String(e.data.kind ?? 'normal'),
        ...(typeof e.data.name === 'string' ? { regular: e.data.name } : {}),
        cid: Number(e.data.cid),
      });
      mem.streak = e.data.perfect === true ? mem.streak + 1 : 0;
      if (mem.streak >= STREAK_AT && mem.streak % STREAK_AT === 0) bursts.push({ kind: 'streak', count: mem.streak });
    } else if (e.kind === 'bot.mistake') {
      const playerIndex = next.players.findIndex((p) => p.bot && p.name === e.data.bot);
      if (playerIndex >= 0) bursts.push({ kind: 'oops', playerIndex, by: next.players[playerIndex].id });
    } else if (e.kind === 'pass.put') {
      const item = e.data.item as DrinkId;
      (mem.putters[item] ??= []).push(String(e.data.by));
    } else if (e.kind === 'pass.serve' || e.kind === 'pass.take' || e.kind === 'pass.stale') {
      // a drink one barista parked and another handed over: a hand-off worth a cheer
      const item = e.data.item as DrinkId;
      const from = mem.putters[item]?.shift();
      const to = String(e.data.by ?? '');
      if (e.kind === 'pass.serve' && from && to && from !== to) {
        const name = (id: string) => next.players.find((p) => p.id === id)?.name ?? '?';
        bursts.push({ kind: 'teamwork', from: name(from), to: name(to) });
      }
    } else if (e.kind === 'influencer' && e.data.result === 'served') {
      bursts.push({ kind: 'selfie' });
    }
  }
  return { bursts, lastSeq: Math.max(lastSeq, cursor) };
}

export interface BotLook {
  /** A green "NEW" sticker on the apron (rookie). */
  badge: boolean;
  /** Cool shades (veteran). */
  shades: boolean;
  /** Headphones (steady: in the zone). */
  headphones: boolean;
  /** The little emote that pops up now and then, and how often (s). */
  emote: 'sweat' | 'note' | 'steam';
  every: number;
}

export function botLook(p: Personality): BotLook {
  switch (p) {
    case 'rookie':
      return { badge: true, shades: false, headphones: false, emote: 'sweat', every: 4 };
    case 'veteran':
      return { badge: false, shades: true, headphones: false, emote: 'steam', every: 7 };
    default:
      return { badge: false, shades: false, headphones: true, emote: 'note', every: 6 };
  }
}

/** 0..1 progress of the emote bubble if one is showing at time t (each bot offset by its index), else null. */
export function emotePhase(t: number, index: number, every: number, length = 1.3): number | null {
  const local = (t + index * 1.7) % every;
  return local < length ? local / length : null;
}

/** Bot name tag text. */
export const botTag = (name: string) => `${name} \u00b7 bot`;
