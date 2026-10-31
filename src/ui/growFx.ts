import { esc } from './dom';
import type { GainedVM } from './growModel';

/**
 * ui-3.4.0: the grow moment. A quick striped wipe in the new shop's colours with a "Grand re-opening!" banner and
 * confetti (about 1.6 s), then a big "What you gained" card comparing the old size with the new one. The card stays
 * until closed (button, Esc, or a click outside it). Lives on document.body so it sits over the night panel.
 */
export const WIPE_MS = 1600;

const STRIPES: Record<string, [string, string]> = {
  stand: ['#e0564a', '#fff4e2'],
  cart: ['#3f9e80', '#fff4e2'],
  cafe: ['#6b4430', '#f6c35b'],
};
const CONFETTI = ['#e0564a', '#f6c35b', '#3f9e80', '#9fd0ee', '#8a6bbf', '#fff4e2'];

export function gainedCardHtml(vm: GainedVM): string {
  const rows = vm.rows
    .map((r) => `<tr class="${r.tone}"><th>${esc(r.label)}</th><td class="was">${esc(r.from)}</td><td class="arr" aria-hidden="true">→</td><td class="now">${esc(r.to)}${r.tone === 'good' ? ' <span class="up" aria-label="better">▲</span>' : r.tone === 'bad' ? ' <span class="dn" aria-label="costs more">▲</span>' : ''}</td></tr>`)
    .join('');
  const unlocks = vm.unlocks.length ? `<div class="gc-sec">New</div><ul class="gc-unlocks">${vm.unlocks.map((u) => `<li>✨ ${esc(u)}</li>`).join('')}</ul>` : '';
  return `<div class="gc-card paper" role="dialog" aria-modal="true" aria-labelledby="gc-h">
    <button class="gc-x" data-gained-close aria-label="Close">×</button>
    <div class="gc-hd"><span class="gc-ic from" aria-hidden="true">${vm.from.icon}</span><span class="gc-arrow" aria-hidden="true">➜</span><span class="gc-ic to" aria-hidden="true">${vm.to.icon}</span></div>
    <h2 id="gc-h">What you gained</h2>
    <p class="gc-sub">${esc(vm.from.name)} → <b>${esc(vm.to.name)}</b></p>
    <table class="gc-rows"><tbody>${rows}</tbody></table>
    <div class="gc-sec">Who comes by</div>
    <p class="gc-crowd"><span class="was">${esc(vm.crowd.from)}</span><span class="now">${esc(vm.crowd.to)}</span></p>
    ${unlocks}
    <button class="btn primary big block" data-gained-close>Let's go!</button>
  </div>`;
}

export function createGrowFx(): { play(vm: GainedVM): void; close(): void; isOpen(): boolean } {
  const root = document.createElement('div');
  root.id = 'grow-fx';
  root.hidden = true;
  document.body.appendChild(root);
  let timer = 0;
  let open = false;
  const close = () => {
    window.clearTimeout(timer);
    open = false;
    root.hidden = true;
    root.innerHTML = '';
  };
  root.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest('[data-gained-close]') || t === root || t.classList.contains('gc-shade')) close();
  });
  window.addEventListener(
    'keydown',
    (ev) => {
      if (!open) return;
      if (ev.key === 'Escape' || ((ev.key === 'Enter' || ev.key === ' ') && root.querySelector('.gc-card'))) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        close();
      }
    },
    true,
  );
  return {
    play(vm) {
      close();
      open = true;
      const [a, b] = STRIPES[vm.to.id] ?? STRIPES.cafe!;
      const bits = Array.from({ length: 70 }, (_, i) => {
        const x = (i * 37) % 100;
        const d = (i * 53) % 900;
        const rot = (i * 71) % 360;
        const dur = 1300 + ((i * 29) % 900);
        return `<i style="left:${x}%;--d:${d}ms;--r:${rot}deg;--t:${dur}ms;background:${CONFETTI[i % CONFETTI.length]}"></i>`;
      }).join('');
      root.innerHTML = `<div class="gf-wipe" style="--a:${a};--b:${b}"></div>
        <div class="gf-confetti" aria-hidden="true">${bits}</div>
        <div class="gf-banner" role="status"><small>Grand re-opening!</small><b>${vm.to.icon} ${esc(vm.to.name)}</b></div>`;
      root.hidden = false;
      timer = window.setTimeout(() => {
        if (!open) return;
        root.querySelector('.gf-wipe')?.remove();
        root.querySelector('.gf-banner')?.remove();
        root.insertAdjacentHTML('beforeend', `<div class="gc-shade"></div>${gainedCardHtml(vm)}`);
        root.querySelector<HTMLElement>('.gc-card .btn')?.focus();
      }, WIPE_MS);
    },
    close,
    isOpen: () => open,
  };
}
