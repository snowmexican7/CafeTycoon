import { CHALLENGES, challengeById, dayCurveFor, dayOfWeekIndex, type ChallengeDef, type ChallengeKind } from '../data/challenges';
import { ECONOMY } from '../data/economy';
import { canMake } from './growth';
import { emitLog } from './log';
import { rngInt, rngNext, seedRng } from './rng';
import type { ChallengeProgress, GameState } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function needOf(goal: ChallengeKind): number {
  switch (goal.kind) {
    case 'perfect':
    case 'serve':
    case 'sellDrink':
      return goal.need;
    case 'floor':
      return goal.min;
    case 'noStorms':
    case 'noSpills':
    case 'beforeGrace':
    case 'serveInfluencer':
      return 1;
  }
}

/** Eligible defs for this day given unlocks and today's scheduled events. */
export function eligibleChallenges(state: GameState): ChallengeDef[] {
  const dow = dayOfWeekIndex(state.day) + 1;
  const hasInfluencer =
    state.eventSchedule.some((e) => e.kind === 'influencerVisit') ||
    (state.radio?.day === state.day && !!state.radio.events.some((e) => e.kind === 'influencerVisit'));
  return CHALLENGES.filter((c) => {
    if (c.fromDay > dow) return false;
    if (c.needsDrink && !state.unlocked.includes(c.needsDrink)) return false;
    // FB2 C9: a Gear bar with no wand (or no other station the drink needs) gets no challenge for it.
    if (c.needsDrink && state.gear === true && !canMake(state, c.needsDrink)) return false;
    if (c.needsInfluencer && !hasInfluencer) return false;
    return true;
  });
}

/**
 * Independent stream for deals so challenge picks never perturb event/customer draws
 * (weather radio, schedules, and bots stay bit-identical to pre-B7).
 */
function challengeRng(state: GameState): { rng: number } {
  return { rng: seedRng((state.seed ^ Math.imul(state.day, 0x9e3779b9)) >>> 0) };
}

/** Deal 1–2 optional challenges for `state.day`. Call at startNight (paper); pruned at startDay. */
export function dealChallenges(state: GameState): ChallengeProgress[] {
  const pool = eligibleChallenges(state);
  if (pool.length === 0) return [];
  const rng = challengeRng(state);
  const want = state.day === 1 || dayOfWeekIndex(state.day) < 2 ? 1 : rngNext(rng) < 0.55 ? 1 : 2;
  const picks: ChallengeDef[] = [];
  const remaining = [...pool];
  const n = Math.min(want, remaining.length);
  for (let i = 0; i < n; i++) {
    const at = rngInt(rng, remaining.length);
    picks.push(remaining.splice(at, 1)[0]!);
  }
  picks.sort((a, b) => CHALLENGES.findIndex((c) => c.id === a.id) - CHALLENGES.findIndex((c) => c.id === b.id));
  return picks.map((c) => ({
    id: c.id,
    label: c.label,
    blurb: c.blurb,
    need: needOf(c.goal),
    have: c.goal.kind === 'floor' ? 100 : 0,
    reward: c.reward,
    done: false,
    failed: false,
  }));
}

/** Live progress for one challenge from today's stats. Mutates `ch` in place. */
export function refreshChallenge(state: GameState, ch: ChallengeProgress): void {
  if (ch.done || ch.failed) return;
  const def = challengeById[ch.id];
  if (!def) return;
  const t = state.today;
  switch (def.goal.kind) {
    case 'perfect':
      ch.have = t.perfect ?? 0;
      if (ch.have >= ch.need) ch.done = true;
      break;
    case 'serve':
      ch.have = t.served;
      if (ch.have >= ch.need) ch.done = true;
      break;
    case 'sellDrink': {
      ch.have = t.drinks?.[def.goal.drink] ?? 0;
      if (ch.have >= ch.need) ch.done = true;
      break;
    }
    case 'floor': {
      const clean = Math.floor(state.cleanliness);
      ch.have = Math.min(ch.have, clean);
      if (clean < def.goal.min) {
        ch.failed = true;
        ch.have = clean;
      }
      break;
    }
    case 'noStorms':
      ch.have = t.lost === 0 ? 1 : 0;
      if (t.lost > 0) ch.failed = true;
      break;
    case 'noSpills':
      ch.have = (t.wasted ?? 0) === 0 ? 1 : 0;
      if ((t.wasted ?? 0) > 0) ch.failed = true;
      break;
    case 'serveInfluencer':
      ch.have = t.influencer === 'served' ? 1 : 0;
      if (t.influencer === 'lost') ch.failed = true;
      if (t.influencer === 'served') ch.done = true;
      break;
    case 'beforeGrace':
      break;
  }
}

