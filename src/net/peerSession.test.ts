import { describe, it, expect } from 'vitest';
import { createPeerSession, HOST_TIMEOUT_MESSAGE, ROOM_FULL_MESSAGE, VERSION_MISMATCH_MESSAGE, type PeerStatus } from './peerSession';
import { PROTOCOL_VERSION } from './protocol';
import { createFakeLink } from './testing/fakeLink';
import type { HostToClient } from './transport';

function timers() {
  const pending: { fn: () => void; ms: number; id: number }[] = [];
  let next = 1;
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = next++;
      pending.push({ fn, ms, id });
      return id;
    },
    clearTimer: (id: unknown) => {
      const i = pending.findIndex((p) => p.id === id);
      if (i >= 0) pending.splice(i, 1);
    },
    fire: () => {
      const p = pending.shift();
      p?.fn();
    },
    pending,
  };
}

const setup = (prev?: string) => {
  const link = createFakeLink();
  const t = timers();
  const peer = createPeerSession(link, { token: 'T1', name: 'Sam', prev, timeoutMs: 15000, setTimer: t.setTimer, clearTimer: t.clearTimer });
  const statuses: PeerStatus[] = [];
  peer.onStatus((s) => statuses.push(s));
  const errors: string[] = [];
  peer.onError((m) => errors.push(m));
  const snaps: HostToClient[] = [];
  peer.onSnapshot((s) => snaps.push(s));
  return { link, t, peer, statuses, errors, snaps };
};
const hello = (hostToken = 'H') => ({ t: 'hello', protocol: PROTOCOL_VERSION, hostToken });

