/**
 * The night board's handlers as sim inputs, in one place (main.ts wires them to `send`).
 * Every input carries the local player's id, read when the control is used.
 */
import type { PlayerInput } from '../sim/types';
import type { createNight } from './night';

export type NightHandlers = Parameters<typeof createNight>[1];

export function nightInputHandlers(send: (input: PlayerInput) => void, me: () => string): NightHandlers {
  return {
    onBuy: (itemId) => send({ kind: 'buy', playerId: me(), itemId }),
    onRestock: (supply) => send({ kind: 'restock', playerId: me(), supply, packs: 1 }),
    onReady: () => send({ kind: 'ready', playerId: me() }),
    onMenu: (drink, on) => send({ kind: 'menu', playerId: me(), drink, on }),
    onPrice: (drink, step) => send({ kind: 'price', playerId: me(), drink, step }),
    onTwist: (drink, twist) => send({ kind: 'twist', playerId: me(), drink, twist }),
    onSignature: (sig) => send({ kind: 'signature', playerId: me(), sig }),
    onScout: () => send({ kind: 'scout', playerId: me() }),
    onAd: (ad) => send({ kind: 'ad', playerId: me(), ad }),
    onCheckout: (checkout) => send({ kind: 'checkout', playerId: me(), checkout }),
    onGrow: (tier) => send({ kind: 'grow', playerId: me(), tier }),
    onPitch: (pitchKind, text) => send({ kind: 'pitch', playerId: me(), pitchKind, text }),
    onRole: (role) => send({ kind: 'role', playerId: me(), role }),
    onReroll: () => send({ kind: 'reroll', playerId: me() }),
    // FB1 WP5: swap a slot (free) or buy a station at its fixed price.
    onSlot: (index, station) => send({ kind: 'slot', playerId: me(), index, station }),
    onEquip: (station) => send({ kind: 'equip', playerId: me(), station }),
  };
}
