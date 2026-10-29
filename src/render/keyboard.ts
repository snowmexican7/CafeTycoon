import type { Vec2 } from '../sim/types';
import { ESPRESSO_KEYS, INTERACT_KEYS, MOVE_KEYS, keysToVector } from './keys';

function typingInField(): boolean {
  const el = typeof document === 'undefined' ? null : document.activeElement;
  return !!el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** Track held movement keys and one-shot interact presses on an event target (normally `window`). */
export function createKeyboard(target: EventTarget): {
  read(): Vec2;
  takeInteract(): boolean;
  takeEspresso(): boolean;
  dispose(): void;
} {
  const pressed = new Set<string>();
  let interactPending = false;
  let espressoPending = false;

  const onDown = (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (typingInField()) return;
    if (e.code in MOVE_KEYS || INTERACT_KEYS.includes(e.code)) e.preventDefault();
    if (e.code in MOVE_KEYS) pressed.add(e.code);
    if (INTERACT_KEYS.includes(e.code) && !e.repeat) interactPending = true;
    if (ESPRESSO_KEYS.includes(e.code) && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) espressoPending = true;
  };
  const onUp = (ev: Event) => {
    pressed.delete((ev as KeyboardEvent).code);
  };
  const onBlur = () => pressed.clear();

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);

  return {
    read: () => keysToVector(pressed),
    takeInteract() {
      const v = interactPending;
      interactPending = false;
      return v;
    },
    takeEspresso() {
      const v = espressoPending;
      espressoPending = false;
      return v;
    },
    dispose() {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