describe('PeerSession', () => {
  it("joins when greeted and relays only the host's snapshots", () => {
    // Review Focus 4
    const { link, peer, statuses, snaps } = setup();
    expect(peer.status()).toBe('connecting');
    link.receive('hello', hello(), 'hostPeer');
    expect(link.sent.at(-1)).toMatchObject({ kind: 'join', target: 'hostPeer', data: { t: 'join', protocol: PROTOCOL_VERSION, token: 'T1', name: 'Sam' } });
    expect(statuses).toEqual(['connected']);
    link.receive('snap', { t: 'snap', state: { phase: 'night' }, sentAt: 7, seq: 1 }, 'hostPeer');
    link.receive('snap', { t: 'snap', state: { phase: 'day' }, sentAt: 8, seq: 1 }, 'impostor');
    expect(snaps).toEqual([{ t: 'snapshot', state: { phase: 'night' }, sentAt: 7 }]);
    peer.sendInput({ kind: 'ready', playerId: 'T1' });
    expect(link.sent.at(-1)).toMatchObject({ kind: 'input', target: 'hostPeer', data: { t: 'input', input: { kind: 'ready', playerId: 'T1' } } });
  });

  it('reports the host away and re-joins a returning host under a new peer id', () => {
    // Review Focus 3
    const { link, peer, statuses } = setup();
    link.receive('hello', hello(), 'hostA');
    link.peerLeaves('hostA');
    expect(peer.status()).toBe('hostAway');
    peer.sendInput({ kind: 'ready', playerId: 'T1' });
    expect(link.sent.filter((s) => s.kind === 'input')).toHaveLength(0);
    link.receive('hello', hello(), 'hostB');
    expect(link.sent.at(-1)).toMatchObject({ kind: 'join', target: 'hostB' });
    expect(statuses).toEqual(['connected', 'hostAway', 'connected']);
  });

  it('fails once when no host greets it, and ignores a late hello', () => {
    // Review Focus 5
    const { link, t, peer, errors, statuses } = setup();
    expect(t.pending[0].ms).toBe(15000);
    t.fire();
    expect(errors).toEqual([HOST_TIMEOUT_MESSAGE]);
    expect(peer.status()).toBe('failed');
    link.receive('hello', hello(), 'hostPeer');
    expect(link.sent.filter((s) => s.kind === 'join')).toHaveLength(0);
    expect(statuses).toEqual(['failed']);
  });

  it('surfaces a version rejection', () => {
    const a = setup();
    a.link.receive('hello', { ...hello(), reject: 'version' }, 'hostPeer');
    expect(a.errors).toEqual([VERSION_MISMATCH_MESSAGE]);
    expect(a.peer.status()).toBe('rejected');
  });

  it('reports a link error while connecting with the remedies message', () => {
    const { link, peer, errors } = setup();
    link.fail('could not connect to peer abc after exchanging SDP; configure TURN servers');
    expect(errors).toEqual([HOST_TIMEOUT_MESSAGE]);
    expect(peer.status()).toBe('failed');
  });

  it('ignores link errors once connected', () => {
    const { link, peer, errors, statuses } = setup();
    link.receive('hello', hello(), 'hostPeer');
    link.fail('could not connect to peer otherPeer after exchanging SDP');
    expect(errors).toEqual([]);
    expect(peer.status()).toBe('connected');
    expect(statuses).toEqual(['connected']);
    link.peerLeaves('hostPeer');
    link.fail('another mesh failure');
    expect(errors).toEqual([]);
    expect(peer.status()).toBe('hostAway');
  });

  it('does not report the host away once the run has ended', () => {
    const { link, peer, statuses } = setup();
    link.receive('hello', hello(), 'hostPeer');
    link.receive('snap', { t: 'snap', state: { phase: 'ended' }, sentAt: 9, seq: 1 }, 'hostPeer');
    link.peerLeaves('hostPeer');
    expect(peer.status()).toBe('connected');
    expect(statuses).toEqual(['connected']);
  });

  it('only follows a hello that carries the same host token', () => {
    const { link, peer, snaps } = setup();
    link.receive('hello', hello('H'), 'hostA');
    link.receive('hello', hello('X'), 'rogue');
    expect(link.sent.filter((s) => s.kind === 'join' && s.target === 'rogue')).toHaveLength(0);
    link.receive('snap', { t: 'snap', state: { phase: 'day' }, sentAt: 1, seq: 1 }, 'rogue');
    expect(snaps).toEqual([]);
    link.peerLeaves('hostA');
    link.receive('hello', hello('X'), 'rogue2');
    expect(peer.status()).toBe('hostAway');
    link.receive('hello', hello('H'), 'hostB');
    expect(peer.status()).toBe('connected');
    expect(link.sent.at(-1)).toMatchObject({ kind: 'join', target: 'hostB' });
  });

  it('clears the timer and leaves the room on close', () => {
    const { link, t, peer } = setup();
    peer.close();
    expect(t.pending).toHaveLength(0);
    expect(link.left).toBe(true);
  });

  it('sends tele batches to the host only once connected', () => {
    const { link, peer } = setup();
    const events = [{ kind: 'frame.long', data: { ms: 300 }, at: 5 }];
    peer.sendTele(events);
    expect(link.sent.filter((s) => s.kind === 'tele')).toHaveLength(0);
    link.receive('hello', hello(), 'hostPeer');
    peer.sendTele(events);
    expect(link.sent.filter((s) => s.kind === 'tele')).toHaveLength(1); // the pre-handshake call was not queued
    expect(link.sent.at(-1)).toEqual({ kind: 'tele', target: 'hostPeer', data: { t: 'tele', token: 'T1', events } });
    peer.sendTele([]);
    expect(link.sent.filter((s) => s.kind === 'tele')).toHaveLength(1);
  });

  describe('seats', () => {
    it('offers its previous seat on join and adopts the seat the host hands back', () => {
      const { link, peer } = setup('OLD');
      const seats: string[] = [];
      peer.onSeat((t) => seats.push(t));
      link.peerJoins('h');
      link.receive('hello', hello(), 'h');
      expect(link.sent.find((x) => x.kind === 'join')?.data).toMatchObject({ token: 'T1', prev: 'OLD' });
      link.receive('seat', { t: 'seat', token: 'stranger-seat' }, 'someone-else');
      expect(seats).toEqual([]);
      link.receive('seat', { t: 'seat', token: 'OLD' }, 'h');
      expect(seats).toEqual(['OLD']);
      expect(peer.token()).toBe('OLD');
      peer.sendTele([{ kind: 'x', data: null, at: 1 }]);
      expect(link.sent.at(-1)?.data).toMatchObject({ t: 'tele', token: 'OLD' });
      // the host comes back after a reload: rejoin as the adopted seat, without a prev
      link.peerLeaves('h');
      link.peerJoins('h2');
      link.receive('hello', hello(), 'h2');
      const rejoin = link.sent.filter((x) => x.kind === 'join').at(-1)!.data as Record<string, unknown>;
      expect(rejoin.token).toBe('OLD');
      expect(rejoin.prev).toBeUndefined();
    });

    it('a full room ends the session with a friendly message', () => {
      const { link, peer, statuses, errors } = setup();
      link.peerJoins('h');
      link.receive('hello', hello(), 'h');
      link.receive('hello', { ...hello(), reject: 'full' }, 'h');
      expect(peer.status()).toBe('full');
      expect(statuses.at(-1)).toBe('full');
      expect(errors.at(-1)).toBe(ROOM_FULL_MESSAGE);
    });
  });

  it('builds on keyframes with deltas and asks for a keyframe when one is missing (2.0.1)', () => {
    const { link, snaps } = setup();
    link.receive('hello', hello(), 'hostPeer');
    link.receive('snap', { t: 'snap', state: { phase: 'day', tick: 1, cash: 5 }, sentAt: 1, seq: 4 }, 'hostPeer');
    link.receive('snapd', { t: 'snapd', seq: 5, patch: ['o', { tick: ['r', 2] }], sentAt: 2 }, 'hostPeer');
    link.receive('snapd', { t: 'snapd', seq: 6, patch: null, sentAt: 3 }, 'hostPeer');
    expect(snaps.map((s) => s.state)).toEqual([{ phase: 'day', tick: 1, cash: 5 }, { phase: 'day', tick: 2, cash: 5 }, { phase: 'day', tick: 2, cash: 5 }]);
    expect(snaps[0]!.state).toEqual({ phase: 'day', tick: 1, cash: 5 }); // the base is never mutated
    // A gap: seq 7 lost. Nothing is shown, one resync is asked, and repeats are held back.
    link.receive('snapd', { t: 'snapd', seq: 8, patch: ['o', { tick: ['r', 4] }], sentAt: 4 }, 'hostPeer');
    link.receive('snapd', { t: 'snapd', seq: 9, patch: ['o', { tick: ['r', 5] }], sentAt: 5 }, 'hostPeer');
    expect(snaps).toHaveLength(3);
    expect(link.sent.filter((s) => s.kind === 'resync')).toEqual([{ kind: 'resync', data: { t: 'resync' }, target: 'hostPeer' }]);
    link.receive('snap', { t: 'snap', state: { phase: 'day', tick: 9, cash: 6 }, sentAt: 6, seq: 9 }, 'hostPeer');
    link.receive('snapd', { t: 'snapd', seq: 10, patch: ['o', { cash: ['r', 7] }], sentAt: 7 }, 'hostPeer');
    expect(snaps.at(-1)!.state).toEqual({ phase: 'day', tick: 9, cash: 7 });
    // A malformed patch drops the base and asks again instead of throwing.
    link.receive('snapd', { t: 'snapd', seq: 11, patch: ['a', [], 1], sentAt: 8 }, 'hostPeer');
    expect(link.sent.filter((s) => s.kind === 'resync')).toHaveLength(2);
  });
});