/** Call once when the day phase ends and closing begins: empty shop = beforeGrace success. */
export function markBeforeGrace(state: GameState): void {
  for (const ch of state.challenges ?? []) {
    if (ch.done || ch.failed) continue;
    const def = challengeById[ch.id];
    if (def?.goal.kind !== 'beforeGrace') continue;
    const empty = state.customers.length === 0 && !state.rogue;
    ch.have = empty ? 1 : 0;
    if (empty) ch.done = true;
    else ch.failed = true;
  }
}

/** After events are scheduled: drop influencer goals that can't fire; redeal if that emptied the list. */
export function pruneChallenges(state: GameState): void {
  const list = state.challenges ?? [];
  if (!list.length) {
    state.challenges = dealChallenges(state);
    return;
  }
  const hasInfluencer = state.eventSchedule.some((e) => e.kind === 'influencerVisit');
  const kept = list.filter((ch) => {
    const def = challengeById[ch.id];
    return !(def?.needsInfluencer && !hasInfluencer);
  });
  state.challenges = kept.length ? kept : dealChallenges(state);
}

/** Refresh every live challenge (cheap; call from the day step). */
export function tickChallenges(state: GameState): void {
  if (!state.challenges?.length) return;
  for (const ch of state.challenges) refreshChallenge(state, ch);
}

/**
 * At closing: finish open-ended goals, pay rewards into today.bonus + cash.
 */
export function settleChallenges(state: GameState): { paid: number; won: ChallengeProgress[] } {
  const won: ChallengeProgress[] = [];
  let paid = 0;
  for (const ch of state.challenges ?? []) {
    const def = challengeById[ch.id];
    if (!def) continue;
    if (!ch.done && !ch.failed) {
      switch (def.goal.kind) {
        case 'floor':
          if (ch.have >= def.goal.min) ch.done = true;
          else ch.failed = true;
          break;
        case 'noStorms':
          if (state.today.lost === 0) {
            ch.have = 1;
            ch.done = true;
          } else ch.failed = true;
          break;
        case 'noSpills':
          if ((state.today.wasted ?? 0) === 0) {
            ch.have = 1;
            ch.done = true;
          } else ch.failed = true;
          break;
        case 'beforeGrace':
          if (!ch.done) ch.failed = true;
          break;
        default:
          break;
      }
    }
    if (ch.done && !ch.failed) {
      paid = round2(paid + ch.reward);
      won.push(ch);
      emitLog(state, 'challenge.won', { id: ch.id, reward: ch.reward, label: ch.label });
    }
  }
  if (paid > 0) {
    state.cash = round2(state.cash + paid);
    state.today.bonus = round2((state.today.bonus ?? 0) + paid);
    state.today.challengeBonus = paid;
    state.today.challengesWon = won.map((c) => c.id);
  }
  return { paid, won };
}

/** Plain progress line for the HUD chip. */
export function challengeChipText(ch: ChallengeProgress): string {
  const def = challengeById[ch.id];
  if (!def) return ch.label;
  if (ch.done) return `✓ ${ch.label}`;
  if (ch.failed) return `✗ ${ch.label}`;
  switch (def.goal.kind) {
    case 'perfect':
    case 'serve':
    case 'sellDrink':
      return `${ch.have}/${ch.need} · ${ch.label}`;
    case 'floor':
      return `Floor ${ch.have}% · ${def.goal.min}%+`;
    case 'noStorms':
      return 'No storm-outs';
    case 'noSpills':
      return 'No spills';
    case 'beforeGrace':
      return 'Clear before close';
    case 'serveInfluencer':
      return 'Serve the influencer';
  }
}

/** Soft event-count shift from the day curve: adjusted [w0, w1, w2] that still sum to 1. */
export function scheduleWeightsForDay(day: number): [number, number, number] {
  const [w0, , w2] = ECONOMY.events.scheduleWeights;
  const bias = dayCurveFor(day).eventBias;
  let a = w0 - bias * 0.5;
  let c = w2 + bias * 0.45;
  a = Math.min(0.55, Math.max(0.08, a));
  c = Math.min(0.4, Math.max(0.08, c));
  let b = 1 - a - c;
  if (b < 0.2) {
    const fix = 0.2 - b;
    a -= fix / 2;
    c -= fix / 2;
    b = 0.2;
  }
  const sum = a + b + c;
  return [a / sum, b / sum, c / sum];
}
