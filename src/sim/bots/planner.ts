/**
 * FB1 WP6: the night planner. A pure, deterministic read of the night that lists what a sensible
 * crew would do before opening: restock, prices, twists, the signature, the rival, growing, the
 * checkout path, the back bar and, in Gear runs, machines, staff and the Phase 4 systems. Bot
 * crewmates voice the top of the list as tips; the balance tester's `planner` policy applies the
 * classic part of it. Advice never spends money in a real game, and bots never send inputs: each
 * item carries the night input a HUMAN would send.
 *
 * Final shapes:
 *
 *   interface Advice {
 *     id: string;   // restock:<supply> | price:<drink> | twist:<drink> | signature | scout | rival |
 *                   // grow:<tier> | checkout:<id> | slot:<index> | equip:espresso | menu:<drink>
 *                   // Gear runs: gear:<gearId> | staff:fire | staff:hire:strategist | staff:hire:marketer | rival:promo | rival:loyalty |
 *                   // branch:open | branch:staff | branch:send:<supply> | steep | condimentBox | fridge:f1 | fridge:f4 (FB2 A4)
 *     kind: AdviceKind;  // restock | price | twist | signature | scout | rival | grow | checkout | slot | equip | menu
 *     text: string;
 *     input: NightFix;   // the input without its playerId
 *     priority: number;  // see the table below
 *   }
 *   planNight(state): Advice[]                                   // priority desc, then id asc
 *   crewTips(state, max = 2): (Advice & { by: PlayerId })[]      // top `max`, round-robin over connected bots (before they clock in: the ids the roster spawns)
 *
 * Priorities (PLAN_PRIORITY); Gear-only rows marked G:
 *
 *   100 restock, out of stock          55 slot (classic)               40 twist
 *    90 restock, low                   53 staff:fire (G, kind equip)   35 signature
 *    86 steep (G, kind restock)        52 branch:staff (G, kind grow)  30 equip (classic)
 *    84 condimentBox (G, restock)      50 price                        20 scout
 *    80 rival (knock-off)              48 branch:send:* (G, restock)   10 menu
 *    75 rival:promo (G, rivalCounter)  45 rival:loyalty (G, stampCard)
 *    70 grow
 *    62 restock, pastries (R4 b)
 *    65 branch:open (G, kind grow)
 *    60 checkout
 *    59 fridge:<id> (G, kind equip)
 *    58 gear:<id> (G, kind equip)
 *
 * Gear rows reuse the existing AdviceKind values (the UI keeps a `Record<AdviceKind, ...>` of icons), so
 * tell them apart by `id` or `input.kind`: `steep` and `condimentBox` (batch coffee, below), `gear` buys, `staff` (fire only, never hire), `rivalCounter`,
 * `stampCard` and `branch` (open / staff / send).
 *
 * Gear runs: there is no `slot` or `equip` advice (the Gear board replaces the stations shop). The gear
 * hint walks the gearBalance upgrade path: it never trades the E1 pods for E2+ before a grinder is in a
 * slot, puts the polished C5 / E6 first when yesterday's cups averaged under 3 stars and they are affordable
 * tonight, says nothing while a crew vote is open, and leaves a flowing D4b alone (a daytime thing). FB2 C9: milk
 * needs a wand, so E3 is bought with the little wand and E4 with the proper one (`PATH_WAND`), and an E3/E4 that has
 * none (or E4's little one) gets the add-on first (`wand` input, `gear:wand:<station>` advice), and at the cart there
 * is no `grow:cafe` advice until a wand is on the floor (`wandFirst`: milk drinks used to come with the cart). A $50+
 * buy in a co-op crew becomes a proposal; the input is the same. `staff:fire` appears when yesterday's wages
 * beat the bots' takings in `DayStats.byPlayer`. Phase 4: match the rival's happy hour on a promo night,
 * print the stamp card once the rival's loyalty card is live (cash after bills >= $30 + a day's restock),
 * open the second shop at the café tier (cash after bills >= lease + a day's restock, a profitable day, the area
 * with the best `branchDay` estimate), add or cut a branch barista from yesterday's branch day (only if
 * `branchDay` says it pays), and send a pack of beans or milk when a Manager is on the crew and home stock is
 * more than two packs over tomorrow's use. Season pacing has no input to attach, so there is no season advice.
 *
 * Batch coffee (docs/superpowers/specs/2026-10-30-batch-pickup-design.md §2, §4): `steep` sets tomorrow's cold brew
 * number to ceil(expected orders for every drink that takes cold brew from the tap x STEEP_MARGIN), within the taps'
 * cap; the concentrate restock then buys only the top-up (the want less yesterday's leftovers), and the number is
 * what that stock and the budget can actually steep. `condimentBox` buys boxes when 60% of the expected plain
 * drip and cold brew orders outrun the bar's servings plus the boxes waiting in the corner. Both draw on the same
 * budget, right after restock. Classic runs get neither.
 *
 * Opening night is for stocking up: grow, checkout and equip advice wait for a finished day (as
 * `nightBrief` does). A drink with no station is only taken off the board when something can be made at all
 * and nothing in this plan or in `state.equipment` could bring that station back (no grow advice, the kind
 * not unplaced).
 *
 * Money: tomorrow's bills (rent plus wages: `billsForDay`, plus a losing branch's expected loss) are held back, and every advice that spends
 * (restock, grow, branch:open, checkout, gear, rival:loyalty, equip, scout) draws on what is left in
 * priority order, so applying the whole list never overdraws the till or eats tomorrow's bills.
 *
 * Pure: no RNG, no Date, no mutation of `state`. Reads only what the crew can see (the taste
 * notebook, the scouted rival copy), never hidden state (`comboStars`, `adOutcome`, `rivalMenu`).
 */
