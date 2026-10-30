import { BRANCH_AREAS, BRANCH_SUPPLIES } from './branch';
import type { AreaId } from '../data/areas';
import { cleanDraft } from './signature';
import { isGearId } from '../data/gear';
import { cleanPitch, isPitchKind } from './pitch';
import { isAdId } from './ads';
import { isCheckoutId } from './checkout';
import { isTierId } from './growth';
import { isEquipmentKind } from './slots';
import { TWISTS } from './taste';
import { isRole } from './roles';
import { LAYOUT } from '../data/layout';
import { DRINK_IDS } from '../data/drinks';
import { isReservedId } from './constants';
import { STEEP } from './steep';
import { CONDIMENTS } from './condiments';
import type { BotSkill, Pace, PlayerInput, Settings, SupplyId } from './types';

const SUPPLIES: SupplyId[] = ['beans', 'milk', 'concentrate', 'flavour'];
const MIN_PHASE_SEC = 30;
const MAX_PHASE_SEC = 600;
const MAX_PACKS = 100;
const MAX_NAME = 16;
const MAX_BOTS = LAYOUT.spawnPoints.length - 1; // four baristas in all, at least one of them a person

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const axis = (v: unknown) => (finite(v) ? clamp(v, -1, 1) : 0);

/** Clean settings: out-of-range numbers are clamped, anything that isn't a number is dropped. */
export function sanitizeSettings(raw: Partial<Settings>): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (finite(raw.pace)) out.pace = clamp(Math.round(raw.pace), 1, 5) as Pace;
  if (finite(raw.dayLengthSec)) out.dayLengthSec = clamp(Math.round(raw.dayLengthSec), MIN_PHASE_SEC, MAX_PHASE_SEC);
  // 0 means a relaxed (untimed) night; anything else clamps like the day length.
  if (finite(raw.nightLengthSec)) {
    out.nightLengthSec = raw.nightLengthSec === 0 ? 0 : clamp(Math.round(raw.nightLengthSec), MIN_PHASE_SEC, MAX_PHASE_SEC);
  }
  if (raw.bots === 'auto') out.bots = 'auto';
  else if (finite(raw.bots)) out.bots = clamp(Math.round(raw.bots), 0, MAX_BOTS);
  if (finite(raw.botSkill)) out.botSkill = clamp(Math.round(raw.botSkill), 1, 5) as BotSkill;
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
    case 'stampCard':
      return { kind: 'stampCard', playerId: input.playerId };
    case 'rivalCounter':
      if (input.on !== undefined && typeof input.on !== 'boolean') return null;
      return input.on === false ? { kind: 'rivalCounter', playerId: input.playerId, on: false } : { kind: 'rivalCounter', playerId: input.playerId };
    case 'ready':
    case 'scout':
    case 'reroll':
    case 'leave':
    case 'espresso':
      return { kind: input.kind, playerId: input.playerId };
    case 'price':
      return DRINK_IDS.includes(input.drink) && Number.isInteger(input.step) && Math.abs(input.step) <= 20
        ? { kind: 'price', playerId: input.playerId, drink: input.drink, step: input.step }
        : null;
    case 'twist':
      return DRINK_IDS.includes(input.drink) && (input.twist === null || TWISTS.includes(input.twist))
        ? { kind: 'twist', playerId: input.playerId, drink: input.drink, twist: input.twist }
        : null;
    case 'checkout':
      return isCheckoutId(input.checkout) ? { kind: 'checkout', playerId: input.playerId, checkout: input.checkout } : null;
    case 'grow':
      return isTierId(input.tier) ? { kind: 'grow', playerId: input.playerId, tier: input.tier } : null;
    case 'slot':
      return Number.isInteger(input.index) && (input.station === null || isEquipmentKind(input.station))
        ? { kind: 'slot', playerId: input.playerId, index: input.index, station: input.station }
        : null;
    case 'gear':
      if (input.action === 'buy') return isGearId(input.gear) ? { kind: 'gear', playerId: input.playerId, action: 'buy', gear: input.gear } : null;
      if (input.action === 'sell') return Number.isInteger(input.index) ? { kind: 'gear', playerId: input.playerId, action: 'sell', index: input.index } : null;
      if (input.action === 'vote') return typeof input.yes === 'boolean' ? { kind: 'gear', playerId: input.playerId, action: 'vote', yes: input.yes } : null;
      return null;
    case 'branch': {
      if (input.action !== 'open' && input.action !== 'staff' && input.action !== 'send' && input.action !== 'close') return null;
      const out: Extract<PlayerInput, { kind: 'branch' }> = { kind: 'branch', playerId: input.playerId, action: input.action };
      if (input.action === 'open') {
        if (!BRANCH_AREAS.includes(input.area as AreaId)) return null;
        out.area = input.area;
      }
      if (input.action === 'staff') {
        if (!Number.isInteger(input.staff) || input.staff! < 1 || input.staff! > 3) return null;
        out.staff = input.staff;
      }
      if (input.action === 'send') {
        if (!BRANCH_SUPPLIES.includes(input.supply as SupplyId)) return null;
        out.supply = input.supply;
      }
      return out;
    }
    case 'staff':
      return input.action === 'hire' || input.action === 'fire' ? { kind: 'staff', playerId: input.playerId, action: input.action } : null;
    case 'steep':
      return Number.isInteger(input.cups) && input.cups >= 0 && input.cups <= STEEP.maxInput
        ? { kind: 'steep', playerId: input.playerId, cups: input.cups }
        : null;
    case 'condimentBox':
      return Number.isInteger(input.boxes) && input.boxes >= 1 && input.boxes <= CONDIMENTS.maxBoxes
        ? { kind: 'condimentBox', playerId: input.playerId, boxes: input.boxes }
        : null;
    case 'equip':
      return isEquipmentKind(input.station) ? { kind: 'equip', playerId: input.playerId, station: input.station } : null;
    case 'ad':
      return input.ad === null || isAdId(input.ad) ? { kind: 'ad', playerId: input.playerId, ad: input.ad } : null;
    case 'pitch':
      return isPitchKind(input.pitchKind) && typeof input.text === 'string' && input.text.length <= 400 && cleanPitch(input.text)
        ? { kind: 'pitch', playerId: input.playerId, pitchKind: input.pitchKind, text: cleanPitch(input.text) }
        : null;
    case 'signature': {
      if (input.sig === null) return { kind: 'signature', playerId: input.playerId, sig: null };
      const sig = cleanDraft(input.sig);
      return sig ? { kind: 'signature', playerId: input.playerId, sig } : null;
    }
    case 'menu':
      return DRINK_IDS.includes(input.drink) && typeof input.on === 'boolean'
        ? { kind: 'menu', playerId: input.playerId, drink: input.drink, on: input.on }
        : null;
    case 'role':
      return input.role === null || isRole(input.role) ? { kind: 'role', playerId: input.playerId, role: input.role } : null;
    case 'weekEnd':
      return input.choice === 'stop' || input.choice === 'continue' ? { kind: 'weekEnd', playerId: input.playerId, choice: input.choice } : null;
    case 'settings':
      return input.settings && typeof input.settings === 'object'
        ? { kind: 'settings', playerId: input.playerId, settings: sanitizeSettings(input.settings) }
        : null;
    case 'join': {
      if (isReservedId(input.playerId)) return null;
      const name = typeof input.name === 'string' ? input.name.trim().slice(0, MAX_NAME) : '';
      return { kind: 'join', playerId: input.playerId, name: name || 'Barista' };
    }
    case 'call':
      return typeof input.take === 'boolean' ? { kind: 'call', playerId: input.playerId, take: input.take } : null;
    case 'closeEarly':
      return typeof input.on === 'boolean' ? { kind: 'closeEarly', playerId: input.playerId, on: input.on } : null;
    case 'drop':
      return { kind: 'drop', playerId: input.playerId };
    case 'secret': {
      const code = typeof input.code === 'string' ? input.code.trim().slice(0, 16) : '';
      return code ? { kind: 'secret', playerId: input.playerId, code } : null;
    }
    default:
      return null;
  }
}
