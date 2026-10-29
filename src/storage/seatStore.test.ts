import { describe, it, expect } from 'vitest';
import { createSeatStore } from './seatStore';
import { memoryStorage } from './storageLike';

describe('seat store', () => {
  it('remembers the seat per room code, normalized', () => {
    const storage = memoryStorage();
    const seats = createSeatStore(storage);
    expect(seats.load('KQZTM')).toBeNull();
    seats.save('kqztm', 'tok-1');
    expect(seats.load('KQZTM')).toBe('tok-1');
    expect(seats.load('ABCDE')).toBeNull();
    // a fresh store on the same storage (a reopened tab) sees it
    expect(createSeatStore(storage).load('KQZTM')).toBe('tok-1');
    seats.clear('KQZTM');
    expect(seats.load('KQZTM')).toBeNull();
  });
  it('ignores bad codes and oversized tokens', () => {
    const seats = createSeatStore(memoryStorage());
    seats.save('??', 'x');
    expect(seats.load('??')).toBeNull();
    seats.save('KQZTM', 'x'.repeat(65));
    expect(seats.load('KQZTM')).toBeNull();
  });
});
