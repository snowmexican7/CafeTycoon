import type { Vec2 } from '../sim/types';

/** Keyboard codes that move the barista. */
export const MOVE_KEYS: Record<string, Vec2> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/** Keyboard codes that use a station. */
export const INTERACT_KEYS: string[] = ['KeyE', 'Space'];

/** Keyboard code that knocks back a shot of espresso (by physical position, like WASD). */
export const ESPRESSO_KEYS: string[] = ['KeyQ'];

/** Sum the pressed movement keys into a direction with each component in [-1, 1]. */
export function keysToVector(pressed: Iterable<string>): Vec2 {
  let x = 0;
  let y = 0;
  for (const code of pressed) {
    const v = MOVE_KEYS[code];
    if (v) {
      x += v.x;
      y += v.y;
    }
  }
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
}
