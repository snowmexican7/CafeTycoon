import { describe, it, expect } from 'vitest';
import { applyPatch, type Patch } from './delta';
import { createHostRoom } from './hostRoom';
import { createPeerSession } from './peerSession';
import { parseInput, parseJoin, parseLobby, PROTOCOL_VERSION } from './protocol';
import { createFakeLink } from './testing/fakeLink';
import type { HostToClient, Transport } from './transport';
import { createRun } from '../sim/run';
import { step } from '../sim/step';
import type { GameState, PlayerInput, PlayerLook } from '../sim/types';

const LOOK: PlayerLook = { hair: 'bob', hairColor: '#aa5500', skin: 'tan2', outfit: 'dress_a', shirtColor: '#3366cc' };

/** A host Transport that runs the real sim: inputs in, a snapshot out after each. */
function simLocal() {
  let state: GameState = createRun({ seed: 1, hostId: 'H', players: [{ id: 'H', name: 'Host' }] });
  const handlers = new Set<(s: HostToClient) => void>();
  const emit = () => handlers.forEach((h) => h({ t: 'snapshot', state, sentAt: 1 }));
  const t: Transport = {
    start() {},
    resume() {},
    sendInput(i: PlayerInput) {
      state = step(state, [i]);
      emit();
    },
    onSnapshot: (h) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    onError: () => () => {},
    close() {},
  };
  return { t, emit, state: () => state };
}

