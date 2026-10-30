import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import type { GameState, SimEvent } from '../sim/types';
import { botLook, botTag, crewBursts, tillText, emotePhase, newCrewMemory, toastText, vibeLabel, VIBE_START } from './crewModel';

const run = () => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Dev' }] });
const clone = (s: GameState): GameState => structuredClone(s);
function withLog(s: GameState, ...entries: Omit<SimEvent, 'seq' | 'tick'>[]): GameState {
  const n = clone(s);
  for (const e of entries) n.log.push({ ...e, seq: n.nextLogSeq++, tick: n.tick });
  return n;
}

describe('crew visuals model', () => {
  it('writes the serve toast', () => {
    expect(toastText('Dev', 'latte', 6.1)).toBe('Dev served a latte +$6.10');
    expect(toastText('Ana', 'espresso', 3)).toBe('Ana served an espresso +$3.00');
    expect(toastText('Bo', 'coldBrew', 4.5)).toBe('Bo served a cold brew +$4.50');
  });

  it('turns served, bot-mistake and influencer entries into bursts, once', () => {
    const a = run();
    a.players.push({ ...structuredClone(a.players[0]), id: 'bot1', name: 'Bo', bot: { personality: 'rookie' } as never });
    const b = withLog(
      a,
      { kind: 'served', data: { by: 'p2', item: 'latte', amount: 6.1, kind: 'regular', name: 'Ada', cid: 4, perfect: true, left: 0 } },
      { kind: 'bot.mistake', data: { bot: 'Bo', drink: 'latte' } },
      { kind: 'influencer', data: { result: 'served' } },
      { kind: 'pass.serve', data: { by: 'p1', item: 'latte' } },
    );
    const r = crewBursts(a, b, a.nextLogSeq - 1);
    expect(r.bursts.filter((x) => x.kind !== 'teamwork')).toEqual([
      { kind: 'serve', text: 'Dev served a latte +$6.10', by: 'p2', playerIndex: 1, perfect: true, customerKind: 'regular', regular: 'Ada', cid: 4 },
      { kind: 'oops', playerIndex: 2, by: 'bot1' },
      { kind: 'selfie' },
    ]);
    expect(crewBursts(b, clone(b), r.lastSeq).bursts).toEqual([]);
    expect(crewBursts(null, b, -1).bursts).toEqual([]);
  });

  it('dresses each bot personality differently', () => {
    expect(botLook('rookie')).toMatchObject({ badge: true, emote: 'sweat' });
    expect(botLook('veteran')).toMatchObject({ shades: true, emote: 'steam' });
    expect(botLook('steady')).toMatchObject({ headphones: true, emote: 'note' });
    expect(botLook('hurried')).toMatchObject({ headband: true, headphones: false, emote: 'clock' });
    expect(botLook('hurried').every).toBeLessThan(botLook('steady').every);
    expect(botTag('Bo')).toBe('Bo \u00b7 bot');
  });

  it('pops emotes briefly and staggers bots', () => {
    expect(emotePhase(0, 0, 4)).toBe(0);
    expect(emotePhase(2, 0, 4)).toBeNull();
    const shown = Array.from({ length: 400 }, (_, i) => emotePhase(i / 20, 0, 4) !== null).filter(Boolean).length;
    expect(shown / 400).toBeCloseTo(1.3 / 4, 1);
    expect(emotePhase(0.5, 1, 4)).not.toBe(emotePhase(0.5, 0, 4));
  });
});

