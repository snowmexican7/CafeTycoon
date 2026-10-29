import type { Vec2 } from '../sim/types';
import { ESPRESSO_KEYS, INTERACT_KEYS, MOVE_KEYS, keysToVector } from './keys';

function typingInField(): boolean {
  const el = typeof document === 'undefined' ? null : document.activeElement;
  return !!el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** Map key codes to secret-menu characters (letters + Konami arrows/BA). */
function secretChar(code: string): string | null {
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code === 'ArrowUp') return 'U';
  if (code === 'ArrowDown') return 'D';
  if (code === 'ArrowLeft') return 'L';
  if (code === 'ArrowRight') return 'R';
  if (code === 'KeyB') return 'B';
  if (code === 'KeyA') return 'A';
  return null;
}

const SECRET_TARGETS = ['FOAM', 'UUDDLRLRBA'] as const;
const MAX_BUF = 16;

/** Track held movement keys and one-shot interact presses on an event target (normally `window`). */
export function createKeyboard(target: EventTarget): {
  read(): Vec2;
  takeInteract(): boolean;
  takeEspresso(): boolean;
  /** Drain a completed secret-menu code, or null. */
  takeSecret(): string | null;
  dispose(): void;
} {
  const pressed = new Set<string>();
  let interactPending = false;
  let espressoPending = false;
  let secretBuf = '';
  let secretPending: string | null = null;

  const onDown = (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (typingInField()) return;
    if (e.code in MOVE_KEYS || INTERACT_KEYS.includes(e.code)) e.preventDefault();
    if (e.code in MOVE_KEYS) pressed.add(e.code);
    if (INTERACT_KEYS.includes(e.code) && !e.repeat) interactPending = true;
    if (ESPRESSO_KEYS.includes(e.code) && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) espressoPending = true;
    // B8: accumulate letter/arrow keys for the secret menu (ignore repeats/modifiers).
    if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ch = secretChar(e.code);
      if (ch) {
        secretBuf = (secretBuf + ch).slice(-MAX_BUF);
        for (const t of SECRET_TARGETS) {
          if (secretBuf.endsWith(t)) {
            secretPending = t;
            secretBuf = '';
            break;
          }
        }
      }
    }
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
    takeSecret() {
      const v = secretPending;
      secretPending = null;
      return v;
    },
    dispose() {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
