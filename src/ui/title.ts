import type { Pace } from '../sim/types';
import type { LocalSettings } from '../storage/settingsStore';
import { esc, hide, onAction, show } from './dom';
import type { TitleVM } from './viewModels';

export interface StartChoice {
  name: string;
  seed: number | null;
  pace: Pace;
  dayLengthSec: number;
}

const DAY_LENGTHS = [60, 90, 120, 150, 180, 240, 300];
const PACE_NAMES = ['Chill', 'Relaxed', 'Normal', 'Busy', 'Chaos'];

export function createTitle(
  container: HTMLElement,
  handlers: {
    onStart(choice: StartChoice): void;
    onHost(choice: StartChoice): void;
    onJoin(code: string, name: string): void;
    onResume(): void;
    onRejoin(code: string): void;
  },
): { render(vm: TitleVM, settings: LocalSettings, notice?: string): void; show(): void; hide(): void } {
  const q = <T extends HTMLInputElement | HTMLSelectElement>(sel: string) => container.querySelector<T>(sel)!;
  const readChoice = (): StartChoice => {
    const seedRaw = q<HTMLInputElement>('[name=seed]').value.trim();
    return {
      name: q<HTMLInputElement>('[name=name]').value.trim() || 'Barista',
      seed: seedRaw === '' || Number.isNaN(Number(seedRaw)) ? null : Math.floor(Number(seedRaw)),
      pace: Number(q<HTMLSelectElement>('[name=pace]').value) as Pace,
      dayLengthSec: Number(q<HTMLSelectElement>('[name=dayLength]').value),
    };
  };
  onAction(container, (action, el) => {
    if (action === 'resume') handlers.onResume();
    else if (action === 'start') handlers.onStart(readChoice());
    else if (action === 'host') handlers.onHost(readChoice());
    else if (action === 'join') handlers.onJoin(q<HTMLInputElement>('[name=code]').value, readChoice().name);
    else if (action === 'rejoin') handlers.onRejoin(el.dataset.code!);
  });

  return {
    render(vm, settings, notice) {
      const paceOptions = PACE_NAMES.map((n, i) => `<option value="${i + 1}" ${settings.pace === i + 1 ? 'selected' : ''}>${i + 1} · ${n}</option>`).join('');
      const dayOptions = DAY_LENGTHS.map((s) => `<option value="${s}" ${settings.dayLengthSec === s ? 'selected' : ''}>${s} s</option>`).join('');
      const history = vm.history.length
        ? `<table class="history"><thead><tr><th>Date</th><th>Score</th><th>Days</th><th>Week</th><th>Crew</th></tr></thead><tbody>${vm.history
            .map((h) => `<tr><td>${esc(h.date)}</td><td>${esc(h.score)}</td><td>${h.days}</td><td>${esc(h.scenario)}</td><td>${esc(h.players)}</td></tr>`)
            .join('')}</tbody></table>`
        : '<p class="muted">No runs yet. Open the shop.</p>';
      container.innerHTML = `
        <div class="panel">
          <h1>☕ CafeTycoon</h1>
          ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}
          <p class="muted">Frantic by day, a draft by night. One café week, seven days, about thirty minutes.</p>
          <div class="form">
            <label>Your name <input name="name" maxlength="16" value="${esc(settings.playerName)}"></label>
            <label>Seed <input name="seed" placeholder="random" inputmode="numeric"></label>
            <label>Pace <select name="pace">${paceOptions}</select></label>
            <label>Day length <select name="dayLength">${dayOptions}</select></label>
          </div>
          <div class="row">
            <button class="primary" data-action="host">Host a co-op run</button>
            <button data-action="start">Start solo run</button>
            ${vm.canResume ? '<button data-action="resume">Resume run</button>' : ''}
          </div>
          <div class="row join-row">
            <input name="code" placeholder="Room code" maxlength="5" autocapitalize="characters" spellcheck="false">
            <button data-action="join">Join a room</button>
            ${vm.rejoinCode ? `<button data-action="rejoin" data-code="${esc(vm.rejoinCode)}">Rejoin room ${esc(vm.rejoinCode)}</button>` : ''}
          </div>
          <h2>Past runs</h2>
          ${history}
          <p class="muted small">Move: WASD or arrows · Use a station: E or Space · Pause: Esc</p>
        </div>`;
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