import { AREAS } from '../../data/areas';
import type { AreaId } from '../../data/areas';
import { BASE_DRINKS, DRINK_INFO, TAP_DRINKS } from '../../data/drinks';
import { ECONOMY } from '../../data/economy';
import { GEAR, WANDS } from '../../data/gear';
import type { AddOnWand, GearId } from '../../data/gear';
import { EQUIPMENT } from '../../data/equipment';
import type { EquipmentKind } from '../../data/equipment';
import { expectedOrders, expectedUse } from '../brief';
import type { NightFix } from '../brief';
import { CHECKOUT, nextCheckout } from '../checkout';
import { CONDIMENTS } from '../condiments';
import { fridgeCapacity, fridgeWanted, packsThatFit } from '../fridge';
import { FRIDGES } from '../../data/fridges';
import { billsForDay, crewCount, crewNames, wageEach } from '../staff';
import { averageStars } from '../accuracy';
import { GEAR_VOTE_MIN, gearRequiresMet, isGearRun, wandCards, type WandCard } from '../gear';
import { DRINK_STATIONS, nextTier, TIERS } from '../growth';
import { restockCost } from '../night';
import { steepPlan } from '../steep';
import { PRICING, priceStep } from '../pricing';
import { bestStep, forecastProfit, peakSteps } from '../strategist';
import { HIRE_ROLES, hireWage, isHired, type HireRole } from '../hires';
import { BRANCH, branchAreas, branchDay, branchExpectedLoss, canOpenBranch, hasManager } from '../branch';
import { profitOf } from '../profit';
import { copyIsLive, countered, hasStamps, isPromoDay, loyaltyLive, RIVAL, sigPrice } from '../rival';
import { SIG } from '../signature';
import { defaultSlots, reasonOff, slotCount } from '../slots';
import { knownStars, TWIST_INFO, TWISTS, twistFor } from '../taste';
import type { TwistId } from '../taste';
import { menuDrinks, SUPPLY_IDS, unlockedDrinks } from '../unlocks';
import { BOT_IDS, botsFor, humanCount } from './roster';
import type { CheckoutId, DrinkId, GameState, PlayerId, StationKind, SupplyId, TierId } from '../types';

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
  steep: 86,
  condimentBox: 84,
  rival: 80,
  rivalCounter: 75,
  grow: 70,
  branchOpen: 65,
  restockPastry: 62,
  checkout: 60,
  fridge: 59,
  gear: 58,
  slot: 55,
  staff: 53,
  staffHire: 54,
  branchStaff: 52,
  price: 50,
  branchSend: 48,
  stampCard: 45,
  twist: 40,
  signature: 35,
  equip: 30,
  scout: 20,
  menu: 10,
} as const;

/** Restock to this multiple of the day's expected use. */
export const RESTOCK_MARGIN = 1.25;
/** Steep this multiple of the expected cold brew orders (every drink that takes cold brew from the tap). */
export const STEEP_MARGIN = 1.2;
/** Price steps the planner weighs for each drink. */
export const PLAN_STEPS = { min: -2, max: 4 } as const;
/** Scouting waits for this much spare cash after rent. */
const SCOUT_SPARE = 20;
/** Supplies the restock input accepts (R4 b: pastries are a plain restock item too). */
const RESTOCKABLE: SupplyId[] = ['beans', 'milk', 'concentrate', 'flavour', 'pastry'];
const MAX_PACKS = 100;

