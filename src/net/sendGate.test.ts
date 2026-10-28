import { describe, it, expect } from 'vitest';
import { createSendGate } from './sendGate';

describe('sendGate', () => {
  it('allows at most one send per interval', () => {
    let t = 0;
    const gate = createSendGate(50, () => t);
    expect(gate.allow()).toBe(true);
    expect(gate.allow()).toBe(false);
    t = 49;
    expect(gate.allow()).toBe(false);
    t = 50;
    expect(gate.allow()).toBe(true);
  });
});
