/**
 * FB1 WP6: the night planner. A pure, deterministic read of the night that lists what a sensible
 * crew would do before opening: restock, prices, twists, the signature, the rival, growing, the
 * checkout path and the back bar. Bot crewmates voice the top of the list as tips; the balance
 * tester's `planner` policy applies all of it. Advice never spends money in a real game: each item
 * carries the night input a human would send.
 *
 * Final shapes:
 *
 *   interface Advice {
 *     id: string;   // restock:<supply> | price:<drink> | twist:<drink> | signature | scout | rival |
 *                   // grow:<tier> | checkout:<id> | slot:<index> | equip:espresso | menu:<drink>
 *     kind: 'restock' | 'price' | 'twist' | 'signature' | 'scout' | 'rival' | 'grow' | 'checkout' | 'slot' | 'equip' | 'menu';
 *     text: string;
 *     input: NightFix;   // the input without its playerId
 *     priority: number;  // restock out 100, low 90; rival 80; grow 70; checkout 60; slot 55; price 50;
 *                        // twist 40; signature 35; equip 30; scout 20; menu 10
 *   }
 *   planNight(state): Advice[]                                   // priority desc, then id asc
 *   crewTips(state, max = 2): (Advice & { by: PlayerId })[]      // top `max`, round-robin over connected bots (before they clock in: the ids the roster spawns)
 *
 * In a Gear run there is no `slot` or `equip` advice (the Gear board replaces the stations shop).
 * Opening night is for stocking up: grow, checkout and equip advice wait for a finished day (as
 * `nightBrief` does). A drink with no station is only taken off the board when nothing in this plan
 * or in `state.equipment` could bring that station back (no grow advice, the kind not unplaced).
 *
 * Money: one day's rent is held back, and every advice that spends (restock, grow, checkout, equip,
 * scout) draws on what is left in priority order, so applying the whole list never overdraws the
 * till or eats tomorrow's rent.
 *
 * Pure: no RNG, no Date, no mutation of `state`. Reads only what the crew can see (the taste
 * notebook, the scouted rival copy), never hidden state (`comboStars`, `adOutcome`, `rivalMenu`).
 */
import { BASE_DRINKS, DRINK_INFO } from '../../data/drinks';
import { ECONOMY } from '../../data/economy';
import { EQUIPMENT } from '../../data/equipment';
import type { EquipmentKind } from '../../data/equipment';
import { expectedUse } from '../brief';
import type { NightFix } from '../brief';
import { CHECKOUT, nextCheckout } from '../checkout';
import { computeModifiers, rentForDay } from '../effects';
import { isGearRun } from '../gear';
import { DRINK_STATIONS, nextTier, TIERS } from '../growth';
import { restockCost } from '../night';
import { PRICING, priceForecast, priceStep } from '../pricing';
import { copyIsLive, RIVAL, sigPrice } from '../rival';
import { SIG } from '../signature';
import { defaultSlots, reasonOff, slotCount } from '../slots';
import { knownStars, TWIST_INFO, TWISTS, twistFor } from '../taste';
import type { TwistId } from '../taste';
import { menuDrinks, SUPPLY_IDS } from '../unlocks';
import { BOT_IDS, botsFor, humanCount } from './roster';
import type { CheckoutId, DrinkId, GameState, PlayerId, StationKind, SupplyId } from '../types';

export type AdviceKind = 'restock' | 'price' | 'twist' | 'signature' | 'scout' | 'rival' | 'grow' | 'checkout' | 'slot' | 'equip' | 'menu';

export interface Advice {
  id: string;
  kind: AdviceKind;
  text: string;
  input: NightFix;
  priority: number;
}

export const PLAN_PRIORITY = {
  restockOut: 100,
  restockLow: 90,
  rival: 80,
  grow: 70,
  checkout: 60,
  slot: 55,
  price: 50,
  twist: 40,
  signature: 35,
  equip: 30,
  scout: 20,
  menu: 10,
} as const;

/** Restock to this multiple of the day's expected use. */
export const RESTOCK_MARGIN = 1.25;
/** Price steps the planner weighs for each drink. */
export const PLAN_STEPS = { min: -2, max: 4 } as const;
/** Scouting waits for this much spare cash after rent. */
const SCOUT_SPARE = 20;
/** Supplies the restock input accepts (pastries come with the stand, not by the pack). */
const RESTOCKABLE: SupplyId[] = ['beans', 'milk', 'concentrate', 'flavour'];
const MAX_PACKS = 100;

