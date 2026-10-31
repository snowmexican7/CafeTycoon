import { describe, expect, it } from 'vitest';
import { createRun } from '../run';
import { step } from '../step';
import { expectedUse } from '../brief';
import { computeModifiers, rentForDay } from '../effects';
import { restockCost } from '../night';
import { priceForecast } from '../pricing';
import { sigPrice } from '../rival';
import { addStandIns, BOT_IDS, syncBots } from './roster';
import { crewTips, planNight, PLAN_PRIORITY, RESTOCK_MARGIN } from './planner';
import type { Advice } from './planner';
import { CHECKOUT } from '../checkout';
import { TIERS } from '../growth';
import { ECONOMY } from '../../data/economy';
import { RIVAL } from '../rival';
import type { DayStats, DrinkId, GameState, TierId } from '../types';

const run = (tier?: TierId): GameState =>
  createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, ...(tier ? { tier } : {}) });

const dayStats = (over: Partial<DayStats> = {}): DayStats => ({ day: 1, served: 23, lost: 2, turnedAway: 0, sales: 40.84, tips: 3, rent: 25, ...over });

const FULL = { beans: 500, milk: 500, concentrate: 500, flavour: 500, pastry: 500 };

/** Prices settled at the planner's own choice (applied until it has none left to give). */
function settlePrices(s: GameState): GameState {
  for (let i = 0; i < 10; i++) {
    const p = planNight(s).filter((a) => a.kind === 'price');
    if (p.length === 0) break;
    for (const a of p) if (a.input.kind === 'price') s.priceSteps = { ...(s.priceSteps ?? {}), [a.input.drink]: a.input.step };
  }
  return s;
}

/** A night with nothing to do: day 1, stock to spare, settled prices, only rent and a little in the till. */
function quiet(): GameState {
  const s = run();
  s.supplies = { ...FULL };
  s.cash = rentForDay(s) + 5;
  return settlePrices(s);
}

const ids = (s: GameState) => planNight(s).map((a) => a.id);
const find = (s: GameState, id: string) => planNight(s).find((a) => a.id === id);

function spend(s: GameState, a: Advice): number {
  const i = a.input;
  switch (i.kind) {
    case 'restock':
      return restockCost(s, i.supply, i.packs);
    case 'grow':
      return TIERS[i.tier].cost;
    case 'checkout':
      return CHECKOUT[i.checkout].cost;
    case 'scout':
      return RIVAL.scoutCost;
    default:
      return 0;
  }
}

describe('planNight: nothing to do', () => {
  it('gives no advice on a quiet night', () => {
    expect(planNight(quiet())).toEqual([]);
  });
});

describe('planNight: restock', () => {
  it('tops a supply up to the expected use × margin; out of stock is priority 100, low is 90', () => {
    const s = quiet();
    s.cash = 200;
    s.supplies.beans = 0;
    s.supplies.milk = 3;
    const use = expectedUse(s);
    const beans = find(s, 'restock:beans')!;
    expect(beans.priority).toBe(PLAN_PRIORITY.restockOut);
    expect(beans.input).toEqual({ kind: 'restock', supply: 'beans', packs: Math.ceil((use.beans * RESTOCK_MARGIN) / 10) });
    const milk = find(s, 'restock:milk')!;
    expect(milk.priority).toBe(PLAN_PRIORITY.restockLow);
    expect(milk.input).toEqual({ kind: 'restock', supply: 'milk', packs: Math.max(1, Math.ceil((use.milk * RESTOCK_MARGIN - 3) / 10)) });
    expect(find(s, 'restock:concentrate')).toBeUndefined();
  });

  it('only for supplies a drink on the menu needs', () => {
    const s = quiet();
    s.cash = 200;
    s.supplies.concentrate = 0;
    s.menu.coldBrew = false;
    expect(find(s, 'restock:concentrate')).toBeUndefined();
    s.menu.coldBrew = true;
    expect(find(s, 'restock:concentrate')?.priority).toBe(PLAN_PRIORITY.restockOut);
  });

  it('never spends tomorrow’s rent: trims packs, skips what it cannot pay for', () => {
    const s = quiet();
    s.supplies.beans = 0;
    s.supplies.milk = 0;
    s.cash = rentForDay(s) + 17; // two packs of beans ($16), nothing left for milk ($10)
    const plan = planNight(s);
    expect(plan.find((a) => a.id === 'restock:beans')?.input).toEqual({ kind: 'restock', supply: 'beans', packs: 2 });
    expect(plan.find((a) => a.id === 'restock:milk')).toBeUndefined();
    s.cash = rentForDay(s) + 5;
    expect(planNight(s).filter((a) => a.kind === 'restock')).toEqual([]);
  });
});

