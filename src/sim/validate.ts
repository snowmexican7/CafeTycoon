import type { Pace, PlayerInput, Settings, SupplyId } from './types';

const SUPPLIES: SupplyId[] = ['beans', 'milk', 'concentrate'];
const MIN_PHASE_SEC = 30;
const MAX_PHASE_SEC = 600;
const MAX_PACKS = 100;
const MAX_NAME = 16;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const axis = (v: unknown) => (finite(v) ? clamp(v, -1, 1) : 0);

/** Clean settings: out-of-range numbers are clamped, anything that isn't a number is dropped. */
export function sanitizeSettings(raw: Partial<Settings>): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (finite(raw.pace)) out.pace = clamp(Math.round(raw.pace), 1, 5) as Pace;
  if (finite(raw.dayLengthSec)) out.dayLengthSec = clamp(Math.round(raw.dayLengthSec), MIN_PHASE_SEC, MAX_PHASE_SEC);
  if (finite(raw.nightLengthSec)) out.nightLengthSec = clamp(Math.round(raw.nightLengthSec), MIN_PHASE_SEC, MAX_PHASE_SEC);
  return out;
}

/**
 * The simulation trusts nothing it is handed. Returns a cleaned input, or null when the
 * input cannot be made sense of. Peers in co-op will go through this same door.
 */
export function validateInput(input: PlayerInput): PlayerInput | null {
  if (!input || typeof input !== 'object' || typeof input.playerId !== 'string') return null;
  switch (input.kind) {
    case 'move':
      return { kind: 'move', playerId: input.playerId, x: axis(input.x), y: axis(input.y), interact: input.interact === true };
    case 'buy':
      return typeof input.itemId === 'string' ? { kind: 'buy', playerId: input.playerId, itemId: input.itemId } : null;
    case 'restock':
      if (!SUPPLIES.includes(input.supply)) return null;
      if (!Number.isInteger(input.packs) || input.packs < 1 || input.packs > MAX_PACKS) return null;
      return { kind: 'restock', playerId: input.playerId, supply: input.supply, packs: input.packs };
    case 'ready':
    case 'leave':
      return { kind: input.kind, playerId: input.playerId };
    case 'weekEnd':
      return input.choice === 'stop' || input.choice === 'continue' ? { kind: 'weekEnd', playerId: input.playerId, choice: input.choice } : null;
    case 'settings':
      return input.settings && typeof input.settings === 'object'
        ? { kind: 'settings', playerId: input.playerId, settings: sanitizeSettings(input.settings) }
        : null;
    case 'join': {
      const name = typeof input.name === 'string' ? input.name.trim().slice(0, MAX_NAME) : '';
      return { kind: 'join', playerId: input.playerId, name: name || 'Barista' };
    }
    default:
      return null;
  }
}
