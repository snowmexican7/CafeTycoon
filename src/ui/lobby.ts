import { esc, hide, onAction, show } from './dom';
import { logoCup } from './icons';
import { PLAYER_HEX } from './live';
import { storefrontSVG } from './storefront';
import type { LobbyBotsVM, LobbyVM } from './viewModels';

const SEATS = 4;
const BOT_CHOICES = [
  { n: 0, label: 'Off' },
  { n: 1, label: '1' },
  { n: 2, label: '2' },
  { n: 3, label: '3' },
];

/** The paper card with the bots run setting: a segmented Off/1/2/3, read-only for everyone but the host. */
function botsCard(b: LobbyBotsVM): string {
  const note = b.auto
    ? `Auto: bots fill the empty seats (${b.count === 0 ? 'none needed' : `${b.count} now`}).`
    : !b.picked && b.count === 0
      ? 'Off, since you have company. Bots can still help.'
      : b.count === 0
        ? 'Just the humans. Good luck.'
        : `${b.count} bot barista${b.count === 1 ? '' : 's'} will clock in.`;
  const who = b.editable ? '' : '<span class="chip">host picks</span>';
  return `<div class="botscard" data-bots="${b.auto ? 'auto' : b.count}">
    <div class="bots-hd"><span class="lbl">Bot baristas</span>${who}</div>
    <div class="seg" role="radiogroup" aria-label="Bot baristas">${BOT_CHOICES.map(
      (c) =>
        `<label><input type="radio" name="lobby-bots" value="${c.n}" ${c.n === b.count ? 'checked' : ''} ${b.editable ? '' : 'disabled'} aria-label="${c.n === 0 ? 'No bots' : `${c.n} bot${c.n === 1 ? '' : 's'}`}"><span>${c.label}</span></label>`,
    ).join('')}</div>
    <p class="bots-note">${esc(note)}</p>
  </div>`;
}

/** The room screen: the code to share, who is in, and (for the host) the Start button. */
export function createLobby(
  container: HTMLElement,
  handlers: { onStart(): void; onLeave(): void; onBots?(count: number): void },
): { render(vm: LobbyVM): void; show(): void; hide(): void } {
  let code = '';
  onAction(container, (action, el) => {
    if (action === 'start') handlers.onStart();
    else if (action === 'leave') handlers.onLeave();
    else if (action === 'copy') {
      void navigator.clipboard?.writeText(code).then(
        () => (el.textContent = 'Copied!'),
        () => (el.textContent = 'Copy failed'),
      );
    }
  });
  container.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement | null;
    if (el?.name !== 'lobby-bots' || el.disabled) return;
    const n = Number(el.value);
    if (Number.isInteger(n) && n >= 0 && n <= 3) handlers.onBots?.(n);
  });
  return {
    render(vm) {
      code = vm.code;
      const seats = Array.from({ length: Math.max(SEATS, vm.members.length) }, (_, i) => {
        const m = vm.members[i];
        return m
          ? `<li class="seat"><span class="av" style="background:${PLAYER_HEX[i % PLAYER_HEX.length]}">${esc((m[0] ?? '?').toUpperCase())}</span><span>${esc(m)}</span>${i === 0 ? '<span class="chip host">host</span>' : ''}</li>`
          : '<li class="seat empty"><span class="av"></span><span>Open seat</span></li>';
      }).join('');
      const failed = /mismatch|Could not/i.test(vm.statusText);
      container.innerHTML = `
        ${storefrontSVG()}
        <div class="lobby-shade"></div>
        <div class="paper menu lobbycard" role="dialog" aria-labelledby="lob-h">
          <div class="menu-hd"><span class="badge-ic">${logoCup(30)}</span><div><h2 id="lob-h">${vm.isHost ? 'Your room' : 'Joining a room'}</h2>
            <p>${vm.isHost ? 'Friends type this code on the title screen.' : 'Hang tight while we find the café.'}</p></div></div>
          <div class="codebox"><span class="lbl">Room code</span>
            <div class="code" aria-label="Room code ${esc(vm.code.split('').join(' '))}">${vm.code
              .split('')
              .map((c) => `<span>${esc(c)}</span>`)
              .join('')}</div>
            <div class="code-help"><span>Say it out loud: there's no I or O.</span>${vm.isHost ? '<button class="btn ghost small" data-action="copy">Copy code</button>' : ''}</div>
          </div>
          <div class="sec-h">Crew · ${vm.members.length}/${SEATS}</div>
          <ul class="seats">${seats}</ul>
          ${vm.bots ? botsCard(vm.bots) : ''}
          ${vm.statusText ? `<p class="status ${failed ? 'bad' : ''}" role="status"><span class="spin" aria-hidden="true"></span>${esc(vm.statusText)}</p>` : ''}
          <div class="menu-btns row-btns">
            ${vm.canStart ? '<button class="btn primary big" data-action="start">Open the café</button>' : ''}
            <button class="btn ${vm.canStart ? '' : 'big'}" data-action="leave">Leave</button>
          </div>
        </div>`;
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
