import { describe, expect, it } from 'vitest';
import { createRun } from '../sim/run';
import { nightInputHandlers } from './nightInputs';
import { nightViewModel } from './viewModels';
import { shortTip, tipsVM } from './tipsVM';
import type { PlayerInput } from '../sim/types';

const opening = () => {
  const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 'auto' } });
  s.supplies.beans = 0;
  s.cash = 200;
  return s;
};

describe('crew tips (FB1 WP6)', () => {
  it('shortens the advice to fit a chip', () => {
    expect(shortTip({ kind: 'restock', text: 'Out of beans: buy 2 packs ($16.00)', input: { kind: 'restock', supply: 'beans', packs: 2 } })).toBe('Buy 2 packs of beans');
    expect(shortTip({ kind: 'price', text: 'Cut the Latte to $4.50 (now $4.75)', input: { kind: 'price', drink: 'latte', step: -1 } })).toBe('Cut the Latte to $4.50');
    expect(shortTip({ kind: 'menu', text: "Take the Latte off the board: there's no steamer", input: { kind: 'menu', drink: 'latte', on: false } })).toBe('Take the Latte off the board');
    expect(shortTip({ kind: 'equip', text: '6 walked out to 20 served: buy a second espresso machine ($45), then free a slot for it', input: { kind: 'equip', station: 'espresso' } })).toBe(
      'Buy a second espresso machine ($45)',
    );
  });

  it('skips advice the Heads up list already covers and names the bot that says it', () => {
    const tips = tipsVM(opening());
    expect(tips.length).toBe(2);
    expect(tips.some((t) => t.id === 'restock:beans')).toBe(false); // "Beans stock is out" has its own buy button
    expect(tips.map((t) => [t.by, t.personality])).toEqual([['Lu', 'hurried'], ['Bo', 'steady']]);
    expect(tips.every((t) => t.text.length <= 44)).toBe(true);
  });

  it('dedupes grow and checkout against the brief by id', () => {
    const s = opening();
    const ids = tipsVM(s).map((t) => t.id);
    const blocked = tipsVM(s, ids.map((id) => (id.startsWith('grow:') ? 'grow' : id.startsWith('checkout:') ? 'checkout' : id)));
    // ids that are not grow/checkout/restock are never hidden by an alert of the same name
    expect(blocked.map((t) => t.id)).toEqual(ids.filter((id) => !/^(grow|checkout|restock):/.test(id)));
  });

  it('a chip sends its advice as the local player, and is gone once applied', () => {
    let s = opening();
    const vm = nightViewModel(s, 'p1');
    expect(vm.tips.length).toBeGreaterThan(0);
    const sent: PlayerInput[] = [];
    const tip = vm.tips[0]!;
    nightInputHandlers((i) => sent.push(i), () => 'p1').onTip!(tip.input);
    expect(sent).toEqual([{ ...tip.input, playerId: 'p1' }]);
    if (tip.input.kind === 'price') s = { ...s, priceSteps: { ...(s.priceSteps ?? {}), [tip.input.drink]: tip.input.step } };
    expect(nightViewModel(s, 'p1').tips.map((t) => t.id)).not.toContain(tip.id);
  });

  it('shows nothing without a bot crew', () => {
    const s = opening();
    s.settings = { ...s.settings, bots: 0 };
    expect(tipsVM(s)).toEqual([]);
  });
});

describe('reused AdviceKind rows (3.3.1)', () => {
  it('icons and chip text follow the input, not the shared kind', async () => {
    const { tipIcon } = await import('./tipsVM');
    expect(tipIcon({ kind: 'restock', input: { kind: 'steep', cups: 12 } })).toBe('🧊');
    expect(tipIcon({ kind: 'restock', input: { kind: 'condimentBox', boxes: 2 } })).toBe('🥛');
    expect(tipIcon({ kind: 'restock', input: { kind: 'restock', supply: 'milk', packs: 1 } })).toBe('📦');
    expect(tipIcon({ kind: 'restock', input: { kind: 'branch', action: 'send', supply: 'beans' } })).toBe('🏪');
    expect(tipIcon({ kind: 'rival', input: { kind: 'rivalCounter' } })).toBe('⏰');
    expect(tipIcon({ kind: 'rival', input: { kind: 'stampCard' } })).toBe('🎟️');
    expect(tipIcon({ kind: 'equip', input: { kind: 'staff', action: 'fire' } })).toBe('👋');
    expect(tipIcon({ kind: 'equip', input: { kind: 'gear', action: 'buy', gear: 'grinder' } as never })).toBe('⚙️');
    expect(shortTip({ kind: 'restock', text: 'Steep 12 cold brews for tomorrow (about 10 cold brew orders expected)', input: { kind: 'steep', cups: 12 } })).toBe('Steep 12 cold brews for tomorrow');
    expect(shortTip({ kind: 'restock', text: 'x', input: { kind: 'condimentBox', boxes: 1 } })).toMatch(/^Buy 1 condiment box \(\$\d+\)$/);
    expect(shortTip({ kind: 'restock', text: 'x', input: { kind: 'branch', action: 'send', supply: 'milk' } })).toBe('Send a pack of milk to the branch');
    expect(shortTip({ kind: 'rival', text: "Match Bean Barn's happy hour", input: { kind: 'rivalCounter' } })).toBe('Match the happy hour');
  });

  it('coveredBy knows the Gear and Phase 4 brief alerts', async () => {
    const { coveredBy } = await import('./tipsVM');
    expect(coveredBy('rival:promo')).toEqual(['rival:promo']);
    expect(coveredBy('rival:loyalty')).toEqual(['rival:loyalty']);
    expect(coveredBy('rival')).toEqual([]);
    expect(coveredBy('condimentBox')).toEqual(['condiments']);
    expect(coveredBy('restock:concentrate')).toContain('steep');
    expect(coveredBy('restock:milk')).not.toContain('steep');
    expect(coveredBy('steep')).toEqual([]);
  });
});
