# Phase 1b: Peer-to-Peer Co-op Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two to four friends in different homes play one café together from the live GitHub Pages site with no server and no new account: the host's browser runs the game, the others join by room code over direct browser-to-browser connections.

**Architecture:** The simulation and the host's Web Worker are untouched. A `RoomLink` adapter wraps the Trystero library (serverless WebRTC with public introduction relays). On the host, `HostRoom` bridges the room and the existing local `Transport`: it maps each connection to a player token, feeds `join`, `leave`, and `input` into the Worker, and broadcasts every snapshot. On a peer, `PeerSession` implements the same `Transport` interface over the room, so `main.ts` renders a peer exactly as it renders the host. Identity is our player token, never the library's per-load peer id; every message is parsed before use and every input still passes the simulation's own validation.

**Tech Stack:** TypeScript 5, Vite 8, Vitest 5, PixiJS 8 (unchanged); `trystero@0.26.0` (Nostr strategy, exact pin).

**Spec:** `docs/superpowers/specs/2026-10-28-cafetycoon-design.md`, section 10 (revised 2026-10-28 for peer-to-peer), plus sections 11 and 18. Library facts: `docs/reference/2026-10-28-trystero-research.md`.

## Global Constraints

- No server, no new account, no secrets. The site stays static on GitHub Pages.
- `trystero` pinned exactly at `0.26.0` (`npm install --save-exact trystero@0.26.0`). Import only from `'trystero'` (never `trystero/torrent` or `trystero/mqtt`, which throw at import). Its 0.26 wire format requires every browser in a room to run the same build, so the handshake carries `PROTOCOL_VERSION` and mismatches are rejected with a plain message.
- Identity is the player token from `settingsStore`, never Trystero's `selfId` (it changes on every page load). A peer may only send inputs whose `playerId` is its own token; the host drops anything else.
- `src/sim` is not modified in this plan. The host still routes every input through `step`, which validates it.
- `src/net/roomLink.ts` is the only file that imports `trystero`. `HostRoom` and `PeerSession` depend on the `RoomLink` interface and are unit-tested against a fake.
- Room codes: five characters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I or O), case-insensitive on input. `APP_ID = 'cafetycoon-v1'`; the room code is both the Trystero room id and its `password`.
- Peers never write the run snapshot; only a host resumes a run. Both roles remember the room code so they can reopen or rejoin it.
- Work on branch `phase-1b`, commit after every task, push the branch, run the whole-branch review, then merge to `main` in the final task once the two-tab checklist passes.
- `npm test`, `npx tsc --noEmit`, and `npm run build` stay green after every task; check the typecheck's exit code explicitly.

## Review Focus

Failure modes a casual player will hit that the spec implies. Each has its test in the task named.

1. A peer sends an input carrying someone else's `playerId`: the host drops it and the simulation never sees it (Task 2).
2. The same player token arrives from a second connection (same person, a second tab or a reconnect): the new connection takes over the mapping, the old one is forgotten, and no spurious `leave` is sent (Task 2).
3. The host refreshes mid-day: peers report "host away", and when a new `hello` arrives from a different peer id they adopt it, re-send `join`, and report connected again (Task 3).
4. A snapshot arrives from a peer id that is not the host: it is ignored (Task 3).
5. No `hello` arrives within the timeout: exactly one error with the remedies is reported, the status is `failed`, and a late `hello` after that is ignored (Task 3).

---

## File structure

```
src/net/protocol.ts              APP_ID, PROTOCOL_VERSION, ACTIONS, message types, parse* guards
src/net/roomCode.ts              makeRoomCode, normalizeRoomCode
src/net/roomLink.ts              RoomLink interface + createTrysteroLink (the only trystero import)
src/net/testing/fakeLink.ts      in-memory RoomLink for tests (never imported by production code)
src/net/hostRoom.ts              createHostRoom: room <-> local Transport bridge, member list
src/net/peerSession.ts           createPeerSession: a Transport over a RoomLink, status + lobby events
src/net/peerTransport.ts         createPeerTransport(code, token, name) = peerSession over a real link
src/storage/roomStore.ts         remembers { code, role } for reopen/rejoin
src/ui/viewModels.ts             + lobbyViewModel
src/ui/lobby.ts                  room code, members, status, Start/Leave
src/ui/title.ts                  + Host a co-op run, Join a room (code), Rejoin
src/ui/pause.ts                  + room code and members
src/ui/hud.ts                    + setRoom(code | null) in the bar
src/main.ts                      host / peer / solo session roles, lobby, reopen and rejoin
docs/playtest-checklist-coop.md  two-tab and one-friend checklist
README.md                        how to host and join
```

---

