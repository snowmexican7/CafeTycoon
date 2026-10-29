import { describe, it, expect } from 'vitest';
import { createRun, startDay } from './run';
import { addCustomer } from './customers';
import { interact } from './stations';
import { finishDay } from './closing';
import { validateInput } from './validate';
import { applySignatureInput, cleanName, SIG, sigRating, sigShare } from './signature';
import { comboStars, TASTE, TWISTS } from './taste';
import { nightViewModel } from '../ui/viewModels';
import type { GameState, PlayerInput } from './types';

const run = (seed = 1) => createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
type SigInput = Extract<PlayerInput, { kind: 'signature' }>;
const input = (sig: SigInput['sig']): SigInput => ({ kind: 'signature', playerId: 'p1', sig });
const serve = (s: GameState, sig: boolean) => {
  s.players[0].holding = 'latte';
  s.players[0].pos = { x: 6, y: 5.1 };
  s.customers = [{ id: 1, drink: 'latte', patienceLeft: 500, patienceMax: 1000, ...(sig ? { sig: true as const } : {}) }];
  return interact(s, 'p1');
};

describe('signature drink (P3 B7)', () => {
  it('is designed at night only, cleans its name, and keeps `since` until the recipe changes', () => {
    const s = run();
    s.phase = 'night';
    applySignatureInput(s, input({ name: '  Honey   <Haze> ', drink: 'latte', twist: 'honey', premium: 2 }));
    expect(s.signature).toEqual({ name: 'Honey Haze', drink: 'latte', twist: 'honey', premium: 2, since: s.day });
    s.day = 4;
    applySignatureInput(s, input({ name: 'HH', drink: 'latte', twist: 'honey', premium: 3 }));
    expect(s.signature!.since).toBe(1);
    applySignatureInput(s, input({ name: 'HH', drink: 'latte', twist: 'oat', premium: 3 }));
    expect(s.signature!.since).toBe(4);
    applySignatureInput(s, input(null));
    expect(s.signature).toBeUndefined();
    const d = startDay(run());
    applySignatureInput(d, input({ name: 'x', drink: 'latte', twist: 'honey', premium: 0 }));
    expect(d.signature).toBeUndefined();
    expect(cleanName('', 'latte', 'vanilla')).toBe('Vanilla latte');
    expect(cleanName('x'.repeat(40), 'latte', 'vanilla')).toHaveLength(SIG.nameMax);
    expect(validateInput(input({ name: 'a', drink: 'latte', twist: 'honey', premium: 99 }))).toBeNull();
    expect(validateInput(input({ name: 'a', drink: 'latte', twist: 'gravy' as never, premium: 1 }))).toBeNull();
    expect(validateInput(input(null))).toEqual(input(null));
  });

  it('brings walk-ins who ask for it, fewer at a higher premium', () => {
    const count = (premium: number) => {
      const s = startDay(run(5));
      s.signature = { name: 'Sig', drink: 'latte', twist: 'honey', premium, since: 1 };
      let n = 0;
      for (let i = 0; i < 2000; i++) {
        const c = addCustomer(s, 'normal');
        if (c?.sig) {
          n++;
          expect(c.drink).toBe('latte');
        }
        s.customers = [];
      }
      return n;
    };
    const low = count(0);
    const high = count(6);
    expect(low / 2000).toBeCloseTo(SIG.share, 1);
    expect(high).toBeLessThan(low);
    expect(sigShare({ name: '', drink: 'latte', twist: 'oat', premium: 6, since: 1 })).toBeCloseTo(SIG.share * 0.4, 5);
  });

  it('sells at the premium with the signature twist, pays a bonus at 4-5★ and shows on the receipt', () => {
    const seed = 7;
    const best = TWISTS.find((t) => comboStars(seed, 'latte', t) === 5)!;
    let s = startDay(run(seed));
    s.scenario = 'normal';
    s.signature = { name: 'Best', drink: 'latte', twist: best, premium: 2, since: 1 };
    s = serve(s, true);
    expect(s.tasteBook?.[`latte:${best}`]).toBe(5); // the signature's twist, though no house twist is set
    expect(s.today.sigServed).toBe(1);
    expect(s.today.sigBonus).toBe(SIG.bonus[5]);
    expect(s.today.sales).toBeCloseTo(4.75 + 1, 2);
    const plainCash = s.cash;
    s = serve(s, false); // a plain latte customer: list price, no twist, no bonus
    expect(s.today.sigServed).toBe(1);
    expect(s.cash - plainCash).toBeCloseTo(4.75 + 0.87, 2);
    s = finishDay(s);
    const t = nightViewModel(s, 'p1').takings!;
    expect(t.sigSold).toBe(1);
    expect(t.sigBonus).toBe('$1.50');
    expect(TASTE.tip[1]).toBeLessThan(0.6); // the flop is a real risk (P3 B7 lever)
  });

  it('a flop signature costs rating; the effect is capped', () => {
    expect(sigRating({ sigStarSum: -2 } as never)).toBeCloseTo(-2 * SIG.repPerServe, 5);
    expect(sigRating({ sigStarSum: -500 } as never)).toBe(-SIG.repCap);
    expect(sigRating({ sigStarSum: 500 } as never)).toBe(SIG.repCap);
  });
});
