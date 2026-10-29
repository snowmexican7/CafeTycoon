import { ACTIONS, type ActionKind } from './protocol';
import type { RoomLink } from './roomLink';

/**
 * A RoomLink between tabs of one browser over BroadcastChannel, for local multi-tab playtests and automated
 * browser tests on machines where WebRTC can't connect. Opt in with `?link=local` in the URL. It is
 * never used otherwise; real rooms always go through trystero.
 */
type Frame =
  | { t: 'hello' | 'here' | 'bye'; from: string; to?: string }
  | { t: 'msg'; from: string; to?: string; kind: ActionKind; data: unknown };

export function wantsLocalLink(search: string): boolean {
  return new URLSearchParams(search).get('link') === 'local';
}

export function createLocalLink(code: string, id = Math.random().toString(36).slice(2, 12)): RoomLink {
  const ch = new BroadcastChannel(`cafetycoon-room-${code}`);
  const peers = new Set<string>();
  const msg = new Map<ActionKind, Set<(data: unknown, peerId: string) => void>>(ACTIONS.map((k) => [k, new Set()]));
  const joins = new Set<(peerId: string) => void>();
  const leaves = new Set<(peerId: string) => void>();
  const post = (f: Frame) => ch.postMessage(f);
  const join = (p: string) => {
    if (peers.has(p)) return;
    peers.add(p);
    for (const h of joins) h(p);
  };
  ch.onmessage = (e: MessageEvent<Frame>) => {
    const f = e.data;
    if (!f || f.from === id || (f.to && f.to !== id)) return;
    if (f.t === 'hello') {
      post({ t: 'here', from: id, to: f.from });
      join(f.from);
    } else if (f.t === 'here') join(f.from);
    else if (f.t === 'bye') {
      if (peers.delete(f.from)) for (const h of leaves) h(f.from);
    } else if (f.t === 'msg') {
      join(f.from);
      for (const h of msg.get(f.kind) ?? []) h(structuredClone(f.data), f.from);
    }
  };
  // Announce after the caller has had a chance to attach handlers.
  setTimeout(() => post({ t: 'hello', from: id }), 0);
  const bye = () => post({ t: 'bye', from: id });
  globalThis.addEventListener?.('pagehide', bye);
  return {
    selfId: id,
    send: (kind, data, target) => post({ t: 'msg', from: id, to: target, kind, data }),
    onMessage: (kind, handler) => void msg.get(kind)!.add(handler),
    onPeerJoin: (handler) => void joins.add(handler),
    onPeerLeave: (handler) => void leaves.add(handler),
    onError: () => {},
    peers: () => [...peers],
    leave: () => {
      bye();
      globalThis.removeEventListener?.('pagehide', bye);
      ch.close();
      peers.clear();
    },
  };
}

/** The link a room should use: trystero normally, BroadcastChannel when the page opted in with `?link=local`. */
export function roomLinkFor(code: string, trystero: (code: string) => RoomLink): RoomLink {
  const search = typeof location === 'undefined' ? '' : location.search;
  return wantsLocalLink(search) ? createLocalLink(code) : trystero(code);
}
