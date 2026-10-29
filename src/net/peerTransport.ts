import { createPeerSession, type PeerTransport } from './peerSession';
import { createTrysteroLink } from './roomLink';
import { roomLinkFor } from './localLink';

/** Join a friend's room by code. The returned Transport drives the page exactly like the local one does for a host. */
export function createPeerTransport(code: string, token: string, name: string, prev?: string): PeerTransport {
  return createPeerSession(roomLinkFor(code, createTrysteroLink), {
    token,
    name,
    prev,
    timeoutMs: 15_000,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  });
}
