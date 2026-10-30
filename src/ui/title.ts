import { ECONOMY } from '../data/economy';
import type { BotsChoice, Pace } from '../sim/types';
import type { LocalSettings } from '../storage/settingsStore';
import { esc, hide, onAction, show } from './dom';
import { logoCup } from './icons';
import { roadmapIcon, type RoadmapDrawer } from './roadmap';
import { storefrontSVG } from './storefront';
import { DEFAULT_NIGHT_LENGTH, NIGHT_LENGTHS, nightLengthChoice, type TitleVM } from './viewModels';
import { APP_VERSION } from '../version';
import { isPerkId, PERKS, type PerkId } from '../data/perks';

export interface StartChoice {
  name: string;
  seed: number | null;
  pace: Pace;
  dayLengthSec: number;
  /** FB1 WP1: seconds of night planning; 0 = Relaxed (untimed, ready-up, 30 s last call). */
  nightLengthSec: number;
  /** P3 B16: the head start picked (absent = none). */
  perk?: PerkId;
  /** FB2 A1 (3.3.3): bot helpers for Play solo (Off/1/2); absent = keep the stored setting (3 or auto from old JSON). */
  soloBots?: BotsChoice;
}

export const SOLO_BOT_CHOICES = [0, 1, 2] as const;

/** FB2 A1: the Play solo helper picker, Off / 1 / 2 bots. A stored 3 or 'auto' shows none picked and stays as is. */
export function soloBotsSeg(current: BotsChoice): string {
  return `<div class="seg solo-bots" role="radiogroup" aria-label="Solo helpers">${SOLO_BOT_CHOICES.map(
    (n) => `<label><input type="radio" name="soloBots" value="${n}" ${current === n ? 'checked' : ''}><span>${n === 0 ? 'Off' : `${n} bot${n > 1 ? 's' : ''}`}</span></label>`,
  ).join('')}</div>`;
}

/** Reads the picked solo helper count, or undefined when none is picked. */
export function readSoloBots(value: string | undefined): BotsChoice | undefined {
  const n = Number(value);
  return value !== undefined && value !== '' && (SOLO_BOT_CHOICES as readonly number[]).includes(n) ? (n as BotsChoice) : undefined;
}

const DAY_LENGTHS = [60, 90, 120, 150, 180, 240, 300];
/** The real default day length (ECONOMY.dayLengthSec), so the label can never drift from the sim. */
export const DEFAULT_DAY_LENGTH = ECONOMY.dayLengthSec;
const dayLengthChoices = () => (DAY_LENGTHS.includes(DEFAULT_DAY_LENGTH) ? DAY_LENGTHS : [...DAY_LENGTHS, DEFAULT_DAY_LENGTH].sort((a, b) => a - b));
export const PACE_NAMES = ['Chill', 'Relaxed', 'Normal', 'Busy', 'Chaos'];

