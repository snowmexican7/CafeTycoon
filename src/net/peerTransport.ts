import { createPeerSession, type PeerTransport } from './peerSession';
import { createTrysteroLink } from './roomLink';
import { roomLinkFor } from './localLink';
import type { PlayerLook } from '../sim/types';

/** Join a friend's room by code. The returned Transport drives the page exactly like the local one does for a host.
 *  `look` (R4 e) travels with the join so the host and every peer see this player's barista. */
export function createPeerTransport(code: string, token: string, name: string, prev?: string, look?: PlayerLook): PeerTransport {
  return createPeerSession(roomLinkFor(code, createTrysteroLink), {
    token,
    name,
    prev,
    ...(look ? { look } : {}),
    timeoutMs: 15_000,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  });
}
