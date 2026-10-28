import { esc, hide, onAction, show } from './dom';
import type { WeekEndVM } from './viewModels';

export function createWeekEnd(
  container: HTMLElement,
  handlers: { onContinue(): void; onStop(): void; onBackToTitle(): void },
): { render(vm: WeekEndVM, ended: boolean): void; show(): void; hide(): void } {
  onAction(container, (action) => {
    if (action === 'continue') handlers.onContinue();
    else if (action === 'stop') handlers.onStop();
    else if (action === 'title') handlers.onBackToTitle();
  });
  return {
    render(vm, ended) {
      const heading = vm.bankrupt ? "The café couldn't make rent." : ended ? 'Final score' : 'The week is over';
      const items = vm.itemsBought.length ? vm.itemsBought.map((n) => `<li>${esc(n)}</li>`).join('') : '<li class="muted">Nothing. Bold.</li>';
      const buttons = ended
        ? '<button class="primary" data-action="title">Back to title</button>'
        : vm.isHost
          ? '<button class="primary" data-action="continue">Keep going</button><button data-action="stop">See score &amp; stop</button>'
          : '<span class="muted">Waiting for the host…</span>';
      container.innerHTML = `
        <div class="panel">
          <h2>${heading}</h2>
          <div class="score">${esc(vm.score)}</div>
          <p class="muted">${vm.daysCompleted} day${vm.daysCompleted === 1 ? '' : 's'} · ${vm.customersServed} customers served${
            vm.bestDay ? ` · best day ${vm.bestDay.day} (${esc(vm.bestDay.profit)})` : ''
          } · seed ${vm.seed}</p>
          <h3>Bought</h3>
          <ul class="bought">${items}</ul>
          <div class="row">${buttons}</div>
        </div>`;
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
