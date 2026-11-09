/**
 * Playtest 2026-11-09: a double group-head (e4 / e5 / e6, `twin: ['espresso']`) is one interactable.
 * The two heads stay two stations so a shot can sit on one while the other pulls, but a press at either
 * head picks the head that can actually do the job. A waiting shot never locks the machine while a head is free.
 */
import type { GameState, Player, Station } from './types';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** The espresso heads of one machine (the main head and its espresso twin), or just `st` when it isn't a double group. */
export function espressoGroup(state: GameState, st: Station): Station[] {
  if (st.kind !== 'espresso' || !st.gear) return [st];
  const heads = state.stations.filter(
    (s) => s.kind === 'espresso' && s.gear === st.gear && dist(s.pos, st.pos) <= 1.2,
  );
  return heads.length > 1 ? heads : [st];
}

const closer = (p: Player, heads: Station[]): Station =>
  heads.reduce((best, s) => (dist(p.pos, s.pos) < dist(p.pos, best.pos) ? s : best));

const free = (s: Station): boolean => s.busyTicksLeft === 0 && s.output === null && s.occupiedBy === null;

/**
 * Which head this press should use. Empty hands take a finished shot (so the waiting cup is the one you grab).
 * Anything in hand starts on a free head, leaving a shot that is already sitting where it is.
 */
export function pickEspressoHead(state: GameState, player: Player, nearest: Station): Station {
  const heads = espressoGroup(state, nearest);
  if (heads.length < 2) return nearest;
  if (player.holding === null && player.tool === null) {
    const ready = heads.filter((s) => s.output !== null && s.busyTicksLeft === 0);
    if (ready.length) return closer(player, ready);
    return closer(player, heads);
  }
  const open = heads.filter(free);
  if (open.length) return closer(player, open);
  return closer(player, heads);
}