describe('co-op cheers', () => {
  it('cheers a hand-off when one barista parks a drink and another serves it', () => {
    const a = run();
    const mem = newCrewMemory();
    const b = withLog(a, { kind: 'pass.put', data: { by: 'p1', item: 'latte' } }, { kind: 'pass.put', data: { by: 'p2', item: 'latte' } });
    let r = crewBursts(a, b, a.nextLogSeq - 1, mem);
    expect(r.bursts).toEqual([]);
    const c = withLog(b, { kind: 'pass.serve', data: { by: 'p2', item: 'latte' } }, { kind: 'pass.serve', data: { by: 'p2', item: 'latte' } });
    r = crewBursts(b, c, r.lastSeq, mem);
    // first latte was Ana's (served by Dev: teamwork), the second was Dev's own
    expect(r.bursts).toEqual([{ kind: 'teamwork', from: 'Ana', to: 'Dev' }]);
  });

  it('shouts out a perfect-serve streak every three in a row', () => {
    const a = run();
    const mem = newCrewMemory();
    const serve = (perfect: boolean) => ({ kind: 'served' as const, data: { by: 'p1', item: 'latte', amount: 5, kind: 'normal', cid: 1, perfect, left: 0 } });
    const b = withLog(a, serve(true), serve(true), serve(false), serve(true), serve(true), serve(true), serve(true), serve(true), serve(true));
    const streaks = crewBursts(a, b, a.nextLogSeq - 1, mem).bursts.filter((x) => x.kind === 'streak');
    expect(streaks).toEqual([{ kind: 'streak', count: 3 }, { kind: 'streak', count: 6 }]);
  });
});


describe('juice pass', () => {
  it('counts teamwork hand-offs toward the combo streak', () => {
    const a = run();
    const mem = newCrewMemory();
    const b = withLog(a, { kind: 'pass.put', data: { by: 'p1', item: 'latte' } });
    let r = crewBursts(a, b, a.nextLogSeq - 1, mem);
    const c = withLog(
      b,
      { kind: 'pass.serve', data: { by: 'p2', item: 'latte' } },
      { kind: 'served', data: { by: 'p2', item: 'latte', amount: 5, kind: 'normal', cid: 1, perfect: true, left: 0 } },
      { kind: 'served', data: { by: 'p1', item: 'latte', amount: 5, kind: 'normal', cid: 2, perfect: true, left: 0 } },
    );
    r = crewBursts(b, c, r.lastSeq, mem);
    expect(r.bursts.filter((x) => x.kind === 'streak')).toEqual([{ kind: 'streak', count: 3 }]);
    expect(mem.streak).toBe(3);
    expect(mem.vibe).toBeGreaterThan(VIBE_START);
  });

  it('resets the combo and dips vibe on a slip or storm-out', () => {
    const a = run();
    const mem = newCrewMemory();
    mem.streak = 2;
    mem.vibe = 70;
    mem.lostSeen = a.today.lost;
    const b = withLog(a, { kind: 'slip', data: { player: 'p1', x: 1, y: 1 } });
    let r = crewBursts(a, b, a.nextLogSeq - 1, mem);
    expect(r.bursts.some((x) => x.kind === 'slip')).toBe(true);
    expect(mem.streak).toBe(0);
    expect(mem.vibe).toBeLessThan(70);

    const c = clone(b);
    c.today.lost = b.today.lost + 1;
    mem.vibe = 60;
    r = crewBursts(b, c, r.lastSeq, mem);
    expect(r.bursts).toContainEqual({ kind: 'storm', count: 1 });
    expect(mem.vibe).toBeLessThan(60);
  });

  it('cheers a won challenge and labels vibe bands', () => {
    const a = run();
    const mem = newCrewMemory();
    const b = withLog(a, { kind: 'challenge.won', data: { id: 'perfect8', reward: 12, label: 'Serve 8 perfect' } });
    const r = crewBursts(a, b, a.nextLogSeq - 1, mem);
    expect(r.bursts).toContainEqual({ kind: 'challenge', label: 'Serve 8 perfect', reward: 12 });
    expect(vibeLabel(80).tone).toBe('high');
    expect(vibeLabel(50).tone).toBe('mid');
    expect(vibeLabel(20).tone).toBe('low');
  });
});

describe('Gear polish: till tip in the serve toast', () => {
  it('shows the fast hand-off tip only when there is one', () => {
    expect(tillText(0.5)).toBe(' · 🧾 +$0.50');
    expect(tillText(undefined)).toBe('');
    expect(tillText(0)).toBe('');
  });
});
