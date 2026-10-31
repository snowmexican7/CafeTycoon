import { signatureServed, sigPremium, sigShare } from './signature';
import { areaPatienceMul, areaQualityTip, areaTipMul, batchOut, drinkSuppliesFor, gearAskedFor, gearPullMul, noteFamilyTip, snobFamilies, snobTip } from './gear';
import { DRINK_FAMILY, SNOB } from '../data/areas';
import { rivalAskFactor } from './rival';
import { roleCraft, roleTip } from './roles';
import { noteRegularLost, noteRegularServed, regularTipFactor } from './regulars';
import { demandFactor, menuPrice, pricePatience, priceTraffic } from './pricing';
import { ECONOMY } from '../data/economy';
import { TICK_RATE, isReservedId, secondsToTicks } from './constants';
import { computeModifiers, type Modifiers } from './effects';
import { emitLog } from './log';
import { tillSpeedTip } from './till';
import { levelUpOnServe } from './levelUp';
import { rngInt, rngNext } from './rng';
import { rogueActive, startRogue } from './rogue';
import { tally } from './tally';
import { tallyDrink } from './tally';
import { BASE_DRINKS, DRINK_IDS, DRINK_INFO, GEAR_WAIT, TAP_DRINKS } from '../data/drinks';
import { clearNameMixOnServe, maybeNameMix, maybeSpawnCamper, secretServeBonus } from './eggs';
import type { Customer, CustomerKind, DrinkId, GameState, PlayerId, Regular, SimEvent } from './types';
import { sellPastry } from './spoilage';
import { stockOf } from './fridge';
import { accuracyTip, noteCup, starsFor } from './accuracy';
import { comboTip, serveCombo, TASTE } from './taste';
import { checkoutFee } from './checkout';
import { tierInfo } from './growth';
import { menuDrinks, unlockedDrinks } from './unlocks';
import { comboDrinks, loseTicket, makeTicket, ORDERS } from './orders';

const DRINKS: DrinkId[] = DRINK_IDS;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Drinks the café can still make: unlocked, on the menu, and every supply the recipe needs has at least one unit. */
export function availableDrinks(state: GameState): DrinkId[] {
  const unlocked = unlockedDrinks(state);
  const coldOut = batchOut(state);
  return DRINKS.filter(
    (d) => unlocked.includes(d) && state.menu[d] && drinkSuppliesFor(state, d).every((s) => stockOf(state, s) >= 1) && !(coldOut && TAP_DRINKS.includes(d)),
  );
}

/** How long people ordering `d` expect to wait (1 = the base 33 s): the Gear table by drink, else the drink's own `wait`. */
export function drinkWait(state: GameState, d: DrinkId): number {
  return state.gear === true ? GEAR_WAIT[d] : DRINK_INFO[d].wait ?? 1;
}

/** Spots in the queue today: the layout's six (plus the kiosk's spot), less any a forecast takes (never below three). */
export function queueCapacity(m: Modifiers, cap: number = ECONOMY.queueCapacity): number {
  return Math.max(Math.min(3, cap), Math.min(cap + m.queueRoom, cap + m.queue));
}

/**
 * FB1 WP4: the board is on but nothing can be made. People still walk up, read it and leave: one arrival roll
 * per tick (rush hour is inside `m.traffic`), counted as a walkout, never as a lost customer or a turn-away.
 * Nothing on the board at all (menu all off) means nobody comes, as before.
 */
function soldOutWalkup(state: GameState): GameState {
  if (menuDrinks(state).length === 0) return state;
  const m = computeModifiers(state);
  if (rngNext(state) >= (ECONOMY.baseArrivalsPerSecond * m.traffic) / TICK_RATE) return state;
  tally(state.today, 'soldOutWalkouts');
  emitLog(state, 'walkout', { reason: 'soldOut' });
  state.today.soldOutAt ??= Math.round((secondsToTicks(state.settings.dayLengthSec) - state.phaseTicksLeft) / TICK_RATE);
  return state;
}

