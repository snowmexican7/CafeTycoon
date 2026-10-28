import { describe, it, expect } from 'vitest';
import { keysToVector } from './keys';

describe('keysToVector', () => {
  it('maps keys to a clamped vector', () => {
    expect(keysToVector(['KeyW', 'KeyD'])).toEqual({ x: 1, y: -1 });
    expect(keysToVector(['ArrowLeft', 'KeyA'])).toEqual({ x: -1, y: 0 });
    expect(keysToVector([])).toEqual({ x: 0, y: 0 });
  });
});
