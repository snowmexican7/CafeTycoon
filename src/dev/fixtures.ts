/**
 * Dev-only visual fixtures (served by `vite` at /CafeTycoon/fixtures.html?f=<name>; never in the build).
 * Each fixture fakes a GameState and replays a small timeline into the real Scene and HUD, so the
 * Playwright smoke can screenshot chaos, events and personalities without waiting for the dice.
 */
import '../style.css';
import { LAYOUT } from '../data/layout';
import { createRenderer } from '../render/app';
import { createRun, startDay } from '../sim/run';
import type { GameState, SimEvent } from '../sim/types';
import { createClosing } from '../ui/closing';
import { createHud } from '../ui/hud';
import { hudLive } from '../ui/live';
import { closingViewModel, hudViewModel } from '../ui/viewModels';

type Fixture = { setup(s: GameState): void; timeline: [number, (s: GameState) => void][]; me?: string; closing?: boolean };

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

const FIXTURES: Record<string, Fixture> = {
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
  /** Block 1: the closing receipt with the chaos lines. */
  receipt: {
    closing: true,
    setup(s) {
      s.today = { ...s.today, served: 18, lost: 2, sales: 96, tips: 14.5, rent: 40, wasted: 3, rogues: 1, slips: 2 };
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
    renderer.update({ state, baristaPositions: positions });
    hud.render(hudViewModel(state), hudLive(state, me));
    (window as unknown as { fixtureTime: number }).fixtureTime = t;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
