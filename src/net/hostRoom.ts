import type { GameState, PlayerLook } from '../sim/types';
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

function sameLook(a: PlayerLook | undefined, b: PlayerLook | undefined): boolean {
  if (!a || !b) return false;
  return a.hair === b.hair && a.skin === b.skin && a.outfit === b.outfit && a.shirtColor === b.shirtColor && a.hairColor === b.hairColor;
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
  // What every peer holds after the last broadcast (floats rounded), and its sequence number.
  let wire: { state: GameState; seq: number; sentAt: number } | null = null;
  /**
   * A join is applied on the sim's next tick, so the keyframe sent in the join handler can still be the
   * state from before that look (or before the player exists). Hold the peer until a snapshot shows
   * them, with the look they sent, then send that snapshot. An older keyframe must not be the one they keep.
   */
  const catchUp = new Map<string, { seat: string; look?: PlayerLook }>();
  const sendKeyframe = (peerId?: string) => {
    if (!wire) return;
    link.send('snap', { t: 'snap', state: wire.state, sentAt: wire.sentAt, seq: wire.seq }, peerId);
  };

  const members = (): Member[] => [host, ...byPeer.values()];
  const broadcastLobby = () => {
    const list = members();
    link.send('lobby', { t: 'lobby', members: list, started });
    onMembers?.(list);
  };

  const unsubscribe = local.onSnapshot((snap) => {
    if (closed) return;
    latest = snap;
    const seq = (wire?.seq ?? 0) + 1;
    if (!wire || seq % KEYFRAME_EVERY === 0) {
      wire = { state: roundFloats(snap.state), seq, sentAt: snap.sentAt };
      sendKeyframe();
    } else {
      const patch = diff(wire.state, snap.state);
      wire = { state: patch ? (applyPatch(wire.state, patch) as GameState) : wire.state, seq, sentAt: snap.sentAt };
      link.send('snapd', { t: 'snapd', seq, patch, sentAt: snap.sentAt });
    }
    for (const [peerId, want] of catchUp) {
      const member = byPeer.get(peerId);
      if (!member || member.token !== want.seat) {
        catchUp.delete(peerId);
        continue;
      }
      const player = wire.state.players.find((p) => p.id === want.seat);
      if (!player?.connected) continue;
      if (want.look && !sameLook(player.look, want.look)) continue;
      sendKeyframe(peerId);
      catchUp.delete(peerId);
    }
    if (!started) {
      started = true;
      broadcastLobby();
    }
  });

  link.onPeerJoin((peerId) => {
    if (closed) return;
    link.send('hello', { t: 'hello', protocol: PROTOCOL_VERSION, hostToken: host.token }, peerId);
  });

  link.onMessage('join', (data, peerId) => {
    if (closed) return;
    const msg = parseJoin(data);
    if (!msg) return;
    if (msg.protocol !== PROTOCOL_VERSION) {
      link.send('hello', { t: 'hello', protocol: PROTOCOL_VERSION, hostToken: host.token, reject: 'version' }, peerId);
      return;
    }
    if (msg.token === host.token) return; // nobody joins as the host
    const live = new Set([...byPeer].filter(([p]) => p !== peerId).map(([, m]) => m.token));
    const result = assignSeat({ token: msg.token, prev: msg.prev, name: msg.name, hostToken: host.token, state: latest?.state ?? null, live });
    if ('reject' in result) {
      link.send('hello', { t: 'hello', protocol: PROTOCOL_VERSION, hostToken: host.token, reject: 'full' }, peerId);
      return;
    }
    const seat = result.seat;
    for (const [otherPeer, member] of byPeer) {
      if (member.token === seat && otherPeer !== peerId) byPeer.delete(otherPeer);
    }
    if (seat !== msg.token) link.send('seat', { t: 'seat', token: seat }, peerId);
    byPeer.set(peerId, { token: seat, name: msg.name, ...(msg.look ? { look: msg.look } : {}) });
    local.sendInput({ kind: 'join', playerId: seat, name: msg.name, ...(msg.look ? { look: msg.look } : {}) });
    // The sim applies the join on its next tick. Send what we have now so the café isn't blank, then
    // (if that picture is still missing this player or their look) send again once a snapshot has it.
    sendKeyframe(peerId);
    const shown = wire?.state.players.find((p) => p.id === seat);
    const shownLook = !msg.look || sameLook(shown?.look, msg.look);
    if (!shown?.connected || !shownLook) catchUp.set(peerId, { seat, ...(msg.look ? { look: msg.look } : {}) });
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
    catchUp.delete(peerId);
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
      unsubscribe();
      link.leave();
    },
  };
}