/**
 * Round 3 money: a would-be customer read the board and left over the price. Not a queued customer, never lost or
 * turned away (they never ordered): a fresh customer id, the drink they balked at (the likelier the dearer it is
 * against its list price) and one `walkout { customer, reason: 'price', drink }` for the renderer's "Too pricey!"
 * bubble at the door. One rngNext.
 */
function priceWalkout(state: GameState, menu: DrinkId[], m: Modifiers): void {
  const weights = menu.map((d) => m.orderBias[d] * DRINK_INFO[d].bias * Math.max(0, 1 - demandFactor(state, d)));
  const total = weights.reduce((a, b) => a + b, 0);
  let drink = menu[menu.length - 1];
  let roll = rngNext(state) * total;
  for (let i = 0; i < menu.length; i++) {
    roll -= weights[i];
    if (roll < 0) {
      drink = menu[i];
      break;
    }
  }
  tally(state.today, 'priceWalkouts');
  emitLog(state, 'walkout', { customer: state.nextCustomerId++, reason: 'price', drink });
}

/**
 * One arrival trial per tick; the queue has a cap and the menu drives what gets ordered. The roll is made against
 * the list-price rate: a roll the price takes away (below list, above the priced rate) is a price walkout.
 */
export function spawnCustomers(state: GameState): GameState {
  const menu = availableDrinks(state);
  if (menu.length === 0) return soldOutWalkup(state);
  const m = computeModifiers(state);
  const list = (ECONOMY.baseArrivalsPerSecond * m.traffic) / TICK_RATE;
  const p = list * priceTraffic(state, menu, m);
  const roll = rngNext(state);
  if (roll >= p) {
    if (roll < list) priceWalkout(state, menu, m);
    return state;
  }
  if (gearAskedFor(state, menu)) return state; // Gear G7c: wanted something you don't serve
  if (state.customers.length >= queueCapacity(m, tierInfo(state).queue)) {
    state.today.turnedAway += 1;
    return state;
  }
  // B8: rare Wi-Fi camper takes a seat instead of ordering.
  if (maybeSpawnCamper(state)) return state;
  addCustomer(state, rollKind(state));
  return state;
}

/** Weighted drink draw over the menu, biased by the café's order modifiers (one rngNext). */
export function drawDrink(state: GameState, menu: DrinkId[], m: Modifiers): DrinkId {
  const weights = menu.map((d) => m.orderBias[d] * DRINK_INFO[d].bias * demandFactor(state, d) * gearPullMul(state, d));
  let roll = rngNext(state) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < menu.length; i++) {
    roll -= weights[i];
    if (roll < 0) return menu[i];
  }
  return menu[menu.length - 1];
}

/** Which kind of customer walks in: day 1 uses the gentler mix, reweighted by the forecast; one rngNext, cumulative in mix order. */
export function rollKind(state: GameState): Exclude<CustomerKind, 'influencer'> {
  const base: Partial<Record<Exclude<CustomerKind, 'influencer'>, number>> =
    state.day === 1 ? ECONOMY.customers.mixDay1 : ECONOMY.customers.mix;
  const w = computeModifiers(state).mix;
  const kinds = ['normal', 'impatient', 'group', 'regular'] as const;
  const t = tierInfo(state).mix;
  const weights = kinds.map((k) => (base[k] ?? 0) * (k === 'normal' ? 1 : w[k] * t[k]));
  let roll = rngNext(state) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kinds.length; i++) {
    roll -= weights[i];
    if (roll < 0) return kinds[i];
  }
  return 'normal';
}

export function patienceFor(m: Modifiers, mul: number): number {
  return Math.round(ECONOMY.patienceSeconds * m.patience * mul * TICK_RATE);
}

