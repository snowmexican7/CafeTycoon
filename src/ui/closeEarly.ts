/**
 * FB1 WP3 (UI): the "Close early" press-and-hold button by the day clock. It reads the sim's
 * `closeEarlyState` (through `closeEarlyVM`) and sends `{ kind: 'closeEarly', on }`. Holding for
 * HOLD_MS (mouse, touch, or the C key) casts the vote; a tap on a cast vote takes it back.
 */
import { closeEarlyState } from '../sim/closeEarly';
import type { GameState, PlayerId } from '../sim/types';
import { esc } from './dom';

export const HOLD_MS = 1200;
export const CLOSE_KEY = 'KeyC';

export interface CloseEarlyVM {
  open: boolean;
  votes: number;
  needed: number;
  /** I have voted (tap takes it back). */
  mine: boolean;
  hint: 'soldOut' | 'empty' | null;
  /** A short nudge line when the hint is set and I haven't voted. */
  nudge: string | null;
}

export function closeEarlyVM(state: GameState, me: PlayerId): CloseEarlyVM {
  const c = closeEarlyState(state);
  const mine = c.voted.includes(me);
  const nudge = !c.open || mine ? null : c.hint === 'soldOut' ? "You're sold out" : c.hint === 'empty' ? 'Shop is quiet' : null;
  return { open: c.open, votes: c.votes, needed: c.needed, mine, hint: c.hint, nudge };
}

export const closeEarlyKey = (vm: CloseEarlyVM | undefined): string =>
  vm ? `${vm.open ? 1 : 0}|${vm.votes}/${vm.needed}|${vm.mine ? 1 : 0}|${vm.hint ?? ''}|${vm.nudge ?? ''}` : '';

/** The button's inner HTML (pure, for tests): ring, label, the vote count in co-op, and the nudge. */
export function closeEarlyHtml(vm: CloseEarlyVM): string {
  const count = vm.needed > 1 ? `${vm.votes}/${vm.needed} voted` : '';
  const sub = vm.mine ? (vm.needed > 1 ? `${count} · click to undo` : 'click to undo') : [count, 'hold C'].filter(Boolean).join(' · ');
  const ring = `<svg class="ce-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15" pathLength="100"/><path class="door" d="M13 11h10v15H13z M20 18.5h1.2"/></svg>`;
  return `${ring}<span class="ce-t"><b>${vm.mine ? 'Voted to close' : 'Close early'}</b>${vm.nudge ? `<small class="ce-nudge" role="status">${esc(vm.nudge)}</small>` : `<small>${esc(sub)}</small>`}</span>`;
}

export function closeEarlyLabel(vm: CloseEarlyVM): string {
  if (vm.mine) return `You voted to close early${vm.needed > 1 ? ` (${vm.votes} of ${vm.needed})` : ''}. Click to take the vote back.`;
  return `Hold to close the shop early (or hold C)${vm.needed > 1 ? `. ${vm.votes} of ${vm.needed} have voted; everyone must agree.` : '.'}`;
}

/**
 * Wire the hold behaviour to a button. `onVote(on)` sends the input. Returns a render function
 * and a disposer. Holding is purely local: the ring fills, and at HOLD_MS the vote goes out.
 */
export function mountCloseEarly(btn: HTMLButtonElement, onVote: (on: boolean) => void, target: Window = window): {
  render(vm: CloseEarlyVM | undefined): void;
  dispose(): void;
} {
  let vm: CloseEarlyVM | undefined;
  let lastKey = '';
  let start: number | null = null;
  let raf = 0;
  let sent = false;
  const setP = (p: number) => btn.style.setProperty('--p', String(Math.round(p * 100)));
  const stop = () => {
    start = null;
    cancelAnimationFrame(raf);
    btn.classList.remove('holding');
    if (!sent) setP(0);
  };
  const tick = () => {
    if (start === null) return;
    const p = Math.min(1, (performance.now() - start) / HOLD_MS);
    setP(p);
    if (p >= 1) {
      sent = true;
      stop();
      btn.classList.add('sent');
      onVote(true);
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  const begin = () => {
    if (!vm?.open || start !== null) return;
    if (vm.mine) { onVote(false); return; }
    sent = false;
    start = performance.now();
    btn.classList.add('holding');
    raf = requestAnimationFrame(tick);
  };
  const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '');
  const onDown = (e: PointerEvent) => { if (e.button !== 0) return; e.preventDefault(); btn.setPointerCapture?.(e.pointerId); begin(); };
  const onUp = () => stop();
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== CLOSE_KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing() || btn.hidden) return;
    begin();
  };
  const onKeyUp = (e: KeyboardEvent) => { if (e.code === CLOSE_KEY) stop(); };
  // Space/Enter on a focused button would fight the E/Space "use" key, so the button never keeps focus.
  const onClickKey = (e: Event) => { e.preventDefault(); btn.blur(); };
  btn.addEventListener('pointerdown', onDown);
  btn.addEventListener('pointerup', onUp);
  btn.addEventListener('pointercancel', onUp);
  btn.addEventListener('lostpointercapture', onUp);
  btn.addEventListener('click', onClickKey);
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onUp);
  return {
    render(next) {
      vm = next;
      const key = closeEarlyKey(next);
      if (key === lastKey) return;
      lastKey = key;
      const visible = !!next?.open;
      btn.hidden = !visible;
      if (!next || !visible) { stop(); sent = false; return; }
      btn.classList.toggle('mine', next.mine);
      btn.classList.toggle('nudge', !!next.nudge);
      btn.classList.remove('sent');
      sent = false;
      if (start === null) setP(next.mine ? 1 : 0);
      btn.innerHTML = closeEarlyHtml(next);
      btn.setAttribute('aria-label', closeEarlyLabel(next));
      btn.title = closeEarlyLabel(next);
      btn.setAttribute('aria-pressed', String(next.mine));
    },
    dispose() {
      stop();
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onUp);
    },
  };
}
