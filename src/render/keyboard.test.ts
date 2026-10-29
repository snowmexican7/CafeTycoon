import { describe, expect, it } from 'vitest';
import { createKeyboard } from './keyboard';

const key = (type: string, code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Event(type, { cancelable: true }), { code, repeat: false, ...extra });

describe('createKeyboard', () => {
  it('Q (by key position) is a one-shot espresso press; held repeats are ignored', () => {
    const t = new EventTarget();
    const kb = createKeyboard(t);
    expect(kb.takeEspresso()).toBe(false);
    t.dispatchEvent(key('keydown', 'KeyQ'));
    expect(kb.takeEspresso()).toBe(true);
    expect(kb.takeEspresso()).toBe(false);
    t.dispatchEvent(key('keydown', 'KeyQ', { repeat: true }));
    expect(kb.takeEspresso()).toBe(false);
    t.dispatchEvent(key('keydown', 'KeyQ', { ctrlKey: true }));
    expect(kb.takeEspresso()).toBe(false);
    expect(kb.takeInteract()).toBe(false);
    kb.dispose();
  });
});
