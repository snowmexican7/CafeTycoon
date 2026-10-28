import type { GameState, PlayerInput } from '../sim/types';

/** Room identity on the public introduction relays. Change it and old builds stop seeing new rooms. */
export const APP_ID = 'cafetycoon-v1';
/** Bump when any message below changes shape; mismatched builds refuse each other politely. */
export const PROTOCOL_VERSION = 2;
export const ACTIONS = ['hello', 'join', 'input', 'snap', 'lobby'] as const;
export type ActionKind = (typeof ACTIONS)[number];

export interface Member {
  token: string;
  name: string;
}
export interface HelloMsg {
  t: 'hello';
  protocol: number;
  hostToken: string;
  reject?: 'version';
}
export interface JoinMsg {
  t: 'join';
  protocol: number;
  token: string;
  name: string;
}
export interface InputMsg {
  t: 'input';
  input: PlayerInput;
}
export interface SnapMsg {
  t: 'snap';
  state: GameState;
  sentAt: number;
}
export interface LobbyMsg {
  t: 'lobby';
  members: Member[];
  started: boolean;
}

const MAX_TOKEN = 64;
const MAX_NAME = 16;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string';

function cleanName(v: unknown): string {
  const n = str(v) ? v.trim().slice(0, MAX_NAME) : '';
  return n || 'Barista';
}

export function parseHello(data: unknown): HelloMsg | null {
  if (!isObj(data) || data.t !== 'hello' || !finite(data.protocol) || !str(data.hostToken) || data.hostToken === '') return null;
  if (data.reject !== undefined && data.reject !== 'version') return null;
  const msg: HelloMsg = { t: 'hello', protocol: data.protocol, hostToken: data.hostToken };
  if (data.reject === 'version') msg.reject = 'version';
  return msg;
}

export function parseJoin(data: unknown): JoinMsg | null {
  if (!isObj(data) || data.t !== 'join' || !finite(data.protocol) || !str(data.token)) return null;
  if (data.token.length < 1 || data.token.length > MAX_TOKEN) return null;
  return { t: 'join', protocol: data.protocol, token: data.token, name: cleanName(data.name) };
}

export function parseInput(data: unknown): InputMsg | null {
  if (!isObj(data) || data.t !== 'input' || !isObj(data.input)) return null;
  if (!str(data.input.kind) || !str(data.input.playerId)) return null;
  return { t: 'input', input: data.input as unknown as PlayerInput };
}

export function parseSnap(data: unknown): SnapMsg | null {
  if (!isObj(data) || data.t !== 'snap' || !isObj(data.state) || !str(data.state.phase) || !finite(data.sentAt)) return null;
  return { t: 'snap', state: data.state as unknown as GameState, sentAt: data.sentAt };
}

export function parseLobby(data: unknown): LobbyMsg | null {
  if (!isObj(data) || data.t !== 'lobby' || !Array.isArray(data.members) || typeof data.started !== 'boolean') return null;
  const members: Member[] = [];
  for (const m of data.members) {
    if (!isObj(m) || !str(m.token) || !str(m.name)) return null;
    members.push({ token: m.token, name: m.name });
  }
  return { t: 'lobby', members, started: data.started };
}
