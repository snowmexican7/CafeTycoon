import { createPeerSession, type PeerTransport } from './peerSession';
import { createTrysteroLink } from './roomLink';

/** Join a friend's room by code. The returned Transport drives the page exactly like the local one does for a host. */
export function createPeerTransport(code: string, token: string, name: string): PeerTransport {
  return createPeerSession(createTrysteroLink(code), {
    token,
    name,
    timeoutMs: 15_000,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  });
}
