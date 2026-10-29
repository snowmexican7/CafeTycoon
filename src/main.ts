import './style.css';
import { ambienceFor, createHeartbeat, diffCues, heartbeatGapMs } from './audio/cues';
import { createAudioEngine } from './audio/engine';
import { SNAPSHOT_INTERVAL_MS } from './host/loop';
import { createTelemetry, withTelemetry, createUiBuffer, setUiTelemetrySink, uiTelemetry, type Telemetry } from './host/telemetry';
import { createHostRoom, type HostRoom } from './net/hostRoom';
import { markPeersAway } from './net/hostResume';
import { createLocalTransport } from './net/localTransport';
import type { PeerStatus } from './net/peerSession';
import { createPeerTransport } from './net/peerTransport';
import { PROTOCOL_VERSION, type BotsChoice, type Member } from './net/protocol';
import { makeRoomCode, normalizeRoomCode } from './net/roomCode';
import { createTrysteroLink } from './net/roomLink';
import { roomLinkFor } from './net/localLink';
import { createSendGate } from './net/sendGate';
import type { HostToClient, Transport } from './net/transport';
import { createRenderer } from './render/app';
import { interpolateView } from './render/interpolate';
import { createKeyboard } from './render/keyboard';
import { scoreRun, summarizeRun } from './sim/score';
import { awardsFor } from './sim/awards';
import { createRecordsStore } from './storage/recordsStore';
import { createRecordsDialog } from './ui/records';
import type { CreateRunOptions, GameState, Phase, PlayerId, PlayerInput } from './sim/types';
import { createHistoryStore } from './storage/historyStore';
import { createRoomStore } from './storage/roomStore';
import { createSeatStore } from './storage/seatStore';
import { memoryStorage, type StorageLike } from './storage/storageLike';
import { createSettingsStore } from './storage/settingsStore';
import { createSnapshotStore } from './storage/snapshotStore';
import { APP_VERSION } from './version';
import { createClosing } from './ui/closing';
import { createHud } from './ui/hud';
import { hudLive, nightExtras } from './ui/live';
import { createLobby } from './ui/lobby';
import { createNight } from './ui/night';
import { createPause } from './ui/pause';
import { createRoadmap } from './ui/roadmap';
import { createTitle, type StartChoice } from './ui/title';
import { closingViewModel, hudViewModel, lobbyViewModel, nightViewModel, titleViewModel, weekEndViewModel } from './ui/viewModels';
import { createWeekEnd } from './ui/weekEnd';

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;

/** Per-tab storage, or an in-memory stand-in where the browser blocks it. */
function tabStorage(): StorageLike {
  try {
    sessionStorage.getItem('probe');
    return sessionStorage;
  } catch {
    return memoryStorage();
  }
}
const perTab = tabStorage();

const stores = {
  snapshot: createSnapshotStore(localStorage),
  history: createHistoryStore(localStorage),
  settings: createSettingsStore(localStorage, () => crypto.randomUUID()),
  // The host's room belongs with the run save (per browser). A peer's room and seat are per browser
  // too, so closing the tab and opening the game again can rejoin and reclaim the same barista.
  hostRoom: createRoomStore(localStorage, 'cafetycoon.room.host'),
  peerRoom: createRoomStore(localStorage, 'cafetycoon.room.peer'),
  seats: createSeatStore(localStorage),
  records: createRecordsStore(localStorage),
};
/** A text box has focus, so letter keys belong to it (sliders and switches don't count). */
function typingText(): boolean {
  const el = document.activeElement as HTMLInputElement | null;
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return true;
  return el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type);
}
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Who this tab is. Per tab (sessionStorage) so a refresh keeps the same barista while a second
 * tab in the same browser is a second player; falls back to the per-browser token if blocked.
 */
function tabIdentity(): PlayerId {
  try {
    const existing = perTab.getItem('cafetycoon.tab');
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    perTab.setItem('cafetycoon.tab', fresh);
    return fresh;
  } catch {
    return stores.settings.get().playerToken;
  }
}

type Role = 'solo' | 'host' | 'peer';

interface Session {
  role: Role;
  code: string | null;
  transport: Transport;
  room: HostRoom | null;
  unsubscribers: (() => void)[];
  watchdog: ReturnType<typeof setTimeout> | null;
  telemetry: Telemetry | null;
  teleTimer: ReturnType<typeof setInterval> | null;
  me: PlayerId;
  prev: GameState | null;
  next: GameState | null;
  nextArrivedAt: number;
  lastPhase: Phase | null;
  lastClosing: GameState | null;
  lastSaveMs: number;
  recorded: boolean;
  /** Highest log seq already turned into sound (client-side only). */
  soundSeq: number;
  members: Member[];
  peerStatus: PeerStatus | 'hosting';
  started: boolean;
  pendingStart: StartChoice | null;
  /** The bots setting as the host last announced it (peers), for the lobby card. */
  lobbyBots: { bots: BotsChoice; picked: boolean } | null;
}

