import { AREAS, AREA_ASK, AREA_TIP, DRINK_FAMILY, QUALITY_TIP_PER_STAR, SNOB, SNOB_GEAR, FAMILY_WORD, type AreaId, type DrinkFamily } from '../data/areas';
/**
 * Gear Tree G2 (docs/GEAR_TREE.md): the sim side of a Gear run. Everything here is a no-op unless
 * `state.gear === true`, which only `createRun({ gear: true })` sets (since v3.0.0 the UI does for every new run; `?gear=0` starts a classic one).
 *  RNG: G1–G4 draw none. G5 quirks (`gearMorning`, `gearAfterUse`) roll `state.rng`, only for stations
 *  that carry gear with quirks, so classic streams are unchanged. G7 `gearArea` is a pure hash (no draw).
 *
 *  - `gearStart(state)`: the run starts with $120, no supplies, an empty back bar and a free
 *    cardboard-box bin in the last slot. The first night is "Pick your gear".
 *  - `applyGearInput(state, input)`: night only, connected humans only.
 *      buy:  pay `price`. If the crew already has a lower tier of the same tree in a slot, the new
 *            one replaces it in place and the old one is traded in for its `sell` value (an upgrade).
 *            Otherwise it goes into the first empty slot; with no empty slot nothing happens.
 *            Buying the tier you already have adds a second copy in a free slot (G4e); a lower one does nothing.
 *      sell: empty slot `index` and get its `sell` value back.
 *  - `gearSpeed(station)` / `gearMarks(station)`: the machine's speed (1 = today) and the slip marks it
 *    puts on every cup. Stations with no gear id: 1 and 0, exactly as before.
 *  - `gearMorning(state)`: steep the taps' cups for the day (`steepMorning`) and roll the day's quirks.
 *  - `batchOut(state)`: a Gear run whose cold brew stations have all used up today's batch (cold
 *    brew drinks are then sold out, the existing sold-out flow).
 *  - `growGearSlots(state, to)`: growing keeps the gear in its slots and adds empty ones.
 *
 * Classic `equip` and `slot` inputs do nothing in a Gear run (the Gear tab replaces the stations shop).
 * Pure and deterministic: no RNG.
 */
import { GEAR, GEAR_START, type GearId } from '../data/gear';
import { SLOT_POSITIONS } from '../data/layout';
import { ensureCounterSpots, stationsFromSlots, slotCount } from './slots';
import { CONDIMENTS } from './condiments';
import { steepMorning } from './steep';
import { BASE_DRINKS, DRINK_IDS, TAP_DRINKS, usesShot, type Recipe } from '../data/drinks';
import { ECONOMY } from '../data/economy';
import { TICK_RATE } from './constants';
import type { Modifiers } from './effects';
import { ACCURACY } from './accuracy';
import { ownTile, placeMess } from './floor';
import { emitLog } from './log';
import { rngInt, rngNext } from './rng';
import type { DrinkId, GameState, GearVote, ItemKind, Player, PlayerInput, Station, StationKind, SupplyId, TierId } from './types';

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
  ensureCounterSpots(state); // FB2 A4: the fridge, when the shop size comes with one
  // Batch/pickup: a full condiment bar and no stock boxes yet.
  state.condiments = { servings: CONDIMENTS.servings };
  state.condimentBoxes = 0;
}

function rebuild(state: GameState): void {
  state.stations = stationsFromSlots(state.tier, state.slots ?? [], state.slotGear ?? []);
  ensureCounterSpots(state);
}

