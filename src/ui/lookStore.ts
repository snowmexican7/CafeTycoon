/** ui-3.5.2 (R4 e): the barista look saved on this device (`localStorage` key `cafetycoon.look`). */
import { cleanLook } from '../sim/look';
import type { PlayerLook } from '../sim/types';

export const LOOK_KEY = 'cafetycoon.look';

type Store = Pick<Storage, 'getItem' | 'setItem'> | null | undefined;

/** The saved look, or null when none is saved or it no longer passes the sim's check. */
export function loadLook(store: Store): PlayerLook | null {
  try {
    const raw = store?.getItem(LOOK_KEY);
    return raw ? (cleanLook(JSON.parse(raw)) ?? null) : null;
  } catch {
    return null;
  }
}

/** Save a look (only one that passes `cleanLook`). Storage errors never block a game. */
export function saveLook(store: Store, look: PlayerLook): PlayerLook | null {
  const clean = cleanLook(look);
  if (!clean) return null;
  try {
    store?.setItem(LOOK_KEY, JSON.stringify(clean));
  } catch {
    /* storage blocked: the look still goes with this game */
  }
  return clean;
}
