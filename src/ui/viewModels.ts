import { FRIDGES } from '../data/fridges';
import { GEAR_VOTE_MIN } from '../sim/gear';
import type { PerkId } from '../data/perks';
import { SIG, sigShare } from '../sim/signature';
import { gearVM, hudGearVM, type GearVM, type HudGearVM } from './gearVM';
import { AD_IDS, ADS } from '../sim/ads';
import { CHECKOUT, CHECKOUT_IDS, checkoutOf, nextCheckout } from '../sim/checkout';
import { DRINK_STATIONS, grownToday, nextTier, TIER_IDS, TIERS, tierOf } from '../sim/growth';
import { layoutFor } from '../data/layout';
import { stationMenuNote, stationsVM, type StationsVM } from './stationsVM';
import { tipsVM, type TipVM } from './tipsVM';
import { growNudge, type GrowNudge } from './growModel';
import { nightBrief, type NightAlert, type NightFix } from '../sim/brief';
import { JUDGES, PITCH } from '../sim/pitch';
import { copyIsLive, daysToCopy, RIVAL, rivalAskFactor, rivalMenu, sigPrice } from '../sim/rival';
import { knownStale, knownStars, risingTwist, seasonOf, seasonStarts, TWIST_INFO, TWISTS, type TwistId } from '../sim/taste';
import { accuracyRating } from '../sim/accuracy';
import { PRICING, menuPrice, priceForecast, priceTraffic } from '../sim/pricing';
import { regularsViewModel, type RegularVM } from '../sim/regulars';
import { ROLE_IDS, ROLES, roleHolders, type RoleId } from '../sim/roles';
import { awardsFor, awardsText, type Award } from '../sim/awards';
import { catalogueById } from '../data/catalogue';
import { GEAR } from '../data/gear';
import { reportViewModel, type ReportVM } from './report';
import { branchViewModel, type BranchVM } from './branchView';
import { SEASON, seasonMedal, seasonTarget, targetsHit, type Medal } from '../sim/season';
import { ECONOMY } from '../data/economy';
import { scenarioById } from '../data/scenarios';
import { TICK_RATE, secondsToTicks } from '../sim/constants';
import { botsFor } from '../sim/bots/roster';
import { availableDrinks } from '../sim/customers';
import { challengePaperLine, describeEffects, radioLine, splitEffects } from '../sim/describe';
import { CARD_SETS, FULL_SET } from '../data/cardSets';
import { EVENT_LABELS } from '../sim/events';
import { challengeChipText } from '../sim/challenges';
import { activeSets, fullSets, computeModifiers, setCounts, weekOf } from '../sim/effects';
import { nightClock, rerollCost, restockCost } from '../sim/night';
import { spoilRate } from '../sim/spoilage';
import { profitOf } from '../sim/profit';
import { fittingsValue, scoreRun } from '../sim/score';
import { cutsIntoRent, nightWarnings, type NightWarning } from './nightWarnings';
import type { PeerStatus } from '../net/peerSession';
import type { BotsChoice, Member } from '../net/protocol';
import type { AdId, AdOutcome, PitchKind, PitchTier, CardPath, CatalogueItem, Rarity, DayStats, DrinkId, EventKind, GameState, MessKind, Phase, PlayerId, RogueStage, RunRecord, SupplyId } from '../sim/types';
import type { RoomRecord } from '../storage/roomStore';
import { BASE_DRINKS, DRINK_IDS, GEAR_ONLY_DRINKS, DRINK_INFO, DRINK_TEMP } from '../data/drinks';
import { menuDrinks, neededSupplies, unlockedDrinks } from '../sim/unlocks';
import { forecastById } from '../data/forecasts';
import { BOT_PERSONALITIES } from '../sim/bots/roster';
import { canHire, crewNames, wageEach } from '../sim/staff';
import { CONDIMENTS } from '../sim/condiments';
import { WEEKDAY_NAMES, forecastFor, forecastName, forecastOf, weekdayOf } from '../sim/forecast';


