import type { ActionKind } from '../protocol';
import type { RoomLink } from '../roomLink';

/** An in-memory RoomLink for tests: records sends, and lets a test play the other peers. */
export interface FakeLink extends RoomLink {
  sent: { kind: ActionKind; data: unknown; target?: string }[];
  peerJoins(peerId: string): void;
  peerLeaves(peerId: string): void;
  receive(kind: ActionKind, data: unknown, from: string): void;
  fail(message: string): void;
  left: boolean;
}

export function createFakeLink(selfId = 'self'): FakeLink {
  const messageHandlers = new Map<ActionKind, Set<(data: unknown, peerId: string) => void>>();
  const joinHandlers = new Set<(peerId: string) => void>();
  const leaveHandlers = new Set<(peerId: string) => void>();
  const errorHandlers = new Set<(message: string) => void>();
  const present = new Set<string>();
  const link: FakeLink = {
    selfId,
    sent: [],
    left: false,
    send(kind, data, target) {
      link.sent.push(target === undefined ? { kind, data } : { kind, data, target });
    },
    onMessage(kind, handler) {
      if (!messageHandlers.has(kind)) messageHandlers.set(kind, new Set());
      messageHandlers.get(kind)!.add(handler);
    },
    onPeerJoin: (h) => void joinHandlers.add(h),
    onPeerLeave: (h) => void leaveHandlers.add(h),
    onError: (h) => void errorHandlers.add(h),
    peers: () => [...present],
    leave() {
      link.left = true;
    },
    peerJoins(peerId) {
      present.add(peerId);
      for (const h of joinHandlers) h(peerId);
    },
    peerLeaves(peerId) {
      present.delete(peerId);
      for (const h of leaveHandlers) h(peerId);
    },
    receive(kind, data, from) {
      for (const h of messageHandlers.get(kind) ?? []) h(data, from);
    },
    fail(message) {
      for (const h of errorHandlers) h(message);
    },
  };
  return link;
}
