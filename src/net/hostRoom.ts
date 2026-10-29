import type { TeleEvent } from '../host/telemetry';
import { parseBots, parseInput, parseJoin, parseTele, PROTOCOL_VERSION, type BotsChoice, type Member } from './protocol';
import { assignSeat } from './seats';
import type { RoomLink } from './roomLink';
import type { HostToClient, Transport } from './transport';

/** The host's side of a co-op room: connections in, simulation inputs out, snapshots to everyone. */
export interface HostRoom {
  members(): Member[];
  latestSnapshot(): HostToClient | null;
  /** The bots setting the run will start with: the host's pick, else the default for this crew size. */
  bots(): { bots: BotsChoice; picked: boolean };
  /** Host only, before the start: pick Off/1–3 (null goes back to the default). Synced to the lobby. */
  setBots(choice: BotsChoice | null): void;
  close(): void;
}

/** Off once two or more baristas are in; a lone host gets bots filling the empty seats. */
export const defaultBots = (humans: number): BotsChoice => (humans >= 2 ? 0 : 'auto');

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
  let botsChoice: BotsChoice | null = null;

  const members = (): Member[] => [host, ...byPeer.values()];
  const bots = (): { bots: BotsChoice; picked: boolean } => {
    if (latest) return { bots: latest.state.settings.bots, picked: true };
    return botsChoice !== null ? { bots: botsChoice, picked: true } : { bots: defaultBots(members().length), picked: false };
  };
  const broadcastLobby = () => {
    const list = members();
    const b = bots();
    link.send('lobby', { t: 'lobby', members: list, started, bots: b.bots, botsPicked: b.picked });
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
    byPeer.set(peerId, { token: seat, name: msg.name });
    local.sendInput({ kind: 'join', playerId: seat, name: msg.name });
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
    bots,
    setBots(choice) {
      if (closed || latest) return;
      const next = choice === null ? null : (parseBots(choice) ?? null);
      if (next === botsChoice) return;
      botsChoice = next;
      broadcastLobby();
    },
    close() {
      if (closed) return;
      closed = true;
      unsubscribe();
      link.leave();
    },
  };
}
