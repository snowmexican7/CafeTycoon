/*
 * FB2 A5: the exact "left" number floating over a station, so the rules live in the sim and the UI only draws.
 *  - `stationLeft(state, id)`: the count for one station, or null (= draw nothing). Never 0: an empty station is null,
 *    so no "0" is left floating.
 *  - `stationCountsLeft(state)`: every station with a count, in station order, for one loop.
 *
 * What counts: cold brew cups left on a tap (`batchLeft`); cups in a brewed drip pot (`potLeft`; null while brewing or
 * while the pot is out at the sink, a stale pot still shows its cups); a finished item waiting at a machine (one slot,
 * so 1); condiment servings (`state.condiments`); cups on the pickup counter (`state.pass`). Till, sink, trash: null.
 * Cooling stays in ./cooling (`stationCool`, `slotCool`); this is only the number.
 *
 * Pure: no state change, no events, no RNG. Must not import ./gear.
 */
import { CONDIMENTS_ID, PICKUP_ID } from '../data/layout';
import type { GameState, Station } from './types';

/** Left-over count for one station (see the file header), or null when there is nothing to show. */
function leftAt(state: GameState, s: Station): number | null {
  if (s.id === PICKUP_ID) return positive(state.pass.length);
  if (s.id === CONDIMENTS_ID) return positive(state.condiments?.servings ?? 0);
  // Till, sink, trash and any other counter-kind spot carry no count.
  if (s.kind === 'counter' || s.kind === 'trash') return null;
  // FB2 A4 (milk in the fridge) will add its station here; its fields are not built yet, so nothing is guessed.
  if (s.batchLeft !== undefined) return positive(s.batchLeft);
  if (s.kind === 'drip') {
    if (s.potOut !== undefined || s.busyTicksLeft > 0) return null;
    if (s.potLeft !== undefined) return positive(s.potLeft);
  }
  // A machine's finished item (a pulled shot, a steamed drink, a ground dose) sits in one slot.
  return s.output ? 1 : null;
}

const positive = (n: number): number | null => (n > 0 ? n : null);

/** The "left" count over station `stationId`, or null for none (unknown id, empty, or a station with no count). */
export function stationLeft(state: GameState, stationId: string): number | null {
  const s = state.stations.find((x) => x.id === stationId);
  return s ? leftAt(state, s) : null;
}

/** Every station that has a count, in station order. */
export function stationCountsLeft(state: GameState): { id: string; n: number }[] {
  const out: { id: string; n: number }[] = [];
  for (const s of state.stations) {
    const n = leftAt(state, s);
    if (n !== null) out.push({ id: s.id, n });
  }
  return out;
}
