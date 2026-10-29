/**
 * Dev-only visual fixtures (served by `vite` at /CafeTycoon/fixtures.html?f=<name>; never in the build).
 * Each fixture fakes a GameState and replays a small timeline into the real Scene and HUD, so the
 * Playwright smoke can screenshot chaos, events and personalities without waiting for the dice.
 */
import '../style.css';
import { LAYOUT } from '../data/layout';
import { createRenderer } from '../render/app';
import { EVENT_FORESHADOW } from '../sim/describe';
import { createRun, startDay, startNight } from '../sim/run';
import { createNight } from '../ui/night';
import type { GameState, SimEvent } from '../sim/types';
import { createClosing } from '../ui/closing';
import { createHud } from '../ui/hud';
import { hudLive } from '../ui/live';
import { closingViewModel, hudViewModel, nightViewModel, weekEndViewModel } from '../ui/viewModels';
import { createWeekEnd } from '../ui/weekEnd';
import { createRecordsDialog } from '../ui/records';
import { awardsFor } from '../sim/awards';
import { blank } from '../sim/stats';
import { emptyRecords, foldRecords } from '../storage/recordsStore';

type Fixture = { setup(s: GameState): void; timeline: [number, (s: GameState) => void][]; me?: string; closing?: boolean; weekEnd?: boolean; records?: boolean; night?: boolean };

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const emit = (s: GameState, kind: SimEvent['kind'], data: SimEvent['data'] = {}) => s.log.push({ seq: s.nextLogSeq++, tick: s.tick, kind, data });

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
  /** Block 11: the night shop with set progress (one Espresso bar card owned), for card-face density checks. */
  night: {
    night: true,
    setup(s) {
      s.cash = 260;
      s.owned = [{ itemId: 'dualBoiler', effects: [] }];
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
    we.render(weekEndViewModel(state, 'ana'), false);
    we.show();
  }
  if (fx.night) {
    state.days.push({ ...state.today });
    state = startNight(state);
    const n = createNight($('#night'), { onBuy() {}, onRestock() {}, onReady() {} });
    n.render(nightViewModel(state, 'ana'));
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