describe('look over the net', () => {
  it('parseJoin keeps a clean look, drops a bad one, never rejects the join over it', () => {
    const base = { t: 'join', protocol: 1, token: 'abc', name: 'Sam' };
    expect(parseJoin({ ...base, look: { ...LOOK, extra: 1 } })!.look).toEqual(LOOK);
    expect(parseJoin({ ...base, look: { ...LOOK, hair: 'no way!' } })).toEqual({ ...base });
    expect(parseJoin({ ...base, look: 'bob' })).toEqual({ ...base });
    expect(parseJoin(base)!.look).toBeUndefined();
  });

  it('parseLobby keeps each member look cleaned', () => {
    const msg = parseLobby({ t: 'lobby', started: false, members: [{ token: 'a', name: 'A', look: LOOK }, { token: 'b', name: 'B', look: { hair: '' } }, { token: 'c', name: 'C' }] })!;
    expect(msg.members).toEqual([{ token: 'a', name: 'A', look: LOOK }, { token: 'b', name: 'B' }, { token: 'c', name: 'C' }]);
  });

  it('parseInput passes a look input through (the sim cleans it)', () => {
    expect(parseInput({ t: 'input', input: { kind: 'look', playerId: 'a', look: LOOK } })).not.toBeNull();
  });

  it('a peer joins with a look: it reaches host state, the lobby, and the peer through a snapshot', () => {
    // Peer side: the join message carries the look.
    const peerLink = createFakeLink();
    const peer = createPeerSession(peerLink, { token: 'T1', name: 'Sam', look: LOOK, timeoutMs: 1000, setTimer: () => 0, clearTimer: () => {} });
    peerLink.receive('hello', { t: 'hello', protocol: PROTOCOL_VERSION, hostToken: 'H' }, 'hostPeer');
    const sentJoin = peerLink.sent.find((s) => s.kind === 'join')!;
    expect(sentJoin.data).toMatchObject({ t: 'join', token: 'T1', name: 'Sam', look: LOOK });
    expect(peer.status()).toBe('connected');

    // Host side: wire the sent join into a host room over the real sim.
    const hostLink = createFakeLink();
    const local = simLocal();
    const room = createHostRoom(hostLink, local.t, { token: 'H', name: 'Host' });
    local.emit();
    hostLink.peerJoins('p1');
    hostLink.receive('join', JSON.parse(JSON.stringify(sentJoin.data)), 'p1');
    expect(local.state().players.find((p) => p.id === 'T1')!.look).toEqual(LOOK);
    expect(room.members().find((m) => m.token === 'T1')).toMatchObject({ name: 'Sam', look: LOOK });
    const lobby = hostLink.sent.filter((s) => s.kind === 'lobby').at(-1)!;
    expect(parseLobby(JSON.parse(JSON.stringify(lobby.data)))!.members.find((m) => m.token === 'T1')!.look).toEqual(LOOK);

    // Peer side: the keyframe the host sent to that peer carries the look in the state.
    const snapMsg = hostLink.sent.filter((s) => s.kind === 'snap' && s.target === 'p1').at(-1)!;
    const got: GameState[] = [];
    peer.onSnapshot((s) => got.push(s.state));
    peerLink.receive('snap', JSON.parse(JSON.stringify(snapMsg.data)), 'hostPeer');
    expect(got[0]!.players.find((p) => p.id === 'T1')!.look).toEqual(LOOK);
  });

  it('a night edit from a peer reaches the host state and rides the next snapshot', () => {
    const hostLink = createFakeLink();
    const local = simLocal();
    createHostRoom(hostLink, local.t, { token: 'H', name: 'Host' });
    local.emit();
    hostLink.peerJoins('p1');
    hostLink.receive('join', { t: 'join', protocol: PROTOCOL_VERSION, token: 'T1', name: 'Sam' }, 'p1');
    expect(local.state().players.find((p) => p.id === 'T1')!.look).toBeUndefined();
    hostLink.receive('input', { t: 'input', input: { kind: 'look', playerId: 'T1', look: LOOK } }, 'p1');
    expect(local.state().players.find((p) => p.id === 'T1')!.look).toEqual(LOOK);
    // a peer can't change someone else's look
    hostLink.receive('input', { t: 'input', input: { kind: 'look', playerId: 'H', look: LOOK } }, 'p1');
    expect(local.state().players.find((p) => p.id === 'H')!.look).toBeUndefined();
    // and the deltas carry it to everyone: replay the wire the way a peer does
    const wire = JSON.parse(JSON.stringify(hostLink.sent.filter((s) => s.kind === 'snap' || s.kind === 'snapd'))) as { kind: string; data: { state?: GameState; patch?: Patch | null } }[];
    let held = wire[0]!.data.state as GameState;
    for (const m of wire.slice(1)) if (m.kind === 'snapd' && m.data.patch) held = applyPatch(held, m.data.patch) as GameState;
    expect(held.players.find((p) => p.id === 'T1')!.look).toEqual(LOOK);
  });

  it('the host look rides in its Member and the run options', () => {
    const hostLink = createFakeLink();
    const local = simLocal();
    const room = createHostRoom(hostLink, local.t, { token: 'H', name: 'Host', look: LOOK });
    expect(room.members()[0]).toEqual({ token: 'H', name: 'Host', look: LOOK });
  });

  it('a look sent before the café opens is on the member the host starts with', () => {
    const hostLink = createFakeLink();
    const local = simLocal();
    const room = createHostRoom(hostLink, local.t, { token: 'H', name: 'Host', look: LOOK });
    hostLink.peerJoins('sam');
    hostLink.receive('join', { t: 'join', protocol: PROTOCOL_VERSION, token: 'T1', name: 'Sam', look: { ...LOOK, hair: 'wavy', outfit: 'slim-dress' } }, 'sam');
    const members = room.members();
    expect(members.map((m) => m.look?.hair)).toEqual([LOOK.hair, 'wavy']);
    const started = createRun({
      seed: 4,
      hostId: 'H',
      players: members.map((m) => ({ id: m.token, name: m.name, ...(m.look ? { look: m.look } : {}) })),
    });
    expect(started.players.find((p) => p.id === 'H')!.look).toEqual(LOOK);
    expect(started.players.find((p) => p.id === 'T1')!.look).toMatchObject({ hair: 'wavy', outfit: 'slim-dress' });
  });

  it('join, rejoin and a taken seat show the new look, including to someone already in the room', () => {
    const HOST: PlayerLook = { hair: 'bun', hairColor: 'black', skin: 's1', outfit: 'broad-vest', shirtColor: 'red' };
    const SAM: PlayerLook = { hair: 'wavy', hairColor: 'pink', skin: 's6', outfit: 'slim-dress', shirtColor: 'blue' };
    const SAM2: PlayerLook = { hair: 'bob', hairColor: 'blonde', skin: 's3', outfit: 'slim-hoodie', shirtColor: 'teal' };
    const KIM: PlayerLook = { hair: 'ponytail', hairColor: 'brown', skin: 's4', outfit: 'broad-apron', shirtColor: 'green' };
    const JO: PlayerLook = { hair: 'spiky', hairColor: 'red', skin: 's5', outfit: 'broad-overalls', shirtColor: 'yellow' };
    // The worker applies inputs on a later tick, so the keyframe in the join handler is still the old picture.
    let state = createRun({ seed: 1, hostId: 'H', players: [{ id: 'H', name: 'Host', look: HOST }] });
    let pending: PlayerInput[] = [];
    const handlers = new Set<(s: HostToClient) => void>();
    const local: Transport = {
      start() {},
      resume() {},
      sendInput(i) {
        pending.push(i);
      },
      onSnapshot(h) {
        handlers.add(h);
        return () => handlers.delete(h);
      },
      onError: () => () => {},
      close() {},
    };
    const emit = () => {
      if (pending.length) {
        state = step(state, pending);
        pending = [];
      }
      handlers.forEach((h) => h({ t: 'snapshot', state, sentAt: state.tick }));
    };
    const hostLink = createFakeLink();
    createHostRoom(hostLink, local, { token: 'H', name: 'Host', look: HOST });
    emit();
    const join = (peerId: string, token: string, name: string, look: PlayerLook, prev?: string) => {
      hostLink.peerJoins(peerId);
      hostLink.receive('join', { t: 'join', protocol: PROTOCOL_VERSION, token, name, look, ...(prev ? { prev } : {}) }, peerId);
    };

    join('sam', 'T1', 'Sam', SAM);
    const early = hostLink.sent.filter((s) => s.kind === 'snap' && s.target === 'sam').at(-1)!;
    expect((early.data as { state: GameState }).state.players.some((p) => p.id === 'T1')).toBe(false);
    emit();
    expect(state.players.find((p) => p.id === 'T1')!.look).toEqual(SAM);
    const caught = hostLink.sent.filter((s) => s.kind === 'snap' && s.target === 'sam').at(-1)!;
    const caughtState = (caught.data as { state: GameState }).state;
    expect(caughtState.players.find((p) => p.id === 'H')!.look).toEqual(HOST);
    expect(caughtState.players.find((p) => p.id === 'T1')!.look).toEqual(SAM);

    // Same seat, a new look (a rejoin after editing, or a refresh).
    hostLink.peerLeaves('sam');
    emit();
    join('sam2', 'T1', 'Sam', SAM2);
    emit();
    expect(state.players.find((p) => p.id === 'T1')!.look).toEqual(SAM2);

    // Jo takes Kim's away seat. The body Kim left now wears Jo's look.
    join('kim', 'T2', 'Kim', KIM);
    emit();
    hostLink.peerLeaves('kim');
    emit();
    join('jo', 'FRESH', 'Jo', JO, 'T2');
    expect(hostLink.sent.find((s) => s.kind === 'seat' && s.target === 'jo')?.data).toEqual({ t: 'seat', token: 'T2' });
    emit();
    expect(state.players.find((p) => p.id === 'T2')!.look).toEqual(JO);

    // Someone who was here from the first picture, following only the room-wide snapshots.
    const wire = hostLink.sent.filter((s) => (s.kind === 'snap' || s.kind === 'snapd') && s.target === undefined);
    let held = (wire[0]!.data as { state: GameState }).state;
    for (const m of wire.slice(1)) {
      if (m.kind === 'snap') held = (m.data as { state: GameState }).state;
      else if ((m.data as { patch?: Patch | null }).patch) held = applyPatch(held, (m.data as { patch: Patch }).patch) as GameState;
    }
    expect(held.players.find((p) => p.id === 'H')!.look).toEqual(HOST);
    expect(held.players.find((p) => p.id === 'T1')!.look).toEqual(SAM2);
    expect(held.players.find((p) => p.id === 'T2')!.look).toEqual(JO);
  });
});
