import { Container } from 'pixi.js';
import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { TICK_RATE } from '../sim/constants';
import { computeModifiers } from '../sim/effects';
import { nearestStation } from '../sim/movement';
import type { GameState, PlayerId } from '../sim/types';
import type { RenderView } from './interpolate';
import { Actors } from './layers/actors';
import { Chaos } from './layers/chaos';
import { EventVisuals } from './layers/events';
import { crewBursts, newCrewMemory, vibeLabel, type CrewBurst } from './crewModel';
import { buildDecor } from './layers/decor';
import { EspressoGags, fellAtScreen, shakePx } from './layers/espresso';
import { Effects } from './layers/fx';
import { ESPRESSO } from '../sim/espresso';
import { buildFloor } from './layers/floor';
import { Lighting, buildLamps } from './layers/light';
import { StationOverlay, buildStation, type StationOverlayState } from './layers/stations';
import { buildWall } from './layers/wall';
import { FRONT, MAT, PLAYER_COLORS, TILE as THEME_TILE, WALL, isNightLook, sx, sy } from './theme';

export const TILE = THEME_TILE;
export const SCENE_BACKGROUND = MAT.backdrop;

/** Canvas size: the sim floor plus the render-only back wall and front margin. */
export const SCENE_WIDTH = LAYOUT.width * TILE;
export const SCENE_HEIGHT = WALL + LAYOUT.height * TILE + FRONT;

/**
 * The café as a little diorama, drawn from a RenderView. Layers, back to front:
 * wall → floor (both cached) → depth-sorted stations/decor/people → lighting → overlays (bars, focus, tags) → fx.
 * Purely visual: positions come straight from the sim, and the art for each station stays inside its tile.
 */
export class Scene {
  readonly root = new Container();
  private readonly wall = buildWall(SCENE_WIDTH);
  private readonly depth = new Container();
  private readonly overlay = new Container();
  private readonly tags = new Container();
  private readonly stationOverlay = new StationOverlay();
  private readonly lighting = new Lighting(SCENE_WIDTH, SCENE_HEIGHT);
  private readonly fx = new Effects();
  private readonly actors: Actors;
  private readonly gags: EspressoGags;
  private readonly chaos: Chaos;
  private readonly eventFx: EventVisuals;
  /** Shots per player as last drawn, to pop a "+30%" when someone drinks. */
  private readonly shotsSeen = new Map<PlayerId, number>();
  private localId: PlayerId | null = null;
  private lastTime = performance.now() / 1000;
  private crewState: GameState | null = null;
  private crewSeq = -1;
  private readonly crewMem = newCrewMemory();

  constructor() {
    const floor = buildFloor(SCENE_WIDTH, SCENE_HEIGHT, LAYOUT.door);
    floor.cacheAsTexture(true);
    this.depth.sortableChildren = true;
    for (const s of LAYOUT.stations) this.depth.addChild(buildStation(s.kind, s.pos));
    for (const d of buildDecor(SCENE_WIDTH, LAYOUT.height)) this.depth.addChild(d);
    this.actors = new Actors(this.depth, this.tags);
    this.gags = new EspressoGags(this.depth);
    this.chaos = new Chaos(this.depth);
    this.eventFx = new EventVisuals(this.depth, this.chaos.overlay, SCENE_WIDTH, SCENE_HEIGHT);
    this.overlay.addChild(this.stationOverlay.root, this.tags, this.chaos.overlay);
    this.root.addChild(this.wall.root, buildLamps(), floor, this.chaos.floor, this.depth, this.lighting.root, this.eventFx.wash, this.overlay, this.fx.root);
  }

  /** Which barista is "me" (gets the ring and the station focus). Unset = the only player, if there's exactly one. */
  setLocalPlayer(id: PlayerId | null): void {
    this.localId = id;
  }

