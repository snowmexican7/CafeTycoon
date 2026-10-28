import type { GameState, PlayerInput } from './types';

/**
 * A connected human switches a drink on or off the menu, at night only. The last drink
 * that is on can never be switched off, so the café always sells something.
 */
export function applyMenuInput(state: GameState, input: Extract<PlayerInput, { kind: 'menu' }>): GameState {
  if (state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  if (!input.on && state.menu[input.drink] && Object.values(state.menu).filter(Boolean).length === 1) return state;
  state.menu[input.drink] = input.on;
  return state;
}