const STOCK_NAME: Record<SupplyId, string> = { beans: 'beans', milk: 'milk', concentrate: 'cold brew', flavour: 'flavours', pastry: 'pastries' };
const CHECKOUT_LABEL: Record<CheckoutId, string> = { register: 'register', kiosk: 'kiosk', squarely: 'tap terminal' };

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toFixed(2)}`;
const dollars = (n: number) => `$${n.toFixed(2).replace(/\.00$/, '')}`;
const drinkName = (d: DrinkId) => DRINK_INFO[d].name;
// G10a fix: the Gear-only drip machine has no EQUIPMENT entry.
const stationName = (k: StationKind) => (k === 'counter' ? 'counter' : k === 'drip' ? 'drip machine' : EQUIPMENT[k as EquipmentKind].name.toLowerCase());
const byId = (a: Advice, b: Advice) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Cash the plan may spend tonight, drawn down as spending advice is added. */
interface Budget {
  left: number;
}

/** Restock every supply a menu drink needs up to the day's expected use × RESTOCK_MARGIN; out-of-stock first. */
export function restockAdvice(state: GameState, budget: Budget = { left: round2(state.cash - rentForDay(state)) }): Advice[] {
  const use = expectedUse(state);
  const menu = menuDrinks(state);
  const wants = SUPPLY_IDS.filter((s) => RESTOCKABLE.includes(s) && menu.some((d) => ECONOMY.drinkSupplies[d].includes(s)))
    .map((supply) => ({ supply, have: state.supplies[supply] ?? 0, target: use[supply] * RESTOCK_MARGIN }))
    .filter((w) => w.have < w.target);
  const out = wants.filter((w) => w.have < 1);
  const low = wants.filter((w) => w.have >= 1);
  const advice: Advice[] = [];
  for (const { supply, have, target } of [...out, ...low]) {
    let packs = Math.min(MAX_PACKS, Math.max(1, Math.ceil((target - have) / ECONOMY.packs[supply].size)));
    while (packs > 0 && restockCost(state, supply, packs) > budget.left) packs -= 1;
    if (packs <= 0) continue;
    const cost = restockCost(state, supply, packs);
    budget.left = round2(budget.left - cost);
    const isOut = have < 1;
    advice.push({
      id: `restock:${supply}`,
      kind: 'restock',
      text: `${isOut ? 'Out of' : 'Low on'} ${STOCK_NAME[supply]}: buy ${packs} ${packs === 1 ? 'pack' : 'packs'} (${money(cost)})`,
      input: { kind: 'restock', supply, packs },
      priority: isOut ? PLAN_PRIORITY.restockOut : PLAN_PRIORITY.restockLow,
    });
  }
  return advice;
}

/** The forecast profit on `drink` if its price step were `step` (every other step as it is). */
function drinkProfitAt(state: GameState, menu: DrinkId[], drink: DrinkId, step: number): number {
  const m = computeModifiers(state);
  const walkIns = ECONOMY.baseArrivalsPerSecond * state.settings.dayLengthSec * m.traffic;
  const steps = { ...(state.priceSteps ?? {}) };
  if (step === 0) delete steps[drink];
  else steps[drink] = step;
  const probe: GameState = { ...state, priceSteps: Object.keys(steps).length ? steps : undefined };
  return priceForecast(probe, menu, m, walkIns).find((l) => l.drink === drink)?.profit ?? 0;
}

function priceAdvice(state: GameState): Advice[] {
  const menu = menuDrinks(state);
  // While the rival's knock-off of the signature is live, its price is the rival rule's call.
  const held = state.signature && copyIsLive(state) ? state.signature.drink : null;
  const advice: Advice[] = [];
  for (const d of menu) {
    if (d === held) continue;
    const now = priceStep(state, d);
    let best = now;
    let bestProfit = drinkProfitAt(state, menu, d, now);
    for (let s = PLAN_STEPS.min; s <= PLAN_STEPS.max; s++) {
      if (s === now) continue;
      const p = drinkProfitAt(state, menu, d, s);
      // Ties keep the current step, then prefer the step nearer list price.
      if (p > bestProfit || (p === bestProfit && best !== now && Math.abs(s) < Math.abs(best))) {
        best = s;
        bestProfit = p;
      }
    }
    if (best === now) continue;
    const price = round2(ECONOMY.prices[d] + best * PRICING.step);
    const was = round2(ECONOMY.prices[d] + now * PRICING.step);
    advice.push({
      id: `price:${d}`,
      kind: 'price',
      text: `${best > now ? 'Raise' : 'Cut'} the ${drinkName(d)} to ${money(price)} (now ${money(was)})`,
      input: { kind: 'price', drink: d, step: best },
      priority: PLAN_PRIORITY.price,
    });
  }
  return advice;
}

/** Known twists on a drink with their stars, best first (TWISTS order breaks ties). */
function knownTwists(state: GameState, d: DrinkId): { twist: TwistId; stars: number }[] {
  return TWISTS.map((twist) => ({ twist, stars: knownStars(state, d, twist) }))
    .filter((k): k is { twist: TwistId; stars: number } => k.stars !== null)
    .sort((a, b) => b.stars - a.stars);
}

function twistAdvice(state: GameState): Advice[] {
  const menu = menuDrinks(state);
  const advice = new Map<DrinkId, Advice>();
  for (const d of menu) {
    const cur = twistFor(state, d);
    const curStars = cur ? knownStars(state, d, cur) : null;
    if (curStars !== null && curStars >= 4) continue;
    const top = knownTwists(state, d)[0];
    if (top && top.stars >= 4) {
      advice.set(d, {
        id: `twist:${d}`,
        kind: 'twist',
        text: `Put ${TWIST_INFO[top.twist].name} on the ${drinkName(d)} (known ${top.stars}★)`,
        input: { kind: 'twist', drink: d, twist: top.twist },
        priority: PLAN_PRIORITY.twist,
      });
    } else if (cur && curStars !== null && curStars <= 2) {
      advice.set(d, {
        id: `twist:${d}`,
        kind: 'twist',
        text: `Drop ${TWIST_INFO[cur].name} from the ${drinkName(d)} (known ${curStars}★)`,
        input: { kind: 'twist', drink: d, twist: null },
        priority: PLAN_PRIORITY.twist,
      });
    }
  }
  // Otherwise explore: the first untried twist on yesterday's best seller.
  const sold = state.days.at(-1)?.drinks;
  const best = sold ? menu.reduce<DrinkId | null>((a, d) => ((sold[d] ?? 0) > (a ? (sold[a] ?? 0) : 0) ? d : a), null) : null;
  if (best && !advice.has(best)) {
    const cur = twistFor(state, best);
    const curStars = cur ? knownStars(state, best, cur) : null;
    // A twist already on and still untried is being explored; wait for it to be served.
    const exploring = cur !== null && curStars === null;
    const untried = TWISTS.find((t) => t !== cur && knownStars(state, best, t) === null);
    if (!exploring && untried && (curStars === null || curStars < 4)) {
      advice.set(best, {
        id: `twist:${best}`,
        kind: 'twist',
        text: `Try ${TWIST_INFO[untried].name} on the ${drinkName(best)} (untried)`,
        input: { kind: 'twist', drink: best, twist: untried },
        priority: PLAN_PRIORITY.twist,
      });
    }
  }
  return menu.flatMap((d) => (advice.has(d) ? [advice.get(d)!] : []));
}

function signatureAdvice(state: GameState): Advice[] {
  if (state.signature) return [];
  let best: { drink: DrinkId; twist: TwistId; stars: number } | null = null;
  for (const d of menuDrinks(state)) {
    const top = knownTwists(state, d)[0];
    if (top && top.stars >= 4 && (!best || top.stars > best.stars)) best = { drink: d, ...top };
  }
  if (!best) return [];
  const name = `${drinkName(best.drink)} ${TWIST_INFO[best.twist].name}`.slice(0, SIG.nameMax).trim();
  const premium = 2;
  return [
    {
      id: 'signature',
      kind: 'signature',
      text: `Make "${name}" your signature at +${dollars(premium * SIG.premiumStep)} (known ${best.stars}★)`,
      input: { kind: 'signature', sig: { name, drink: best.drink, twist: best.twist, premium } },
      priority: PLAN_PRIORITY.signature,
    },
  ];
}

/** When the rival's knock-off undercuts the signature: the smallest menu price cut that matches it, else a smaller premium. */
function rivalAdvice(state: GameState): Advice[] {
  const sig = state.signature;
  if (!sig || !copyIsLive(state)) return [];
  const copy = state.rival!.copy!;
  if (sigPrice(state, sig) <= copy.price) return [];
  const now = priceStep(state, sig.drink);
  for (let s = now - 1; s >= PRICING.minStep; s--) {
    const steps = { ...(state.priceSteps ?? {}) };
    if (s === 0) delete steps[sig.drink];
    else steps[sig.drink] = s;
    const probe: GameState = { ...state, priceSteps: Object.keys(steps).length ? steps : undefined };
    const price = sigPrice(probe, sig);
    if (price <= copy.price) {
      return [
        {
          id: 'rival',
          kind: 'rival',
          text: `${RIVAL.name} sells a knock-off for ${money(copy.price)}: cut the ${drinkName(sig.drink)} so ${sig.name} is ${money(price)}`,
          input: { kind: 'price', drink: sig.drink, step: s },
          priority: PLAN_PRIORITY.rival,
        },
      ];
    }
  }
  for (let p = sig.premium - 1; p >= 0; p--) {
    const price = sigPrice(state, { ...sig, premium: p });
    if (price <= copy.price) {
      return [
        {
          id: 'rival',
          kind: 'rival',
          text: `${RIVAL.name} sells a knock-off for ${money(copy.price)}: drop ${sig.name}'s premium so it is ${money(price)}`,
          input: { kind: 'signature', sig: { name: sig.name, drink: sig.drink, twist: sig.twist, premium: p } },
          priority: PLAN_PRIORITY.rival,
        },
      ];
    }
  }
  return [];
}

