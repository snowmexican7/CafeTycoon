import { describe, it, expect } from 'vitest';
import { catalogueById } from '../data/catalogue';
import { DRINK_IDS, dayUnlocks, recipeChain, suppliesFor } from '../data/drinks';
import { ECONOMY } from '../data/economy';
import { chainFor } from './bots/brain';
import { availableDrinks } from './customers';
import { eligibleItems, applyNightInput } from './night';
import { createRun, startDay, startNight } from './run';
import { interact, stepStations } from './stations';
import { step } from './step';
import type { GameState } from './types';
import { menuDrinks, neededSupplies, unlockDrink } from './unlocks';
import { nightViewModel } from '../ui/viewModels';

const solo = (bots = 0, seed = 3) =>
  createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots, dayLengthSec: 600 } });
const at = (s: GameState, x: number, y: number) => {
  s.players[0].pos = { x, y };
  return s;
};
const huge = { patienceLeft: 10_000, patienceMax: 10_000 };

describe('menu variety: recipes', () => {
  it('builds every drink from the existing stations', () => {
    const chain = (d: Parameters<typeof recipeChain>[0]) => recipeChain(d).map((c) => c.station);
    expect(chain('icedLatte')).toEqual(['grinder', 'espresso', 'coldBrewTap']);
    expect(chain('mocha')).toEqual(['grinder', 'espresso', 'steamer', 'steamer']);
    expect(chain('matcha')).toEqual(['steamer']);
    expect(chain('special')).toEqual(['coldBrewTap', 'steamer']);
    expect(suppliesFor('mocha')).toEqual(['beans', 'milk', 'flavour']);
    expect(suppliesFor('icedLatte')).toEqual(['beans', 'milk']);
    for (const d of DRINK_IDS) expect(ECONOMY.prices[d]).toBeGreaterThan(0);
  });

  it('a latte back on the steamer becomes a mocha and uses a flavour pump', () => {
    const s = startDay(solo());
    unlockDrink(s, 'mocha');
    const flavour = s.supplies.flavour;
    s.players[0].holding = 'latte';
    at(s, 5, 2);
    interact(s, 'p1');
    const steamer = s.stations.find((x) => x.kind === 'steamer')!;
    expect(steamer.making).toBe('mocha');
    expect(steamer.busyTicksLeft).toBe(150);
    expect(s.supplies.flavour).toBe(flavour - 1);
    for (let i = 0; i < 150; i++) stepStations(s);
    expect(steamer.output).toBe('mocha');
  });

  it('a locked recipe does nothing: a latte stays a latte until mocha is known', () => {
    const s = startDay(solo());
    s.players[0].holding = 'latte';
    at(s, 5, 2);
    interact(s, 'p1');
    expect(s.stations.find((x) => x.kind === 'steamer')!.busyTicksLeft).toBe(0);
    expect(s.players[0].holding).toBe('latte');
  });

  it('a shot at the tap makes an iced latte', () => {
    const s = startDay(solo());
    unlockDrink(s, 'icedLatte');
    s.players[0].holding = 'espresso';
    const tap = s.stations.find((x) => x.kind === 'coldBrewTap')!;
    s.players[0].pos = { ...s.players[0].pos };
    const milk = s.supplies.milk;
    // stand at the tap
    for (let x = 0; x < 12; x++) for (let y = 0; y < 8; y++) {
      at(s, x, y);
      if (interact(structuredClone(s), 'p1').stations.find((q) => q.kind === 'coldBrewTap')!.making === 'icedLatte') {
        interact(s, 'p1');
        expect(tap.making).toBe('icedLatte');
        expect(s.supplies.milk).toBe(milk - 1);
        return;
      }
    }
    throw new Error('never reached the tap');
  });
});

describe('menu variety: fancy drinks buy patience', () => {
  it('a mocha customer waits 30% longer than an espresso customer', async () => {
    const { addCustomer } = await import('./customers');
    const s = startDay(solo());
    unlockDrink(s, 'mocha');
    s.supplies.flavour = 10;
    s.menu = { ...s.menu, espresso: false, latte: false, coldBrew: false, mocha: true };
    const moch = addCustomer(s, 'normal')!;
    const e = startDay(solo());
    e.menu = { ...e.menu, latte: false, coldBrew: false };
    const esp = addCustomer(e, 'normal')!;
    expect(moch.drink).toBe('mocha');
    expect(esp.drink).toBe('espresso');
    expect(moch.patienceMax / esp.patienceMax).toBeCloseTo(1.3, 2);
  });
});

