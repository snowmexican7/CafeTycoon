// Co-op guest lag probe. In-process host + guest, no browser and no WebRTC.
//   npx tsx scripts/coopLagProbe.ts
//
// Measured on the pre-fix host (same slow link: one send completes every 3rd snapshot):
//   behindTicks 3 → 66 → 126 over 60 snapshots, 42 sends still queued, guest tick 54 vs host 180.
// The run below is the fixed host. behindTicks should stay flat, about one send (9 ticks).
import { addStandIns, installHarness } from '../src/harness';
import { applyPatch, diff, roundFloats } from '../src/net/delta';
import { KEYFRAME_EVERY, createHostRoom } from '../src/net/hostRoom';
import { createPeerSession } from '../src/net/peerSession';
import { createFakeLink } from '../src/net/testing/fakeLink';
import type { ActionKind } from '../src/net/protocol';
import type { HostToClient, Transport } from '../src/net/transport';
import { createRun, startDay } from '../src/sim/run';
import { step } from '../src/sim/step';
import type { GameState } from '../src/sim/types';
import { hudLive } from '../src/ui/live';
import { hudViewModel } from '../src/ui/viewModels';

installHarness();

/** Trystero writes a payload inline only up to one 16384-byte frame minus its 36-byte header. */
const INLINE_JSON_BYTES = 16384 - 36;
const bytesOf = (v: unknown): number => new TextEncoder().encode(JSON.stringify(v)).length;

function sizeSample(): Record<string, unknown> {
  // Classic café: it starts with machines and supplies, so people actually queue.
  // A fresh Gear café starts with only the bin, and nobody walks in until someone buys a machine.
  let s = createRun({
    seed: 4,
    hostId: 'host',
    players: [{ id: 'host', name: 'Host' }, { id: 'guest', name: 'Guest' }],
    settings: { dayLengthSec: 45, nightLengthSec: 2, pace: 3, cashier: false },
  });
  addStandIns(s, 2);
  s = startDay(s);
  let wire: unknown = null;
  let seq = 0;
  let snaps = 0;
  let fullSum = 0;
  let deltaSum = 0;
  let fullMax = 0;
  let deltaMax = 0;
  let over = 0;
  let diffMs = 0;
  let applyMs = 0;
  let viewMs = 0;
  let maxCust = 0;
  for (let t = 0; t < 45 * 60; t++) {
    s = step(s, []);
    if (s.phase !== 'day' && s.phase !== 'closing') continue;
    if (s.tick % 3 !== 0) continue;
    snaps++;
    maxCust = Math.max(maxCust, s.customers.length);
    const full = bytesOf(roundFloats(s));
    fullSum += full;
    fullMax = Math.max(fullMax, full);
    if (full > INLINE_JSON_BYTES) over++;
    const tView = performance.now();
    hudViewModel(s);
    hudLive(s, 'guest');
    viewMs += performance.now() - tView;
    seq++;
    if (!wire || seq % KEYFRAME_EVERY === 0) {
      wire = roundFloats(s);
      const n = bytesOf(wire);
      deltaSum += n;
      deltaMax = Math.max(deltaMax, n);
      if (n > INLINE_JSON_BYTES) over++;
    } else {
      const t0 = performance.now();
      const patch = diff(wire, s);
      diffMs += performance.now() - t0;
      const t1 = performance.now();
      if (patch) wire = applyPatch(wire, patch);
      applyMs += performance.now() - t1;
      const n = bytesOf(patch);
      deltaSum += n;
      deltaMax = Math.max(deltaMax, n);
      if (n > INLINE_JSON_BYTES) over++;
    }
  }
  const avg = (n: number) => Math.round(n / Math.max(1, snaps));
  return {
    scenario: 'classic cafe, 2 humans + 2 stand-ins, 45s day',
    snaps,
    maxCustomers: maxCust,
    fullAvg: avg(fullSum),
    fullMax,
    deltaAvg: avg(deltaSum),
    deltaMax,
    payloadsOverInline: over,
    inlineJsonBytes: INLINE_JSON_BYTES,
    diffAvgMs: +(diffMs / Math.max(1, snaps)).toFixed(3),
    applyAvgMs: +(applyMs / Math.max(1, snaps)).toFixed(3),
    guestViewAvgMs: +(viewMs / Math.max(1, snaps)).toFixed(3),
  };
}

/** One Trystero send completes every third snapshot. Returns how far the guest's tick trails the host. */
async function slowLink(): Promise<Record<string, unknown>> {
  const pending: (() => void)[] = [];
  const host = createFakeLink('host');
  const realSend = host.send.bind(host);
  host.send = (kind: ActionKind, data: unknown, target?: string) => new Promise<void>((resolve) => {
    pending.push(() => {
      realSend(kind, data, target);
      resolve();
    });
  });
  const handlers = new Set<(s: HostToClient) => void>();
  const local: Transport = {
    start() {}, resume() {}, sendInput() {},
    onSnapshot: (h) => { handlers.add(h); return () => handlers.delete(h); },
    onError: () => () => {},
    close() {},
  };
  createHostRoom(host, local, { token: 'host', name: 'Host' });
  const peerLink = createFakeLink('peer');
  const peer = createPeerSession(peerLink, { token: 'guest', name: 'Guest', timeoutMs: 60_000, setTimer: () => 0, clearTimer: () => {} });
  let guestTick = 0;
  let applied = 0;
  peer.onSnapshot((snap) => { applied++; guestTick = snap.state.tick; });
  let s: GameState = startDay(createRun({
    seed: 1, hostId: 'host', players: [{ id: 'host', name: 'Host' }, { id: 'guest', name: 'Guest' }],
    gear: true, settings: { dayLengthSec: 30, cashier: false },
  }));
  const emit = () => handlers.forEach((h) => h({ t: 'snapshot', state: s, sentAt: s.tick }));
  const pump = () => {
    for (const m of host.sent) peerLink.receive(m.kind, JSON.parse(JSON.stringify(m.data)), 'host');
    host.sent.length = 0;
    for (const m of peerLink.sent) host.receive(m.kind, JSON.parse(JSON.stringify(m.data)), 'peer');
    peerLink.sent.length = 0;
  };
  const flush = async () => { for (let n = 0; n < 8; n++) await new Promise<void>((r) => setImmediate(r)); };
  const finishReady = async () => { while (pending.length) { pending.shift()?.(); await flush(); } };
  emit();
  await finishReady();
  pump();
  host.peerJoins('peer');
  await finishReady();
  pump();
  const behind: number[] = [];
  for (let i = 0; i < 60; i++) {
    s = step(step(step(s, []), []), []);
    emit();
    if (i % 3 === 2 && pending.length) {
      pending.shift()?.();
      await flush();
    }
    pump();
    behind.push(s.tick - guestTick);
  }
  peer.close();
  return {
    hostTick: s.tick,
    guestTick,
    applied,
    queuedSends: pending.length,
    behindStart: behind[0],
    behindMid: behind[29],
    behindEnd: behind.at(-1),
    behindMax: Math.max(...behind),
    beforeFix: { behindStart: 3, behindMid: 66, behindEnd: 126, queuedSends: 42, guestTick: 54, hostTick: 180 },
  };
}

const out = { sizes: sizeSample(), slowLink: await slowLink() };
console.log(JSON.stringify(out, null, 2));
