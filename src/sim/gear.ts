import { AREAS, AREA_TIP, DRINK_FAMILY, type AreaId } from '../data/areas';
/**
 * Gear Tree G2 (docs/GEAR_TREE.md): the sim side of a Gear run. Everything here is a no-op unless
 * `state.gear === true`, which only `createRun({ gear: true })` sets (the UI only with `?gear=1`).
 *  RNG: G1–G4 draw none. G5 quirks (`gearMorning`, `gearAfterUse`) roll `state.rng`, only for stations
 *  that carry gear with quirks, so classic streams are unchanged. G7 `gearArea` is a pure hash (no draw).
 *
 *  - `gearStart(state)`: the run starts with $120, no supplies, an empty back bar and a free
 *    cardboard-box bin in the last slot. The first night is "Pick your gear".
 *  - `applyGearInput(state, input)`: night only, connected humans only.
 *      buy:  pay `price`. If the crew already has a lower tier of the same tree in a slot, the new
 *            one replaces it in place and the old one is traded in for its `sell` value (an upgrade).
 *            Otherwise it goes into the first empty slot; with no empty slot nothing happens.
 *            Buying a tier you already have, or a lower one than you have, does nothing.
 *      sell: empty slot `index` and get its `sell` value back.
 *  - `gearSpeed(station)` / `gearMarks(station)`: the machine's speed (1 = today) and the slip marks it
 *    puts on every cup. Stations with no gear id: 1 and 0, exactly as before.
 *  - `gearMorning(state)`: refill each capped cold brew station's batch for the day.
 *  - `batchOut(state)`: a Gear run whose cold brew stations have all used up today's batch (cold
 *    brew drinks are then sold out, the existing sold-out flow).
 *  - `growGearSlots(state, to)`: growing keeps the gear in its slots and adds empty ones.
 *
 * Classic `equip` and `slot` inputs do nothing in a Gear run (the Gear tab replaces the stations shop).
 * Pure and deterministic: no RNG.
 */
import { GEAR, GEAR_START, type GearId } from '../data/gear';
import { SLOT_POSITIONS } from '../data/layout';
import { stationsFromSlots, slotCount } from './slots';
import { usesShot, type Recipe } from '../data/drinks';
import type { Modifiers } from './effects';
import { ACCURACY } from './accuracy';
import { ownTile, placeMess } from './floor';
import { emitLog } from './log';
import { rngInt, rngNext } from './rng';
import type { DrinkId, GameState, ItemKind, Player, PlayerInput, Station, StationKind, TierId } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const isGearRun = (state: GameState): boolean => state.gear === true;

/** Turn a fresh run into a Gear run (called by createRun before the first night). */
export function gearStart(state: GameState): void {
  state.gear = true;
  state.cash = GEAR_START.cash;
  state.startingCash = GEAR_START.cash;
  for (const k of Object.keys(state.supplies) as (keyof typeof state.supplies)[]) state.supplies[k] = 0;
  const n = slotCount(state.tier);
  const slots: (StationKind | null)[] = Array.from({ length: n }, () => null);
  const gear: (GearId | null)[] = Array.from({ length: n }, () => null);
  GEAR_START.freeGear.forEach((id, i) => {
    const at = n - 1 - i;
    slots[at] = GEAR[id].station;
    gear[at] = id;
  });
  state.slots = slots;
  state.slotGear = gear;
  state.equipment = [];
  state.gearLog = [];
  state.stations = stationsFromSlots(state.tier, slots, gear);
}

function rebuild(state: GameState): void {
  state.stations = stationsFromSlots(state.tier, state.slots ?? [], state.slotGear ?? []);
}

