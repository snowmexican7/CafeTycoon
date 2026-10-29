import type { TeleEvent } from '../host/telemetry';
import type { GameState } from '../sim/types';
import { applyPatch } from './delta';
import { parseHello, parseLobby, parseSeat, parseSnap, parseSnapDelta, PROTOCOL_VERSION, type LobbyMsg } from './protocol';
import type { RoomLink } from './roomLink';
import type { HostToClient, Transport } from './transport';

export type PeerStatus = 'connecting' | 'connected' | 'hostAway' | 'rejected' | 'full' | 'failed';

/** A joined player's view of the game: the host's snapshots in, this player's inputs out. */
export interface PeerTransport extends Transport {
  onStatus(handler: (status: PeerStatus) => void): () => void;
  onLobby(handler: (msg: LobbyMsg) => void): () => void;
  /** The host gave this tab an existing (away) seat: play as this token from now on. */
  onSeat(handler: (token: string) => void): () => void;
  status(): PeerStatus;
  /** The barista this tab plays (changes when the host hands back an away seat). */
  token(): string;
  /** Send UI events to the host; a no-op until the host is known (not queued) and for empty batches. */
  sendTele(events: TeleEvent[]): void;
}

export interface PeerSessionOptions {
  token: string;
  name: string;
  /** The seat this browser held in this room before, offered to the host on join. */
  prev?: string;
  timeoutMs: number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
}

export const HOST_TIMEOUT_MESSAGE =
  "Couldn't find the host for this room. Check the code and try again, or ask the host to reopen the room. If it keeps failing, one of you may be on a network that blocks direct connections; a phone hotspot usually works.";
export const ROOM_FULL_MESSAGE = 'That café is full: four baristas are already behind the counter. Ask someone to leave, or host your own room.';
export const VERSION_MISMATCH_MESSAGE = 'The host is running a different version of the game. Reload the page on both sides and try again.';

