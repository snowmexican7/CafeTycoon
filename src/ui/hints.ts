import type { GameState, PlayerId } from '../sim/types';
import { esc } from './dom';
import { HINTS, HINTS_KEY, isSnoozed, markSeen, parseHints, pickHint, resetHints, setOff, snooze, type HintId, type HintsState } from './hintsModel';

/** How long a tip stays up before it counts as read, and the quiet gap before the next one. */
const SHOW_MS = 14000;
const GAP_MS = 6000;

/**
 * ui-3.4.0: the new-player tip bubble. Small, beside the shop floor by day (left edge, so it never sits on the
 * stations) or in the night panel's corner. "Got it" retires that tip; "Snooze tips" hides them all for 15 minutes.
 */
export function createHints(store: Storage | null): {
  update(state: GameState, me: PlayerId | null, blocked: boolean): void;
  get(): HintsState;
  act(action: 'snooze' | 'off' | 'on' | 'reset'): void;
  hide(): void;
} {
  let st = parseHints(safeGet(store));
  const save = () => {
    try {
      store?.setItem(HINTS_KEY, JSON.stringify(st));
    } catch {
      /* private mode: tips just reappear next visit */
    }
  };
  const el = document.createElement('div');
  el.className = 'hint-bubble';
  el.hidden = true;
  el.setAttribute('role', 'status');
  document.body.appendChild(el);
  let current: HintId | null = null;
  let shownAt = 0;
  let quietUntil = 0;
  const dismiss = (seen: boolean) => {
    if (current && seen) {
      st = markSeen(st, current);
      save();
    }
    current = null;
    el.hidden = true;
    quietUntil = Date.now() + GAP_MS;
  };
  el.addEventListener('click', (ev) => {
    const a = (ev.target as HTMLElement).closest<HTMLElement>('[data-hint]')?.dataset.hint;
    if (a === 'ok') dismiss(true);
    else if (a === 'snooze') {
      st = snooze(st, Date.now());
      save();
      dismiss(false);
    } else if (a === 'off') {
      st = setOff(st, true);
      save();
      dismiss(false);
    }
  });
  return {
    update(state, me, blocked) {
      const now = Date.now();
      if (current) {
        const h = HINTS[current];
        const wrongPhase = (h.where === 'day') !== (state.phase === 'day');
        if (blocked || wrongPhase || st.off || isSnoozed(st, now)) {
          el.hidden = true;
          if (wrongPhase || st.off) current = null;
          return;
        }
        el.hidden = false;
        if (now - shownAt > SHOW_MS) dismiss(true);
        return;
      }
      if (blocked || now < quietUntil) return;
      const id = pickHint(st, state, me, now);
      if (!id) return;
      current = id;
      shownAt = now;
      const h = HINTS[id];
      el.className = `hint-bubble ${h.where}`;
      el.dataset.hintId = id;
      el.innerHTML = `<span class="hb-ic" aria-hidden="true">${h.icon}</span><b>${esc(h.title)}</b><p>${esc(h.text)}</p>
        <div class="hb-btns"><button class="btn mini" data-hint="ok">Got it</button><button class="hb-link" data-hint="snooze">Snooze tips</button><button class="hb-link" data-hint="off">Turn off</button></div>`;
      el.hidden = false;
    },
    get: () => st,
    hide: () => {
      current = null;
      el.hidden = true;
    },
    act(action) {
      const now = Date.now();
      st = action === 'snooze' ? snooze(st, now) : action === 'off' ? setOff(st, true) : action === 'on' ? setOff(st, false) : resetHints(st);
      save();
      if (action !== 'reset' && action !== 'on') dismiss(false);
      else quietUntil = 0;
    },
  };
}

function safeGet(store: Storage | null): string | null {
  try {
    return store?.getItem(HINTS_KEY) ?? null;
  } catch {
    return null;
  }
}