const STOCK_NAME: Record<SupplyId, string> = { beans: 'beans', milk: 'milk', concentrate: 'cold brew', flavour: 'flavours', pastry: 'pastries' };
const CHECKOUT_LABEL: Record<CheckoutId, string> = { register: 'register', kiosk: 'kiosk', squarely: 'tap terminal' };

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toFixed(2)}`;
const dollars = (n: number) => `$${n.toFixed(2).replace(/\.00$/, '')}`;
const drinkName = (d: DrinkId) => DRINK_INFO[d].name;
// G10a fix: the Gear-only drip machine has no EQUIPMENT entry.
/** FB2 C9: in a Gear run the 'steamer' kind is the steam wand on the espresso machine. */
const stationName = (k: StationKind, gear = false) => (k === 'counter' ? 'counter' : k === 'drip' ? 'drip machine' : gear && k === 'steamer' ? 'steam wand' : EQUIPMENT[k as EquipmentKind].name.toLowerCase());
const byId = (a: Advice, b: Advice) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Review M4: what closing will take before any spending: rent and wages (`billsForDay`) plus a losing branch's expected loss. */
const billsHeldBack = (state: GameState): number => round2(billsForDay(state) + branchExpectedLoss(state));

/** Cash the plan may spend tonight, drawn down as spending advice is added. */
interface Budget {
  left: number;
}

/**
 * R4 b: a restock for the pastry case when it will not cover the day's expected sales (a $7 pack of six sells for $18).
 * No margin (half of what is left goes stale overnight); whole packs, rounded to the nearest.
 */
function pastryAdvice(state: GameState, budget: Budget, target: number): Advice | null {
  const size = ECONOMY.packs.pastry.size;
  const have = state.supplies.pastry ?? 0;
  const gap = target - have;
  if (gap < size / 2) return null;
  let packs = Math.min(MAX_PACKS, Math.max(1, Math.round(gap / size)));
  while (packs > 0 && restockCost(state, 'pastry', packs) > budget.left) packs -= 1;
  if (packs <= 0) return null;
  const cost = restockCost(state, 'pastry', packs);
  budget.left = round2(budget.left - cost);
  return {
    id: 'restock:pastry',
    kind: 'restock',
    text: `${have < 1 ? 'No' : 'Low on'} ${STOCK_NAME.pastry} in the case: buy ${packs} ${packs === 1 ? 'pack' : 'packs'} (${money(cost)})`,
    input: { kind: 'restock', supply: 'pastry', packs },
    priority: PLAN_PRIORITY.restockPastry,
  };
}

/**
 * Restock every supply a menu drink needs up to the day's expected use × RESTOCK_MARGIN; out-of-stock first.
 * A `targets` entry replaces that number for its supply (Gear: the steep top-up for concentrate).
 */
export function restockAdvice(
  state: GameState,
  budget: Budget = { left: round2(state.cash - billsHeldBack(state)) },
  targets: Partial<Record<SupplyId, number>> = {},
): Advice[] {
  const use = expectedUse(state);
  const menu = menuDrinks(state);
  // R4 b: no drink needs a pastry, so the case is stocked on its own terms (pastryAdvice, after every drink supply is paid).
  const wants = SUPPLY_IDS.filter((s) => RESTOCKABLE.includes(s) && s !== 'pastry' && menu.some((d) => ECONOMY.drinkSupplies[d].includes(s)))
    .map((supply) => ({ supply, have: state.supplies[supply] ?? 0, target: targets[supply] ?? use[supply] * RESTOCK_MARGIN }))
    .filter((w) => w.have < w.target);
  const out = wants.filter((w) => w.have < 1);
  const low = wants.filter((w) => w.have >= 1);
  const advice: Advice[] = [];
  for (const { supply, have, target } of [...out, ...low]) {
    // FB2 A4: Gear milk only as many packs as the fridge holds.
    let packs = packsThatFit(state, supply, Math.min(MAX_PACKS, Math.max(1, Math.ceil((target - have) / ECONOMY.packs[supply].size))));
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
  const pastry = pastryAdvice(state, budget, targets.pastry ?? use.pastry);
  if (pastry) advice.push(pastry);
  return advice;
}

/** Expected orders per drink tomorrow, unrounded (`expectedOrders`: price-aware, capped by capacity; 0 off the menu). */
function expectedOrdersFor(state: GameState): Partial<Record<DrinkId, number>> {
  const orders = expectedOrders(state);
  return Object.fromEntries(menuDrinks(state).map((d) => [d, orders[d]]));
}

/** Gear runs with a cold brew tap: the number of cups worth steeping tomorrow and the orders behind it. */
function steepWant(state: GameState): { want: number; expected: number; leftover: number } | null {
  if (!isGearRun(state)) return null;
  const plan = steepPlan(state);
  if (plan.cap <= 0) return null;
  const orders = expectedOrdersFor(state);
  const expected = TAP_DRINKS.reduce((sum, d) => sum + (orders[d] ?? 0), 0);
  return { want: Math.min(plan.cap, Math.ceil(expected * STEEP_MARGIN)), expected, leftover: plan.leftover };
}

/** Tomorrow's steep number: what the want, the leftovers, the concentrate in stock and the packs just bought can steep. */
function steepAdvice(state: GameState, steep: ReturnType<typeof steepWant>, restock: Advice[]): Advice[] {
  if (!steep) return [];
  const bought = restock.find((a) => a.id === 'restock:concentrate')?.input;
  const packs = bought && bought.kind === 'restock' ? bought.packs : 0;
  const fresh = Math.floor(state.supplies.concentrate ?? 0) + packs * ECONOMY.packs.concentrate.size;
  const n = Math.min(steep.want, steep.leftover + fresh);
  if (n === steepPlan(state).target) return [];
  return [
    {
      id: 'steep',
      kind: 'restock',
      text: `Steep ${n} cold brews for tomorrow (about ${Math.round(steep.expected)} cold brew orders expected)`,
      input: { kind: 'steep', cups: n },
      priority: PLAN_PRIORITY.steep,
    },
  ];
}

/** Gear runs: buy condiment boxes when the bar (and the boxes already waiting) can't cover the drip and cold brew drinkers. */
function condimentAdvice(state: GameState, budget: Budget): Advice[] {
  if (!isGearRun(state) || !state.condiments) return [];
  const orders = expectedOrdersFor(state);
  const use = Math.ceil(CONDIMENTS.share * ((orders.drip ?? 0) + (orders.coldBrew ?? 0)));
  // FB2 A4: servings put away in the fridge go back on the bar in the morning.
  const have = state.condiments.servings + (state.barAway ?? 0) + (state.condimentBoxes ?? 0) * CONDIMENTS.servings;
  if (use <= have) return [];
  let n = Math.min(CONDIMENTS.maxBoxes, Math.ceil((use - have) / CONDIMENTS.servings));
  while (n > 0 && round2(n * CONDIMENTS.boxCost) > budget.left) n -= 1;
  if (n <= 0) return [];
  const cost = round2(n * CONDIMENTS.boxCost);
  budget.left = round2(budget.left - cost);
  return [
    {
      id: 'condimentBox',
      kind: 'restock',
      text: `Buy ${n} condiment ${n === 1 ? 'box' : 'boxes'} (${dollars(cost)}): the bar runs dry tomorrow`,
      input: { kind: 'condimentBox', boxes: n },
      priority: PLAN_PRIORITY.condimentBox,
    },
  ];
}

function priceAdvice(state: GameState): Advice[] {
  const menu = menuDrinks(state);
  // While the rival's knock-off of the signature is live, its price is the rival rule's call.
  const held = state.signature && copyIsLive(state) ? state.signature.drink : null;
  const advice: Advice[] = [];
  for (const d of menu) {
    if (d === held) continue;
    const now = priceStep(state, d);
    const best = bestStep(state, menu, d, PLAN_STEPS);
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
  if (wandFirst(state, tier)) return [];
  const cost = TIERS[tier].cost;
  if (budget.left < cost) return [];
  budget.left = round2(budget.left - cost);
  return [{ id: `grow:${tier}`, kind: 'grow', text: `Grow to the ${TIERS[tier].short} (${dollars(cost)})`, input: { kind: 'grow', tier }, priority: PLAN_PRIORITY.grow }];
}

/**
 * FB2 C9: milk drinks wait for a wand (E3 and up), and they used to arrive with the cart. So at the cart (the café next)
 * a Gear crew with no wand on the floor puts the Sylvia and its little wand before growing again, but only while that
 * can happen (review M3): a grinder on the floor and an espresso machine to trade up or put a wand on. A crew going the
 * cold brew and drip way, or with no room for a grinder, grows as before.
 */
export function wandFirst(state: GameState, next: TierId | null): boolean {
  if (!isGearRun(state) || next !== 'cafe' || state.stations.some((s) => s.kind === 'steamer')) return false;
  return state.stations.some((s) => s.kind === 'grinder') && state.stations.some((s) => s.kind === 'espresso' && !s.twin);
}

/**
 * FB2 C9: the wand worth adding tonight (planner and gearBalance). With no wand on the floor: the path's wand for that
 * machine if it is on offer (E4: the proper one, review M2), else the first offer. Once a wand is on the floor, only the
 * path's upgrade (E4's little wand to a proper one); a second wandless machine waits (review M4). Null: none.
 */
export function pathWandCard(state: GameState): WandCard | null {
  const cards = wandCards(state);
  if (!state.stations.some((s) => s.kind === 'steamer' && s.wand !== undefined)) {
    const fresh = cards.filter((c) => !c.upgrade);
    return fresh.find((c) => c.wand === PATH_WAND[c.gear]) ?? fresh[0] ?? null;
  }
  return cards.find((c) => c.upgrade && c.wand === PATH_WAND[c.gear]) ?? null;
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

/**
 * The upgrade path a sensible Gear crew follows (scripts/gearBalance.ts plays the same one). FB2 C9: no steamer tree;
 * milk drinks wait for E3 and its wand (`PATH_WAND`), so the path heads for E3 early and skips the wand-less E2.
 */
export const GEAR_PATH: GearId[] = ['c1', 'e1', 'c2', 'g1', 'e3', 'c3', 'g2', 'd1', 'c4', 'e4', 'd2', 'd3', 'g3', 'e5', 'd4b', 'c5', 'd5b', 'e6'];
/** FB2 C9: the add-on wand bought with a machine on the path. */
export const PATH_WAND: Partial<Record<GearId, AddOnWand>> = { e3: 'weak', e4: 'strong' };
/** Under this many stars on average, the polished machines (C5, E6) jump the path when they are affordable. */
const POLISH_BELOW = 3;

/**
 * The next machine to buy in a Gear run (`{ kind: 'gear', action: 'buy', gear }`; with more than one human
 * a $50+ buy becomes a crew vote, but the input is the same). Walks GEAR_PATH: skips what the crew owns or
 * has a better one of, what has no slot to go in (a trade-in needs none), a branch whose parent is not far
 * enough along, and any espresso machine above the E1 pods while no grinder is in a slot (they could not
 * make a shot). The first one left is the advice; if it is out of reach the plan saves up for it. When
 * yesterday's cups averaged under 3★ the polished C5 / E6 (they forgive a slip) go first, but only when
 * they are affordable tonight. A flowing D4b is a daytime thing: no advice for it. No advice while a vote is open.
 */
function gearAdvice(state: GameState, budget: Budget): Advice[] {
  if (!isGearRun(state) || state.gearVote) return [];
  const slots = state.slots ?? [];
  const placed = (state.slotGear ?? []).filter((g): g is GearId => !!g);
  const room = slots.some((x, i) => x === null && i < slotCount(state.tier));
  const grinder = state.stations.some((s) => s.kind === 'grinder');
  const humans = state.players.filter((p) => p.connected && !p.bot).length;
  const last = state.days.at(-1);
  const avg = last ? averageStars(last) : null;
  const polishFirst = avg !== null && avg < POLISH_BELOW;

  // FB2 C9: an espresso machine that takes a wand and has none (or E4's little one) gets it first: milk drinks need it.
  const card = pathWandCard(state);
  if (card) {
    if (card.price > budget.left) return [];
    budget.left = round2(budget.left - card.price);
    const w = WANDS[card.wand];
    const on = GEAR[card.gear].name;
    return [
      {
        id: `gear:wand:${card.station}`,
        kind: 'equip',
        text: card.upgrade ? `Swap the little wand on the ${on} for a ${w.name.toLowerCase()} (${dollars(card.price)})` : `No steam wand, no milk drinks: add a ${w.name.toLowerCase()} to the ${on} (${dollars(card.price)})`,
        input: { kind: 'wand', station: card.station, wand: card.wand },
        priority: PLAN_PRIORITY.gear,
      },
    ];
  }
  const slotWand = (i: number): AddOnWand | null => state.slotWand?.[i] ?? null;

  /** What buying `id` would cost net of the trade-in (FB2 C9: with its path wand, less the old one's), or null when it cannot be bought tonight. */
  const deal = (id: GearId): { net: number; old: GearId | null; wand: AddOnWand | null } | null => {
    const want = GEAR[id];
    if (placed.includes(id)) return null;
    let old: GearId | null = null;
    let oldAt = -1;
    const all = state.slotGear ?? [];
    for (let i = 0; i < all.length; i++) {
      const o = all[i];
      if (o && GEAR[o].tree === want.tree && (!old || GEAR[o].tier > GEAR[old].tier)) {
        old = o;
        oldAt = i;
      }
    }
    if (old && GEAR[old].tier >= want.tier) return null;
    if (want.tree === 'espresso' && want.tier >= 2 && !grinder) return null;
    if (!gearRequiresMet(state, id)) return null;
    if (!old && !room) return null;
    const wand = PATH_WAND[id] ?? null;
    const oldWand = oldAt >= 0 ? slotWand(oldAt) : null;
    const back = old ? GEAR[old].sell + (oldWand ? WANDS[oldWand].sell : 0) : 0;
    return { net: round2(want.price + (wand ? WANDS[wand].withMachine : 0) - back), old, wand };
  };

  const order = polishFirst ? [...GEAR_PATH.filter((id) => GEAR[id].polish), ...GEAR_PATH.filter((id) => !GEAR[id].polish)] : GEAR_PATH;
  for (const id of order) {
    const d = deal(id);
    if (!d) continue;
    const polished = polishFirst && !!GEAR[id].polish;
    if (d.net > budget.left) {
      if (polished) continue; // too dear tonight: carry on down the normal path
      return []; // saving up for the next machine
    }
    budget.left = round2(budget.left - d.net);
    const g = GEAR[id];
    const back = d.old ? `, ${dollars(GEAR[d.old].sell)} back on the ${GEAR[d.old].name}` : '';
    const price = g.price + (d.wand ? WANDS[d.wand].withMachine : 0);
    const vote = humans > 1 && price >= GEAR_VOTE_MIN ? ', the crew votes' : '';
    const withWand = d.wand ? ` with the ${WANDS[d.wand].name.toLowerCase()}` : '';
    const buy = `buy the ${g.name}${withWand} (${dollars(price)}${back}${vote})`;
    return [
      {
        id: `gear:${id}`,
        kind: 'equip',
        text: polished ? `Cups averaged ${avg!.toFixed(1)}★: ${buy}, it forgives a slip` : `${buy[0]!.toUpperCase()}${buy.slice(1)}`,
        input: { kind: 'gear', action: 'buy', gear: id, ...(d.wand ? { wand: d.wand } : {}) },
        priority: PLAN_PRIORITY.gear,
      },
    ];
  }
  return [];
}

/**
 * FB2 A4, Gear runs: buy a fridge card (`fridgeWanted`): the Dorm Room Cube at a stand with a milk station (milk drinks
 * need it) or whose bar went bad last night; the Udder-Matic when a day's expected milk won't fit in the café's fridge
 * (no margin: the expected use already runs high). Only when the budget covers it.
 */
function fridgeAdvice(state: GameState, budget: Budget): Advice[] {
  if (state.gearVote || state.fridgeVote) return [];
  const want = fridgeWanted(state, expectedUse(state).milk);
  if (!want || want.price > budget.left) return [];
  budget.left = round2(budget.left - want.price);
  const f = FRIDGES[want.id];
  const why = want.why === 'none' ? 'No fridge: milk drinks are off and the condiment bar goes bad every night' : `The fridge holds ${fridgeCapacity(state)} milk, a day needs about ${expectedUse(state).milk}`;
  return [
    { id: `fridge:${want.id}`, kind: 'equip', text: `${why}: buy the ${f.name} (${dollars(want.price)})`, input: { kind: 'fridge', fridge: want.id }, priority: PLAN_PRIORITY.fridge },
  ];
}

/**
 * Gear runs: when yesterday's wages beat what the hired baristas rang up (the bots' share of
 * `DayStats.byPlayer`), suggest letting the newest one go. Never hiring. Quiet once a firing tonight
 * has already taken the crew below the count that was paid yesterday.
 */
function staffAdvice(state: GameState): Advice[] {
  if (!isGearRun(state)) return [];
  const last = state.days.at(-1);
  const each = wageEach(state);
  if (!last?.wages || !last.byPlayer || each <= 0 || crewCount(state) <= 0) return [];
  const paid = Math.max(1, Math.round(last.wages / each));
  if (crewCount(state) < paid) return [];
  const takings = round2(BOT_IDS.reduce((n, id) => n + (last.byPlayer![id]?.takings ?? 0), 0));
  if (last.wages <= takings) return [];
  const name = crewNames(state).at(-1) ?? 'The newest barista';
  return [
    {
      id: 'staff:fire',
      kind: 'equip',
      text: `${name} costs more than they bring in at the ${TIERS[state.tier ?? 'cafe'].short} (wages ${dollars(last.wages)}, crew rang up ${dollars(takings)})`,
      input: { kind: 'staff', action: 'fire' },
      priority: PLAN_PRIORITY.staff,
    },
  ];
}

const HIRE_NAME: Record<HireRole, string> = { strategist: 'a Strategist', marketer: 'a Marketer' };

/**
 * Round 3 item 3: advice to hire the Strategist or the Marketer when the forecast says they pay for themselves (the
 * day's forecast profit with them beats today's by more than their wage) and the till can carry it after tomorrow's
 * bills. Reuses the `equip` kind; ids `staff:hire:strategist` and `staff:hire:marketer`.
 */
function hireAdvice(state: GameState): Advice[] {
  if (!isGearRun(state)) return [];
  const now = forecastProfit(state);
  const advice: Advice[] = [];
  for (const role of HIRE_ROLES) {
    if (isHired(state, role)) continue;
    const wage = hireWage(state, role);
    if (wage <= 0 || round2(state.cash - billsHeldBack(state)) < round2(wage * 3)) continue;
    const probe: GameState = { ...state, staff: { ...(state.staff ?? {}), [role]: true } };
    if (role === 'strategist') probe.priceSteps = peakSteps(probe).steps;
    const gain = round2(forecastProfit(probe) - now);
    if (gain <= wage) continue;
    advice.push({
      id: `staff:hire:${role}`,
      kind: 'equip',
      text: `Hire ${HIRE_NAME[role]} (${dollars(wage)} a day): the forecast says it adds about ${dollars(gain)} a day`,
      input: { kind: 'staff', action: 'hire', role },
      priority: PLAN_PRIORITY.staffHire,
    });
  }
  return advice;
}

/** What it costs to stock one normal day (expected use, whole packs), whatever is in the pantry. */
function dayRestockCost(state: GameState): number {
  const use = expectedUse(state);
  const menu = menuDrinks(state);
  return round2(
    RESTOCKABLE.filter((s) => menu.some((d) => ECONOMY.drinkSupplies[d].includes(s))).reduce(
      (n, supply) => n + restockCost(state, supply, Math.ceil(use[supply] / ECONOMY.packs[supply].size)),
      0,
    ),
  );
}

/** P4 B1: tomorrow is one of the rival's happy-hour days and nobody has matched it (a free price cut). */
function rivalCounterAdvice(state: GameState): Advice[] {
  if (!isGearRun(state) || !isPromoDay(state) || countered(state)) return [];
  return [{ id: 'rival:promo', kind: 'rival', text: `Match ${RIVAL.name}'s happy hour`, input: { kind: 'rivalCounter' }, priority: PLAN_PRIORITY.rivalCounter }];
}

