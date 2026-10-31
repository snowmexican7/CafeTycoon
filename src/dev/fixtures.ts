import { callFor } from '../sim/call';
import { secondsToTicks } from '../sim/constants';
import { judgePitch } from '../sim/pitch';
import { gearStart } from '../sim/gear';
import { isPromoDay } from '../sim/rival';
import { comboStars } from '../sim/taste';
/**
 * Dev-only visual fixtures (served by `vite` at /CafeTycoon/fixtures.html?f=<name>; never in the build).
 * Each fixture fakes a GameState and replays a small timeline into the real Scene and HUD, so the
 * Playwright smoke can screenshot chaos, events and personalities without waiting for the dice.
 */
import '../style.css';
import { LAYOUT, layoutFor } from '../data/layout';
import { createRenderer } from '../render/app';
import { EVENT_FORESHADOW } from '../sim/describe';
import { createRun, startDay, startNight } from '../sim/run';
import { createNight } from '../ui/night';
import type { GameState, SimEvent, TierId } from '../sim/types';
import { defaultSlots, ensureCounterSpots, stationsFromSlots } from '../sim/slots';
import { createClosing } from '../ui/closing';
import { createHud } from '../ui/hud';
import { dayRestockVM } from '../ui/dayRestock';
import { freshEvents, logToastLines, TOAST_KINDS } from '../ui/logToasts';
import { reviewPopVM } from '../ui/feed';
import { hudLive } from '../ui/live';
import { carryTarget } from '../ui/rearrangeCarry';
import { closingViewModel, hudViewModel, nightViewModel, weekEndViewModel } from '../ui/viewModels';
import { createWeekEnd } from '../ui/weekEnd';
import { nightExtras } from '../ui/live';
import { seasonTarget } from '../sim/season';
import { createRecordsDialog } from '../ui/records';
import { awardsFor } from '../sim/awards';
import { blank } from '../sim/stats';
import { emptyRecords, foldRecords } from '../storage/recordsStore';

type Fixture = { setup(s: GameState): void; timeline: [number, (s: GameState) => void][]; me?: string; closing?: boolean; weekEnd?: boolean; unlocks?: string[]; records?: boolean; night?: boolean; extras?: boolean; restock?: boolean; nightToast?: boolean; nightTab?: string; feedPop?: boolean; carry?: boolean };

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const emit = (s: GameState, kind: SimEvent['kind'], data: SimEvent['data'] = {}) => s.log.push({ seq: s.nextLogSeq++, tick: s.tick, kind, data });

function counterLine(s: GameState, active: 'register' | 'kiosk' | 'squarely', n: number): void {
  s.checkout = { owned: active === 'register' ? ['register'] : active === 'kiosk' ? ['register', 'kiosk'] : ['register', 'kiosk', 'squarely'], active };
  const drinks = ['latte', 'espresso', 'coldBrew', 'latte', 'espresso', 'coldBrew', 'latte'] as const;
  for (let i = 0; i < n; i++) s.customers.push({ id: 60 + i, drink: drinks[i], patienceLeft: 1400 - i * 120, patienceMax: 1800 });
}

/** P3 B13: the shop at a tier, the crew inside its floor and a line as long as it allows. */
function atTier(s: GameState, tier: TierId, n: number): void {
  s.tier = tier;
  s.slots = defaultSlots(tier);
  s.stations = stationsFromSlots(tier, s.slots);
  s.mop = { pos: { ...layoutFor(tier).mopHome }, heldBy: null };
  const spots = tier === 'stand' ? [{ x: 1.4, y: 2.2 }, { x: 3, y: 2.3 }, { x: 5, y: 2.2 }, { x: 6.6, y: 4.6 }] : tier === 'cart' ? [{ x: 2, y: 2.3 }, { x: 4, y: 2.3 }, { x: 7, y: 2.4 }, { x: 6.5, y: 4.7 }] : [{ x: 2, y: 2.3 }, { x: 5, y: 2.3 }, { x: 8.5, y: 2.4 }, { x: 6.5, y: 4.7 }];
  s.players.forEach((p, i) => (p.pos = { ...spots[i] }));
  const drinks = tier === 'stand' ? (['espresso', 'coldBrew', 'icedLatte', 'espresso'] as const) : (['latte', 'espresso', 'coldBrew', 'mocha', 'latte', 'icedLatte', 'espresso'] as const);
  s.customers = Array.from({ length: n }, (_, i) => ({ id: 70 + i, drink: drinks[i % drinks.length], patienceLeft: 1300 - i * 110, patienceMax: 1600, ...(i === 1 && tier !== 'stand' ? { kind: 'group' as const } : {}) }));
}

/** P4 B6: a café Gear run with a branch, on the first day its phone rings about `kind`, at the moment it rings. */
function ringing(s: GameState, kind: 'machine' | 'order'): void {
  s.gear = true;
  atTier(s, 'cafe', 4);
  s.branch = { area: 'tourist', staff: 2, openedDay: 1, spent: 300, by: 'Ana' };
  for (let d = 2; d < 200; d++) {
    s.day = d;
    const c = callFor(s);
    if (c?.kind === kind) { s.phaseTicksLeft = secondsToTicks(s.settings.dayLengthSec) - c.ringAt - secondsToTicks(2); return; }
  }
}

function base(): GameState {
  let s = createRun({
    seed: 7,
    hostId: 'ana',
    players: [
      { id: 'ana', name: 'Ana' },
      { id: 'ben', name: 'Ben' },
      { id: 'cleo', name: 'Cleo' },
      { id: 'dev', name: 'Dev' },
    ],
    settings: { bots: 0 },
  });
  s = startDay(s);
  s.phase = 'day';
  s.day = 3;
  const spots = [{ x: 2, y: 3 }, { x: 4, y: 4 }, { x: 8, y: 3 }, { x: 9, y: 5 }];
  s.players.forEach((p, i) => (p.pos = { ...spots[i] }));
  s.customers = [
    { id: 11, drink: 'latte', patienceLeft: 900, patienceMax: 1200 },
    { id: 12, drink: 'espresso', patienceLeft: 400, patienceMax: 1200 },
    { id: 13, drink: 'coldBrew', patienceLeft: 1000, patienceMax: 1200 },
  ];
  return s;
}

/** Seven days played, with a busy, chaotic crew for the awards. */
function weekPlayed(s: GameState): void {
  const served = [14, 19, 22, 18, 27, 24, 31];
  s.days = served.map((n, i) => ({ day: i + 1, served: n, lost: Math.round(n * 0.3), turnedAway: 0, sales: n * 5.2, tips: n * 0.9, rent: 25 + i * 5, perfect: Math.round(n * 0.4), slips: 2 + (i % 3) }));
  s.cash = 412;
  s.day = 7;
  s.phase = 'weekEnd';
  s.owned = [{ itemId: 'streetSign', effects: [] }];
  const row = (id: string, name: string, v: Partial<ReturnType<typeof blank>>, bot = false) => ({ ...blank(id, name, bot), ...v });
  s.players.push({ ...s.players[3], id: 'bot1', name: 'Bo', bot: { personality: 'steady' } } as GameState['players'][number]);
  s.crew = {
    seen: 0,
    players: [
      row('ana', 'Ana', { serves: 52, perfect: 31, earned: 296, handoffs: 9, mopped: 4, rescues: 2, espressos: 3 }),
      row('ben', 'Ben', { serves: 34, perfect: 11, earned: 171, handoffs: 21, slips: 9, messes: 7, catPets: 6, cardsBought: 4 }),
      row('cleo', 'Cleo', { serves: 28, perfect: 9, earned: 140, mopped: 17, alarmsStopped: 2, campersShooed: 3, binned: 5 }),
      row('dev', 'Dev', { serves: 21, perfect: 8, earned: 104, espressos: 11, collapses: 2 }),
      row('bot1', 'Bo', { serves: 20, perfect: 6, earned: 93 }, true),
    ],
  };
}