export function applyGearInput(state: GameState, input: Extract<PlayerInput, { kind: 'gear' }>): GameState {
  if (!isGearRun(state) || state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  const slots = [...(state.slots ?? [])];
  const gear = [...(state.slotGear ?? [])];
  while (gear.length < slots.length) gear.push(null);
  if (input.action === 'sell') {
    const i = input.index;
    const id = gear[i];
    if (!Number.isInteger(i) || i < 0 || i >= slots.length || !id) return state;
    state.cash = round2(state.cash + GEAR[id].sell);
    slots[i] = null;
    gear[i] = null;
    state.gearLog = [...(state.gearLog ?? []), { gear: id, action: 'sell', day: state.day, by: p.name, cash: GEAR[id].sell }];
  } else {
    const want = GEAR[input.gear];
    if (!want) return state;
    // the highest tier of this tree already in a slot
    let at = -1;
    gear.forEach((id, i) => {
      if (id && GEAR[id].tree === want.tree && (at < 0 || GEAR[id].tier > GEAR[gear[at]!].tier)) at = i;
    });
    if (at >= 0 && GEAR[gear[at]!].tier >= want.tier) return state;
    const tradeIn = at >= 0 ? GEAR[gear[at]!].sell : 0;
    if (state.cash + tradeIn < want.price) return state;
    if (at < 0) {
      at = slots.findIndex((x, i) => x === null && i < slotCount(state.tier));
      if (at < 0) return state;
    } else {
      state.gearLog = [...(state.gearLog ?? []), { gear: gear[at]!, action: 'sell', day: state.day, by: p.name, cash: tradeIn }];
    }
    state.cash = round2(state.cash + tradeIn - want.price);
    slots[at] = want.station;
    gear[at] = want.id;
    state.gearLog = [...(state.gearLog ?? []), { gear: want.id, action: 'buy', day: state.day, by: p.name, cash: -want.price }];
  }
  state.slots = slots;
  state.slotGear = gear;
  rebuild(state);
  return state;
}

export function gearSpeed(s: Station): number {
  return s.gear ? GEAR[s.gear].speed : 1;
}

export function gearMarks(s: Station): number {
  return s.gear && !s.lucky ? GEAR[s.gear].marks : 0;
}

export function gearMorning(state: GameState): void {
  if (!isGearRun(state)) return;
  for (const s of state.stations) {
    const cap = s.gear ? GEAR[s.gear].batch : undefined;
    if (cap !== undefined) s.batchLeft = cap;
    else delete s.batchLeft;
    // G5: overnight everything is reset and today's quirks are rolled (slot order, so it's deterministic).
    delete s.jammed;
    delete s.dead;
    delete s.usesToDie;
    delete s.lucky;
    const q = s.gear ? GEAR[s.gear].quirks : undefined;
    if (!q) continue;
    const name = GEAR[s.gear!].name;
    if (q.dieAfter !== undefined) s.usesToDie = q.dieAfter + rngInt(state, q.dieSpread ?? 1);
    if (q.askAbout && rngNext(state) < q.askAbout) {
      state.reputation = Math.max(0, round2(state.reputation - 0.05));
      state.morningNotes.push(`A customer peered over the counter: "is that… a sock?" (−0.05★ rating)`);
    }
    if (q.lucky && rngNext(state) < q.lucky) {
      s.lucky = true;
      state.morningNotes.push(`🧦✨ Lucky Sock day! Today's cold brew comes out perfect. Don't ask.`);
    }
    if (q.crack && s.batchLeft !== undefined && rngNext(state) < q.crack) {
      s.batchLeft = Math.max(0, s.batchLeft - (q.crackLoss ?? 0));
      state.morningNotes.push(`A jar cracked overnight: ${q.crackLoss} cups of cold brew down the drain.`);
    }
    if (q.morning && rngNext(state) < q.morning) state.morningNotes.push(q.morningText ?? `${name} is acting up.`);
  }
}

function quirk(state: GameState, s: Station, text: string, by: string): void {
  emitLog(state, 'gear.quirk', { gear: s.gear ?? '', text, by });
}

/**
 * G5: before a station is used. Returns true when the gear blocks the use: a dead machine does
 * nothing; a jammed one gets whacked by empty hands (fixed, no brew this press).
 */
export function gearBlocked(state: GameState, s: Station, p: Player): boolean {
  if (!s.gear) return false;
  if (s.dead) return true;
  if (s.jammed) {
    if (p.holding === null) {
      delete s.jammed;
      quirk(state, s, `${p.name} whacked the ${GEAR[s.gear].name}. It works again.`, p.id);
    }
    return true;
  }
  return false;
}

/** G5: right after a gear machine starts a brew: roll its downsides and jokes (Gear runs only). */
export function gearAfterUse(state: GameState, s: Station, p: Player): void {
  const q = s.gear && isGearRun(state) ? GEAR[s.gear].quirks : undefined;
  if (!q) return;
  const name = GEAR[s.gear!].name;
  if (q.jam && rngNext(state) < q.jam) {
    s.jammed = true;
    quirk(state, s, `The ${name} jammed! Empty hands + E to whack it.`, p.id);
  }
  if (q.spill && rngNext(state) < q.spill) {
    if (placeMess(state, 'spill', ownTile(state, p))) quirk(state, s, `The portafilter slipped: coffee on the floor.`, p.id);
  }
  if (q.offNote && rngNext(state) < q.offNote) {
    s.cupSlips = Math.min(ACCURACY.maxStars, (s.cupSlips ?? 0) + 1);
    quirk(state, s, `A faint note of cumin in that one (−1★).`, p.id);
  }
  if (q.funny && rngNext(state) < q.funny) quirk(state, s, q.funnyText ?? `${name} did something weird.`, p.id);
  if (s.usesToDie !== undefined) {
    s.usesToDie -= 1;
    if (s.usesToDie <= 0) {
      delete s.usesToDie;
      s.dead = true;
      quirk(state, s, `The ${name}'s batteries died. Dead until tonight.`, p.id);
    }
  }
}

/** True when a Gear run has cold brew stations and every one has used up today's batch. */
export function batchOut(state: GameState): boolean {
  if (!isGearRun(state)) return false;
  const taps = state.stations.filter((s) => s.kind === 'coldBrewTap');
  return taps.length > 0 && taps.every((s) => s.batchLeft === 0);
}

/** Growing a Gear run: gear stays in its slots, the bigger shop adds empty ones. */
export function growGearSlots(state: GameState, to: TierId): void {
  const n = SLOT_POSITIONS[to].length;
  const slots = [...(state.slots ?? [])];
  const gear = [...(state.slotGear ?? [])];
  while (slots.length < n) slots.push(null);
  while (gear.length < n) gear.push(null);
  state.slots = slots.slice(0, n);
  state.slotGear = gear.slice(0, n);
  state.stations = stationsFromSlots(to, state.slots, state.slotGear);
}

// ---------------------------------------------------------------------------------------------- G4: pods and price multipliers

const POD_SHOT: Recipe = { takes: null, gives: 'espresso', consumes: ['beans'], seconds: 5 };

/**
 * G4: a gear machine's own recipe for what is in hand, or undefined to use the station's normal recipes.
 * The Pod-o-Matic makes a shot from empty hands (a pod; no grinder) and does not take grounds.
 */
export function gearRecipe(s: Station, held: ItemKind | null): Recipe | null | undefined {
  if (!s.gear || !GEAR[s.gear].pods) return undefined;
  return held === null ? POD_SHOT : held === 'grounds' ? null : undefined;
}

/** G4: a Gear run with a pod machine can make espresso drinks without a grinder. */
export function podsCoverGrinder(state: GameState): boolean {
  return isGearRun(state) && state.stations.some((s) => s.gear && GEAR[s.gear].pods);
}

/** G4: the price multiplier the crew's gear puts on a drink (1 = none). Espresso drinks follow the
 *  espresso machine (the best one if there are several); plain cold brew follows the cold brew tap. */
export function gearPriceMul(state: GameState, drink: DrinkId): number {
  if (!isGearRun(state)) return 1;
  const station: StationKind | null = usesShot(drink) ? 'espresso' : drink === 'coldBrew' ? 'coldBrewTap' : null;
  if (!station) return 1;
  let best: GearId | null = null;
  for (const s of state.stations) if (s.kind === station && s.gear && (!best || GEAR[s.gear].tier > GEAR[best].tier)) best = s.gear;
  return best ? (GEAR[best].priceMul ?? 1) : 1;
}

/** G4: fold gear price multipliers into the day's modifiers (no-op outside a Gear run). */
export function applyGearPrices(state: GameState, m: Modifiers): void {
  if (!isGearRun(state)) return;
  for (const d of Object.keys(m.price) as DrinkId[]) m.price[d] *= gearPriceMul(state, d);
}

/**
 * Gear Tree G7: the run's hidden area. A pure function of the scenario and seed (no RNG draw), so classic
 * replays and Gear replays stay deterministic. Classic runs have no area.
 */
export function gearArea(state: GameState): AreaId | null {
  if (!state.gear) return null;
  if (state.scenario === 'campusTown') return 'campus';
  if (state.scenario === 'rainyWeek') return 'drizzleton';
  if (state.scenario === 'touristSeason') return 'tourist';
  const others: AreaId[] = ['office', 'arts', 'gym'];
  return others[(Math.imul(state.seed >>> 0, 2654435761) >>> 0) % others.length];
}

/** Gear Tree G7: tip multiplier for a drink in this run's area (1 in classic runs). */
export function areaTipMul(state: GameState, drink: DrinkId): number {
  const id = gearArea(state);
  if (!id) return 1;
  const a = AREAS[id];
  const fam = DRINK_FAMILY[drink];
  let mul = a.all ?? 1;
  if (fam && a.loves.includes(fam)) mul *= AREA_TIP.loved;
  else if (fam && a.meh.includes(fam)) mul *= AREA_TIP.meh;
  return mul;
}