/** The pace picker from the mockup: five radio segments with little rising bars. */
export function paceSeg(current: number, disabled = false): string {
  return `<div class="seg" role="radiogroup" aria-label="Pace">${PACE_NAMES.map(
    (n, i) => `<label><input type="radio" name="pace" value="${i + 1}" ${current === i + 1 ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span><i>${'<b></b>'.repeat(i + 1)}</i>${n}</span></label>`,
  ).join('')}</div>`;
}

export const dayOptions = (current: number) =>
  dayLengthChoices()
    .map((s) => `<option value="${s}" ${current === s ? 'selected' : ''}>${s} s${s === DEFAULT_DAY_LENGTH ? ' · default' : ''}</option>`)
    .join('');

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
/** FB1 WP1: the night-length picker. 0 is Relaxed. `current` is the stored setting (seconds). */
export const nightOptions = (current: number) => {
  const pick = nightLengthChoice(current);
  const choices: number[] = (NIGHT_LENGTHS as readonly number[]).includes(pick) ? [...NIGHT_LENGTHS] : [...NIGHT_LENGTHS.filter((s) => s > 0), pick, 0].sort((a, b) => (a || 1e9) - (b || 1e9));
  return choices
    .map((s) => `<option value="${s}" ${pick === s ? 'selected' : ''}>${s === 0 ? 'Relaxed · no timer' : `${clock(s)}${s === DEFAULT_NIGHT_LENGTH ? ' · default' : ''}`}</option>`)
    .join('');
};

/** P3 B16: the head-start picker, only once something is unlocked (full width under the timers). */
export function perkField(vm: TitleVM): string {
  const perks = vm.perks ?? [];
  if (!perks.length) return '';
  const opts = [`<option value="">None</option>`, ...perks.map((p) => `<option value="${p}" ${vm.lastPerk === p ? 'selected' : ''}>${PERKS[p].icon} ${esc(PERKS[p].name)} · ${esc(PERKS[p].effect)}</option>`)];
  return `<label class="fld perk"><span class="lbl">Head start <small>earned in past runs</small></span><select class="inp" name="perk">${opts.join('')}</select></label>`;
}

export function createTitle(
  container: HTMLElement,
  handlers: {
    onStart(choice: StartChoice): void;
    onHost(choice: StartChoice): void;
    onJoin(code: string, name: string): void;
    onResume(): void;
    onRejoin(code: string): void;
    onRecords?(): void;
  },
  roadmap?: RoadmapDrawer,
): { render(vm: TitleVM, settings: LocalSettings, notice?: string): void; show(): void; hide(): void } {
  const q = <T extends HTMLInputElement | HTMLSelectElement>(sel: string) => container.querySelector<T>(sel)!;
  const readChoice = (): StartChoice => {
    const seedRaw = q<HTMLInputElement>('[name=seed]').value.trim();
    const choice: StartChoice = {
      name: q<HTMLInputElement>('[name=name]').value.trim() || 'Barista',
      seed: seedRaw === '' || Number.isNaN(Number(seedRaw)) ? null : Math.floor(Number(seedRaw)),
      pace: Number(container.querySelector<HTMLInputElement>('[name=pace]:checked')?.value ?? 3) as Pace,
      dayLengthSec: Number(q<HTMLSelectElement>('[name=dayLength]').value),
      nightLengthSec: Number(container.querySelector<HTMLSelectElement>('[name=nightLength]')?.value ?? DEFAULT_NIGHT_LENGTH),
    };
    const solo = readSoloBots(container.querySelector<HTMLInputElement>('[name=soloBots]:checked')?.value);
    if (solo !== undefined) choice.soloBots = solo;
    const perk = container.querySelector<HTMLSelectElement>('[name=perk]')?.value;
    return isPerkId(perk) ? { ...choice, perk } : choice;
  };
  onAction(container, (action, el) => {
    if (action === 'resume') handlers.onResume();
    else if (action === 'start') handlers.onStart(readChoice());
    else if (action === 'host') handlers.onHost(readChoice());
    else if (action === 'join') handlers.onJoin(q<HTMLInputElement>('[name=code]').value, readChoice().name);
    else if (action === 'rejoin') handlers.onRejoin(el.dataset.code!);
    else if (action === 'roadmap') roadmap?.open();
    else if (action === 'records') handlers.onRecords?.();
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
            <label class="fld"><span class="lbl">Night length</span><select class="inp" name="nightLength" title="How long you get to plan each night. Relaxed has no timer: the night ends when everyone is ready.">${nightOptions(settings.nightLengthSec)}</select></label>
            ${perkField(vm)}
          </div>
          <div class="row-pace">
            <div class="fld"><span class="lbl">Pace</span>${paceSeg(settings.pace)}</div>
            <div class="fld"><span class="lbl">Solo helpers <small>bots in Play solo</small></span>${soloBotsSeg(settings.soloBots)}</div>
          </div>
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
            <p class="keys-help"><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span> or arrows move · <span class="key">E</span> or <span class="key">Space</span> uses a station · <span class="key">Q</span> drinks an espresso (in hand or at the machine) · <span class="key">R</span> drops what you hold · <span class="key">Esc</span> pauses · <span class="key">M</span> mutes sound</p>
            <p class="ver">CafeTycoon v${esc(APP_VERSION)}</p>
          </details>
        </main>
        <button class="btn recbtn" data-action="records" aria-haspopup="dialog">🏆 Records</button>
        <button class="btn rmbtn" data-action="roadmap" aria-haspopup="dialog"><span class="dot" hidden></span>${roadmapIcon}Roadmap <span class="badge" hidden></span></button>`;
      badge();
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
