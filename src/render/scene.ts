import { Container, Graphics } from 'pixi.js';
import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
import { TICK_RATE } from '../sim/constants';
import { computeModifiers } from '../sim/effects';
import { nearestStation } from '../sim/movement';
import type { CheckoutId, GameState, PlayerId, Station, TierId, Vec2 } from '../sim/types';
import type { RenderView } from './interpolate';
import { Actors } from './layers/actors';
import { Chaos } from './layers/chaos';
import { EventVisuals } from './layers/events';
import { crewBursts, newCrewMemory, vibeLabel, type CrewBurst } from './crewModel';
import { trayBursts, type TrayBurst } from './trayModel';
import { buildDecor } from './layers/decor';
import { EspressoGags, fellAtScreen, shakePx } from './layers/espresso';
import { Effects } from './layers/fx';
import { ESPRESSO } from '../sim/espresso';
import { buildFloor } from './layers/floor';
import { Lighting, buildLamps } from './layers/light';
import { StationOverlay, buildEmptySlot, buildStation, setBarSkin, type StationOverlayState } from './layers/stations';
import { PickupVisuals } from './layers/pickup';
import { CountsLayer } from './layers/counts';
import { SinkVisuals } from './layers/sink';
import { FridgeVisuals } from './layers/fridge';
import { fridgeGear } from '../sim/fridge';
import type { FridgeId } from '../data/fridges';
import { counterSpotOf } from './pickupModel';
import { emptySlotPositions, stationBadges, wallMenuRows } from './slotModel';
import { GEAR } from '../data/gear';
import { buildWall } from './layers/wall';
import { buildLot } from './layers/lot';
import { buildOutdoor } from './layers/outdoor';
import { barSkin, isOutdoor, tierLook } from './tierLook';
import { layoutFor } from '../data/layout';
import { availableDrinks } from '../sim/customers';
import { menuDrinks } from '../sim/unlocks';
import { label } from './layers/draw';
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
  private readonly pickup: PickupVisuals;
  private readonly counts = new CountsLayer();
  private readonly sink: SinkVisuals;
  private readonly fridge: FridgeVisuals;
  /** Shots per player as last drawn, to pop a "+30%" when someone drinks. */
  private readonly shotsSeen = new Map<PlayerId, number>();
  private localId: PlayerId | null = null;
  private lastTime = performance.now() / 1000;
  private crewState: GameState | null = null;
  private crewSeq = -1;
  private readonly crewMem = newCrewMemory();
  /** FB2 B7: tray refuse / cue cursor (same idea as crewSeq; shared log, separate so a miss never eats the other). */
  private traySeq = -1;

  constructor() {
    const floor = buildFloor(SCENE_WIDTH, SCENE_HEIGHT, LAYOUT.door);
    floor.cacheAsTexture(true);
    this.depth.sortableChildren = true;
    this.buildStations('register', undefined);
    for (const d of buildDecor(SCENE_WIDTH, LAYOUT.height)) {
      d.visible = !isOutdoor(tierLook(this.lotTier));
      this.decor.push(d);
      this.depth.addChild(d);
    }
    this.actors = new Actors(this.depth, this.tags);
    this.gags = new EspressoGags(this.depth);
    this.chaos = new Chaos(this.depth);
    this.eventFx = new EventVisuals(this.depth, this.chaos.overlay, SCENE_WIDTH, SCENE_HEIGHT);
    this.pickup = new PickupVisuals(this.depth);
    this.sink = new SinkVisuals(this.depth);
    this.fridge = new FridgeVisuals(this.depth);
    this.overlay.addChild(this.stationOverlay.root, this.pickup.overlay, this.sink.overlay, this.fridge.overlay, this.counts.root, this.tags, this.chaos.overlay);
    // ui-3.4.0: the outdoor backdrop (stand, cart) covers the café wallpaper and floor; the menu board stays on top.
    this.root.addChild(this.wall.root, buildLamps(), floor, this.outdoorBack, this.wall.menuBoard, this.soldOutSign, this.chaos.floor, this.pickup.floor, this.depth, this.lot, this.lighting.root, this.eventFx.wash, this.overlay, this.fx.root);
  }

  /** FB1 WP4: a red "SOLD OUT" strip hung across the chalkboard menu while nothing can be made. */
  private readonly soldOutSign = buildSoldOutSign();

  /** P3 B12: the station art, rebuilt when the checkout on the counter changes. */
  private stationArt: Container[] = [];
  private stationKey = '';
  /** P3 B13: the hoarding and awning, rebuilt (with the stations and the line) when the shop grows. */
  private readonly lot = new Container();
  private buildStations(
    checkout: CheckoutId,
    tier: TierId | undefined,
    stations?: readonly Station[],
    fridge: FridgeId | null = null,
    slotPos?: readonly (Vec2 | null)[],
  ): void {
    // FB1 WP5: the art follows state.stations (bought duplicates, swapped slots), with a plinth in every empty slot.
    const lay = layoutFor(tier);
    const list = stations ?? lay.stations;
    const gearOf = (s: (typeof list)[number]) => ('gear' in s ? s.gear : undefined);
    const key = `${tier ?? 'cafe'}:${checkout}:${list.map((s) => `${s.id}@${s.pos.x},${s.pos.y}:${gearOf(s) ?? ''}`).join('|')}:${fridge ?? ''}:${JSON.stringify(slotPos ?? null)}`;
    if (key === this.stationKey) return;
    this.stationKey = key;
    for (const c of this.stationArt) c.destroy({ children: true });
    const look = tierLook(tier);
    setBarSkin(barSkin(look));
    // 3.3.1: the pickup counter and the condiment bar are named counters, not a second and third till, so no number badge
    // (3.3.3: nor the back sink)
    const badges = stationBadges(list.map((s) => ({ kind: s.kind, twin: ('twin' in s && s.twin === true) || ['pickup', 'condiments', 'sink', 'fridge', 'trayTable', 'syrups'].includes(counterSpotOf(s, list) ?? '') })));
    this.stationArt = list.map((s, i) => {
      const twin = 'twin' in s && s.twin === true;
      const g = gearOf(s);
      return buildStation(s.kind, s.pos, checkout, badges[i]!, twin, g && GEAR[g]?.pour ? 'pour' : g && GEAR[g]?.pot && !twin ? 'pot' : undefined, counterSpotOf(s, list), fridge);
    });
    for (const pos of emptySlotPositions(tier, list, slotPos)) this.stationArt.push(buildEmptySlot(pos));
    setBarSkin('cabinet');
    for (const c of this.stationArt) this.depth.addChild(c);
    const lotKey = tier ?? 'cafe';
    if (lotKey !== this.lotKey) {
      this.lotKey = lotKey;
      this.lotTier = tier;
      for (const c of this.lot.removeChildren()) c.destroy({ children: true });
      this.lot.addChild(buildLot(tier));
      for (const c of this.outdoorBack.removeChildren()) c.destroy({ children: true });
      for (const c of this.outdoorProps) c.destroy({ children: true });
      this.outdoorProps = [];
      if (isOutdoor(look)) {
        const out = buildOutdoor(look as Exclude<typeof look, 'cafe'>);
        out.back.cacheAsTexture(true);
        this.outdoorBack.addChild(out.back);
        this.outdoorProps = out.props;
        for (const p of out.props) this.depth.addChild(p);
        this.lot.addChild(out.over);
      }
      for (const d of this.decor) d.visible = !isOutdoor(look);
    }
    if (this.actors) this.actors.queueSlots = lay.queueSlots;
  }
  private lotKey = '';
  private lotTier: TierId | undefined = undefined;
  /** ui-3.4.0: the stand's sidewalk or the cart's plaza (empty in the café), its props, and the café-only decor. */
  private readonly outdoorBack = new Container();
  private outdoorProps: Container[] = [];
  private readonly decor: Container[] = [];

  /** P3 B13: the milestone moment in the scene, once, when the bigger floor first appears. */
  private celebrated = '';
  private maybeCelebrate(state: GameState): void {
    if (state.phase !== 'day') return;
    const last = state.tierLog?.[state.tierLog.length - 1];
    if (!last || last.day !== state.day) return;
    const key = `${state.seed}:${state.day}`;
    if (key === this.celebrated) return;
    this.celebrated = key;
    this.celebrate(last.tier);
  }
  private celebrate(tier: TierId): void {
    const w = sx(layoutFor(tier).width);
    const cy = sy(3);
    this.fx.spawn(tier === 'cafe' ? 'Grand opening: the café!' : 'Grand re-opening: the cart!', w / 2, cy - 40, 0xf6c35b, 24);
    for (let i = 0; i < 5; i++) this.fx.confetti((w * (i + 0.5)) / 5, cy - 80, 22);
    this.fx.sparkles(w / 2, cy, 12);
  }

  /** Which barista is "me" (gets the ring and the station focus). Unset = the only player, if there's exactly one. */
  setLocalPlayer(id: PlayerId | null): void {
    this.localId = id;
  }

  update(view: RenderView): void {
    const { state } = view;
    this.buildStations(state.checkout?.active ?? 'register', state.tier, state.stations, fridgeGear(state), state.slotPos);
    this.maybeCelebrate(state);
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.lastTime));
    this.lastTime = now;

    this.soldOutSign.visible = (state.phase === 'day' || state.phase === 'closing') && menuDrinks(state).length > 0 && availableDrinks(state).length === 0;
    const night = isNightLook(state.phase);
    this.wall.setNight(night);
    this.lighting.setNight(night);

    const mods = computeModifiers(state);
    this.wall.setMenu(wallMenuRows(state, mods.price));
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
    const lay = layoutFor(state.tier);
    this.actors.spots = { gear: state.gear === true, width: lay.width, queueSlots: lay.queueSlots, till: LAYOUT.stations.find((s) => s.kind === 'counter')!.pos, pickup: lay.pickup };
    this.actors.update(state.players, view.baristaPositions, state.customers, localId, now, poses);
    this.pickup.update(state, now);
    this.sink.update(state, localId, now);
    this.fridge.update(state, localId, now);
    // 3.3.2: floating counts over stations + recipe steps over carried cups (day only)
    const live = state.phase === 'day' || state.phase === 'closing';
    this.counts.root.visible = live;
    if (live) {
      const kinds = new Map(state.stations.map((s) => [s.id, s.kind]));
      const pos = new Map(state.players.map((p) => [p.id, view.baristaPositions[p.id] ?? p.pos]));
      const humans = new Set(state.players.filter((p) => !p.bot && p.connected).map((p) => p.id));
      this.counts.update(state, kinds, pos, humans);
    }
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
      const tray = trayBursts(this.crewState, state, this.traySeq);
      this.traySeq = tray.lastSeq;
      this.crewState = state;
      for (const b of bursts) this.crewBurst(b, state, view.baristaPositions);
      for (const b of tray.bursts) this.trayBurst(b);
    }
    this.fx.step(dt);
  }

  /** FB2 B7: refuse speech bubble at the barista; small floating cues for the other tray events. */
  private trayBurst(b: TrayBurst): void {
    const x = Math.max(80, Math.min(SCENE_WIDTH - 80, sx(b.at.x)));
    const y = sy(b.at.y) - 100;
    if (b.kind === 'refuse') this.fx.say(b.text, x, y);
    else {
      const color = b.tone === 'good' ? 0xa8f0d2 : b.tone === 'warn' ? 0xffd36b : 0xff8a7a;
      this.fx.spawn(b.text, x, y - 10, color, 15, 2.4);
    }
  }

  /** Serve toasts, combo cheers, fail feedback, and juice punches. */
  private crewBurst(b: CrewBurst, state: GameState, positions: Record<PlayerId, { x: number; y: number }>): void {
    // Gear: serves happen when the customer takes the cup, so the toasts rise over the pickup counter
    const counter = state.gear === true ? { pos: layoutFor(state.tier).pickup } : LAYOUT.stations.find((s) => s.kind === 'counter')!;
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
        this.fx.hearts(cx, sy(layoutFor(state.tier).queueSlots[0].y) - 70);
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
    } else if (b.kind === 'grumble') {
      // said walking away from the empty condiment bar
      const bar = layoutFor(state.tier).condiments;
      this.fx.spawn(`“${b.text}”`, sx(bar.x), sy(bar.y) - 130, 0xf0a63a, 16);
    } else if (b.kind === 'bumpSay') {
      // ui-3.5.1: a bumped customer's speech bubble, over their head (or over the front of the queue)
      const q = layoutFor(state.tier).queueSlots[0];
      const x = sx(b.x ?? q.x);
      const y = sy(b.y ?? q.y) - 96;
      this.fx.say(b.text, Math.max(110, Math.min(SCENE_WIDTH - 110, x)), y);
    } else if (b.kind === 'note') {
      // 3.3.3 (FB2 A3): sink, pot and leak lines rise over the fixture they're about
      const st = b.at ? state.stations.find((s) => s.id === b.at) : undefined;
      const x = st ? sx(st.pos.x) : SCENE_WIDTH / 2;
      const y = st ? sy(st.pos.y) - 120 : sy(2) + 10;
      this.fx.spawn(b.text, Math.max(150, Math.min(SCENE_WIDTH - 150, x)), y, b.tone === 'good' ? 0xa8f0d2 : b.tone === 'warn' ? 0xffd36b : 0xff8a7a, 20, 3);
    } else if (b.kind === 'steep') {
      if (b.cups > 0) {
        const fresh = b.paid < b.cups ? ` (${b.paid} fresh)` : '';
        this.fx.spawn(`🧊 ${b.cups} ${b.cups === 1 ? 'cup' : 'cups'} of cold brew ready${fresh}`, SCENE_WIDTH / 2, sy(2), 0x9fd3ff, 17);
      }
    } else if (b.kind === 'call') {
      const text = !b.take ? `${b.by} let the phone ring` : b.call === 'machine' ? `📞 ${b.by} talked the branch through the machine` : `📞 ${b.by} took the branch's order`;
      this.fx.spawn(text, SCENE_WIDTH / 2, sy(2) + 30, b.take ? 0x7fcfb4 : 0xf0a63a, 15);
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

/** The sold-out strip over the wall chalkboard (wall.ts draws the board at x 378..476, y 18..88). */
function buildSoldOutSign(): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(-56, -14, 112, 28, 5).fill(0xe0564a).stroke({ width: 2, color: 0xb8413a });
  const t = label('SOLD OUT', 15, 0xffffff, '800');
  t.anchor.set(0.5);
  c.addChild(g, t);
  c.position.set(427, 56);
  c.rotation = -0.12;
  c.visible = false;
  return c;
}