/** The regular who comes in next: a new one while the roster has room, else one not queued whose drink is on the menu. */
export function pickRegular(state: GameState, menu: DrinkId[]): Regular | null {
  const cfg = ECONOMY.customers.regular;
  const snob = newSnob(state, menu);
  if (snob) return snob;
  const ordinary = state.regulars.filter((r) => !r.snob).length;
  if (ordinary < cfg.max) {
    const regular: Regular = { name: cfg.names[ordinary], drink: drawDrink(state, menu, computeModifiers(state)), visits: 0, lost: 0 };
    state.regulars.push(regular);
    return regular;
  }
  const candidates = state.regulars.filter((r) => !state.customers.some((c) => c.name === r.name) && menu.includes(r.drink));
  return candidates.length === 0 ? null : candidates[rngInt(state, candidates.length)];
}

/**
 * Gear G10b "top tiers add snob regulars": while the crew owns top-tier gear in a family without its snob,
 * the next regular is a new snob who orders that family's fanciest drink on the menu. Pure (no RNG).
 */
function newSnob(state: GameState, menu: DrinkId[]): Regular | null {
  const snobs = state.regulars.filter((r) => r.snob);
  if (snobs.length >= SNOB.max) return null;
  const have = new Set(snobs.map((r) => DRINK_FAMILY[r.drink]));
  for (const fam of snobFamilies(state)) {
    if (have.has(fam)) continue;
    const options = menu.filter((d) => DRINK_FAMILY[d] === fam);
    if (options.length === 0) continue;
    const drink = options.reduce((a, b) => (DRINK_IDS.indexOf(b) > DRINK_IDS.indexOf(a) ? b : a));
    const regular: Regular = { name: SNOB.names[snobs.length], drink, visits: 0, lost: 0, snob: true };
    state.regulars.push(regular);
    emitLog(state, 'gear.quirk', { gear: '', text: `🎩 ${regular.name} heard about your gear. A snob regular: big tips for a perfect ${DRINK_INFO[drink].name}, little for sloppy ones.` });
    return regular;
  }
  return null;
}

/** Draw the drink(s), apply the kind's patience and queue the customer; null when nothing can be made. */
export function addCustomer(state: GameState, kind: Exclude<CustomerKind, 'influencer'>): Customer | null {
  const menu = availableDrinks(state);
  if (menu.length === 0) return null;
  const m = computeModifiers(state);
  const regular = kind === 'regular' ? pickRegular(state, menu) : null;
  if (kind === 'regular' && regular === null) kind = 'normal';
  const g = ECONOMY.customers.group;
  const count = kind === 'group' ? g.min + rngInt(state, g.max - g.min + 1) : 1;
  const drinks = regular ? [regular.drink] : Array.from({ length: count }, () => drawDrink(state, menu, m));
  // P3 B7: a single walk-in may ask for the signature by name (one rngNext, only when a signature is on the menu).
  const sig = state.signature;
  const asksSig = !regular && count === 1 && sig !== undefined && menu.includes(sig.drink) && rngNext(state) < sigShare(sig) * rivalAskFactor(state);
  if (asksSig) drinks[0] = sig.drink;
  // FB2 B6: a Gear walk-in may order a second drink (a combo, from day 2): the ticket waits longer.
  const combo = !regular && !asksSig && (kind === 'normal' || kind === 'impatient') && comboDrinks(state, menu, drinks);
  const mul = (kind === 'impatient' ? ECONOMY.customers.impatient.patience : kind === 'group' ? g.patience : 1) * (combo ? ORDERS.combo.patience : 1);
  // Gear runs: poured drinks wait less, made-to-order ones more (GEAR_WAIT); a group waits as long as its slowest order
  const wait = Math.max(...drinks.map((d) => drinkWait(state, d) * pricePatience(state, d)));
  const patienceMax = patienceFor(m, mul * wait * areaPatienceMul(state, drinks));
  const customer: Customer = { id: state.nextCustomerId++, drink: drinks[0], patienceLeft: patienceMax, patienceMax };
  if (kind === 'impatient' || kind === 'group') customer.kind = kind;
  // FB2 B6: a Gear group is one multi-drink ticket; a classic group keeps its queue of extra drinks.
  if (kind === 'group') {
    if (state.gear === true) makeTicket(customer, drinks);
    else customer.extra = drinks.slice(1);
  }
  if (combo) {
    makeTicket(customer, drinks);
    customer.order = 'combo';
  }
  if (asksSig) customer.sig = true;
  if (state.gear === true) customer.stage = 'order';
  if (regular) {
    regular.visits += 1;
    customer.kind = 'regular';
    customer.name = regular.name;
    maybeNameMix(state, customer);
  }
  state.customers.push(customer);
  if (combo) emitLog(state, 'order.combo', { customer: customer.id, items: drinks.join(',') });
  return customer;
}

