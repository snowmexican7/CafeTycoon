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
