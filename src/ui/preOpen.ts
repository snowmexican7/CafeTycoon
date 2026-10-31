/**
 * FB2 C10: the morning pre-open banner — countdown, Ready, and (host) Open doors.
 * Inputs: `{ kind: 'ready' }` and `{ kind: 'openDoors' }`. Local only for the timer label.
 */
import { TICK_RATE } from '../sim/constants';
import { inPreOpen } from '../sim/rearrange';
import type { GameState, PlayerId } from '../sim/types';
import { esc } from './dom';

export interface PreOpenVM {
  open: boolean;
  /** Whole seconds left until the doors open on their own. */
  secsLeft: number;
  ready: number;
  needed: number;
  mine: boolean;
  isHost: boolean;
}

export function preOpenVM(state: GameState, me: PlayerId): PreOpenVM {
  if (!inPreOpen(state) || state.preOpenUntil === undefined) {
    return { open: false, secsLeft: 0, ready: 0, needed: 0, mine: false, isHost: me === state.hostId };
  }
  const crew = state.players.filter((p) => p.connected && !p.bot);
  const secsLeft = Math.max(0, Math.ceil((state.preOpenUntil - state.tick) / TICK_RATE));
  return {
    open: true,
    secsLeft,
    ready: state.ready.length,
    needed: Math.max(1, crew.length),
    mine: state.ready.includes(me),
    isHost: me === state.hostId,
  };
}

export const preOpenKey = (vm: PreOpenVM | undefined): string =>
  vm?.open ? `${vm.secsLeft}|${vm.ready}/${vm.needed}|${vm.mine ? 1 : 0}|${vm.isHost ? 1 : 0}` : '';

/** Banner HTML (pure, for tests). */
export function preOpenHtml(vm: PreOpenVM): string {
  const count = vm.needed > 1 ? `${vm.ready}/${vm.needed} ready` : vm.mine ? 'You’re ready' : 'Press Ready when the layout looks good';
  const openBtn = vm.isHost
    ? `<button type="button" class="po-open" data-action="openDoors" tabindex="-1">Open doors</button>`
    : '';
  const readyBtn = vm.mine
    ? `<button type="button" class="po-ready mine" data-action="ready" tabindex="-1" disabled>Ready ✓</button>`
    : `<button type="button" class="po-ready" data-action="ready" tabindex="-1">Ready</button>`;
  return `<div class="po-card" role="status">
    <div class="po-clock"><b>${vm.secsLeft}s</b><small>Doors open soon</small></div>
    <div class="po-copy"><b>Rearrange the bar</b><small>Z or E picks up a machine · E sets it down · ${esc(count)}</small></div>
    <div class="po-actions">${readyBtn}${openBtn}</div>
  </div>`;
}

/**
 * Mount the pre-open banner. `onReady` / `onOpenDoors` send the inputs.
 * Returns a render function and a disposer.
 */
export function mountPreOpen(
  el: HTMLElement,
  handlers: { onReady(): void; onOpenDoors(): void },
): { render(vm: PreOpenVM | undefined): void; dispose(): void } {
  let lastKey = '';
  const onClick = (ev: Event) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!b || b.disabled) return;
    ev.preventDefault();
    b.blur();
    if (b.dataset.action === 'ready') handlers.onReady();
    else if (b.dataset.action === 'openDoors') handlers.onOpenDoors();
  };
  el.addEventListener('click', onClick);
  return {
    render(next) {
      const key = preOpenKey(next);
      if (key === lastKey) return;
      lastKey = key;
      const visible = !!next?.open;
      el.hidden = !visible;
      if (!next || !visible) {
        el.innerHTML = '';
        return;
      }
      el.innerHTML = preOpenHtml(next);
    },
    dispose() {
      el.removeEventListener('click', onClick);
    },
  };
}