describe('planNight: price', () => {
  it('picks the step in −2..+4 with the best forecast profit for each drink', () => {
    const s = quiet();
    s.priceSteps = { latte: 4 };
    const m = computeModifiers(s);
    const walkIns = ECONOMY.baseArrivalsPerSecond * s.settings.dayLengthSec * m.traffic;
    const menu: DrinkId[] = ['espresso', 'latte', 'coldBrew'];
    const profitAt = (step: number) => {
      const probe: GameState = { ...s, priceSteps: { ...s.priceSteps, latte: step } };
      return priceForecast(probe, menu, m, walkIns).find((l) => l.drink === 'latte')!.profit;
    };
    const steps = [-2, -1, 0, 1, 2, 3, 4];
    const best = Math.max(...steps.map(profitAt));
    const a = find(s, 'price:latte');
    if (profitAt(4) === best) {
      expect(a).toBeUndefined();
    } else {
      expect(a?.priority).toBe(PLAN_PRIORITY.price);
      expect(a?.input.kind).toBe('price');
      if (a?.input.kind === 'price') expect(profitAt(a.input.step)).toBe(best);
    }
  });

  it('says nothing for a drink already at its best step', () => {
    expect(planNight(quiet()).filter((a) => a.kind === 'price')).toEqual([]);
  });
});

describe('planNight: twists', () => {
  it('sets a known 4–5★ twist when the current one is not', () => {
    const s = quiet();
    s.tasteBook = { 'latte:honey': 5, 'latte:vanilla': 3 };
    s.twists = { latte: 'vanilla' };
    const a = find(s, 'twist:latte')!;
    expect(a.input).toEqual({ kind: 'twist', drink: 'latte', twist: 'honey' });
    expect(a.priority).toBe(PLAN_PRIORITY.twist);
    expect(a.text).toContain('5★');
    s.twists = { latte: 'honey' };
    expect(find(s, 'twist:latte')).toBeUndefined();
  });

  it('drops a known ≤2★ twist', () => {
    const s = quiet();
    s.tasteBook = { 'espresso:cinnamon': 2 };
    s.twists = { espresso: 'cinnamon' };
    expect(find(s, 'twist:espresso')?.input).toEqual({ kind: 'twist', drink: 'espresso', twist: null });
  });

  it('otherwise tries the first untried twist on yesterday’s best seller, and says it is untried', () => {
    const s = quiet();
    s.day = 2;
    s.days.push(dayStats({ drinks: { espresso: 3, latte: 9, coldBrew: 4 } as Record<DrinkId, number> }));
    s.rival = { scouted: 2 };
    s.tasteBook = { 'latte:cinnamon': 3 };
    const a = find(s, 'twist:latte')!;
    expect(a.input).toEqual({ kind: 'twist', drink: 'latte', twist: 'vanilla' });
    expect(a.text).toContain('untried');
    expect(a.text).not.toContain('★');
    expect(find(s, 'twist:espresso')).toBeUndefined();
    // A twist already on and not yet served is being explored: leave it.
    s.twists = { latte: 'seaSalt' };
    expect(find(s, 'twist:latte')).toBeUndefined();
  });

  it('never calls an unknown combo known', () => {
    const s = quiet();
    s.day = 2;
    s.days.push(dayStats({ drinks: { latte: 9 } as Record<DrinkId, number> }));
    s.rival = { scouted: 2 };
    for (const a of planNight(s).filter((x) => x.kind === 'twist' || x.kind === 'signature')) {
      if (a.input.kind === 'twist' && a.input.twist) expect(a.text).toContain('untried');
    }
    expect(find(s, 'signature')).toBeUndefined();
  });
});