async function main(): Promise<void> {
  const renderer = await createRenderer($('#game'));
  const keyboard = createKeyboard(window);
  const gate = createSendGate(50, () => performance.now());
  let session: Session | null = null;
  let lastSent = { x: 0, y: 0 };
  let interactPending = false;
  let lastFrameAt: number | null = null;

  function newTelemetry(host: string): Telemetry {
    return createTelemetry({ host, build: new Date(document.lastModified).toISOString(), protocol: PROTOCOL_VERSION });
  }
  function attachTelemetry(s: Session, tele: Telemetry): void {
    s.telemetry = tele;
    setUiTelemetrySink((k, d) => tele.ui(k, d));
  }
  const downloadTelemetry = () => session?.telemetry?.download();
  const telemetryRows = () => session?.telemetry?.rows() ?? [];

  const send = (input: PlayerInput) => session?.transport.sendInput(input);
  const me = () => session?.me ?? '';

  // Sound is per browser and derived from snapshots only; it never sends anything to the host.
  const audio = createAudioEngine({ storage: localStorage, baseUrl: import.meta.env.BASE_URL });
  const unlockAudio = () => audio.unlock();
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  window.addEventListener('keydown', unlockAudio, { capture: true });
  const syncMute = () => hud.setMuted(audio.settings().muted);
  audio.onChange((a) => {
    syncMute();
    pause.setAudio(a);
  });
  // UI clicks: any button, choice chip or action control, in every overlay
  document.addEventListener(
    'click',
    (ev) => {
      const el = (ev.target as Element | null)?.closest?.('button, .seg label, [data-action], summary');
      if (el && !(el as HTMLButtonElement).disabled) audio.play({ id: 'click' });
    },
    { capture: true },
  );

  const roadmap = createRoadmap();
  const records = createRecordsDialog(() => stores.records.get());
  const title = createTitle($('#title'), {
    onStart: (choice) => startSolo(choice),
    onHost: (choice) => startHost(choice),
    onJoin: (code, name) => startPeer(code, name),
    onResume: () => resume(),
    onRejoin: (code) => startPeer(code, stores.settings.get().playerName),
    onRecords: () => records.open(),
  }, roadmap);
  const hud = createHud($('#hud'), { onMute: () => audio.toggleMute() });
  const night = createNight($('#night'), {
    onBuy: (itemId) => send({ kind: 'buy', playerId: me(), itemId }),
    onRestock: (supply) => send({ kind: 'restock', playerId: me(), supply, packs: 1 }),
    onReady: () => send({ kind: 'ready', playerId: me() }),
    onMenu: (drink, on) => send({ kind: 'menu', playerId: me(), drink, on }),
    onPrice: (drink, step) => send({ kind: 'price', playerId: me(), drink, step }),
    onTwist: (drink, twist) => send({ kind: 'twist', playerId: me(), drink, twist }),
    onSignature: (sig) => send({ kind: 'signature', playerId: me(), sig }),
    onScout: () => send({ kind: 'scout', playerId: me() }),
    onAd: (ad) => send({ kind: 'ad', playerId: me(), ad }),
    onCheckout: (checkout) => send({ kind: 'checkout', playerId: me(), checkout }),
    onGrow: (tier) => send({ kind: 'grow', playerId: me(), tier }),
    onPitch: (pitchKind, text) => send({ kind: 'pitch', playerId: me(), pitchKind, text }),
    onRole: (role) => send({ kind: 'role', playerId: me(), role }),
    onReroll: () => send({ kind: 'reroll', playerId: me() }),
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
    onAudio: (patch) => audio.update(patch),
  }, roadmap);
  const lobby = createLobby($('#lobby'), {
    onStart: () => startHostedRun(),
    onBots: (count) => {
      const s = session;
      if (s?.role !== 'host' || !s.room || s.started) return;
      s.room.setBots(count);
      renderLobby(s);
    },
    onLeave: () => {
      if (session?.role === 'host') stores.hostRoom.clear();
      else {
        stores.peerRoom.clear();
        if (session?.code) stores.seats.clear(session.code);
      }
      endSession();
    },
  });

  function showTitle(notice?: string): void {
    title.render(titleViewModel(stores.history.list(), stores.snapshot.load(), stores.peerRoom.load()), stores.settings.get(), notice);
    title.show();
    for (const o of [hud, night, closing, weekEnd, pause, lobby]) o.hide();
    audio.setAmbience(ambienceFor(null));
  }

  function runOptions(choice: StartChoice, hostId: PlayerId, players: Member[], bots: BotsChoice = 'auto'): CreateRunOptions {
    const settings = stores.settings.get();
    return {
      seed: choice.seed ?? Math.floor(Math.random() * 2 ** 31),
      hostId,
      players: players.map((m) => ({ id: m.token, name: m.name })),
      settings: { pace: choice.pace, dayLengthSec: choice.dayLengthSec, nightLengthSec: settings.nightLengthSec, bots },
      // P3 B13: every new run opens as a kerbside stand and grows from there.
      tier: 'stand',
    };
  }

  function createSession(role: Role, code: string | null, transport: Transport, playerId: PlayerId): Session {
    endSession(false);
    const s: Session = {
      role,
      code,
      transport,
      room: null,
      unsubscribers: [],
      watchdog: null,
      telemetry: null,
      teleTimer: null,
      me: playerId,
      prev: null,
      next: null,
      nextArrivedAt: performance.now(),
      lastPhase: null,
      lastClosing: null,
      lastSaveMs: 0,
      recorded: false,
      soundSeq: 0,
      members: [],
      peerStatus: 'hosting',
      started: false,
      pendingStart: null,
      lobbyBots: null,
    };
    s.unsubscribers.push(transport.onSnapshot((snap) => onSnapshot(s, snap)));
    s.unsubscribers.push(
      transport.onError((message) => {
        console.error('Transport error:', message);
        if (s.role === 'peer') stores.peerRoom.clear();
        abandonSession(s, s.role === 'peer' ? message : 'The run hit an error and had to be discarded. Sorry about that.');
      }),
    );
    session = s;
    title.hide();
    hud.setRoom(code);
    hud.show();
    renderer.setLocalPlayer(playerId);
    return s;
  }

  /** The simulation must produce a first snapshot soon after start/resume, or the save is bad. */
  function armWatchdog(s: Session): void {
    s.watchdog = setTimeout(() => abandonSession(s, 'The saved run could not be started, so it was discarded.'), 2000);
  }

  function renderLobby(s: Session): void {
    if (!s.code) return;
    const bots = s.role === 'host' ? (s.room?.bots() ?? null) : s.lobbyBots;
    lobby.render(
      lobbyViewModel({ code: s.code, members: s.members, isHost: s.role === 'host', status: s.peerStatus, started: s.started, ...(bots ? { bots } : {}) }),
    );
  }

  function startSolo(choice: StartChoice): void {
    const settings = stores.settings.set({ playerName: choice.name, pace: choice.pace, dayLengthSec: choice.dayLengthSec });
    stores.hostRoom.clear(); // a solo run never reopens an old room
    const tele = newTelemetry(settings.playerName);
    const local = withTelemetry(createLocalTransport(), tele);
    const id = tabIdentity();
    const s = createSession('solo', null, local, id);
    attachTelemetry(s, tele);
    armWatchdog(s);
    local.start(runOptions(choice, id, [{ token: id, name: settings.playerName }]));
  }

  function openHostRoom(s: Session, local: Transport, code: string, hostMember: Member): void {
    const link = roomLinkFor(code, createTrysteroLink);
    s.room = createHostRoom(link, local, hostMember, (members) => {
      s.members = members;
      renderLobby(s);
    }, { onTele: (token, events) => s.telemetry?.peerEvents(token, events) });
    s.members = s.room.members();
    s.peerStatus = 'hosting';
    renderLobby(s);
  }

  function startHost(choice: StartChoice): void {
    const settings = stores.settings.set({ playerName: choice.name, pace: choice.pace, dayLengthSec: choice.dayLengthSec });
    const code = makeRoomCode(Math.random);
    stores.hostRoom.save({ code, role: 'host' });
    const tele = newTelemetry(settings.playerName);
    const local = withTelemetry(createLocalTransport(), tele);
    const id = tabIdentity();
    const s = createSession('host', code, local, id);
    attachTelemetry(s, tele);
    s.pendingStart = choice;
    openHostRoom(s, local, code, { token: id, name: settings.playerName });
    lobby.show();
  }

  function startHostedRun(): void {
    const s = session;
    if (!s || s.role !== 'host' || s.started || !s.pendingStart || !s.room) return;
    armWatchdog(s);
    s.transport.start(runOptions(s.pendingStart, s.me, s.room.members(), s.room.bots().bots));
    s.pendingStart = null;
  }

  function startPeer(rawCode: string, name: string): void {
    const code = normalizeRoomCode(rawCode);
    if (!code) {
      showTitle('Room codes are five letters, like KQZTM.');
      return;
    }
    const settings = stores.settings.set({ playerName: name.trim() || 'Barista' });
    stores.peerRoom.save({ code, role: 'peer' });
    const id = tabIdentity();
    const prev = stores.seats.load(code);
    const transport = createPeerTransport(code, id, settings.playerName, prev && prev !== id ? prev : undefined);
    const s = createSession('peer', code, transport, id);
    stores.seats.save(code, id);
    // The host handed back an older seat (this browser's, or an away barista with our name): play as it.
    s.unsubscribers.push(
      transport.onSeat((token) => {
        if (session !== s) return;
        s.me = token;
        renderer.setLocalPlayer(token);
        stores.seats.save(code, token);
        try {
          perTab.setItem('cafetycoon.tab', token);
        } catch {
          /* per-tab storage blocked: the seat store still has it */
        }
      }),
    );
    // Closing the tab: leave the room at once so the seat shows as away and can be reclaimed.
    const onPageHide = () => {
      if (session === s) s.transport.close();
    };
    window.addEventListener('pagehide', onPageHide);
    s.unsubscribers.push(() => window.removeEventListener('pagehide', onPageHide));
    s.peerStatus = 'connecting';
    const buffer = createUiBuffer();
    setUiTelemetrySink(buffer.push);
    s.teleTimer = setInterval(() => transport.sendTele(buffer.drain()), 2000);
    s.unsubscribers.push(
      transport.onStatus((status) => {
        s.peerStatus = status;
        if (status === 'hostAway') lobby.show();
        else if (status === 'connected' && s.next) lobby.hide();
        renderLobby(s);
      }),
    );
    s.unsubscribers.push(
      transport.onLobby((msg) => {
        s.members = msg.members;
        s.started = msg.started;
        s.lobbyBots = msg.bots !== undefined ? { bots: msg.bots, picked: msg.botsPicked === true } : null;
        renderLobby(s);
      }),
    );
    renderLobby(s);
    lobby.show();
  }

  function resume(): void {
    const saved = stores.snapshot.load();
    if (!saved) return showTitle();
    const room = stores.hostRoom.load();
    const hostName = saved.players.find((p) => p.id === saved.hostId)?.name ?? stores.settings.get().playerName;
    const tele = newTelemetry(hostName);
    const local = withTelemetry(createLocalTransport(), tele);
    if (room?.role === 'host') {
      const s = createSession('host', room.code, local, saved.hostId);
      attachTelemetry(s, tele);
      openHostRoom(s, local, room.code, { token: saved.hostId, name: hostName });
      armWatchdog(s);
      local.resume(markPeersAway(saved, saved.hostId));
      return;
    }
    const s = createSession('solo', null, local, saved.hostId);
    attachTelemetry(s, tele);
    armWatchdog(s);
    local.resume(saved);
  }

  /** A run that crashed, never produced a snapshot, or lost its host for good: back to the title with a note. */
  function abandonSession(s: Session, message: string): void {
    if (session !== s) return;
    if (s.role !== 'peer') stores.snapshot.clear();
    endSession(false);
    showTitle(message);
  }

  function endSession(backToTitle = true): void {
    const s = session;
    if (s) {
      if (s.watchdog) clearTimeout(s.watchdog);
      if (s.teleTimer) clearInterval(s.teleTimer);
      for (const u of s.unsubscribers) u();
      s.room?.close();
      s.transport.close();
    }
    session = null;
    setUiTelemetrySink(null);
    hud.setRoom(null);
    hud.setJuice(null);
    renderer.setLocalPlayer(null);
    lobby.hide();
    if (backToTitle) showTitle();
  }

  function onSnapshot(s: Session, snap: HostToClient): void {
    if (session !== s) return;
    if (s.watchdog) {
      clearTimeout(s.watchdog);
      s.watchdog = null;
    }
    const state = snap.state;
    const now = performance.now();
    const sound = diffCues(s.next, state, s.me, s.soundSeq);
    s.soundSeq = sound.lastSeq;
    for (const cue of sound.cues) audio.play(cue);
    audio.setAmbience(ambienceFor(state));
    s.prev = s.next;
    s.next = state;
    s.nextArrivedAt = now;
    if (!s.started) {
      s.started = true;
      renderLobby(s);
    }
    if (s.peerStatus !== 'hostAway') lobby.hide();
    hud.render(hudViewModel(state), hudLive(state, s.me));

    if (state.phase === 'closing') s.lastClosing = state;
    if (state.phase === 'night') night.render(nightViewModel(state, s.me), nightExtras(state, s.me), s.code);

    const canSave = s.role !== 'peer';
    if (state.phase !== s.lastPhase) {
      const from = s.lastPhase;
      s.lastPhase = state.phase;
      // The day's receipt leads into the night shop; after the last day (or a missed rent) the
      // week-end screen sums up instead, so the receipt ("On to the night shop") stays hidden.
      if (from === 'closing' && s.lastClosing && state.phase === 'night') {
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
        // Lifetime records (this browser): a week counts once; a later stop adds only the new days.
        stores.records.record(state, awardsFor(state), today(), scoreRun(state));
      } else {
        weekEnd.hide();
      }
      if (state.phase === 'ended') {
        if (!s.recorded) {
          s.recorded = true;
          stores.history.append(summarizeRun(state, today()));
        }
        if (canSave) stores.snapshot.clear();
        if (s.role === 'host') stores.hostRoom.clear();
        if (s.role === 'peer') stores.peerRoom.clear();
      } else if (canSave) {
        stores.snapshot.save(state);
        s.lastSaveMs = now;
      }
    } else if (canSave && state.phase === 'day' && now - s.lastSaveMs > 10_000) {
      stores.snapshot.save(state);
      s.lastSaveMs = now;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !typingText()) {
      audio.toggleMute();
      return;
    }
    if (e.code === 'Escape' && session?.next) {
      e.preventDefault();
      const s = session;
      pause.render({
        audio: audio.settings(),
        pace: s.next!.settings.pace,
        dayLengthSec: s.next!.settings.dayLengthSec,
        isHost: s.me === s.next!.hostId,
        room: s.code ? { code: s.code, members: s.members.map((m) => m.name) } : undefined,
      });
      pause.toggle();
    }
    const field = document.activeElement?.tagName ?? '';
    if (e.code === 'KeyR' && !e.repeat && session?.next && !['INPUT', 'TEXTAREA', 'SELECT'].includes(field)) {
      e.preventDefault();
      session.transport.sendInput({ kind: 'drop', playerId: session.me });
    }
  });

  function frame(): void {
    requestAnimationFrame(frame); // re-arm first so a bad frame can never stop rendering for good
    const now = performance.now();
    // A background tab's frames are throttled, not slow: skip the measurement and start over on return.
    if (document.hidden) lastFrameAt = null;
    else {
      if (lastFrameAt !== null && now - lastFrameAt > 250) uiTelemetry.ui('frame.long', { ms: Math.round(now - lastFrameAt) });
      lastFrameAt = now;
    }
    try {
      drawAndSend();
    } catch (err) {
      console.error('Frame error:', err);
    }
  }

  const heart = createHeartbeat();

  function drawAndSend(): void {
    const s = session;
    if (s?.next) {
      const alpha = (performance.now() - s.nextArrivedAt) / SNAPSHOT_INTERVAL_MS;
      renderer.update(interpolateView(s.prev, s.next, alpha));
      hud.setJuice(renderer.getJuice());
      const vec = keyboard.read();
      interactPending = keyboard.takeInteract() || interactPending;
      const changed = vec.x !== lastSent.x || vec.y !== lastSent.y;
      if ((changed || interactPending) && gate.allow()) {
        s.transport.sendInput({ kind: 'move', playerId: s.me, x: vec.x, y: vec.y, interact: interactPending });
        lastSent = vec;
        interactPending = false;
      }
      // espresso tell: the local barista hears their heart speed up from the 3rd shot
      if (heart.tick(performance.now(), heartbeatGapMs(s.next, s.me))) audio.play({ id: 'heartbeat', mine: true });
      // Q: drink a shot (one-shot input; the host decides whether it counts)
      if (keyboard.takeEspresso()) s.transport.sendInput({ kind: 'espresso', playerId: s.me });
      const secret = keyboard.takeSecret();
      if (secret) s.transport.sendInput({ kind: 'secret', playerId: s.me, code: secret });
    }
  }

  syncMute();
  window.cafetycoon = {
    version: APP_VERSION,
    telemetry: { download: downloadTelemetry, rows: telemetryRows },
    peek: { state: () => (session?.next ? structuredClone(session.next) : null), me: () => session?.me ?? null },
  };
  showTitle();
  requestAnimationFrame(frame);
}

main();
