import { describe, it, expect } from 'vitest';
import { createRoomStore } from './roomStore';
import { memoryStorage } from './storageLike';

describe('room store', () => {
  it('remembers the room and role, and ignores garbage', () => {
    const st = memoryStorage();
    const store = createRoomStore(st);
    expect(store.load()).toBeNull();
    store.save({ code: 'ABCDE', role: 'peer' });
    expect(store.load()).toEqual({ code: 'ABCDE', role: 'peer' });
    st.setItem('cafetycoon.room', JSON.stringify({ code: 'bad code', role: 'host' }));
    expect(store.load()).toBeNull();
    store.clear();
    expect(store.load()).toBeNull();
  });
});

describe('room store keys', () => {
  it('keeps host and peer records apart when given separate keys', () => {
    const st = memoryStorage();
    const host = createRoomStore(st, 'cafetycoon.room.host');
    const peer = createRoomStore(st, 'cafetycoon.room.peer');
    host.save({ code: 'AAAAA', role: 'host' });
    peer.save({ code: 'BBBBB', role: 'peer' });
    expect(host.load()).toEqual({ code: 'AAAAA', role: 'host' });
    expect(peer.load()).toEqual({ code: 'BBBBB', role: 'peer' });
    peer.clear();
    expect(host.load()).not.toBeNull();
  });
});
