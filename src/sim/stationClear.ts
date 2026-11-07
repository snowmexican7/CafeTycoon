import { ACCURACY } from './accuracy';
import { ECONOMY } from '../data/economy';
import { secondsToTicks, TICK_RATE } from './constants';
import { emitLog } from './log';
import { passSlots } from './pickup';
import { PICKUP_ID } from '../data/layout';
import type { GameState, Player, Station } from './types';

/**
 * Round 6 block 1: a finished cup sitting on a machine (`station.output`) does not lock it for a player whose
 * held cup has a recipe there. True when the machine has a plain sitting drink that could be cleared: not busy,
 * not a drip pot or grinder hopper still holding portions, not loose grounds.
 */
export function canClearOutput(station: Station): boolean {
  return (
    station.output !== null &&
    station.output !== 'grounds' &&
    station.busyTicksLeft === 0 &&
    station.potLeft === undefined &&
    station.doses === undefined
  );
}

/**
 * Set the sitting cup on the pickup counter (the put-down path: its marks, clock and hand-made grade follow it).
 * Returns false and emits `station.clearFull { by, station, drink, reason: 'counterFull' }` when the counter has no
 * free slot (the cup is never destroyed; the press is refused). Success emits `station.clear { by, station, drink }`.
 */
export function clearOutputToPass(state: GameState, station: Station, p: Player): boolean {
  const item = station.output;
  if (item === null || item === 'grounds') return true;
  if (state.pass.length >= passSlots(state)) {
    emitLog(state, 'station.clearFull', { by: p.id, station: station.id, drink: item, reason: 'counterFull' });
    return false;
  }
  let slips = station.cupSlips ?? 0;
  if (station.doneAt !== undefined && state.tick - station.doneAt > ACCURACY.sitSeconds * TICK_RATE) slips += 1;
  slips = Math.min(ACCURACY.maxStars, slips);
  const since = station.outputSince ?? state.tick;
  state.pass.push({
    item,
    ticksLeft: secondsToTicks(ECONOMY.pass.staleSeconds[item]),
    ...(slips ? { slips } : {}),
    by: p.id,
    madeAt: state.gear === true ? since : state.tick,
    ...(station.made ? { made: station.made } : {}),
  });
  station.output = null;
  delete station.outputSince;
  delete station.doneAt;
  delete station.cupSlips;
  delete station.made;
  emitLog(state, 'station.clear', { by: p.id, station: station.id, drink: item, to: PICKUP_ID });
  return true;
}
