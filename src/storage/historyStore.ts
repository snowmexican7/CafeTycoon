import type { RunRecord } from '../sim/types';
import { readJson, type StorageLike } from './storageLike';

const KEY = 'cafetycoon.history';
const MAX = 50;

/** Past runs, newest first. */
export function createHistoryStore(storage: StorageLike): { append(record: RunRecord): void; list(): RunRecord[] } {
  const list = () => readJson<RunRecord[]>(storage, KEY) ?? [];
  return {
    list,
    append(record) {
      storage.setItem(KEY, JSON.stringify([record, ...list()].slice(0, MAX)));
    },
  };
}