### Task 1: Protocol, room codes, room store, and the Trystero adapter

**Files:**
- Create: `src/net/protocol.ts`, `src/net/roomCode.ts`, `src/net/roomLink.ts`, `src/net/testing/fakeLink.ts`, `src/storage/roomStore.ts`
- Modify: `package.json` (dependency)
- Test: `src/net/protocol.test.ts`, `src/net/roomCode.test.ts`, `src/storage/roomStore.test.ts`

**Interfaces:**
- Produces (`protocol.ts`):

```ts
export const APP_ID = 'cafetycoon-v1';
export const PROTOCOL_VERSION = 1;
export const ACTIONS = ['hello', 'join', 'input', 'snap', 'lobby'] as const;
export type ActionKind = (typeof ACTIONS)[number];
export interface Member { token: string; name: string }
export interface HelloMsg { t: 'hello'; protocol: number; hostToken: string; reject?: 'version' }
export interface JoinMsg { t: 'join'; protocol: number; token: string; name: string }
export interface InputMsg { t: 'input'; input: PlayerInput }
export interface SnapMsg { t: 'snap'; state: GameState; sentAt: number }
export interface LobbyMsg { t: 'lobby'; members: Member[]; started: boolean }
export function parseHello(data: unknown): HelloMsg | null;  // t, finite protocol, non-empty hostToken; reject only 'version' or absent
export function parseJoin(data: unknown): JoinMsg | null;    // t, finite protocol, token 1–64 chars; name trimmed to 16 chars, 'Barista' if empty
export function parseInput(data: unknown): InputMsg | null;  // t, input is an object with string kind and string playerId (the sim validates the rest)
export function parseSnap(data: unknown): SnapMsg | null;    // t, state is an object with string phase, finite sentAt
export function parseLobby(data: unknown): LobbyMsg | null;  // t, members array of {token: string, name: string}, boolean started
```

- Produces (`roomCode.ts`): `ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'`, `ROOM_CODE_LENGTH = 5`, `makeRoomCode(random: () => number): string` (`random()` in `[0, 1)`), `normalizeRoomCode(raw: string): string | null` (trim, uppercase, must be exactly five alphabet characters).
- Produces (`roomStore.ts`, key `'cafetycoon.room'`): `interface RoomRecord { code: string; role: 'host' | 'peer' }`, `createRoomStore(storage: StorageLike): { save(r: RoomRecord): void; load(): RoomRecord | null; clear(): void }` (load returns null for garbage or an invalid code).
- Produces (`roomLink.ts`):

```ts
export interface RoomLink {
  readonly selfId: string;
  send(kind: ActionKind, data: unknown, target?: string): void;        // target omitted = broadcast
  onMessage(kind: ActionKind, handler: (data: unknown, peerId: string) => void): void;
  onPeerJoin(handler: (peerId: string) => void): void;
  onPeerLeave(handler: (peerId: string) => void): void;
  onError(handler: (message: string) => void): void;
  peers(): string[];
  leave(): void;
}
export function createTrysteroLink(code: string): RoomLink;
```
`createTrysteroLink`: `joinRoom({ appId: APP_ID, password: code }, code, { onJoinError: (e) => fan out e.error ?? String(e) })`; one `room.makeAction(kind)` per entry of `ACTIONS` created up front, each `.onMessage` fanning out to that kind's handlers; `room.onPeerJoin = …` and `room.onPeerLeave = …` assigned as properties fanning out; `peers()` = `Object.keys(room.getPeers())`; `send` calls the action's `send(data, target ? { target } : undefined)` and ignores the returned promise. Not unit-tested (it is the seam to the library); Task 5 exercises it.

- Produces (`testing/fakeLink.ts`):

```ts
export interface FakeLink extends RoomLink {
  sent: { kind: ActionKind; data: unknown; target?: string }[];
  peerJoins(peerId: string): void;
  peerLeaves(peerId: string): void;
  receive(kind: ActionKind, data: unknown, from: string): void;
  fail(message: string): void;
  left: boolean;
}
export function createFakeLink(selfId?: string): FakeLink;   // default selfId 'self'; peers() reflects joins minus leaves
```

- [ ] **Step 1: Create the branch and install the library**

```bash
git checkout -b phase-1b
npm install --save-exact trystero@0.26.0
```
Expected: `package.json` lists `"trystero": "0.26.0"`; `npm run build` still succeeds (nothing imports it yet).

- [ ] **Step 2: Write the protocol and room-code tests**

