import type { Pace } from '../sim/types';
import type { LocalSettings } from '../storage/settingsStore';
import { esc, hide, onAction, show } from './dom';
import { logoCup } from './icons';
import { roadmapIcon, type RoadmapDrawer } from './roadmap';
import { storefrontSVG } from './storefront';
import type { TitleVM } from './viewModels';

export interface StartChoice {
  name: string;
  seed: number | null;
  pace: Pace;
  dayLengthSec: number;
}

const DAY_LENGTHS = [60, 90, 120, 150, 180, 240, 300];
export const PACE_NAMES = ['Chill', 'Relaxed', 'Normal', 'Busy', 'Chaos'];

/** The pace picker from the mockup: five radio segments with little rising bars. */
export function paceSeg(current: number, disabled = false): string {
  return `<div class="seg" role="radiogroup" aria-label="Pace">${PACE_NAMES.map(
    (n, i) => `<label><input type="radio" name="pace" value="${i + 1}" ${current === i + 1 ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span><i>${'<b></b>'.repeat(i + 1)}</i>${n}</span></label>`,
  ).join('')}</div>`;
}

export const dayOptions = (current: number) =>
  DAY_LENGTHS.map((s) => `<option value="${s}" ${current === s ? 'selected' : ''}>${s} s${s === 120 ? ' · default' : ''}</option>`).join('');

export function createTitle(
  container: HTMLElement,
  handlers: {
    onStart(choice: StartChoice): void;
    onHost(choice: StartChoice): void;
    onJoin(code: string, name: string): void;
    onResume(): void;
    onRejoin(code: string): void;
  },
  roadmap?: RoadmapDrawer,
): { render(vm: TitleVM, settings: LocalSettings, notice?: string): void; show(): void; hide(): void } {
  const q = <T extends HTMLInputElement | HTMLSelectElement>(sel: string) => container.querySelector<T>(sel)!;
  const readChoice = (): StartChoice => {
    const seedRaw = q<HTMLInputElement>('[name=seed]').value.trim();
    return {
      name: q<HTMLInputElement>('[name=name]').value.trim() || 'Barista',
      seed: seedRaw === '' || Number.isNaN(Number(seedRaw)) ? null : Math.floor(Number(seedRaw)),
      pace: Number(container.querySelector<HTMLInputElement>('[name=pace]:checked')?.value ?? 3) as Pace,
      dayLengthSec: Number(q<HTMLSelectElement>('[name=dayLength]').value),
    };
  };
  onAction(container, (action, el) => {
    if (action === 'resume') handlers.onResume();
    else if (action === 'start') handlers.onStart(readChoice());
    else if (action === 'host') handlers.onHost(readChoice());
    else if (action === 'join') handlers.onJoin(q<HTMLInputElement>('[name=code]').value, readChoice().name);
    else if (action === 'rejoin') handlers.onRejoin(el.dataset.code!);
    else if (action === 'roadmap') roadmap?.open();
  });
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).matches('[name=code]')) {
      e.preventDefault();
      handlers.onJoin(q<HTMLInputElement>('[name=code]').value, readChoice().name);
    }
  });
  const badge = () => {
    const n = roadmap?.newCount() ?? 0;
    const el = container.querySelector<HTMLElement>('.rmbtn .badge');
    if (el) {
      el.textContent = `${n} new`;
      el.hidden = n === 0;
    }
    container.querySelector('.rmbtn .dot')?.toggleAttribute('hidden', n === 0);
  };
  roadmap?.onChange(badge);

  return {
    render(vm, settings, notice) {
      const last = vm.history[0];
      const lastLine = last
        ? `Last run: <b>${esc(last.score)}</b> · ${last.players.split(',').length} crew · ${esc(last.scenario)}`
        : 'No runs yet. Open the shop!';
      const history = vm.history.length
        ? `<table class="history"><thead><tr><th>Date</th><th>Score</th><th>Days</th><th>Week</th><th>Crew</th></tr></thead><tbody>${vm.history
            .map((h) => `<tr><td>${esc(h.date)}</td><td>${esc(h.score)}</td><td>${h.days}</td><td>${esc(h.scenario)}</td><td>${esc(h.players)}</td></tr>`)
            .join('')}</tbody></table>`
        : '<p class="muted">Finished runs show up here.</p>';
      container.innerHTML = `
        ${storefrontSVG()}
        <main class="paper titlecard">
          <div class="logo">${logoCup(78)}<h1>Cafe<b>Tycoon</b></h1></div>
          <p class="tag">Plan the shop by night. Survive the rush by day. With friends.</p>
          ${notice ? `<p class="notice" role="alert">${esc(notice)}</p>` : ''}
          ${vm.canResume ? '<button class="btn mint block resume" data-action="resume">▶ Resume your run</button>' : ''}
          <div class="row2">
            <label class="fld"><span class="lbl">Your name</span><input class="inp" name="name" maxlength="16" value="${esc(settings.playerName)}" autocomplete="nickname"></label>
            <label class="fld"><span class="lbl">Day length</span><select class="inp" name="dayLength">${dayOptions(settings.dayLengthSec)}</select></label>
          </div>
          <div class="fld"><span class="lbl">Pace</span>${paceSeg(settings.pace)}</div>
          <div class="btns">
            <button class="btn primary" data-action="host">Host a co-op run</button>
            <div class="join"><input class="inp code" name="code" placeholder="ROOM CODE" maxlength="5" autocapitalize="characters" spellcheck="false" aria-label="Room code"><button class="btn mint" data-action="join">Join room</button></div>
            ${vm.rejoinCode ? `<button class="btn ghost" data-action="rejoin" data-code="${esc(vm.rejoinCode)}">↺ Rejoin room ${esc(vm.rejoinCode)}</button>` : ''}
            <button class="btn" data-action="start">Play solo</button>
          </div>
          <div class="foot"><span>${lastLine}</span>
            <label class="seedfld">Seed <input name="seed" placeholder="random" inputmode="numeric" aria-label="Seed (optional)"></label></div>
          <details class="more"><summary>Past runs &amp; controls</summary>
            ${history}
            <p class="keys-help"><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span> or arrows move · <span class="key">E</span> or <span class="key">Space</span> uses a station · <span class="key">Q</span> at the espresso machine drinks a shot (careful) · <span class="key">Esc</span> pauses · <span class="key">M</span> mutes sound</p>
          </details>
        </main>
        <button class="btn rmbtn" data-action="roadmap" aria-haspopup="dialog"><span class="dot" hidden></span>${roadmapIcon}Roadmap <span class="badge" hidden></span></button>`;
      badge();
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
