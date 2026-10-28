import { esc, hide, show } from './dom';
import { hudStructureKey, type HudVM } from './viewModels';

const SUPPLY_LABEL = { beans: 'Beans', milk: 'Milk', concentrate: 'Cold brew' } as const;
const DRINK_LABEL = { espresso: 'Espresso', latte: 'Latte', coldBrew: 'Cold brew' } as const;

export function createHud(container: HTMLElement): { render(vm: HudVM): void; toast(lines: string[]): void; show(): void; hide(): void } {
  container.innerHTML = '<div class="bar"></div><div class="toast" hidden></div>';
  const bar = container.querySelector<HTMLElement>('.bar')!;
  const toast = container.querySelector<HTMLElement>('.toast')!;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let lastKey = '';
  return {
    render(vm) {
      const key = hudStructureKey(vm);
      if (key === lastKey) {
        bar.querySelector('.clock')!.textContent = vm.clock;
        bar.querySelector('.cash')!.textContent = vm.cash;
        return;
      }
      lastKey = key;
      const phase = vm.phase === 'closing' ? 'Closing' : vm.phase === 'day' ? 'Open' : vm.phase === 'night' ? 'Night' : '';
      bar.innerHTML = `
        <span class="day">${esc(vm.dayLabel)}</span>
        <span class="phase">${phase}</span>
        <span class="clock">${esc(vm.clock)}</span>
        <span class="cash">${esc(vm.cash)}</span>
        <span class="rep">${esc(vm.reputation)}</span>
        <span class="supplies">${vm.supplies.map((s) => `${SUPPLY_LABEL[s.id]} ${s.count}`).join(' · ')}</span>
        <span class="menu">${vm.menu.map((m) => `<span class="${m.available ? '' : 'off'}">${DRINK_LABEL[m.id]} ${esc(m.price)}</span>`).join('')}</span>
        <span class="seed muted small">seed ${vm.seed}</span>`;
    },
    toast(lines) {
      if (lines.length === 0) return;
      toast.innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join('');
      show(toast);
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => hide(toast), 6000);
    },
    show: () => show(container),
    hide: () => hide(container),
  };
}
