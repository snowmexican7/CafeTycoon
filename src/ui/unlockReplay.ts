/**
 * ui-3.10.0: the new-drink unlock replay overlay (see unlockReplayModel.ts). A small bar of the drink's stations, a
 * ghost barista walking the scripted beats, the current step highlighted under it. "Watch again" and "Got it".
 * DOM + CSS transitions only: no sim, no bot brain.
 */
import { esc, hide, onAction, show } from './dom';
import { itemIcon } from './icons';
import { replayCaptions, replayScript, STOP_LABEL, type ReplayScript } from './unlockReplayModel';
import type { DrinkId } from '../sim/types';

const STOP_ICON: Record<string, string> = { grinder: '⚙️', espresso: '☕', steamer: '🥛', coldBrewTap: '🧊', drip: '🫖', supply: '🥛', pickup: '🛎️' };

export interface UnlockReplay {
  /** Queue drinks to replay one after another (no-op for an empty list). `lookup` is a how-to you opened yourself. */
  play(drinks: readonly DrinkId[], kind?: 'new' | 'lookup'): void;
  isOpen(): boolean;
  close(): void;
}

export function createUnlockReplay(container: HTMLElement, opts: { speed?: number } = {}): UnlockReplay {
  const speed = opts.speed ?? 1;
  let queue: DrinkId[] = [];
  let timers: number[] = [];
  let script: ReplayScript | null = null;
  let badge = 'New drink unlocked!';
  const clear = () => {
    timers.forEach((t) => window.clearTimeout(t));
    timers = [];
  };

  function render(s: ReplayScript): void {
    const caps = replayCaptions(s);
    container.innerHTML = `
      <div class="paper menu unlock-replay" role="dialog" aria-modal="true" aria-labelledby="ur-h">
        <div class="ur-hd"><span class="ur-new">${esc(badge)}</span><h2 id="ur-h">${itemIcon(s.drink, 40)} ${esc(s.name)}: how to make it</h2></div>
        <div class="ur-stage" style="--stops:${s.stops.length}">
          ${s.stops.map((st, i) => `<div class="ur-stop" data-i="${i}"><span class="ur-ic" aria-hidden="true">${STOP_ICON[st] ?? '•'}</span><small>${esc(STOP_LABEL[st])}</small></div>`).join('')}
          <div class="ur-ghost" aria-hidden="true"><span class="ur-hand"></span><i class="ur-head"></i><i class="ur-body"></i><span class="ur-e">E</span></div>
        </div>
        <ol class="ur-steps">${caps.map((c, i) => `<li data-i="${i}">${esc(c)}</li>`).join('')}</ol>
        <div class="ur-btns"><button class="btn" data-action="ur-again">Watch again</button><button class="btn primary" data-action="ur-done">${queue.length ? 'Next drink' : 'Got it'}</button></div>
      </div>`;
  }

  function run(s: ReplayScript): void {
    clear();
    const ghost = container.querySelector<HTMLElement>('.ur-ghost')!;
    const hand = container.querySelector<HTMLElement>('.ur-hand')!;
    const items = [...container.querySelectorAll<HTMLElement>('.ur-steps li')];
    const stops = [...container.querySelectorAll<HTMLElement>('.ur-stop')];
    const col = (stop: string) => s.stops.indexOf(stop as never);
    ghost.style.setProperty('--col', '-0.6');
    ghost.dataset.act = 'idle';
    hand.innerHTML = '';
    items.forEach((li) => li.classList.remove('on', 'done'));
    let t = 250;
    let cap = -1;
    for (const step of s.steps) {
      const at = t;
      const capIndex = step.caption ? ++cap : cap;
      timers.push(window.setTimeout(() => {
        const c = col(step.stop);
        ghost.style.setProperty('--col', String(step.act === 'back' ? c + 0.45 : c));
        ghost.style.setProperty('--row', step.act === 'back' ? '1' : '0');
        ghost.dataset.act = step.act;
        stops.forEach((el, i) => el.classList.toggle('on', i === c && step.act !== 'back'));
        hand.innerHTML = step.holding ? itemIcon(step.holding, 26) : '';
        if (step.caption) items.forEach((li, i) => { li.classList.toggle('on', i === capIndex); li.classList.toggle('done', i < capIndex); });
        else items.forEach((li, i) => { li.classList.remove('on'); li.classList.toggle('done', i <= capIndex); });
      }, at / speed));
      t += step.sec * 1000;
    }
    timers.push(window.setTimeout(() => {
      ghost.dataset.act = 'done';
      items.forEach((li) => { li.classList.remove('on'); li.classList.add('done'); });
    }, t / speed));
  }

  function next(): void {
    const d = queue.shift();
    if (!d) return close();
    script = replayScript(d);
    render(script);
    show(container);
    run(script);
    container.querySelector<HTMLElement>('[data-action=ur-done]')?.focus({ preventScroll: true });
  }

  function close(): void {
    clear();
    script = null;
    queue = [];
    hide(container);
  }

  onAction(container, (action) => {
    if (action === 'ur-again' && script) run(script);
    else if (action === 'ur-done') {
      clear();
      if (queue.length) next();
      else close();
    }
  });

  return {
    play(drinks, kind = 'new') {
      if (!drinks.length) return;
      if (kind === 'lookup') {
        clear();
        queue = [...drinks];
        script = null;
        badge = 'How to make it';
        next();
        return;
      }
      badge = 'New drink unlocked!';
      queue.push(...drinks);
      if (!script) next();
    },
    isOpen: () => script !== null,
    close,
  };
}
