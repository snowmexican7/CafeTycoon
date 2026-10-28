import { esc, hide, onAction, show } from './dom';
import type { ClosingVM } from './viewModels';

export function createClosing(container: HTMLElement): { render(vm: ClosingVM): void; show(): void; hide(): void } {
  onAction(container, (action) => {
    if (action === 'continue') hide(container);
  });
  return {
    render(vm) {
      container.innerHTML = `
        <div class="panel">
          <h2>${esc(vm.dayLabel)} closed</h2>
          <table class="stats">
            <tr><td>Served</td><td>${vm.served}</td></tr>
            <tr><td>Stormed out</td><td>${vm.lost}</td></tr>
            <tr><td>Turned away (queue full)</td><td>${vm.turnedAway}</td></tr>
            <tr><td>Sales</td><td>${esc(vm.sales)}</td></tr>
            <tr><td>Tips</td><td>${esc(vm.tips)}</td></tr>
            <tr><td>Rent</td><td>-${esc(vm.rent)}</td></tr>
            <tr class="total"><td>Profit</td><td>${esc(vm.profit)}</td></tr>
            <tr><td>Reputation</td><td>${esc(vm.reputationBefore)} → ${esc(vm.reputationAfter)}</td></tr>
          </table>
          <div class="row"><button class="primary" data-action="continue">Continue</button></div>
        </div>`;
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