/** P4 F2: the rival's loyalty card is live and ours is not out: print the stamp card once there is $30 and a day's restock to spare. */
function stampAdvice(state: GameState, budget: Budget): Advice[] {
  if (!isGearRun(state) || !loyaltyLive(state) || hasStamps(state) || state.rival?.stamps !== undefined) return [];
  const spare = round2(state.cash - billsHeldBack(state));
  if (spare < round2(RIVAL.stampCost + dayRestockCost(state)) || budget.left < RIVAL.stampCost) return [];
  budget.left = round2(budget.left - RIVAL.stampCost);
  return [
    {
      id: 'rival:loyalty',
      kind: 'rival',
      text: `Print our own stamp card (${dollars(RIVAL.stampCost)}) to win back ${RIVAL.name}'s loyalty-card walk-ins`,
      input: { kind: 'stampCard' },
      priority: PLAN_PRIORITY.stampCard,
    },
  ];
}

/** The branch as it would be if opened in `area` (for the sim's own `branchDay` estimate). */
const branchProbe = (state: GameState, branch: NonNullable<GameState['branch']>): GameState => ({ ...state, branch });

/**
 * P4 B4: open the second shop at the café tier once there is the lease, bills and a day's stock to spare and
 * yesterday made a profit, in the area whose `branchDay` estimate (two baristas) is best and not a loss.
 */