/** '$1,234.50' or '-$20.00'. */
export function money(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}$${abs}`;
}

function stars(rep: number): string {
  return `${rep.toFixed(1)}★`;
}

function dayLabelFor(day: number): string {
  const week = weekOf(day);
  return week > 1 ? `Day ${day} (week ${week})` : `Day ${day}`;
}

function clockFor(ticks: number): string {
  const total = Math.max(0, Math.ceil(ticks / TICK_RATE));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Espresso Easter egg receipt lines; absent on a normal day. */
function espressoLines(d: DayStats): { ambulance?: string; tabPaid?: string } {
  return { ...(d.ambulance ? { ambulance: money(d.ambulance) } : {}), ...(d.debtPaid ? { tabPaid: money(d.debtPaid) } : {}) };
}

export { profitOf } from '../sim/profit';

export interface HudVM {
  /** Gear Tree G5: the crew's machines and how each is doing (Gear runs only). */
  gear?: HudGearVM[];
  dayLabel: string;
  clock: string;
  cash: string;
  reputation: string;
  supplies: { id: SupplyId; count: number }[];
  /** `offMenu`: the crew took it off tonight, so the board says so instead of "sold out". */
  menu: { id: DrinkId; price: string; available: boolean; offMenu?: true }[];
  /** FB1 WP4: the doors are open and nothing on the menu can be made. */
  soldOut?: boolean;
  notes: string[];
  phase: Phase;
  seed: number;
  pass?: { item: DrinkId; secondsLeft: number }[];
  events?: { kind: EventKind; label: string; secondsLeft: number }[];
  messes?: { id: number; kind: MessKind; x: number; y: number; amount: number }[];
  cleanliness?: number;
  mop?: { x: number; y: number; heldBy: string | null };
  stuns?: { playerId: string; secondsLeft: number }[];
  cleaning?: { playerId: string; secondsLeft: number }[];
  rogue?: { stage: RogueStage; drink: DrinkId; x: number; y: number; secondsLeft: number; name?: string };
  /** Doors locked: customers still inside (queue plus a rogue). Present only while closing; patched in place. */
  closing?: { left: number };
  /** While the health inspector is in: how today looks against their two rules (patched in place). */
  scrutiny?: Scrutiny;
  /** Today's neighbourhood forecast, as a chip by the day label. */
  forecast?: { icon: string; name: string; blurb: string };
  /** Today's event outcomes so far, for the PASSED/FAILED stamp and the follower bump (patched). */
  results?: { inspection: 'pass' | 'fail' | null; influencer: 'served' | 'lost' | null; followers: string };
  /** Optional daily challenges (B7): chip text + done/failed for the HUD. */
  challenges?: { id: string; text: string; done: boolean; failed: boolean; reward: number }[];
}

export interface Scrutiny {
  wasted: number;
  wastedLimit: number;
  clean: number;
  cleanMin: number;
  /** 'fail' if they judged now it would fail; 'risky' within one waste or 10 points of the bar. */
  verdict: 'ok' | 'risky' | 'fail';
}

export function scrutinyFor(state: GameState): Scrutiny | undefined {
  if (!state.events.some((e) => e.kind === 'healthInspector')) return undefined;
  const wasted = state.today.wasted ?? 0;
  const wastedLimit = ECONOMY.events.inspector.wastedLimit;
  const clean = Math.round(state.cleanliness);
  const cleanMin = ECONOMY.mess.inspectorMin;
  const fail = wasted >= wastedLimit || state.cleanliness < cleanMin;
  const risky = wasted >= wastedLimit - 1 || state.cleanliness < cleanMin + 10;
  return { wasted, wastedLimit, clean, cleanMin, verdict: fail ? 'fail' : risky ? 'risky' : 'ok' };
}

/** A made-up but stable follower count for the influencer's post ("+1.4k"), from the seed and day. */
export function followerBump(seed: number, day: number): string {
  const h = (Math.imul((seed ^ (day * 7919)) >>> 0, 2654435761) >>> 0) % 2600;
  const n = 400 + h;
  return n >= 1000 ? `+${(n / 1000).toFixed(1)}k` : `+${n}`;
}

/** The intro card for an event: a title, one line of advice for the crew, and its tone. */
export const EVENT_INTRO: Record<EventKind, { title: string; line: string; tone: 'rush' | 'power' | 'inspector' | 'influencer' }> = {
  rushHour: { title: 'Rush hour!', line: 'A tour bus just pulled up. Split the jobs: one grinds, one steams, one serves.', tone: 'rush' },
  powerFlicker: { title: 'Power flicker!', line: 'The machines sputter for a few seconds. Hand off what\u2019s already made.', tone: 'power' },
  healthInspector: { title: 'Health inspector', line: 'Keep the floor clean and waste fewer than 4 drinks until they leave.', tone: 'inspector' },
  influencerVisit: { title: 'An influencer walked in', line: 'Serve them before they leave for a bonus and a follower bump.', tone: 'influencer' },
};

/** The floor: messes, cleanliness, the mop, who is stunned and who is cleaning (seconds rounded up). */
export function floorHud(state: GameState): Pick<HudVM, 'messes' | 'cleanliness' | 'mop' | 'stuns' | 'cleaning'> {
  return {
    messes: state.messes.map((m) => ({ id: m.id, kind: m.kind, x: m.x, y: m.y, amount: m.amount })),
    cleanliness: Math.round(state.cleanliness),
    mop: { x: state.mop.pos.x, y: state.mop.pos.y, heldBy: state.mop.heldBy },
    stuns: state.players
      .filter((p) => p.stunTicksLeft > 0)
      .map((p) => ({ playerId: p.id, secondsLeft: Math.ceil(p.stunTicksLeft / 60) })),
    cleaning: state.players
      .filter((p) => p.cleaningTicksLeft > 0)
      .map((p) => ({ playerId: p.id, secondsLeft: Math.ceil(p.cleaningTicksLeft / 60) })),
  };
}

/** The cleanliness meter: a 0..100 fill, a tone and a word. Below the inspector's bar an inspection fails. */
export interface CleanMeter {
  pct: number;
  tone: 'good' | 'warn' | 'bad';
  word: string;
}

export function cleanMeter(cleanliness: number): CleanMeter {
  const pct = Math.max(0, Math.min(100, Math.round(cleanliness)));
  const min = ECONOMY.mess.inspectorMin;
  if (pct >= 90) return { pct, tone: 'good', word: 'Spotless' };
  if (pct >= 75) return { pct, tone: 'good', word: 'Tidy' };
  if (pct >= min) return { pct, tone: 'warn', word: 'Scuffed' };
  return { pct, tone: 'bad', word: 'Grimy! Inspector would fail' };
}

/** FB1 WP4: what the rush-hour chip and card say while the board is sold out. */
export const SOLD_OUT_RUSH = { label: "Rush hour, but you're sold out", line: 'A crowd is coming and there is nothing to sell. Close early, or restock tonight.' } as const;

export function hudViewModel(state: GameState): HudVM {
  const mods = computeModifiers(state);
  const available = availableDrinks(state);
  const soldOut = (state.phase === 'day' || state.phase === 'closing') && menuDrinks(state).length > 0 && available.length === 0;
  return {
    ...(state.gear ? { gear: hudGearVM(state) } : {}),
    dayLabel: dayLabelFor(state.day),
    ...(soldOut ? { soldOut: true } : {}),
    forecast: (() => {
      const f = forecastOf(state);
      return { icon: f.icon, name: forecastName(f, state.day), blurb: f.blurb };
    })(),
    clock: clockFor(state.phaseTicksLeft),
    cash: money(state.cash),
    reputation: stars(state.reputation),
    supplies: neededSupplies(state).map((id) => ({ id, count: state.supplies[id] ?? 0 })),
    menu: unlockedDrinks(state).map((id) => ({ id, price: money(menuPrice(state, id) * mods.price[id]), available: available.includes(id), ...(state.menu[id] ? {} : { offMenu: true as const }) })),
    notes: state.morningNotes,
    phase: state.phase,
    seed: state.seed,
    pass: state.pass.map((i) => ({ item: i.item, secondsLeft: Math.ceil(i.ticksLeft / 60) })),
    events: state.events.map((e) => ({ kind: e.kind, label: soldOut && e.kind === 'rushHour' ? SOLD_OUT_RUSH.label : EVENT_LABELS[e.kind], secondsLeft: Math.ceil(e.ticksLeft / 60) })),
    ...floorHud(state),
    ...rogueHud(state),
    ...(state.phase === 'closing' ? { closing: { left: state.customers.length + (state.rogue ? 1 : 0) } } : {}),
    ...(scrutinyFor(state) ? { scrutiny: scrutinyFor(state) } : {}),
    results: { inspection: state.today.inspection ?? null, influencer: state.today.influencer ?? null, followers: followerBump(state.seed, state.day) },
    challenges: (state.challenges ?? []).map((c) => ({
      id: c.id,
      text: challengeChipText(c),
      done: c.done,
      failed: c.failed,
      reward: c.reward,
    })),
  };
}

export interface HandCardVM {
  itemId: string;
  name: string;
  cost: string;
  effect: string;
  flavor: string;
  affordable: boolean;
  duration: 'permanent' | 'tomorrow';
  /** Affordable, but buying it leaves less than tomorrow's rent in the till. */
  cutsRent?: boolean;
  rarity: Rarity;
  path: CardPath;
  /** A card with a real downside. */
  spicy?: boolean;
  /** Upsides and downsides in plain words (`effect` is both, for screen readers and logs). */
  ups: string;
  downs: string;
  /** Its set: how many the café owns, how many switch it on, the bonus, and whether this card completes it. */
  set?: { name: string; have: number; need: number; bonus: string; active: boolean; completes: boolean; full: string; fullNext: boolean; isFull: boolean };
}

/** One hand card's view: price, effects split up and down, and its set progress. */
export function handCardViewModel(state: GameState, item: CatalogueItem): HandCardVM {
  const counts = setCounts(state);
  const active = activeSets(state);
  const split = splitEffects(item.effects);
  const set = item.set && item.duration === 'permanent' ? CARD_SETS[item.set] : undefined;
  const have = set ? (counts[set.id] ?? 0) : 0;
  return {
    itemId: item.id,
    name: item.name,
    cost: money(item.cost),
    effect: describeEffects(item.effects),
    flavor: item.flavor,
    affordable: state.cash >= item.cost,
    duration: item.duration,
    ...(cutsIntoRent(state, item.cost) ? { cutsRent: true } : {}),
    rarity: item.rarity,
    path: item.path,
    ...(item.spicy ? { spicy: true } : {}),
    ups: split.ups,
    downs: split.downs,
    ...(set
      ? {
          set: {
            name: set.name, have, need: set.need, bonus: describeEffects(set.bonus), active: active.includes(set.id),
            completes: !active.includes(set.id) && have + 1 >= set.need,
            full: describeEffects(set.tier3), fullNext: active.includes(set.id) && have + 1 === FULL_SET, isFull: have >= FULL_SET,
          },
        }
      : {}),
  };
}

export interface NightVM {
  /** P4 B3: the manager's report on the last finished day. */
  report?: ReportVM;
  /** P4 B4: the second shop (Gear runs). */
  branch?: BranchVM;
  clock: string;
  cash: string;
  takings: { sales: string; tips: string; rent: string; profit: string; ambulance?: string; tabPaid?: string; fines?: string; bonus?: string; spoiled?: string; spoiledWhat?: string; pastries?: number; cupStars?: string; cupsPerfect?: number; cupsRating?: string; sigSold?: number; sigBonus?: string; ad?: string; checkoutFees?: string; wages?: string; twists?: string; combos?: { drink: DrinkId; twist: TwistId; stars: number }[]; familyTips?: { label: string; amount: string }[] } | null;
  /** Espresso Easter egg: unpaid hospital tab, if any. */
  tab?: string;
  hand: HandCardVM[];
  /** P3 B4: fresh rows carry the share that goes off at each closing, and what went off last night. */
  restock: { supply: SupplyId; count: number; packSize: number; packCost: string; affordable: boolean; spoilPct?: number; spoiled?: number }[];
  /**
   * ui-3.5.1: the Restock tab's condiment box card (Gear runs with a condiment bar): boxes waiting in the
   * corner, servings in the bar (of 20), and the $6 box. `full` once the corner holds CONDIMENTS.maxBoxes.
   */
  condiments?: { boxes: number; servings: number; max: number; cost: number; affordable: boolean; full: boolean };
  ready: { id: PlayerId; name: string; ready: boolean; role?: string }[];
  /** Phase 3 B1: the four roles, who holds each, and whether this barista can take it. */
  roles?: RoleVM[];
  /** P3 B15 (Gear runs): the hired bot baristas, each one's daily wage, and whether a spot is free. */
  staff?: StaffVM;
  /** Phase 3 B3: regulars, their favourite and loyalty. */
  regulars?: RegularVM[];
  meReady: boolean;
  menu?: MenuLineVM[];
  signature?: SignatureVM;
  /** P3 B9: Starbuck$ down the street. */
  rival: RivalVM;
  /** P3 B10: parody ad campaigns for tomorrow. */
  ads: AdsVM;
  pitch: PitchVM;
  /** P3 B12: the checkout path on the Shopfront tab. */
  checkout: CheckoutVM;
  /** P3 B13: the growth path (stand → cart → café) on the Shopfront tab. */
  growth: GrowthVM;
  /** FB1 WP5: the Spend › Stations card. */
  stations: StationsVM;
  /** Gear Tree G3: the Spend › Gear card (Gear runs only; it replaces Stations). */
  gear?: GearVM;
  /** Heads-ups before Ready: short on rent, out of or low on a supply. Never blocks. */
  warnings: NightWarning[];
  /** Tomorrow's neighbourhood forecast: the newspaper on the shop board. */
  forecast?: ForecastVM;
  /** "New on the menu": drinks that joined tonight, with their recipe ticket. */
  fresh?: FreshDrinkVM[];
  /** Re-roll tonight's unbought cards (B6): its price and whether the till covers it. */
  reroll: { cost: string; affordable: boolean; count: number };
  /** Card sets switched on, for the hand's header. */
  sets: string[];
  /** FB1 WP1: the Tonight tab's at-a-glance brief (UI adapter until the sim's nightBrief lands). */
  brief: NightBriefVM;
  /** FB1 WP6: the bot crew's tap-to-apply tips (the ones the brief does not already cover). */
  tips: TipVM[];
  /** FB1 WP1: timed night or Relaxed (no clock, ready-up). */
  timer: NightTimerVM;
}

export interface FreshDrinkVM {
  drink: DrinkId;
  name: string;
  icon: string;
  price: string;
  blurb: string;
  /** The stations in order, as the barista walks them. */
  ticket: string[];
  /** Needs the flavour pantry (pumps of cocoa, matcha, maple). */
  flavour: boolean;
}

function freshDrink(drink: DrinkId): FreshDrinkVM {
  const info = DRINK_INFO[drink];
  return {
    drink, name: info.name, icon: info.icon, price: money(ECONOMY.prices[drink]), blurb: info.blurb, ticket: info.ticket,
    flavour: ECONOMY.drinkSupplies[drink].includes('flavour'),
  };
}

export interface ForecastVM {
  /** "Tuesday": the paper's edition. */
  edition: string;
  icon: string;
  name: string;
  headline: string;
  blurb: string;
  plan: string;
  /** The forecast's effects in plain words. */
  effects: string;
  eventNote?: string;
  /** About how many walk-ins to expect over the day (cards bought tonight included). */
  customers: number;
  /** Share of tomorrow's orders that are hot drinks, 0..100 (the rest are iced). */
  hotPct: number;
  /** The day after: a one-line rumour, so the crew can plan two days out. */
  later: { icon: string; name: string };
  /** Weather radio (B6): exactly which events tomorrow brings, and roughly when. */
  radio?: string;
  /** Optional daily challenges for tomorrow (B7). */
  challenges?: string;
  /** P3 B8: the taste column: a season turning. */
  taste?: string;
}

/** Tomorrow's paper. At night `state.day` is already tomorrow. */
export function forecastViewModel(state: GameState): ForecastVM {
  const f = forecastOf(state);
  const m = computeModifiers(state);
  const menu = menuDrinks(state);
  const w = (d: DrinkId) => m.orderBias[d] * DRINK_INFO[d].bias;
  const total = menu.reduce((s, d) => s + w(d), 0) || 1;
  const hot = menu.filter((d) => DRINK_TEMP[d] === 'hot').reduce((s, d) => s + w(d), 0);
  const next = forecastById[forecastFor(state.seed, state.day + 1)];
  return {
    edition: WEEKDAY_NAMES[weekdayOf(state.day)],
    icon: f.icon,
    name: forecastName(f, state.day),
    headline: f.headline,
    blurb: f.blurb,
    plan: f.plan,
    effects: describeEffects(f.effects.filter((e) => e.kind !== 'orderBias' || unlockedDrinks(state).includes(e.drink))),
    ...(f.eventNote ? { eventNote: f.eventNote } : {}),
    customers: Math.round(ECONOMY.baseArrivalsPerSecond * state.settings.dayLengthSec * m.traffic * priceTraffic(state, menu, m)),
    hotPct: Math.round((hot / total) * 100),
    later: { icon: next.icon, name: forecastName(next, state.day + 1) },
    ...(radioLine(state) ? { radio: radioLine(state) } : {}),
    ...(challengePaperLine(state) ? { challenges: challengePaperLine(state) } : {}),
    ...(tasteLine(state) ? { taste: tasteLine(state) } : {}),
  };
}

/** Phase 3 B2: a menu board line with its price, the price steps and tomorrow's expected orders. */
export interface MenuLineVM {
  drink: DrinkId;
  on: boolean;
  price: number;
  list: number;
  step: number;
  canUp: boolean;
  canDown: boolean;
  /** Only for drinks on the menu: order change vs. list price (%), expected orders, profit before tips. */
  demandPct?: number;
  orders?: number;
  profit?: number;
  /** Regulars whose favourite this is (P3 B3). */
  fans?: string[];
  /** P3 B6: tonight's twist and the taste notebook for this drink (stars, or null if not yet tried). */
  twist?: TwistId;
  book: { twist: TwistId; stars: number | null; stale?: true }[];
  /** FB1 WP1: a supply this drink needs is out ('out') or running low ('low'). */
  stock?: 'out' | 'low';
}

/** P3 B7: the signature designer's options and the current signature. */
export interface SignatureVM {
  current?: { name: string; drink: DrinkId; twist: TwistId; premium: number; stars: number | null; since: number; onMenu: boolean };
  drinks: DrinkId[];
  /** Per drink: each twist's known stars (null = not tried). */
  book: Record<string, { twist: TwistId; stars: number | null; stale?: true }[]>;
  /** Expected signature asks tomorrow at the current premium (0 without a signature). */
  asks: number;
  premiumStep: number;
  maxPremium: number;
}

/** The taste notebook for a drink: stars once served, flagged stale when learned last season (B8). */
function bookOf(state: GameState, drink: DrinkId): { twist: TwistId; stars: number | null; stale?: true }[] {
  return TWISTS.map((twist) => ({ twist, stars: knownStars(state, drink, twist), ...(knownStale(state, drink, twist) ? { stale: true as const } : {}) }));
}

/** P3 B8: the paper's taste column: a season turning tomorrow (with a tip-off), or the day after. */
export function tasteLine(state: GameState): string | undefined {
  const menu = menuDrinks(state);
  if (!menu.length) return undefined;
  if (seasonStarts(state.day)) {
    const drink = menu[state.day % menu.length];
    const t = TWIST_INFO[risingTwist(state.seed, drink, state.day)];
    return `Season ${seasonOf(state.day) + 1} starts tomorrow and tastes are turning. Word is ${t.name.toLowerCase()} is the new thing in ${DRINK_INFO[drink].short.toLowerCase()}s, and last season's hits may not land.`;
  }
  if (seasonStarts(state.day + 1)) return 'Tastes turn the day after tomorrow: enjoy your hits while they last.';
  return undefined;
}