const FIXTURES: Record<string, Fixture> = {
  /** Block 10: the week-end awards ceremony. */
  weekEnd: { weekEnd: true, setup: weekPlayed, timeline: [] },
  /** P3 B16: the week-end screen naming the head starts the run unlocked. */
  weekEndUnlock: { weekEnd: true, unlocks: ['🪙 Nest egg: +$20 to start', '🥫 Stocked pantry: Start with 10 beans and 10 milk'], setup: weekPlayed, timeline: [] },
  /** Block 11: the night shop with set progress (one Espresso bar card owned), for card-face density checks. */
  night: {
    night: true,
    setup(s) {
      s.cash = 260;
      s.owned = [{ itemId: 'dualBoiler', effects: [] }];
    },
    timeline: [],
  },
  /** P4 B1: a Gear run's night before the rival's week-2 happy hour (the brief warns, with Match it). */
  rivalPromo: {
    night: true,
    setup(s) {
      s.gear = true;
      gearStart(s);
      s.cash = 90;
      const promo = [9, 10, 11, 12, 13, 14].find((d) => isPromoDay(s, d))!;
      s.day = promo; // at night `day` is already tomorrow
    },
    timeline: [],
  },
  /** P4 F2: the night before Starbuck$ launches its loyalty card (the brief offers our stamp card). */
  rivalLoyalty: {
    night: true,
    setup(s) {
      s.gear = true;
      gearStart(s);
      s.cash = 140;
      s.day = 15; // at night `day` is already tomorrow
    },
    timeline: [],
  },
  /** P4 B2: end of week 1 of a Gear run: the screen offers the season. */
  seasonTeaser: { weekEnd: true, setup(s) { weekPlayed(s); s.gear = true; }, timeline: [] },
  /** P4 B2: end of season week 2 (target hit), next week's target in the sub-line. */
  seasonWeek: {
    weekEnd: true,
    setup(s) {
      weekPlayed(s);
      s.gear = true;
      s.unlimited = true;
      s.day = 14;
      s.season = { base: 312, startScore: 600, weeks: [{ week: 1, target: null, profit: 312 }, { week: 2, target: seasonTarget(312, 2), profit: 338.5 }] };
    },
    timeline: [],
  },
  /** P4 B2: the season is over (silver: two of three targets hit). */
  seasonDone: {
    weekEnd: true,
    setup(s) {
      weekPlayed(s);
      s.gear = true;
      s.unlimited = true;
      s.day = 28;
      s.season = { base: 312, startScore: 900, done: true, weeks: [{ week: 1, target: null, profit: 312 }, { week: 2, target: 310, profit: 338.5 }, { week: 3, target: 360, profit: 291 }, { week: 4, target: 405, profit: 420 }] };
    },
    timeline: [],
  },
  /** P4 B2: a season night: the header chip shows the week's target and progress. */
  seasonNight: {
    night: true,
    extras: true,
    setup(s) {
      s.gear = true;
      gearStart(s);
      s.cash = 160;
      s.unlimited = true;
      s.day = 10;
      s.season = { base: 60, startScore: 20, weeks: [{ week: 1, target: null, profit: 60 }] };
    },
    timeline: [],
  },
  /** P4 B3: the night after a busy Gear day, for the manager's report drawer (click 📋 Report). */
  managerReport: {
    night: true,
    extras: true,
    setup(s) {
      s.gear = true;
      gearStart(s);
      s.cash = 240;
      const base = { served: 30, lost: 5, turnedAway: 0, sales: 120, tips: 22, rent: 25 };
      s.days = [1, 2, 3].map((day) => ({ ...base, day, waitTicks: 30 * 14 * 60 }));
      s.day = 5;
      s.players.push({ ...s.players[0]!, id: 'bot1', name: 'Bo', bot: { personality: 'steady' } } as GameState['players'][number]);
      Object.assign(s.today, {
        day: 4, served: 41, lost: 12, turnedAway: 2, sales: 168.5, tips: 31.2, rent: 25, wages: 24, soldOutWalkouts: 0,
        waitTicks: 41 * 21 * 60,
        drinks: { latte: 19, espresso: 9, coldBrew: 8, cappuccino: 5 },
        takingsByDrink: { latte: 98.4, espresso: 31.5, coldBrew: 41.6, cappuccino: 28.2 },
        byPlayer: { ana: { serves: 15, takings: 76.1 }, ben: { serves: 11, takings: 52.3 }, bot1: { serves: 9, takings: 41.8 }, cleo: { serves: 6, takings: 29.5 } },
      });
    },
    timeline: [],
  },
  /** P4 B4: café tier with cash in the till: the "Open a 2nd shop" drawer. */
  branchPick: {
    night: true,
    extras: true,
    setup(s) {
      s.gear = true;
      gearStart(s);
      s.tier = 'cafe';
      s.cash = 420;
      s.day = 8;
      s.days = [1, 2, 3, 4, 5, 6].map((day) => ({ day, served: 40, lost: 5, turnedAway: 0, sales: 170, tips: 26, rent: 25 }));
      Object.assign(s.today, { day: 7, served: 44, lost: 6, turnedAway: 0, sales: 190, tips: 30, rent: 25, wages: 20 });
    },
    timeline: [],
  },
  /** P4 B4: a running second shop in the Gym strip, with yesterday's result. */
  branchRunning: {
    night: true,
    extras: true,
    setup(s) {
      s.gear = true;
      gearStart(s);
      s.tier = 'cafe';
      s.cash = 310;
      s.day = 11;
      s.days = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((day) => ({ day, served: 40, lost: 5, turnedAway: 0, sales: 170, tips: 26, rent: 25 }));
      s.branch = { area: 'gym', staff: 2, openedDay: 8, spent: 300, by: 'Ana' };
      Object.assign(s.today, { day: 10, served: 46, lost: 4, turnedAway: 0, sales: 201, tips: 33, rent: 25, wages: 20, branch: { served: 21, walked: 3, takings: 99.96, costs: 63.4, profit: 36.56 } });
    },
    timeline: [],
  },
  /** P4 B6: mid-day, the second shop rings (machine broke / big order). */
  branchCall: { setup: (s) => ringing(s, 'machine'), timeline: [] },
  branchCallOrder: { setup: (s) => ringing(s, 'order'), timeline: [] },
  /** P4 B5: the branch with a Manager picked, stock credit there, and a report that lists it. */
  branchManaged: {
    night: true,
    extras: true,
    setup(s) {
      s.gear = true;
      gearStart(s);
      s.tier = 'cafe';
      s.cash = 280;
      s.day = 12;
      s.supplies = { ...s.supplies, beans: 14, milk: 6, concentrate: 0, flavour: 3 };
      s.branch = { area: 'tourist', staff: 3, openedDay: 8, spent: 300, by: 'Ana', stockCredit: 6.4 };
      s.days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((day) => ({ day, served: 40, lost: 5, turnedAway: 0, sales: 170, tips: 26, rent: 25, waitTicks: 40 * 14 * 60 }));
      Object.assign(s.today, { day: 11, served: 47, lost: 3, turnedAway: 0, sales: 205, tips: 35, rent: 25, wages: 20, waitTicks: 47 * 15 * 60, branch: { served: 30, walked: 2, takings: 142.8, costs: 79.1, profit: 63.7, fromStock: 8 } });
    },
    timeline: [],
  },
  /** ui-3.7.1: the plain night shop: no crew roles, no card re-roll, no Stations board. */
  nightPlain: {
    night: true,
    setup(s) {
      s.cash = 260;
      s.ready = ['cleo'];
    },
    timeline: [],
  },
  /** ui-3.7.1: the day HUD's Restock panel open on a Gear run, beans running low, after Ben rush-ordered milk. */
  restockDay: {
    restock: true,
    setup(s) {
      s.gear = true;
      gearStart(s);
      atTier(s, 'cart', 4);
      s.cash = 64;
      s.supplies = { ...s.supplies, beans: 3, milk: 12, concentrate: 8, flavour: 6, pastry: 2 };
      s.condiments = { servings: 6 };
      emit(s, 'restock.rush', { by: 'ben', supply: 'milk', packs: 1, cost: 8.75 });
    },
    timeline: [],
  },
  /** ui-3.7.1: the end-of-day receipt with the cart affordable (Grow is on the receipt now). */
  receiptGrow: {
    closing: true,
    setup(s) {
      atTier(s, 'stand', 0);
      s.cash = 128;
      s.today = { ...s.today, served: 24, lost: 2, turnedAway: 3, sales: 104.2, tips: 10.4, rent: 10 };
    },
    timeline: [],
  },
  /** ui-3.7.1: a Strategist hired: the Menu tab steps back with its note, and the bubble about tonight's menu change. */
  strategist: {
    night: true,
    nightToast: true,
    nightTab: 'menu',
    setup(s) {
      atTier(s, 'cafe', 0);
      s.cash = 240;
      s.day = 4;
      s.staff = { strategist: true };
    },
    timeline: [],
  },
  /** Review Block 6: soft open gate — Gear night with no machines, so nothing is makeable. Clicks Open to show the warn dialog. */
  softOpen: {
    night: true,
    setup(s) {
      s.gear = true;
      s.cash = 120;
      s.day = 1;
      s.slots = defaultSlots('stand').map(() => null);
      s.stations = stationsFromSlots('stand', s.slots);
      s.slotGear = (s.slotGear ?? []).map(() => null);
      for (const d of Object.keys(s.menu) as (keyof typeof s.menu)[]) s.menu[d] = false;
    },
    timeline: [],
  },
  /** Review Block 6: morning note on the day HUD (auto-dismisses). */
  morningNote: {
    setup(s) {
      s.gear = true;
      gearStart(s);
      atTier(s, 'cafe', 2);
      s.morningNotes = ['Flyers are up (+10% walk-ins today).', 'A Strategist would tighten tomorrow\'s prices.'];
      s.today = { ...s.today, day: 3, served: 41, lost: 2, turnedAway: 1, sales: 188.4, tips: 21.5, rent: 25 };
    },
    timeline: [],
  },
  /** 3.7.2 (PR #10): two price walk-outs on a Gear café day say "Too pricey!" (or kin), never "Sold out?!". */
  priceWalkout: {
    setup(s) {
      s.gear = true;
      gearStart(s);
      atTier(s, 'cafe', 4);
      for (let i = 0; i < 3; i++) s.customers.push({ id: 40 + i, drink: i % 2 ? 'latte' : 'drip', patienceLeft: 800, patienceMax: 1000 });
    },
    timeline: [
      [0.3, (s) => emit(s, 'walkout', { customer: 90, reason: 'price', drink: 'latte' })],
      [1.1, (s) => emit(s, 'walkout', { customer: 91, reason: 'price', drink: 'mocha' })],
    ],
  },
  /**
   * Round 3 item 5: Gear café, Ana mid-ring at the till — the progress bar reads ~50% over the register
   * (and the live hint still says "Ringing up…").
   */
  ringUp: {
    me: 'ana',
    setup(s) {
      s.gear = true;
      gearStart(s);
      atTier(s, 'cafe', 3);
      const till = s.stations.find((x) => x.id === 'counter')!;
      s.players[0].pos = { x: till.pos.x, y: till.pos.y - 1 };
      s.players[0].holding = null;
      s.customers = [
        { id: 901, drink: 'latte', patienceLeft: 1100, patienceMax: 1400 },
        { id: 902, drink: 'espresso', patienceLeft: 900, patienceMax: 1400 },
        { id: 903, drink: 'mocha', patienceLeft: 800, patienceMax: 1400 },
      ];
      s.ringUp = { customer: 901, by: 'ana', startedAt: s.tick - 45, ticks: 90 };
      emit(s, 'till.start', { customer: 901, by: 'ana', seconds: 1.5 });
    },
    timeline: [
      [0.8, (s) => { if (s.ringUp) s.tick = s.ringUp.startedAt + 60; }],
      [1.6, (s) => { if (s.ringUp) s.tick = s.ringUp.startedAt + 75; }],
    ],
  },
  /**
   * Round 3 items 4 + 5: café waiting-area browsers, a "Line's too long!" bubble, then a tumbleweed
   * on a quiet leave. Self-order Squarely beat shows the honey ring bar.
   */
  waitingLine: {
    me: 'ana',
    setup(s) {
      s.gear = true;
      gearStart(s);
      atTier(s, 'cafe', 6);
      s.checkout = { owned: ['register', 'kiosk', 'squarely'], active: 'squarely' };
      s.customers = Array.from({ length: 6 }, (_, i) => ({
        id: 70 + i,
        drink: (['latte', 'espresso', 'mocha', 'drip', 'cappuccino', 'americano'] as const)[i],
        patienceLeft: 1000 - i * 40,
        patienceMax: 1400,
      }));
      s.waiting = [
        { id: 80, drink: 'latte', patienceLeft: 900, patienceMax: 1200 },
        { id: 81, drink: 'coldBrew', patienceLeft: 700, patienceMax: 1200 },
        { id: 82, drink: 'mocha', patienceLeft: 500, patienceMax: 1200 },
        { id: 83, drink: 'espresso', patienceLeft: 400, patienceMax: 1200 },
      ];
      s.line = { front: 70, since: s.tick - 800, complainedAt: s.tick - 10 };
      s.ringUp = { customer: 70, by: '', startedAt: s.tick - 20, ticks: 60 };
    },
    timeline: [
      [0.4, (s) => emit(s, 'line.complain', { customer: 75 })],
      [1.2, (s) => emit(s, 'line.leave', { customer: 200, quiet: true })],
      [2.0, (s) => emit(s, 'line.leave', { customer: 201, quiet: true })],
    ],
  },
  /** Round 3 item 4: closing receipt with people who left when the line looked too long. */
  lineLeftReceipt: {
    closing: true,
    setup(s) {
      s.gear = true;
      gearStart(s);
      atTier(s, 'cafe', 0);
      s.today = { ...s.today, served: 28, lost: 1, turnedAway: 2, sales: 132, tips: 16, rent: 25, lineLeft: 3, slips: 1 };
    },
    timeline: [],
  },
  /** 3.7.2 (PR #8) + review Block 6: Strategist/Marketer hire cards high on Tonight; Strategist on, Marketer not. */
  hireCards: {
    night: true,
    setup(s) {
      s.gear = true;
      gearStart(s);
      atTier(s, 'cafe', 0);
      s.cash = 240;
      s.day = 4;
      s.staff = { strategist: true };
    },
    timeline: [],
  },
  /**
   * FB2 B7 rest: Gear café with a live tray list on the table (Ada, 2/3 done + cooling), Ben carrying a tray,
   * a tray coaster with a name on pickup, and a refuse bubble.
   */
  trayTable: {
    setup(s) {
      s.gear = true;
      gearStart(s);
      atTier(s, 'cafe', 3);
      ensureCounterSpots(s); // tray table / syrups / sink / fridge after atTier rebuilds the floor
      const lay = layoutFor(s.tier);
      s.customers = [
        {
          id: 21,
          drink: 'latte',
          patienceLeft: 1400,
          patienceMax: 1800,
          name: 'Ada',
          stage: 'pickup',
          rungAt: s.tick,
          order: 'combo',
          items: [
            { drink: 'latte', done: false },
            { drink: 'espresso', done: false },
            { drink: 'mocha', done: false },
          ],
        },
        {
          id: 22,
          drink: 'latte',
          patienceLeft: 1200,
          patienceMax: 1600,
          name: 'Ravi',
          stage: 'pickup',
          rungAt: s.tick,
          order: 'office',
          items: [
            { drink: 'latte', done: false },
            { drink: 'cappuccino', done: false },
          ],
        },
        { id: 23, drink: 'drip', patienceLeft: 900, patienceMax: 1400, stage: 'order' },
      ];
      // live tray on the table: latte + espresso on, mocha still open
      s.tray = {
        customer: 21,
        items: [
          { drink: 'latte', done: true, madeAt: s.tick - 20 * 60, by: 'ana' },
          { drink: 'espresso', done: true, madeAt: s.tick - 5 * 60, by: 'ana' },
          { drink: 'mocha', done: false },
        ],
      };
      // Ben carries Ravi's finished tray toward pickup
      const ben = s.players[1]!;
      ben.pos = { x: lay.pickup.x - 0.4, y: lay.pickup.y - 1.1 };
      ben.tool = 'tray';
      ben.holding = null;
      ben.tray = {
        customer: 22,
        items: [
          { drink: 'latte', done: true, madeAt: s.tick - 10 * 60, by: 'ben' },
          { drink: 'cappuccino', done: true, madeAt: s.tick - 8 * 60, by: 'ben' },
        ],
      };
      // Ana at the tray table with a drink that will refuse
      const ana = s.players[0]!;
      ana.pos = { x: lay.trayTable.x + 1, y: lay.trayTable.y };
      ana.holding = 'coldBrew';
      // a tray coaster already on pickup for a third ticket (name tag)
      s.pass = [
        {
          item: 'mocha',
          ticksLeft: 9999,
          by: 'cleo',
          tray: {
            customer: 24,
            drinks: [
              { drink: 'mocha', madeAt: s.tick - 15 * 60, by: 'cleo' },
              { drink: 'latte', madeAt: s.tick - 12 * 60, by: 'cleo' },
            ],
          },
        },
        { item: 'drip', ticksLeft: 40 * 60, by: 'dev', madeAt: s.tick },
      ];
      s.customers.push({
        id: 24,
        drink: 'mocha',
        patienceLeft: 1100,
        patienceMax: 1500,
        name: 'June',
        stage: 'pickup',
        rungAt: s.tick,
        order: 'combo',
        items: [
          { drink: 'mocha', done: false },
          { drink: 'latte', done: false },
        ],
      });
      // Cleo near the syrups so the floor isn't empty
      s.players[2]!.pos = { x: 3.2, y: 5.2 };
      s.players[3]!.pos = { x: 8.5, y: 3.5 };
    },
    timeline: [
      [0.4, (s) => emit(s, 'tray.refuse', { drink: 'coldBrew', by: 'ana', customer: 21 })],
      [1.2, (s) => emit(s, 'tray.add', { drink: 'mocha', by: 'ana', customer: 21 })],
    ],
  },
  /** FB2 C10: Gear morning pre-open — countdown, Ready / Open doors, Ana near a movable machine. */
  preOpen: {
    setup(s) {
      s.gear = true;
      gearStart(s);
      atTier(s, 'cafe', 0);
      s.customers = [];
      s.preOpenUntil = s.tick + secondsToTicks(12);
      s.ready = [];
      const machine = s.stations.find((x) => x.kind === 'drip' || x.kind === 'espresso' || x.kind === 'grinder');
      if (machine) s.players[0]!.pos = { x: machine.pos.x, y: machine.pos.y + 1 };
    },
    timeline: [
      [0.8, (s) => emit(s, 'station.place', { by: 'ana', station: 'espresso', to: { x: 3, y: 2 }, swapped: false })],
      [1.6, (s) => emit(s, 'station.refuse', { by: 'ana', station: 'espresso' })],
      [2.4, (s) => emit(s, 'station.reset')],
    ],
  },
  /** FB2 B8: hand-made lattes — jug filling, steam meter, syrup rack, double/syrup tickets. */
  handmade: {
    setup(s) {
      s.gear = true;
      gearStart(s);
      atTier(s, 'cafe', 3);
      // A café with a built-in wand so the syrup rack is on the floor.
      const slots = [...(s.slots ?? [])];
      const slotGear = [...(s.slotGear ?? [])];
      const e5 = slots.findIndex((k) => k === 'espresso');
      if (e5 >= 0) { slots[e5] = 'espresso'; slotGear[e5] = 'e5'; }
      else { slots[0] = 'espresso'; slotGear[0] = 'e5'; }
      s.slots = slots;
      s.slotGear = slotGear;
      s.stations = stationsFromSlots(s.tier, slots, slotGear);
      ensureCounterSpots(s); // the syrup rack (and the other fixed spots) come back with the rebuild
      s.supplies = { ...s.supplies, beans: 20, milk: 16, flavour: 8, concentrate: 10 };
      s.milkOut = 8;
      s.customers = [
        { id: 21, drink: 'latte', patienceLeft: 1100, patienceMax: 1400, shots: 2, syrup: 'vanilla', kind: 'regular', name: 'Ada' },
        { id: 22, drink: 'cappuccino', patienceLeft: 900, patienceMax: 1400, shots: 2 },
        { id: 23, drink: 'latte', patienceLeft: 1000, patienceMax: 1400, syrup: 'caramel' },
      ];
      const ana = s.players[0]!;
      const wand = s.stations.find((st) => st.kind === 'steamer') ?? s.stations.find((st) => st.kind === 'espresso')!;
      const rack = s.stations.find((st) => st.id === 'syrups');
      ana.pos = { x: wand.pos.x, y: wand.pos.y + 1 };
      ana.holding = 'espresso';
      ana.made = { shots: 2 };
      ana.jug = { fill: 0.55, startedAt: s.tick - 60, line: 0.6, done: true };
      const ben = s.players[1];
      if (ben && rack) {
        ben.pos = { x: rack.pos.x, y: rack.pos.y + 1 };
        ben.holding = 'latte';
      }
    },
    timeline: [
      [0.4, (s) => emit(s, 'milk.fill', { by: 'ana', level: 0.58, line: 0.6, grade: 'right' })],
      [1.0, (s) => {
        const ana = s.players[0]!;
        const wand = s.stations.find((st) => st.kind === 'steamer');
        if (wand) ana.steam = { startedAt: s.tick, speed: 1, station: wand.id };
        delete ana.jug;
      }],
      [1.4, (s) => emit(s, 'steam.result', { by: 'ana', grade: 'perfect' })],
      [2.0, (s) => emit(s, 'syrup.add', { by: 'ben', flavour: 'caramel' })],
      [2.6, (s) => emit(s, 'syrup.miss', { customer: 23 })],
    ],
  },
  /** ui-3.8.0 review: the pre-open with Ana mid-carry (ghost outlines on every valid tile). */
  preOpenCarry: {
    carry: true,
    setup(s) {
      FIXTURES.preOpen!.setup(s);
    },
    timeline: [],
  },
  /** ui-3.8.0 review: Ana at the syrup rack with a latte, so the 1 / 2 syrup picker is up. */
  syrupPick: {
    setup(s) {
      FIXTURES.handmade!.setup(s);
      const ana = s.players[0]!;
      const rack = s.stations.find((st) => st.id === 'syrups');
      if (rack) ana.pos = { x: rack.pos.x, y: rack.pos.y + 1 };
      ana.holding = 'latte';
      ana.made = { shots: 2 };
      delete ana.jug;
      delete ana.steam;
    },
    timeline: [],
  },
  /** P3 B2: the night menu board with prices moved (latte up $1, espresso down $0.50). */
  pricing: {
    night: true,
    setup(s) {
      s.cash = 260;
      s.priceSteps = { latte: 4, espresso: -2 };
    },
    timeline: [],
  },
  /** P3 B3: regulars on the night board: Ada loyal, Ravi's cold brew off the menu, June's latte pricey. */
  regulars: {
    night: true,
    setup(s) {
      s.cash = 260;
      s.regulars = [
        { name: 'Ada', drink: 'espresso', visits: 6, lost: 0, loyalty: 4 },
        { name: 'Ravi', drink: 'coldBrew', visits: 3, lost: 1, loyalty: 2 },
        { name: 'June', drink: 'latte', visits: 2, lost: 0, loyalty: 1 },
      ];
      s.menu.coldBrew = false;
      s.priceSteps = { latte: 4 };
    },
    timeline: [],
  },
  /** P3 B4: fresh stock: last night 4 milk and 3 pastries went off; a Manager is on the crew tonight. */
  spoilage: {
    night: true,
    setup(s) {
      s.cash = 180;
      s.day = 2;
      s.today = { day: 1, served: 22, lost: 3, turnedAway: 0, sales: 118.5, tips: 19.2, rent: 25, pastries: 4, spoiled: { milk: 4, pastry: 3 }, spoiledValue: 7.5 };
      s.supplies = { ...s.supplies, milk: 9, pastry: 3 };
    },
    timeline: [],
  },
  /** P3 B5: recipe accuracy on the night receipt. */
  accuracy: {
    night: true,
    setup(s) {
      s.cash = 170;
      s.day = 2;
      s.today = { day: 1, served: 22, lost: 2, turnedAway: 0, sales: 116, tips: 17.4, rent: 25, cups: 22, cupStars: 53, perfectCups: 12 };
    },
    timeline: [],
  },
  /** P3 B6: the taste notebook mid-run, a few combos found last night, twists set for tomorrow. */
  taste: {
    night: true,
    setup(s) {
      s.cash = 190;
      s.day = 2;
      s.tasteBook = {
        [`latte:vanilla`]: comboStars(s.seed, 'latte', 'vanilla'),
        [`latte:cinnamon`]: comboStars(s.seed, 'latte', 'cinnamon'),
        [`espresso:seaSalt`]: comboStars(s.seed, 'espresso', 'seaSalt'),
        [`coldBrew:honey`]: comboStars(s.seed, 'coldBrew', 'honey'),
      };
      s.twists = { latte: 'vanilla', espresso: 'honey' };
      s.today = { day: 1, served: 24, lost: 2, turnedAway: 0, sales: 124, tips: 21.3, rent: 25, combosFound: ['latte:cinnamon', 'coldBrew:honey'], comboStarSum: 3, twistCost: 2.8 };
    },
    timeline: [],
  },
  /** P3 B7: a named signature on the board, last night's sales and star bonus on the receipt. */
  signature: {
    night: true,
    setup(s) {
      s.cash = 214;
      s.day = 2;
      s.tasteBook = {
        [`latte:vanilla`]: comboStars(s.seed, 'latte', 'vanilla'),
        [`latte:cinnamon`]: comboStars(s.seed, 'latte', 'cinnamon'),
        [`espresso:seaSalt`]: comboStars(s.seed, 'espresso', 'seaSalt'),
        [`coldBrew:honey`]: comboStars(s.seed, 'coldBrew', 'honey'),
      };
      s.twists = { latte: 'vanilla' };
      s.signature = { name: 'Midnight Cinnamon', drink: 'latte', twist: 'cinnamon', premium: 3, since: 1 };
      s.today = { day: 1, served: 26, lost: 1, turnedAway: 0, sales: 141, tips: 24.6, rent: 25, combosFound: ['latte:cinnamon'], comboStarSum: 4, twistCost: 3.2, sigServed: 6, sigStarSum: 24, sigBonus: 4.5 };
    },
    timeline: [],
  },
  /** P3 B8: a taste season turning tomorrow (day 4): last season's notebook reads stale, the paper tips the riser. */
  seasons: {
    night: true,
    setup(s) {
      s.cash = 236;
      s.day = 4;
      s.tasteBook = {
        [`latte:vanilla`]: comboStars(s.seed, 'latte', 'vanilla'),
        [`latte:cinnamon`]: comboStars(s.seed, 'latte', 'cinnamon'),
        [`latte:honey`]: comboStars(s.seed, 'latte', 'honey'),
        [`espresso:seaSalt`]: comboStars(s.seed, 'espresso', 'seaSalt'),
        [`coldBrew:honey`]: comboStars(s.seed, 'coldBrew', 'honey'),
      };
      s.twists = { latte: 'cinnamon', espresso: 'seaSalt' };
      s.today = { day: 3, served: 27, lost: 1, turnedAway: 0, sales: 146, tips: 25.2, rent: 25, comboStarSum: 6, twistCost: 3.6 };
    },
    timeline: [],
  },
  /** P3 B9: Starbuck$ scouted tonight, with a live knock-off of the signature undercutting it. */
  rival: {
    night: true,
    setup(s) {
      s.cash = 252;
      s.day = 5;
      s.tasteBook = {
        [`latte:cinnamon`]: comboStars(s.seed, 'latte', 'cinnamon'),
        [`latte:vanilla`]: comboStars(s.seed, 'latte', 'vanilla'),
        [`espresso:seaSalt`]: comboStars(s.seed, 'espresso', 'seaSalt'),
      };
      s.signature = { name: 'Midnight Cinnamon', drink: 'latte', twist: 'cinnamon', premium: 3, since: 1 };
      s.rival = { scouted: 5, copy: { drink: 'latte', twist: 'cinnamon', since: 1, price: 5.75, day: 4 } };
      s.today = { day: 4, served: 25, lost: 2, turnedAway: 0, sales: 133, tips: 22.1, rent: 25, sigServed: 3, sigStarSum: 3, sigBonus: 2.25 };
    },
    timeline: [],
  },
  /** P3 B9: the rival card before scouting (the Scout button), signature set two days ago. */
  rivalScout: {
    night: true,
    setup(s) {
      s.cash = 180;
      s.day = 3;
      s.signature = { name: 'Honey Haze', drink: 'latte', twist: 'honey', premium: 2, since: 2 };
    },
    timeline: [],
  },
  /** P3 B10: the Ads tab with yesterday's viral Tik Tak on the receipt and Palm Book booked for tomorrow. */
  ads: {
    night: true,
    setup(s) {
      s.cash = 214;
      s.day = 2;
      s.ad = { id: 'palmbook', day: 2, by: 'Ana' };
      s.today = { day: 1, served: 31, lost: 3, turnedAway: 1, sales: 151, tips: 24.6, rent: 25, ad: { id: 'tiktak', outcome: 'viral' } };
    },
    timeline: [],
  },
  /** P3 B11: the pitch panel after a standing ovation, on the Ads & pitch tab. */
  pitch: {
    night: true,
    setup(s) {
      s.cash = 188;
      s.day = 2;
      s.today = { day: 1, served: 27, lost: 2, turnedAway: 0, sales: 139, tips: 22.1, rent: 25 };
      const text = 'Cozy rainy morning deal: bring a friend and family, fresh latte with vanilla, loyalty card double stamps';
      s.pitch = { day: 2, by: 'Cleo', ...judgePitch(s, 'promo', text) };
    },
    timeline: [],
  },
  /** P3 B12: the Shopfront tab with the kiosk installed and the Squarely terminal next on the path. */
  checkout: {
    night: true,
    setup(s) {
      s.cash = 168;
      s.day = 2;
      s.checkout = { owned: ['register', 'kiosk'], active: 'kiosk', since: 1, by: 'Ben' };
      s.today = { day: 1, served: 30, lost: 1, turnedAway: 0, sales: 162.4, tips: 14.2, rent: 25, checkoutFees: 2 };
    },
    timeline: [],
  },
  /** P3 B13: each tier of the growth path on day 3, a full line waiting. */
  standDay: { setup: (s) => atTier(s, 'stand', 3), timeline: [] },
  cartDay: { setup: (s) => atTier(s, 'cart', 5), timeline: [] },
  cafeDay: { setup: (s) => atTier(s, 'cafe', 6), timeline: [] },
  /** P3 B13: the first morning in the cart: the grand re-opening burst. */
  grownDay: { setup: (s) => { atTier(s, 'cart', 4); s.tierLog = [{ tier: 'cart', day: s.day, by: 'Ben' }]; }, timeline: [] },
  /** P3 B13: the Shopfront tab at the stand with the cart affordable, and the night Ben grew into the cart. */
  growStand: {
    night: true,
    setup(s) {
      s.cash = 128;
      s.day = 3;
      s.tier = 'stand';
      s.slots = defaultSlots('stand');
      s.stations = stationsFromSlots('stand', s.slots);
      s.today = { day: 2, served: 22, lost: 3, turnedAway: 4, sales: 98.5, tips: 9.1, rent: 10 };
    },
    timeline: [],
  },
  growCart: {
    night: true,
    setup(s) {
      s.cash = 61;
      s.day = 3;
      s.tier = 'cart';
      s.slots = defaultSlots('cart');
      s.stations = stationsFromSlots('cart', s.slots);
      s.tierLog = [{ tier: 'cart', day: 3, by: 'Ben' }];
      s.today = { day: 2, served: 24, lost: 2, turnedAway: 5, sales: 104.2, tips: 10.4, rent: 10 };
    },
    timeline: [],
  },
  /** P3 B12: the counter with each checkout, a full line waiting. */
  counterRegister: { setup: (s) => counterLine(s, 'register', 6), timeline: [] },
  counterKiosk: { setup: (s) => counterLine(s, 'kiosk', 7), timeline: [] },
  counterSquarely: { setup: (s) => counterLine(s, 'squarely', 6), timeline: [] },
  /** Block 10: lifetime records from the title screen. */
  records: { records: true, setup: weekPlayed, timeline: [] },
  /** Block 1: messes, a slip, the mop, the cleanliness meter. */
  floor: {
    setup(s) {
      s.messes = [
        { id: 1, kind: 'grounds', x: 3, y: 3, amount: 1 },
        { id: 2, kind: 'grounds', x: 4, y: 3, amount: 0.5 },
        { id: 3, kind: 'spill', x: 6, y: 4, amount: 1.5 },
        { id: 4, kind: 'spill', x: 9, y: 3, amount: 0.7 },
      ];
      s.cleanliness = 64;
      const ben = s.players[1];
      ben.tool = 'mop';
      s.mop.heldBy = ben.id;
      ben.pos = { x: 5.6, y: 3.7 };
      ben.cleaningTicksLeft = 60;
      ben.cleaningMess = 3;
      const cleo = s.players[2];
      cleo.stunTicksLeft = 240;
      cleo.pos = { x: 9, y: 3 };
    },
    timeline: [
      [0.4, (s) => emit(s, 'slip', { player: 'cleo', x: 9, y: 3, ticks: 240, item: 'latte' })],
      [0.5, (s) => emit(s, 'drop', { item: 'latte', x: 9, y: 3 })],
      [0.9, (s) => (s.messes[3].amount = 1.6)],
      [1.0, (s) => (s.cleanliness = 52)],
    ],
  },
  /** Block 1: the rogue customer sneaking behind the counter to a taped-off station. */
  rogue: {
    setup(s) {
      s.customers[0].upset = { ticksLeft: 500 };
      s.rogue = { customerId: 21, drink: 'latte', stage: 'walking', pos: { x: 6.5, y: 5 }, path: [], station: 'steamer', ticksLeft: 0, waitTicks: 0 };
    },
    timeline: [
      [0.3, (s) => emit(s, 'rogue.upset', { drink: 'latte' })],
      [0.6, (s) => s.rogue && (s.rogue.pos = { x: 5.8, y: 3.2 })],
      [1.4, (s) => { if (s.rogue) { s.rogue.stage = 'making'; s.rogue.pos = { x: 5, y: 2 }; s.rogue.ticksLeft = 420; } const st = s.stations.find((x) => x.id === 'steamer'); if (st) { st.occupiedBy = 21; st.busyTicksLeft = 400; } }],
    ],
  },
  /** Block 1: the rogue storming out and the door slamming. */
  slam: {
    setup(s) {
      s.rogue = { customerId: 21, drink: 'latte', stage: 'stormingOut', pos: { x: 2.2, y: 5.6 }, path: [], station: null, ticksLeft: 0, waitTicks: 0 };
    },
    timeline: [
      [0.2, (s) => emit(s, 'rogue.stormed', { drink: 'latte' })],
      [0.5, (s) => s.rogue && (s.rogue.pos = { x: LAYOUT.door.x, y: LAYOUT.door.y })],
      [1.0, (s) => (s.rogue = null)],
    ],
  },
  /** Block 2: rush hour starts (intro card, board by the door), with a foreshadow morning note. */
  rush: {
    setup(s) {
      s.morningNotes = [EVENT_FORESHADOW.rushHour];
      for (let i = 0; i < 3; i++) s.customers.push({ id: 30 + i, drink: i % 2 ? 'latte' : 'espresso', patienceLeft: 800, patienceMax: 1000 });
    },
    timeline: [[0.3, (s) => s.events.push({ kind: 'rushHour', ticksLeft: 1800 })]],
  },
  /** Block 2: the lights dim and stutter; busy machines spark. */
  power: {
    setup(s) {
      for (const id of ['grinder', 'espresso', 'steamer']) {
        const st = s.stations.find((x) => x.id === id);
        if (st) st.busyTicksLeft = 200;
      }
    },
    timeline: [[0.3, (s) => s.events.push({ kind: 'powerFlicker', ticksLeft: 240 })]],
  },
  /** Block 2: the inspector patrols with a clipboard; the scrutiny meter is risky. */
  inspector: {
    setup(s) {
      s.messes = [{ id: 1, kind: 'spill', x: 4, y: 3, amount: 1 }];
      s.cleanliness = 68;
      s.today.wasted = 2;
    },
    timeline: [[0.3, (s) => s.events.push({ kind: 'healthInspector', ticksLeft: 1200 })]],
  },
  /** Block 2: the inspector's verdict stamp. */
  stamp: {
    setup(s) {
      s.events.push({ kind: 'healthInspector', ticksLeft: 10 });
    },
    timeline: [[0.6, (s) => { s.events = []; s.today.inspection = 'pass'; }]],
  },
  stampFail: {
    setup(s) {
      s.events.push({ kind: 'healthInspector', ticksLeft: 10 });
      s.cleanliness = 40;
    },
    timeline: [[0.6, (s) => { s.events = []; s.today.inspection = 'fail'; }]],
  },
  /** Block 2: the influencer in line with a ring light, then the follower bump when served. */
  influencer: {
    setup(s) {
      s.customers.splice(1, 0, { id: 40, drink: 'latte', patienceLeft: 1500, patienceMax: 1800, kind: 'influencer' });
    },
    timeline: [
      [0.3, (s) => s.events.push({ kind: 'influencerVisit', ticksLeft: 1500, customerId: 40 })],
      [4.0, (s) => { s.customers = s.customers.filter((c) => c.id !== 40); s.events = []; s.today.influencer = 'served'; }],
    ],
  },
  /** Block 3: customer kinds in line, bots with personalities, an away player. */
  crew: {
    setup(s) {
      const bot = (i: number, name: string, personality: 'rookie' | 'steady' | 'veteran') => {
        const p = s.players[i];
        p.name = name;
        p.bot = { personality } as GameState['players'][number]['bot'];
      };
      bot(1, 'Bo', 'rookie');
      bot(2, 'Lu', 'steady');
      bot(3, 'Mo', 'veteran');
      s.players[1].pos = { x: 3, y: 2.6 };
      s.players[2].pos = { x: 5.2, y: 3.6 };
      s.players[3].pos = { x: 8, y: 2.8 };
      s.players[0].pos = { x: 6, y: 5 };
      s.customers = [
        { id: 61, drink: 'latte', patienceLeft: 1100, patienceMax: 1200, kind: 'regular', name: 'Ada' },
        { id: 62, drink: 'espresso', patienceLeft: 300, patienceMax: 1000, kind: 'impatient' },
        { id: 63, drink: 'coldBrew', patienceLeft: 1300, patienceMax: 1500, kind: 'group', extra: ['latte', 'espresso'] },
        { id: 64, drink: 'latte', patienceLeft: 900, patienceMax: 1200 },
      ];
    },
    timeline: [],
  },
  /** Block 3: an away human (z z z) among the crew. */
  away: {
    setup(s) {
      s.players[3].connected = false;
    },
    timeline: [],
  },
  /** Block 3: serve toasts stacking up, a perfect serve, a regular's heart, a bot's oops, the group photo. */
  serves: {
    setup(s) {
      s.players[1].name = 'Bo';
      s.players[1].bot = { personality: 'rookie' } as GameState['players'][number]['bot'];
      s.customers = [{ id: 61, drink: 'latte', patienceLeft: 1100, patienceMax: 1200, kind: 'regular', name: 'Ada' }, { id: 64, drink: 'latte', patienceLeft: 900, patienceMax: 1200 }];
    },
    timeline: [
      [0.3, (s) => emit(s, 'served', { by: 'dev', item: 'latte', amount: 6.1, kind: 'normal', cid: 70, perfect: true, left: 0 })],
      [0.7, (s) => emit(s, 'served', { by: 'ben', item: 'espresso', amount: 3.3, kind: 'impatient', cid: 71, perfect: false, left: 0 })],
      [1.1, (s) => { emit(s, 'served', { by: 'ana', item: 'latte', amount: 6.4, kind: 'regular', name: 'Ada', cid: 61, perfect: true, left: 0 }); s.customers.shift(); }],
      [1.3, (s) => emit(s, 'bot.mistake', { bot: 'Bo', drink: 'latte' })],
      [3.2, (s) => emit(s, 'influencer', { result: 'served' })],
    ],
  },
  /** P3 B5: served toasts with the cup's accuracy stars. */
  stars: {
    setup() {},
    timeline: [
      [0.3, (s) => emit(s, 'served', { by: 'ana', item: 'latte', amount: 6.3, kind: 'normal', cid: 90, perfect: true, left: 0, stars: 3 })],
      [0.6, (s) => emit(s, 'served', { by: 'ben', item: 'espresso', amount: 3.1, kind: 'normal', cid: 91, perfect: false, left: 0, stars: 2 })],
      [0.9, (s) => emit(s, 'served', { by: 'cleo', item: 'coldBrew', amount: 4.2, kind: 'normal', cid: 92, perfect: false, left: 0, stars: 1 })],
    ],
  },
  /** Block 3 (folded in): a pass hand-off cheer and a perfect-serve streak. */
  cheers: {
    setup() {},
    timeline: [
      [0.3, (s) => emit(s, 'pass.put', { by: 'ben', item: 'latte' })],
      [0.6, (s) => emit(s, 'pass.serve', { by: 'cleo', item: 'latte' })],
      [0.65, (s) => emit(s, 'served', { by: 'cleo', item: 'latte', amount: 6.2, kind: 'normal', cid: 80, perfect: true, left: 0 })],
      [0.9, (s) => emit(s, 'served', { by: 'ana', item: 'espresso', amount: 3.6, kind: 'normal', cid: 81, perfect: true, left: 0 })],
      [1.2, (s) => emit(s, 'served', { by: 'dev', item: 'coldBrew', amount: 4.8, kind: 'normal', cid: 82, perfect: true, left: 0 })],
    ],
  },
  /** Everything at once, for the per-frame cost check: chaos, an event, kinds, bots, toasts. */
  busy: {
    setup(s) {
      FIXTURES.floor.setup(s);
      FIXTURES.rogue.setup(s);
      FIXTURES.crew.setup(s);
      s.customers.push({ id: 40, drink: 'latte', patienceLeft: 1500, patienceMax: 1800, kind: 'influencer' }, { id: 41, drink: 'espresso', patienceLeft: 500, patienceMax: 1800, kind: 'impatient' });
      s.events.push({ kind: 'healthInspector', ticksLeft: 5000 }, { kind: 'rushHour', ticksLeft: 5000 });
    },
    timeline: Array.from({ length: 40 }, (_, i) => [0.2 + i * 0.25, (s: GameState) => emit(s, 'served', { by: ['ana', 'ben', 'cleo', 'dev'][i % 4], item: 'latte', amount: 6, kind: 'normal', cid: 100 + i, perfect: i % 2 === 0, left: 0 })] as [number, (s: GameState) => void]),
  },
  /** Block 1: the closing receipt with the chaos lines. */
  receipt: {
    closing: true,
    setup(s) {
      s.today = { ...s.today, served: 18, lost: 2, sales: 96, tips: 14.5, rent: 40, wasted: 3, rogues: 1, slips: 2, events: ['rushHour', 'healthInspector'], inspection: 'fail', fines: 15 };
    },
    timeline: [],
  },
  /** FB2 C11: night phone feed from dayReviews (posts + fans / fansDelta). */
  dayFeed: {
    night: true,
    extras: true,
    setup(s) {
      s.gear = true;
      gearStart(s);
      atTier(s, 'cafe', 0);
      s.customers = [];
      s.fans = 18;
      // Filed into days by the night fixture path below.
      s.today = {
        ...s.today,
        day: 3,
        served: 22,
        lost: 3,
        sales: 110,
        tips: 18,
        rent: 40,
        perfect: 8,
        cups: 22,
        cupStars: 55,
        feed: [
          { name: '@crema_queen', text: 'Café ran like a clock today. Slightly smug clock.', sentiment: 'good', reason: 'service', stars: 5 },
          { name: '@sippy_steve', text: 'My latte arrived at room temperature. The room was also cold. 1 star.', sentiment: 'bad', reason: 'cold', stars: 1 },
          { name: '@foamfiend', text: 'Packed house at the café today. Worth the queue!', sentiment: 'good', reason: 'crowd', stars: 4 },
          { name: '@oat_flat_white', text: 'Tipped the baristas twice today. Do not tell my accountant.', sentiment: 'good', reason: 'tips', stars: 5 },
        ],
        fansDelta: 7,
        fansAfter: 18,
      };
    },
    timeline: [],
  },
  /** FB2 C11: closing receipt with fans / fansDelta. */
  closingFans: {
    closing: true,
    setup(s) {
      s.fans = 12;
      s.today = {
        ...s.today,
        served: 16,
        lost: 2,
        sales: 84,
        tips: 12,
        rent: 40,
        fansDelta: 4,
        fansAfter: 12,
        feed: [
          { name: '@beanbae', text: 'Fast service today. My espresso showed up while I was still looking at the menu.', sentiment: 'good', reason: 'speed', stars: 5 },
        ],
      };
    },
    timeline: [],
  },
  /** FB2 C11: live review.post phone pop-ups during the day. */
  reviewPop: {
    feedPop: true,
    setup(s) {
      s.gear = true;
      gearStart(s);
      atTier(s, 'cafe', 3);
    },
    timeline: [
      [0.4, (s) => emit(s, 'review.post', { customer: 11, drink: 'latte', sentiment: 'bad', reason: 'cold', stars: 1, at: s.tick, name: '@latte_larry', text: 'This latte had the warmth of a handshake from a ghost.' })],
      [1.2, (s) => emit(s, 'review.post', { customer: 12, drink: 'espresso', sentiment: 'good', reason: 'great', stars: 5, at: s.tick, name: '@brewtus', text: 'Got my espresso before I finished my sentence. Wizardry.' })],
    ],
  },
  /** FB2 C11: week-end rating card from weekRating(state). */
  weekRating: {
    weekEnd: true,
    setup(s) {
      weekPlayed(s);
      s.gear = true;
      s.fans = 42;
      s.days = s.days.map((d, i) => ({
        ...d,
        cups: d.served,
        cupStars: d.served * (i % 2 === 0 ? 3 : 2),
        perfect: Math.round(d.served * 0.35),
        feedMoments: i === 2 ? { cold: 2 } : undefined,
        fansDelta: 3 - (i % 3),
      }));
    },
    timeline: [],
  },
};