function branchOpenAdvice(state: GameState, budget: Budget): Advice[] {
  if (!isGearRun(state) || !canOpenBranch(state)) return [];
  const last = state.days.at(-1);
  if (!last || profitOf(last) <= 0) return [];
  if (round2(state.cash - billsHeldBack(state)) < round2(BRANCH.cost + dayRestockCost(state)) || budget.left < BRANCH.cost) return [];
  let best: { area: AreaId; profit: number } | null = null;
  for (const area of branchAreas(state)) {
    const est = branchDay(branchProbe(state, { area, staff: BRANCH.staff.start, openedDay: state.day, spent: BRANCH.cost, by: 'plan' }));
    if (est && est.profit > 0 && (!best || est.profit > best.profit)) best = { area, profit: est.profit };
  }
  if (!best) return [];
  budget.left = round2(budget.left - BRANCH.cost);
  return [
    {
      id: 'branch:open',
      kind: 'grow',
      text: `Open a second shop in ${AREAS[best.area].name} (${dollars(BRANCH.cost)}, about ${dollars(Math.round(best.profit))} a day)`,
      input: { kind: 'branch', action: 'open', area: best.area },
      priority: PLAN_PRIORITY.branchOpen,
    },
  ];
}

/** P4 B4: one more barista at the branch after a day that walked people out (when the estimate says it pays), one fewer after a loss with no walk-outs. */
function branchStaffAdvice(state: GameState): Advice[] {
  const b = state.branch;
  const last = state.days.at(-1)?.branch;
  if (!isGearRun(state) || !b || !last) return [];
  const now = branchDay(state)!.profit;
  const profitWith = (staff: number) => branchDay(branchProbe(state, { ...b, staff }))!.profit;
  if (last.walked > 0 && b.staff < BRANCH.staff.max && profitWith(b.staff + 1) > now) {
    return [
      {
        id: 'branch:staff',
        kind: 'grow',
        text: `${last.walked} walked out of the second shop yesterday: put ${b.staff + 1} baristas there`,
        input: { kind: 'branch', action: 'staff', staff: b.staff + 1 },
        priority: PLAN_PRIORITY.branchStaff,
      },
    ];
  }
  if (last.profit < 0 && last.walked === 0 && b.staff > BRANCH.staff.min && profitWith(b.staff - 1) > now) {
    return [
      {
        id: 'branch:staff',
        kind: 'grow',
        text: `The second shop lost ${money(-last.profit)} with nobody walking out: cut to ${b.staff - 1} ${b.staff - 1 === 1 ? 'barista' : 'baristas'} there`,
        input: { kind: 'branch', action: 'staff', staff: b.staff - 1 },
        priority: PLAN_PRIORITY.branchStaff,
      },
    ];
  }
  return [];
}

