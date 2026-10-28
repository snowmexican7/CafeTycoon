import { normalizeRoomCode } from '../net/roomCode';
import { readJson, type StorageLike } from './storageLike';

const KEY = 'cafetycoon.room';

/** The room this browser was last in, so a refresh can reopen (host) or rejoin (peer) it. */
export interface RoomRecord {
  code: string;
  role: 'host' | 'peer';
}

export function createRoomStore(storage: StorageLike): { save(r: RoomRecord): void; load(): RoomRecord | null; clear(): void } {
  return {
    save: (r) => storage.setItem(KEY, JSON.stringify(r)),
    load: () => {
      const r = readJson<Partial<RoomRecord>>(storage, KEY);
      if (!r || typeof r.code !== 'string' || (r.role !== 'host' && r.role !== 'peer')) return null;
      const code = normalizeRoomCode(r.code);
      return code ? { code, role: r.role } : null;
    },
    clear: () => storage.removeItem(KEY),
  };
}
