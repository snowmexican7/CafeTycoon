import { describe, it, expect } from 'vitest';
import { makeRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET } from './roomCode';

describe('room codes', () => {
  it('makes five-letter codes from the safe alphabet', () => {
    let i = 0;
    const seq = [0, 0.99, 0.5, 0.25, 0.75];
    const code = makeRoomCode(() => seq[i++ % seq.length]);
    expect(code).toHaveLength(5);
    expect([...code].every((c) => ROOM_CODE_ALPHABET.includes(c))).toBe(true);
    expect(code[0]).toBe('A');
    expect(code[1]).toBe('Z');
  });

  it('normalizes typed codes and rejects bad ones', () => {
    expect(normalizeRoomCode(' abcde ')).toBe('ABCDE');
    expect(normalizeRoomCode('ABCD')).toBeNull();
    expect(normalizeRoomCode('ABCDI')).toBeNull(); // I is not in the alphabet
    expect(normalizeRoomCode('AB CD')).toBeNull();
  });
});
