import { esc, hide, onAction, show } from './dom';
import type { LobbyVM } from './viewModels';

/** The room screen: the code to share, who is in, and (for the host) the Start button. */
export function createLobby(
  container: HTMLElement,
  handlers: { onStart(): void; onLeave(): void },
): { render(vm: LobbyVM): void; show(): void; hide(): void } {
  onAction(container, (action) => {
    if (action === 'start') handlers.onStart();
    else if (action === 'leave') handlers.onLeave();
  });
  return {
    render(vm) {
      const members = vm.members.length ? vm.members.map((n) => `<span class="pill on">${esc(n)}</span>`).join('') : '<span class="muted">Nobody yet</span>';
      container.innerHTML = `
        <div class="panel">
          <h2>${vm.isHost ? 'Your room' : 'Joining a room'}</h2>
          <div class="code">${esc(vm.code)}</div>
          <p class="muted small">Friends enter this code on the title screen. Say it out loud: there are no I or O.</p>
          <div class="pills">${members}</div>
          ${vm.statusText ? `<p class="status">${esc(vm.statusText)}</p>` : ''}
          <div class="row">
            ${vm.canStart ? '<button class="primary" data-action="start">Start the run</button>' : ''}
            <button data-action="leave">Leave</button>
          </div>
        </div>`;
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
