import { TWIST_INFO, type TwistId } from '../sim/taste';
import type { DrinkId, GameState, Personality } from '../sim/types';

/**
 * Pure helpers for customer and crew personality visuals: serve toasts, perfect-serve celebrations,
 * bot looks and emotes, combo streaks, fail feedback, and the crew vibe meter. No Pixi here.
 */

const DRINK_PHRASE: Record<DrinkId, string> = {
  espresso: 'an espresso', latte: 'a latte', coldBrew: 'a cold brew', icedLatte: 'an iced latte', mocha: 'a mocha', matcha: 'a matcha latte', special: 'a maple cold foam', drip: 'a drip coffee', americano: 'an americano', cappuccino: 'a cappuccino', doppio: 'a doppio', sweetCream: 'a sweet-cream cold brew', cafeAuLait: 'a café au lait', redEye: 'a red-eye', pourOver: 'a pour-over',
};

/** "Dev served a latte +$6.10" (amount is price plus tip). */
export function toastText(name: string, item: DrinkId, amount: number): string {
  return `${name} served ${DRINK_PHRASE[item]} +$${amount.toFixed(2)}`;
}

/** Gear G4g: the till's fast hand-off tip, e.g. " · 🧾 +$0.50". Empty when the order wasn't rung up. */
export function tillText(till: unknown): string {
  return typeof till === 'number' && till > 0 ? ` · 🧾 +$${till.toFixed(2)}` : '';
}

/** P3 B5: the cup's accuracy stars, e.g. " ★★☆". Empty for old events without stars. */
export function starText(stars: unknown): string {
  if (typeof stars !== 'number') return '';
  const n = Math.max(0, Math.min(3, Math.round(stars)));
  return ' ' + '★'.repeat(n) + '☆'.repeat(3 - n);
}

/** P3 B6: the cup's twist and, the first time, the discovered combo stars. */
export function comboText(d: Record<string, unknown>): string {
  if (typeof d.twist !== 'string' || typeof d.combo !== 'number') return '';
  const name = TWIST_INFO[d.twist as TwistId]?.name.toLowerCase() ?? d.twist;
  return d.found === true ? ` · new: ${name} ${'★'.repeat(d.combo)}` : ` · ${name}`;
}

/** P3 B7: a signature serve names the drink, and its bonus if it earned one. */
export function sigText(d: Record<string, unknown>): string {
  if (typeof d.sig !== 'string') return '';
  return ` · “${d.sig}”${typeof d.sigBonus === 'number' && d.sigBonus > 0 ? ` +$${d.sigBonus.toFixed(2)}` : ''}`;
}

export type CrewBurst =
  | { kind: 'serve'; text: string; by: string; playerIndex: number; perfect: boolean; customerKind: string; regular?: string; cid: number }
  | { kind: 'oops'; playerIndex: number; by: string }
  | { kind: 'selfie' }
  | { kind: 'teamwork'; from: string; to: string }
  | { kind: 'streak'; count: number }
  | { kind: 'storm'; count: number }
  | { kind: 'slip'; playerId: string }
  | { kind: 'wrong'; text: string }
  | { kind: 'challenge'; label: string; reward: number };

/** Visual-only memory between snapshots: pass putters, combo streak, and crew vibe. */
export interface CrewMemory {
  putters: Partial<Record<DrinkId, string[]>>;
  /** Perfect serves + teamwork hand-offs in a row (resets on a mess). */
  streak: number;
  /** 0..100 crew vibe — climbs with good play, dips with messes. */
  vibe: number;
  /** Last seen today.lost, so we can cheer/storm when someone walks out. */
  lostSeen: number;
  day: number;
  /** Batch/pickup (Gear): who rang each customer up at the till, by customer id (for the teamwork burst). */
  ringers?: Record<number, string>;
}
export const VIBE_START = 55;
export const newCrewMemory = (): CrewMemory => ({ putters: {}, streak: 0, vibe: VIBE_START, lostSeen: 0, day: 0 });

/** Perfect serves / hand-offs in a row that earn a streak shout-out (and every 3 after). */
export const STREAK_AT = 3;

const clampVibe = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function bumpVibe(mem: CrewMemory, delta: number): void {
  mem.vibe = clampVibe(mem.vibe + delta);
}

