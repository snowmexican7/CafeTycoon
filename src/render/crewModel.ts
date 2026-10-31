import { sinkToast, SINK_ID } from './sinkModel';
import { fridgeLabel, fridgeToast, isFridgeEvent } from './fridgeModel';
import { handmadeToast, isHandmadeEvent } from './handmadeModel';
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
  | { kind: 'challenge'; label: string; reward: number }
  /** Gear: a drip / cold brew drinker found the condiment bar empty (said out loud, they are already gone). */
  | { kind: 'grumble'; text: string }
  /** Gear morning: the taps were filled (`paid` of `cups` fresh tonight, the rest yesterday's). */
  | { kind: 'steep'; cups: number; paid: number }
  /** The branch phone was picked up (`by` is a name) or left to ring. */
  | { kind: 'call'; by: string; take: boolean; call: 'order' | 'machine' }
  /** 3.3.3 (FB2 A2/A3): a sink, pot, leak or cold-cup line, toasted over `at` (a station id; absent = mid-floor). */
  | { kind: 'note'; text: string; tone: 'good' | 'warn' | 'bad'; at?: string }
  /**
   * ui-3.5.1 (pre-wired for Claude's `customer.bump` log entry): a customer someone walked into says so in a
   * speech bubble at (x, y) in tiles (absent = over the queue).
   */
  | { kind: 'bumpSay'; text: string; x?: number; y?: number };

/** ui-3.5.1: Claude's planned log kind (not in SimEvent's union yet; widen the check until it lands). */
export const CUSTOMER_BUMP = 'customer.bump' as const;

/** ui-3.5.1: what a bumped customer says (picked by log seq, so every client shows the same line). */
export const BUMP_LINES = ['Hey, watch it!', 'Oof! Careful!', 'Excuse you!', 'Mind the coffee!'] as const;
export function bumpLine(seq: number, text?: unknown): string {
  return typeof text === 'string' && text.trim() ? text.trim().slice(0, 40) : BUMP_LINES[Math.abs(seq) % BUMP_LINES.length];
}

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
    } else if (e.kind === 'condiment.black') {
      bursts.push({ kind: 'grumble', text: String(e.data.text ?? 'Black, I guess.') });
      bumpVibe(mem, -1);
    } else if (e.kind === 'sink.dump' || e.kind === 'pot.stale' || e.kind === 'bin.leak' || e.kind === 'pickup.cold') {
      const text = sinkToast(e, (id) => next.players.find((p) => p.id === id)?.name ?? 'Someone', null);
      if (text) {
        const tone = e.kind === 'sink.dump' ? 'good' : e.kind === 'pot.stale' ? 'warn' : 'bad';
        const at = e.kind === 'sink.dump' ? SINK_ID : e.kind === 'pot.stale' ? String(e.data.station ?? '') : e.kind === 'bin.leak' ? String(e.data.at ?? '') : undefined;
        bursts.push({ kind: 'note', text, tone, ...(at ? { at } : {}) });
      }
      if (e.kind === 'bin.leak') bumpVibe(mem, -2);
      if (e.kind === 'pickup.cold') {
        resetCombo(mem);
        bumpVibe(mem, -3);
      }
    } else if (isFridgeEvent(e.kind)) {
      // ui-3.4.1 (FB2 A4): the fridge's lines rise over the fridge (or the steamer, or the condiment bar)
      const t = fridgeToast(e, (id) => next.players.find((p) => p.id === id)?.name ?? 'Someone', fridgeLabel(next));
      if (t) bursts.push({ kind: 'note', text: t.text, tone: t.tone, ...(t.at ? { at: t.at } : {}) });
      if (e.kind === 'supply.spoil') bumpVibe(mem, -2);
    } else if (isHandmadeEvent(e.kind)) {
      // FB2 B8: jug fill, steam result, syrup add / miss
      const t = handmadeToast(e, (id) => next.players.find((p) => p.id === id)?.name ?? 'Someone');
      if (t) bursts.push({ kind: 'note', text: t.text, tone: t.tone, ...(t.at ? { at: t.at } : {}) });
      if (e.kind === 'syrup.miss') {
        resetCombo(mem);
        bumpVibe(mem, -2);
      } else if (e.kind === 'steam.result' && e.data.grade === 'perfect') {
        bumpVibe(mem, 2);
      } else if (e.kind === 'steam.result' && e.data.grade === 'miss') {
        bumpVibe(mem, -1);
      }
    } else if (e.kind === 'steep') {
      bursts.push({ kind: 'steep', cups: Number(e.data.cups) || 0, paid: Number(e.data.paid) || 0 });
    } else if (e.kind === 'call.answer') {
      bursts.push({ kind: 'call', by: String(e.data.by ?? 'Someone'), take: e.data.take === true, call: e.data.kind === 'machine' ? 'machine' : 'order' });
    } else if (e.kind === CUSTOMER_BUMP) {
      const x = Number(e.data.x);
      const y = Number(e.data.y);
      bursts.push({ kind: 'bumpSay', text: bumpLine(e.seq, e.data.text), ...(Number.isFinite(x) && Number.isFinite(y) ? { x, y } : {}) });
    } else if (e.kind === 'rogue.stormed') {
      bursts.push({ kind: 'storm', count: 1 });
      resetCombo(mem);
      bumpVibe(mem, -8);
    } else if (e.kind === 'station.reset') {
      // FB2 C10: layout snapped back after a grow or gear change.
      bursts.push({ kind: 'note', text: 'Bar layout went back to the default', tone: 'warn' });
    } else if (e.kind === 'station.place') {
      const to = e.data.to as { x?: number; y?: number } | undefined;
      const at = typeof e.data.station === 'string' ? String(e.data.station) : undefined;
      bursts.push({
        kind: 'note',
        text: e.data.swapped === true ? 'Swapped!' : 'Placed!',
        tone: 'good',
        ...(at ? { at } : {}),
      });
      void to;
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
