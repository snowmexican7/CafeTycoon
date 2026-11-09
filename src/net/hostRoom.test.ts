import { roundFloats } from './delta';
import { createPeerSession } from './peerSession';
import { step } from '../sim/step';
import type { GameState } from '../sim/types';
import { describe, it, expect } from 'vitest';
import { createTelemetry, withTelemetry, type TeleEvent } from '../host/telemetry';
import { createRun } from '../sim/run';
import { createHostRoom, SEND_GIVE_UP_MS } from './hostRoom';
import { PROTOCOL_VERSION } from './protocol';
import { createFakeLink } from './testing/fakeLink';
import type { HostToClient, Transport } from './transport';
import { addBots } from '../harness/crew';

function fakeLocal() {
  const inputs: unknown[] = [];
  const handlers = new Set<(s: HostToClient) => void>();
  const t: Transport = {
    start() {},
    resume() {},
    sendInput: (i) => {
      inputs.push(i);
    },
    onSnapshot: (h) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    onError: () => () => {},
    close() {},
  };
  return { t, inputs, emit: (s: HostToClient) => handlers.forEach((h) => h(s)) };
}
const snap = (): HostToClient => ({ t: 'snapshot', state: createRun({ seed: 1, hostId: 'H', players: [{ id: 'H', name: 'Host' }] }), sentAt: 1 });
const join = (token: string, name: string, protocol: number = PROTOCOL_VERSION) => ({ t: 'join', protocol, token, name });
const kinds = (inputs: unknown[], kind: string) => inputs.filter((i) => (i as { kind: string }).kind === kind);

