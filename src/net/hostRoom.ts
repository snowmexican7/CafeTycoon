import type { TeleEvent } from '../host/telemetry';
import { parseInput, parseJoin, parseTele, PROTOCOL_VERSION, type Member } from './protocol';
import type { RoomLink } from './roomLink';
import type { HostToClient, Transport } from './transport';

/** The host's side of a co-op room: connections in, simulation inputs out, snapshots to everyone. */
export interface HostRoom {
  members(): Member[];
  latestSnapshot(): HostToClient | null;
  close(): void;
}

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

  const members = (): Member[] => [host, ...byPeer.values()];
  const broadcastLobby = () => {
    const list = members();
    link.send('lobby', { t: 'lobby', members: list, started });
    onMembers?.(list);
  };

  const unsubscribe = local.onSnapshot((snap) => {
    if (closed) return;
    latest = snap;
    link.send('snap', { t: 'snap', state: snap.state, sentAt: snap.sentAt });
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
    for (const [otherPeer, member] of byPeer) {
      if (member.token === msg.token && otherPeer !== peerId) byPeer.delete(otherPeer);
    }
    byPeer.set(peerId, { token: msg.token, name: msg.name });
    local.sendInput({ kind: 'join', playerId: msg.token, name: msg.name });
    if (latest) link.send('snap', { t: 'snap', state: latest.state, sentAt: latest.sentAt }, peerId);
    broadcastLobby();
  });

  link.onMessage('input', (data, peerId) => {
    if (closed) return;
    const msg = parseInput(data);
    const member = byPeer.get(peerId);
    if (!msg || !member || msg.input.playerId !== member.token) return;
    local.sendInput(msg.input);
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
      unsubscribe();
      link.leave();
    },
  };
}
