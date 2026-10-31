import type { Patch } from './delta';
import { RESERVED_TELE_KINDS, type TeleEvent } from '../host/telemetry';
import { isReservedId } from '../sim/constants';
import { cleanLook } from '../sim/look';
import type { BotsChoice, GameState, PlayerInput, PlayerLook } from '../sim/types';

/** Room identity on the public introduction relays. Change it and old builds stop seeing new rooms. */
export const APP_ID = 'cafetycoon-v1';
/** Bump when any message below changes shape; mismatched builds refuse each other politely. */
export const PROTOCOL_VERSION = 59; // 59: FB2 C10 rearranging: moveStation/openDoors inputs, preOpenUntil, slotPos, preopen.*/station.* events; snapshot 30. 58: FB2 B8 hand-made: syrup input, Player.jug/steam/made, Customer.shots/syrup, PassItem.made, milk.fill/steam.result/syrup.* events. 57: FB2 B7 tray table: GameState.tray, Player.tool tray, PassItem.tray, tray.* events. 56: Round 3 hires: staff role input, GameState.staff, DayStats.hireWages, staff.hire/fire, strategist.set. 55: FB2 C11 feed: GameState.fans, DayStats feed fields, review.post/week.rating. 54: Round 3 lattes: order.addon event, milk-share order draw. 53: Round 3 line: GameState.waiting/line, line.complain/line.leave, DayStats.lineLeft. 52: Round 3 money: walkout reason price, DayStats.priceWalkouts. 51: Round 3 ring-up: GameState.ringUp, till.start/till.cancel. 50: Round 3 grow.affordable/grow.done events, GameState.growNudged. 49: FB2 C9 wand input and gear-buy wand, Station.wand/wandOf, slotWand, GearVote.wand, wand events; snapshot 29. 48: Round 4 e look input, Player.look, JoinMsg/Member/PeerSessionOptions look. 47: Round 4 a devPause input, GameState.dev/devPaused. 46: Round 4 c customer.bump event, Customer.bumpedAt, DayStats.customerBumps. 45: FB2 B6 multi-drink orders: Customer.items/order, GameState.office, DayStats.office/officeExtra, order.* and office.call events. 44: FB2 A4 fridge: fridge input + fridgeVote, milkOut/closingSoonAt/barAway, Player.tool 'milk'|'bar', CounterSpot 'fridge'. 43: FB2 A3 back sink: Station.potOut/stale, Player.tool 'pot', sink/pot/mess events. 42: FB2 A2 cups go cold: PassItem.madeAt, Player.heldSince, cup.cold/pickup.cold/pickup.takeBack/review.bad events. 41: batch coffee / pickup / condiments: steep + condimentBox inputs, Customer.stage, pickup counter, condiment bar, Player.tool 'box'. 40: P4 F2 stampCard input + Rival.stamps (rival loyalty card). 39: P4 B6 call input + GameState.callAnswer + DayStats.branch.call (phone calls). 38: P4 B5 branch 'send' (stock to the second shop) + Branch.stockCredit + DayStats.branch.fromStock. 37: P4 B4 branch input + GameState.branch + DayStats.branch (second shop). 36: P4 B3 DayStats.waitTicks/takingsByDrink/byPlayer (manager report). 35: P4 B2 GameState.season (week-end checkpoints after week 1 of a Gear run). 34: P4 B1 rivalCounter input + Rival.counter. 33: P3 B15 staff input + DayStats.wages. 32: G11 v3.0.0 flip (every new run is Gear; v2 tabs must reload). 31: Gear G8 vote input + gearVote state
export const ACTIONS = ['hello', 'join', 'input', 'snap', 'lobby', 'tele', 'seat', 'snapd', 'resync'] as const;
export type ActionKind = (typeof ACTIONS)[number];

export interface Member {
  token: string;
  name: string;
  /** R4 e: the character look (UI-defined ids; absent = default). */
  look?: PlayerLook;
}
export interface HelloMsg {
  t: 'hello';
  protocol: number;
  hostToken: string;
  /** 'full': four baristas are already in and there is no away seat to take. */
  reject?: 'version' | 'full';
}
export interface JoinMsg {
  t: 'join';
  protocol: number;
  token: string;
  name: string;
  /** R4 e: the character look this player made (cleaned; a bad one is dropped, the join still stands). */
  look?: PlayerLook;
  /** The seat this browser held in this room before (a closed tab coming back). */
  prev?: string;
}
/** Host to one peer: you are this barista now (an away seat was given back to you). */
export interface SeatMsg {
  t: 'seat';
  token: string;
}
export type { BotsChoice };
export interface InputMsg {
  t: 'input';
  input: PlayerInput;
}
export interface SnapMsg {
  t: 'snap';
  state: GameState;
  sentAt: number;
  /** Protocol 12: the keyframe's sequence number; deltas that follow name it as their base. */
  seq: number;
}
/** Protocol 12: only what changed since snapshot `seq - 1` (null when nothing did). */
export interface SnapDeltaMsg {
  t: 'snapd';
  seq: number;
  patch: Patch | null;
  sentAt: number;
}
/** Protocol 12: a peer that missed its base asks the host for a fresh keyframe. */
export interface ResyncMsg {
  t: 'resync';
}
export interface LobbyMsg {
  t: 'lobby';
  members: Member[];
  started: boolean;
  /** The bots run setting the host will start with (absent from older hosts). */
  bots?: BotsChoice;
  /** True when the host picked it; false while it follows the default. */
  botsPicked?: boolean;
}
export interface TeleMsg {
  t: 'tele';
  token: string;
  events: TeleEvent[];
}

