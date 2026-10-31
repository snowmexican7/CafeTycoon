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
    onStaff: (action) => send({ kind: 'staff', playerId: me(), action }),
    onBranch: (action, opts) => send({ kind: 'branch', playerId: me(), action, ...opts }),
    onAd: (ad) => send({ kind: 'ad', playerId: me(), ad }),
    onCheckout: (checkout) => send({ kind: 'checkout', playerId: me(), checkout }),
    onGrow: (tier) => send({ kind: 'grow', playerId: me(), tier }),
    onPitch: (pitchKind, text) => send({ kind: 'pitch', playerId: me(), pitchKind, text }),
    onRole: (role) => send({ kind: 'role', playerId: me(), role }),
    onReroll: () => send({ kind: 'reroll', playerId: me() }),
    // FB1 WP5: swap a slot (free) or buy a station at its fixed price.
    onSlot: (index, station) => send({ kind: 'slot', playerId: me(), index, station }),
    onEquip: (station) => send({ kind: 'equip', playerId: me(), station }),
    // Gear Tree G3: buy/upgrade a tier, or sell what stands in a slot.
    onGear: (action, gear) => send({ kind: 'gear', playerId: me(), action, gear }),
    onGearSell: (index) => send({ kind: 'gear', playerId: me(), action: 'sell', index }),
    onGearVote: (yes) => send({ kind: 'gear', playerId: me(), action: 'vote', yes }),
    // ui-3.4.1 (FB2 A4): buy the fridge card (the Udder-Matic starts a crew vote in co-op)
    onFridge: (fridge) => send({ kind: 'fridge', playerId: me(), fridge }),
    // ui-3.5.1: the Restock tab's condiment box card buys one $6 box (it waits in the corner).
    onCondimentBox: () => send({ kind: 'condimentBox', playerId: me(), boxes: 1 }),
    // FB1 WP6: a crew tip chip sends its advice's input as the local player.
    onTip: (input) => send({ ...input, playerId: me() } as PlayerInput),
  };
}