async function main(): Promise<void> {
  const name = new URLSearchParams(location.search).get('f') ?? 'floor';
  const fx = FIXTURES[name];
  if (!fx) throw new Error(`no fixture ${name}`);
  let state = base();
  fx.setup(state);
  if (fx.closing) {
    const after = structuredClone(state);
    after.days.push({ ...state.today });
    after.phase = 'night';
    // FB2 C11: fans live on the after-state once closeDayFeed has run.
    if (state.fans !== undefined) after.fans = state.fans;
    const closing = createClosing($('#closing'));
    closing.render(closingViewModel(state, after));
    closing.show();
  }
  if (fx.weekEnd) {
    const we = createWeekEnd($('#weekEnd'), { onContinue() {}, onStop() {}, onBackToTitle() {} });
    we.render({ ...weekEndViewModel(state, 'ana'), ...(fx.unlocks ? { unlocks: fx.unlocks } : {}) }, false);
    we.show();
  }
  if (fx.night) {
    state.days.push({ ...state.today });
    state = startNight(state);
    const n = createNight($('#night'), { onBuy() {}, onRestock() {}, onReady() {} });
    n.render(nightViewModel(state, 'ana'), fx.extras ? nightExtras(state, 'ana') : undefined);
    n.show();
    if (fx.nightTab) document.querySelector<HTMLElement>(`#night [data-action="tab"][data-tab="${fx.nightTab}"]`)?.click();
    if (fx.nightToast) {
      if (!state.log.some((e) => e.kind === 'strategist.menu')) {
        emit(state, 'strategist.menu', { drink: 'mocha', on: true });
        emit(state, 'strategist.menu', { drink: 'icedLatte', on: false });
      }
      const names = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
      n.toast(logToastLines(freshEvents(state, -1, TOAST_KINDS).events, names, 'ana'));
    }
    // Review Block 6: soft-open fixture clicks Open so the warn dialog is on screen for screenshots.
    if (name === 'softOpen') {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('#night [data-action="ready"]')?.click());
    }
  }
  if (fx.records) {
    let r = emptyRecords();
    for (const [seed, cut, score] of [[3, 5, 140], [9, 7, 228], [7, 7, 0]] as const) {
      const w = structuredClone(state);
      w.seed = seed;
      w.days = w.days.slice(0, cut);
      r = foldRecords(r, w, awardsFor(w), `2026-10-${20 + seed}`, score || w.cash - 100);
    }
    // P4 follow-up: two seasons on the board (one done, one in progress).
    for (const [seed, profits, done] of [[21, [140, 150, 120, 200], true], [22, [120, 130], false]] as const) {
      const w = structuredClone(state);
      w.seed = seed;
      w.season = { base: profits[0], startScore: 0, weeks: profits.map((p, i) => ({ week: i + 1, target: i ? Math.round((profits[0] * (1 + 0.15 * (i - 1))) / 5) * 5 : null, profit: p })), ...(done ? { done: true as const } : {}) };
      r = foldRecords(r, w, [], `2026-10-${seed}`, 100);
    }
    createRecordsDialog(() => r).open();
  }
  const renderer = await createRenderer($('#game'));
  const me = fx.me ?? 'ana';
  renderer.setLocalPlayer(me);
  const hud = createHud($('#hud'));
  hud.show();
  if (fx.restock) {
    hud.setRestock(dayRestockVM(state));
    hud.restockKey({ code: 'KeyB', key: 'b' });
    const names = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
    hud.toast(logToastLines(freshEvents(state, -1, TOAST_KINDS).events, names, me));
  }
  // ui-3.8.0: a fixture can start mid-carry (the local pre-open pickup) to show the ghost outlines.
  const carry = fx.carry ? carryTarget(state, me) : null;
  if (carry) renderer.setGhostSpots(carry.spots);
  let feedSeen = -1;
  const t0 = performance.now();
  const pending = [...fx.timeline];
  const frame = () => {
    const t = (performance.now() - t0) / 1000;
    let changed = false;
    while (pending.length && pending[0][0] <= t) {
      if (!changed) state = structuredClone(state);
      changed = true;
      pending.shift()![1](state);
    }
    if (changed) state.tick += 1;
    // FB2 C11: fixture timeline review.post → phone pop-up (same path as main.ts).
    if (fx.feedPop) {
      const fresh = freshEvents(state, feedSeen, ['review.post']);
      feedSeen = fresh.seen;
      const posts = fresh.events.map(reviewPopVM).filter((p): p is NonNullable<typeof p> => !!p);
      if (posts.length) hud.feedPop(posts);
    }
    const positions = Object.fromEntries(state.players.map((p) => [p.id, p.pos]));
    const c0 = performance.now();
    renderer.update({ state, baristaPositions: positions });
    hud.render(hudViewModel(state), hudLive(state, me, carry));
    hud.setRestock(dayRestockVM(state));
    const w = window as unknown as { fixtureCost: number[] };
    (w.fixtureCost ??= []).push(performance.now() - c0);
    (window as unknown as { fixtureTime: number }).fixtureTime = t;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