describe('HostRoom', () => {
  it('greets a new connection and admits a valid join with the latest snapshot', () => {
    const link = createFakeLink();
    const local = fakeLocal();
    const members: unknown[] = [];
    createHostRoom(link, local.t, { token: 'H', name: 'Host' }, (m) => members.push(m));
    local.emit(snap());
    link.peerJoins('p1');
    expect(link.sent.at(-1)).toMatchObject({ kind: 'hello', target: 'p1', data: { t: 'hello', protocol: PROTOCOL_VERSION, hostToken: 'H' } });
    link.receive('join', join('T1', 'Sam'), 'p1');
    expect(local.inputs).toEqual([{ kind: 'join', playerId: 'T1', name: 'Sam' }]);
    expect(link.sent.filter((s) => s.kind === 'snap' && s.target === 'p1')).toHaveLength(1);
    expect(link.sent.at(-1)).toMatchObject({
      kind: 'lobby',
      data: { members: [{ token: 'H', name: 'Host' }, { token: 'T1', name: 'Sam' }], started: true },
    });
    expect(members.at(-1)).toEqual([
      { token: 'H', name: 'Host' },
      { token: 'T1', name: 'Sam' },
    ]);
  });

  it('broadcasts every snapshot to the room', () => {
    const link = createFakeLink();
    const local = fakeLocal();
    createHostRoom(link, local.t, { token: 'H', name: 'Host' });
    local.emit(snap());
    local.emit(snap());
    // 2.0.1: a keyframe first, then only what changed (here nothing).
    expect(link.sent.filter((s) => s.kind === 'snap' && s.target === undefined)).toHaveLength(1);
    expect(link.sent.filter((s) => s.kind === 'snapd' && s.target === undefined)).toEqual([{ kind: 'snapd', data: { t: 'snapd', seq: 2, patch: null, sentAt: 1 } }]);
  });

  it('keeps a joined peer in step through deltas, keyframes and a resync (2.0.1)', () => {
    const hostLink = createFakeLink('host');
    const local = fakeLocal();
    createHostRoom(hostLink, local.t, { token: 'H', name: 'Host' });
    const peerLink = createFakeLink('peer');
    const peer = createPeerSession(peerLink, { token: 'P1', name: 'Pat', timeoutMs: 1000, setTimer: () => 0, clearTimer: () => {} });
    const seen: GameState[] = [];
    peer.onSnapshot((s) => seen.push(s.state));
    let hostSent = 0, peerSent = 0;
    const pump = (drop = false) => {
      for (; hostSent < hostLink.sent.length; hostSent++) {
        const m = hostLink.sent[hostSent]!;
        if (m.target !== undefined && m.target !== 'peer') continue;
        if (drop && m.kind === 'snapd') { drop = false; continue; }
        peerLink.receive(m.kind, JSON.parse(JSON.stringify(m.data)), 'host');
      }
      for (; peerSent < peerLink.sent.length; peerSent++) {
        const m = peerLink.sent[peerSent]!;
        hostLink.receive(m.kind, JSON.parse(JSON.stringify(m.data)), 'peer');
      }
    };
    let state = addBots(createRun({ seed: 3, hostId: 'H', players: [{ id: 'H', name: 'Host' }] }), 2);
    local.emit({ t: 'snapshot', state, sentAt: 0 });
    hostLink.peerJoins('peer');
    pump(); pump();
    for (let i = 0; i < 400; i++) {
      state = step(state, i === 0 ? [{ kind: 'ready', playerId: 'H' }] : []);
      if (i % 3) continue;
      local.emit({ t: 'snapshot', state, sentAt: i });
      pump(i === 150); // lose one delta mid-day: the peer must heal
      pump();
      if (i > 160 || i < 150) expect(seen.at(-1)).toEqual(roundFloats(state));
    }
    expect(hostLink.sent.filter((m) => m.kind === 'snap' && m.target === undefined).length).toBeGreaterThanOrEqual(2); // periodic keyframe
    expect(hostLink.sent.filter((m) => m.kind === 'snap' && m.target === 'peer').length).toBe(2); // join + resync
  });

  it('rejects a different protocol version', () => {
    const link = createFakeLink();
    const local = fakeLocal();
    createHostRoom(link, local.t, { token: 'H', name: 'Host' });
    link.peerJoins('p1');
    link.receive('join', join('T1', 'Sam', 2), 'p1');
    expect(link.sent.at(-1)).toMatchObject({ kind: 'hello', target: 'p1', data: { reject: 'version' } });
    expect(local.inputs).toEqual([]);
  });

  it('forwards only inputs that match the sender token', () => {
    // Review Focus 1
    const link = createFakeLink();
    const local = fakeLocal();
    createHostRoom(link, local.t, { token: 'H', name: 'Host' });
    link.peerJoins('p1');
    link.receive('join', join('T1', 'Sam'), 'p1');
    local.inputs.length = 0;
    link.receive('input', { t: 'input', input: { kind: 'ready', playerId: 'T1' } }, 'p1');
    link.receive('input', { t: 'input', input: { kind: 'ready', playerId: 'H' } }, 'p1');
    link.receive('input', { t: 'input', input: { kind: 'ready', playerId: 'T1' } }, 'stranger');
    expect(local.inputs).toEqual([{ kind: 'ready', playerId: 'T1' }]);
  });

  it('lets a reconnecting token take over without a spurious leave', () => {
    // Review Focus 2
    const link = createFakeLink();
    const local = fakeLocal();
    const room = createHostRoom(link, local.t, { token: 'H', name: 'Host' });
    link.peerJoins('p1');
    link.receive('join', join('T1', 'Sam'), 'p1');
    link.peerJoins('p2');
    link.receive('join', join('T1', 'Sam'), 'p2');
    expect(kinds(local.inputs, 'leave')).toEqual([]);
    expect(room.members()).toEqual([
      { token: 'H', name: 'Host' },
      { token: 'T1', name: 'Sam' },
    ]);
    link.peerLeaves('p1');
    expect(kinds(local.inputs, 'leave')).toEqual([]);
    link.peerLeaves('p2');
    expect(local.inputs.at(-1)).toEqual({ kind: 'leave', playerId: 'T1' });
    expect(room.members()).toEqual([{ token: 'H', name: 'Host' }]);
  });

  it("ignores a join that claims the host's own token", () => {
    const link = createFakeLink();
    const local = fakeLocal();
    const room = createHostRoom(link, local.t, { token: 'H', name: 'Host' });
    link.peerJoins('p1');
    link.receive('join', join('H', 'Impostor'), 'p1');
    expect(local.inputs).toEqual([]);
    expect(room.members()).toEqual([{ token: 'H', name: 'Host' }]);
    link.receive('input', { t: 'input', input: { kind: 'ready', playerId: 'H' } }, 'p1');
    expect(local.inputs).toEqual([]);
  });

  it('closes the link and stops relaying', () => {
    const link = createFakeLink();
    const local = fakeLocal();
    const room = createHostRoom(link, local.t, { token: 'H', name: 'Host' });
    room.close();
    local.emit(snap());
    expect(link.left).toBe(true);
    expect(link.sent.filter((s) => s.kind === 'snap')).toHaveLength(0);
  });

  it("forwards a member's tele batch and drops impersonation", () => {
    const link = createFakeLink();
    const local = fakeLocal();
    const got: { token: string; events: TeleEvent[] }[] = [];
    createHostRoom(link, local.t, { token: 'H', name: 'Host' }, undefined, { onTele: (token, events) => got.push({ token, events }) });
    link.peerJoins('p1');
    link.receive('join', join('T1', 'Sam'), 'p1');
    const events = [{ kind: 'frame.long', data: { ms: 300 }, at: 5 }];
    link.receive('tele', { t: 'tele', token: 'T1', events }, 'p1');
    expect(got).toEqual([{ token: 'T1', events }]);
    link.receive('tele', { t: 'tele', token: 'H', events }, 'p1');
    link.receive('tele', { t: 'tele', token: 'T1', events }, 'stranger');
    link.receive('tele', { t: 'tele', token: 'T1', events: [{ kind: 'input', data: 1, at: 1 }] }, 'p1');
    link.receive('tele', { t: 'tele', token: 'T1', events: 'junk' }, 'p1');
    expect(got).toHaveLength(1);
  });

  it('ignores tele when no hook is given', () => {
    const link = createFakeLink();
    const local = fakeLocal();
    createHostRoom(link, local.t, { token: 'H', name: 'Host' });
    link.peerJoins('p1');
    link.receive('join', join('T1', 'Sam'), 'p1');
    expect(() => link.receive('tele', { t: 'tele', token: 'T1', events: [{ kind: 'x', data: 1, at: 1 }] }, 'p1')).not.toThrow();
  });

  it('a HostRoom on a telemetry-wrapped transport records peer joins and inputs', () => {
    const link = createFakeLink();
    const local = fakeLocal();
    const tele = createTelemetry({ host: 'H', build: 'test', protocol: PROTOCOL_VERSION }, { now: () => 0 });
    createHostRoom(link, withTelemetry(local.t, tele), { token: 'H', name: 'Host' });
    link.peerJoins('p1');
    link.receive('join', join('T1', 'Sam'), 'p1');
    link.receive('input', { t: 'input', input: { kind: 'move', playerId: 'T1', x: 1, y: 0, interact: false } }, 'p1');
    const recorded = tele.rows().map((r) => r.kind);
    expect(recorded).toContain('peer.join');
    expect(recorded).toContain('input');
    expect(kinds(local.inputs, 'join')).toHaveLength(1);
    expect(kinds(local.inputs, 'move')).toHaveLength(1);
  });

  describe('seats', () => {
    const started = (players: { id: string; name: string }[]): HostToClient => ({
      t: 'snapshot',
      state: createRun({ seed: 1, hostId: 'H', players }),
      sentAt: 1,
    });
    const crew = [
      { id: 'H', name: 'Host' },
      { id: 'T1', name: 'Sam' },
      { id: 'T2', name: 'Kim' },
    ];

    it('a closed tab coming back with a new tab token reclaims its away seat by prev, and is told so', () => {
      const link = createFakeLink();
      const local = fakeLocal();
      createHostRoom(link, local.t, { token: 'H', name: 'Host' });
      local.emit(started(crew));
      link.peerJoins('p1');
      link.receive('join', join('T1', 'Sam'), 'p1');
      link.peerJoins('p2');
      link.receive('join', join('T2', 'Kim'), 'p2');
      link.peerLeaves('p2');
      link.peerJoins('p3');
      link.receive('join', { ...join('FRESH', 'Kim'), prev: 'T2' }, 'p3');
      expect(link.sent.find((x) => x.kind === 'seat' && x.target === 'p3')?.data).toEqual({ t: 'seat', token: 'T2' });
      expect(kinds(local.inputs, 'join').at(-1)).toEqual({ kind: 'join', playerId: 'T2', name: 'Kim' });
      // inputs now come in as the reclaimed seat
      link.receive('input', { t: 'input', input: { kind: 'move', playerId: 'T2', x: 1, y: 0, interact: false } }, 'p3');
      expect(kinds(local.inputs, 'move')).toHaveLength(1);
      link.receive('input', { t: 'input', input: { kind: 'move', playerId: 'FRESH', x: 1, y: 0, interact: false } }, 'p3');
      expect(kinds(local.inputs, 'move')).toHaveLength(1);
    });

    it('matches an away seat by name when the browser lost its storage', () => {
      const link = createFakeLink();
      const local = fakeLocal();
      createHostRoom(link, local.t, { token: 'H', name: 'Host' });
      local.emit(started(crew));
      link.peerJoins('p1');
      link.receive('join', join('T1', 'Sam'), 'p1');
      link.peerJoins('p9');
      link.receive('join', join('OTHER', 'KIM'), 'p9');
      expect(link.sent.find((x) => x.kind === 'seat' && x.target === 'p9')?.data).toEqual({ t: 'seat', token: 'T2' });
    });

    it('never gives one seat to two live connections', () => {
      const link = createFakeLink();
      const local = fakeLocal();
      createHostRoom(link, local.t, { token: 'H', name: 'Host' });
      local.emit(started(crew));
      link.peerJoins('p1');
      link.receive('join', join('T1', 'Sam'), 'p1');
      link.peerJoins('p2');
      link.receive('join', { ...join('NEW', 'Sam'), prev: 'T1' }, 'p2');
      expect(link.sent.some((x) => x.kind === 'seat' && x.target === 'p2')).toBe(false);
      expect(kinds(local.inputs, 'join').at(-1)).toEqual({ kind: 'join', playerId: 'NEW', name: 'Sam' });
    });

    it('turns a fifth person away politely, before and after the start', () => {
      const link = createFakeLink();
      const local = fakeLocal();
      createHostRoom(link, local.t, { token: 'H', name: 'Host' });
      for (const p of ['p1', 'p2', 'p3']) {
        link.peerJoins(p);
        link.receive('join', join(`T-${p}`, p), p);
      }
      link.peerJoins('p4');
      link.receive('join', join('T-p4', 'p4'), 'p4');
      expect(link.sent.at(-1)).toMatchObject({ kind: 'hello', target: 'p4', data: { reject: 'full' } });
      expect(kinds(local.inputs, 'join')).toHaveLength(3);
    });
  });

  it('collapses snapshots that arrive while a send is still on the wire', async () => {
    const link = createFakeLink();
    const real = link.send.bind(link);
    const queued: (() => void)[] = [];
    link.send = (kind, data, target) => new Promise<void>((resolve) => {
      queued.push(() => {
        real(kind, data, target);
        resolve();
      });
    });
    const local = fakeLocal();
    createHostRoom(link, local.t, { token: 'H', name: 'Host' });
    let state = createRun({ seed: 1, hostId: 'H', players: [{ id: 'H', name: 'Host' }] });
    const snaps: GameState[] = [];
    for (let i = 0; i < 3; i++) {
      state = step(state, []);
      snaps.push(state);
      local.emit({ t: 'snapshot', state, sentAt: i + 1 });
    }
    // The first café is on the wire. The two newer ones must not join the queue behind it.
    expect(link.sent).toHaveLength(0);
    expect(queued).toHaveLength(1);
    for (let n = 0; n < 12; n++) {
      if (!queued.length) {
        await Promise.resolve();
        if (!queued.length) break;
      }
      queued.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    }
    const wire = link.sent.filter((m) => m.kind === 'snap' || m.kind === 'snapd');
    expect(wire.map((m) => (m.data as { seq: number }).seq)).toEqual([1, 2]);
    const peerLink = createFakeLink('peer');
    const peer = createPeerSession(peerLink, { token: 'P', name: 'Pat', timeoutMs: 1000, setTimer: () => 0, clearTimer: () => {} });
    const seen: GameState[] = [];
    peer.onSnapshot((s) => seen.push(s.state));
    peerLink.receive('hello', { t: 'hello', protocol: PROTOCOL_VERSION, hostToken: 'H' }, 'host');
    for (const m of wire) peerLink.receive(m.kind, JSON.parse(JSON.stringify(m.data)), 'host');
    expect(seen).toHaveLength(2);
    expect(seen.at(-1)).toEqual(roundFloats(snaps[2]));
    peer.close();
  });

  /** A clock the watchdog can be moved with, so a test never waits out SEND_GIVE_UP_MS. */
  function fakeClock() {
    let now = 0;
    const timers: { at: number; fn: () => void; dead: boolean }[] = [];
    return {
      setTimer(fn: () => void, ms: number) {
        const t = { at: now + ms, fn, dead: false };
        timers.push(t);
        return t;
      },
      clearTimer(id: unknown) {
        (id as { dead: boolean }).dead = true;
      },
      advance(ms: number) {
        now += ms;
        for (;;) {
          const due = timers.filter((t) => !t.dead && t.at <= now).sort((a, b) => a.at - b.at)[0];
          if (!due) return;
          due.dead = true;
          due.fn();
        }
      },
    };
  }

  it('gives up on a send that never settles, then ignores that promise when it resolves late', async () => {
    const link = createFakeLink();
    const real = link.send.bind(link);
    const clock = fakeClock();
    let hang = false;
    const held: { fire: (() => void) | null } = { fire: null };
    link.send = (kind, data, target) => {
      if (!hang) {
        real(kind, data, target);
        return;
      }
      hang = false;
      return new Promise<void>((resolve) => {
        held.fire = () => {
          real(kind, data, target);
          resolve();
        };
      });
    };
    const local = fakeLocal();
    const room = createHostRoom(link, local.t, { token: 'H', name: 'Host' }, undefined, clock);
    let state = createRun({ seed: 1, hostId: 'H', players: [{ id: 'H', name: 'Host' }] });
    const shot = () => {
      state = step(state, []);
      local.emit({ t: 'snapshot', state, sentAt: state.tick });
      return state;
    };
    shot();
    link.sent.length = 0;
    hang = true;
    shot();
    const latest = shot();
    const snapsOf = () => link.sent.filter((m) => m.kind === 'snap' || m.kind === 'snapd');
    expect(snapsOf()).toHaveLength(0);
    clock.advance(SEND_GIVE_UP_MS - 1);
    expect(snapsOf()).toHaveLength(0);
    clock.advance(1);
    expect(snapsOf().map((m) => (m.data as { t: string; seq: number }).t + (m.data as { seq: number }).seq)).toEqual(['snap1']);
    expect((snapsOf()[0]!.data as { state: GameState }).state).toEqual(roundFloats(latest));
    held.fire?.();
    await Promise.resolve();
    await Promise.resolve();
    const third = shot();
    const frames = snapsOf();
    expect(frames.at(-1)!.data).toMatchObject({ t: 'snapd', seq: 2 });
    const peerLink = createFakeLink('peer');
    const peer = createPeerSession(peerLink, { token: 'P', name: 'Pat', timeoutMs: 1000, setTimer: () => 0, clearTimer: () => {} });
    const seen: GameState[] = [];
    peer.onSnapshot((s) => seen.push(s.state));
    peerLink.receive('hello', { t: 'hello', protocol: PROTOCOL_VERSION, hostToken: 'H' }, 'host');
    peerLink.receive('snap', frames.find((m) => (m.data as { t: string }).t === 'snap')!.data, 'host');
    peerLink.receive('snapd', frames.at(-1)!.data, 'host');
    expect(seen.at(-1)).toEqual(roundFloats(third));
    peer.close();
    room.close();
  });

  it('a peer leaving mid-send does not stop snapshots to the peers still there', async () => {
    const link = createFakeLink();
    const real = link.send.bind(link);
    const clock = fakeClock();
    let hang = false;
    const held: { fire: (() => void) | null } = { fire: null };
    link.send = (kind, data, target) => {
      if (!hang) {
        real(kind, data, target);
        return;
      }
      hang = false;
      return new Promise<void>((resolve) => {
        held.fire = () => {
          real(kind, data, target);
          resolve();
        };
      });
    };
    const local = fakeLocal();
    const room = createHostRoom(link, local.t, { token: 'H', name: 'Host' }, undefined, clock);
    let state = createRun({ seed: 2, hostId: 'H', players: [{ id: 'H', name: 'Host' }] });
    const shot = () => {
      state = step(state, []);
      local.emit({ t: 'snapshot', state, sentAt: state.tick });
      return state;
    };
    shot();
    link.peerJoins('p1');
    link.receive('join', join('T1', 'Sam'), 'p1');
    link.peerJoins('p2');
    link.receive('join', join('T2', 'Ada'), 'p2');
    link.sent.length = 0;
    hang = true;
    shot();
    const latest = shot();
    // The clock does not move: leaving has to unblock the room without waiting out the watchdog.
    link.peerLeaves('p1');
    const frames = () => link.sent.filter((m) => m.kind === 'snap' || m.kind === 'snapd');
    expect(frames()).toHaveLength(1);
    expect(frames()[0]!.target).toBeUndefined();
    expect((frames()[0]!.data as { state: GameState }).state).toEqual(roundFloats(latest));
    expect(room.members().map((m) => m.token)).toEqual(['H', 'T2']);
    const lobby = link.sent.filter((m) => m.kind === 'lobby').at(-1)!.data as { members: { token: string }[] };
    expect(lobby.members.map((m) => m.token)).toEqual(['H', 'T2']);
    shot();
    expect(frames().at(-1)!.data).toMatchObject({ t: 'snapd', seq: 2 });
    held.fire?.();
    await Promise.resolve();
    await Promise.resolve();
    shot();
    expect(frames().at(-1)!.data).toMatchObject({ t: 'snapd', seq: 3 });
    room.close();
  });

  it('bot cut 4a: lobby messages carry no bots setting', () => {
    const link = createFakeLink();
    const local = fakeLocal();
    createHostRoom(link, local.t, { token: 'H', name: 'Host' });
    link.peerJoins('p1');
    link.receive('join', join('T1', 'Sam'), 'p1');
    const lobby = link.sent.filter((x) => x.kind === 'lobby').map((x) => x.data as Record<string, unknown>);
    expect(lobby.length).toBeGreaterThan(0);
    for (const m of lobby) expect(Object.keys(m).sort()).toEqual(['members', 'started', 't']);
  });
});