  update(view: RenderView): void {
    const { state } = view;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.lastTime));
    this.lastTime = now;

    const night = isNightLook(state.phase);
    this.wall.setNight(night);
    this.lighting.setNight(night);

    const mods = computeModifiers(state);
    const stations: StationOverlayState[] = state.stations.map((s) => {
      let progress: number | null = null;
      if (s.busyTicksLeft > 0 && s.kind !== 'counter' && s.kind !== 'trash') {
        const total = Math.round((ECONOMY.stationSeconds[s.kind] / mods.stationSpeed[s.kind]) * TICK_RATE);
        progress = Math.max(0, Math.min(1, 1 - s.busyTicksLeft / total));
      }
      return {
        kind: s.kind,
        pos: s.pos,
        progress,
        output: s.output,
        cat: state.eggs?.cat?.stationId === s.id,
        smoke: state.eggs?.smoke?.stationId === s.id,
      };
    });

    const localId = this.localId ?? (state.players.length === 1 ? state.players[0].id : null);
    const me = localId ? state.players.find((p) => p.id === localId) : undefined;
    let focus = null;
    if (me && me.connected && (state.phase === 'day' || state.phase === 'closing')) {
      const pos = view.baristaPositions[me.id] ?? me.pos;
      focus = nearestStation(state, pos)?.pos ?? null;
    }

    this.stationOverlay.update(stations, focus, now);
    const simAge = (p: (typeof state.players)[number]) => {
      const at = p.espresso?.collapsedAt;
      return at == null ? null : Math.max(0, (state.tick - at) / TICK_RATE);
    };
    const poses = this.gags.update(state.players, simAge, now, (p) => fellAtScreen(p.espresso?.fellAt ?? p.pos));
    this.actors.update(state.players, view.baristaPositions, state.customers, localId, now, poses);
    this.chaos.update(state, now, dt);
    this.eventFx.update(state, now);
    this.espressoPops(state.players, view.baristaPositions);

    // espresso tell: the local barista's screen shakes from the 4th shot, and jolts when they hit the floor
    const shake = shakePx(me, me ? simAge(me) : null);
    const jolt = this.chaos.joltPx(now);
    this.root.position.set((shake ? Math.sin(now * 93) * shake : 0) + jolt.x, (shake ? Math.cos(now * 77) * shake * 0.7 : 0) + jolt.y);

    if (state !== this.crewState) {
      const { bursts, lastSeq } = crewBursts(this.crewState, state, this.crewSeq, this.crewMem);
      this.crewSeq = lastSeq;
      this.crewState = state;
      for (const b of bursts) this.crewBurst(b, state, view.baristaPositions);
    }
    this.fx.step(dt);
  }

  /** Serve toasts, combo cheers, fail feedback, and juice punches. */
  private crewBurst(b: CrewBurst, state: GameState, positions: Record<PlayerId, { x: number; y: number }>): void {
    const counter = LAYOUT.stations.find((s) => s.kind === 'counter')!;
    const cx = sx(counter.pos.x);
    const cy = sy(counter.pos.y);
    if (b.kind === 'serve') {
      const color = b.playerIndex >= 0 ? PLAYER_COLORS[b.playerIndex % PLAYER_COLORS.length] : 0x9a8a7a;
      this.fx.toast(b.text, color, cx, cy - 74, b.perfect);
      if (b.perfect) {
        this.fx.confetti(cx, cy - 40, 18);
        this.fx.sparkles(cx, cy - 50, 4);
        this.fx.spawn('Perfect!', cx + 70, cy - 50, 0x7fcfb4, 15);
      }
      if (b.customerKind === 'regular') {
        this.fx.hearts(cx, sy(LAYOUT.queueSlots[0].y) - 70);
        if (b.regular) this.fx.spawn(`${b.regular}'s usual!`, cx - 78, cy - 36, 0xffd6e2, 14);
      }
    } else if (b.kind === 'teamwork') {
      this.fx.spawn(`${b.from} + ${b.to}: teamwork!`, cx, cy - 150, 0xfff2b8, 15);
      this.fx.sparkles(cx, cy - 30, 8);
      this.fx.confetti(cx, cy - 40, 12);
      this.chaos.punch(0.2);
    } else if (b.kind === 'streak') {
      const hat = b.count === 3;
      this.fx.spawn(hat ? 'Hat trick! 3 perfect in a row' : `${b.count} combo!`, cx, cy - 175, 0xf6c35b, hat ? 20 : 18);
      this.fx.confetti(cx - 120, cy - 60, 22);
      this.fx.confetti(cx + 120, cy - 60, 22);
      this.fx.sparkles(cx, cy - 80, 10);
      this.chaos.punch(hat ? 0.32 : 0.26);
    } else if (b.kind === 'oops') {
      const p = state.players[b.playerIndex];
      const pos = positions[p.id] ?? p.pos;
      this.fx.spawn('Oops!', sx(pos.x), sy(pos.y) - 122, 0xf0a63a, 17);
    } else if (b.kind === 'storm') {
      this.fx.spawn(b.count > 1 ? `${b.count} stormed out!` : 'Stormed out!', cx, cy - 140, 0xe0564a, 17);
      this.chaos.punch(0.28);
    } else if (b.kind === 'slip') {
      const p = state.players.find((x) => x.id === b.playerId);
      const pos = p ? (positions[p.id] ?? p.pos) : { x: LAYOUT.width / 2, y: LAYOUT.height / 2 };
      this.fx.spawn('Slip!', sx(pos.x), sy(pos.y) - 100, 0xf0a63a, 16);
    } else if (b.kind === 'wrong') {
      this.fx.spawn(b.text, cx, cy - 120, 0xe0564a, 15);
    } else if (b.kind === 'challenge') {
      this.fx.spawn(`Challenge! +$${b.reward}`, cx, cy - 160, 0x7fcfb4, 16);
      this.fx.confetti(cx, cy - 50, 16);
      this.fx.sparkles(cx, cy - 40, 6);
      this.chaos.punch(0.18);
    } else {
      // the influencer's photo: flash, the whole crew sparkles, "Say latte!"
      this.eventFx.flashNow();
      for (const p of state.players) {
        const pos = positions[p.id] ?? p.pos;
        this.fx.sparkles(sx(pos.x), sy(pos.y) - 70);
      }
      this.fx.spawn('Say latte!', cx, cy - 120, 0xe98aa6, 22);
      this.chaos.punch(0.22);
    }
  }

  private espressoPops(players: GameState['players'], positions: Record<PlayerId, { x: number; y: number }>): void {
    for (const p of players) {
      const shots = p.espresso?.shots ?? 0;
      const seen = this.shotsSeen.get(p.id);
      this.shotsSeen.set(p.id, shots);
      if (seen === undefined || shots <= seen) continue;
      const pos = positions[p.id] ?? p.pos;
      const x = sx(pos.x);
      const y = sy(pos.y) - 90;
      if (p.espresso?.out) this.fx.spawn('Too much espresso!', x, y);
      else {
        const pct = Math.round(ESPRESSO.boosts[Math.min(shots, ESPRESSO.boosts.length) - 1] * 100);
        this.fx.spawn(shots === ESPRESSO.boosts.length ? `+${pct}% speed... one more?` : `+${pct}% speed`, x, y);
      }
    }
  }
  /** Juice pass HUD: vibe 0..100, combo streak, and label. */
  getJuice(): { vibe: number; combo: number; label: string; tone: 'high' | 'mid' | 'low' } {
    const v = this.crewMem.vibe;
    const lab = vibeLabel(v);
    return { vibe: v, combo: this.crewMem.streak, label: lab.text, tone: lab.tone };
  }

}