function growAdvice(state: GameState, budget: Budget): Advice[] {
  const tier = nextTier(state);
  if (!tier || state.days.length === 0) return [];
  const cost = TIERS[tier].cost;
  if (budget.left < cost) return [];
  budget.left = round2(budget.left - cost);
  return [{ id: `grow:${tier}`, kind: 'grow', text: `Grow to the ${TIERS[tier].short} (${dollars(cost)})`, input: { kind: 'grow', tier }, priority: PLAN_PRIORITY.grow }];
}

function checkoutAdvice(state: GameState, budget: Budget): Advice[] {
  const co = nextCheckout(state);
  if (!co || state.days.length === 0) return [];
  const cost = CHECKOUT[co].cost;
  if (budget.left < cost) return [];
  budget.left = round2(budget.left - cost);
  return [
    { id: `checkout:${co}`, kind: 'checkout', text: `Buy the ${CHECKOUT_LABEL[co]} (${dollars(cost)})`, input: { kind: 'checkout', checkout: co }, priority: PLAN_PRIORITY.checkout },
  ];
}

/** The back bar as the slot inputs see it. */
function slotsOf(state: GameState): (StationKind | null)[] {
  const slots = state.slots ?? defaultSlots(state.tier);
  return Array.from({ length: slotCount(state.tier) }, (_, i) => slots[i] ?? null);
}

