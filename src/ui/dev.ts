/**
 * ui-3.5.1 (Round 4): dev mode, only with `?dev=1` in the address. Never shown otherwise.
 *
 * - A DEV badge in the corner, so a screenshot or a stream never hides that it's a test run.
 * - "Pause night timer" (host only): sets the night to relaxed (`settings.nightLengthSec = 0`, the sim already
 *   supports it: the clock stops and the doors open when everyone is ready), then puts the old length back.
 * - Stub buttons for Claude's future dev inputs (see DEV_STUBS and docs/HANDOFF.md). They stay off until the
 *   sim has a real input for them; the UI never edits money or stock by itself.
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

/**
 * Names the UI is ready to wire once the sim has them (HANDOFF request to Claude). Each is a planned
 * `{ kind: 'dev', playerId, action }` host-only input, ignored unless the run was started in dev mode.
 */
export const DEV_STUBS = [
  { action: 'unlimitedMoney', label: '💰 Unlimited money' },
  { action: 'fillStock', label: '📦 Fill every jar' },
  { action: 'skipToNight', label: '⏭️ Skip to tonight' },
] as const;
export type DevAction = (typeof DEV_STUBS)[number]['action'];

/** Ready for Claude's dev input. Returns null today: there is no sim input yet, so the buttons stay off. */
export function devInput(_action: DevAction, _playerId: string): PlayerInput | null {
  return null;
}

export interface DevInfo {
  phase: string;
  isHost: boolean;
  nightLengthSec: number;
}

export interface DevPanelState {
  /** The night length to put back when the timer is un-paused (null = not paused by us). */
  saved: number | null;
}

export function devHtml(info: DevInfo | null, st: DevPanelState, open: boolean): string {
  const paused = st.saved !== null && info?.nightLengthSec === 0;
  const canPause = !!info && info.isHost && (info.phase === 'night' || paused);
  const why = !info ? 'Start a game first' : !info.isHost ? 'Only the host can pause the night' : info.phase !== 'night' && !paused ? 'Works at night' : '';
  return `<button class="dev-badge" data-dev="toggle" aria-expanded="${open}" title="Dev mode is on (?dev=1)">DEV</button>
  <div class="dev-panel"${open ? '' : ' hidden'}>
    <div class="dev-h">Dev mode</div>
    <button class="dev-btn${paused ? ' on' : ''}" data-dev="pause" aria-pressed="${paused}"${canPause ? '' : ' disabled'}>${paused ? '▶️ Start the night timer again' : '⏸️ Pause night timer'}</button>
    ${why ? `<div class="dev-why">${esc(why)}</div>` : ''}
    ${DEV_STUBS.map((s) => `<button class="dev-btn" data-dev="stub" data-act="${s.action}" disabled title="Waiting for the sim (see HANDOFF)">${s.label}</button>`).join('')}
    <div class="dev-why">More dev buttons light up when the sim adds them.</div>
  </div>`;
}

/** The night-length change for the pause toggle, or null when nothing should be sent. */
export function pauseToggle(info: DevInfo, st: DevPanelState): { send: number; saved: number | null } | null {
  if (!info.isHost) return null;
  if (st.saved !== null && info.nightLengthSec === 0) return { send: st.saved, saved: null };
  if (info.phase !== 'night' || info.nightLengthSec === 0) return null;
  return { send: 0, saved: info.nightLengthSec };
}

export interface DevPanel {
  update(info: DevInfo | null): void;
}

export function createDevPanel(doc: Document, send: (input: PlayerInput) => void, me: () => string): DevPanel {
  const root = doc.createElement('div');
  root.id = 'devMode';
  doc.body.appendChild(root);
  const st: DevPanelState = { saved: null };
  let info: DevInfo | null = null;
  let open = false;
  let last = '';
  const draw = () => {
    const h = devHtml(info, st, open);
    if (h !== last) root.innerHTML = last = h;
  };
  root.addEventListener('click', (ev) => {
    const el = (ev.target as Element).closest<HTMLElement>('[data-dev]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    if (el.dataset.dev === 'toggle') open = !open;
    else if (el.dataset.dev === 'pause' && info) {
      const t = pauseToggle(info, st);
      if (t) {
        st.saved = t.saved;
        send({ kind: 'settings', playerId: me(), settings: { nightLengthSec: t.send } });
      }
    }
    draw();
  });
  draw();
  return {
    update(next) {
      info = next;
      // Someone changed the night length another way: forget our saved value.
      if (st.saved !== null && next && next.nightLengthSec !== 0) st.saved = null;
      draw();
    },
  };
}