/** A customer leaves unserved: one lost per drink still owed, plus regular and influencer bookkeeping. */
export function loseCustomer(state: GameState, c: Customer): void {
  if (c.items) return loseTicket(state, c); // FB2 B6: a multi-drink ticket
  state.today.lost += 1 + (c.extra?.length ?? 0);
  if (c.kind === 'regular') {
    const regular = state.regulars.find((r) => r.name === c.name);
    if (regular) {
      regular.lost += 1;
      noteRegularLost(regular);
    }
    tally(state.today, 'lostRegulars');
  }
  if (c.kind === 'influencer') state.today.influencer = 'lost';
}

/** The influencer joins even a full queue (never past capacity + 1) and orders the café's most favoured drink. */
export function spawnInfluencer(state: GameState): Customer | null {
  const menu = availableDrinks(state);
  if (menu.length === 0 || state.customers.length > tierInfo(state).queue) return null;
  const m = computeModifiers(state);
  const top = Math.max(...menu.map((d) => m.orderBias[d]));
  const tied = menu.filter((d) => m.orderBias[d] === top);
  const drink = tied.includes('latte') ? 'latte' : tied[0];
  const patienceMax = patienceFor(m, ECONOMY.events.influencer.patience);
  const customer: Customer = { id: state.nextCustomerId++, drink, patienceLeft: patienceMax, patienceMax, kind: 'influencer' };
  if (state.gear === true) customer.stage = 'order';
  state.customers.push(customer);
  return customer;
}

/** Patience drains one tick at a time; at zero the customer storms out and counts as lost.
 *  An upset customer's patience is frozen; their remake window drains instead, and at zero they go rogue. */
export function stepCustomers(state: GameState): GameState {
  const remaining = [];
  const goneRogue: Customer[] = [];
  for (const c of state.customers) {
    if (c.upset) {
      c.upset.ticksLeft -= 1;
      if (c.upset.ticksLeft <= 0) goneRogue.push(c);
      else remaining.push(c);
      continue;
    }
    c.patienceLeft -= 1;
    if (c.patienceLeft <= 0) {
      if (c.egg === 'camper') {
        // Quiet exit — not a storm-out, just packed up the laptop.
        emitLog(state, 'egg.camper', { id: c.id, left: 1 });
      } else {
        loseCustomer(state, c);
      }
    } else remaining.push(c);
  }
  state.customers = remaining;
  for (const c of goneRogue) {
    loseCustomer(state, c);
    tally(state.today, 'rogues');
    startRogue(state, c);
  }
  return state;
}

/** The rogue roll: from minDay, with no rogue active, for a normal, impatient or regular customer (one rngNext only then). */
function rollsUpset(state: GameState, customer: Customer): boolean {
  if (state.day < ECONOMY.rogue.minDay || rogueActive(state)) return false;
  if (customer.kind !== undefined && customer.kind !== 'impatient' && customer.kind !== 'regular') return false;
  return rngNext(state) < ECONOMY.rogue.chance;
}

/** Served with at least this much patience left: a perfect serve (a visual celebration only). */
export const PERFECT_PATIENCE = 0.75;