describe('planNight: signature', () => {
  it('proposes the best known ≥4★ combo at premium 2 when there is none, name trimmed to 20', () => {
    const s = quiet();
    s.tasteBook = { 'latte:seaSalt': 4, 'coldBrew:vanilla': 5 };
    const a = find(s, 'signature')!;
    expect(a.priority).toBe(PLAN_PRIORITY.signature);
    expect(a.input).toEqual({ kind: 'signature', sig: { name: 'Cold brew Vanilla', drink: 'coldBrew', twist: 'vanilla', premium: 2 } });
    s.tasteBook = { 'latte:seaSalt': 4 };
    const b = find(s, 'signature')!;
    expect(b.input.kind === 'signature' && b.input.sig?.name).toBe('Latte Sea salt');
    s.signature = { name: 'Mine', drink: 'latte', twist: 'seaSalt', premium: 1, since: 1 };
    expect(find(s, 'signature')).toBeUndefined();
  });

  it('trims a long name to 20 characters', () => {
    const s = quiet();
    s.unlocked = ['espresso', 'latte', 'coldBrew', 'matcha'];
    s.menu.matcha = true;
    s.tasteBook = { 'matcha:seaSalt': 5 };
    const a = find(s, 'signature')!;
    expect(a.input.kind === 'signature' && a.input.sig?.name).toBe('Matcha latte Sea sal');
  });
});

describe('planNight: scout', () => {
  const second = () => {
    const s = quiet();
    s.day = 2;
    s.days.push(dayStats());
    s.cash = rentForDay(s) + 20;
    return s;
  };

  it('from day 2 when not scouted tonight and cash covers rent + $20', () => {
    expect(find(second(), 'scout')).toMatchObject({ kind: 'scout', input: { kind: 'scout' }, priority: PLAN_PRIORITY.scout });
  });

  it('not on day 1, not twice a night, not when short', () => {
    const one = quiet();
    one.cash = 200;
    expect(find(one, 'scout')).toBeUndefined();
    const twice = second();
    twice.rival = { scouted: 2 };
    expect(find(twice, 'scout')).toBeUndefined();
    const short = second();
    short.cash = rentForDay(short) + 19.99;
    expect(find(short, 'scout')).toBeUndefined();
  });
});

describe('planNight: rival', () => {
  const copied = (premium: number, price: number) => {
    const s = quiet();
    delete s.priceSteps;
    s.signature = { name: 'Vanilla dream', drink: 'latte', twist: 'vanilla', premium, since: 1 };
    s.rival = { copy: { drink: 'latte', twist: 'vanilla', since: 1, price, day: 4 } };
    return s;
  };

  it('cuts the signature drink’s menu price just enough to match the knock-off', () => {
    const s = copied(2, 5.25); // $4.75 + $1 = $5.75 against $5.25
    const a = find(s, 'rival')!;
    expect(a.priority).toBe(PLAN_PRIORITY.rival);
    expect(a.input).toEqual({ kind: 'price', drink: 'latte', step: -2 });
    expect(planNight(s).filter((x) => x.id === 'price:latte')).toEqual([]);
  });

  it('drops the premium when no menu step gets there', () => {
    const s = copied(4, 5.5); // $6.75; the menu floor (−4) only reaches $5.75
    const a = find(s, 'rival')!;
    expect(a.input).toEqual({ kind: 'signature', sig: { name: 'Vanilla dream', drink: 'latte', twist: 'vanilla', premium: 1 } });
    expect(sigPrice(s, { ...s.signature!, premium: 1 })).toBeLessThanOrEqual(5.5);
  });

  it('nothing when matched, when nothing in bounds reaches it, or when the copy is stale', () => {
    expect(find(copied(2, 5.75), 'rival')).toBeUndefined();
    expect(find(copied(2, 3.5), 'rival')).toBeUndefined();
    const stale = copied(2, 5.25);
    stale.signature!.since = 2;
    expect(find(stale, 'rival')).toBeUndefined();
  });
});