export interface RivalVM {
  name: string;
  cost: string;
  affordable: boolean;
  /** Scouted tonight: the menu and the signature watch are visible. */
  scouted: boolean;
  menu?: { drink: DrinkId; name: string; icon: string; price: string; ours: string; cheaper: boolean }[];
  /** Their knock-off of our current signature (public: it's in the window). */
  copy?: { of: string; price: string; ours: string; matched: boolean; keep: number };
  /** Scouted only: days until they copy our signature (0 = tomorrow). */
  eyeing?: number;
}

/** P3 B10: the Ads tab. */
export interface AdsVM {
  options: { id: AdId; name: string; icon: string; reach: string; cost: string; copy: string; odds: string; affordable: boolean; booked: boolean }[];
  /** Booked for tomorrow (cost already paid; cancel refunds it). */
  booked?: { id: AdId; name: string; icon: string; cost: string; by: string };
  /** How yesterday's campaign landed. */
  last?: { name: string; icon: string; outcome: AdOutcome; result: string };
}

export function adsVM(state: GameState): AdsVM {
  const booked = state.ad && state.ad.day === state.day ? state.ad : undefined;
  const refund = booked ? ADS[booked.id].cost : 0;
  const prev = state.days[state.days.length - 1]?.ad;
  return {
    options: AD_IDS.map((id) => {
      const a = ADS[id];
      return {
        id, name: a.name, icon: a.icon, reach: a.reach, cost: money(a.cost), copy: a.copy,
        odds: `${a.odds.flop}% flop · ${100 - a.odds.flop - a.odds.viral}% fine · ${a.odds.viral}% viral`,
        affordable: state.cash + refund >= a.cost, booked: booked?.id === id,
      };
    }),
    ...(booked ? { booked: { id: booked.id, name: ADS[booked.id].name, icon: ADS[booked.id].icon, cost: money(ADS[booked.id].cost), by: booked.by } } : {}),
    ...(prev && state.days.length === state.day - 1 ? { last: { name: ADS[prev.id].name, icon: ADS[prev.id].icon, outcome: prev.outcome, result: ADS[prev.id].result[prev.outcome] } } : {}),
  };
}

