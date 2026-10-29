import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { validateInput } from './validate';
import { applyPitchInput, cleanPitch, judgePitch, PITCH } from './pitch';
import { computeModifiers } from './effects';
import { nightViewModel } from '../ui/viewModels';
import type { GameState, PitchKind } from './types';

const run = (seed = 1) => {
  const s = createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
  s.phase = 'night';
  return s;
};
const pitch = (s: GameState, text: string, pitchKind: PitchKind = 'promo') => applyPitchInput(s, { kind: 'pitch', playerId: 'p1', pitchKind, text });

const GOOD = 'Cozy rainy morning deal: bring a friend and family, fresh latte with vanilla, loyalty card double stamps';
const BAD = 'CRYPTO SYNERGY NFT';

describe('pitch an idea (P3 B11)', () => {
  it('scores on keywords, purely: the same pitch always gets the same verdict', () => {
    const s = run();
    const a = judgePitch(s, 'promo', GOOD);
    expect(judgePitch(s, 'promo', GOOD)).toEqual(a);
    expect(a.total).toBeGreaterThanOrEqual(PITCH.ovation);
    expect(a.tier).toBe('ovation');
    expect(a.scores).toHaveLength(3);
    expect(a.verdicts.every((v) => v.length > 0)).toBe(true);
    expect(a.notes.some((n) => n.includes('knowing the menu'))).toBe(true);
    const b = judgePitch(s, 'promo', BAD);
    expect(b.tier).toBe('passed');
    expect(b.notes).toEqual(expect.arrayContaining(['buzzwords: the panel groans', 'too short to judge']));
    expect(b.scores[2]).toBeGreaterThan(b.scores[0]); // Chad secretly loves buzzwords
    const plain = judgePitch(s, 'item', 'We could maybe sell some coffee things tomorrow');
    expect(plain.tier === 'passed' || plain.tier === 'meh').toBe(true);
    // shouting costs points; repeating last night's pitch is booed
    expect(judgePitch(s, 'promo', GOOD.toUpperCase()).total).toBeLessThan(a.total);
    expect(judgePitch(s, 'promo', GOOD, GOOD.toLowerCase()).total).toBeLessThan(a.total);
  });

  it('cleans text and validates input', () => {
    expect(cleanPitch('  hi\n\tthere  ')).toBe('hi there');
    expect(cleanPitch('x'.repeat(300))).toHaveLength(PITCH.maxLen);
    expect(validateInput({ kind: 'pitch', playerId: 'p1', pitchKind: 'item', text: ' a  b ' })).toEqual({ kind: 'pitch', playerId: 'p1', pitchKind: 'item', text: 'a b' });
    expect(validateInput({ kind: 'pitch', playerId: 'p1', pitchKind: 'nft' as PitchKind, text: 'hello' })).toBeNull();
    expect(validateInput({ kind: 'pitch', playerId: 'p1', pitchKind: 'promo', text: '   ' })).toBeNull();
    expect(validateInput({ kind: 'pitch', playerId: 'p1', pitchKind: 'promo', text: 'x'.repeat(500) })).toBeNull();
  });

  it('one pitch a night, humans only, at night only', () => {
    const s = run();
    pitch(s, GOOD);
    expect(s.pitch?.by).toBe('K');
    expect(s.pitch?.day).toBe(s.day);
    const first = s.pitch;
    pitch(s, BAD);
    expect(s.pitch).toBe(first);
    const bot = run();
    bot.players[0].bot = {} as never;
    pitch(bot, GOOD);
    expect(bot.pitch).toBeUndefined();
    const day = startDay(run());
    pitch(day, GOOD);
    expect(day.pitch).toBeUndefined();
  });

  it('a green-lit promo lifts traffic, a green-lit item lifts tips, a flop does nothing', () => {
    const base = computeModifiers(run());
    const promo = run();
    pitch(promo, GOOD, 'promo');
    expect(computeModifiers(promo).traffic).toBeCloseTo(base.traffic * PITCH.boost.promo.ovation);
    const item = run();
    pitch(item, 'Fresh house-made honey oat latte, slow pour with real crema and rich roast taste, cozy and warm', 'item');
    expect(item.pitch!.tier === 'greenlit' || item.pitch!.tier === 'ovation').toBe(true);
    expect(computeModifiers(item).tipRate).toBeGreaterThan(base.tipRate);
    const flop = run();
    pitch(flop, BAD);
    expect(computeModifiers(flop)).toEqual(base);
    // morning note, then the boost is spent the night after
    startDay(promo);
    expect(promo.morningNotes.some((n) => n.startsWith('🎤 K'))).toBe(true);
    promo.day += 1;
    promo.phase = 'night';
    const plain = run();
    plain.day = promo.day;
    expect(computeModifiers(promo).traffic).toBeCloseTo(computeModifiers(plain).traffic);
  });

  it('shows the panel on the night view and leaves pitch-free runs untouched', () => {
    const s = run();
    expect(nightViewModel(s, 'p1').pitch.result).toBeUndefined();
    pitch(s, GOOD);
    const r = nightViewModel(s, 'p1').pitch.result!;
    expect(r.total).toBe(s.pitch!.total);
    expect(r.scores.map((x) => x.name)).toEqual(['Gordon Grind', 'Auntie Foam', 'Chad from Marketing']);
    expect(r.boost).toBe('+8% walk-ins tomorrow');
    let a = startDay(run(41));
    let b = startDay(run(41));
    for (let i = 0; i < 600; i++) {
      a = step(a, []);
      b = step(b, []);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.pitch).toBeUndefined();
  });
});
