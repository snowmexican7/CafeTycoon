import type { Player, PlayerLook } from './types';

const ID_RE = /^[A-Za-z0-9_#-]{1,32}$/;
const id = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);

/**
 * R4 e: clean a look from anywhere (join, lobby, input, run options). The UI owns what the ids mean, so the only
 * checks are shape and size: four required ids and an optional hairColor, each 1-32 chars of A-Z a-z 0-9 _ # - (a
 * colour may be `#rrggbb`). Unknown keys are dropped; a bad hairColor is dropped; any other bad field refuses the
 * whole look (undefined), so a half-valid look never reaches the state.
 */
export function cleanLook(raw: unknown): PlayerLook | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (!id(r.hair) || !id(r.skin) || !id(r.outfit) || !id(r.shirtColor)) return undefined;
  const look: PlayerLook = { hair: r.hair, skin: r.skin, outfit: r.outfit, shirtColor: r.shirtColor };
  if (id(r.hairColor)) look.hairColor = r.hairColor;
  return look;
}

/** Set (or, given undefined, leave alone) a player's look. Whole-look replace, so a dropped hairColor goes away. */
export function setLook(p: Player, look: PlayerLook | undefined): void {
  if (look) p.look = { ...look };
}