/** Pay out one served customer: price, patience-scaled tip, cash, stats, and leave the queue. */
export function serveCustomer(state: GameState, customer: Customer, drink: DrinkId, by?: PlayerId, slips = 0, tempMiss = false, tipMul = 1): void {
  if (customer.egg === 'nameMix' && !customer.upset) {
    // Wrong name on the cup — they refuse until remade or the name is corrected.
    customer.upset = { ticksLeft: secondsToTicks(ECONOMY.rogue.remakeSeconds) };
    emitLog(state, 'egg.nameMix', { id: customer.id, refuse: 1, wrong: customer.wrongName ?? '' });
    return;
  }
  if (customer.upset) {
    delete customer.upset;
    emitLog(state, 'rogue.remade', { drink, by: by ?? '' });
  } else if (rollsUpset(state, customer)) {
    // The drink is consumed: no pay, no serve, no waste; they stay queued with patience frozen.
    customer.upset = { ticksLeft: secondsToTicks(ECONOMY.rogue.remakeSeconds) };
    emitLog(state, 'rogue.upset', { drink });
    return;
  }
  payCup(state, customer, drink, by, slips, tempMiss, tipMul);
  if (customer.extra && customer.extra.length > 0) {
    customer.drink = customer.extra.shift() as DrinkId;
    customer.patienceLeft = Math.min(
      customer.patienceMax,
      customer.patienceLeft + Math.round(ECONOMY.customers.group.refill * customer.patienceMax),
    );
    return;
  }
  state.customers = state.customers.filter((c) => c !== customer);
}

/**
 * Charge one cup to `customer` (who stays in the queue): price, patience-scaled tip, cash, stats, the `served` event.
 * Returns the price and the tip (FB2 B6: a multi-drink ticket sums them).
 */
export function payCup(state: GameState, customer: Customer, drink: DrinkId, by?: PlayerId, slips = 0, tempMiss = false, tipMul = 1): { price: number; tip: number } {
  const m = computeModifiers(state);
  const sig = customer.sig && state.signature?.drink === drink ? state.signature : undefined;
  const price = round2(menuPrice(state, drink) * m.price[drink] + (sig ? sigPremium(sig) : 0));
  const reg = customer.kind === 'regular' ? state.regulars.find((r) => r.name === customer.name && r.drink === drink) : undefined;
  const kindTip =
    customer.kind === 'impatient' ? ECONOMY.customers.impatient.tip : customer.kind === 'regular' ? ECONOMY.customers.regular.tip * (reg ? regularTipFactor(state, reg) : 1) : 1;
  if (reg) noteRegularServed(state, reg);
  const pastry = sellPastry(state, by);
  const stars = starsFor(slips);
  noteCup(state.today, stars);
  const combo = serveCombo(state, drink, state.today, sig?.twist);
  const sigBonus = sig && combo ? signatureServed(state.today, combo.stars) : 0;
  let tip = round2(price * ((ECONOMY.maxTipRate * customer.patienceLeft) / customer.patienceMax + m.tipRate) * kindTip * roleTip(state, by) * accuracyTip(stars) * comboTip(combo?.stars) * areaTipMul(state, drink) + roleCraft(state, by));
  // Gear G10b: the arts crowd and snob regulars notice quality.
  const quality = areaQualityTip(state, stars) * (reg?.snob ? snobTip(stars) : 1);
  if (quality !== 1) tip = round2(tip * quality);
  // Gear G4h (doc §4.2): a too-hot or too-cold cup earns half the tip.
  if (tempMiss) tip = round2(tip / 2);
  // Batch/pickup: e.g. black coffee from an empty condiment bar (×0.8).
  if (tipMul !== 1) tip = round2(tip * tipMul);
  // Gear G4g: rung up at the till and handed off fast.
  const speedTip = tillSpeedTip(state, customer);
  if (speedTip) tip = round2(tip + speedTip);
  // P3 B12: the card terminal's cut of the sale.
  const fee = checkoutFee(state, price + tip);
  if (fee > 0) state.today.checkoutFees = round2((state.today.checkoutFees ?? 0) + fee);
  state.cash = round2(state.cash + price + tip + sigBonus - fee - (combo ? TASTE.cost : 0));
  state.today.sales = round2(state.today.sales + price);
  state.today.tips = round2(state.today.tips + tip);
  noteFamilyTip(state, drink, tip);
  state.today.served += 1;
  tallyDrink(state.today, drink);
  noteReport(state.today, customer, drink, by, price + tip);
  levelUpOnServe(state, drink); // Gear G6: drinks level up with use
  // For the "Dev served a latte +$6" toast: who, what, how much, and whether it was a perfect serve.
  const perfect = customer.patienceLeft / customer.patienceMax >= PERFECT_PATIENCE;
  if (perfect) state.today.perfect = (state.today.perfect ?? 0) + 1;
  const served: SimEvent['data'] = {
    by: by ?? '',
    item: drink,
    amount: round2(price + tip),
    kind: customer.kind ?? 'normal',
    cid: customer.id,
    perfect,
    left: customer.extra?.length ?? 0,
    stars,
    ...(speedTip ? { till: speedTip } : {}),
  };
  if (combo) {
    served.twist = combo.twist;
    served.combo = combo.stars;
    if (combo.found) served.found = true;
  }
  if (sig) served.sig = sig.name;
  if (sigBonus) served.sigBonus = sigBonus;
  if (pastry) served.pastry = pastry;
  if (customer.name !== undefined) served.name = customer.name;
  emitLog(state, 'served', served);
  clearNameMixOnServe(customer);
  secretServeBonus(state, drink);
  if (customer.kind === 'influencer') {
    tally(state.today, 'bonus', ECONOMY.events.influencer.bonus);
    state.cash = round2(state.cash + ECONOMY.events.influencer.bonus);
    state.today.influencer = 'served';
    emitLog(state, 'influencer', { result: 'served' });
  }
  return { price, tip };
}