function resetCombo(mem: CrewMemory): void {
  mem.streak = 0;
}

function addCombo(mem: CrewMemory, bursts: CrewBurst[]): void {
  mem.streak += 1;
  if (mem.streak >= STREAK_AT && mem.streak % STREAK_AT === 0) {
    bursts.push({ kind: 'streak', count: mem.streak });
    bumpVibe(mem, 8);
  }
}

/** A drop log entry that set a cup on the counter (classic `counter`, Gear `pickup`), not a spill or a bin. */
function isCounterDrop(d: Record<string, unknown>): boolean {
  return (d.station === 'counter' || d.station === 'pickup') && typeof d.item === 'string' && d.item !== 'grounds' && d.item !== 'box';
}

/** New serve / bot-mistake / influencer / fail log entries since `lastSeq`, as one-shot visuals. */
export function crewBursts(prev: GameState | null, next: GameState, lastSeq: number, mem: CrewMemory = newCrewMemory()): { bursts: CrewBurst[]; lastSeq: number } {
  const cursor = next.nextLogSeq - 1;
  if (!prev || prev.seed !== next.seed || cursor < lastSeq) return { bursts: [], lastSeq: cursor };

  // New day: soft-reset vibe toward the middle and clear the combo.
  if (next.day !== mem.day) {
    mem.day = next.day;
    mem.streak = 0;
    mem.lostSeen = next.today.lost;
    mem.vibe = clampVibe(VIBE_START + (mem.vibe - VIBE_START) * 0.35);
  }

  const bursts: CrewBurst[] = [];
  for (const e of next.log) {
    if (e.seq <= lastSeq) continue;
    if (e.kind === 'served') {
      const by = String(e.data.by ?? '');
      const playerIndex = next.players.findIndex((p) => p.id === by);
      const name = playerIndex >= 0 ? next.players[playerIndex].name : 'Someone';
      bursts.push({
        kind: 'serve',
        text: toastText(name, e.data.item as DrinkId, Number(e.data.amount) || 0) + starText(e.data.stars) + comboText(e.data) + sigText(e.data) + tillText(e.data.till),
        by,
        playerIndex,
        perfect: e.data.perfect === true,
        customerKind: String(e.data.kind ?? 'normal'),
        ...(typeof e.data.name === 'string' ? { regular: e.data.name } : {}),
        cid: Number(e.data.cid),
      });
      if (e.data.perfect === true) {
        bumpVibe(mem, 3);
        addCombo(mem, bursts);
      } else {
        resetCombo(mem);
        bumpVibe(mem, 1);
      }
    } else if (e.kind === 'bot.mistake') {
      const playerIndex = next.players.findIndex((p) => p.bot && p.name === e.data.bot);
      if (playerIndex >= 0) bursts.push({ kind: 'oops', playerIndex, by: next.players[playerIndex].id });
      resetCombo(mem);
      bumpVibe(mem, -5);
    } else if (e.kind === 'pass.put' || (e.kind === 'drop' && isCounterDrop(e.data))) {
      // An R-drop on the till or pickup counter puts the cup down just like E.
      const item = e.data.item as DrinkId;
      (mem.putters[item] ??= []).push(String(e.data.by));
    } else if (e.kind === 'till.rung') {
      const ringers = (mem.ringers ??= {});
      ringers[Number(e.data.customer)] = String(e.data.by ?? '');
      const ids = Object.keys(ringers);
      if (ids.length > 64) for (const id of ids.slice(0, ids.length - 64)) delete ringers[Number(id)];
    } else if (e.kind === 'pickup.take') {
      // Gear: the customer takes the cup themselves. Teamwork = one barista rang them up, another set the drink out.
      const item = e.data.drink as DrinkId;
      const from = mem.putters[item]?.shift() ?? String(e.data.by ?? '');
      const ringer = mem.ringers?.[Number(e.data.customer)];
      if (ringer && from && ringer !== from) {
        const name = (id: string) => next.players.find((p) => p.id === id)?.name ?? '?';
        bursts.push({ kind: 'teamwork', from: name(ringer), to: name(from) });
        bumpVibe(mem, 5);
        addCombo(mem, bursts);
      }
    } else if (e.kind === 'pass.serve' || e.kind === 'pass.take' || e.kind === 'pass.stale') {
      const item = e.data.item as DrinkId;
      const from = mem.putters[item]?.shift();
      const to = String(e.data.by ?? '');
      if (e.kind === 'pass.serve' && from && to && from !== to) {
        const name = (id: string) => next.players.find((p) => p.id === id)?.name ?? '?';
        bursts.push({ kind: 'teamwork', from: name(from), to: name(to) });
        bumpVibe(mem, 5);
        addCombo(mem, bursts);
      }
    } else if (e.kind === 'influencer' && e.data.result === 'served') {
      bursts.push({ kind: 'selfie' });
      bumpVibe(mem, 6);
    } else if (e.kind === 'slip') {
      bursts.push({ kind: 'slip', playerId: String(e.data.player ?? '') });
      resetCombo(mem);
      bumpVibe(mem, -4);
    } else if (e.kind === 'trash') {
      bursts.push({ kind: 'wrong', text: 'Dumped a drink' });
      resetCombo(mem);
      bumpVibe(mem, -2);
    } else if (e.kind === 'egg.nameMix' && e.data.refuse === 1) {
      bursts.push({ kind: 'wrong', text: 'Wrong name!' });
      resetCombo(mem);
      bumpVibe(mem, -3);
    } else if (e.kind === 'challenge.won') {
      bursts.push({ kind: 'challenge', label: String(e.data.label ?? e.data.id ?? 'Challenge'), reward: Number(e.data.reward) || 0 });
      bumpVibe(mem, 6);
    } else if (e.kind === 'rogue.stormed') {
      bursts.push({ kind: 'storm', count: 1 });
      resetCombo(mem);
      bumpVibe(mem, -8);
    }
  }

  // Storm-outs are tallied on today.lost (no dedicated log) — catch the delta.
  const lostNow = next.today.lost;
  if (lostNow > mem.lostSeen) {
    const n = lostNow - mem.lostSeen;
    // Rogue start also bumps lost; if we already emitted rogue.stormed this pass, skip double.
    const already = bursts.some((b) => b.kind === 'storm');
    if (!already) {
      bursts.push({ kind: 'storm', count: n });
      resetCombo(mem);
      bumpVibe(mem, -8 * Math.min(n, 3));
    }
  }
  mem.lostSeen = lostNow;

  return { bursts, lastSeq: Math.max(lastSeq, cursor) };
}

