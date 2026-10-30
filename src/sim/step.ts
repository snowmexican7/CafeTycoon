import { applyBranchInput } from './branch';
import { applySignatureInput } from './signature';
import { applyGearInput } from './gear';
import { applyPitchInput } from './pitch';
import { applyAdInput } from './ads';
import { applyCheckoutInput } from './checkout';
import { applyRivalCounterInput, applyScoutInput } from './rival';
import { beginSeason } from './season';
import { applyTwistInput } from './taste';
import { applyRoleInput } from './roles';
import { applyCloseEarly, closeVoteUnanimous, dropCloseVote } from './closeEarly';
import { applyPriceInput } from './pricing';
import { ECONOMY } from '../data/economy';
import { LAYOUT, layoutFor } from '../data/layout';
import { applyGrowInput } from './growth';
import { applyEquipInput, applySlotInput } from './slots';
import { finishDay } from './closing';
import { markBeforeGrace, tickChallenges } from './challenges';
import { TICK_RATE, secondsToTicks } from './constants';
import { spawnCustomers, stepCustomers } from './customers';
import { stepEvents } from './events';
import { computeModifiers } from './effects';
import { applyMenuInput } from './menu';
import { applyMovement } from './movement';
import { applyNightInput, stepNight } from './night';
import { startNight } from './run';
import { stepPass } from './pass';
import { interact, stepStations } from './stations';
import type { GameState, PlayerInput } from './types';
import { validateInput } from './validate';
import { isBotId, syncBots } from './bots/roster';
import { applyStaffInput } from './staff';
import { afterBotInteract, stepBots } from './bots/brain';
import { drinkEspresso, stepEspresso } from './espresso';
import { stepEggs, unlockSecret } from './eggs';
import { stepBumps } from './bumps';
import { clearFloorFields, floorFields, stepStuns, trackTiles } from './tiles';
import { onTileEntry, stepCleanliness } from './floor';
import { resolveDrops } from './drop';
import { stepCleaning } from './mop';
import { stepRogue } from './rogue';
import { emitLog, pruneLog } from './log';
import { noteNight, tallyStats } from './stats';

function applyInput(s: GameState, input: PlayerInput): void {
  const isHost = input.playerId === s.hostId;
  const existing = s.players.find((p) => p.id === input.playerId);
  if (existing?.bot || (input.kind === 'join' && isBotId(input.playerId))) return;
  switch (input.kind) {
    case 'join': {
      if (existing) existing.connected = true;
      else if (s.players.filter((p) => !p.bot).length < ECONOMY.maxHumans) {
        const firstBot = s.players.findIndex((p) => p.bot);
        s.players.splice(firstBot === -1 ? s.players.length : firstBot, 0, {
          id: input.playerId,
          name: input.name,
          pos: { ...LAYOUT.door },
          moveDir: { x: 0, y: 0 },
          interactQueued: false,
          holding: null,
          connected: true,
          idleTicks: 0,
          ...floorFields(LAYOUT.door),
        });
      }
      break;
    }
    case 'leave': {
      const p = s.players.find((x) => x.id === input.playerId);
      if (p) {
        p.connected = false;
        p.holding = null;
        p.moveDir = { x: 0, y: 0 };
        p.heldDir = { x: 0, y: 0 };
        p.interactQueued = false;
        dropCloseVote(s, p.id);
        clearFloorFields(p);
        if (s.mop.heldBy === p.id) {
          s.mop.heldBy = null;
          s.mop.pos = { ...layoutFor(s.tier).mopHome };
        }
      }
      break;
    }
    case 'settings':
      if (isHost) {
        Object.assign(s.settings, input.settings); // already cleaned by validateInput (sanitizeSettings)
        // Between days a new bots choice shows up now; during the day it waits for the next startDay.
        if (input.settings.bots !== undefined && (s.phase === 'night' || s.phase === 'weekEnd')) syncBots(s);
      }
      break;
    case 'move': {
      const p = s.players.find((x) => x.id === input.playerId);
      if (p) {
        p.heldDir = { x: input.x, y: input.y };
        if (p.stunTicksLeft === 0) p.moveDir = { x: input.x, y: input.y };
        if (input.interact) p.interactQueued = true;
      }
      break;
    }
    case 'drop': {
      const p = s.players.find((x) => x.id === input.playerId);
      if (p && (s.phase === 'day' || s.phase === 'closing')) p.dropQueued = true;
      break;
    }
    case 'secret':
      if (s.phase === 'day' || s.phase === 'closing' || s.phase === 'night') unlockSecret(s, input.playerId, input.code);
      break;
    case 'buy':
    case 'reroll': {
      const before = input.kind === 'buy' ? s.boughtTonight.length : (s.rerolls ?? 0);
      applyNightInput(s, input);
      const after = input.kind === 'buy' ? s.boughtTonight.length : (s.rerolls ?? 0);
      if (after > before) noteNight(s, input.playerId, input.kind === 'buy' ? 'cardsBought' : 'rerolls');
      break;
    }
    case 'restock':
    case 'ready':
      applyNightInput(s, input);
      break;
    case 'menu':
      applyMenuInput(s, input);
      break;
    case 'price':
      applyPriceInput(s, input);
      break;
    case 'twist':
      applyTwistInput(s, input);
      break;
    case 'signature':
      applySignatureInput(s, input);
      break;
    case 'checkout':
      applyCheckoutInput(s, input);
      break;
    case 'grow':
      applyGrowInput(s, input);
      break;
    case 'slot':
      applySlotInput(s, input);
      break;
    case 'equip':
      applyEquipInput(s, input);
      break;
    case 'gear':
      applyGearInput(s, input);
      break;
    case 'ad':
      applyAdInput(s, input);
      break;
    case 'pitch':
      applyPitchInput(s, input);
      break;
    case 'scout':
      applyScoutInput(s, input);
      break;
    case 'rivalCounter':
      applyRivalCounterInput(s, input);
      break;
    case 'staff':
      applyStaffInput(s, input);
      break;
    case 'branch':
      applyBranchInput(s, input);
      break;
    case 'role':
      applyRoleInput(s, input);
      break;
    case 'espresso':
      drinkEspresso(s, input.playerId);
      break;
    case 'closeEarly':
      applyCloseEarly(s, input);
      break;
    case 'weekEnd':
      if (isHost && s.phase === 'weekEnd') {
        if (input.choice === 'stop') s.phase = 'ended';
        else {
          beginSeason(s);
          s.unlimited = true;
          s.day += 1;
          startNight(s);
        }
      }
      break;
  }
}

