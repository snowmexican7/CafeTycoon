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
  let state: GameState = createRun({ seed: 1, hostId: 'H', players: [{ id: 'H', name: 'Host' }], settings: { bots: 0 } });
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
});
