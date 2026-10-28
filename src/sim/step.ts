import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { finishDay } from './closing';
import { secondsToTicks } from './constants';
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
import { isBotId } from './bots/roster';
import { stepBots } from './bots/brain';

function applyInput(s: GameState, input: PlayerInput): void {
  const isHost = input.playerId === s.hostId;
  const existing = s.players.find((p) => p.id === input.playerId);
  if (existing?.bot || (input.kind === 'join' && isBotId(input.playerId))) return;
  switch (input.kind) {
    case 'join': {
      if (existing) existing.connected = true;
      else {
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
        p.interactQueued = false;
      }
      break;
    }
    case 'settings':
      if (isHost) Object.assign(s.settings, input.settings);
      break;
    case 'move': {
      const p = s.players.find((x) => x.id === input.playerId);
      if (p) {
        p.moveDir = { x: input.x, y: input.y };
        if (input.interact) p.interactQueued = true;
      }
      break;
    }
    case 'buy':
    case 'restock':
    case 'ready':
      applyNightInput(s, input);
      break;
    case 'menu':
      applyMenuInput(s, input);
      break;
    case 'weekEnd':
      if (isHost && s.phase === 'weekEnd') {
        if (input.choice === 'stop') s.phase = 'ended';
        else {
          s.unlimited = true;
          s.day += 1;
          startNight(s);
        }
      }
      break;
  }
}

function stepDay(s: GameState, doorsOpen: boolean): void {
  stepEvents(s, doorsOpen);
  const m = computeModifiers(s);
  stepBots(s, m);
  applyMovement(s, m.moveSpeed);
  for (const p of s.players) {
    if (p.interactQueued) interact(s, p.id);
  }
  for (const p of s.players) p.interactQueued = false;
  stepStations(s);
  stepPass(s);
  if (doorsOpen) spawnCustomers(s);
  stepCustomers(s);
  for (const p of s.players) {
    if (p.moveDir.x === 0 && p.moveDir.y === 0) p.idleTicks += 1;
    else p.idleTicks = 0;
  }
  s.phaseTicksLeft -= 1;
  if (s.phaseTicksLeft > 0) return;
  if (doorsOpen) {
    s.phase = 'closing';
    s.phaseTicksLeft = secondsToTicks(ECONOMY.closingGraceSeconds);
  } else {
    finishDay(s);
  }
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
      stepDay(s, false);
      break;
    case 'weekEnd':
    case 'ended':
      break;
  }
  return s;
}
