import { joinRoom, selfId, type DataPayload, type JoinError, type MessageAction } from 'trystero';
import { ACTIONS, APP_ID, type ActionKind } from './protocol';

/** The slice of a peer-to-peer room the game needs. The only thing that knows about trystero is createTrysteroLink. */
export interface RoomLink {
  readonly selfId: string;
  /** Send to one peer, or to everyone when target is omitted. */
  send(kind: ActionKind, data: unknown, target?: string): void;
  onMessage(kind: ActionKind, handler: (data: unknown, peerId: string) => void): void;
  onPeerJoin(handler: (peerId: string) => void): void;
  onPeerLeave(handler: (peerId: string) => void): void;
  onError(handler: (message: string) => void): void;
  peers(): string[];
  leave(): void;
}

/** Join the room named by a code. The code is both the room id and the handshake password. */
export function createTrysteroLink(code: string): RoomLink {
  const errorHandlers = new Set<(message: string) => void>();
  const room = joinRoom({ appId: APP_ID, password: code }, code, {
    onJoinError: (details: JoinError) => {
      for (const h of errorHandlers) h(details.error || 'Could not join the room.');
    },
  });

  const messageHandlers = new Map<ActionKind, Set<(data: unknown, peerId: string) => void>>();
  const actions = new Map<ActionKind, MessageAction<DataPayload>>();
  for (const kind of ACTIONS) {
    const handlers = new Set<(data: unknown, peerId: string) => void>();
    messageHandlers.set(kind, handlers);
    const action = room.makeAction<DataPayload>(kind);
    action.onMessage = (data, context) => {
      for (const h of handlers) h(data, context.peerId);
    };
    actions.set(kind, action);
  }

  const joinHandlers = new Set<(peerId: string) => void>();
  const leaveHandlers = new Set<(peerId: string) => void>();
  room.onPeerJoin = (peerId) => {
    for (const h of joinHandlers) h(peerId);
  };
  room.onPeerLeave = (peerId) => {
    for (const h of leaveHandlers) h(peerId);
  };

  return {
    selfId,
    send(kind, data, target) {
      // Our messages are plain JSON objects, which is what trystero accepts.
      void actions.get(kind)!.send(data as DataPayload, target ? { target } : undefined);
    },
    onMessage: (kind, handler) => void messageHandlers.get(kind)!.add(handler),
    onPeerJoin: (handler) => void joinHandlers.add(handler),
    onPeerLeave: (handler) => void leaveHandlers.add(handler),
    onError: (handler) => void errorHandlers.add(handler),
    peers: () => Object.keys(room.getPeers()),
    leave: () => void room.leave(),
  };
}
