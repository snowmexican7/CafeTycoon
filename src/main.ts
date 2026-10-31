import { dayRestockVM } from './ui/dayRestock';
import { freshEvents, logToastLines, TOAST_KINDS } from './ui/logToasts';
import { reviewPopVM } from './ui/feed';
import './style.css';
import { gearFlag } from './ui/gearFlag';
/** Gear Tree G5: the last gear quirk already toasted (log seq). */
let gearSeenSeq = -1;
/** ui-3.7.1: last log seq turned into a toast (rush restocks, Strategist menu changes); null until a session's first snapshot. */
let toastSeenSeq: number | null = null;
/** FB2 C11: last log seq shown as a live review.post phone pop-up. */
let reviewSeenSeq: number | null = null;
/** ui-3.7.1: the Konami code ends …→ B A, so a B straight after → isn't the Restock key. */
let lastKey = { code: '', at: 0 };
import { ambienceFor, createHeartbeat, diffCues, heartbeatGapMs } from './audio/cues';
import { createAudioEngine } from './audio/engine';
import { SNAPSHOT_INTERVAL_MS } from './host/loop';
import { createTelemetry, withTelemetry, createUiBuffer, setUiTelemetrySink, uiTelemetry, type Telemetry } from './host/telemetry';
import { createHostRoom, type HostRoom } from './net/hostRoom';
import { markPeersAway } from './net/hostResume';
import { createLocalTransport } from './net/localTransport';
import type { PeerStatus } from './net/peerSession';
import { createPeerSession } from './net/peerSession';
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
import { createMetaStore } from './storage/metaStore';
import { PERKS, type PerkId } from './data/perks';
import { createRecordsDialog } from './ui/records';
import type { CreateRunOptions, GameState, Phase, PlayerId, PlayerInput, PlayerLook } from './sim/types';
import { createHistoryStore } from './storage/historyStore';
import { createRoomStore } from './storage/roomStore';
import { createSeatStore } from './storage/seatStore';
import { memoryStorage, type StorageLike } from './storage/storageLike';
import { createSettingsStore } from './storage/settingsStore';
import { createSnapshotStore } from './storage/snapshotStore';
import { APP_VERSION } from './version';
import { createClosing } from './ui/closing';
import { createHud } from './ui/hud';
import { loadRecipeHints, saveRecipeHints } from './ui/tickets';
import { hudLive, nightExtras } from './ui/live';
import { atCarrySpot, carryTarget, nearestCarrySpot, type StationCarry } from './ui/rearrangeCarry';
import { inPreOpen } from './sim/rearrange';
import { createLobby } from './ui/lobby';
import { createDevPanel, isDevMode } from './ui/dev';
import { createCreator } from './ui/creator';
import { loadLook, saveLook } from './ui/lookStore';
import { createLookPreview } from './render/lookPreview';
import { createNight } from './ui/night';
import { nightInputHandlers } from './ui/nightInputs';
import { createPause } from './ui/pause';
import { createGrowFx } from './ui/growFx';
import { detectGrow, gainedDiff, growSeen, type GrowSeen } from './ui/growModel';
import { createHints } from './ui/hints';
import { hintsStatus, isSnoozed } from './ui/hintsModel';
import { createRoadmap } from './ui/roadmap';
import { createTitle, type StartChoice } from './ui/title';
import { closingViewModel, hudViewModel, lobbyViewModel, migrateNightLength, NIGHT_LENGTH_MIGRATION, nightLengthForSim, nightViewModel, titleViewModel, weekEndViewModel } from './ui/viewModels';
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
  // P3 B16: head starts carried between runs (own key and version; never blocks a new run).
  meta: createMetaStore(localStorage),
};
// FB1 WP1: nights default to 2:00 now, and Relaxed is a real 0. Migrate a stored old value once
// per step (60 s default -> 120 s; the 600 s Relaxed stand-in -> 0); a later pick sticks.
try {
  const FLAG = 'cafetycoon.fb1.nightLength';
  const from = Number(localStorage.getItem(FLAG) ?? 0) || 0;
  if (from < NIGHT_LENGTH_MIGRATION) {
    const next = migrateNightLength(stores.settings.get().nightLengthSec, from);
    if (next !== stores.settings.get().nightLengthSec) stores.settings.set({ nightLengthSec: next });
    localStorage.setItem(FLAG, String(NIGHT_LENGTH_MIGRATION));
  }
} catch { /* storage blocked: the title picker still offers every length */ }
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
  /** ui-3.4.0: last seen seed + tier, to spot a grow and play the transition. */
  growSeen?: GrowSeen | null;
  lastSaveMs: number;
  recorded: boolean;
  /** P3 B16: head starts this run unlocked (shown on the week-end screen). */
  perksNew: PerkId[];
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
  const records = createRecordsDialog(() => stores.records.get(), () => stores.meta.get());
  const title = createTitle($('#title'), {
    // ui-3.5.2 (R4 e): "Make your barista" comes up before day 1 of every new game (Skip keeps the saved look).
    onStart: (choice) => void pickLook().then((look) => startSolo(choice, look)),
    onHost: (choice) => void pickLook().then((look) => startHost(choice, look)),
    onJoin: (code, name) => void pickLook().then((look) => startPeer(code, name, look)),
    onResume: () => resume(),
    onRejoin: (code) => startPeer(code, stores.settings.get().playerName, loadLook(hintStore)),
    onRecords: () => records.open(),
  }, roadmap);
  const hintStore = (() => { try { return window.localStorage; } catch { return undefined; } })();
  const creator = createCreator(document, createLookPreview);
  /** The creator before a new game: the chosen look is saved on this device; Skip keeps the last saved one. */
  async function pickLook(): Promise<PlayerLook | null> {
    const saved = loadLook(hintStore);
    const picked = await creator.open('start', saved);
    return picked ? (saveLook(hintStore, picked) ?? saved) : saved;
  }
  /** "Edit my barista" at night: save it and send the sim's night `look` input (R4 e). */
  async function editLook(): Promise<void> {
    const s = session;
    const mine = s?.next?.players.find((p) => p.id === s.me)?.look ?? loadLook(hintStore);
    const picked = await creator.open('edit', mine ?? null);
    if (!picked || session !== s) return;
    const look = saveLook(hintStore, picked);
    if (look) send({ kind: 'look', playerId: me(), look });
  }
  let recipeHints = loadRecipeHints(hintStore);
  /** FB2 C10: local-only station carry during the pre-open (ghost spots computed once on pickup). */
  let stationCarry: StationCarry | null = null;
  const clearCarry = () => {
    stationCarry = null;
    renderer.setGhostSpots(null);
  };
  const hud = createHud($('#hud'), {
    onMute: () => audio.toggleMute(),
    // ui-3.7.1: day-HUD Restock (rush delivery, 25% more). Cream & sugar comes by the box.
    onRestock: (id) => send(id === 'condiments' ? { kind: 'condimentBox', playerId: me(), boxes: 1 } : { kind: 'restock', playerId: me(), supply: id, packs: 1 }),
    // FB2 B8: syrup rack picker (1 vanilla · 2 caramel).
    onSyrup: (flavour) => send({ kind: 'syrup', playerId: me(), flavour }),
    onCloseEarly: (on) => send({ kind: 'closeEarly', playerId: me(), on }),
    onCall: (take) => send({ kind: 'call', playerId: me(), take }),
    onReady: () => send({ kind: 'ready', playerId: me() }),
    onOpenDoors: () => send({ kind: 'openDoors', playerId: me() }),
  }, { recipeHints });
  const night = createNight($('#night'), { ...nightInputHandlers(send, me), onEditLook: () => void editLook() });
  // ui-3.5.1: dev mode only with ?dev=1 (DEV badge, pause the night timer via devPause, stubs for more dev inputs).
  const dev = isDevMode(location.search) ? createDevPanel(document, send, me) : null;
  const closing = createClosing($('#closing'), { onGrow: (tier) => send({ kind: 'grow', playerId: me(), tier }) });
  const weekEnd = createWeekEnd($('#weekEnd'), {
    onContinue: () => send({ kind: 'weekEnd', playerId: me(), choice: 'continue' }),
    onStop: () => send({ kind: 'weekEnd', playerId: me(), choice: 'stop' }),
    onBackToTitle: () => endSession(),
  });
  const pause = createPause($('#pause'), {
    onSettings: (patch) => send({ kind: 'settings', playerId: me(), settings: patch }),
    onQuit: () => endSession(),
    onAudio: (patch) => audio.update(patch),
    onRecipeHints: (mode) => {
      recipeHints = mode;
      saveRecipeHints(hintStore, mode);
      hud.setRecipeHints(mode);
    },
    onTips: (action) => {
      hints.act(action);
      if (session?.next) pause.render(pauseInfo(session));
    },
  }, roadmap);
  // ui-3.4.0: the grow transition + "What you gained" card, and the new-player tips.
  const growFx = createGrowFx();
  const hints = createHints(hintStore ?? null);
  const pauseEl = $('#pause');
  const closingEl = $('#closing');
  const weekEndEl = $('#weekEnd');
  function pauseInfo(s: Session) {
    const st = hints.get();
    const now = Date.now();
    return {
      audio: audio.settings(),
      recipeHints,
      tips: { status: hintsStatus(st, now), off: !!st.off, snoozed: isSnoozed(st, now) },
      pace: s.next!.settings.pace,
      dayLengthSec: s.next!.settings.dayLengthSec,
      isHost: s.me === s.next!.hostId,
      room: s.code ? { code: s.code, members: s.members.map((m) => m.name) } : undefined,
    };
  }
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
    title.render(titleViewModel(stores.history.list(), stores.snapshot.load(), stores.peerRoom.load(), safeMeta()), stores.settings.get(), notice);
    title.show();
    for (const o of [hud, night, closing, weekEnd, pause, lobby]) o.hide();
    audio.setAmbience(ambienceFor(null));
  }

  /** The meta save must never get in the way of the title or a new run. */
  function safeMeta(): { unlocked: PerkId[]; lastPerk: PerkId | null } | undefined {
    try {
      return stores.meta.get();
    } catch (e) {
      console.warn('meta save unreadable', e);
      return undefined;
    }
  }

  function rememberPerk(choice: StartChoice): void {
    try {
      stores.meta.setLastPerk(choice.perk ?? null);
    } catch {
      /* never block a run */
    }
  }

  function runOptions(choice: StartChoice, hostId: PlayerId, players: Member[], bots: BotsChoice = 'auto'): CreateRunOptions {
    const settings = stores.settings.get();
    return {
      seed: choice.seed ?? Math.floor(Math.random() * 2 ** 31),
      hostId,
      players: players.map((m) => ({ id: m.token, name: m.name, ...(m.look ? { look: m.look } : {}) })),
      settings: { pace: choice.pace, dayLengthSec: choice.dayLengthSec, nightLengthSec: settings.nightLengthSec, bots },
      // P3 B13: every new run opens as a kerbside stand and grows from there.
      tier: 'stand',
      // G11 (v3.0.0): every new run is a Gear run; ?gear=0 is a hidden classic escape hatch.
      ...(gearFlag() ? { gear: true } : {}),
      // R4 a: a dev run (?dev=1): cash topped up, a pausable night, never saved to records.
      ...(isDevMode(location.search) ? { dev: true } : {}),
      // P3 B16: the host's head start (the sim ignores it in classic runs).
      ...(gearFlag() && choice.perk ? { perk: choice.perk } : {}),
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
      perksNew: [],
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
    toastSeenSeq = null; // ui-3.7.1: no toasts for events from before this session joined
    reviewSeenSeq = null; // FB2 C11: no review pop-ups for events from before this session joined
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

  function startSolo(choice: StartChoice, look: PlayerLook | null = null): void {
    const settings = stores.settings.set({ playerName: choice.name, pace: choice.pace, dayLengthSec: choice.dayLengthSec, nightLengthSec: nightLengthForSim(choice.nightLengthSec), ...(choice.soloBots !== undefined ? { soloBots: choice.soloBots } : {}) });
    stores.hostRoom.clear(); // a solo run never reopens an old room
    const tele = newTelemetry(settings.playerName);
    const local = withTelemetry(createLocalTransport(), tele);
    const id = tabIdentity();
    const s = createSession('solo', null, local, id);
    attachTelemetry(s, tele);
    armWatchdog(s);
    rememberPerk(choice);
    local.start(runOptions(choice, id, [{ token: id, name: settings.playerName, ...(look ? { look } : {}) }], settings.soloBots));
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

  function startHost(choice: StartChoice, look: PlayerLook | null = null): void {
    const settings = stores.settings.set({ playerName: choice.name, pace: choice.pace, dayLengthSec: choice.dayLengthSec, nightLengthSec: nightLengthForSim(choice.nightLengthSec) });
    const code = makeRoomCode(Math.random);
    stores.hostRoom.save({ code, role: 'host' });
    const tele = newTelemetry(settings.playerName);
    const local = withTelemetry(createLocalTransport(), tele);
    const id = tabIdentity();
    const s = createSession('host', code, local, id);
    attachTelemetry(s, tele);
    s.pendingStart = choice;
    openHostRoom(s, local, code, { token: id, name: settings.playerName, ...(look ? { look } : {}) });
    lobby.show();
  }

  function startHostedRun(): void {
    const s = session;
    if (!s || s.role !== 'host' || s.started || !s.pendingStart || !s.room) return;
    armWatchdog(s);
    rememberPerk(s.pendingStart);
    s.transport.start(runOptions(s.pendingStart, s.me, s.room.members(), s.room.bots().bots));
    s.pendingStart = null;
  }

  function startPeer(rawCode: string, name: string, look: PlayerLook | null = null): void {
    const code = normalizeRoomCode(rawCode);
    if (!code) {
      showTitle('Room codes are five letters, like KQZTM.');
      return;
    }
    const settings = stores.settings.set({ playerName: name.trim() || 'Barista' });
    stores.peerRoom.save({ code, role: 'peer' });
    const id = tabIdentity();
    const prev = stores.seats.load(code);
    // ui-3.5.2: createPeerTransport (src/net/peerTransport.ts) has no look parameter yet, so the session is built here.
    const transport = createPeerSession(roomLinkFor(code, createTrysteroLink), {
      token: id,
      name: settings.playerName,
      prev: prev && prev !== id ? prev : undefined,
      ...(look ? { look } : {}),
      timeoutMs: 15_000,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    });
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
    hints.hide();
    growFx.close();
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
    // FB2 C10: drop a local carry when the pre-open ends (or the run leaves the day).
    if (stationCarry && !inPreOpen(state)) clearCarry();
    hud.render(hudViewModel(state), hudLive(state, s.me, stationCarry));
    hud.setRestock(dayRestockVM(state));
    // ui-3.7.1: rush restocks and the Strategist's menu changes pop up (HUD by day, a bubble at night).
    // FB2 C10: station.reset (and a short place note) also toast.
    {
      const fresh = freshEvents(state, toastSeenSeq ?? state.nextLogSeq - 1, TOAST_KINDS);
      toastSeenSeq = fresh.seen;
      const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? 'Someone';
      const lines = logToastLines(fresh.events, nameOf, s.me);
      if (lines.length) (state.phase === 'night' ? night.toast(lines) : hud.toast(lines));
    }
    // FB2 C11: live review.post → phone pop-up during the day (name, text, sentiment, stars).
    {
      const fresh = freshEvents(state, reviewSeenSeq ?? state.nextLogSeq - 1, ['review.post']);
      reviewSeenSeq = fresh.seen;
      if (state.phase === 'day') {
        const posts = fresh.events.map(reviewPopVM).filter((p): p is NonNullable<typeof p> => !!p);
        if (posts.length) hud.feedPop(posts);
      }
    }
    // Gear Tree G5: jams, dead batteries and goose noises pop up as a toast.
    if (state.gear) {
      if (state.nextLogSeq <= gearSeenSeq) gearSeenSeq = -1; // a new run restarts the log
      const fresh = state.log.filter((e) => e.kind === 'gear.quirk' && e.seq > gearSeenSeq);
      if (fresh.length) {
        gearSeenSeq = fresh[fresh.length - 1].seq;
        hud.toast(fresh.map((e) => String(e.data.text)));
      }
    }

    if (state.phase === 'closing') s.lastClosing = state;
    // ui-3.4.0: a grow (same run, bigger tier) plays the re-opening wipe, then the "What you gained" card.
    const grew = detectGrow(s.growSeen ?? null, state);
    s.growSeen = growSeen(state);
    if (grew) {
      closing.hide();
      growFx.play(gainedDiff(grew.from, grew.to, !!state.gear));
    }
    hints.update(state, s.me, growFx.isOpen() || !pauseEl.hidden || !closingEl.hidden || !weekEndEl.hidden || state.phase === 'weekEnd' || state.phase === 'ended');
    if (state.phase === 'night') night.render(nightViewModel(state, s.me), nightExtras(state, s.me), s.code);
    dev?.update({ phase: state.phase, isHost: s.me === state.hostId, devRun: !!state.dev, paused: !!state.devPaused });

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
        // P3 B16: fold the run into this browser's meta progress first, so the screen can name new head starts.
        try {
          s.perksNew = [...new Set([...s.perksNew, ...stores.meta.record(state)])];
        } catch (e) {
          console.warn('meta save failed', e);
        }
        weekEnd.render({ ...weekEndViewModel(state, s.me), unlocks: s.perksNew.map((p) => `${PERKS[p].icon} ${PERKS[p].name}: ${PERKS[p].effect}`) }, state.phase === 'ended');
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
    const prevKey = lastKey;
    lastKey = { code: e.code, at: e.timeStamp };
    // ui-3.7.1: B opens the day Restock panel; 1-9 buy, B/Esc close (only by day, nothing on top, not while typing).
    // FB2 B8: 1/2 pick a syrup at the rack when the picker is up (restock, when open, still takes 1-9 first).
    if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && session?.next && !typingText() && pauseEl.hidden && closingEl.hidden && weekEndEl.hidden) {
      const afterArrow = e.code === 'KeyB' && prevKey.code === 'ArrowRight' && e.timeStamp - prevKey.at < 1500;
      if (!afterArrow && hud.restockKey(e)) {
        e.preventDefault();
        return;
      }
      if (hud.syrupKey(e)) {
        e.preventDefault();
        return;
      }
    }
    if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !typingText()) {
      audio.toggleMute();
      return;
    }
    if (e.code === 'Escape' && session?.next) {
      e.preventDefault();
      pause.render(pauseInfo(session));
      pause.toggle();
    }
    const field = document.activeElement?.tagName ?? '';
    if (e.code === 'KeyR' && !e.repeat && session?.next && !['INPUT', 'TEXTAREA', 'SELECT'].includes(field)) {
      e.preventDefault();
      // FB2 C10: R during a local carry just puts the ghost away (no drop input — hands aren't holding a cup).
      if (stationCarry && session.next && inPreOpen(session.next)) {
        clearCarry();
        return;
      }
      session.transport.sendInput({ kind: 'drop', playerId: session.me });
    }
    // FB2 C10: Z picks up / sets down a machine during the pre-open (local only until set-down).
    if (e.code === 'KeyZ' && !e.repeat && session?.next && !['INPUT', 'TEXTAREA', 'SELECT'].includes(field) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (tryRearrangeKey(session.next, session.me)) e.preventDefault();
    }
  });

  /** FB2 C10: Z or E during pre-open — pick up a machine locally, or send moveStation on set-down. */
  function tryRearrangeKey(state: GameState, playerId: PlayerId): boolean {
    if (!inPreOpen(state)) return false;
    const mePlayer = state.players.find((p) => p.id === playerId);
    if (!mePlayer) return false;
    if (stationCarry) {
      const to = nearestCarrySpot(stationCarry.spots, mePlayer.pos);
      if (!to || !atCarrySpot(mePlayer.pos, to)) return true; // carrying, but not on a spot yet
      send({ kind: 'moveStation', playerId, station: stationCarry.stationId, to });
      clearCarry();
      return true;
    }
    const t = carryTarget(state, playerId);
    if (!t) return true; // swallowed: E/Z do nothing else during pre-open
    stationCarry = t;
    renderer.setGhostSpots(t.spots);
    return true;
  }

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
      // FB2 C10: during pre-open, E is rearrange (local), never a sim interact.
      if (interactPending && inPreOpen(s.next)) {
        tryRearrangeKey(s.next, s.me);
        interactPending = false;
      }
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
