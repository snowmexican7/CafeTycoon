import { SIG, sigShare } from '../sim/signature';
import { knownStars, TWISTS, type TwistId } from '../sim/taste';
import { accuracyRating } from '../sim/accuracy';
import { PRICING, menuPrice, priceForecast, priceTraffic } from '../sim/pricing';
import { regularsViewModel, type RegularVM } from '../sim/regulars';
import { ROLE_IDS, ROLES, roleHolders, type RoleId } from '../sim/roles';
import { awardsFor, awardsText, type Award } from '../sim/awards';
import { catalogueById } from '../data/catalogue';
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
import { rerollCost, restockCost } from '../sim/night';
import { spoilRate } from '../sim/spoilage';
import { fittingsValue, scoreRun } from '../sim/score';
import { cutsIntoRent, nightWarnings, type NightWarning } from './nightWarnings';
import type { PeerStatus } from '../net/peerSession';
import type { BotsChoice, Member } from '../net/protocol';
import type { CardPath, CatalogueItem, Rarity, DayStats, DrinkId, EventKind, GameState, MessKind, Phase, PlayerId, RogueStage, RunRecord, SupplyId } from '../sim/types';
import type { RoomRecord } from '../storage/roomStore';
import { BASE_DRINKS, DRINK_IDS, DRINK_INFO, DRINK_TEMP } from '../data/drinks';
import { menuDrinks, neededSupplies, unlockedDrinks } from '../sim/unlocks';
import { forecastById } from '../data/forecasts';
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

/** The day's net: everything that moved the till during the day (sales, tips, bonuses, minus rent, fines and tab paid). */
export function profitOf(d: DayStats): number {
  return Math.round((d.sales + d.tips + (d.bonus ?? 0) - d.rent - (d.fines ?? 0) - (d.debtPaid ?? 0) - (d.twistCost ?? 0)) * 100) / 100;
}