describe('planNight: grow and checkout', () => {
  it('grows when cash covers the cost plus rent', () => {
    const s = run('stand');
    s.supplies = { ...FULL };
    s.day = 2;
    s.days.push(dayStats({ rent: 10 }));
    s.cash = TIERS.cart.cost + rentForDay(s);
    expect(find(s, 'grow:cart')).toMatchObject({ kind: 'grow', input: { kind: 'grow', tier: 'cart' }, priority: PLAN_PRIORITY.grow });
    expect(planNight(s).some((a) => a.kind === 'checkout')).toBe(false);
    s.cash -= 0.01;
    expect(find(s, 'grow:cart')).toBeUndefined();
  });

  it('otherwise buys the next checkout when affordable', () => {
    const s = quiet();
    s.day = 2;
    s.days.push(dayStats());
    s.rival = { scouted: 2 };
    s.cash = CHECKOUT.kiosk.cost + rentForDay(s);
    expect(find(s, 'checkout:kiosk')).toMatchObject({ input: { kind: 'checkout', checkout: 'kiosk' }, priority: PLAN_PRIORITY.checkout });
    s.cash -= 0.01;
    expect(find(s, 'checkout:kiosk')).toBeUndefined();
    s.checkout = { owned: ['register', 'kiosk', 'squarely'], active: 'squarely' };
    s.cash = 500;
    expect(planNight(s).some((a) => a.kind === 'checkout')).toBe(false);
  });
});

describe('planNight: opening night', () => {
  it('no grow, checkout or equip advice before a finished day', () => {
    const s = run('stand');
    s.supplies = { ...FULL };
    s.cash = 500;
    const kinds = planNight(s).map((a) => a.kind);
    expect(kinds).not.toContain('grow');
    expect(kinds).not.toContain('checkout');
    expect(kinds).not.toContain('equip');
    s.days.push(dayStats({ rent: 10, served: 5, lost: 9 }));
    s.day = 2;
    expect(planNight(s).map((a) => a.kind)).toContain('grow');
  });
});

describe('planNight: the board', () => {
  it('switches off a drink the bar has no station for, while at least one other drink stays on', () => {
    const s = run('stand');
    s.supplies = { ...FULL };
    s.cash = rentForDay(s);
    expect(find(s, 'menu:latte')).toMatchObject({ kind: 'menu', input: { kind: 'menu', drink: 'latte', on: false }, priority: PLAN_PRIORITY.menu });
    // one other drink is enough to keep the board alive
    s.menu.coldBrew = false;
    expect(find(s, 'menu:latte')).toMatchObject({ kind: 'menu', input: { kind: 'menu', drink: 'latte', on: false } });
    // the last drink on the board is never advised off, even with no station for it
    s.menu.espresso = false;
    expect(find(s, 'menu:latte')).toBeUndefined();
  });

  it('makes the board honest on a stand with no cold brew tap (espresso, the one drink with a station, stays on)', () => {
    const s = run('stand');
    s.supplies = { ...FULL };
    s.cash = rentForDay(s);
    s.slots = ['grinder', 'espresso', null, 'trash'];
    s.stations = s.stations.filter((x) => x.kind !== 'coldBrewTap');
    expect(planNight(s).filter((a) => a.kind === 'menu').map((a) => a.id)).toEqual(['menu:coldBrew', 'menu:latte']);
  });

  it('keeps it on while the plan grows to a tier that may add the station', () => {
    const s = run('stand');
    s.supplies = { ...FULL };
    s.day = 2;
    s.days.push(dayStats({ rent: 10 }));
    s.cash = TIERS.cart.cost + rentForDay(s);
    const plan = planNight(s);
    expect(plan.some((a) => a.kind === 'grow')).toBe(true);
    expect(plan.some((a) => a.kind === 'menu')).toBe(false);
  });
});

