import { secondsToTicks } from './constants';
import { ECONOMY } from '../data/economy';
import { dropTile, placeMess } from './floor';
import { emitLog } from './log';
import { returnTool } from './mop';
import { nearestStation } from './movement';
import { passSlots, spotOf } from './pickup';
import { PICKUP_ID } from '../data/layout';
import { STATION_RECIPES } from './stations';
import { tally } from './tally';
import type { GameState, Player } from './types';

/** Resolve every queued drop, in players order: a station in range first, else the floor. */
export function resolveDrops(state: GameState): void {
  for (const p of state.players) {
    if (p.dropQueued) resolveDrop(state, p);
  }
}

function resolveDrop(state: GameState, p: Player): void {
  if (p.tool !== null) {
    returnTool(state, p);
    return;
  }
  const item = p.holding;
  if (item === null) return;
  const station = nearestStation(state, p.pos);

  if (station) {
    // Kennedy's rule: a station in range takes the item or nothing happens at all.
    if (station.kind === 'trash') {
      p.holding = null;
      if (item !== 'grounds') tally(state.today, 'wasted');
      emitLog(state, 'drop', { item, station: station.id, by: p.id });
    } else if (station.kind === 'counter' && state.gear === true) {
      // Batch/pickup: the till and the pickup counter set the drink down for its customer; the bar takes nothing.
      if (item !== 'grounds' && spotOf(station) !== 'condiments' && state.pass.length < passSlots(state)) {
        state.pass.push({
          item,
          ticksLeft: secondsToTicks(ECONOMY.pass.staleSeconds[item]),
          ...(p.cupSlips ? { slips: p.cupSlips } : {}),
          ...(p.cupTemp ? { temp: true } : {}),
          by: p.id,
        });
        p.holding = null;
        delete p.cupSlips;
        delete p.cupTemp;
        emitLog(state, 'drop', { item, station: PICKUP_ID, by: p.id });
      }
    } else if (station.kind === 'counter') {
      if (item !== 'grounds' && state.pass.length < ECONOMY.pass.slots) {
        state.pass.push({ item, ticksLeft: secondsToTicks(ECONOMY.pass.staleSeconds[item]) });
        p.holding = null;
        emitLog(state, 'drop', { item, station: station.id, by: p.id });
      }
    } else if (station.kind in STATION_RECIPES) {
      if (station.busyTicksLeft === 0 && station.output === null && station.occupiedBy === null) {
        station.output = item;
        station.outputSince = state.tick;
        p.holding = null;
        emitLog(state, 'drop', { item, station: station.id, by: p.id });
      }
    }
    return;
  }

  const tile = dropTile(state, p);
  if (!placeMess(state, item === 'grounds' ? 'grounds' : 'spill', tile)) return;
  p.holding = null;
  if (item !== 'grounds') tally(state.today, 'wasted');
  emitLog(state, 'drop', { item, x: tile.x, y: tile.y, by: p.id });
}