export interface BotLook {
  /** A green "NEW" sticker on the apron (rookie). */
  badge: boolean;
  /** Cool shades (veteran). */
  shades: boolean;
  /** Headphones (steady: in the zone). */
  headphones: boolean;
  /** A red sweatband instead of a cap (hurried: always mid-sprint). */
  headband: boolean;
  /** The little emote that pops up now and then, and how often (s). */
  emote: 'sweat' | 'note' | 'steam' | 'clock';
  every: number;
}

export function botLook(p: Personality): BotLook {
  switch (p) {
    case 'rookie':
      return { badge: true, shades: false, headphones: false, headband: false, emote: 'sweat', every: 4 };
    case 'veteran':
      return { badge: false, shades: true, headphones: false, headband: false, emote: 'steam', every: 7 };
    case 'hurried':
      // FB1: the hurried bot pulls cups early when the line backs up; dress it like a sprinter with a stopwatch
      return { badge: false, shades: false, headphones: false, headband: true, emote: 'clock', every: 3 };
    default:
      return { badge: false, shades: false, headphones: true, headband: false, emote: 'note', every: 6 };
  }
}

/** 0..1 progress of the emote bubble if one is showing at time t (each bot offset by its index), else null. */
export function emotePhase(t: number, index: number, every: number, length = 1.3): number | null {
  const local = (t + index * 1.7) % every;
  return local < length ? local / length : null;
}

/** Bot name tag text. */
export const botTag = (name: string) => `${name} \u00b7 bot`;

/** Label + tone for the HUD vibe chip. */
export function vibeLabel(vibe: number): { text: string; tone: 'high' | 'mid' | 'low' } {
  if (vibe >= 75) return { text: 'Buzzing', tone: 'high' };
  if (vibe >= 45) return { text: 'Steady', tone: 'mid' };
  return { text: 'Rough', tone: 'low' };
}
