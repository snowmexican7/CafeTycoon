import type { GameState } from '../sim/types';
import type { TeleEvent } from '../host/telemetry';
import { applyPatch, diff, roundFloats } from './delta';
import { parseInput, parseJoin, parseResync, parseTele, PROTOCOL_VERSION, type Member } from './protocol';
import { assignSeat } from './seats';
import type { RoomLink } from './roomLink';
import type { HostToClient, Transport } from './transport';

/** The host's side of a co-op room: connections in, simulation inputs out, snapshots to everyone. */
export interface HostRoom {
  members(): Member[];
  latestSnapshot(): HostToClient | null;
  close(): void;
}

/** A full snapshot every this many sends (5 s at 20 Hz), so a dropped delta heals on its own. */
export const KEYFRAME_EVERY = 100;

export interface HostRoomHooks {
  onTele?(token: string, events: TeleEvent[]): void;
}

export function createHostRoom(
  link: RoomLink,
  local: Transport,
  host: Member,
  onMembers?: (members: Member[]) => void,
  hooks?: HostRoomHooks,
): HostRoom {
  const byPeer = new Map<string, Member>();
  let latest: HostToClient | null = null;
  let started = false;
  let closed = false;
  // What every peer holds after the last broadcast we handed to the link (floats rounded), and its sequence.
  let wire: { state: GameState; seq: number; sentAt: number } | null = null;
  // Trystero writes one reliable ordered stream. If the next snapshot is handed over before the previous
  // send() finishes, the stream fills with stale cafés (the guest plays the past) and a chunked keyframe's
  // body lands after the deltas that were supposed to follow it. Hold at most one snapshot send.
  let inflight = false;
  let snapWaiting = false;
  const later: (() => void)[] = [];
  const isPromise = (v: unknown): v is Promise<unknown> => typeof (v as { then?: unknown } | null)?.then === 'function';
  const pump = (): void => {
    while (!inflight && !closed) {
      const job = later.shift();
      if (job) {
        job();
        continue;
      }
      if (snapWaiting && latest) {
        snapWaiting = false;
        publish(latest);
        continue;
      }
      break;
    }
  };
  const afterSend = (result: void | Promise<unknown>, onFail?: () => void): void => {
    if (!isPromise(result)) return;
    inflight = true;
    void result.then(
      () => {
        inflight = false;
        pump();
      },
      () => {
        onFail?.();
        inflight = false;
        pump();
      },
    );
  };
  /** Start `run` now, or behind whatever send is already on the wire. Synchronous links never queue. */
  const sendOut = (run: () => void | Promise<unknown>, onFail?: () => void): void => {
    if (closed) return;
    const job = () => {
      try {
        afterSend(run(), onFail);
      } catch {
        onFail?.();
      }
    };
    if (inflight || later.length) later.push(job);
    else job();
  };
  const sendKeyframe = (peerId?: string) => {
    sendOut(() => {
      if (!wire) return;
      return link.send('snap', { t: 'snap', state: wire.state, sentAt: wire.sentAt, seq: wire.seq }, peerId);
    });
  };

  const members = (): Member[] => [host, ...byPeer.values()];
  const broadcastLobby = () => {
    const list = members();
    onMembers?.(list);
    sendOut(() => link.send('lobby', { t: 'lobby', members: list, started }));
  };
  const publish = (snap: HostToClient) => {
    if (closed) return;
    const seq = (wire?.seq ?? 0) + 1;
    const sentAt = snap.sentAt;
    const fail = () => {
      wire = null;
    };
    if (!wire || seq % KEYFRAME_EVERY === 0) {
      const state = roundFloats(snap.state);
      wire = { state, seq, sentAt };
      sendOut(() => link.send('snap', { t: 'snap', state, sentAt, seq }), fail);
    } else {
      const patch = diff(wire.state, snap.state);
      const state = (patch ? applyPatch(wire.state, patch) : wire.state) as GameState;
      wire = { state, seq, sentAt };
      sendOut(() => link.send('snapd', { t: 'snapd', seq, patch, sentAt }), fail);
    }
    if (!started) {
      started = true;
      broadcastLobby();
    }
  };

  const unsubscribe = local.onSnapshot((snap) => {
    if (closed) return;
    latest = snap;
    if (inflight || later.length) {
      snapWaiting = true;
      return;
    }
    publish(snap);
  });

  link.onPeerJoin((peerId) => {
    if (closed) return;
    sendOut(() => link.send('hello', { t: 'hello', protocol: PROTOCOL_VERSION, hostToken: host.token }, peerId));
  });

  link.onMessage('join', (data, peerId) => {
    if (closed) return;
    const msg = parseJoin(data);
    if (!msg) return;
    if (msg.protocol !== PROTOCOL_VERSION) {
      sendOut(() => link.send('hello', { t: 'hello', protocol: PROTOCOL_VERSION, hostToken: host.token, reject: 'version' }, peerId));
      return;
    }
    if (msg.token === host.token) return; // nobody joins as the host
    const live = new Set([...byPeer].filter(([p]) => p !== peerId).map(([, m]) => m.token));
    const result = assignSeat({ token: msg.token, prev: msg.prev, name: msg.name, hostToken: host.token, state: latest?.state ?? null, live });
    if ('reject' in result) {
      sendOut(() => link.send('hello', { t: 'hello', protocol: PROTOCOL_VERSION, hostToken: host.token, reject: 'full' }, peerId));
      return;
    }
    const seat = result.seat;
    for (const [otherPeer, member] of byPeer) {
      if (member.token === seat && otherPeer !== peerId) byPeer.delete(otherPeer);
    }
    if (seat !== msg.token) sendOut(() => link.send('seat', { t: 'seat', token: seat }, peerId));
    byPeer.set(peerId, { token: seat, name: msg.name, ...(msg.look ? { look: msg.look } : {}) });
    local.sendInput({ kind: 'join', playerId: seat, name: msg.name, ...(msg.look ? { look: msg.look } : {}) });
    sendKeyframe(peerId);
    broadcastLobby();
  });

  link.onMessage('input', (data, peerId) => {
    if (closed) return;
    const msg = parseInput(data);
    const member = byPeer.get(peerId);
    if (!msg || !member || msg.input.playerId !== member.token) return;
    local.sendInput(msg.input);
  });

  link.onMessage('resync', (data, peerId) => {
    if (closed || !parseResync(data) || !byPeer.has(peerId)) return;
    sendKeyframe(peerId);
  });

  link.onMessage('tele', (data, peerId) => {
    if (closed) return;
    const msg = parseTele(data);
    const member = byPeer.get(peerId);
    if (!msg || !member || msg.token !== member.token) return;
    hooks?.onTele?.(msg.token, msg.events);
  });

  link.onPeerLeave((peerId) => {
    if (closed) return;
    const member = byPeer.get(peerId);
    if (!member) return;
    byPeer.delete(peerId);
    local.sendInput({ kind: 'leave', playerId: member.token });
    broadcastLobby();
  });

  return {
    members,
    latestSnapshot: () => latest,
    close() {
      if (closed) return;
      closed = true;
      snapWaiting = false;
      later.length = 0;
      unsubscribe();
      link.leave();
    },
  };
}
