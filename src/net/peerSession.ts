import { parseHello, parseLobby, parseSnap, PROTOCOL_VERSION, type LobbyMsg } from './protocol';
import type { RoomLink } from './roomLink';
import type { HostToClient, Transport } from './transport';

export type PeerStatus = 'connecting' | 'connected' | 'hostAway' | 'rejected' | 'failed';

/** A joined player's view of the game: the host's snapshots in, this player's inputs out. */
export interface PeerTransport extends Transport {
  onStatus(handler: (status: PeerStatus) => void): () => void;
  onLobby(handler: (msg: LobbyMsg) => void): () => void;
  status(): PeerStatus;
}

export interface PeerSessionOptions {
  token: string;
  name: string;
  timeoutMs: number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
}

export const HOST_TIMEOUT_MESSAGE =
  "Couldn't find the host for this room. Check the code and try again, or ask the host to reopen the room. If it keeps failing, one of you may be on a network that blocks direct connections; a phone hotspot usually works.";
export const VERSION_MISMATCH_MESSAGE = 'The host is running a different version of the game. Reload the page on both sides and try again.';

export function createPeerSession(link: RoomLink, opts: PeerSessionOptions): PeerTransport {
  const snapshotHandlers = new Set<(snap: HostToClient) => void>();
  const errorHandlers = new Set<(message: string) => void>();
  const statusHandlers = new Set<(status: PeerStatus) => void>();
  const lobbyHandlers = new Set<(msg: LobbyMsg) => void>();
  let status: PeerStatus = 'connecting';
  let hostPeerId: string | null = null;
  let hostToken: string | null = null;
  let lastPhase: string | null = null;
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
  const dead = () => status === 'failed' || status === 'rejected';

  link.onMessage('hello', (data, peerId) => {
    const msg = parseHello(data);
    if (!msg || dead()) return;
    if (msg.reject === 'version' || msg.protocol !== PROTOCOL_VERSION) {
      fail(VERSION_MISMATCH_MESSAGE, 'rejected');
      return;
    }
    // The first host we accept is the host for the whole run; a returning host keeps its token.
    if (hostToken !== null && msg.hostToken !== hostToken) return;
    hostToken = msg.hostToken;
    clearTimer();
    hostPeerId = peerId;
    link.send('join', { t: 'join', protocol: PROTOCOL_VERSION, token: opts.token, name: opts.name }, peerId);
    setStatus('connected');
  });

  link.onMessage('snap', (data, peerId) => {
    if (peerId !== hostPeerId) return;
    const msg = parseSnap(data);
    if (!msg) return;
    lastPhase = msg.state.phase;
    const snap: HostToClient = { t: 'snapshot', state: msg.state, sentAt: msg.sentAt };
    for (const h of snapshotHandlers) h(snap);
  });

  link.onMessage('lobby', (data, peerId) => {
    if (peerId !== hostPeerId) return;
    const msg = parseLobby(data);
    if (!msg) return;
    for (const h of lobbyHandlers) h(msg);
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
    onSnapshot: (handler) => subscribe(snapshotHandlers, handler),
    onError: (handler) => subscribe(errorHandlers, handler),
    onStatus: (handler) => subscribe(statusHandlers, handler),
    onLobby: (handler) => subscribe(lobbyHandlers, handler),
    status: () => status,
    close() {
      clearTimer();
      link.leave();
    },
  };
}
