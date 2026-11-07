import { describe, expect, it } from 'vitest';
import { FILL_DWELL_WIDTH, HANDMADE, JUG_LINES, WAND_EASE, fillGrade, fillLevel, steamGrade, steamWindow, wandEase, type WandEase } from './handmade';
import type { Station } from './types';

// Bot cut Phase 3 (Kennedy 2026-11-06): a better steam wand makes the hand-made meters easier, not faster.
const EASES: WandEase[] = [0, 1, 2, 3];
const LINES = [JUG_LINES.cappuccino, JUG_LINES.latte, JUG_LINES.large];

/** Share of the fill time the jug spends inside the right band around `line` (sampled finely). */
function dwellShare(ease: WandEase, line: number): number {
  const n = 20_000;
  let inside = 0;
  for (let i = 0; i <= n; i++) if (fillGrade(fillLevel(i / n, ease, line), line) === 'right') inside += 1;
  return inside / (n + 1);
}

const wand = (w: Station['wand'], wandOf?: Station['wandOf']): Station => ({ kind: 'steamer', wand: w, ...(wandOf ? { wandOf } : {}) }) as Station;

describe('Phase 3: wand upgrades ease the meters', () => {
  it('maps each wand to its ease: little 0, proper 1, Annihilator 2, Double Trouble 3; no wand is 0', () => {
    expect(wandEase(wand('weak'))).toBe(0);
    expect(wandEase(wand('strong'))).toBe(1);
    expect(wandEase(wand('built', 'e5'))).toBe(2);
    expect(wandEase(wand('built', 'e6'))).toBe(3);
    expect(wandEase(wand(undefined))).toBe(0);
    expect(wandEase(undefined)).toBe(0);
  });

  it('the little wand fills at an even speed (as before)', () => {
    for (const line of LINES) for (const t of [0, 0.1, 0.35, 0.5, 0.77, 1]) expect(fillLevel(t, 0, line)).toBeCloseTo(t, 9);
  });

  it('every wand starts empty, ends full and never goes backwards', () => {
    for (const ease of EASES)
      for (const line of LINES) {
        expect(fillLevel(0, ease, line)).toBeCloseTo(0, 9);
        expect(fillLevel(1, ease, line)).toBeCloseTo(1, 9);
        let last = -1;
        for (let i = 0; i <= 400; i++) {
          const v = fillLevel(i / 400, ease, line);
          expect(v).toBeGreaterThanOrEqual(last);
          last = v;
        }
      }
  });

  it('the slow middle sits on the ticket line: fast before it, slow on it, fast after it', () => {
    for (const ease of [1, 2, 3] as WandEase[])
      for (const line of LINES) {
        const speedAt = (level: number) => {
          // time to cross a small step around `level` (inverse speed), found by scanning
          const n = 40_000;
          let first = -1;
          let last = -1;
          for (let i = 0; i <= n; i++) {
            const v = fillLevel(i / n, ease, line);
            if (v >= level - 0.01 && first < 0) first = i;
            if (v <= level + 0.01) last = i;
          }
          return 0.02 / ((last - first) / n);
        };
        const onLine = speedAt(line);
        expect(speedAt(Math.max(0.02, line - FILL_DWELL_WIDTH - 0.05))).toBeGreaterThan(onLine * 1.5);
        expect(speedAt(Math.min(0.98, line + FILL_DWELL_WIDTH + 0.05))).toBeGreaterThan(onLine * 1.5);
      }
  });

  it('each better wand keeps the jug in the right band longer, at every line', () => {
    for (const line of LINES) {
      const shares = EASES.map((e) => dwellShare(e, line));
      expect(shares[0]).toBeCloseTo(2 * HANDMADE.lineWindow, 2); // even speed: the band's width
      for (let i = 1; i < shares.length; i++) expect(shares[i]!).toBeGreaterThan(shares[i - 1]! + 0.05);
      expect(shares[3]!).toBeGreaterThan(0.45); // the top wand: about half the fill sits on the line
    }
  });

  it('the steam meter perfect band widens: ±0.08, ±0.15, ±0.20, ±0.25; ok widens by as much', () => {
    expect(EASES.map((e) => steamWindow(e).perfect)).toEqual([0.08, 0.15, 0.2, 0.25]);
    for (const e of EASES) {
      const w = steamWindow(e);
      expect(w.ok).toBeCloseTo(HANDMADE.ok + (w.perfect - HANDMADE.perfect), 9);
      expect(w.ok).toBeLessThan(0.5); // the meter's ends are always a miss
    }
    expect(WAND_EASE[0]).toMatchObject({ perfect: HANDMADE.perfect });
  });

  it('grades a stop by the wand: the same stop is ok on the little wand and perfect on Double Trouble', () => {
    expect(steamGrade(0.5 + 0.2, 0)).toBe('ok');
    expect(steamGrade(0.5 + 0.2, 3)).toBe('perfect');
    expect(steamGrade(0.5 + 0.3, 0)).toBe('miss');
    expect(steamGrade(0.5 + 0.3, 2)).toBe('ok');
    expect(steamGrade(0.5, 0)).toBe('perfect');
    expect(steamGrade(0.01, 3)).toBe('miss');
  });

  it('is pure: the same inputs always give the same level', () => {
    for (const ease of EASES) expect(fillLevel(0.4321, ease, 0.6)).toBe(fillLevel(0.4321, ease, 0.6));
  });
});
