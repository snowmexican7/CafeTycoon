import type { Pace } from '../sim/types';
import { hide, onAction, show } from './dom';

const DAY_LENGTHS = [60, 90, 120, 150, 180, 240, 300];
const PACE_NAMES = ['Chill', 'Relaxed', 'Normal', 'Busy', 'Chaos'];

export function createPause(
  container: HTMLElement,
  handlers: { onSettings(patch: { pace?: Pace; dayLengthSec?: number }): void; onQuit(): void },
): { render(current: { pace: Pace; dayLengthSec: number; isHost: boolean }): void; toggle(): void; show(): void; hide(): void } {
  onAction(container, (action) => {
    if (action === 'resume') hide(container);
    else if (action === 'quit') handlers.onQuit();
  });
  container.addEventListener('change', (ev) => {
    const el = ev.target as HTMLSelectElement;
    if (el.name === 'pace') handlers.onSettings({ pace: Number(el.value) as Pace });
    if (el.name === 'dayLength') handlers.onSettings({ dayLengthSec: Number(el.value) });
  });
  return {
    render(current) {
      const dis = current.isHost ? '' : 'disabled';
      container.innerHTML = `
        <div class="panel">
          <h2>Paused</h2>
          <p class="muted small">The café keeps running while this is open.</p>
          <div class="form">
            <label>Pace <select name="pace" ${dis}>${PACE_NAMES.map((n, i) => `<option value="${i + 1}" ${current.pace === i + 1 ? 'selected' : ''}>${i + 1} · ${n}</option>`).join('')}</select></label>
            <label>Day length (from tomorrow) <select name="dayLength" ${dis}>${DAY_LENGTHS.map((s) => `<option value="${s}" ${current.dayLengthSec === s ? 'selected' : ''}>${s} s</option>`).join('')}</select></label>
          </div>
          <div class="row"><button class="primary" data-action="resume">Back to the café</button><button data-action="quit">Quit to title</button></div>
        </div>`;
    },
    toggle() {
      container.hidden ? show(container) : hide(container);
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
