import type { AudioSettings } from '../audio/settings';
import type { Pace } from '../sim/types';
import { esc, hide, onAction, show } from './dom';
import { pauseGlyph } from './icons';
import { PLAYER_HEX } from './live';
import { roadmapIcon, type RoadmapDrawer } from './roadmap';
import { dayOptions, paceSeg } from './title';

export interface PauseInfo {
  pace: Pace;
  dayLengthSec: number;
  isHost: boolean;
  room?: { code: string; members: string[] };
  audio: AudioSettings;
}

type Level = 'master' | 'music' | 'sfx';
const LEVELS: [Level, string][] = [
  ['master', 'Master'],
  ['music', 'Music'],
  ['sfx', 'Sound effects'],
];
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Sound settings are per player (this browser only), so they are never host-only. */
export function soundSection(a: AudioSettings): string {
  const sliders = LEVELS.map(
    ([k, label]) => `<label class="fld vol"><span class="lbl">${label}<output data-vol-out="${k}">${pct(a[k])}</output></span>
      <input type="range" class="range" name="vol-${k}" data-vol="${k}" min="0" max="100" step="1" value="${Math.round(a[k] * 100)}" style="--fill:${pct(a[k])}" ${a.muted ? 'data-muted' : ''}></label>`,
  ).join('');
  return `<div class="sec-h">Sound <span class="chip">just you</span></div>
    <label class="switch"><input type="checkbox" name="muted" ${a.muted ? 'checked' : ''}><span class="track" aria-hidden="true"></span><span class="lbl">Mute everything <span class="key">M</span></span></label>
    ${sliders}`;
}

export function createPause(
  container: HTMLElement,
  handlers: {
    onSettings(patch: { pace?: Pace; dayLengthSec?: number }): void;
    onQuit(): void;
    onAudio?(patch: Partial<AudioSettings>): void;
  },
  roadmap?: RoadmapDrawer,
): { render(current: PauseInfo): void; setAudio(a: AudioSettings): void; toggle(): void; show(): void; hide(): void } {
  onAction(container, (action) => {
    if (action === 'resume') hide(container);
    else if (action === 'quit') handlers.onQuit();
    else if (action === 'roadmap') roadmap?.open({ readOnly: true });
  });
  container.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement | HTMLSelectElement;
    if (el.name === 'pace') handlers.onSettings({ pace: Number(el.value) as Pace });
    if (el.name === 'dayLength') handlers.onSettings({ dayLengthSec: Number(el.value) });
    if (el.name === 'muted') handlers.onAudio?.({ muted: (el as HTMLInputElement).checked });
  });
  // Sliders report while dragging; only the slider's own label is patched, never a re-render.
  container.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement;
    const key = el.dataset.vol as Level | undefined;
    if (!key) return;
    const v = Number(el.value) / 100;
    paintLevel(key, v);
    handlers.onAudio?.({ [key]: v });
  });
  const paintLevel = (key: Level, v: number) => {
    const out = container.querySelector<HTMLOutputElement>(`[data-vol-out="${key}"]`);
    const input = container.querySelector<HTMLInputElement>(`[data-vol="${key}"]`);
    if (out) out.textContent = pct(v);
    if (input) {
      if (document.activeElement !== input) input.value = String(Math.round(v * 100));
      input.style.setProperty('--fill', pct(v));
    }
  };
  container.addEventListener('click', (ev) => {
    if (ev.target === container) hide(container);
  });
  const focusResume = () => container.querySelector<HTMLElement>('[data-action=resume]')?.focus();
  return {
    render(current) {
      const dis = current.isHost ? '' : 'disabled';
      const room = current.room
        ? `<div class="roomline"><span class="pill room"><small>ROOM</small><b>${esc(current.room.code)}</b></span>
            <span class="crew">${current.room.members
              .map((m, i) => `<span class="mem"><span class="av" style="background:${PLAYER_HEX[i % PLAYER_HEX.length]}">${esc((m[0] ?? '?').toUpperCase())}</span>${esc(m)}</span>`)
              .join('')}</span></div>`
        : '';
      container.innerHTML = `
        <div class="paper menu pausecard" role="dialog" aria-modal="true" aria-labelledby="pause-h">
          <div class="menu-hd"><span class="badge-ic">${pauseGlyph(22)}</span><div><h2 id="pause-h">Paused</h2>
            <p>The café keeps running while this is open.</p></div></div>
          ${room}
          <div class="sec-h">Settings${current.isHost ? '' : ' <span class="chip">host only</span>'}</div>
          <div class="fld"><span class="lbl">Pace</span>${paceSeg(current.pace, !current.isHost)}</div>
          <label class="fld"><span class="lbl">Day length <em>(from tomorrow)</em></span><select class="inp" name="dayLength" ${dis}>${dayOptions(current.dayLengthSec)}</select></label>
          ${soundSection(current.audio)}
          <div class="menu-btns">
            <button class="btn primary big block" data-action="resume">Back to the café</button>
            <div class="two"><button class="btn" data-action="roadmap">${roadmapIcon}Roadmap</button><button class="btn ghost danger" data-action="quit">Quit to title</button></div>
          </div>
          <p class="hint"><span class="key">Esc</span> closes this menu · <span class="key">M</span> mutes</p>
        </div>`;
      if (!container.hidden) focusResume();
    },
    /** Patch the sound controls in place (e.g. M pressed while the menu is open). */
    setAudio(a) {
      for (const [k] of LEVELS) paintLevel(k, a[k]);
      const box = container.querySelector<HTMLInputElement>('input[name=muted]');
      if (box) box.checked = a.muted;
      container.querySelectorAll<HTMLInputElement>('[data-vol]').forEach((el) => el.toggleAttribute('data-muted', a.muted));
    },
    toggle() {
      if (container.hidden) { show(container); focusResume(); } else hide(container);
    },
    show: () => { show(container); focusResume(); },
    hide: () => hide(container),
  };
}