/** P4 B5: with a Manager on the crew and a branch open, send a pack of beans or milk when home has more than two packs beyond tomorrow's use. */
function branchSendAdvice(state: GameState): Advice[] {
  const b = state.branch;
  if (!isGearRun(state) || !b || !hasManager(state)) return [];
  // credit beyond what the branch's next day will draw is already waiting there
  if ((b.stockCredit ?? 0) > (branchDay(state)?.fromStock ?? 0)) return [];
  const use = expectedUse(state);
  const advice: Advice[] = [];
  for (const supply of ['beans', 'milk'] as const) {
    const size = ECONOMY.packs[supply].size;
    if ((state.supplies[supply] ?? 0) <= use[supply] + 2 * size) continue;
    advice.push({
      id: `branch:send:${supply}`,
      kind: 'restock',
      text: `Plenty of ${STOCK_NAME[supply]} at home: send a pack to the second shop`,
      input: { kind: 'branch', action: 'send', supply },
      priority: PLAN_PRIORITY.branchSend,
    });
  }
  return advice;
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
  // Nothing can be made yet (night 1 of a Gear run with an empty counter): there is no board to trim.
  if (unlockedDrinks(state).length === 0) return [];
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
      text: `Take the ${drinkName(d)} off the board${missing ? `: there's no ${stationName(missing, isGearRun(state))}` : ''}`,
      input: { kind: 'menu', drink: d, on: false },
      priority: PLAN_PRIORITY.menu,
    });
  }
  return advice;
}

