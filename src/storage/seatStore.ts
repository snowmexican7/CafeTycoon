import { normalizeRoomCode } from '../net/roomCode';
import type { StorageLike } from './storageLike';

const PREFIX = 'cafetycoon.seat.';
const MAX_TOKEN = 64;

/**
 * The barista this browser played in each room (per browser, so a closed tab can come back to its
 * seat). Offered to the host as `prev` on join; the host only hands it back if nobody holds it.
 */
export function createSeatStore(storage: StorageLike): {
  load(code: string): string | null;
  save(code: string, token: string): void;
  clear(code: string): void;
} {
  const key = (code: string) => {
    const c = normalizeRoomCode(code);
    return c ? PREFIX + c : null;
  };
  return {
    load(code) {
      const k = key(code);
      if (!k) return null;
      try {
        const v = storage.getItem(k);
        return v && v.length <= MAX_TOKEN ? v : null;
      } catch {
        return null;
      }
    },
    save(code, token) {
      const k = key(code);
      if (!k || !token || token.length > MAX_TOKEN) return;
      try {
        storage.setItem(k, token);
      } catch {
        /* storage full or blocked: the name match still finds the seat */
      }
    },
    clear(code) {
      const k = key(code);
      if (k) storage.removeItem(k);
    },
  };
}