```ts
// src/net/protocol.test.ts
import { parseHello, parseInput, parseJoin, parseLobby, parseSnap, PROTOCOL_VERSION } from './protocol';
it('parses well-formed messages and rejects junk', () => {
  expect(parseHello({ t: 'hello', protocol: PROTOCOL_VERSION, hostToken: 'h' })).toEqual({ t: 'hello', protocol: PROTOCOL_VERSION, hostToken: 'h' });
  expect(parseHello({ t: 'hello', protocol: 1, hostToken: 'h', reject: 'version' })!.reject).toBe('version');
  expect(parseHello({ t: 'hello', protocol: 1, hostToken: 'h', reject: 'banned' })).toBeNull();
  expect(parseHello({ t: 'hello', protocol: 'x', hostToken: 'h' })).toBeNull();
  expect(parseHello(null)).toBeNull();
  expect(parseJoin({ t: 'join', protocol: 1, token: 'abc', name: '  Sam  ' })).toEqual({ t: 'join', protocol: 1, token: 'abc', name: 'Sam' });
  expect(parseJoin({ t: 'join', protocol: 1, token: 'abc', name: 'x'.repeat(40) })!.name).toHaveLength(16);
  expect(parseJoin({ t: 'join', protocol: 1, token: 'abc', name: '' })!.name).toBe('Barista');
  expect(parseJoin({ t: 'join', protocol: 1, token: '', name: 'Sam' })).toBeNull();
  expect(parseInput({ t: 'input', input: { kind: 'ready', playerId: 'abc' } })).toEqual({ t: 'input', input: { kind: 'ready', playerId: 'abc' } });
  expect(parseInput({ t: 'input', input: 'ready' })).toBeNull();
  expect(parseSnap({ t: 'snap', state: { phase: 'night' }, sentAt: 5 })).toEqual({ t: 'snap', state: { phase: 'night' }, sentAt: 5 });
  expect(parseSnap({ t: 'snap', state: 'nope', sentAt: 5 })).toBeNull();
  expect(parseLobby({ t: 'lobby', members: [{ token: 'a', name: 'A' }], started: false })!.members).toHaveLength(1);
  expect(parseLobby({ t: 'lobby', members: [{ token: 1 }], started: false })).toBeNull();
});
// src/net/roomCode.test.ts
import { makeRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET } from './roomCode';
it('makes five-letter codes from the safe alphabet', () => {
  let i = 0; const seq = [0, 0.99, 0.5, 0.25, 0.75];
  const code = makeRoomCode(() => seq[i++ % seq.length]);
  expect(code).toHaveLength(5);
  expect([...code].every((c) => ROOM_CODE_ALPHABET.includes(c))).toBe(true);
  expect(code[0]).toBe('A'); expect(code[1]).toBe('Z');
});
it('normalizes typed codes and rejects bad ones', () => {
  expect(normalizeRoomCode(' abcde ')).toBe('ABCDE');
  expect(normalizeRoomCode('ABCD')).toBeNull();
  expect(normalizeRoomCode('ABCDI')).toBeNull();   // I is not in the alphabet
  expect(normalizeRoomCode('AB CD')).toBeNull();
});
```

- [ ] **Step 3: Write the room-store test**

```ts
// src/storage/roomStore.test.ts
import { createRoomStore } from './roomStore';
import { memoryStorage } from './storageLike';
it('remembers the room and role, and ignores garbage', () => {
  const st = memoryStorage(); const store = createRoomStore(st);
  expect(store.load()).toBeNull();
  store.save({ code: 'ABCDE', role: 'peer' });
  expect(store.load()).toEqual({ code: 'ABCDE', role: 'peer' });
  st.setItem('cafetycoon.room', JSON.stringify({ code: 'bad code', role: 'host' }));
  expect(store.load()).toBeNull();
  store.clear(); expect(store.load()).toBeNull();
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run src/net src/storage/roomStore.test.ts`
Expected: FAIL, cannot resolve `./protocol`, `./roomCode`, `./roomStore`.

- [ ] **Step 5: Implement `protocol.ts`, `roomCode.ts`, `roomStore.ts`, `roomLink.ts`, `testing/fakeLink.ts`**

