/**
 * ui-3.5.1 (Round 4): dev mode, only with `?dev=1` in the address. Never shown otherwise.
 *
 * - `src/main.ts` starts the run with `CreateRunOptions.dev: true` (Claude's R4 a). The sim then keeps the cash
 *   topped up and never saves the run to meta, records or history.
 * - A DEV badge in the corner, so a screenshot or a stream never hides that it's a test run.
 * - "Pause night timer" (host only, night or week end): sends `{ kind: 'devPause', playerId, paused }` and reads
 *   `GameState.devPaused` back.
 * - Stub buttons for dev inputs the sim doesn't have yet (DEV_STUBS, requested in docs/HANDOFF.md). They stay off
 *   until it does; the UI never edits money or stock by itself.
 */
import type { PlayerInput } from '../sim/types';
import { esc } from './dom';

export function isDevMode(search: string): boolean {
  try {
    return new URLSearchParams(search).get('dev') === '1';
  } catch {
    return false;
  }
}

/** Dev buttons still waiting for a sim input (HANDOFF request to Claude). */
export const DEV_STUBS = [
  { action: 'fillStock', label: '📦 Fill every jar' },
  { action: 'skipToNight', label: '⏭️ Skip to tonight' },
] as const;
export type DevAction = (typeof DEV_STUBS)[number]['action'];

/** Ready for a future sim dev input. Returns null today, so the buttons stay off. */
export function devInput(_action: DevAction, _playerId: string): PlayerInput | null {
  return null;
}

export interface DevInfo {
  phase: string;
  isHost: boolean;
  /** GameState.dev: this run was started in dev mode. */
  devRun: boolean;
  /** GameState.devPaused */
  paused: boolean;
}

const PAUSE_PHASES = ['night', 'weekEnd'];

export function canPause(info: DevInfo | null): boolean {
  return !!info && info.devRun && info.isHost && (PAUSE_PHASES.includes(info.phase) || info.paused);
}

export function devHtml(info: DevInfo | null, open: boolean): string {
  const paused = !!info?.paused;
  const why = !info
    ? 'Start a game first'
    : !info.devRun
      ? 'This game was started without ?dev=1. Start a new game to use dev mode.'
      : !info.isHost
        ? 'Only the host can pause the night'
        : !canPause(info)
          ? 'Works at night'
          : '';
  return `<button class="dev-badge" data-dev="toggle" aria-expanded="${open}" title="Dev mode is on (?dev=1)">DEV</button>
  <div class="dev-panel"${open ? '' : ' hidden'}>
    <div class="dev-h">Dev mode</div>
    ${info?.devRun ? '<div class="dev-note">💰 Cash stays topped up. This game is not saved to your records.</div>' : ''}
    <button class="dev-btn${paused ? ' on' : ''}" data-dev="pause" aria-pressed="${paused}"${canPause(info) ? '' : ' disabled'}>${paused ? '▶️ Start the night timer again' : '⏸️ Pause night timer'}</button>
    ${why ? `<div class="dev-why">${esc(why)}</div>` : ''}
    ${DEV_STUBS.map((s) => `<button class="dev-btn" data-dev="stub" data-act="${s.action}" disabled title="Waiting for the sim (see HANDOFF)">${s.label}</button>`).join('')}
    <div class="dev-why">More dev buttons light up when the sim adds them.</div>
  </div>`;
}

/** The input for the pause toggle, or null when nothing should be sent. */
export function pauseInput(info: DevInfo, playerId: string): PlayerInput | null {
  if (!canPause(info)) return null;
  return { kind: 'devPause', playerId, paused: !info.paused };
}

export interface DevPanel {
  update(info: DevInfo | null): void;
}

export function createDevPanel(doc: Document, send: (input: PlayerInput) => void, me: () => string): DevPanel {
  const root = doc.createElement('div');
  root.id = 'devMode';
  doc.body.appendChild(root);
  let info: DevInfo | null = null;
  let open = false;
  let last = '';
  const draw = () => {
    const h = devHtml(info, open);
    if (h !== last) root.innerHTML = last = h;
  };
  root.addEventListener('click', (ev) => {
    const el = (ev.target as Element).closest<HTMLElement>('[data-dev]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    if (el.dataset.dev === 'toggle') open = !open;
    else if (el.dataset.dev === 'pause' && info) {
      const input = pauseInput(info, me());
      if (input) send(input);
    }
    draw();
  });
  draw();
  return {
    update(next) {
      info = next;
      draw();
    },
  };
}
