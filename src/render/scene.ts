import { Container } from 'pixi.js';
import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { TICK_RATE } from '../sim/constants';
import { computeModifiers } from '../sim/effects';
import { nearestStation } from '../sim/movement';
import type { PlayerId } from '../sim/types';
import type { RenderView } from './interpolate';
import { Actors } from './layers/actors';
import { buildDecor } from './layers/decor';
import { Effects } from './layers/fx';
import { buildFloor } from './layers/floor';
import { Lighting, buildLamps } from './layers/light';
import { StationOverlay, buildStation, type StationOverlayState } from './layers/stations';
import { buildWall } from './layers/wall';
import { FRONT, MAT, TILE as THEME_TILE, WALL, isNightLook, sx, sy } from './theme';

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
  private localId: PlayerId | null = null;
  private lastTime = performance.now() / 1000;

  constructor() {
    const floor = buildFloor(SCENE_WIDTH, SCENE_HEIGHT, LAYOUT.door);
    floor.cacheAsTexture(true);
    this.depth.sortableChildren = true;
    for (const s of LAYOUT.stations) this.depth.addChild(buildStation(s.kind, s.pos));
    for (const d of buildDecor(SCENE_WIDTH, LAYOUT.height)) this.depth.addChild(d);
    this.actors = new Actors(this.depth, this.tags);
    this.overlay.addChild(this.stationOverlay.root, this.tags);
    this.root.addChild(this.wall.root, buildLamps(), floor, this.depth, this.lighting.root, this.overlay, this.fx.root);
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
      return { kind: s.kind, pos: s.pos, progress, output: s.output };
    });

    const localId = this.localId ?? (state.players.length === 1 ? state.players[0].id : null);
    const me = localId ? state.players.find((p) => p.id === localId) : undefined;
    let focus = null;
    if (me && me.connected && (state.phase === 'day' || state.phase === 'closing')) {
      const pos = view.baristaPositions[me.id] ?? me.pos;
      focus = nearestStation(state, pos)?.pos ?? null;
    }

    this.stationOverlay.update(stations, focus, now);
    this.actors.update(state.players, view.baristaPositions, state.customers, localId, now);

    const counter = LAYOUT.stations.find((s) => s.kind === 'counter');
    if (counter) this.fx.track(state.day, state.today.sales + state.today.tips, sx(counter.pos.x), sy(counter.pos.y) - 70);
    this.fx.step(dt);
  }
}
