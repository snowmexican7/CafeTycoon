import { describe, it, expect } from 'vitest';
import { createPeerSession, HOST_TIMEOUT_MESSAGE, VERSION_MISMATCH_MESSAGE, type PeerStatus } from './peerSession';
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

const setup = () => {
  const link = createFakeLink();
  const t = timers();
  const peer = createPeerSession(link, { token: 'T1', name: 'Sam', timeoutMs: 15000, setTimer: t.setTimer, clearTimer: t.clearTimer });
  const statuses: PeerStatus[] = [];
  peer.onStatus((s) => statuses.push(s));
  const errors: string[] = [];
  peer.onError((m) => errors.push(m));
  const snaps: HostToClient[] = [];
  peer.onSnapshot((s) => snaps.push(s));
  return { link, t, peer, statuses, errors, snaps };
};
const hello = (hostToken = 'H') => ({ t: 'hello', protocol: 1, hostToken });

describe('PeerSession', () => {
  it("joins when greeted and relays only the host's snapshots", () => {
    // Review Focus 4
    const { link, peer, statuses, snaps } = setup();
    expect(peer.status()).toBe('connecting');
    link.receive('hello', hello(), 'hostPeer');
    expect(link.sent.at(-1)).toMatchObject({ kind: 'join', target: 'hostPeer', data: { t: 'join', protocol: 1, token: 'T1', name: 'Sam' } });
    expect(statuses).toEqual(['connected']);
    link.receive('snap', { t: 'snap', state: { phase: 'night' }, sentAt: 7 }, 'hostPeer');
    link.receive('snap', { t: 'snap', state: { phase: 'day' }, sentAt: 8 }, 'impostor');
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
    link.receive('snap', { t: 'snap', state: { phase: 'ended' }, sentAt: 9 }, 'hostPeer');
    link.peerLeaves('hostPeer');
    expect(peer.status()).toBe('connected');
    expect(statuses).toEqual(['connected']);
  });

  it('only follows a hello that carries the same host token', () => {
    const { link, peer, snaps } = setup();
    link.receive('hello', hello('H'), 'hostA');
    link.receive('hello', hello('X'), 'rogue');
    expect(link.sent.filter((s) => s.kind === 'join' && s.target === 'rogue')).toHaveLength(0);
    link.receive('snap', { t: 'snap', state: { phase: 'day' }, sentAt: 1 }, 'rogue');
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
});