/** P3 B13: the growth path. */
export interface GrowthVM {
  tiers: {
    id: string; name: string; icon: string; blurb: string; width: number; stations: string[]; drinks: string;
    queue: number; rent: string; crowd: string; cost: string; current: boolean; past: boolean; next: boolean; locked: boolean; affordable: boolean;
  }[];
  current: { id: string; name: string; icon: string };
  /** Grown tonight: the milestone banner. */
  milestone?: { name: string; icon: string; by: string; line: string; width: number; queue: number };
  /** Known drinks this shop has no station for yet (the menu tab's note). */
  waiting?: string;
  /** ui-3.4.0: the night chip "You can afford a cart!" (growNudge). */
  nudge?: GrowNudge;
}

const STATION_ICON: Record<string, string> = { grinder: '⚙️ grinder', espresso: '☕ espresso', steamer: '🥛 steam wand', coldBrewTap: '🧊 cold brew' };

function waitingNote(state: GameState): { waiting?: string } {
  // FB1 WP5: from reasonOff, so a swapped-out steamer reads the same as a stand that never had one.
  const note = stationMenuNote(state);
  return note ? { waiting: note } : {};
}

export function growthVM(state: GameState): GrowthVM {
  const now = tierOf(state);
  const at = TIER_IDS.indexOf(now);
  const nxt = nextTier(state);
  const g = grownToday(state);
  return {
    tiers: TIER_IDS.map((id, i) => {
      const t = TIERS[id];
      const lay = layoutFor(id);
      const kinds = lay.stations.map((s) => s.kind);
      const drinks = DRINK_IDS.filter((d) => (state.gear === true || !GEAR_ONLY_DRINKS.includes(d)) && DRINK_STATIONS[d].every((k) => kinds.includes(k)))
        .map((d) => DRINK_INFO[d].short).join(', ');
      return {
        id, name: t.name, icon: t.icon, blurb: t.blurb, width: lay.width,
        stations: kinds.filter((k) => STATION_ICON[k]).map((k) => STATION_ICON[k]),
        drinks, queue: t.queue, rent: money(t.rentPerDay), crowd: t.crowd, cost: money(t.cost),
        current: id === now, past: i < at, next: id === nxt, locked: i > at && id !== nxt, affordable: id === nxt && state.cash >= t.cost,
      };
    }),
    current: { id: now, name: TIERS[now].name, icon: TIERS[now].icon },
    ...waitingNote(state),
    ...((n) => (n ? { nudge: n } : {}))(growNudge(state)),
    ...(g ? { milestone: { name: TIERS[g.tier].name, icon: TIERS[g.tier].icon, by: g.by, line: TIERS[g.tier].milestone, width: layoutFor(g.tier).width, queue: TIERS[g.tier].queue } } : {}),
  };
}

/** P3 B12: the checkout path (register → kiosk → Squarely). */
export interface CheckoutVM {
  options: {
    id: string; name: string; icon: string; blurb: string; pros: string[]; cons: string[];
    cost: string; terms: string; owned: boolean; active: boolean; next: boolean; locked: boolean; affordable: boolean;
  }[];
  active: { name: string; icon: string; since?: number; by?: string };
}

export function checkoutVM(state: GameState): CheckoutVM {
  const c = checkoutOf(state);
  const next = nextCheckout(state);
  const a = CHECKOUT[c.active];
  return {
    options: CHECKOUT_IDS.map((id) => {
      const o = CHECKOUT[id];
      const owned = c.owned.includes(id);
      const terms = [
        o.daily ? `${money(o.daily)}/day licence` : '',
        o.fee ? `${Math.round(o.fee * 100)}% per card sale` : '',
      ].filter(Boolean).join(' · ') || 'no running costs';
      return {
        id, name: o.name, icon: o.icon, blurb: o.blurb, pros: o.pros, cons: o.cons,
        cost: money(o.cost), terms, owned, active: c.active === id, next: next === id,
        locked: !owned && next !== id, affordable: state.cash >= o.cost,
      };
    }),
    active: { name: a.name, icon: a.icon, ...(c.since !== undefined ? { since: c.since } : {}), ...(c.by ? { by: c.by } : {}) },
  };
}

/** P3 B11: the pitch panel. `result` is tonight's scored pitch; until then the form is open. */
export interface PitchVM {
  judges: { name: string; icon: string; likes: string }[];
  maxLen: number;
  greenlit: number;
  ovation: number;
  result?: {
    by: string; kind: PitchKind; text: string; total: number; tier: PitchTier; panel: string; notes: string[];
    scores: { name: string; icon: string; score: number; verdict: string }[];
    /** What it does tomorrow, or '' when it didn't make it. */
    boost: string;
  };
}

export function pitchVM(state: GameState): PitchVM {
  const p = state.pitch && state.pitch.day === state.day ? state.pitch : undefined;
  const lit = p && (p.tier === 'greenlit' || p.tier === 'ovation');
  return {
    judges: JUDGES.map((j) => ({ name: j.name, icon: j.icon, likes: j.likes })),
    maxLen: PITCH.maxLen,
    greenlit: PITCH.greenlit,
    ovation: PITCH.ovation,
    ...(p ? {
      result: {
        by: p.by, kind: p.kind, text: p.text, total: p.total, tier: p.tier, panel: p.panel, notes: p.notes,
        scores: JUDGES.map((j, i) => ({ name: j.name, icon: j.icon, score: p.scores[i] ?? 0, verdict: p.verdicts[i] ?? '' })),
        boost: !lit ? '' : p.kind === 'promo' ? `+${Math.round((p.boost - 1) * 100)}% walk-ins tomorrow` : `+${Math.round(p.boost * 100)}% tips tomorrow`,
      },
    } : {}),
  };
}

export function rivalVM(state: GameState): RivalVM {
  const scouted = state.rival?.scouted === state.day;
  const m = computeModifiers(state);
  const sig = state.signature;
  const c = state.rival?.copy;
  const live = copyIsLive(state);
  const eye = daysToCopy(state);
  return {
    name: RIVAL.name,
    cost: money(RIVAL.scoutCost),
    affordable: state.cash >= RIVAL.scoutCost,
    scouted,
    ...(scouted ? {
      menu: rivalMenu(state).map(({ drink, price }) => {
        const ours = Math.round(menuPrice(state, drink) * m.price[drink] * 100) / 100;
        return { drink, name: DRINK_INFO[drink].name, icon: DRINK_INFO[drink].icon, price: money(price), ours: money(ours), cheaper: price < ours };
      }),
      ...(eye !== null ? { eyeing: eye } : {}),
    } : {}),
    ...(live && sig && c ? { copy: { of: sig.name, price: money(c.price), ours: money(sigPrice(state, sig)), matched: sigPrice(state, sig) <= c.price, keep: Math.round(rivalAskFactor(state) * 100) } } : {}),
  };
}

export function signatureVM(state: GameState): SignatureVM {
  const drinks = unlockedDrinks(state);
  const book: SignatureVM['book'] = {};
  for (const d of drinks) book[d] = bookOf(state, d);
  const sig = state.signature;
  const m = computeModifiers(state);
  const walkIns = ECONOMY.baseArrivalsPerSecond * state.settings.dayLengthSec * m.traffic;
  return {
    ...(sig
      ? { current: { name: sig.name, drink: sig.drink, twist: sig.twist, premium: sig.premium, stars: knownStars(state, sig.drink, sig.twist), since: sig.since, onMenu: menuDrinks(state).includes(sig.drink) } }
      : {}),
    drinks,
    book,
    asks: sig && menuDrinks(state).includes(sig.drink) ? Math.round(walkIns * sigShare(sig) * rivalAskFactor(state) * 0.8) : 0,
    premiumStep: SIG.premiumStep,
    maxPremium: SIG.maxPremium,
  };
}