export function applyGearInput(state: GameState, input: Extract<PlayerInput, { kind: 'gear' }>): GameState {
  if (!isGearRun(state) || state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  // The proposer's Withdraw comes first, so a vote that only passes because the others left can't buy on the way out.
  if (input.action === 'vote' && !input.yes && state.gearVote?.by === p.id) return gearCastVote(state, p, false);
  settleVote(state); // someone may have left since the last vote
  if (input.action === 'vote') return gearCastVote(state, p, input.yes);
  // G8: a big buy/sell with more than one human becomes a proposal (one open at a time).
  const big = bigDeal(state, input);
  if (big && voters(state).length > 1) {
    if (state.gearVote) return state;
    state.gearVote = { by: p.id, byName: p.name, ...big, yes: [p.id], no: [] };
    delete state.gearVoteLast;
    return state;
  }
  return gearDeal(state, p.name, input);
}

/** G8: the threshold for a co-op vote (doc §8). */
export const GEAR_VOTE_MIN = 50;

/** Connected humans: the electorate. Bots don't vote. */
const voters = (state: GameState) => state.players.filter((x) => x.connected && !x.bot);

/** G8: is this buy or sell a "big" one ($50 or more)? Returns the proposal body, or null. */
function bigDeal(state: GameState, input: Extract<PlayerInput, { kind: 'gear' }>): Pick<GearVote, 'action' | 'gear' | 'index' | 'amount'> | null {
  if (input.action === 'buy') {
    const want = GEAR[input.gear];
    return want && want.price >= GEAR_VOTE_MIN ? { action: 'buy', gear: want.id, amount: want.price } : null;
  }
  if (input.action === 'sell') {
    const id = state.slotGear?.[input.index];
    return id && GEAR[id].sell >= GEAR_VOTE_MIN ? { action: 'sell', gear: id, index: input.index, amount: GEAR[id].sell } : null;
  }
  return null;
}

/** G8: a yes or no. Passes on a strict majority of connected humans (tie fails); cash checked on pass. */
function gearCastVote(state: GameState, p: Player, yes: boolean): GameState {
  const v = state.gearVote;
  if (!v || v.yes.includes(p.id) || v.no.includes(p.id)) {
    // The proposer can withdraw with a no.
    if (v && !yes && v.by === p.id) return endVote(state, false, `${v.byName} withdrew the ${GEAR[v.gear].name} vote.`);
    return state;
  }
  (yes ? v.yes : v.no).push(p.id);
  return settleVote(state);
}

/** G8: resolve the open vote if a majority is reached either way (also after someone leaves). */
export function settleVote(state: GameState): GameState {
  const v = state.gearVote;
  if (!v) return state;
  const ids = new Set(voters(state).map((x) => x.id));
  const yes = v.yes.filter((id) => ids.has(id)).length;
  const no = v.no.filter((id) => ids.has(id)).length;
  const n = ids.size;
  const name = GEAR[v.gear].name;
  if (yes * 2 > n) {
    const cashBefore = state.cash;
    const slotsBefore = JSON.stringify(state.slotGear ?? []);
    gearDeal(state, v.byName, v.action === 'buy' ? { kind: 'gear', playerId: v.by, action: 'buy', gear: v.gear } : { kind: 'gear', playerId: v.by, action: 'sell', index: v.index! });
    const done = state.cash !== cashBefore || JSON.stringify(state.slotGear ?? []) !== slotsBefore;
    return endVote(state, done, done ? `Vote passed: ${v.action === 'buy' ? 'bought' : 'sold'} ${name}.` : `Vote passed, but there wasn't enough cash or room for ${name}.`);
  }
  if ((n - no) * 2 <= n) return endVote(state, false, `Vote failed: no ${name} ${v.action === 'buy' ? 'tonight' : 'sale'}.`);
  return state;
}

function endVote(state: GameState, passed: boolean, text: string): GameState {
  delete state.gearVote;
  state.gearVoteLast = { text, passed };
  return state;
}

/** The buy/sell itself (G2–G4e rules), by the player named `by`. */
function gearDeal(state: GameState, by: string, input: Extract<PlayerInput, { kind: 'gear'; action: 'buy' | 'sell' }>): GameState {
  const p = { name: by };
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
    if (at >= 0 && GEAR[gear[at]!].tier > want.tier) return state;
    // G10a: a branch opens only with its parent tree far enough along (D4b needs D3+).
    if (!gearRequiresMet(state, want.id)) return state;
    // G4e (playtest): the same machine again goes into a free slot as a second copy (no trade-in).
    if (at >= 0 && GEAR[gear[at]!].tier === want.tier) at = -1;
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
    // G4d: the first drip machine puts drip coffee on the menu for good.
    if (want.pot) {
      const known = state.unlocked ?? [...BASE_DRINKS];
      if (!known.includes('drip')) state.unlocked = DRINK_IDS.filter((d) => d === 'drip' || known.includes(d));
      state.menu.drip = true;
    }
    // G10a: the pour-over bar puts the Pour-over on the menu for good.
    if (want.pour) {
      const known = state.unlocked ?? [...BASE_DRINKS];
      if (!known.includes('pourOver')) state.unlocked = DRINK_IDS.filter((d) => d === 'pourOver' || known.includes(d));
      state.menu.pourOver = true;
    }
  }
  state.slots = slots;
  state.slotGear = gear;
  rebuild(state);
  return state;
}

