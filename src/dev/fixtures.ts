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
import { defaultSlots, stationsFromSlots } from '../sim/slots';
import { createClosing } from '../ui/closing';
import { createHud } from '../ui/hud';
import { hudLive } from '../ui/live';
import { closingViewModel, hudViewModel, nightViewModel, weekEndViewModel } from '../ui/viewModels';
import { createWeekEnd } from '../ui/weekEnd';
import { nightExtras } from '../ui/live';
import { seasonTarget } from '../sim/season';
import { createRecordsDialog } from '../ui/records';
import { awardsFor } from '../sim/awards';
import { blank } from '../sim/stats';
import { emptyRecords, foldRecords } from '../storage/recordsStore';

type Fixture = { setup(s: GameState): void; timeline: [number, (s: GameState) => void][]; me?: string; closing?: boolean; weekEnd?: boolean; unlocks?: string[]; records?: boolean; night?: boolean; extras?: boolean };

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
      row('dev', 'Dev', { serves: 21, perfect: 8, earned: 104, espressos: 11, collapses: 2, rerolls: 5 }),
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
  /** P3 B1: the night shop with roles picked (Ana is Chef, Cleo is Host; Ben and Dev free). */
  roles: {
    night: true,
    setup(s) {
      s.cash = 260;
      s.players.find((p) => p.id === 'ana')!.role = 'chef';
      s.players.find((p) => p.id === 'cleo')!.role = 'host';
      s.ready = ['cleo'];
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
      const p = s.players.find((x) => !x.bot);
      if (p) p.role = 'manager';
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
  }
  if (fx.records) {
    let r = emptyRecords();
    for (const [seed, cut, score] of [[3, 5, 140], [9, 7, 228], [7, 7, 0]] as const) {
      const w = structuredClone(state);
      w.seed = seed;
      w.days = w.days.slice(0, cut);
      r = foldRecords(r, w, awardsFor(w), `2026-10-${20 + seed}`, score || w.cash - 100);
    }
    createRecordsDialog(() => r).open();
  }
  const renderer = await createRenderer($('#game'));
  const me = fx.me ?? 'ana';
  renderer.setLocalPlayer(me);
  const hud = createHud($('#hud'));
  hud.show();
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
    const positions = Object.fromEntries(state.players.map((p) => [p.id, p.pos]));
    const c0 = performance.now();
    renderer.update({ state, baristaPositions: positions });
    hud.render(hudViewModel(state), hudLive(state, me));
    const w = window as unknown as { fixtureCost: number[] };
    (w.fixtureCost ??= []).push(performance.now() - c0);
    (window as unknown as { fixtureTime: number }).fixtureTime = t;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