describe('menu variety: unlocks', () => {
  it('grows the menu over the week: iced latte on day 3, mocha on day 5', () => {
    expect(dayUnlocks(1)).toEqual(['espresso', 'latte', 'coldBrew']);
    expect(dayUnlocks(3)).toContain('icedLatte');
    expect(dayUnlocks(5)).toEqual(['espresso', 'latte', 'coldBrew', 'icedLatte', 'mocha']);
    const s = solo();
    s.day = 3;
    startNight(s);
    expect(s.unlocked).toContain('icedLatte');
    expect(s.freshDrinks).toEqual(['icedLatte']);
    s.day = 4;
    startNight(s);
    expect(s.freshDrinks).toEqual([]);
    s.day = 5;
    const flavour = s.supplies.flavour;
    startNight(s);
    expect(s.freshDrinks).toEqual(['mocha']);
    expect(s.supplies.flavour).toBe(flavour + ECONOMY.flavourStarter);
    expect(neededSupplies(s)).toContain('flavour');
  });

  it('customers never order a locked drink, and the night menu lists only known drinks', () => {
    const s = startDay(solo());
    expect(availableDrinks(s).every((d) => ['espresso', 'latte', 'coldBrew'].includes(d))).toBe(true);
    expect(nightViewModel(s, 'p1').menu!.map((m) => m.drink)).toEqual(['espresso', 'latte', 'coldBrew']);
    expect(neededSupplies(s)).not.toContain('flavour');
  });

  it('a card unlocks a drink, shows it as new tonight, and is not dealt again', () => {
    const s = solo();
    s.cash = 200;
    s.hand = ['matchaWhisk'];
    applyNightInput(s, { kind: 'buy', playerId: 'p1', itemId: 'matchaWhisk' });
    expect(s.unlocked).toContain('matcha');
    expect(s.freshDrinks).toContain('matcha');
    expect(s.supplies.flavour).toBe(ECONOMY.flavourStarter);
    expect(nightViewModel(s, 'p1').fresh!.map((f) => f.drink)).toEqual(['matcha']);
    expect(eligibleItems(s).some((i) => i.id === 'matchaWhisk')).toBe(false);
    // a cocoa tin is pointless once mocha came by itself
    s.owned = s.owned.filter((o) => o.itemId !== 'matchaWhisk');
    unlockDrink(s, 'mocha');
    expect(eligibleItems(s).some((i) => i.id === 'cocoaTin')).toBe(false);
    expect(catalogueById.seasonalBoard.effects[0]).toEqual({ kind: 'unlock', drink: 'special' });
  });

  it('locked drinks cannot be toggled; the last known drink stays on', () => {
    let s = solo();
    s = step(s, [{ kind: 'menu', playerId: 'p1', drink: 'mocha', on: false }]);
    expect(s.menu.mocha).toBe(true);
    expect(menuDrinks(s)).toEqual(['espresso', 'latte', 'coldBrew']);
    unlockDrink(s, 'mocha');
    s = step(s, [{ kind: 'menu', playerId: 'p1', drink: 'mocha', on: false }]);
    expect(menuDrinks(s)).toEqual(['espresso', 'latte', 'coldBrew']);
  });
});

describe('menu variety: bots and determinism', () => {
  it('chains a mocha through the steamer twice', () => {
    const st = solo();
    unlockDrink(st, 'mocha'); // the planner only chains a drink the machines will make (recipeAt: unlocked, on the menu)
    const ids = chainFor(st, st.players[0], 'mocha', 'serve').map((x) => (x.kind === 'use' ? `${x.station}:${x.action}` : 'idle'));
    expect(ids).toEqual([
      'grinder:insert', 'grinder:take', 'espresso:insert', 'espresso:take',
      'steamer:insert', 'steamer:take', 'steamer:insert', 'steamer:take', 'counter:serve',
    ]);
  });

  it('a bot makes and serves every new drink', () => {
    let s = solo(1, 2);
    s.owned.push({ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] });
    for (const d of ['icedLatte', 'mocha', 'matcha', 'special'] as const) unlockDrink(s, d);
    s.supplies.flavour = 20;
    s = startDay(s);
    s.customers = [
      { id: 901, drink: 'mocha', ...huge }, { id: 902, drink: 'icedLatte', ...huge },
      { id: 903, drink: 'matcha', ...huge }, { id: 904, drink: 'special', ...huge },
    ];
    for (let i = 0; i < 60 * 150 && s.customers.length > 0; i++) s = step(s, []);
    expect(s.customers).toEqual([]);
    expect(s.today.drinks).toMatchObject({ mocha: 1, icedLatte: 1, matcha: 1, special: 1 });
  });

  it('a full week with the new menu is deterministic', () => {
    const play = () => {
      let s = createRun({ seed: 11, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 2, dayLengthSec: 60, nightLengthSec: 2 } });
      s.players[0].connected = false;
      for (let i = 0; i < 60 * 60 * 6 && s.phase !== 'weekEnd' && s.phase !== 'ended'; i++) s = step(s, []);
      return s;
    };
    const a = play();
    const b = play();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.unlocked.length).toBeGreaterThan(3);
  }, 30_000); // a whole simulated week: ~3 s locally, ~6 s on CI runners
});
