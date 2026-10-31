/**
 * ui-3.5.2 (Round 4 e): "Make your barista". Shown before day 1 of every new game (solo, hosting or joining a room)
 * and from "Edit my barista" at night. Arrows step through body style, hairstyle, hair colour, skin tone, outfit and
 * shirt colour (src/render/lookModel.ts); the preview is drawn by the shop floor's own drawing code (main.ts passes
 * `createLookPreview`). The look is saved on this device (lookStore.ts) and goes to the sim with the join or the
 * night `look` input. Skip keeps whatever was saved before (or the classic capped barista).
 */
import type { PlayerLook } from '../sim/types';
import { esc } from './dom';
import { DEFAULT_LOOK, LOOK_PARTS, partId, randomLook, stepLook, type LookPart } from '../render/lookModel';

export type CreatorMode = 'start' | 'edit';

export interface CreatorPreview { draw(look: PlayerLook): void; destroy(): void }

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const COLOUR_PARTS: LookPart[] = ['hairColor', 'skin', 'shirtColor'];

/** The creator's markup for a look (pure, for tests). */
export function creatorHtml(look: PlayerLook, mode: CreatorMode): string {
  const rows = LOOK_PARTS.map(({ part, label, options }) => {
    const id = partId(look, part);
    const i = Math.max(0, options.findIndex((o) => o.id === id));
    const opt = options[i];
    const sw = COLOUR_PARTS.includes(part) ? `<span class="cr-sw" style="background:${hex(opt.value as number)}"></span>` : '';
    return `<div class="cr-row" data-part="${part}">
      <span class="cr-lbl">${esc(label)}</span>
      <button class="cr-arrow" data-action="look-step" data-part="${part}" data-dir="-1" aria-label="Previous ${esc(label.toLowerCase())}">◀</button>
      <span class="cr-val">${sw}<b>${esc(opt.name)}</b><small>${i + 1} of ${options.length}</small></span>
      <button class="cr-arrow" data-action="look-step" data-part="${part}" data-dir="1" aria-label="Next ${esc(label.toLowerCase())}">▶</button>
    </div>`;
  }).join('');
  const start = mode === 'start';
  return `<div class="cr-shade"></div>
  <div class="paper creator" role="dialog" aria-modal="true" aria-labelledby="cr-h">
    <div class="cr-hd"><h2 id="cr-h">${start ? 'Make your barista' : 'Edit my barista'}</h2>
      <p>${start ? 'Click the arrows to change each part. You can change it again any night.' : 'Click the arrows to change each part. Your crewmates see your new look too.'}</p></div>
    <div class="cr-body"><div class="cr-preview" aria-hidden="true"></div><div class="cr-rows">${rows}</div></div>
    <div class="cr-btns">
      <button class="btn ghost" data-action="look-random">🎲 Surprise me</button>
      <span class="cr-gap"></span>
      <button class="btn ghost" data-action="look-skip">${start ? 'Skip' : 'Cancel'}</button>
      <button class="btn primary big" data-action="look-done">${start ? 'Looks good, start!' : 'Save my look'}</button>
    </div>
  </div>`;
}

/**
 * The creator overlay. `open` resolves with the chosen look, or null for Skip / Cancel / Esc.
 * Only one is open at a time; opening again closes the last one as a Skip.
 */
export function createCreator(doc: Document, preview?: (host: HTMLElement) => CreatorPreview): {
  open(mode: CreatorMode, start: PlayerLook | null): Promise<PlayerLook | null>;
  isOpen(): boolean;
  close(): void;
} {
  const root = doc.createElement('div');
  root.id = 'creator';
  root.hidden = true;
  doc.body.appendChild(root);
  let finish: ((look: PlayerLook | null) => void) | null = null;
  let look: PlayerLook = DEFAULT_LOOK;
  let mode: CreatorMode = 'start';
  let pv: CreatorPreview | null = null;

  const paint = () => {
    // keep the preview canvas: only the rows and the labels re-render
    const rows = root.querySelector('.cr-rows');
    if (rows) {
      const tmp = doc.createElement('div');
      tmp.innerHTML = creatorHtml(look, mode);
      rows.replaceWith(tmp.querySelector('.cr-rows')!);
    }
    pv?.draw(look);
  };
  const done = (out: PlayerLook | null) => {
    const f = finish;
    finish = null;
    root.hidden = true;
    pv?.destroy();
    pv = null;
    root.innerHTML = '';
    f?.(out);
  };
  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el || !root.contains(el)) return;
    const a = el.dataset.action;
    if (a === 'look-step') {
      look = stepLook(look, el.dataset.part as LookPart, el.dataset.dir === '-1' ? -1 : 1);
      paint();
      root.querySelector<HTMLElement>(`[data-action="look-step"][data-part="${el.dataset.part}"][data-dir="${el.dataset.dir}"]`)?.focus({ preventScroll: true });
    } else if (a === 'look-random') {
      look = randomLook(Math.random);
      paint();
    } else if (a === 'look-done') done(look);
    else if (a === 'look-skip') done(null);
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      done(null);
    }
  });
  return {
    open(m, startLook) {
      if (finish) done(null);
      mode = m;
      look = startLook ?? DEFAULT_LOOK;
      root.innerHTML = creatorHtml(look, mode);
      root.hidden = false;
      const host = root.querySelector<HTMLElement>('.cr-preview');
      if (host && preview) {
        pv = preview(host);
        pv.draw(look);
      }
      root.querySelector<HTMLElement>('[data-action="look-done"]')?.focus({ preventScroll: true });
      return new Promise((resolve) => (finish = resolve));
    },
    isOpen: () => finish !== null,
    close: () => done(null),
  };
}