export interface HudVM {
  dayLabel: string;
  clock: string;
  cash: string;
  reputation: string;
  supplies: { id: SupplyId; count: number }[];
  menu: { id: DrinkId; price: string; available: boolean }[];
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

export function hudViewModel(state: GameState): HudVM {
  const mods = computeModifiers(state);
  const available = availableDrinks(state);
  return {
    dayLabel: dayLabelFor(state.day),
    forecast: (() => {
      const f = forecastOf(state);
      return { icon: f.icon, name: forecastName(f, state.day), blurb: f.blurb };
    })(),
    clock: clockFor(state.phaseTicksLeft),
    cash: money(state.cash),
    reputation: stars(state.reputation),
    supplies: neededSupplies(state).map((id) => ({ id, count: state.supplies[id] ?? 0 })),
    menu: unlockedDrinks(state).map((id) => ({ id, price: money(menuPrice(state, id) * mods.price[id]), available: available.includes(id) })),
    notes: state.morningNotes,
    phase: state.phase,
    seed: state.seed,
    pass: state.pass.map((i) => ({ item: i.item, secondsLeft: Math.ceil(i.ticksLeft / 60) })),
    events: state.events.map((e) => ({ kind: e.kind, label: EVENT_LABELS[e.kind], secondsLeft: Math.ceil(e.ticksLeft / 60) })),
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
  clock: string;
  cash: string;
  takings: { sales: string; tips: string; rent: string; profit: string; ambulance?: string; tabPaid?: string; fines?: string; bonus?: string; spoiled?: string; spoiledWhat?: string; pastries?: number; cupStars?: string; cupsPerfect?: number; cupsRating?: string; sigSold?: number; sigBonus?: string; twists?: string; combos?: { drink: DrinkId; twist: TwistId; stars: number }[] } | null;
  /** Espresso Easter egg: unpaid hospital tab, if any. */
  tab?: string;
  hand: HandCardVM[];
  /** P3 B4: fresh rows carry the share that goes off at each closing, and what went off last night. */
  restock: { supply: SupplyId; count: number; packSize: number; packCost: string; affordable: boolean; spoilPct?: number; spoiled?: number }[];
  ready: { id: PlayerId; name: string; ready: boolean; role?: string }[];
  /** Phase 3 B1: the four roles, who holds each, and whether this barista can take it. */
  roles?: RoleVM[];
  /** Phase 3 B3: regulars, their favourite and loyalty. */
  regulars?: RegularVM[];
  meReady: boolean;
  menu?: MenuLineVM[];
  signature?: SignatureVM;
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
  book: { twist: TwistId; stars: number | null }[];
}

/** P3 B7: the signature designer's options and the current signature. */
export interface SignatureVM {
  current?: { name: string; drink: DrinkId; twist: TwistId; premium: number; stars: number | null; since: number; onMenu: boolean };
  drinks: DrinkId[];
  /** Per drink: each twist's known stars (null = not tried). */
  book: Record<string, { twist: TwistId; stars: number | null }[]>;
  /** Expected signature asks tomorrow at the current premium (0 without a signature). */
  asks: number;
  premiumStep: number;
  maxPremium: number;
}

export function signatureVM(state: GameState): SignatureVM {
  const drinks = unlockedDrinks(state);
  const book: SignatureVM['book'] = {};
  for (const d of drinks) book[d] = TWISTS.map((twist) => ({ twist, stars: knownStars(state, d, twist) }));
  const sig = state.signature;
  const m = computeModifiers(state);
  const walkIns = ECONOMY.baseArrivalsPerSecond * state.settings.dayLengthSec * m.traffic;
  return {
    ...(sig
      ? { current: { name: sig.name, drink: sig.drink, twist: sig.twist, premium: sig.premium, stars: knownStars(state, sig.drink, sig.twist), since: sig.since, onMenu: menuDrinks(state).includes(sig.drink) } }
      : {}),
    drinks,
    book,
    asks: sig && menuDrinks(state).includes(sig.drink) ? Math.round(walkIns * sigShare(sig) * 0.8) : 0,
    premiumStep: SIG.premiumStep,
    maxPremium: SIG.maxPremium,
  };
}

export function menuLines(state: GameState): MenuLineVM[] {
  const m = computeModifiers(state);
  const on = menuDrinks(state);
  const walkIns = ECONOMY.baseArrivalsPerSecond * state.settings.dayLengthSec * m.traffic;
  const fc = new Map(priceForecast(state, on, m, walkIns).map((l) => [l.drink, l]));
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
      book: TWISTS.map((twist) => ({ twist, stars: knownStars(state, drink, twist) })),
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

export function nightViewModel(state: GameState, me: PlayerId): NightVM {
  const last = state.days[state.days.length - 1];
  const takings =
    state.days.length > 0 && state.days.length === state.day - 1
      ? {
          sales: money(last.sales), tips: money(last.tips), rent: money(last.rent), profit: money(profitOf(last)), ...espressoLines(last),
          ...(last.fines ? { fines: money(last.fines) } : {}), ...(last.bonus ? { bonus: money(last.bonus) } : {}),
          ...(last.spoiledValue ? { spoiled: money(last.spoiledValue), spoiledWhat: spoiledWhat(last.spoiled) } : {}),
          ...(last.pastries ? { pastries: last.pastries } : {}),
          ...(last.twistCost ? { twists: money(last.twistCost) } : {}),
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
  return {
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
    ready: state.players.filter((p) => !p.bot).map((p) => ({ id: p.id, name: p.name, ready: state.ready.includes(p.id), ...(p.role ? { role: ROLES[p.role].icon } : {}) })),
    roles: rolesViewModel(state, me),
    ...(state.regulars.length ? { regulars: regularsViewModel(state) } : {}),
    meReady: state.ready.includes(me),
    menu: menuLines(state),
    signature: signatureVM(state),
    ...(state.freshDrinks?.length ? { fresh: state.freshDrinks.map(freshDrink) } : {}),
    warnings: nightWarnings(state),
    forecast: forecastViewModel(state),
  };
}

export interface ClosingVM {
  dayLabel: string;
  served: number;
  lost: number;
  turnedAway: number;
  sales: string;
  tips: string;
  rent: string;
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
  /** Lost customers as a share of everyone who walked in, e.g. "23%". */
  lostPct: string;
}

export function weekEndViewModel(state: GameState, me: PlayerId): WeekEndVM {
  let best: DayStats | null = null;
  for (const d of state.days) if (best === null || profitOf(d) > profitOf(best)) best = d;
  const awards = awardsFor(state);
  const lost = state.days.reduce((n, d) => n + d.lost, 0);
  const walkIns = lost + state.days.reduce((n, d) => n + d.served, 0);
  return {
    score: money(scoreRun(state)),
    cash: money(state.cash),
    ...(fittingsValue(state) > 0 ? { fittings: money(fittingsValue(state)) } : {}),
    startingCash: money(state.startingCash),
    ...(state.debt ? { tab: money(state.debt) } : {}),
    daysCompleted: state.days.length,
    customersServed: state.days.reduce((sum, d) => sum + d.served, 0),
    bestDay: best ? { day: best.day, profit: money(profitOf(best)) } : null,
    itemsBought: state.owned.map((o) => catalogueById[o.itemId]?.name ?? o.itemId),
    seed: state.seed,
    isHost: me === state.hostId,
    bankrupt: state.bankrupt,
    awards,
    awardsText: awardsText(state, awards),
    lostPct: `${walkIns ? Math.round((100 * lost) / walkIns) : 0}%`,
  };
}

export interface TitleVM {
  history: { date: string; score: string; days: number; scenario: string; players: string }[];
  canResume: boolean;
  rejoinCode: string | null;
}

export function titleViewModel(history: RunRecord[], snapshot: GameState | null, room: RoomRecord | null = null): TitleVM {
  return {
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
  const { clock: _clock, cash: _cash, warnings, ...rest } = vm;
  // warning text carries dollar amounts that move with cash; it is patched, so only ids and levels key a rebuild
  return JSON.stringify({ ...rest, warnings: warnings.map((w) => `${w.id}:${w.level}`) });
}

/** Everything about the HUD except the clock and cash. */
export function hudStructureKey(vm: HudVM): string {
  const { clock: _clock, cash: _cash, pass, events, messes, cleanliness: _cleanliness, mop, stuns, cleaning, rogue, closing, scrutiny, results: _results, challenges, ...rest } = vm;
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