export function createPeerSession(link: RoomLink, opts: PeerSessionOptions): PeerTransport {
  const snapshotHandlers = new Set<(snap: HostToClient) => void>();
  const errorHandlers = new Set<(message: string) => void>();
  const statusHandlers = new Set<(status: PeerStatus) => void>();
  const lobbyHandlers = new Set<(msg: LobbyMsg) => void>();
  const seatHandlers = new Set<(token: string) => void>();
  let token = opts.token;
  let prev = opts.prev;
  let status: PeerStatus = 'connecting';
  let hostPeerId: string | null = null;
  let hostToken: string | null = null;
  let lastPhase: string | null = null;
  // The state the host's deltas build on, and the delta seq at which we last asked for a keyframe.
  let held: { state: GameState; seq: number } | null = null;
  let resyncAsked: number | null = null;
  const emit = (state: GameState, sentAt: number) => {
    lastPhase = state.phase;
    const snap: HostToClient = { t: 'snapshot', state, sentAt };
    for (const h of snapshotHandlers) h(snap);
  };
  // Ask once, and again only if a second of deltas goes by without the keyframe arriving.
  const askResync = (peerId: string, seq: number) => {
    if (resyncAsked !== null && seq - resyncAsked < 20) return;
    resyncAsked = seq;
    link.send('resync', { t: 'resync' }, peerId);
  };
  let timer: unknown = opts.setTimer(() => {
    timer = null;
    fail(HOST_TIMEOUT_MESSAGE);
  }, opts.timeoutMs);

  const setStatus = (next: PeerStatus) => {
    if (next === status) return;
    status = next;
    for (const h of statusHandlers) h(next);
  };
  const clearTimer = () => {
    if (timer !== null) {
      opts.clearTimer(timer);
      timer = null;
    }
  };
  const fail = (message: string, next: PeerStatus = 'failed') => {
    clearTimer();
    setStatus(next);
    for (const h of errorHandlers) h(message);
  };
  const dead = () => status === 'failed' || status === 'rejected' || status === 'full';

  link.onMessage('hello', (data, peerId) => {
    const msg = parseHello(data);
    if (!msg || dead()) return;
    if (msg.reject === 'version' || msg.protocol !== PROTOCOL_VERSION) {
      fail(VERSION_MISMATCH_MESSAGE, 'rejected');
      return;
    }
    if (msg.reject === 'full') {
      if (hostToken === null || msg.hostToken === hostToken) fail(ROOM_FULL_MESSAGE, 'full');
      return;
    }
    // The first host we accept is the host for the whole run; a returning host keeps its token.
    if (hostToken !== null && msg.hostToken !== hostToken) return;
    hostToken = msg.hostToken;
    clearTimer();
    hostPeerId = peerId;
    link.send('join', { t: 'join', protocol: PROTOCOL_VERSION, token, name: opts.name, ...(prev && prev !== token ? { prev } : {}) }, peerId);
    setStatus('connected');
  });

  link.onMessage('snap', (data, peerId) => {
    if (peerId !== hostPeerId) return;
    const msg = parseSnap(data);
    if (!msg) return;
    held = { state: msg.state, seq: msg.seq };
    resyncAsked = null;
    emit(msg.state, msg.sentAt);
  });

  link.onMessage('snapd', (data, peerId) => {
    if (peerId !== hostPeerId) return;
    const msg = parseSnapDelta(data);
    if (!msg) return;
    if (!held || msg.seq !== held.seq + 1) {
      askResync(peerId, msg.seq);
      return;
    }
    let state = held.state;
    if (msg.patch) {
      try {
        state = applyPatch(held.state, msg.patch) as GameState;
      } catch {
        held = null;
        askResync(peerId, msg.seq);
        return;
      }
    }
    held = { state, seq: msg.seq };
    emit(state, msg.sentAt);
  });

  link.onMessage('lobby', (data, peerId) => {
    if (peerId !== hostPeerId) return;
    const msg = parseLobby(data);
    if (!msg) return;
    for (const h of lobbyHandlers) h(msg);
  });

  link.onMessage('seat', (data, peerId) => {
    if (peerId !== hostPeerId || dead()) return;
    const msg = parseSeat(data);
    if (!msg || msg.token === token) return;
    token = msg.token;
    prev = undefined;
    for (const h of seatHandlers) h(token);
  });

  link.onPeerLeave((peerId) => {
    if (peerId !== hostPeerId || dead()) return;
    hostPeerId = null;
    // A host leaving after the final snapshot is just the run ending, not an outage.
    if (lastPhase === 'ended') return;
    setStatus('hostAway');
  });

  link.onError((message) => {
    // The library reports a failure for any peer in the room, not only the host. Before we have
    // found the host that means we probably cannot reach it; afterwards it is somebody else's
    // problem and must not eject a player who is already in the game.
    console.warn('Room connection error:', message);
    if (dead() || status !== 'connecting') return;
    fail(HOST_TIMEOUT_MESSAGE);
  });

  const subscribe = <T>(set: Set<T>, handler: T) => {
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  };

  return {
    start() {
      /* a joined player never runs the simulation */
    },
    resume() {
      /* a joined player never runs the simulation */
    },
    sendInput(input) {
      if (hostPeerId) link.send('input', { t: 'input', input }, hostPeerId);
    },
    sendTele(events) {
      if (hostPeerId && events.length > 0) link.send('tele', { t: 'tele', token, events }, hostPeerId);
    },
    onSnapshot: (handler) => subscribe(snapshotHandlers, handler),
    onError: (handler) => subscribe(errorHandlers, handler),
    onStatus: (handler) => subscribe(statusHandlers, handler),
    onLobby: (handler) => subscribe(lobbyHandlers, handler),
    onSeat: (handler) => subscribe(seatHandlers, handler),
    status: () => status,
    token: () => token,
    close() {
      clearTimer();
      link.leave();
    },
  };
}