/** Everything worth doing tonight, highest priority first (ties by id). Pure and deterministic. */
export function planNight(state: GameState): Advice[] {
  const budget: Budget = { left: round2(state.cash - billsHeldBack(state)) };
  // Spending advice draws on the budget in priority order: restock (with the steep top-up), condiment boxes, grow, branch:open, checkout, gear, rival:loyalty, equip, scout.
  const steep = steepWant(state);
  const restock = restockAdvice(state, budget, steep ? { concentrate: Math.max(0, steep.want - steep.leftover) } : {});
  const condiments = condimentAdvice(state, budget);
  const grow = growAdvice(state, budget);
  const branchOpen = branchOpenAdvice(state, budget);
  const checkout = grow.length ? [] : checkoutAdvice(state, budget);
  const fridge = fridgeAdvice(state, budget);
  const gear = gearAdvice(state, budget);
  const slot = slotAdvice(state);
  const stamp = stampAdvice(state, budget);
  const equip = equipAdvice(state, budget, slot.length > 0);
  const scout = scoutAdvice(state, budget);
  const all = [
    ...restock,
    ...steepAdvice(state, steep, restock),
    ...condiments,
    ...rivalAdvice(state),
    ...rivalCounterAdvice(state),
    ...grow,
    ...branchOpen,
    ...checkout,
    ...fridge,
    ...gear,
    ...slot,
    ...staffAdvice(state),
    ...hireAdvice(state),
    ...branchStaffAdvice(state),
    ...priceAdvice(state),
    ...twistAdvice(state),
    ...branchSendAdvice(state),
    ...stamp,
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
