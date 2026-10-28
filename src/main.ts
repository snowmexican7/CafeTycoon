import './style.css';
import { SNAPSHOT_INTERVAL_MS } from './host/loop';
import { createLocalTransport } from './net/localTransport';
import { createSendGate } from './net/sendGate';
import type { HostToClient, Transport } from './net/transport';
import { createRenderer } from './render/app';
import { interpolateView } from './render/interpolate';
import { createKeyboard } from './render/keyboard';
import { summarizeRun } from './sim/score';
import type { GameState, Phase, PlayerId, PlayerInput } from './sim/types';
import { createHistoryStore } from './storage/historyStore';
import { createSettingsStore } from './storage/settingsStore';
import { createSnapshotStore } from './storage/snapshotStore';
import { createClosing } from './ui/closing';
import { createHud } from './ui/hud';
import { createNight } from './ui/night';
import { createPause } from './ui/pause';
import { createTitle } from './ui/title';
import { closingViewModel, hudViewModel, nightViewModel, titleViewModel, weekEndViewModel } from './ui/viewModels';
import { createWeekEnd } from './ui/weekEnd';

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const stores = {
  snapshot: createSnapshotStore(localStorage),
  history: createHistoryStore(localStorage),
  settings: createSettingsStore(localStorage, () => crypto.randomUUID()),
};
const today = () => new Date().toISOString().slice(0, 10);

interface Session {
  transport: Transport;
  unsubscribe: () => void;
  me: PlayerId;
  prev: GameState | null;
  next: GameState | null;
  nextArrivedAt: number;
  lastPhase: Phase | null;
  lastClosing: GameState | null;
  lastSaveMs: number;
  recorded: boolean;
}

async function main(): Promise<void> {
  const renderer = await createRenderer($('#game'));
  const keyboard = createKeyboard(window);
  const gate = createSendGate(50, () => performance.now());
  let session: Session | null = null;
  let lastSent = { x: 0, y: 0 };
  let interactPending = false;

  const send = (input: PlayerInput) => session?.transport.sendInput(input);
  const me = () => session?.me ?? '';

  const title = createTitle($('#title'), {
    onStart(choice) {
      const settings = stores.settings.set({ playerName: choice.name, pace: choice.pace, dayLengthSec: choice.dayLengthSec });
      const seed = choice.seed ?? Math.floor(Math.random() * 2 ** 31);
      startSession(settings.playerToken, (t) =>
        t.start({
          seed,
          hostId: settings.playerToken,
          players: [{ id: settings.playerToken, name: settings.playerName }],
          settings: { pace: settings.pace, dayLengthSec: settings.dayLengthSec, nightLengthSec: settings.nightLengthSec },
        }),
      );
    },
    onResume() {
      const saved = stores.snapshot.load();
      if (!saved) return showTitle();
      startSession(saved.hostId, (t) => t.resume(saved));
    },
  });
  const hud = createHud($('#hud'));
  const night = createNight($('#night'), {
    onBuy: (itemId) => send({ kind: 'buy', playerId: me(), itemId }),
    onRestock: (supply) => send({ kind: 'restock', playerId: me(), supply, packs: 1 }),
    onReady: () => send({ kind: 'ready', playerId: me() }),
  });
  const closing = createClosing($('#closing'));
  const weekEnd = createWeekEnd($('#weekEnd'), {
    onContinue: () => send({ kind: 'weekEnd', playerId: me(), choice: 'continue' }),
    onStop: () => send({ kind: 'weekEnd', playerId: me(), choice: 'stop' }),
    onBackToTitle: () => endSession(),
  });
  const pause = createPause($('#pause'), {
    onSettings: (patch) => send({ kind: 'settings', playerId: me(), settings: patch }),
    onQuit: () => endSession(),
  });

  function showTitle(): void {
    title.render(titleViewModel(stores.history.list(), stores.snapshot.load()), stores.settings.get());
    title.show();
    for (const o of [hud, night, closing, weekEnd, pause]) o.hide();
  }

  function startSession(playerId: PlayerId, begin: (t: Transport) => void): void {
    session?.unsubscribe();
    session?.transport.close();
    const transport = createLocalTransport();
    const s: Session = {
      transport,
      unsubscribe: () => {},
      me: playerId,
      prev: null,
      next: null,
      nextArrivedAt: performance.now(),
      lastPhase: null,
      lastClosing: null,
      lastSaveMs: 0,
      recorded: false,
    };
    s.unsubscribe = transport.onSnapshot((snap) => onSnapshot(s, snap));
    session = s;
    title.hide();
    hud.show();
    begin(transport);
  }

  function endSession(): void {
    session?.unsubscribe();
    session?.transport.close();
    session = null;
    showTitle();
  }

  function onSnapshot(s: Session, snap: HostToClient): void {
    if (session !== s) return;
    const state = snap.state;
    const now = performance.now();
    s.prev = s.next;
    s.next = state;
    s.nextArrivedAt = now;
    hud.render(hudViewModel(state));

    if (state.phase === 'closing') s.lastClosing = state;
    if (state.phase === 'night') night.render(nightViewModel(state, s.me));

    if (state.phase !== s.lastPhase) {
      const from = s.lastPhase;
      s.lastPhase = state.phase;
      if (from === 'closing' && s.lastClosing) {
        closing.render(closingViewModel(s.lastClosing, state));
        closing.show();
      } else if (from !== null) {
        closing.hide();
      }
      if (state.phase === 'day') hud.toast(state.morningNotes);
      state.phase === 'night' ? night.show() : night.hide();
      if (state.phase === 'weekEnd' || state.phase === 'ended') {
        weekEnd.render(weekEndViewModel(state, s.me), state.phase === 'ended');
        weekEnd.show();
      } else {
        weekEnd.hide();
      }
      if (state.phase === 'ended') {
        if (!s.recorded) {
          s.recorded = true;
          stores.history.append(summarizeRun(state, today()));
        }
        stores.snapshot.clear();
      } else {
        stores.snapshot.save(state);
        s.lastSaveMs = now;
      }
    } else if (state.phase === 'day' && now - s.lastSaveMs > 10_000) {
      stores.snapshot.save(state);
      s.lastSaveMs = now;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && session?.next) {
      e.preventDefault();
      pause.render({ pace: session.next.settings.pace, dayLengthSec: session.next.settings.dayLengthSec, isHost: session.me === session.next.hostId });
      pause.toggle();
    }
  });

  function frame(): void {
    const s = session;
    if (s?.next) {
      const alpha = (performance.now() - s.nextArrivedAt) / SNAPSHOT_INTERVAL_MS;
      renderer.update(interpolateView(s.prev, s.next, alpha));
      const vec = keyboard.read();
      interactPending = keyboard.takeInteract() || interactPending;
      const changed = vec.x !== lastSent.x || vec.y !== lastSent.y;
      if ((changed || interactPending) && gate.allow()) {
        s.transport.sendInput({ kind: 'move', playerId: s.me, x: vec.x, y: vec.y, interact: interactPending });
        lastSent = vec;
        interactPending = false;
      }
    }
    requestAnimationFrame(frame);
  }

  showTitle();
  requestAnimationFrame(frame);
}

main();
