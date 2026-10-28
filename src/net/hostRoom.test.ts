import { describe, it, expect } from 'vitest';
import { createRun } from '../sim/run';
import { createHostRoom } from './hostRoom';
import { createFakeLink } from './testing/fakeLink';
import type { HostToClient, Transport } from './transport';

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
const join = (token: string, name: string, protocol = 1) => ({ t: 'join', protocol, token, name });
const kinds = (inputs: unknown[], kind: string) => inputs.filter((i) => (i as { kind: string }).kind === kind);

describe('HostRoom', () => {
  it('greets a new connection and admits a valid join with the latest snapshot', () => {
    const link = createFakeLink();
    const local = fakeLocal();
    const members: unknown[] = [];
    createHostRoom(link, local.t, { token: 'H', name: 'Host' }, (m) => members.push(m));
    local.emit(snap());
    link.peerJoins('p1');
    expect(link.sent.at(-1)).toMatchObject({ kind: 'hello', target: 'p1', data: { t: 'hello', protocol: 1, hostToken: 'H' } });
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
    expect(link.sent.filter((s) => s.kind === 'snap' && s.target === undefined)).toHaveLength(2);
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
});