function slotAdvice(state: GameState): Advice[] {
  if (isGearRun(state)) return []; // Gear runs replace the classic stations shop: `slot` does nothing there.
  const equipment = state.equipment ?? [];
  if (equipment.length === 0) return [];
  const index = slotsOf(state).indexOf(null);
  if (index < 0) return [];
  const station = equipment[0];
  return [
    {
      id: `slot:${index}`,
      kind: 'slot',
      text: `Put the ${stationName(station)} in slot ${index + 1}`,
      input: { kind: 'slot', index, station },
      priority: PLAN_PRIORITY.slot,
    },
  ];
}

/** A placed station that could make way: a spare of a kind (not espresso), or one no known drink needs (never the bin). */
function freeableSlot(state: GameState, slots: (StationKind | null)[]): boolean {
  const known = state.unlocked ?? BASE_DRINKS;
  return slots.some((k, i) => {
    if (k === null || k === 'espresso' || k === 'trash') return false;
    if (slots.indexOf(k) !== i) return true;
    return !known.some((d) => DRINK_STATIONS[d].includes(k));
  });
}

function equipAdvice(state: GameState, budget: Budget, slotTaken: boolean): Advice[] {
  if (isGearRun(state)) return []; // ...and `equip` does nothing there either (the Gear board sells machines).
  if (state.days.length === 0) return [];
  const last = state.days.at(-1)!;
  if (last.lost <= last.served) return [];
  const slots = slotsOf(state);
  const owned = slots.filter((k) => k === 'espresso').length + (state.equipment ?? []).filter((k) => k === 'espresso').length;
  if (owned !== 1) return [];
  const empty = slots.filter((k) => k === null).length - (slotTaken ? 1 : 0);
  const room = empty > 0;
  if (!room && !freeableSlot(state, slots)) return [];
  const cost = EQUIPMENT.espresso.cost;
  if (budget.left < cost) return [];
  budget.left = round2(budget.left - cost);
  return [
    {
      id: 'equip:espresso',
      kind: 'equip',
      text: `${last.lost} walked out to ${last.served} served: buy a second espresso machine (${dollars(cost)})${room ? '' : ', then free a slot for it'}`,
      input: { kind: 'equip', station: 'espresso' },
      priority: PLAN_PRIORITY.equip,
    },
  ];
}

