import type { CreateRunOptions, GameState, PlayerInput } from '../sim/types';

/** Messages from a page to whoever runs the simulation (the local Worker now, a relay later). */
export type ClientToHost =
  | { t: 'start'; opts: CreateRunOptions }
  | { t: 'resume'; state: GameState }
  | { t: 'input'; input: PlayerInput };

/** Messages from the simulation back to pages. */
export type HostToClient = { t: 'snapshot'; state: GameState; sentAt: number };

/** The one seam between the game and how it is being run. */
export interface Transport {
  start(opts: CreateRunOptions): void;
  resume(state: GameState): void;
  sendInput(input: PlayerInput): void;
  /** Subscribe to snapshots; returns an unsubscribe function. */
  onSnapshot(handler: (snap: HostToClient) => void): () => void;
  close(): void;
}
