import type { GameState, Player, PlayerId, PlayerInput, StationKind } from './types';

/**
 * Phase 3 Block 1: barista roles. Each barista may take one role (at most one of each per crew),
 * picked at night. A role is a perk and a weakness, so who plays what is a real choice:
 * the Chef makes drinks fast but is bad company at hand-off; the Host is great company but slow at
 * the machines; the Creator's drinks earn a craft bonus but they wander slowly; the Manager gets
 * the crew cheaper supplies but is slow at everything hands-on.
 */
export const ROLE_IDS = ['chef', 'creator', 'host', 'manager'] as const;
export type RoleId = (typeof ROLE_IDS)[number];

export interface RoleInfo {
  name: string;
  icon: string;
  perk: string;
  weakness: string;
  /** Multiplier on how long a machine this barista starts takes (lower = faster). */
  machineTime: number;
  /** Multiplier on this barista's walking speed. */
  walk: number;
  /** Multiplier on the tip of drinks this barista hands over. */
  tip: number;
  /** Flat bonus (dollars) on each drink this barista hands over. */
  craft: number;
  /** Multiplier on restock prices for the whole crew while someone holds this role. */
  supplyCost: number;
}

export const ROLES: Record<RoleId, RoleInfo> = {
  chef: {
    name: 'Chef', icon: '🍳', perk: 'Machines run 25% faster for them', weakness: 'No small talk: half tips on drinks they hand over',
    machineTime: 0.75, walk: 1, tip: 0.5, craft: 0, supplyCost: 1,
  },
  creator: {
    name: 'Creator', icon: '🎨', perk: '+$0.75 craft bonus on every drink they hand over', weakness: 'Head in the clouds: walks 15% slower',
    machineTime: 1, walk: 0.85, tip: 1, craft: 0.75, supplyCost: 1,
  },
  host: {
    name: 'Host', icon: '🤝', perk: 'Charm: +50% tips on drinks they hand over', weakness: 'All talk: machines take 25% longer for them',
    machineTime: 1.25, walk: 1, tip: 1.5, craft: 0, supplyCost: 1,
  },
  manager: {
    name: 'Manager', icon: '📋', perk: 'Supplier deals: restocks cost 20% less, and half as much fresh stock goes off', weakness: 'Clipboard in hand: walks 10% and works 10% slower',
    machineTime: 1.1, walk: 0.9, tip: 1, craft: 0, supplyCost: 0.8,
  },
};

export const isRole = (v: unknown): v is RoleId => typeof v === 'string' && (ROLE_IDS as readonly string[]).includes(v);

const roleOf = (state: GameState, id: PlayerId | undefined): RoleInfo | null => {
  if (id === undefined) return null;
  const r = state.players.find((p) => p.id === id)?.role;
  return r ? ROLES[r] : null;
};

/** Machine-time multiplier for a barista starting a station. Stations without a recipe are unaffected. */
export const roleMachineTime = (state: GameState, id: PlayerId, _kind?: StationKind): number => roleOf(state, id)?.machineTime ?? 1;
export const roleWalk = (p: Player): number => (p.role ? ROLES[p.role].walk : 1);
export const roleTip = (state: GameState, by: PlayerId | undefined): number => roleOf(state, by)?.tip ?? 1;
export const roleCraft = (state: GameState, by: PlayerId | undefined): number => roleOf(state, by)?.craft ?? 0;
/** Crew-wide restock multiplier: the lowest any role-holder grants. */
export const roleSupplyCost = (state: GameState): number => Math.min(1, ...state.players.map((p) => (p.role ? ROLES[p.role].supplyCost : 1)));

/** Who holds each role (by player id), for the night picker. */
export function roleHolders(state: GameState): Partial<Record<RoleId, PlayerId>> {
  const out: Partial<Record<RoleId, PlayerId>> = {};
  for (const p of state.players) if (p.role) out[p.role] = p.id;
  return out;
}

/** Take a role (null drops yours). Night only; a role someone else holds is ignored. */
export function applyRoleInput(state: GameState, input: Extract<PlayerInput, { kind: 'role' }>): GameState {
  if (state.phase !== 'night') return state;
  const me = state.players.find((p) => p.id === input.playerId);
  if (!me) return state;
  if (input.role === null) {
    delete me.role;
    return state;
  }
  if (state.players.some((p) => p !== me && p.role === input.role)) return state;
  me.role = input.role;
  return state;
}
