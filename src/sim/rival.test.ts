import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { step } from './step';
import { validateInput } from './validate';
import { applyScoutInput, copyIsLive, daysToCopy, RIVAL, rivalAskFactor, rivalMenu, rivalMorning, sigPrice } from './rival';
import { ECONOMY } from '../data/economy';
import { nightViewModel } from '../ui/viewModels';
import type { GameState } from './types';

const run = (seed = 1) => createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
const withSig = (s: GameState, premium = 2, since = 1) => {
  s.signature = { name: 'Honey Haze', drink: 'latte', twist: 'honey', premium, since };
  return s;
};

describe('rival Starbuck$ (P3 B9)', () => {
  it('scouts once a night for a fee, humans only, and shows its menu and the signature watch', () => {
    const s = withSig(run());
    s.phase = 'night';
    s.day = 2;
    expect(nightViewModel(s, 'p1').rival.menu).toBeUndefined();
    const cash = s.cash;
    applyScoutInput(s, { kind: 'scout', playerId: 'p1' });
    expect(s.cash).toBe(cash - RIVAL.scoutCost);
    applyScoutInput(s, { kind: 'scout', playerId: 'p1' });
    expect(s.cash).toBe(cash - RIVAL.scoutCost); // once a night
    const r = nightViewModel(s, 'p1').rival;
    expect(r.scouted).toBe(true);
    expect(r.menu!.length).toBeGreaterThan(0);
    expect(r.eyeing).toBe(2); // set day 1, copied the morning of day 4; tomorrow is day 2
    expect(rivalMenu(s)).toEqual(rivalMenu(s)); // pure
    for (const x of rivalMenu(s)) expect(x.price).toBeLessThanOrEqual(ECONOMY.prices[x.drink] * 1.05 + 0.13);
    const d = startDay(run());
    applyScoutInput(d, { kind: 'scout', playerId: 'p1' });
    expect(d.rival).toBeUndefined(); // day: no
    expect(validateInput({ kind: 'scout', playerId: 'p1' })).toEqual({ kind: 'scout', playerId: 'p1' });
    const b = run();
    b.phase = 'night';
    b.players[0].bot = {} as never; // a bot seat
    applyScoutInput(b, { kind: 'scout', playerId: 'p1' });
    expect(b.rival).toBeUndefined(); // bots can't scout
  });

  it('copies a signature after a few days, undercuts, and halves the asks', () => {
    const s = withSig(run());
    s.day = 3;
    expect(rivalMorning(s)).toBeNull();
    expect(daysToCopy(s)).toBe(1);
    s.day = 4;
    const note = rivalMorning(s)!;
    expect(note).toMatch(/Starbuck\$.*knock-off.*Honey Haze/);
    expect(copyIsLive(s)).toBe(true);
    expect(s.rival!.copy!.price).toBe(sigPrice(s, s.signature!) - RIVAL.undercut);
    expect(rivalAskFactor(s)).toBe(RIVAL.askCut);
    // Through startDay too: the note lands in the morning notes.
    const t = withSig(run());
    t.day = 4;
    expect(startDay(t).morningNotes.some((n) => n.includes('knock-off'))).toBe(true);
  });

  it('counter-moves: matching the price softens it (until a re-undercut); a new recipe resets it', () => {
    const s = withSig(run(), 2);
    s.day = 4;
    rivalMorning(s);
    s.signature!.premium = 1; // −$0.50: now level with the knock-off
    expect(rivalAskFactor(s)).toBe(RIVAL.matchedCut);
    s.day = 6;
    expect(rivalMorning(s)).toBeNull(); // not yet
    s.day = 7;
    expect(rivalMorning(s)).toMatch(/cut its/);
    expect(rivalAskFactor(s)).toBe(RIVAL.askCut);
    // The floor stops a price war at 75% of list.
    s.signature!.premium = 0;
    s.priceSteps = { latte: -4 };
    s.day = 10;
    rivalMorning(s);
    expect(s.rival!.copy!.price).toBeGreaterThanOrEqual(Math.round(ECONOMY.prices.latte * RIVAL.floor * 100) / 100);
    // A new recipe isn't copied yet.
    s.signature = { name: 'Oat Cloud', drink: 'latte', twist: 'oat', premium: 2, since: 10 };
    expect(copyIsLive(s)).toBe(false);
    expect(rivalAskFactor(s)).toBe(1);
    expect(daysToCopy(s)).toBe(3);
  });

  it('leaves runs without a signature on the same RNG stream and shape', () => {
    let a = startDay(run(21));
    let b = startDay(run(21));
    for (let i = 0; i < 900; i++) {
      a = step(a, []);
      b = step(b, []);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.rival).toBeUndefined();
  });
});