describe('planNight: order, purity, money', () => {
  const busy = (): GameState => {
    const s = run('stand');
    s.day = 2;
    s.days.push(dayStats({ served: 5, lost: 9, drinks: { espresso: 5 } as Record<DrinkId, number> }));
    s.supplies.beans = 0;
    s.supplies.milk = 2;
    s.cash = 240;
    s.tasteBook = { 'espresso:honey': 5 };
    return s;
  };

  it('sorts by priority, highest first, then id', () => {
    const plan = planNight(busy());
    expect(plan.length).toBeGreaterThan(3);
    for (let i = 1; i < plan.length; i++) {
      const [a, b] = [plan[i - 1], plan[i]];
      expect(a.priority > b.priority || (a.priority === b.priority && a.id < b.id)).toBe(true);
    }
  });

  it('is deterministic and does not touch the state', () => {
    const s = busy();
    const before = structuredClone(s);
    const a = planNight(s);
    expect(s).toEqual(before);
    expect(planNight(s)).toEqual(a);
    expect(planNight(structuredClone(before))).toEqual(a);
  });

  it('never proposes spending beyond the cash after rent, in total', () => {
    for (const cash of [0, 12, 30, 60, 95, 140, 240, 400]) {
      const s = busy();
      s.cash = cash;
      const total = planNight(s).reduce((n, a) => n + spend(s, a), 0);
      expect(total).toBeLessThanOrEqual(Math.max(0, cash - rentForDay(s)) + 1e-9);
    }
  });
});

describe('crewTips', () => {
  it('returns nothing without a bot crewmate (stand-ins do not count)', () => {
    const s = run();
    s.supplies.beans = 0;
    s.cash = 200;
    expect(crewTips(s)).toEqual([]);
    addStandIns(s, 2);
    expect(crewTips(s)).toEqual([]);
  });

  it('on the opening night (no bot clocked in yet) voices the tips as the bots the roster will spawn', () => {
    const s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 'auto' } });
    expect(s.players.some((p) => p.bot)).toBe(false);
    s.supplies.beans = 0;
    s.cash = 200;
    expect(planNight(s).length).toBeGreaterThan(0);
    const tips = crewTips(s);
    expect(tips.length).toBe(2);
    expect(tips.map((t) => t.by)).toEqual(['bot-1', 'bot-2']);
    for (const t of tips) expect(BOT_IDS).toContain(t.by);
    s.settings = { ...s.settings, bots: 0 };
    expect(crewTips(s)).toEqual([]);
  });

  it('attributes the top advice round-robin to bots, at most max', () => {
    const s = run();
    s.settings = { ...s.settings, bots: 2 };
    syncBots(s);
    s.supplies.beans = 0;
    s.supplies.milk = 0;
    s.supplies.concentrate = 0;
    s.cash = 200;
    const bots = s.players.filter((p) => p.bot && p.bot.personality !== 'human').map((p) => p.id);
    expect(bots.length).toBe(2);
    const plan = planNight(s);
    const tips = crewTips(s, 3);
    expect(tips.length).toBe(3);
    expect(tips.map((t) => t.by)).toEqual([bots[0], bots[1], bots[0]]);
    expect(tips.map(({ by: _by, ...a }) => a)).toEqual(plan.slice(0, 3));
    expect(crewTips(s).length).toBe(2);
    s.players.find((p) => p.id === bots[0])!.connected = false;
    expect(crewTips(s, 2).map((t) => t.by)).toEqual([bots[1], bots[1]]);
  });
});

describe('planNight: Gear runs', () => {
  // A Gear run replaces the classic stations shop: the `equip` and `slot` inputs do nothing there, so the planner
  // must not offer them as crew tips.
  const gearRun = (): GameState => {
    let s = createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, gear: true, tier: 'stand' });
    for (const gear of ['g1', 'e2'] as const) s = step(s, [{ kind: 'gear', playerId: 'p1', action: 'buy', gear }]);
    s.days.push(dayStats({ served: 3, lost: 9 }));
    s.cash = 300;
    s.supplies = { ...FULL };
    return s;
  };

  it('offers no equip input advice (Round 4 f: the classic shop is gone), even after a day that lost more than it served', () => {
    const s = gearRun();
    expect(s.stations.filter((st) => st.kind === 'espresso')).toHaveLength(1);
    expect(planNight(s).filter((a) => a.input.kind === 'equip')).toEqual([]); // gear buys share the 'equip' advice kind but send `gear`
  });
});