function scoutAdvice(state: GameState, budget: Budget): Advice[] {
  if (state.day < 2 || state.rival?.scouted === state.day || budget.left < SCOUT_SPARE) return [];
  budget.left = round2(budget.left - RIVAL.scoutCost);
  return [{ id: 'scout', kind: 'scout', text: `Scout ${RIVAL.name} for ${dollars(RIVAL.scoutCost)}`, input: { kind: 'scout' }, priority: PLAN_PRIORITY.scout }];
}

/**
 * Switch off drinks the bar has no station for, as long as at least one other drink stays on. Not while the
 * plan grows (the new tier may bring the station) or a missing station sits unplaced in equipment (the
 * slot advice, or the crew, can put it back).
 */
function menuAdvice(state: GameState, growing: boolean): Advice[] {
  if (growing) return [];
  const unplaced = state.equipment ?? [];
  const on = (state.unlocked ?? BASE_DRINKS).filter((d) => state.menu[d]);
  let stays = on.length;
  const advice: Advice[] = [];
  for (const d of on) {
    if (reasonOff(state, d) !== 'noStation' || stays <= 1) continue;
    const absent = DRINK_STATIONS[d].filter((k) => !state.stations.some((s) => s.kind === k));
    if (absent.some((k) => unplaced.includes(k))) continue;
    stays -= 1;
    const missing = absent[0];
    advice.push({
      id: `menu:${d}`,
      kind: 'menu',
      text: `Take the ${drinkName(d)} off the board${missing ? `: there's no ${stationName(missing)}` : ''}`,
      input: { kind: 'menu', drink: d, on: false },
      priority: PLAN_PRIORITY.menu,
    });
  }
  return advice;
}

/** Everything worth doing tonight, highest priority first (ties by id). Pure and deterministic. */
export function planNight(state: GameState): Advice[] {
  const budget: Budget = { left: round2(state.cash - rentForDay(state)) };
  // Spending advice draws on the budget in priority order: restock, grow, checkout, equip, scout.
  const restock = restockAdvice(state, budget);
  const grow = growAdvice(state, budget);
  const checkout = grow.length ? [] : checkoutAdvice(state, budget);
  const slot = slotAdvice(state);
  const equip = equipAdvice(state, budget, slot.length > 0);
  const scout = scoutAdvice(state, budget);
  const all = [
    ...restock,
    ...rivalAdvice(state),
    ...grow,
    ...checkout,
    ...slot,
    ...priceAdvice(state),
    ...twistAdvice(state),
    ...signatureAdvice(state),
    ...equip,
    ...scout,
    ...menuAdvice(state, grow.length > 0),
  ];
  return all.sort((a, b) => b.priority - a.priority || byId(a, b));
}

/** The top `max` advice, voiced by the connected bot crewmates in players order, round-robin. */
export function crewTips(state: GameState, max = 2): (Advice & { by: PlayerId })[] {
  const present = state.players.filter((p) => p.connected && p.bot && p.bot.personality !== 'human').map((p) => p.id);
  // bots only clock in at startDay: before that (the opening night) name the ones the roster will spawn
  const bots = present.length > 0 ? present : BOT_IDS.slice(0, botsFor(state.settings.bots, humanCount(state)));
  if (bots.length === 0 || max <= 0) return [];
  return planNight(state)
    .slice(0, max)
    .map((a, i) => ({ ...a, by: bots[i % bots.length] }));
}
