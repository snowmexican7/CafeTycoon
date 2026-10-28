import type { GameState, PlayerId } from '../sim/types';

/**
 * A host that reopens a saved run has no connections yet, so every other player is away until
 * they re-join. Marking them disconnected keeps the night from waiting on ghosts.
 */
export function markPeersAway(state: GameState, hostId: PlayerId): GameState {
  const s = structuredClone(state);
  for (const p of s.players) {
    if (p.id === hostId || p.bot) continue;
    p.connected = false;
    p.moveDir = { x: 0, y: 0 };
    p.interactQueued = false;
  }
  return s;
}
