# Trystero research, 2026-10-28

Facts about the serverless WebRTC library the co-op plan uses, checked against the
repository README, CHANGELOG, source, and the npm registry on 2026-10-28 by a research agent.
Sources: https://github.com/dmotz/trystero (README), its CHANGELOG.md and `packages/`
source, https://registry.npmjs.org/trystero . Latest `trystero` is **0.26.0** (2026-10-04),
MIT. Re-check before upgrading: the API changed in 0.23, 0.24, 0.25 and 0.26.

## Import and join

- `import { joinRoom, selfId } from 'trystero'` is the Nostr strategy; the package is a
  one-line re-export of `@trystero-p2p/nostr`. Other strategies are scoped packages
  (`@trystero-p2p/torrent`, `@trystero-p2p/mqtt`, …). **`trystero/torrent` and
  `trystero/mqtt` throw at import** even though they are still in the exports map.
- `joinRoom(config, roomId, callbacks?)` returns a `Room`. `config.appId` is required and
  seeds topic hashing. `config.password` encrypts the connection handshake (AES-GCM, key
  from `password:appId:roomId`); a wrong password fires `callbacks.onJoinError`.
- The relay topic is `sha1('trystero'/appId/roomId)`; the password is **not** part of it,
  so anyone who knows the app id and room code can see that a room exists, but not read it.
- Relays: `config.relayConfig = { urls, redundancy, manualReconnection, warnOnRelayFailure }`.
  Default Nostr list is 29 public relays, redundancy 5, chosen deterministically from the
  app id. Public relays are volunteer-run; open issue #208 shows a socket can retire after a
  minute of failures.
- ICE: defaults are Google STUN plus `stun.cloudflare.com:3478`. `config.turnConfig`
  appends TURN servers; `config.rtcConfig.iceServers` replaces everything.
  `callbacks.handshakeTimeoutMs` defaults to 10 000.

## Sending and receiving

- **Since 0.25.0** `room.makeAction<T>(name)` returns `{ send, onMessage, onReceiveProgress, onReceive }`
  (tuple destructuring fails). `onMessage` is an assignable property, not a subscribe call:
  `action.onMessage = (data, context) => …` where `context.peerId` names the sender (checked
  against the shipped `types.d.mts`; the README summary that implied `(data, peerId)` is out of date). `send(data, { target })` where `target` is a peer id, an
  array, or omitted for broadcast; it resolves when local sending finishes, not on delivery.
- Payloads: any JSON value, or `Blob` / `ArrayBuffer` / typed array. Action names are 1–32
  UTF-8 bytes. Frames are 16 KiB; larger payloads are chunked; a few-KB snapshot is one frame.
  Data channels are ordered and reliable.
- 0.26.0 changed the wire format: **every browser in a room must run the same version.**

## Peer lifecycle

- `room.onPeerJoin = fn` and `room.onPeerLeave = fn` are assignable properties (existing
  peers are replayed to a newly assigned handler). `room.getPeers()` returns
  `Record<peerId, RTCPeerConnection>`. `room.leave()` notifies peers and closes connections;
  a `beforeunload` listener calls it automatically.
- `selfId` is a random 20-character id generated **on every page load**; it is not
  persisted, so a refreshed host is a new peer id. Identity has to ride on our own tokens.
- Leave detection: an explicit leave is immediate; a connection reaching `failed`/`closed`
  is immediate; `disconnected` gets a hard-coded 5 s grace. A hard network drop takes the
  browser's ICE failure time plus 5 s (exact wall-clock not verified). No heartbeat;
  `room.ping(peerId)` exists.
- Calling `joinRoom` again with the same app id and room id returns the existing `Room`;
  `leave()` releases it so a later `joinRoom` creates a fresh one.

## Failure modes

- README: "some networks simply don't allow direct P2P connections"; the fix is TURN via
  `turnConfig`. Mobile carrier NAT failures appear in issues #97, #118, #36.
  `onJoinError` reports "could not connect to peer … configure TURN servers".
- No peer limit is enforced; rooms are a full mesh and browsers cap concurrent WebRTC
  connections. Four players is well inside that.

## TypeScript and build

- All packages ship `.d.mts` types, are ESM-only, and need no Node polyfills (core has no
  dependencies; nostr adds `@noble/secp256k1`). Bundle: ~75 kB minified, ~27 kB gzipped.
  Vite 8 specifically is not mentioned anywhere; nothing suggests a problem.