/** Doors lock: score the beforeGrace goals, enter the closing phase and start its grace timer. */
export function enterClosing(s: GameState): void {
  markBeforeGrace(s);
  s.phase = 'closing';
  s.phaseTicksLeft = secondsToTicks(ECONOMY.closingGraceSeconds);
}

function stepDay(s: GameState, doorsOpen: boolean): void {
  stepEspresso(s);
  stepEvents(s, doorsOpen);
  const m = computeModifiers(s);
  stepStuns(s);
  stepBots(s, m);
  applyMovement(s, m.moveSpeed);
  stepBumps(s);
  onTileEntry(s, trackTiles(s));
  // Idle total (not a streak): a connected person's ticks with no movement and no interact.
  for (const p of s.players) {
    if (p.bot || !p.connected) continue;
    if (p.moveDir.x === 0 && p.moveDir.y === 0 && !p.interactQueued) p.idleTicks += 1;
  }
  for (const p of s.players) {
    if (!p.interactQueued) continue;
    const held = p.holding;
    interact(s, p.id);
    if (p.bot) afterBotInteract(s, p, held);
  }
  resolveDrops(s);
  for (const p of s.players) {
    p.interactQueued = false;
    p.dropQueued = false;
  }
  stepCleaning(s);
  stepStations(s);
  stepPass(s);
  stepCleanliness(s);
  if (doorsOpen) spawnCustomers(s);
  stepCustomers(s);
  stepRogue(s);
  stepEggs(s);
  if (doorsOpen) tickChallenges(s);
  if (doorsOpen) {
    // FB1 WP3: queue-empty stamp for the close-early hint; set when the queue empties, cleared when someone is queued.
    if (s.customers.length > 0) delete s.emptySince;
    else s.emptySince ??= s.tick;
    // Checked every tick, so a vote that becomes unanimous because someone left still closes the shop.
    if (closeVoteUnanimous(s)) {
      const left = Math.ceil(s.phaseTicksLeft / TICK_RATE); // whole seconds, rounded up: a vote in the last second reads 0:01, not 0:00
      emitLog(s, 'closedEarly', { votes: s.closeVotes?.length ?? 0, left });
      s.today.closedEarly = left;
      enterClosing(s);
      return;
    }
  }
  s.phaseTicksLeft -= 1;
  if (s.phaseTicksLeft > 0) return;
  if (doorsOpen) {
    enterClosing(s);
  } else {
    finishDay(s);
  }
}

/** Doors locked and nobody left inside (queue or rogue), after the short minimum closing beat. */
export function shopEmpty(s: GameState): boolean {
  return s.customers.length === 0 && s.rogue === null;
}

function stepClosing(s: GameState): void {
  // phaseTicksLeft hits 0 on the grace timer: stepDay finishes the day and leftovers storm out
  stepDay(s, false);
  if (s.phase !== 'closing') return;
  const elapsed = secondsToTicks(ECONOMY.closingGraceSeconds) - s.phaseTicksLeft;
  if (elapsed >= secondsToTicks(ECONOMY.closingMinSeconds) && shopEmpty(s)) finishDay(s);
}

/** Advance the game by one tick. Pure: the input state is never modified. */
export function step(state: GameState, inputs: PlayerInput[]): GameState {
  const s = structuredClone(state);
  s.tick += 1;
  for (const raw of inputs) {
    const input = validateInput(raw);
    if (input) applyInput(s, input);
  }
  switch (s.phase) {
    case 'night':
      stepNight(s);
      break;
    case 'day':
      stepDay(s, true);
      break;
    case 'closing':
      stepClosing(s);
      break;
    case 'weekEnd':
    case 'ended':
      break;
  }
  tallyStats(s);
  pruneLog(s);
  return s;
}