export function menuLines(state: GameState): MenuLineVM[] {
  const m = computeModifiers(state);
  const on = menuDrinks(state);
  const walkIns = ECONOMY.baseArrivalsPerSecond * state.settings.dayLengthSec * m.traffic;
  const fc = new Map(priceForecast(state, on, m, walkIns).map((l) => [l.drink, l]));
  const lowSupplies = new Set(nightWarnings(state).filter((w) => w.supply && w.level === 'low').map((w) => w.supply!));
  return unlockedDrinks(state).map((drink) => {
    const step = state.priceSteps?.[drink] ?? 0;
    const l = fc.get(drink);
    const fans = state.regulars.filter((r) => r.drink === drink).map((r) => r.name);
    return {
      drink,
      on: state.menu[drink],
      price: l?.price ?? Math.round(menuPrice(state, drink) * m.price[drink] * 100) / 100,
      list: ECONOMY.prices[drink],
      step,
      canUp: step < PRICING.maxStep,
      canDown: step > PRICING.minStep,
      ...(l ? { demandPct: l.demandPct, orders: l.orders, profit: l.profit } : {}),
      ...(fans.length ? { fans } : {}),
      ...(state.twists?.[drink] ? { twist: state.twists[drink] } : {}),
      book: bookOf(state, drink),
      ...(stockOf(state, drink, lowSupplies) ? { stock: stockOf(state, drink, lowSupplies)! } : {}),
    };
  });
}

export interface RoleVM {
  id: RoleId;
  name: string;
  icon: string;
  perk: string;
  weakness: string;
  /** Holder's name, or null when free. */
  holder: string | null;
  mine: boolean;
}

export function rolesViewModel(state: GameState, me: PlayerId): RoleVM[] {
  const holders = roleHolders(state);
  return ROLE_IDS.map((id) => {
    const r = ROLES[id];
    const h = holders[id];
    return { id, name: r.name, icon: r.icon, perk: r.perk, weakness: r.weakness, holder: h ? (state.players.find((p) => p.id === h)?.name ?? null) : null, mine: h === me };
  });
}