const MAX_TOKEN = 64;
/** Review I4: a token becomes a player id and a key in tallies, so it is a plain id word (the app makes UUIDs). */
const TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/;
const okToken = (v: unknown): v is string => str(v) && TOKEN_RE.test(v) && !isReservedId(v);
const MAX_TELE_EVENTS = 200;
const MAX_TELE_KIND = 40;
const MAX_TELE_DATA = 1000;
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
  if (data.reject !== undefined && data.reject !== 'version' && data.reject !== 'full') return null;
  const msg: HelloMsg = { t: 'hello', protocol: data.protocol, hostToken: data.hostToken };
  if (data.reject === 'version' || data.reject === 'full') msg.reject = data.reject;
  return msg;
}

export function parseJoin(data: unknown): JoinMsg | null {
  if (!isObj(data) || data.t !== 'join' || !finite(data.protocol) || !okToken(data.token)) return null;
  const msg: JoinMsg = { t: 'join', protocol: data.protocol, token: data.token, name: cleanName(data.name) };
  const look = cleanLook(data.look);
  if (look) msg.look = look;
  if (okToken(data.prev) && data.prev !== data.token) msg.prev = data.prev;
  return msg;
}

export function parseSeat(data: unknown): SeatMsg | null {
  if (!isObj(data) || data.t !== 'seat' || !okToken(data.token)) return null;
  return { t: 'seat', token: data.token };
}

const MAX_BOTS = 3;
export function parseBots(v: unknown): BotsChoice | undefined {
  if (v === 'auto') return 'auto';
  if (finite(v) && Number.isInteger(v) && v >= 0 && v <= MAX_BOTS) return v;
  return undefined;
}

export function parseInput(data: unknown): InputMsg | null {
  if (!isObj(data) || data.t !== 'input' || !isObj(data.input)) return null;
  if (!str(data.input.kind) || !str(data.input.playerId)) return null;
  return { t: 'input', input: data.input as unknown as PlayerInput };
}

export function parseSnap(data: unknown): SnapMsg | null {
  if (!isObj(data) || data.t !== 'snap' || !isObj(data.state) || !str(data.state.phase) || !finite(data.sentAt)) return null;
  if (!finite(data.seq)) return null;
  return { t: 'snap', state: data.state as unknown as GameState, sentAt: data.sentAt, seq: data.seq };
}

export function parseSnapDelta(data: unknown): SnapDeltaMsg | null {
  if (!isObj(data) || data.t !== 'snapd' || !finite(data.seq) || !finite(data.sentAt)) return null;
  if (data.patch !== null && !Array.isArray(data.patch)) return null;
  return { t: 'snapd', seq: data.seq, patch: data.patch as Patch | null, sentAt: data.sentAt };
}

export function parseResync(data: unknown): ResyncMsg | null {
  return isObj(data) && data.t === 'resync' ? { t: 'resync' } : null;
}

export function parseLobby(data: unknown): LobbyMsg | null {
  if (!isObj(data) || data.t !== 'lobby' || !Array.isArray(data.members) || typeof data.started !== 'boolean') return null;
  const members: Member[] = [];
  for (const m of data.members) {
    if (!isObj(m) || !str(m.token) || !str(m.name)) return null;
    const look = cleanLook(m.look);
    members.push({ token: m.token, name: m.name, ...(look ? { look } : {}) });
  }
  const msg: LobbyMsg = { t: 'lobby', members, started: data.started };
  const bots = parseBots(data.bots);
  if (bots !== undefined) {
    msg.bots = bots;
    msg.botsPicked = data.botsPicked === true;
  }
  return msg;
}

export function parseTele(data: unknown): TeleMsg | null {
  if (!isObj(data) || data.t !== 'tele' || !str(data.token) || !Array.isArray(data.events)) return null;
  if (data.token.length < 1 || data.token.length > MAX_TOKEN || data.events.length > MAX_TELE_EVENTS) return null;
  const events: TeleEvent[] = [];
  for (const e of data.events) {
    if (!isObj(e) || !str(e.kind) || e.kind.length < 1 || e.kind.length > MAX_TELE_KIND || !finite(e.at)) return null;
    if (RESERVED_TELE_KINDS.includes(e.kind)) return null;
    const json = JSON.stringify(e.data);
    events.push({ kind: e.kind, data: json !== undefined && json.length <= MAX_TELE_DATA ? e.data : null, at: e.at });
  }
  return { t: 'tele', token: data.token, events };
}