/** Serve target among `match`: an upset customer first, else the most impatient. */
export function serveTarget(state: GameState, match: (c: Customer) => boolean): Customer | null {
  let best: Customer | null = null;
  for (const c of state.customers) {
    if (c.egg === 'camper') continue; // Wi-Fi campers never order
    if (!match(c)) continue;
    if (best === null || (c.upset && !best.upset) || (!!c.upset === !!best.upset && c.patienceLeft < best.patienceLeft)) best = c;
  }
  return best;
}

/** Hand the held drink to the matching customer (upset first, else most impatient); tip scales with patience left. */
export function serveDrink(state: GameState, playerId: PlayerId): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.holding === null || player.holding === 'grounds') return state;
  const drink = player.holding;
  const target = serveTarget(state, (c) => c.drink === drink);
  if (target === null) return state;
  serveCustomer(state, target, drink, playerId, player.cupSlips ?? 0, player.cupTemp === true);
  player.holding = null;
  delete player.cupSlips;
  delete player.cupTemp;
  return state;
}

/** P4 B3: the manager report's per-day tallies (wait, takings per drink, who served what). */
function noteReport(today: GameState['today'], customer: Customer, drink: DrinkId, by: PlayerId | undefined, takings: number): void {
  today.waitTicks = (today.waitTicks ?? 0) + Math.max(0, customer.patienceMax - customer.patienceLeft);
  const t = (today.takingsByDrink ??= {});
  t[drink] = round2((t[drink] ?? 0) + takings);
  if (by && !isReservedId(by)) {
    // Own-key check: an id like "toString" must not find an inherited member and write onto it (review I4).
    const map = (today.byPlayer ??= {});
    if (!Object.hasOwn(map, by)) map[by] = { serves: 0, takings: 0 };
    const b = map[by]!;
    b.serves += 1;
    b.takings = round2(b.takings + takings);
  }
}