function spoiledWhat(s: Partial<Record<SupplyId, number>> | undefined): string {
  if (!s) return '';
  return Object.entries(s)
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${k === 'pastry' ? (n === 1 ? 'pastry' : 'pastries') : k}`)
    .join(', ');
}

const FAMILY_LABEL = { espresso: '☕ Espresso', milky: '🥛 Milky', iced: '🧊 Iced', filter: '🫖 Filter' } as const;
/** Gear G7: the receipt's "tips by drink type" rows, biggest first (undefined when there are none). */
export function familyTips(d: DayStats): { label: string; amount: string }[] | undefined {
  const t = d.tipsByFamily;
  if (!t) return undefined;
  const rows = (Object.keys(FAMILY_LABEL) as (keyof typeof FAMILY_LABEL)[])
    .filter((f) => (t[f] ?? 0) > 0)
    .sort((a, b) => (t[b] ?? 0) - (t[a] ?? 0))
    .map((f) => ({ label: FAMILY_LABEL[f], amount: money(t[f]!) }));
  return rows.length ? rows : undefined;
}

export function nightViewModel(state: GameState, me: PlayerId): NightVM {
  const last = state.days[state.days.length - 1];
  const takings =
    state.days.length > 0 && state.days.length === state.day - 1
      ? {
          sales: money(last.sales), tips: money(last.tips), rent: money(last.rent), profit: money(profitOf(last)), ...espressoLines(last),
          ...(last.fines ? { fines: money(last.fines) } : {}), ...(last.bonus ? { bonus: money(last.bonus) } : {}),
          ...(last.spoiledValue ? { spoiled: money(last.spoiledValue), spoiledWhat: spoiledWhat(last.spoiled) } : {}),
          ...(last.pastries ? { pastries: last.pastries } : {}),
          ...(familyTips(last) ? { familyTips: familyTips(last) } : {}),
          ...(last.twistCost ? { twists: money(last.twistCost) } : {}),
          ...(last.checkoutFees ? { checkoutFees: money(last.checkoutFees) } : {}),
          ...(last.wages ? { wages: money(last.wages) } : {}),
          ...(last.ad ? { ad: `${ADS[last.ad.id].icon} ${ADS[last.ad.id].name} ad ${last.ad.outcome === 'viral' ? 'went viral' : last.ad.outcome === 'ok' ? 'did fine' : 'flopped'}` } : {}),
          ...(last.sigServed ? { sigSold: last.sigServed, sigBonus: money(last.sigBonus ?? 0) } : {}),
          ...(last.combosFound?.length ? {
            combos: last.combosFound.map((k) => {
              const [drink, twist] = k.split(':') as [DrinkId, TwistId];
              return { drink, twist, stars: state.tasteBook?.[k] ?? 0 };
            }),
          } : {}),
          ...(last.cups ? {
            cupStars: (last.cupStars! / last.cups).toFixed(1),
            cupsPerfect: last.perfectCups ?? 0,
            ...(accuracyRating(last) <= -0.01 ? { cupsRating: accuracyRating(last).toFixed(2) } : {}),
          } : {}),
        }
      : null;
  const vm: Omit<NightVM, 'brief' | 'tips'> = {
    clock: clockFor(state.phaseTicksLeft),
    cash: money(state.cash),
    takings,
    ...(state.debt ? { tab: money(state.debt) } : {}),
    hand: state.hand.map((id) => handCardViewModel(state, catalogueById[id])),
    reroll: { cost: money(rerollCost(state)), affordable: state.cash >= rerollCost(state) && state.hand.length > 0, count: state.rerolls ?? 0 },
    sets: activeSets(state).map((id) => (fullSets(state).includes(id) ? `${CARD_SETS[id].name} (full)` : CARD_SETS[id].name)),
    restock: neededSupplies(state).map((supply) => {
      const cost = restockCost(state, supply, 1);
      const rate = spoilRate(state, supply);
      const lastSpoiled = takings ? last.spoiled?.[supply] ?? 0 : 0;
      return {
        supply, count: state.supplies[supply] ?? 0, packSize: ECONOMY.packs[supply].size, packCost: money(cost), affordable: state.cash >= cost,
        ...(rate > 0 ? { spoilPct: Math.round(rate * 100) } : {}), ...(lastSpoiled ? { spoiled: lastSpoiled } : {}),
      };
    }),
    ...(state.gear && state.condiments ? { condiments: condimentsVM(state) } : {}),
    ready: state.players.filter((p) => !p.bot).map((p) => ({ id: p.id, name: p.name, ready: state.ready.includes(p.id), ...(p.role ? { role: ROLES[p.role].icon } : {}) })),
    roles: rolesViewModel(state, me),
    ...(state.gear ? { staff: staffViewModel(state) } : {}),
    ...(state.regulars.length ? { regulars: regularsViewModel(state) } : {}),
    meReady: state.ready.includes(me),
    menu: menuLines(state),
    signature: signatureVM(state),
    rival: rivalVM(state),
    ads: adsVM(state),
    checkout: checkoutVM(state),
    growth: growthVM(state),
    stations: stationsVM(state),
    ...(state.gear ? { gear: gearVM(state, me) } : {}),
    pitch: pitchVM(state),
    ...(state.freshDrinks?.length ? { fresh: state.freshDrinks.map(freshDrink) } : {}),
    warnings: nightWarnings(state),
    forecast: forecastViewModel(state),
    timer: nightTimerVM(state),
  };
  const brief = nightBriefVM(vm, state);
  const report = reportViewModel(state);
  const branch = branchViewModel(state);
  return { ...vm, brief, tips: tipsVM(state, brief.alerts.map((a) => a.id)), ...(report ? { report } : {}), ...(branch ? { branch } : {}) };
}

/** P3 B15: the night board's staff row. */
export interface StaffVM {
  crew: { name: string; trait: string }[];
  wage: string;
  total: string;
  canHire: boolean;
}

const TRAIT: Record<string, string> = { steady: 'steady', hurried: 'quick, sloppy', veteran: 'careful', rookie: 'new', human: 'stand-in' };

export function staffViewModel(state: GameState): StaffVM | undefined {
  if (!state.gear) return undefined;
  const names = crewNames(state);
  const w = wageEach(state);
  const trait = (name: string, i: number) => TRAIT[state.players.find((p) => p.name === name && p.bot)?.bot!.personality ?? BOT_PERSONALITIES[i]] ?? '';
  return { crew: names.map((name, i) => ({ name, trait: trait(name, i) })), wage: money(w), total: money(w * names.length), canHire: canHire(state) };
}

export interface ClosingVM {
  dayLabel: string;
  served: number;
  lost: number;
  turnedAway: number;
  sales: string;
  tips: string;
  rent: string;
  /** P3 B15: wages paid to the hired crew today (Gear runs). */
  wages?: string;
  profit: string;
  reputationBefore: string;
  reputationAfter: string;
  /** Espresso Easter egg: today's ambulance ride, tab paid off today, and what's still owed. */
  ambulance?: string;
  tabPaid?: string;
  tab?: string;
  /** Cash in the till after closing (matches the HUD). */
  cash: string;
  /** The run score so far: cash minus starting cash. */
  profitVsStart: string;
  startingCash: string;
  /** Chaos pack receipt lines, present only when non-zero: customers who went rogue, drinks wasted. */
  rogues?: number;
  wasted?: number;
  slips?: number;
  /** Block 2 receipt lines, present only when they happened. */
  events?: string[];
  inspection?: 'pass' | 'fail';
  fines?: string;
  bonus?: string;
  /** Challenges won today (B7): label and tip. */
  challenges?: { label: string; reward: string }[];
}

/** `before` is the last snapshot of the closing phase; `after` is the first of the next phase. */
export function closingViewModel(before: GameState, after: GameState): ClosingVM {
  const d = after.days[after.days.length - 1] ?? before.today;
  const won = (before.challenges ?? []).filter((c) => c.done && !c.failed);
  return {
    dayLabel: dayLabelFor(d.day),
    served: d.served,
    lost: d.lost,
    turnedAway: d.turnedAway,
    sales: money(d.sales),
    tips: money(d.tips),
    rent: money(d.rent),
    ...(d.wages ? { wages: money(d.wages) } : {}),
    profit: money(profitOf(d)),
    reputationBefore: stars(before.reputation),
    reputationAfter: stars(after.reputation),
    ...espressoLines(d),
    ...(d.rogues ? { rogues: d.rogues } : {}),
    ...(d.wasted ? { wasted: d.wasted } : {}),
    ...(d.slips ? { slips: d.slips } : {}),
    ...(d.events?.length ? { events: d.events.map((k) => EVENT_LABELS[k]) } : {}),
    ...(d.inspection ? { inspection: d.inspection } : {}),
    ...(d.fines ? { fines: money(d.fines) } : {}),
    ...(won.length ? { challenges: won.map((c) => ({ label: c.label, reward: money(c.reward) })) } : {}),
    ...(() => {
      const challengeSum = won.reduce((n, c) => n + c.reward, 0);
      const influ = Math.round(((d.bonus ?? 0) - challengeSum) * 100) / 100;
      return influ > 0 ? { bonus: money(influ) } : {};
    })(),
    ...(after.debt ? { tab: money(after.debt) } : {}),
    cash: money(after.cash),
    profitVsStart: money(scoreRun(after)),
    startingCash: money(after.startingCash),
  };
}

export interface WeekEndVM {
  /** Profit vs. start (cash minus starting cash): the run's score. */
  score: string;
  /** Cash in the till, the same number the HUD shows. */
  cash: string;
  /** B11: permanent fittings at half price, counted in the score. */
  fittings?: string;
  startingCash: string;
  /** Espresso Easter egg: unpaid hospital tab, if any. */
  tab?: string;
  daysCompleted: number;
  customersServed: number;
  bestDay: { day: number; profit: string } | null;
  itemsBought: string[];
  seed: number;
  isHost: boolean;
  bankrupt: boolean;
  /** B10: the awards ceremony, MVP first. */
  awards: Award[];
  /** Plain text of the awards for "Copy awards". */
  awardsText: string;
  /** P3 B16: head starts this run just unlocked (filled in by main from the meta save). */
  unlocks?: string[];
  /** Lost customers as a share of everyone who walked in, e.g. "23%". */
  lostPct: string;
  /** P4 B2: the season, once Keep going started one (or a teaser at the end of week 1 of a Gear run). */
  season?: SeasonVM;
  /** P6-3: the week at a glance: one profit bar per day for the last (up to) seven days. */
  week?: WeekStripVM;
}

export interface WeekStripVM {
  /** Days in the strip (≤ 7). */
  n: number;
  days: { day: number; profit: string; h: number; neg: boolean }[];
  profit: string;
  served: number;
}

/** P6-3: the last (up to) seven days as a bar strip; null with fewer than two days to compare. */
export function weekStripViewModel(state: GameState): WeekStripVM | undefined {
  const days = state.days.slice(-ECONOMY.scoredWeekDays);
  if (days.length < 2) return undefined;
  const ps = days.map(profitOf);
  const top = Math.max(1, ...ps.map(Math.abs));
  return {
    n: days.length,
    days: days.map((d, i) => ({ day: d.day, profit: money(ps[i]!), h: Math.round((Math.abs(ps[i]!) / top) * 100) / 100, neg: ps[i]! < 0 })),
    profit: money(ps.reduce((a, b) => a + b, 0)),
    served: days.reduce((n, d) => n + d.served, 0),
  };
}

export interface SeasonVM {
  /** The week that just ended (1..4). */
  week: number;
  of: number;
  rows: { week: number; target: string | null; made: string; hit: boolean | null }[];
  done: boolean;
  medal: Medal;
  hits: number;
  /** End of week 1: what Keep going plays for next. */
  teaser?: string;
  /** Mid-season: next week's target. */
  next?: string;
}

/** P4 B2: the season block on the week-end screen. */
export function seasonViewModel(state: GameState): SeasonVM | undefined {
  const s = state.season;
  if (!s) {
    if (!state.gear || state.unlimited || state.bankrupt || state.days.length < ECONOMY.scoredWeekDays) return undefined;
    const base = Math.max(SEASON.floor, scoreRun(state));
    return { week: 1, of: SEASON.weeks, rows: [], done: false, medal: null, hits: 0, teaser: `Keep going to start a ${SEASON.weeks}-week season: make ${money(seasonTarget(base, 2))} profit next week, a bit more each week after.` };
  }
  const last = s.weeks[s.weeks.length - 1]!;
  const rows = s.weeks.map((w) => ({ week: w.week, target: w.target === null ? null : money(w.target), made: money(w.profit), hit: w.target === null ? null : w.profit >= w.target }));
  return {
    week: last.week, of: SEASON.weeks, rows, done: !!s.done, medal: seasonMedal(s), hits: targetsHit(s),
    ...(!s.done ? { next: money(seasonTarget(s.base, last.week + 1)) } : {}),
  };
}

export function weekEndViewModel(state: GameState, me: PlayerId): WeekEndVM {
  let best: DayStats | null = null;
  for (const d of state.days) if (best === null || profitOf(d) > profitOf(best)) best = d;
  const awards = awardsFor(state);
  const lost = state.days.reduce((n, d) => n + d.lost, 0);
  const walkIns = lost + state.days.reduce((n, d) => n + d.served, 0);
  const season = seasonViewModel(state);
  const week = weekStripViewModel(state);
  return {
    score: money(scoreRun(state)),
    cash: money(state.cash),
    ...(fittingsValue(state) > 0 ? { fittings: money(fittingsValue(state)) } : {}),
    startingCash: money(state.startingCash),
    ...(state.debt ? { tab: money(state.debt) } : {}),
    daysCompleted: state.days.length,
    customersServed: state.days.reduce((sum, d) => sum + d.served, 0),
    bestDay: best ? { day: best.day, profit: money(profitOf(best)) } : null,
    itemsBought: [
      ...state.owned.map((o) => catalogueById[o.itemId]?.name ?? o.itemId),
      // B17: Gear runs buy gear, not catalogue items; list each gear buy (an upgrade shows each step).
      ...(state.gearLog ?? []).filter((e) => e.action === 'buy').map((e) => GEAR[e.gear]?.name ?? e.gear),
    ],
    seed: state.seed,
    isHost: me === state.hostId,
    bankrupt: state.bankrupt,
    awards,
    awardsText: awardsText(state, awards),
    lostPct: `${walkIns ? Math.round((100 * lost) / walkIns) : 0}%`,
    ...(season ? { season } : {}),
    ...(week ? { week } : {}),
  };
}

export interface TitleVM {
  history: { date: string; score: string; days: number; scenario: string; players: string }[];
  canResume: boolean;
  rejoinCode: string | null;
  /** P3 B16: head starts this browser has unlocked, and the one picked last time. */
  perks?: PerkId[];
  lastPerk?: PerkId | null;
}

export function titleViewModel(history: RunRecord[], snapshot: GameState | null, room: RoomRecord | null = null, meta?: { unlocked: PerkId[]; lastPerk: PerkId | null }): TitleVM {
  return {
    ...(meta && meta.unlocked.length ? { perks: meta.unlocked, lastPerk: meta.lastPerk } : {}),
    rejoinCode: room?.role === 'peer' ? room.code : null,
    history: history.map((r) => ({
      date: r.date,
      score: money(r.score),
      days: r.daysCompleted,
      scenario: scenarioById[r.scenario]?.name ?? r.scenario,
      players: r.players.join(', '),
    })),
    canResume: snapshot !== null && snapshot.phase !== 'ended',
  };
}

/** Everything about the night screen except the two values that change every snapshot. */
export function nightStructureKey(vm: NightVM): string {
  const { clock: _clock, cash: _cash, warnings, timer, brief, ...rest } = vm;
  // warning text carries dollar amounts that move with cash; it is patched, so only ids and levels key a rebuild.
  // The timer's last-call flag flips mid-night and is patched; only timed vs relaxed is structure.
  // brief alert text is patched by id too; its ids, severities and fix buttons are structure.
  const briefKey = { profit: brief.profit, loss: brief.loss, headline: brief.headline, alerts: brief.alerts.map((a) => ({ id: a.id, severity: a.severity, icon: a.icon, fix: a.fix })) };
  return JSON.stringify({ ...rest, brief: briefKey, warnings: warnings.map((w) => `${w.id}:${w.level}`), relaxed: timer.relaxed });
}

/** Everything about the HUD except the clock and cash. */
export function hudStructureKey(vm: HudVM): string {
  const { gear: _gear, clock: _clock, cash: _cash, pass, events, messes, cleanliness: _cleanliness, mop, stuns, cleaning, rogue, closing, scrutiny, results: _results, challenges, ...rest } = vm;
  // per-tick values are patched, not rebuilt: the pass keys on its items only
  return JSON.stringify({
    ...rest,
    pass: pass?.map((i) => i.item),
    events: events?.map((e) => e.kind),
    messes: messes?.map((m) => [m.id, m.kind, m.x, m.y]),
    mop: mop?.heldBy,
    stuns: stuns?.map((x) => x.playerId),
    cleaning: cleaning?.map((x) => x.playerId),
    rogue: rogue && { stage: rogue.stage, drink: rogue.drink, name: rogue.name },
    closing: closing !== undefined, // the banner is structure; its count is patched
    scrutiny: scrutiny !== undefined, // the inspector's meter is patched
    // challenge text/have is patched; rebuild only when one completes or fails
    challenges: challenges?.map((c) => `${c.id}:${c.done ? 1 : 0}${c.failed ? 'x' : ''}`),
  });
}

export interface LobbyVM {
  code: string;
  members: string[];
  isHost: boolean;
  canStart: boolean;
  statusText: string;
  /** The bots run setting: Off (0) or 1–3. Host edits it before the start; everyone else just sees it. */
  bots?: LobbyBotsVM;
}

export interface LobbyBotsVM {
  /** 0 = Off. For 'auto' this is how many bots fill the empty seats right now. */
  count: number;
  /** How many actually clock in with this crew (bots never take a fourth human's spot). */
  clocking: number;
  auto: boolean;
  picked: boolean;
  editable: boolean;
}


export function lobbyViewModel(input: {
  code: string;
  members: Member[];
  isHost: boolean;
  status: PeerStatus | 'hosting';
  started: boolean;
  bots?: { bots: BotsChoice; picked: boolean };
}): LobbyVM {
  const { status, started } = input;
  let statusText = '';
  if (status === 'hosting') statusText = started ? 'Room open. Friends can still join.' : 'Share the code. Start when everyone is in.';
  else if (status === 'connecting') statusText = 'Finding the host…';
  else if (status === 'connected') statusText = started ? '' : 'Waiting for the host to start…';
  else if (status === 'hostAway') statusText = 'Waiting for the host to come back…';
  else if (status === 'rejected') statusText = 'Version mismatch. Both of you reload.';
  else if (status === 'full') statusText = 'The café is full (four baristas). Could not join.';
  else if (status === 'failed') statusText = 'Could not connect.';
  return {
    code: input.code,
    members: input.members.map((m) => m.name),
    isHost: input.isHost,
    canStart: input.isHost && !started,
    statusText,
    ...(input.bots
      ? {
          bots: {
            count: input.bots.bots === 'auto' ? botsFor('auto', input.members.length) : input.bots.bots,
            clocking: botsFor(input.bots.bots, input.members.length),
            auto: input.bots.bots === 'auto',
            picked: input.bots.picked,
            editable: input.isHost && !started,
          },
        }
      : {}),
  };
}

export interface ReceiptVM {
  wasted: number;
  fines: string;
  bonus: string;
  inspection: 'pass' | 'fail' | null;
  events: string[];
  botMistakes: number;
  lostRegulars: number;
  rogues: number;
  drinks: { drink: DrinkId; count: number }[];
}

/** The closing receipt's extra lines; every phase-2 field is optional on old days. */
export function receiptViewModel(d: DayStats): ReceiptVM {
  return {
    wasted: d.wasted ?? 0,
    fines: money(d.fines ?? 0),
    bonus: money(d.bonus ?? 0),
    inspection: d.inspection ?? null,
    events: (d.events ?? []).map((k) => EVENT_LABELS[k]),
    botMistakes: d.botMistakes ?? 0,
    lostRegulars: d.lostRegulars ?? 0,
    rogues: d.rogues ?? 0,
    drinks: DRINK_IDS.filter((drink) => BASE_DRINKS.includes(drink) || (d.drinks?.[drink] ?? 0) > 0).map((drink) => ({ drink, count: d.drinks?.[drink] ?? 0 })),
  };
}

/** The rogue customer on the floor: where they are, and seconds left making (or waiting for a player to move). */
export function rogueHud(state: GameState): Pick<HudVM, 'rogue'> {
  const r = state.rogue;
  if (!r) return {};
  let secondsLeft = 0;
  if (r.stage === 'making') secondsLeft = Math.ceil(r.ticksLeft / TICK_RATE);
  else if (r.stage === 'waiting') secondsLeft = Math.ceil((secondsToTicks(ECONOMY.rogue.waitSeconds) - r.waitTicks) / TICK_RATE);
  return {
    rogue: { stage: r.stage, drink: r.drink, x: r.pos.x, y: r.pos.y, secondsLeft, ...(r.name !== undefined ? { name: r.name } : {}) },
  };
}


// ---------------------------------------------------------------------------------------------
// FB1 WP1 (UI lane): the night brief and the night timer.
//
// The clock now reads the sim's `nightClock` (relaxed mode, last call). The brief is still built
// here from the night VM (icons and one-tap UI actions); TODO(fb1, UI): map the sim's
// `nightBrief(state).alerts` (src/sim/brief.ts) in when its fixes can drive the same buttons.
// ---------------------------------------------------------------------------------------------

/** What the night length picker offers; 0 = Relaxed (no clock: the doors open when everyone is ready). */
export const NIGHT_LENGTHS = [60, 120, 180, 0] as const;
/** FB1: the new default night (Claude's WP1-sim moves ECONOMY.nightLengthSec to match). */
export const DEFAULT_NIGHT_LENGTH = 120;
/** The old stand-in for Relaxed (the longest timed night), sent before the sim accepted 0. */
export const RELAXED_FALLBACK_SEC = 600;
/** The sim accepts nightLengthSec 0 (fb1 WP1-sim): Relaxed is sent as 0. */
export const SIM_ACCEPTS_RELAXED = true;

/** The night length to put in the run settings for a picker value. */
export function nightLengthForSim(sec: number): number {
  return sec === 0 && !SIM_ACCEPTS_RELAXED ? RELAXED_FALLBACK_SEC : sec;
}

/**
 * One-time settings migration (main.ts), by the version already applied: from 0, the old 60 s
 * default becomes 120 s; from 0 or 1, the old Relaxed stand-in (600 s) becomes a real Relaxed (0).
 */
export function migrateNightLength(stored: number, from = 0): number {
  if (from < 1 && stored === 60) return DEFAULT_NIGHT_LENGTH;
  if (from < 2 && stored === RELAXED_FALLBACK_SEC) return 0;
  return stored;
}
export const NIGHT_LENGTH_MIGRATION = 2;

/** The picker value for a stored or live night length. */
export function nightLengthChoice(sec: number): number {
  return sec === 0 ? 0 : sec;
}

export interface NightTimerVM {
  relaxed: boolean;
  /** Relaxed nights only: the sim's last call is running (patched, not structure). */
  lastCall: boolean;
  /** The last-call countdown, m:ss, while it runs. */
  lastCallClock?: string;
  /** People readied up / people needed to open (the sim's nightClock; patched, not structure). */
  ready: number;
  needed: number;
}

export function nightTimerVM(state: GameState): NightTimerVM {
  const c = nightClock(state);
  const relaxed = c.mode === 'relaxed';
  const left = relaxed ? c.lastCallSecondsLeft : null;
  const crew = { ready: c.ready.length, needed: c.needed };
  return left === null ? { relaxed, lastCall: false, ...crew } : { relaxed, lastCall: true, lastCallClock: clockFor(left * TICK_RATE), ...crew };
}

export type BriefSeverity = 'danger' | 'warn' | 'info' | 'good';
/**
 * A one-tap fix: a night action and its data attributes (go to a tab, scout), or 'fix': send the
 * sim's own fix input for the alert (restock the packs nightBrief worked out).
 */
export interface BriefFix { label: string; action: 'restock' | 'goto' | 'scout' | 'fix'; data: Record<string, string>; input?: NightFix }
export interface BriefAlert { id: string; severity: BriefSeverity; icon: string; text: string; fix?: BriefFix }
export interface NightBriefVM {
  /** Yesterday's profit, signed ('+$12.84' / '-$3.10'); null on the opening night. */
  profit: string | null;
  loss: boolean;
  /** Tomorrow in one line, from the paper. */
  headline: { icon: string; text: string; sub: string } | null;
  /** At most three, most urgent first. */
  alerts: BriefAlert[];
}

export const MAX_BRIEF_ALERTS = 3;
const SEVERITY_RANK: Record<BriefSeverity, number> = { danger: 0, warn: 1, info: 2, good: 3 };
const SUPPLY_ICON: Record<SupplyId, string> = { beans: '🫘', milk: '🥛', concentrate: '🧊', flavour: '🍯', pastry: '🥐' };
const ALERT_ICON: Record<NightAlert['kind'], string> = { cash: '🏠', stock: '📦', soldOut: '🪧', spoil: '🥀', grow: '🏗️', checkout: '🧾', rival: '☕', signature: '⭐' };

function stockOf(state: GameState, drink: DrinkId, low: Set<SupplyId>): 'out' | 'low' | null {
  const needs = ECONOMY.drinkSupplies[drink];
  if (needs.some((s) => (state.supplies[s] ?? 0) <= 0)) return 'out';
  return needs.some((s) => low.has(s)) ? 'low' : null;
}

/** ui-3.5.1: the condiment box card on the Restock tab. */
export function condimentsVM(state: GameState): NonNullable<NightVM['condiments']> {
  const boxes = state.condimentBoxes ?? 0;
  return {
    boxes,
    servings: state.condiments?.servings ?? 0,
    max: CONDIMENTS.servings,
    cost: CONDIMENTS.boxCost,
    affordable: state.cash >= CONDIMENTS.boxCost,
    full: boxes >= CONDIMENTS.maxBoxes,
  };
}

/** A sim brief alert as a Tonight row: its icon, and a button for its fix (restock) or where to go. */
function briefRow(state: GameState, a: NightAlert): BriefAlert {
  const row: BriefAlert = { id: a.id, severity: a.severity, icon: ALERT_ICON[a.kind], text: a.text };
  const f = a.fix;
  if (f?.kind === 'restock') {
    row.icon = a.kind === 'stock' ? SUPPLY_ICON[f.supply] : row.icon;
    const cost = restockCost(state, f.supply, f.packs);
    row.fix = { label: `+${f.packs * ECONOMY.packs[f.supply].size} · ${money(cost).replace('.00', '')}`, action: 'fix', data: { fix: a.id }, input: f };
  } else if (f?.kind === 'rivalCounter') {
    row.fix = { label: f.on === false ? 'Undo' : `Match it · ${Math.round((1 - RIVAL.counterPrice) * 100)}% off`, action: 'fix', data: { fix: a.id }, input: f };
  } else if (f?.kind === 'stampCard') {
    row.fix = { label: `Stamp card · $${RIVAL.stampCost}`, action: 'fix', data: { fix: a.id }, input: f };
  } else if (f?.kind === 'fridge') {
    // ui-3.4.1 (FB2 A4): buy the fridge card right from the brief (the Udder-Matic asks the crew in co-op)
    const price = FRIDGES[f.fridge].price;
    const vote = price >= GEAR_VOTE_MIN && state.players.filter((p) => p.connected && !p.bot).length > 1;
    row.icon = f.fridge === 'f4' ? '🐄' : '🧊';
    row.fix = { label: `${vote ? '🗳️ Ask the crew' : 'Buy it'} · $${price}`, action: 'fix', data: { fix: a.id }, input: f };
  } else if (f?.kind === 'condimentBox') {
    // ui-3.5.1: the brief's "cream and sugar run out" line buys the boxes it worked out
    row.icon = '🥛';
    row.fix = { label: `Buy ${f.boxes === 1 ? 'a box' : `${f.boxes} boxes`} · $${f.boxes * CONDIMENTS.boxCost}`, action: 'fix', data: { fix: a.id }, input: f };
  } else if (a.kind === 'grow') row.fix = { label: 'See it', action: 'goto', data: { tab: 'spend', sub: 'grow' } };
  else if (a.kind === 'checkout') row.fix = { label: 'See it', action: 'goto', data: { tab: 'spend', sub: 'checkout' } };
  else if ((a.kind === 'rival' && a.id !== 'rival:loyalty') || a.kind === 'signature') row.fix = { label: 'Menu', action: 'goto', data: { tab: 'menu' } };
  else if (a.kind === 'stock') {
    const supply = a.id.split(':')[1] as SupplyId;
    if (SUPPLY_ICON[supply]) row.icon = SUPPLY_ICON[supply];
  }
  return row;
}

/**
 * The Tonight tab's brief: the sim's `nightBrief(state)` alerts (cash, stock, sold out, spoilage,
 * grow, checkout, rival, signature), plus the UI-only ones the sim does not raise (a milestone,
 * regulars and the signature off the menu, new drinks).
 */
export function nightBriefVM(vm: Omit<NightVM, 'brief' | 'tips'>, state: GameState): NightBriefVM {
  const t = vm.takings;
  const out: BriefAlert[] = nightBrief(state).alerts.map((a) => briefRow(state, a));
  const goto = (tab: string, sub = ''): BriefFix['data'] => (sub ? { tab, sub } : { tab });
  const g = vm.growth;
  if (g.milestone) out.push({ id: 'grow:done', severity: 'good', icon: g.milestone.icon, text: `We're a ${g.milestone.name.replace(/^The /, '').toLowerCase()} now!` });
  for (const reg of vm.regulars ?? []) {
    if (reg.status === 'off') out.push({ id: `reg:${reg.name}`, severity: 'warn', icon: '♥', text: `${reg.name}'s ${reg.drinkName.toLowerCase()} is off the menu`, fix: { label: 'Menu', action: 'goto', data: goto('menu') } });
  }
  if (vm.signature?.current && !vm.signature.current.onMenu) out.push({ id: 'sig:off', severity: 'warn', icon: '⭐', text: `“${vm.signature.current.name}” can't be ordered`, fix: { label: 'Menu', action: 'goto', data: goto('menu') } });
  for (const f of vm.fresh ?? []) out.push({ id: `fresh:${f.drink}`, severity: 'good', icon: f.icon, text: `New on the menu: ${f.name}`, fix: { label: 'Menu', action: 'goto', data: goto('menu') } });
  const alerts = out
    .map((a, i) => ({ a, i }))
    .sort((x, y) => SEVERITY_RANK[x.a.severity] - SEVERITY_RANK[y.a.severity] || x.i - y.i)
    .slice(0, MAX_BRIEF_ALERTS)
    .map((x) => x.a);
  const f = vm.forecast;
  return {
    profit: t ? (t.profit.startsWith('-') ? t.profit : `+${t.profit}`) : null,
    loss: !!t?.profit.startsWith('-'),
    headline: f ? { icon: f.icon, text: f.headline, sub: `~${f.customers} walk-ins · ${f.hotPct}% hot` } : null,
    alerts,
  };
}