- [ ] **Step 6: Run tests, typecheck, build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all pass; the build's main chunk does not yet contain trystero (nothing imports `roomLink.ts`), which is fine.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/net src/storage && git commit -m "feat(net): co-op protocol, room codes, room store, Trystero adapter"
```

---

### Task 2: HostRoom: bridge the room to the local transport

**Files:**
- Create: `src/net/hostRoom.ts`
- Test: `src/net/hostRoom.test.ts`

**Interfaces:**
- Consumes: `RoomLink` and `FakeLink` (Task 1), `Transport` and `HostToClient` (`src/net/transport.ts`), `parseJoin`/`parseInput`, `PROTOCOL_VERSION`.
- Produces:

```ts
export interface HostRoom { members(): Member[]; latestSnapshot(): HostToClient | null; close(): void }
export function createHostRoom(link: RoomLink, local: Transport, host: Member, onMembers?: (members: Member[]) => void): HostRoom;
```
Behaviour: subscribe to `local.onSnapshot`: remember the latest and `link.send('snap', { t: 'snap', state, sentAt })` to everyone; the first snapshot flips `started` to true and broadcasts the lobby. `link.onPeerJoin(peerId)`: `link.send('hello', { t: 'hello', protocol: PROTOCOL_VERSION, hostToken: host.token }, peerId)`. `link.onMessage('join')`: `parseJoin`; a different `protocol` gets `hello` with `reject: 'version'` to that peer and nothing else; otherwise forget any other peer id that held this token (no `leave` for it), map `peerId -> member`, `local.sendInput({ kind: 'join', playerId: token, name })`, send the latest snapshot to that peer if there is one, broadcast the lobby. `link.onMessage('input')`: `parseInput`; drop unless the sender is mapped and `input.playerId === member.token`; otherwise `local.sendInput(input)`. `link.onPeerLeave(peerId)`: if mapped, delete and `local.sendInput({ kind: 'leave', playerId: token })`, broadcast the lobby. `members()` is `[host, ...mapped]` in join order. Broadcasting the lobby means `link.send('lobby', { t: 'lobby', members, started })` plus `onMembers?.(members)`. `close()` unsubscribes from snapshots and calls `link.leave()`.

- [ ] **Step 1: Write the tests**

```ts
// src/net/hostRoom.test.ts
import { createFakeLink } from './testing/fakeLink';
import { createHostRoom } from './hostRoom';
import type { HostToClient, Transport } from './transport';
import { createRun } from '../sim/run';
function fakeLocal() {
  const inputs: unknown[] = []; const handlers = new Set<(s: HostToClient) => void>();
  const t: Transport = { start() {}, resume() {}, sendInput: (i) => { inputs.push(i); }, onSnapshot: (h) => { handlers.add(h); return () => handlers.delete(h); }, onError: () => () => {}, close() {} };
  return { t, inputs, emit: (s: HostToClient) => handlers.forEach((h) => h(s)) };
}
const snap = (): HostToClient => ({ t: 'snapshot', state: createRun({ seed: 1, hostId: 'H', players: [{ id: 'H', name: 'Host' }] }), sentAt: 1 });
const join = (token: string, name: string, protocol = 1) => ({ t: 'join', protocol, token, name });
it('greets a new connection and admits a valid join with the latest snapshot', () => {
  const link = createFakeLink(); const local = fakeLocal(); const members: unknown[] = [];
  createHostRoom(link, local.t, { token: 'H', name: 'Host' }, (m) => members.push(m));
  local.emit(snap());
  link.peerJoins('p1');
  expect(link.sent.at(-1)).toMatchObject({ kind: 'hello', target: 'p1', data: { t: 'hello', protocol: 1, hostToken: 'H' } });
  link.receive('join', join('T1', 'Sam'), 'p1');
  expect(local.inputs).toEqual([{ kind: 'join', playerId: 'T1', name: 'Sam' }]);
  expect(link.sent.filter((s) => s.kind === 'snap' && s.target === 'p1')).toHaveLength(1);
  expect(link.sent.at(-1)).toMatchObject({ kind: 'lobby', data: { members: [{ token: 'H', name: 'Host' }, { token: 'T1', name: 'Sam' }], started: true } });
  expect(members.at(-1)).toEqual([{ token: 'H', name: 'Host' }, { token: 'T1', name: 'Sam' }]);
});
it('broadcasts every snapshot to the room', () => {
  const link = createFakeLink(); const local = fakeLocal();
  createHostRoom(link, local.t, { token: 'H', name: 'Host' });
  local.emit(snap()); local.emit(snap());
  expect(link.sent.filter((s) => s.kind === 'snap' && s.target === undefined)).toHaveLength(2);
});
it('rejects a different protocol version', () => {
  const link = createFakeLink(); const local = fakeLocal();
  createHostRoom(link, local.t, { token: 'H', name: 'Host' });
  link.peerJoins('p1'); link.receive('join', join('T1', 'Sam', 2), 'p1');
  expect(link.sent.at(-1)).toMatchObject({ kind: 'hello', target: 'p1', data: { reject: 'version' } });
  expect(local.inputs).toEqual([]);
});
it('forwards only inputs that match the sender token', () => {   // Review Focus 1
  const link = createFakeLink(); const local = fakeLocal();
  createHostRoom(link, local.t, { token: 'H', name: 'Host' });
  link.peerJoins('p1'); link.receive('join', join('T1', 'Sam'), 'p1'); local.inputs.length = 0;
  link.receive('input', { t: 'input', input: { kind: 'ready', playerId: 'T1' } }, 'p1');
  link.receive('input', { t: 'input', input: { kind: 'ready', playerId: 'H' } }, 'p1');
  link.receive('input', { t: 'input', input: { kind: 'ready', playerId: 'T1' } }, 'stranger');
  expect(local.inputs).toEqual([{ kind: 'ready', playerId: 'T1' }]);
});
it('lets a reconnecting token take over without a spurious leave', () => {   // Review Focus 2
  const link = createFakeLink(); const local = fakeLocal();
  const room = createHostRoom(link, local.t, { token: 'H', name: 'Host' });
  link.peerJoins('p1'); link.receive('join', join('T1', 'Sam'), 'p1');
  link.peerJoins('p2'); link.receive('join', join('T1', 'Sam'), 'p2');
  expect(local.inputs.filter((i) => (i as { kind: string }).kind === 'leave')).toEqual([]);
  expect(room.members()).toEqual([{ token: 'H', name: 'Host' }, { token: 'T1', name: 'Sam' }]);
  link.peerLeaves('p1');
  expect(local.inputs.filter((i) => (i as { kind: string }).kind === 'leave')).toEqual([]);
  link.peerLeaves('p2');
  expect(local.inputs.at(-1)).toEqual({ kind: 'leave', playerId: 'T1' });
  expect(room.members()).toEqual([{ token: 'H', name: 'Host' }]);
});
it('closes the link and stops relaying', () => {
  const link = createFakeLink(); const local = fakeLocal();
  const room = createHostRoom(link, local.t, { token: 'H', name: 'Host' });
  room.close(); local.emit(snap());
  expect(link.left).toBe(true); expect(link.sent.filter((s) => s.kind === 'snap')).toHaveLength(0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/net/hostRoom.test.ts`
Expected: FAIL, cannot resolve `./hostRoom`.

- [ ] **Step 3: Implement `hostRoom.ts`**

- [ ] **Step 4: Run to verify pass, typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/net/hostRoom.ts src/net/hostRoom.test.ts && git commit -m "feat(net): HostRoom bridges the P2P room to the local simulation"
```

---

### Task 3: PeerSession: a Transport over the room

**Files:**
- Create: `src/net/peerSession.ts`, `src/net/peerTransport.ts`
- Test: `src/net/peerSession.test.ts`

**Interfaces:**
- Consumes: `RoomLink`/`FakeLink`, `parseHello`/`parseSnap`/`parseLobby`, `PROTOCOL_VERSION`, `Transport`.
- Produces:

```ts
export type PeerStatus = 'connecting' | 'connected' | 'hostAway' | 'rejected' | 'failed';
export interface PeerTransport extends Transport {
  onStatus(handler: (status: PeerStatus) => void): () => void;
  onLobby(handler: (msg: LobbyMsg) => void): () => void;
  status(): PeerStatus;
}
export interface PeerSessionOptions {
  token: string; name: string; timeoutMs: number;
  setTimer(fn: () => void, ms: number): unknown; clearTimer(id: unknown): void;
}
export const HOST_TIMEOUT_MESSAGE = "Couldn't find the host for this room. Check the code and try again, or ask the host to reopen the room. If it keeps failing, one of you may be on a network that blocks direct connections; a phone hotspot usually works.";
export const VERSION_MISMATCH_MESSAGE = 'The host is running a different version of the game. Reload the page on both sides and try again.';
export function createPeerSession(link: RoomLink, opts: PeerSessionOptions): PeerTransport;
export function createPeerTransport(code: string, token: string, name: string): PeerTransport;   // peerTransport.ts: createPeerSession(createTrysteroLink(code), { token, name, timeoutMs: 15000, setTimer: setTimeout, clearTimer: clearTimeout })
```
Behaviour: status starts `connecting` and a timer of `timeoutMs` is armed; if it fires, emit `onError(HOST_TIMEOUT_MESSAGE)` once and set `failed`. `link.onMessage('hello')` from `peerId`: `parseHello`; `reject === 'version'` sets `rejected` and emits `onError(VERSION_MISMATCH_MESSAGE)`; otherwise, unless status is `failed` or `rejected`, clear the timer, set `hostPeerId = peerId`, `link.send('join', { t: 'join', protocol: PROTOCOL_VERSION, token, name }, peerId)`, set `connected` (this also handles a new host peer id after `hostAway`). `link.onMessage('snap')` only from `hostPeerId`: `parseSnap` and emit `{ t: 'snapshot', state, sentAt }`. `link.onMessage('lobby')` only from `hostPeerId`: `parseLobby` and emit. `link.onPeerLeave(hostPeerId)`: `hostPeerId = null`, status `hostAway`. `link.onError(message)`: emit `onError(message)`, status `failed`. `sendInput` sends `{ t: 'input', input }` to `hostPeerId` or drops it. `start`/`resume` do nothing (a peer never runs the simulation). `close()` clears the timer and calls `link.leave()`. Status changes emit to `onStatus` handlers only when the value changes.

- [ ] **Step 1: Write the tests**

```ts
// src/net/peerSession.test.ts
import { createFakeLink } from './testing/fakeLink';
import { createPeerSession, HOST_TIMEOUT_MESSAGE, VERSION_MISMATCH_MESSAGE, type PeerStatus } from './peerSession';
import type { HostToClient } from './transport';
function timers() {
  const pending: { fn: () => void; ms: number; id: number }[] = []; let next = 1;
  return { setTimer: (fn: () => void, ms: number) => { const id = next++; pending.push({ fn, ms, id }); return id; }, clearTimer: (id: unknown) => { const i = pending.findIndex((p) => p.id === id); if (i >= 0) pending.splice(i, 1); }, fire: () => { const p = pending.shift(); p?.fn(); }, pending };
}
const setup = () => {
  const link = createFakeLink(); const t = timers();
  const peer = createPeerSession(link, { token: 'T1', name: 'Sam', timeoutMs: 15000, ...t });
  const statuses: PeerStatus[] = []; peer.onStatus((s) => statuses.push(s));
  const errors: string[] = []; peer.onError((m) => errors.push(m));
  const snaps: HostToClient[] = []; peer.onSnapshot((s) => snaps.push(s));
  return { link, t, peer, statuses, errors, snaps };
};
const hello = (hostToken = 'H') => ({ t: 'hello', protocol: 1, hostToken });
it('joins when greeted and relays only the host\'s snapshots', () => {   // Review Focus 4
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
it('reports the host away and re-joins a returning host under a new peer id', () => {   // Review Focus 3
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
it('fails once when no host greets it, and ignores a late hello', () => {   // Review Focus 5
  const { link, t, peer, errors, statuses } = setup();
  expect(t.pending[0].ms).toBe(15000);
  t.fire();
  expect(errors).toEqual([HOST_TIMEOUT_MESSAGE]);
  expect(peer.status()).toBe('failed');
  link.receive('hello', hello(), 'hostPeer');
  expect(link.sent.filter((s) => s.kind === 'join')).toHaveLength(0);
  expect(statuses).toEqual(['failed']);
});
it('surfaces a version rejection and link errors', () => {
  const a = setup();
  a.link.receive('hello', { ...hello(), reject: 'version' }, 'hostPeer');
  expect(a.errors).toEqual([VERSION_MISMATCH_MESSAGE]); expect(a.peer.status()).toBe('rejected');
  const b = setup();
  b.link.fail('could not connect to peer');
  expect(b.errors).toEqual(['could not connect to peer']); expect(b.peer.status()).toBe('failed');
});
it('clears the timer and leaves the room on close', () => {
  const { link, t, peer } = setup();
  peer.close();
  expect(t.pending).toHaveLength(0); expect(link.left).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/net/peerSession.test.ts`
Expected: FAIL, cannot resolve `./peerSession`.

- [ ] **Step 3: Implement `peerSession.ts` and `peerTransport.ts`**

- [ ] **Step 4: Run to verify pass, typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/net/peerSession.ts src/net/peerTransport.ts src/net/peerSession.test.ts && git commit -m "feat(net): PeerSession - a Transport over the P2P room with status and lobby events"
```

---

### Task 4: Lobby, title host/join, room info, and the session roles in `main.ts`

**Files:**
- Create: `src/ui/lobby.ts`
- Modify: `src/ui/viewModels.ts`, `src/ui/title.ts`, `src/ui/pause.ts`, `src/ui/hud.ts`, `src/main.ts`, `index.html` (add `<div id="lobby" hidden></div>`), `src/style.css`
- Test: `src/ui/viewModels.test.ts`

**Interfaces:**
- Consumes: `createHostRoom` (Task 2), `createPeerTransport` and `PeerStatus` (Task 3), `makeRoomCode`/`normalizeRoomCode`, `createRoomStore`, `createTrysteroLink`, `createLocalTransport`, existing stores and overlays.
- Produces (`viewModels.ts`):

```ts
export interface LobbyVM { code: string; members: string[]; isHost: boolean; canStart: boolean; statusText: string }
export function lobbyViewModel(input: { code: string; members: Member[]; isHost: boolean; status: PeerStatus | 'hosting'; started: boolean }): LobbyVM;
// statusText: hosting & !started -> 'Share the code. Start when everyone is in.'; hosting & started -> 'Room open. Friends can still join.';
// connecting -> 'Finding the host…'; connected & !started -> 'Waiting for the host to start…'; connected & started -> '';
// hostAway -> 'Waiting for the host to come back…'; rejected -> 'Version mismatch. Both of you reload.'; failed -> 'Could not connect.'
// canStart: isHost && !started
```
- Produces (`lobby.ts`): `createLobby(container, handlers: { onStart(): void; onLeave(): void }): { render(vm: LobbyVM): void; show(): void; hide(): void }` showing the code large, the member names, the status line, **Start the run** when `canStart`, and **Leave**.
- `title.ts`: two more actions, `host` (same form as solo) and `join` (a `[name=code]` input beside a **Join a room** button), plus **Rejoin room XXXXX** when the title view model says so. `TitleVM` gains `rejoinCode: string | null` (from the room store when `role === 'peer'`). Handler signature becomes `{ onStart(choice); onHost(choice); onJoin(code: string, name: string); onResume(); onRejoin(code: string) }`.
- `pause.ts`: `render(current)` gains an optional `room?: { code: string; members: string[] }` rendered as "Room ABCDE · Host, Sam, Jo".
- `hud.ts`: `setRoom(code: string | null)` adds or removes a "room ABCDE" span in the bar, patched in place.

`main.ts` wiring:
- `Session` gains `role: 'solo' | 'host' | 'peer'`, `code: string | null`, `room: HostRoom | null`, `lobbyMembers: Member[]`, `peerStatus: PeerStatus | 'hosting'`.
- **Host:** `onHost(choice)` → `code = makeRoomCode(Math.random)`; `roomStore.save({ code, role: 'host' })`; `local = createLocalTransport()`; `link = createTrysteroLink(code)`; `room = createHostRoom(link, local, { token, name }, members => rerender lobby and pause)`; session uses `local` as its transport with role host; show the lobby in hosting mode. **Start the run** calls `local.start({ seed, hostId: token, players: room.members().map(m => ({ id: m.token, name: m.name })), settings })` and arms the 2 s watchdog then (move the watchdog arming out of `startSession` into a `begin` helper so peers never get one).
- **Peer:** `onJoin(code, name)` → `normalizeRoomCode`, else a notice; `roomStore.save({ code, role: 'peer' })`; `transport = createPeerTransport(code, token, name)`; session role peer, `me = token`; `transport.onLobby` updates members and `started`; `transport.onStatus` updates the lobby status and shows the lobby again on `hostAway`, hides it on `connected` once a snapshot has arrived; `transport.onError` → `abandonSession` with the message (and `roomStore.clear()` on `rejected`/timeout, keep it on `hostAway`). Peers skip `stores.snapshot.save`.
- **Reopen (host refresh):** `onResume` reads the snapshot and the room store; if `role === 'host'`, create the link and `HostRoom` for the same code before `local.resume(saved)`, so waiting peers get a fresh `hello`.
- **Rejoin (peer refresh):** the title shows **Rejoin room XXXXX** from the room store; it runs the peer flow with the saved code.
- The lobby overlay is visible while the session has no snapshot yet, or while a peer is `hostAway`; it hides on the first snapshot. `hud.setRoom(code)` for host and peer, `null` for solo. Leaving a room (lobby **Leave**, pause **Quit to title**, `ended`) clears the room store and closes `room`/`transport`.
- The first-snapshot watchdog applies only when `local.start`/`local.resume` is called (host and solo), not to peers.

- [ ] **Step 1: Write the lobby view-model tests**

```ts
// src/ui/viewModels.test.ts (append)
describe('lobby view model', () => {
  const members = [{ token: 'H', name: 'Host' }, { token: 'T1', name: 'Sam' }];
  it('describes the host lobby before and after start', () => {
    expect(lobbyViewModel({ code: 'ABCDE', members, isHost: true, status: 'hosting', started: false })).toEqual({ code: 'ABCDE', members: ['Host', 'Sam'], isHost: true, canStart: true, statusText: 'Share the code. Start when everyone is in.' });
    expect(lobbyViewModel({ code: 'ABCDE', members, isHost: true, status: 'hosting', started: true }).canStart).toBe(false);
  });
  it('describes every peer status', () => {
    const base = { code: 'ABCDE', members, isHost: false, started: false } as const;
    expect(lobbyViewModel({ ...base, status: 'connecting' }).statusText).toBe('Finding the host…');
    expect(lobbyViewModel({ ...base, status: 'connected' }).statusText).toBe('Waiting for the host to start…');
    expect(lobbyViewModel({ ...base, status: 'connected', started: true }).statusText).toBe('');
    expect(lobbyViewModel({ ...base, status: 'hostAway', started: true }).statusText).toBe('Waiting for the host to come back…');
    expect(lobbyViewModel({ ...base, status: 'failed' }).canStart).toBe(false);
  });
  it('offers rejoin on the title when the room store says peer', () => {
    expect(titleViewModel([], null, { code: 'ABCDE', role: 'peer' }).rejoinCode).toBe('ABCDE');
    expect(titleViewModel([], null, { code: 'ABCDE', role: 'host' }).rejoinCode).toBeNull();
    expect(titleViewModel([], null, null).rejoinCode).toBeNull();
  });
});
```
(`titleViewModel` gains an optional third parameter `room: RoomRecord | null = null`, so the existing title tests compile unchanged.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui`
Expected: FAIL, `lobbyViewModel` is not exported and `titleViewModel` rejects a third argument.

- [ ] **Step 3: Implement `lobbyViewModel` and the `titleViewModel` change**

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/ui`
Expected: all pass.

- [ ] **Step 5: Implement `lobby.ts`, the title/pause/hud changes, `index.html`, `style.css`, and the `main.ts` roles**

- [ ] **Step 6: Run tests, typecheck, build; then a two-tab check in the dev server**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all pass; the main chunk now contains trystero (roughly 30 kB more gzipped).
Then `npm run dev`, open two tabs: tab A **Host a co-op run** shows a code and a lobby with one member; tab B **Join a room** with that code joins within a few seconds and both lobbies list two members; **Start the run** in A puts both tabs on night 1 with two baristas; a buy in B lowers cash in both; Ready in both opens the day; WASD in B moves B's barista on A's screen; no console errors in either tab.

- [ ] **Step 7: Commit**

```bash
git add src index.html && git commit -m "feat(ui): lobby, host/join/rejoin flows, room info; host and peer session roles"
```

---

### Task 5: Reconnection checks, co-op checklist, README, review, merge

**Files:**
- Create: `docs/playtest-checklist-coop.md`
- Modify: `README.md`, `docs/playtest-checklist.md` (one line pointing to the co-op list)

- [ ] **Step 1: Write `docs/playtest-checklist-coop.md`**

One checkbox per line, to run with two tabs on one machine and then once with a real friend: host creates a room and the code shows in the lobby and HUD; a second tab joins and both lobbies list two names; the host starts and both see night 1 with two baristas; the peer buys a card and both cash readouts drop; both press Ready and the day opens; the peer's barista moves on the host's screen; the peer serves a drink and cash rises for both; the peer refreshes, chooses **Rejoin room**, and its barista reconnects mid-day holding nothing; the host refreshes, the peer shows "Waiting for the host to come back…", the host resumes and the peer reconnects within a few seconds; a wrong code fails after about fifteen seconds with the remedies message; the pause menu shows the room and members on both sides; the peer cannot change pace; the week-end screen shows "Waiting for the host…" on the peer; both consoles stay clean; finally, the same list with one friend on another network, noting how long joining took.

- [ ] **Step 2: Run the two-tab list in the dev server and fix what it finds**

Run: `npm run dev`, then the checklist with two tabs. Expected: every two-tab box ticked. Anything that fails gets a failing test (in `hostRoom.test.ts` or `peerSession.test.ts` where the logic allows) before the fix.

- [ ] **Step 3: Update the README**

Under "How to play": host a run, share the five-letter code, friends press Join; the host's browser runs the game, so the host keeps the tab open; a refresh on either side reconnects; the network caveat in one sentence with the phone-hotspot remedy. Under "Working on it": one line that `src/net/roomLink.ts` is the only file that touches the networking library.

- [ ] **Step 4: Commit and push; whole-branch review**

```bash
git add -A && git commit -m "docs: co-op playtest checklist and README; two-tab fixes"
git push -u origin phase-1b
```
Then the fresh-context review of `main..phase-1b` as in phase 1a; fix Critical and Important findings with a failing test first.

- [ ] **Step 5: Merge to main and watch the deploy**

```bash
git checkout main && git pull --ff-only && git merge --no-ff phase-1b -m "Phase 1b: peer-to-peer co-op" && git push
gh run watch --exit-status
```
Expected: test and deploy jobs green.

- [ ] **Step 6: Live two-tab check, then the friend check**

Open `https://snowmexican7.github.io/CafeTycoon/` in two tabs and run the two-tab half of the co-op checklist. Expected: every box ticked, consoles clean. The one-friend half is for the next game night; record the result in the checklist afterwards.
