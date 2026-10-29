import { ECONOMY } from '../data/economy';
import { isBotId } from '../sim/bots/roster';
import type { GameState } from '../sim/types';

export type SeatResult = { seat: string } | { reject: 'full' };

export interface SeatRequest {
  /** The connecting tab's own token. */
  token: string;
  /** The seat this browser held in this room last time, if any. */
  prev?: string;
  name: string;
  hostToken: string;
  /** The run, once started; null in the pre-start lobby. */
  state: GameState | null;
  /** Tokens held by other live connections (not counting the host, not counting this connection). */
  live: ReadonlySet<string>;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Which barista a connection plays. Order: its own seat (a refresh), the seat this browser held
 * before (a closed tab coming back), an away seat with the same name, a new seat while there is
 * room, else the first away seat. Never a seat another live connection holds; never past four humans.
 */
export function assignSeat(req: SeatRequest): SeatResult {
  const { token, prev, name, hostToken, state, live } = req;
  const max = ECONOMY.maxHumans;
  if (!state) {
    if (live.has(token)) return { seat: token }; // the same tab again: the latest connection wins
    return live.size + 1 >= max ? { reject: 'full' } : { seat: token };
  }
  const humans = state.players.filter((p) => !p.bot && !isBotId(p.id));
  if (live.has(token) || humans.some((p) => p.id === token)) return { seat: token };
  const away = humans.filter((p) => p.id !== hostToken && !live.has(p.id));
  const mine = prev !== undefined ? away.find((p) => p.id === prev) : undefined;
  if (mine) return { seat: mine.id };
  const named = away.find((p) => sameName(p.name, name));
  if (named) return { seat: named.id };
  if (humans.length < max) return { seat: token };
  return away.length > 0 ? { seat: away[0].id } : { reject: 'full' };
}