/** G10a: is a gear's `requires` met (a tree at a tier or better in a slot)? Pour-over gear already owned counts too. */
export function gearRequiresMet(state: GameState, id: GearId): boolean {
  const req = GEAR[id].requires;
  if (!req) return true;
  return (state.slotGear ?? []).some((x) => x && ((GEAR[x].tree === req.tree && GEAR[x].tier >= req.tier) || GEAR[x].tree === GEAR[id].tree));
}

export function gearSpeed(s: Station, tick?: number): number {
  if (!s.gear) return 1;
  const flowing = tick !== undefined && s.flowUntil !== undefined && tick < s.flowUntil;
  return GEAR[s.gear].speed * (flowing ? FLOW_SPEED : 1);
}

/** G10: flow state doubles a pour-over's speed. */
export const FLOW_SPEED = 2;

/** G10 "+1★ cap": a polish machine forgives one slip on the cup it just took in. */
export function gearPolish(s: Station): void {
  if (s.gear && GEAR[s.gear].polish && (s.cupSlips ?? 0) > 0) s.cupSlips = s.cupSlips! - 1;
}

export function gearMarks(s: Station): number {
  return s.gear && !s.lucky ? GEAR[s.gear].marks : 0;
}

export function gearMorning(state: GameState): void {
  if (!isGearRun(state)) return;
  state.morningNotes.push(...gearAskedNotes(state));
  // G6: yesterday's level-ups.
  if (state.gearLearned?.length) state.morningNotes.push(...state.gearLearned);
  delete state.gearLearned;
  steepMorning(state); // the taps' cups: yesterday's first, then steeped fresh from concentrate
  for (const s of state.stations) {
    delete s.flowUntil;
    // G5: overnight everything is reset and today's quirks are rolled (slot order, so it's deterministic).
    delete s.jammed;
    delete s.dead;
    delete s.usesToDie;
    delete s.lucky;
    delete s.potLeft;
    delete s.potColdAt;
    delete s.potOff;
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
      if (s.batchOld !== undefined) {
        s.batchOld = Math.min(s.batchOld, s.batchLeft);
        if (s.batchOld === 0) delete s.batchOld;
      }
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
  // G10: flow state starts on the next cup (this one's time is already set).
  const flow = s.gear && isGearRun(state) ? GEAR[s.gear].flow : undefined;
  if (flow && !(s.flowUntil !== undefined && state.tick < s.flowUntil) && rngNext(state) < flow.chance) {
    s.flowUntil = state.tick + Math.round(flow.seconds * TICK_RATE);
    quirk(state, s, `Flow state! The ${GEAR[s.gear!].name} pours twice as fast for ${flow.seconds} s. Somebody films it.`, p.id);
  }
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

/** Batch/pickup: recipes that draw a steeped cup from the tap (the plain pour, and the iced latte step). */
export function tapCupRecipe(r: Recipe): boolean {
  return r.gives === 'coldBrew' || r.gives === 'icedLatte';
}

/** Batch/pickup: take one steeped cup off a tap, yesterday's first. False when the tap is empty (or has no batch). */
export function takeTapCup(s: Station): boolean {
  if (s.batchLeft === undefined || s.batchLeft <= 0) return false;
  s.batchLeft -= 1;
  if (s.batchOld !== undefined && s.batchOld > 0) {
    s.batchOld -= 1;
    if (s.batchOld === 0) delete s.batchOld;
  }
  return true;
}

/**
 * Batch/pickup: a press at a Gear tap with empty hands pours a steeped cup at once. Returns whether the press
 * was handled (the tap pours, or is empty and pours nothing); false leaves the press to the normal rules.
 */
export function gearTapPour(state: GameState, s: Station, p: Player): boolean {
  if (!isGearRun(state) || s.kind !== 'coldBrewTap' || !s.gear) return false;
  if (p.holding !== null || p.tool !== null || s.busyTicksLeft !== 0 || s.output !== null) return false;
  if (!takeTapCup(s)) return true;
  p.holding = 'coldBrew';
  const marks = gearMarks(s);
  if (marks > 0) p.cupSlips = marks;
  else delete p.cupSlips;
  delete p.cupTemp;
  gearAfterUse(state, s, p);
  return true;
}

/** Batch/pickup: every supply a drink needs while it is being served; Gear cold brew comes from steeped cups, not concentrate. */
export function drinkSuppliesFor(state: GameState, d: DrinkId): SupplyId[] {
  const all = ECONOMY.drinkSupplies[d];
  return isGearRun(state) ? all.filter((x) => x !== 'concentrate') : all;
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

/** Batch/pickup: the steeped tap's pour: empty hands, a cup of cold brew, nothing used up (concentrate was paid at night). */
export const TAP_POUR: Recipe = { takes: null, gives: 'coldBrew', consumes: [] };

const POD_SHOT: Recipe = { takes: null, gives: 'espresso', consumes: ['beans'], seconds: 5 };

/**
 * G4: a gear machine's own recipe for what is in hand, or undefined to use the station's normal recipes.
 * The Pod-o-Matic makes a shot from empty hands (a pod; no grinder) and does not take grounds.
 */
export function gearRecipe(s: Station, held: ItemKind | null): Recipe | null | undefined {
  // Batch/pickup: a tap in a Gear shop pours a steeped cup from empty hands (no concentrate, no wait).
  if (s.kind === 'coldBrewTap' && s.gear && held === null) return TAP_POUR;
  // G10a: a pour-over station makes one handmade cup from empty hands, and nothing else.
  const pour = s.gear ? GEAR[s.gear].pour : undefined;
  if (pour) return held === null ? { takes: null, gives: 'pourOver', consumes: ['beans'], seconds: pour.seconds } : null;
  if (!s.gear || !GEAR[s.gear].pods) return undefined;
  // G6: no hot-water tap on a pod machine, so no americano there (doc: E2+).
  // G6c: no doppio or red-eye there either (no real group head).
  return held === null ? POD_SHOT : held === 'grounds' || held === 'espresso' || held === 'drip' ? null : undefined;
}

/**
 * Smoke fix: every espresso machine in the shop is a pod machine, so shots come from empty hands and a
 * grinder (if one is installed) has nothing to feed. Bots and tickets then skip the Grind step.
 */
export function podsOnly(state: GameState): boolean {
  const esp = state.stations.filter((s) => s.kind === 'espresso');
  return isGearRun(state) && esp.length > 0 && esp.every((s) => s.gear && GEAR[s.gear].pods);
}

/** G4: a Gear run with a pod machine can make espresso drinks without a grinder. */
export function podsCoverGrinder(state: GameState): boolean {
  return isGearRun(state) && state.stations.some((s) => s.gear && GEAR[s.gear].pods);
}

/** G4: the price multiplier the crew's gear puts on a drink (1 = none). Espresso drinks follow the
 *  espresso machine (the best one if there are several); plain cold brew follows the cold brew tap. */
export function gearPriceMul(state: GameState, drink: DrinkId): number {
  if (!isGearRun(state)) return 1;
  const station: StationKind | null = usesShot(drink) ? 'espresso' : drink === 'coldBrew' ? 'coldBrewTap' : drink === 'pourOver' ? 'drip' : null;
  if (!station) return 1;
  let best: GearId | null = null;
  // G10a: the pour-over price follows the pour-over gear only (not the drip pots on the same station kind).
  for (const s of state.stations) if (s.kind === station && s.gear && (drink !== 'pourOver' || GEAR[s.gear].pour) && (!best || GEAR[s.gear].tier > GEAR[best].tier)) best = s.gear;
  return best ? (GEAR[best].priceMul ?? 1) : 1;
}

/** G4: fold gear price multipliers into the day's modifiers (no-op outside a Gear run). */
export function applyGearPrices(state: GameState, m: Modifiers): void {
  if (!isGearRun(state)) return;
  for (const d of Object.keys(m.price) as DrinkId[]) m.price[d] *= gearPriceMul(state, d);
  // G10: The Annihilator draws influencers.
  let odds = 1;
  for (const s of state.stations) if (s.gear && !s.twin) odds = Math.max(odds, GEAR[s.gear].influencerOdds ?? 1);
  m.eventOdds.influencerVisit *= odds;
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
  // G10b: a per-drink rule beats the family rule (arts loves pour-over even though filter is meh there).
  if (a.lovesDrink?.includes(drink)) mul *= AREA_TIP.loved;
  else if (a.mehDrink?.includes(drink)) mul *= AREA_TIP.meh;
  else if (fam && a.loves.includes(fam)) mul *= AREA_TIP.loved;
  else if (fam && a.meh.includes(fam)) mul *= AREA_TIP.meh;
  return mul;
}

/** G10b: the area crowd's patience for an order (1 in classic runs): office/gym rush, Drizzleton waits for milk. */
export function areaPatienceMul(state: GameState, drinks: DrinkId[]): number {
  const id = gearArea(state);
  if (!id) return 1;
  const a = AREAS[id];
  let fam = 1;
  for (const d of drinks) {
    const f = DRINK_FAMILY[d];
    if (f && a.patienceFam?.[f]) fam = Math.max(fam, a.patienceFam[f]!);
  }
  return (a.patience ?? 1) * fam;
}

/** G10b: the arts crowd notices quality: 2★ ×1, each star above/below ±10% (1 elsewhere). */
export function areaQualityTip(state: GameState, stars: number): number {
  const id = gearArea(state);
  if (!id || !AREAS[id].quality) return 1;
  return 1 + QUALITY_TIP_PER_STAR * (stars - (ACCURACY.maxStars - 1));
}

/** G10b: drink families whose top-tier gear the crew owns (each draws one snob regular, up to SNOB.max). */
export function snobFamilies(state: GameState): DrinkFamily[] {
  if (!isGearRun(state)) return [];
  const fams: DrinkFamily[] = [];
  for (const id of state.slotGear ?? []) {
    const f = id ? SNOB_GEAR[id] : undefined;
    if (f && !fams.includes(f)) fams.push(f);
  }
  return fams.slice(0, SNOB.max);
}

/** G10b: a snob tips big for a perfect cup (3★) and little for a sloppy one (1★ or less). */
export function snobTip(stars: number): number {
  return stars >= ACCURACY.maxStars ? SNOB.hiTip : stars <= ACCURACY.maxStars - 2 ? SNOB.loTip : 1;
}

/** G7: the gear tree that makes each drink family (the family's "best tier" for gear pull). */
export const FAMILY_TREE: Record<DrinkFamily, StationKind> = { espresso: 'espresso', milky: 'steamer', iced: 'coldBrewTap', filter: 'drip' };
export const GEAR_PULL = 0.05;

/**
 * Gear Tree G7 "gear pulls customers": the best tier the crew owns in a drink's family adds 5% to that
 * family's orders per tier above 1 (×1 in classic runs, with no gear in the family, or for specials).
 * Pure (no RNG); it reweights the existing order draw.
 */
export function gearPullMul(state: GameState, drink: DrinkId): number {
  if (!isGearRun(state)) return 1;
  const fam = DRINK_FAMILY[drink];
  if (!fam) return 1;
  let best = 0;
  let draw = 1;
  for (const s of state.stations) {
    if (!s.gear) continue;
    if (s.kind === FAMILY_TREE[fam]) best = Math.max(best, GEAR[s.gear].tier);
    const d = GEAR[s.gear].draws;
    if (d && d.family === fam && !s.twin) draw = Math.max(draw, d.mul);
  }
  // G10: the hidden area tilts what walk-ins order (a per-drink rule multiplies on top of the family's).
  const area = gearArea(state);
  const a = area ? AREAS[area] : undefined;
  const pull = (a?.pull?.[fam] ?? 1) * (a?.pullDrink?.[drink] ?? 1);
  return (1 + GEAR_PULL * Math.max(0, best - 1)) * draw * pull;
}

/** G7: add a served cup's tip to today's per-family tally (Gear runs only). */
export function noteFamilyTip(state: GameState, drink: DrinkId, tip: number): void {
  const fam = DRINK_FAMILY[drink];
  if (!isGearRun(state) || !fam || tip <= 0) return;
  const t = (state.today.tipsByFamily ??= {});
  t[fam] = round2((t[fam] ?? 0) + tip);
}

/**
 * Gear Tree G7c: an arriving walk-in sometimes wants a family the area loves that isn't on today's menu.
 * They leave without costing rating; the count becomes tomorrow's morning note. Returns true when the
 * walk-in left. Draws RNG only in Gear runs whose area loves something you don't serve.
 */
export function gearAskedFor(state: GameState, menu: DrinkId[]): boolean {
  const id = gearArea(state);
  if (!id) return false;
  const served = new Set(menu.map((d) => DRINK_FAMILY[d]));
  const missing = AREAS[id].loves.filter((f) => !served.has(f));
  if (missing.length === 0 || rngNext(state) >= AREA_ASK) return false;
  const fam = missing[missing.length > 1 ? rngInt(state, missing.length) : 0];
  const asked = (state.gearAsked ??= {});
  asked[fam] = (asked[fam] ?? 0) + 1;
  return true;
}

/** G7c: "3 people asked for something iced yesterday." Clears the tally. */
export function gearAskedNotes(state: GameState): string[] {
  const asked = state.gearAsked;
  delete state.gearAsked;
  if (!asked) return [];
  return (Object.entries(asked) as [DrinkFamily, number][])
    .filter(([, n]) => n > 0)
    .map(([f, n]) => `${n === 1 ? 'Someone' : `${n} people`} asked for ${FAMILY_WORD[f]} yesterday and walked on.`);
}

// ---------------------------------------------------------------------------------------------- G4d: drip pots

/**
 * G4d: a drip machine finished brewing: fill the pot. Rolls one draw for a temperature miss (Gear runs,
 * pot machines only), so classic streams are unchanged.
 */
export function gearPotFinished(state: GameState, s: Station): void {
  const pot = s.gear ? GEAR[s.gear].pot : undefined;
  if (!pot || !isGearRun(state)) return;
  s.potLeft = pot.cups;
  if (pot.coldAfter !== null) s.potColdAt = state.tick + Math.round(pot.coldAfter * TICK_RATE);
  else delete s.potColdAt;
  delete s.potOff;
  if (pot.miss > 0) {
    const r = rngNext(state);
    if (r < pot.miss) s.potOff = r < pot.miss / 2 ? 'hot' : 'cold';
  }
}

/**
 * G4d: someone picks a cup off a drip machine. Returns whether the pot keeps pouring (the station keeps
 * its output) and the cup's temperature miss, if any: a scalding pot, a lukewarm one, or a pot that
 * went cold on the hot plate. Stations without a pot: `{ pot: false, more: false, temp: null }`.
 */
export function gearPotPour(state: GameState, s: Station): { pot: boolean; more: boolean; temp: 'hot' | 'cold' | null } {
  if (s.potLeft === undefined) return { pot: false, more: false, temp: null };
  const temp = s.potOff ?? (s.potColdAt !== undefined && state.tick >= s.potColdAt ? 'cold' : null);
  s.potLeft -= 1;
  const more = s.potLeft > 0;
  if (!more) {
    delete s.potLeft;
    delete s.potColdAt;
    delete s.potOff;
  }
  return { pot: true, more, temp };
}

const TOO_HOT = ['"Ow! This is lava."', '"Is this coffee or a dare?"', '"I can\'t feel my tongue."'];
const TOO_COLD = ['"This is… room temperature."', '"Did this sit out since breakfast?"', '"Lukewarm. Like my enthusiasm."'];

/** G4d/G4h: a too-hot or too-cold cup: half tip when it's served (doc §4.2) and a complaint line. */
export function gearTempMiss(state: GameState, s: Station, p: Player, temp: 'hot' | 'cold'): void {
  p.cupTemp = true;
  const lines = temp === 'hot' ? TOO_HOT : TOO_COLD;
  const line = lines[state.tick % lines.length];
  quirk(state, s, `${temp === 'hot' ? 'Too hot' : 'Too cold'}: ${line} (half tip)`, p.id);
}
