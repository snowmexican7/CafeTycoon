import { branchBody, branchChip, type BranchVM } from './branchView';
import type { AreaId } from '../data/areas';
import type { ReportVM } from './report';
import { TASTE, TWIST_INFO, TWISTS, type TwistId } from '../sim/taste';
import { isGearId, type AddOnWand, type GearId } from '../data/gear';

const isAddOnWand = (v: unknown): v is AddOnWand => v === 'weak' || v === 'strong';
import { sellLabel, type FridgeVM, type GearTierState, type GearTierVM, type GearVM } from './gearVM';
import { isFridgeId, type FridgeId } from '../data/fridges';
import { catalogueById } from '../data/catalogue';
import { DRINK_INFO } from '../data/drinks';
import type { AdId, CheckoutId, DrinkId, PitchKind, SupplyId, TierId } from '../sim/types';
import { cardArt, CATEGORY_LABEL, CATEGORY_TINT } from './cardArt';
import { esc, hide, onAction, show } from './dom';
import { coin, itemIcon, jar, moon, sun, SUPPLY_COLOR } from './icons';
import { categoryOf, nightExtrasKey, type NightExtras } from './live';
import {
  nightStructureKey,
  type AdsVM, type BriefAlert, type CheckoutVM, type PitchVM, type ForecastVM, type HandCardVM, type MenuLineVM,
  type NightTimerVM, type NightVM, type RivalVM, type SignatureVM, type StaffVM,
} from './viewModels';
import type { RegularVM } from '../sim/regulars';
import { GEAR_VOTE_MIN } from '../sim/gear';
import { growOfferHtml } from './growOffer';
import type { TipVM } from './tipsVM';
import type { GrowNudge } from './growModel';
import type { NightFix } from '../sim/brief';

/*
 * FB1 WP1: the night board, redesigned. Three tabs instead of seven:
 *   Tonight  the brief (yesterday's profit, tomorrow's paper in one line, up to three heads-ups with
 *            one-click fixes) and stock;
 *   Menu     one big card per drink with a big price and −/+;
 *   Spend    cards, ads, the pitch, the checkout. (ui-3.7.1: growing the shop is on the receipt.)
 * Anything long (the receipt, the full paper, the signature designer, twist notebooks, how pricing
 * works) opens in a drawer over the board. Rebuilt only on structure changes; the clock, cash,
 * timer ring, warning text and "need $X" tags are patched in place.
 */

const SUPPLY_LABEL = { beans: 'Beans', milk: 'Milk', concentrate: 'Cold brew', flavour: 'Flavours', pastry: 'Pastries' } as const;
const RING = 2 * Math.PI * 14;
const parseMoney = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;
const short$ = (s: string) => s.replace('.00', '');

export type NightTab = 'tonight' | 'menu' | 'spend' | 'gear';
export const NIGHT_TABS: { id: NightTab; label: string; icon: string }[] = [
  { id: 'tonight', label: 'Tonight', icon: '🌙' },
  { id: 'menu', label: 'Menu', icon: '☕' },
  { id: 'spend', label: 'Spend', icon: '🛒' },
];
/**
 * G4f (playtest: "the night tabs are confusing"): a Gear run's night is one numbered order —
 * ① Restock (stock first, then yesterday and the heads-ups), ② Gear shop, ③ Menu, ④ Extras (cards,
 * ads, pitch, checkout). The pick-your-gear night puts the gear first (nothing to stock yet).
 * A "Next ▸" button in the footer walks the order. Classic runs keep their three tabs.
 */
/*
 * ui-3.5.1 (Kennedy, Round 4: "it should always start on the resupply screen"): every night opens on
 * ① Restock, and the order is what a night needs most often first: Restock → Menu → Gear shop → Extras.
 * The pick-your-gear night keeps Restock first (with a banner pointing at the gear) and puts
 * ② Pick gear straight after it.
 */
export const GEAR_NIGHT_TABS: { id: NightTab; label: string; icon: string }[] = [
  { id: 'tonight', label: 'Restock', icon: '📦' },
  { id: 'menu', label: 'Menu', icon: '☕' },
  { id: 'gear', label: 'Gear shop', icon: '⚙️' },
  { id: 'spend', label: 'Extras', icon: '🛒' },
];
export function nightTabs(gear: GearVM | undefined | null): { id: NightTab; label: string; icon: string }[] {
  if (!gear) return NIGHT_TABS;
  if (!gear.pickNight) return GEAR_NIGHT_TABS;
  const [restock, menu, shop, extras] = GEAR_NIGHT_TABS;
  return [restock, { ...shop, label: 'Pick gear' }, menu, extras];
}
/** ui-3.7.1: the classic Stations board and the Shopfront (grow) view are gone; growing is on the receipt. */
export type SpendView = 'cards' | 'ads' | 'pitch' | 'checkout';
export const SPEND_VIEWS: { id: SpendView; label: string }[] = [
  { id: 'cards', label: '🃏 Cards' },
  { id: 'ads', label: '📣 Ads' },
  { id: 'pitch', label: '🎤 Pitch' },
  { id: 'checkout', label: '🧾 Checkout' },
];
/** What opens over the board. `twist:<drink>` is that drink's twist picker. */
export type Drawer = 'receipt' | 'report' | 'branch' | 'paper' | 'regulars' | 'signature' | 'pricing' | 'notebook' | `twist:${DrinkId}`;

function needText(cost: number, cash: number): string {
  const need = cost - cash;
  return need > 0 ? `Need $${need.toFixed(2)}` : '';
}

const PATH_ICON = { speed: '⚡', quality: '★', reach: '📣' } as const;
const PATH_NAME = { speed: 'Speed', quality: 'Quality', reach: 'Reach' } as const;
const starRow = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

// ---------------------------------------------------------------------------------------------- Spend: cards

function setLine(s: NonNullable<HandCardVM['set']>): string {
  const state = s.fullNext || s.completes ? 'completes' : s.active ? 'on' : '';
  const head = s.isFull ? `${s.name} ✓ full` : s.fullNext ? `Fills ${s.name}!` : s.active ? `${s.name} ✓ on` : s.completes ? `Completes ${s.name}!` : `${s.name} ${s.have}/${s.need}`;
  const title = `Own ${s.need} ${s.name} cards: ${s.bonus}. Own 3: also ${s.full}`;
  return `<span class="set ${state}" title="${esc(title)}">${esc(head)}</span>`;
}

function handCard(c: HandCardVM, cash: number): string {
  const cat = categoryOf(c.itemId);
  const cost = parseMoney(c.cost);
  const tip = `${CATEGORY_LABEL[cat]} · ${PATH_NAME[c.path]} · ${c.rarity}. ${c.flavor}`;
  return `<button class="icard ${c.affordable ? '' : 'poor'} ${c.rarity}" data-action="buy" data-item="${esc(c.itemId)}" data-cost="${cost}" title="${esc(tip)}"
      ${c.affordable ? '' : 'disabled'} aria-label="Buy ${esc(c.name)} for ${esc(c.cost)}">
    <span class="art" style="background:${CATEGORY_TINT[cat]}">${cardArt(cat)}<span class="path ${c.path}" aria-hidden="true">${PATH_ICON[c.path]}</span>${c.spicy ? '<span class="spicy" aria-hidden="true">🌶</span>' : ''}</span>
    <span class="price">${esc(short$(c.cost))}</span>
    <span class="body"><h4>${esc(c.name)}</h4>${c.ups ? `<span class="eff">${esc(c.ups)}</span>` : ''}${c.downs ? `<span class="eff down">▼ ${esc(c.downs)}</span>` : ''}
      <span class="meta">${c.set ? setLine(c.set) : ''}<span class="dur ${c.duration === 'permanent' ? 'perm' : 'tmrw'}">${c.duration === 'permanent' ? 'Keeps' : 'Tomorrow'}</span></span></span>
    ${c.affordable ? '' : `<span class="need">${needText(cost, cash)}</span>`}
    ${c.affordable && c.cutsRent ? '<span class="rent-risk" title="Buying this leaves less than tomorrow\'s rent">Cuts rent</span>' : ''}
  </button>`;
}

function boughtCard(itemId: string): string {
  const item = catalogueById[itemId];
  if (!item) return '';
  return `<div class="icard sold" title="${esc(item.flavor)}">
    <span class="art" style="background:${CATEGORY_TINT[item.category]}">${cardArt(item.category)}</span>
    <span class="body"><h4>${esc(item.name)}</h4></span><span class="stamp">BOUGHT</span></div>`;
}

// ---------------------------------------------------------------------------------------------- Spend: gear (Gear Tree G3)

const GEAR_BTN: Record<GearTierState, (t: GearTierVM) => string> = {
  owned: (t) => (t.copies > 1 ? `Yours ×${t.copies} ✓` : 'Yours ✓'),
  another: (t) => `${t.copies > 1 ? `×${t.copies} · ` : ''}Buy another · $${t.price}`,
  passed: () => 'Upgraded past',
  buy: (t) => `Buy · $${t.price}`,
  upgrade: (t) => `Upgrade · $${t.net}`,
  poor: (t) => `$${t.net}`,
  noSlot: () => 'No free slot',
  needs: (t) => `Needs ${t.needs ?? 'more gear'}`,
};

/** The back bar (sell from a slot) and one row of tiers per tree. Bigger = better, cheapest on the left. */
export function gearBoard(g: GearVM): string {
  const head = g.pickNight
    ? `<div class="gr-pick"><b>Pick your gear.</b> You start with $120 and an empty counter. Buy one machine to sell something tomorrow, then go back to <b>① Restock</b> to stock up.</div>${g.coopHint ? `<div class="gr-pick gr-coop" role="note"><b>👥 Co-op tip.</b> ${esc(g.coopHint)}</div>` : ''}`
    : '';
  const note = g.note ? `<div class="st-trade warn" role="status">⚖️ ${esc(g.note)}</div>` : '';
  // G8: co-op vote on big buys/sales.
  const v = g.vote;
  const vote = v
    ? `<div class="gr-vote" role="status" aria-live="polite"><span class="gr-vote-q">🗳️ <b>${esc(v.text)}</b> <small>Yes ${v.yes} · No ${v.no} · needs ${v.need} of ${v.of}</small></span>${
        v.proposer
          ? `<button class="btn ghost" data-action="gear-vote" data-yes="0">Withdraw</button>`
          : v.mine
            ? `<span class="gr-vote-mine">You voted ${v.mine}</span>`
            : `<button class="btn" data-action="gear-vote" data-yes="1">👍 Yes</button><button class="btn ghost" data-action="gear-vote" data-yes="0">👎 No</button>`
      }</div>`
    : g.voteLast
      ? `<div class="gr-vote done ${g.voteLast.passed ? 'ok' : 'no'}" role="status">🗳️ ${esc(g.voteLast.text)}</div>`
      : '';
  const rule = g.voteRule && !v ? `<div class="gr-vote-rule">🗳️ ${esc(g.voteRule)}</div>` : '';
  const slots = g.slots
    .map((s) => `<div class="st-slot gr-slot ${s.id ? '' : 'empty'}" aria-label="Slot ${s.index + 1}: ${esc(s.name)}">
        <span class="st-ic" aria-hidden="true">${s.icon}</span><b>${esc(s.name)}</b>${s.wand ? `<small class="gr-wand-on">🥛 ${esc(s.wand)}</small>` : ''}<small>Slot ${s.index + 1}</small>
        ${s.id && s.id !== 'b0' ? ((l) => `<button class="btn mini ghost" data-action="gear-sell" data-index="${s.index}" title="${esc(l.title)}">${esc(l.text)}</button>`)(sellLabel(s.id, s.sell)) : ''}</div>`)
    .join('');
  const trees = g.trees
    .map((t) => `<div class="gr-tree"><div class="gr-tree-h"><span aria-hidden="true">${t.icon}</span> ${esc(t.name)}</div><div class="gr-tiers">${t.tiers
      .map((x) => `<div class="gr-tier ${x.state === 'another' ? 'owned another' : x.state}" title="${esc(`${x.blurb} Real-life sticker: ${x.sticker}. Sells back for $${x.sell}.`)}">
          <b>${esc(x.name)}</b><span class="gr-stats">${esc(x.stats)}</span>
          <button class="btn ${x.state === 'buy' || x.state === 'upgrade' || x.state === 'another' ? '' : 'ghost'}" data-action="gear-buy" data-gear="${x.id}" ${x.state === 'buy' || x.state === 'upgrade' || x.state === 'another' ? '' : 'disabled'}>${g.voteRule && x.price >= GEAR_VOTE_MIN && x.state !== 'owned' && x.state !== 'passed' ? '🗳️ ' : ''}${esc(GEAR_BTN[x.state](x))}</button>${(x.wandBuys ?? [])
          .map((w) => `<button class="btn ghost gr-wand-buy" data-action="gear-buy" data-gear="${x.id}" data-wand="${w.wand}" title="${esc(`Buy it with the ${w.name.toLowerCase()} fitted, so milk drinks work from tomorrow.`)}" ${w.ok ? '' : 'disabled'}>${g.voteRule && w.price >= GEAR_VOTE_MIN ? '🗳️ ' : ''}+ ${esc(w.name.toLowerCase())} · $${w.price}</button>`)
          .join('')}
        </div>`).join('')}</div></div>`)
    .join('');
  // ui-3.5.1 declutter: the street notebook and drinks to learn open in a drawer (one button here).
  const more = !g.pickNight && (g.notebook.length || g.levelUps.length)
    ? `<div class="gr-more"><button class="chip" data-action="drawer" data-d="notebook">📓 Street notebook${g.levelUps.length ? ' &amp; drinks to learn' : ''} ▸</button>${g.crowd ? `<span class="gr-crowd-line">👥 ${esc(g.crowd)}</span>` : ''}</div>`
    : '';
  return `<div class="st-board gr-board">${head}${vote}${note}${more}<div class="st-slots" style="--n:${g.slots.length}">${slots}</div>
    ${wandPanel(g)}${g.fridge ? fridgePanel(g.fridge) : ''}<div class="st-shop-h">Gear trees <small>Upgrading trades in the one you have. Got a free slot? Buy a second of the same machine.</small></div>${rule}${trees}</div>`;
}

/** ui-3.5.1 (FB2 C9): steam wands for the espresso machine you already have, or why there's no milk yet. */
export function wandPanel(g: GearVM): string {
  if (!g.wands.length && !g.wandNote) return '';
  const cards = g.wands
    .map((w) => `<div class="gr-tier gr-wand ${w.ok ? 'buy' : 'poor'}" title="${esc(w.blurb)}">
        <span class="gr-fr-ic" aria-hidden="true">🥛</span><b>${esc(w.name)}</b><span class="gr-stats">${esc(`For your ${w.machine} (slot ${w.index + 1}). ${w.blurb}`)}</span>
        <button class="btn ${w.ok ? '' : 'ghost'}" data-action="wand-buy" data-station="${esc(w.station)}" data-wand="${w.wand}" ${w.ok ? '' : 'disabled'}>${w.ok ? `${w.upgrade ? 'Swap up' : 'Add it'} · $${w.price}` : `Need $${w.price}`}</button></div>`)
    .join('');
  return `<div class="gr-fridge gr-wands" aria-label="Steam wand"><div class="gr-tree-h"><span aria-hidden="true">🥛</span> Steam wand</div><div class="gr-fr-row">${cards}${g.wandNote ? `<p class="gr-fr-note">${esc(g.wandNote)}</p>` : ''}</div></div>`;
}

/** ui-3.5.1: the Gear shop's "Street notebook" drawer: how the street rates each kind of drink, and drinks to learn. */
export function notebookBody(g: GearVM | undefined): string {
  if (!g) return '';
  const book = g.notebook.length
    ? `<div class="gr-book" aria-label="Street notebook"><b>📓 Street notebook</b>${g.notebook
        .map((r) => `<span class="gr-bk" title="${esc(r.stars === null ? `Serve ${r.left} more ${r.label.toLowerCase()} drinks to learn how this street feels about them.` : `${r.label} on this street: ${r.stars} of 5.`)}">${r.icon} ${esc(r.label)}: ${r.stars === null ? `<small>${r.served}/${r.served + r.left} served</small>` : `<span class="gr-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>`}</span>`)
        .join('')}${g.crowd ? `<span class="gr-bk gr-crowd">👥 ${esc(g.crowd)}</span>` : ''}</div>`
    : '';
  // G6: drinks that level up with use.
  const lvl = g.levelUps.length
    ? `<div class="gr-book gr-lvl" aria-label="Drinks to learn"><b>🎓 Drinks to learn</b>${g.levelUps
        .map((l) => `<span class="gr-bk${l.learned ? ' done' : ''}" title="${esc(l.learned ? `${l.name} learned: it's on your menu.` : `Serve ${l.count - l.served} more ${l.from}s to learn the ${l.name.toLowerCase()}.`)}">${l.icon} ${esc(l.name)}: ${l.learned ? '<b>learned ✓</b>' : `<small>${l.served}/${l.count} ${esc(l.from)}s${l.also ? ` + ${esc(l.also)}` : ''}${l.needs ? ` · <em class="gr-needs">${esc(l.needs)}</em>` : ''}</small>`}</span>`)
        .join('')}</div>`
    : '';
  return `<div class="nb-body">${book}${lvl}</div>`;
}

/** ui-3.4.1 (FB2 A4): each fridge's little icon on its card. */
export const FRIDGE_ICON: Record<FridgeId, string> = { f1: '🧊', f2: '🍺', f3: '❄️', f4: '🐄' };

/** ui-3.4.1 (FB2 A4): the fridge panel: the shop's fridge, and the one fridge card on offer tonight (a vote in co-op at $50+). */
export function fridgePanel(f: FridgeVM): string {
  const have = f.have
    ? `<div class="gr-tier owned gr-fr" title="${esc(f.have.blurb)}"><span class="gr-fr-ic" aria-hidden="true">${FRIDGE_ICON[f.have.id]}</span><b>${esc(f.have.name)}</b><span class="gr-stats">Holds ${f.have.holds} milk</span><span class="gr-fr-own">✓ Your fridge</span></div>`
    : `<div class="gr-tier gr-fr none"><span class="gr-fr-ic" aria-hidden="true">🚫</span><b>No fridge</b><span class="gr-stats">Milk can't be kept</span></div>`;
  const cards = f.cards
    .map((c) => {
      const label = c.state === 'voting' ? 'The crew is voting' : c.state === 'poor' ? `Need $${c.price}` : `${c.vote ? '🗳️ Ask the crew' : 'Buy it'} · $${c.price}`;
      return `<div class="gr-tier gr-fr ${c.state}" title="${esc(`${c.blurb} Real-life sticker: ${c.sticker}. Fridges are never sold.`)}">
        <span class="gr-fr-ic" aria-hidden="true">${FRIDGE_ICON[c.id]}</span><b>${esc(c.name)}</b><span class="gr-stats">${esc(c.blurb)}</span>
        <button class="btn ${c.state === 'buy' ? '' : 'ghost'}" data-action="fridge-buy" data-fridge="${c.id}" ${c.state === 'buy' ? '' : 'disabled'}>${esc(label)}</button></div>`;
    })
    .join('');
  return `<div class="gr-fridge" aria-label="Fridge"><div class="gr-tree-h"><span aria-hidden="true">🥛</span> Fridge</div><div class="gr-fr-row">${have}${cards}<p class="gr-fr-note">${esc(f.note)}</p></div></div>`;
}

// ---------------------------------------------------------------------------------------------- Spend: ads, pitch, grow, checkout

function adsBoard(a: AdsVM): string {
  const last = a.last ? `<div class="sp-note ${a.last.outcome}" title="${esc(a.last.result)}">Yesterday: ${a.last.icon} ${esc(a.last.name)} ${a.last.outcome === 'viral' ? 'went viral' : a.last.outcome === 'ok' ? 'did fine' : 'flopped'}</div>` : '';
  const head = a.booked
    ? `<div class="sp-note ok">${a.booked.icon} ${esc(a.booked.name)} booked by ${esc(a.booked.by)} <button class="btn mini" data-action="ad" data-ad="">Cancel</button></div>`
    : '<div class="sp-note">One campaign for tomorrow. Results show when the doors open.</div>';
  const cards = a.options
    .map((o) => `<div class="sp-card ${o.booked ? 'on' : ''}" title="${esc(`${o.copy} (${o.odds})`)}">
        <div class="sp-top"><span class="sp-ic" aria-hidden="true">${o.icon}</span><b>${esc(o.name)}</b></div>
        <span class="sp-sub">${esc(o.reach)}</span>
        ${o.booked ? '<span class="sp-ok">✓ Booked</span>' : `<button class="btn" data-action="ad" data-ad="${o.id}" ${o.affordable ? '' : 'disabled'}>${a.booked ? 'Switch' : 'Run'} · ${esc(short$(o.cost))}</button>`}
      </div>`)
    .join('');
  return `${last}${head}<div class="sp-grid">${cards}</div>`;
}

export interface PitchDraft { kind: PitchKind; text: string }
function pitchCard(p: PitchVM, d: PitchDraft): string {
  if (p.result) {
    const r = p.result;
    const rows = r.scores.map((s) => `<div class="pr-row" title="${esc(s.verdict)}"><span aria-hidden="true">${s.icon}</span><b>${esc(s.name)}</b><span class="pr-score s${s.score >= 7 ? 'hi' : s.score >= 4 ? 'mid' : 'lo'}">${s.score}/10</span></div>`).join('');
    return `<div class="pitch-card done ${r.tier}"><blockquote class="pr-text">“${esc(r.text)}”</blockquote>${rows}
      <div class="pr-total"><b>${r.total}/30</b> ${esc(r.panel)}${r.boost ? ` <span class="pr-boost">${esc(r.boost)}</span>` : ''}</div></div>`;
  }
  const kind = (k: PitchKind, label: string) => `<button class="btn mini pk ${d.kind === k ? 'on' : ''}" data-action="pitch-kind" data-kind="${k}" aria-pressed="${d.kind === k}">${label}</button>`;
  const judges = p.judges.map((j) => `<span class="pj" title="${esc(j.likes)}">${j.icon} ${esc(j.name)}</span>`).join('');
  return `<div class="pitch-card"><div class="pj-list">${judges}</div>
    <div class="pc-kinds">${kind('promo', '📢 Promo')}${kind('item', '🍰 New item')}</div>
    <textarea class="pitch-text" maxlength="${p.maxLen}" rows="2" aria-label="Your pitch" placeholder="${d.kind === 'promo' ? 'Rainy-day deal: second latte free' : 'House honey oat latte'}">${esc(d.text)}</textarea>
    <div class="pc-foot"><small title="${p.greenlit}+ is green-lit (a small boost tomorrow), ${p.ovation}+ is a standing ovation">${p.greenlit}+ of 30 gets a boost</small><button class="btn" data-action="pitch" ${d.text.trim() ? '' : 'disabled'}>Pitch it</button></div></div>`;
}


function checkoutBoard(c: CheckoutVM): string {
  const cards = c.options
    .map((o, i) => {
      const state = o.active ? 'on' : o.owned ? 'past' : o.next ? 'next' : 'locked';
      const btn = o.active ? '<span class="sp-ok">✓ In use</span>'
        : o.owned ? `<button class="btn" data-action="checkout" data-checkout="${o.id}">Switch back</button>`
          : o.next ? `<button class="btn" data-action="checkout" data-checkout="${o.id}" ${o.affordable ? '' : 'disabled'}>Install · ${esc(short$(o.cost))}</button>`
            : `<span class="sp-sub">🔒 After the ${esc(c.options[i - 1]?.name ?? '')}</span>`;
      const tip = `${o.blurb} ${o.pros.map((p) => `+ ${p}`).join('. ')}. ${o.cons.map((p) => `− ${p}`).join('. ')}. ${o.terms}`;
      return `<div class="sp-card ${state}" data-checkout-card="${o.id}" title="${esc(tip)}">
        <div class="sp-top"><span class="sp-ic" aria-hidden="true">${o.icon}</span><b>${esc(o.name)}</b></div>
        ${o.pros[0] ? `<span class="sp-sub pro">+ ${esc(o.pros[0])}</span>` : ''}${o.cons[0] ? `<span class="sp-sub con">− ${esc(o.cons[0])}</span>` : ''}${btn}</div>`;
    })
    .join('');
  return `<div class="sp-note">How customers pay. Switch back for free.</div><div class="sp-grid">${cards}</div>`;
}

// ---------------------------------------------------------------------------------------------- Menu

function drinkCard(m: MenuLineVM, onlyOne: boolean): string {
  const info = DRINK_INFO[m.drink];
  const delta = m.step === 0 ? '' : `<span class="dc-step ${m.step > 0 ? 'up' : 'down'}">${m.step > 0 ? '+' : '−'}$${Math.abs(m.price - m.list).toFixed(2)}</span>`;
  const stock = m.stock === 'out' ? '<span class="dc-stock out">Sold out</span>' : m.stock === 'low' ? '<span class="dc-stock low">Low</span>' : '';
  // Review Block 6: "Rough guess" only when `PriceLine.rough` / forecastIsRough — not with a Strategist.
  const fcTip = m.rough
    ? `${m.demandPct ? `${m.demandPct > 0 ? '+' : ''}${m.demandPct}% orders vs list price. ` : ''}Rough guess at tomorrow: profit before tips and rent`
    : `${m.demandPct ? `${m.demandPct > 0 ? '+' : ''}${m.demandPct}% orders vs list price. ` : ''}Tomorrow's forecast: profit before tips and rent`;
  const fc = m.orders === undefined
    ? `<span class="dc-fc off">Off the menu${m.fans ? ` · <em class="down" title="${esc(m.fans.join(', '))} will miss it">♥ ${m.fans.length}</em>` : ''}</span>`
    : `<span class="dc-fc" title="${esc(fcTip)}">≈${m.orders} orders · <b>≈$${m.profit!.toFixed(0)}</b>${m.fans ? ` <span class="dc-fan" title="Regulars' favourite: ${esc(m.fans.join(', '))}">♥</span>` : ''}</span>`;
  const tw = m.twist ? TWIST_INFO[m.twist] : null;
  const setBy = m.setByStrategist ? '<em class="dc-strat" title="Your Strategist set this price tonight">Set by Strategist</em>' : '';
  return `<div class="dcard ${m.on ? '' : 'off'} ${m.stock ?? ''}" data-drink-row="${m.drink}">
    <div class="dc-top">${itemIcon(m.drink, 44)}<b class="dc-name">${esc(info.name)}</b>${stock}</div>
    <div class="dc-price">
      <button class="btn pr-btn" data-action="price" data-drink="${m.drink}" data-step="${m.step - 1}" ${m.canDown ? '' : 'disabled'} aria-label="Lower the ${esc(info.name)} price">−</button>
      <span class="dc-p">$${m.price.toFixed(2)}${delta}</span>
      <button class="btn pr-btn" data-action="price" data-drink="${m.drink}" data-step="${m.step + 1}" ${m.canUp ? '' : 'disabled'} aria-label="Raise the ${esc(info.name)} price">+</button>
    </div>
    ${setBy}${fc}
    <div class="dc-foot">
      <button class="btn mini sw ${m.on ? 'on' : ''}" data-action="menu" data-drink="${m.drink}" data-on="${m.on ? '0' : '1'}" ${m.on && onlyOne ? 'disabled title="Keep at least one drink on"' : ''} aria-pressed="${m.on}">${m.on ? 'On' : 'Off'}</button>
      <button class="btn mini ghost" data-action="drawer" data-d="twist:${m.drink}">${tw ? `${tw.icon} ${esc(tw.name)}` : 'Twist'} ▸</button>
    </div>
  </div>`;
}

/** Menu grid columns: 2×2 for four drinks, three across for five or six, four beyond that. */
export function menuCols(n: number): number {
  return n <= 2 ? Math.max(1, n) : n === 3 ? 3 : n === 4 ? 2 : n <= 6 ? 3 : 4;
}

function menuPane(vm: NightVM): string {
  const menu = vm.menu ?? [];
  const onCount = menu.filter((m) => m.on).length;
  const sum = menu.reduce((a, m) => ({ orders: a.orders + (m.orders ?? 0), profit: a.profit + (m.profit ?? 0) }), { orders: 0, profit: 0 });
  const cur = vm.signature?.current;
  const sig = vm.signature?.drinks.length
    ? `<button class="mn-sig ${cur && !cur.onMenu ? 'bad' : ''}" data-action="drawer" data-d="signature">⭐ ${cur ? `“${esc(cur.name)}” <small>${cur.onMenu ? `~${vm.signature.asks} asks` : 'base is off'}</small>` : 'Make a signature'} <em>Edit ▸</em></button>`
    : '';
  const strat = vm.strategist
    ? `<div class="mn-strat" role="note">🧠 <b>Your Strategist sets the menu</b>; you can still override until next night.</div>`
    : '';
  // Review Block 6: "Rough guess" mark only when forecastIsRough (MenuLineVM.rough); Strategist → honest forecast.
  const rough = menu.some((m) => m.rough);
  const sumLabel = rough
    ? `<span class="mn-sum" title="Only a rough guess: weather, events and the rival can swing it. A strategist can tell you more."><em class="mn-guess">Rough guess</em> for tomorrow: <b>≈${sum.orders} orders</b> · <b>≈$${sum.profit.toFixed(0)}</b> profit <small class="mn-more">A strategist can tell you more</small></span>`
    : `<span class="mn-sum" title="Tomorrow's forecast: weather, events and the rival can still swing it.">${vm.strategist ? '<em class="mn-honest">Strategist forecast</em>' : 'Forecast'} for tomorrow: <b>≈${sum.orders} orders</b> · <b>≈$${sum.profit.toFixed(0)}</b> profit</span>`;
  return `${strat}<div class="mn-head">${sumLabel}${sig}
      <button class="btn mini ghost" data-action="drawer" data-d="pricing">How pricing works ⓘ</button></div>
    ${vm.growth.waiting ? `<div class="mn-wait" role="status">${esc(vm.growth.waiting)} ${vm.gear ? '<button class="btn mini" data-action="tab" data-tab="gear">Gear shop ▸</button>' : ''}</div>` : ''}
    <div class="dgrid" style="--cols:${menuCols(menu.length)};--rows:${Math.ceil(menu.length / menuCols(menu.length)) || 1}">${menu.map((m) => drinkCard(m, onCount === 1)).join('')}</div>`;
}

/** ui-3.4.0: "You can afford a cart!" beside the cash; ui-3.7.1: it opens the receipt, where growing lives. */
function nudgeChip(n: GrowNudge): string {
  return `<button class="nudge-chip" data-nudge data-action="drawer" data-d="receipt" title="Grow into ${esc(n.name)} for $${n.cost}: it is on the receipt">
    <span class="nc-ic" aria-hidden="true">${n.icon}</span><span class="nc-t">You can afford ${n.tier === 'cafe' ? 'the café' : `a ${esc(n.short)}`}!</span><b>Grow ▸</b></button>`;
}

/** FB1: who is ready, on the night clock pill ("✓ 1/2 ready"). */
const readyText = (t: NightTimerVM) => `✓ ${t.ready}/${t.needed} ready`;
function readyTag(t: NightTimerVM): string {
  return t.needed > 0 ? `<span class="rd ${t.ready >= t.needed ? 'all' : ''}" aria-label="${t.ready} of ${t.needed} ready">${readyText(t)}</span>` : '';
}

// ---------------------------------------------------------------------------------------------- Tonight

function alertRow(a: BriefAlert): string {
  const data = a.fix ? Object.entries(a.fix.data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ') : '';
  return `<li class="al ${a.severity}" data-wid="${esc(a.id)}"><span class="al-ic" aria-hidden="true">${a.icon}</span><span class="al-t">${esc(a.text)}</span>
    ${a.fix ? `<button class="btn mini" data-action="${a.fix.action}" ${data}>${esc(a.fix.label)}</button>` : ''}</li>`;
}

/** FB1 WP6: a bot's tip as one big tap-to-apply chip ("💬 Bo · hurried: Raise the latte to $5.50 ✓"). */
function tipChip(t: TipVM): string {
  return `<button class="tip p-${t.personality}" data-action="tip" data-tip="${esc(t.id)}" title="${esc(`${t.by}: ${t.full}. Tap to try it.`)}">
    <span class="tip-by"><span aria-hidden="true">💬</span> ${esc(t.by)}</span><span class="tip-ic" aria-hidden="true">${t.icon}</span><span class="tip-t">${esc(t.text)}</span><span class="tip-go">Try it</span></button>`;
}

/** Round 3 item 3: a Strategist or Marketer hire / fire card. */
function hireCard(role: 'strategist' | 'marketer', h: { hired: boolean; wage: string; blurb: string }): string {
  const title = role === 'strategist' ? '🧠 Strategist' : '📣 Marketer';
  if (h.hired) {
    return `<div class="hire on" data-hire="${role}"><div class="hire-lab"><b>${title}</b><span>${esc(h.blurb)}</span><em>On · ${esc(h.wage)}/day</em></div>
      <button class="btn mini ghost" data-action="staff" data-staff="fire" data-role="${role}">Let go</button></div>`;
  }
  return `<div class="hire" data-hire="${role}"><div class="hire-lab"><b>${title}</b><span>${esc(h.blurb)}</span></div>
    <button class="btn mini" data-action="staff" data-staff="hire" data-role="${role}">Hire · ${esc(h.wage)}/day</button></div>`;
}

/** P3 B15: the hired bot baristas, their wage, and hire / let go (specialists sit higher — see hireCardsRow). */
function staffRow(s: StaffVM | undefined): string {
  if (!s) return '';
  const who = s.crew.length ? s.crew.map((c) => `<span class="sf-who" title="${esc(c.trait)}">🤖 ${esc(c.name)}</span>`).join('') : '<span class="sf-none">No hired help. You run the bar.</span>';
  return `<div class="staff" aria-label="Hired staff"><div class="sf-h"><b>Hired staff</b><span>${esc(s.wage)}/day each${s.crew.length ? ` · ${esc(s.total)} at closing` : ''}</span></div>
    <div class="sf-row">${who}</div>
    <div class="sf-btns"><button class="btn mini" data-action="staff" data-staff="hire" ${s.canHire ? '' : 'disabled'} title="${s.canHire ? 'A bot barista clocks in tomorrow' : 'All four spots behind the bar are taken'}">＋ Hire · ${esc(s.wage)}/day</button>
    <button class="btn mini ghost" data-action="staff" data-staff="fire" ${s.crew.length ? '' : 'disabled'}>Let ${s.crew.length ? esc(s.crew[s.crew.length - 1].name) : 'one'} go</button></div></div>`;
}

/** Review Block 6: Strategist / Marketer cards high on Tonight (visible at 1512×982 and 1280×800 without scrolling). */
function hireCardsRow(s: StaffVM | undefined): string {
  if (!s) return '';
  return `<div class="tn-card hire-row" aria-label="Specialists"><div class="tn-h">Specialists</div>
    <div class="hires">${hireCard('strategist', s.hires.strategist)}${hireCard('marketer', s.hires.marketer)}</div></div>`;
}

/** Brief alerts shown on their own Stock card instead of in Heads up (ui-3.5.1 declutter: one warning, one place). */
const onStockCard = (a: BriefAlert): boolean => a.id === 'condiments' || (/^stock:[a-z]+:(out|low)$/.test(a.id) && a.fix?.input?.kind === 'restock');
/** "Beans stock runs out around 2 PM" → "Runs out around 2 PM" for the jar it sits under. */
const jarLine = (text: string): string => {
  const t = text.replace(/^.*? stock /, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** ui-3.5.1: the condiment box card: boxes in the corner, servings in the bar, the $6 box. */
function condimentCard(c: NonNullable<NightVM['condiments']>, alert: BriefAlert | undefined): string {
  const lvl = alert ? 'low' : '';
  const why = c.full ? 'The corner is full' : alert ? 'Runs out tomorrow' : `${c.servings}/${c.max} in the bar`;
  return `<div class="restock cond ${lvl}" data-supply="condiments" title="${esc(alert?.text ?? `Cream and sugar: each box fills the bar to ${c.max} servings.`)}">
    <span class="cd-ic" aria-hidden="true">🥛</span>
    <div class="rs-lab"><b>Condiment box · $${c.cost}</b><span>${c.boxes} in the corner</span><em class="rs-why" ${alert ? `data-wid="${esc(alert.id)}"` : ''}>${alert ? `<span class="al-t">${esc(why)}</span>` : esc(why)}</em></div>
    <button class="btn" data-action="condiment-box" ${c.affordable && !c.full ? '' : 'disabled'} aria-label="Buy a condiment box for $${c.cost}">+1 box · $${c.cost}</button></div>`;
}

function tonightPane(vm: NightVM, extras: NightExtras | undefined): string {
  const b = vm.brief;
  const day = extras?.day ?? 1;
  const g = vm.growth.milestone;
  const banner = g
    ? `<div class="gr-milestone" role="status"><div class="gr-confetti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
        <span class="gr-big" aria-hidden="true">${g.icon}</span><b>We're ${g.name === 'The café' ? 'a café' : `a ${esc(g.name.replace(/^The /, '').toLowerCase())}`} now!</b><span>${esc(g.by)} signed the lease.</span></div>`
    : '';
  // ui-3.5.1: every night opens here, so the first (pick-your-gear) night points at the gear tab.
  const pick = vm.gear?.pickNight
    ? `<div class="tn-pick" role="note"><span aria-hidden="true">⚙️</span><span><b>First night: pick your gear.</b> Buy a machine first, then stock up for it here.</span><button class="btn" data-action="tab" data-tab="gear">② Pick gear ▸</button></div>`
    : '';
  const stats = extras ? `<div class="yd-stats">${extras.served} served · <span class="${extras.lost ? 'neg' : ''}">${extras.lost} walked</span> · ${extras.reputation.toFixed(1)}★${branchChip(vm.branch)}</div>` : '';
  const branchBtn = vm.branch && (vm.branch.open || vm.branch.canOpen) ? `<button class="btn mini ghost" data-action="drawer" data-d="branch">🏪 ${vm.branch.open ? 'Second shop' : 'Open a 2nd shop'} ▸</button>` : '';
  const h = b.headline;
  // ui-3.5.1 declutter: yesterday and tomorrow share one card ("In the till" is gone: the cash is in the header).
  const ydPart = b.profit
    ? `<div class="dy-part"><div class="tn-h">Day ${day - 1}</div><div class="yd-hero ${b.loss ? 'loss' : ''}">${esc(b.profit)}</div>${stats}
        <div class="yd-btns"><button class="btn mini ghost" data-action="drawer" data-d="receipt">Receipt ▸</button>${vm.report ? '<button class="btn mini ghost" data-action="drawer" data-d="report">📋 Report ▸</button>' : ''}${branchBtn}</div></div>`
    : branchBtn ? `<div class="dy-part">${branchBtn}</div>` : '';
  const tmPart = h
    ? `<div class="dy-part"><div class="tn-h">Tomorrow${extras ? ` · ${esc(extras.weekday)}` : ''}</div><div class="tm-row"><span class="tm-ic" aria-hidden="true">${h.icon}</span><b class="tm-head">${esc(h.text)}</b></div>
        <div class="tm-sub">${esc(h.sub)}</div><button class="btn mini ghost" data-action="drawer" data-d="paper">Read the paper ▸</button></div>`
    : '';
  const dayCard = ydPart || tmPart ? `<div class="tn-card dy">${ydPart}${tmPart}</div>` : '';
  const listed = b.alerts.filter((a) => !onStockCard(a));
  const tips = vm.tips.length ? `<div class="tips" aria-label="Crew tips"><div class="tips-h">Crew tips</div>${vm.tips.map(tipChip).join('')}</div>` : '';
  const alerts = `<div class="tn-card al-card">${listed.length || !tips ? '<div class="tn-h">Heads up</div>' : ''}${listed.length ? `<ul class="alerts">${listed.map(alertRow).join('')}</ul>` : tips ? '' : '<p class="al-none">✓ All set. Open when ready.</p>'}${tips}</div>`;
  const warned = new Map(vm.warnings.filter((w) => w.supply).map((w) => [w.supply!, w.level]));
  const jarAlert = new Map(b.alerts.filter(onStockCard).map((a) => [a.id.split(':')[1] ?? a.id, a]));
  const stock = vm.restock
    .map((r) => {
      // Gear runs only flag what tonight's menu needs (no machine, no alarm); pastries are an optional side.
      const lvl = vm.gear ? warned.get(r.supply) : r.count <= 0 && r.supply !== 'pastry' ? 'danger' : warned.get(r.supply);
      const tip = r.spoilPct ? `${r.spoilPct}% of what's left goes off at close${r.spoiled ? ` (${r.spoiled} went off last night)` : ''}` : '';
      const a = jarAlert.get(r.supply);
      // the brief's "runs out around 2 PM" now sits under its own jar; spoilage shows as a line too
      const why = a && !a.id.endsWith(':out')
        ? `<em class="rs-why" data-wid="${esc(a.id)}"><span class="al-t">${esc(jarLine(a.text))}</span></em>`
        : r.spoilPct ? `<em class="rs-why spoil">${r.spoilPct}% goes off at close</em>` : '';
      return `<div class="restock ${lvl ?? ''}" data-supply="${r.supply}" ${tip ? `title="${esc(tip)}"` : ''}>${jar(Math.min(1, r.count / 30), SUPPLY_COLOR[r.supply], 30)}
        <div class="rs-lab"><b>${SUPPLY_LABEL[r.supply]}</b><span>${r.count}${lvl === 'danger' ? ' · out' : lvl ? ' · low' : ''}</span>${why}</div>
        <button class="btn" data-action="restock" data-supply="${r.supply}" ${r.affordable ? '' : 'disabled'} aria-label="Buy ${r.packSize} ${SUPPLY_LABEL[r.supply]} for ${esc(r.packCost)}">+${r.packSize} · ${esc(short$(r.packCost))}</button></div>`;
    })
    .join('') + (vm.condiments ? condimentCard(vm.condiments, jarAlert.get('condiments')) : '');
  const n = (vm.restock?.length || 1) + (vm.condiments ? 1 : 0);
  // ui-3.5.1 declutter: hired help, regulars and the scout sit in one "More" row.
  const regs = vm.regulars ?? [];
  const regWarn = regs.filter((r) => r.status !== 'ok').length;
  const r = vm.rival;
  const moreRow = `<div class="tn-more" aria-label="More"><span class="tn-h">More</span>
    <button class="chip" data-action="edit-look">👕 Edit my barista ▸</button>
    ${regs.length ? `<button class="chip ${regWarn ? 'warn' : ''}" data-action="drawer" data-d="regulars">♥ ${regs.length} regulars${regWarn ? ` · ${regWarn} !` : ''} ▸</button>` : ''}
    ${r.scouted ? `<button class="chip" data-action="drawer" data-d="paper">🔭 Scouted ▸</button>` : `<button class="chip" data-action="scout" ${r.affordable ? '' : 'disabled'} title="See ${esc(r.name)}'s menu and prices for tomorrow">🔭 Scout ${esc(r.name)} · ${esc(short$(r.cost))}</button>`}${staffRow(vm.staff)}</div>`;
  // Review Block 6: specialists first so hire cards are on-screen at 1512×982 / 1280×800 (not under Stock).
  return `${banner}${pick}<div class="tn-grid ${vm.gear ? 'flow' : ''}">
    ${hireCardsRow(vm.staff)}
    <div class="tn-card st"><div class="tn-h">Stock</div><div class="restocks" style="--n:${n}">${stock}</div></div>
    ${alerts}${dayCard}</div>${moreRow}`;
}

// ---------------------------------------------------------------------------------------------- Drawers

function receiptBody(vm: NightVM, day: number): string {
  const t = vm.takings;
  if (!t) return `<p>No sales yet.</p>${growOfferHtml(vm.grow)}`;
  const line = (a: string, b: string, cls = '') => `<div class="line ${cls}"><span>${a}</span><span>${b}</span></div>`;
  return `<div class="rc-paper"><h3>DAY ${day - 1}</h3>
    ${line('Sales', esc(t.sales))}${line('Tips', esc(t.tips))}${t.familyTips ? t.familyTips.map((f) => line(`&nbsp;&nbsp;${esc(f.label)}`, esc(f.amount), 'sub fam-tip')).join('') : ''}${line('Rent', `<span class="neg">−${esc(t.rent)}</span>`)}${t.wages ? line('Crew wages', `<span class="neg">−${esc(t.wages)}</span>`) : ''}
    ${t.hireWages ? line('Specialist wages', `<span class="neg">−${esc(t.hireWages)}</span>`) : ''}
    ${t.priceWalkouts ? line('Left over the price', String(t.priceWalkouts)) : ''}
    ${t.bonus ? line('Bonuses', `+${esc(t.bonus)}`) : ''}
    ${t.combos ? t.combos.map((c) => line(`New combo: ${TWIST_INFO[c.twist].icon} ${esc(TWIST_INFO[c.twist].name)} ${esc(DRINK_INFO[c.drink].short.toLowerCase())}`, `<span class="stars">${starRow(c.stars)}</span>`, 'combo')).join('') : ''}
    ${t.ad ? line(esc(t.ad), '') : ''}
    ${t.sigSold ? line(`Signature: ${t.sigSold} sold`, t.sigBonus !== '$0.00' ? `+${esc(t.sigBonus!)} bonus` : '') : ''}
    ${t.checkoutFees ? line('Checkout fees', `<span class="neg">−${esc(t.checkoutFees)}</span>`) : ''}
    ${t.twists ? line('Twists', `<span class="neg">−${esc(t.twists)}</span>`) : ''}
    ${t.cupStars ? line(`Cups ★${esc(t.cupStars)} avg · ${t.cupsPerfect} perfect`, t.cupsRating ? `<span class="neg">${esc(t.cupsRating)} rating</span>` : '') : ''}
    ${t.pastries ? line('Pastries sold', String(t.pastries)) : ''}
    ${t.spoiled ? line(`Went off: ${esc(t.spoiledWhat ?? '')}`, `<span class="neg">${esc(t.spoiled)}</span>`) : ''}
    ${t.fines ? line('Fines', `<span class="neg">−${esc(t.fines)}</span>`) : ''}
    ${t.tabPaid ? line('Hospital tab paid', `<span class="neg">−${esc(t.tabPaid)}</span>`) : ''}
    ${vm.branch?.yesterday ? line(`Second shop (${vm.branch.yesterday.served} served)`, vm.branch.yesterday.profit < 0 ? `<span class="neg">−$${Math.abs(vm.branch.yesterday.profit).toFixed(2)}</span>` : `+$${vm.branch.yesterday.profit.toFixed(2)}`) : ''}
    ${t.ambulance ? line('Ambulance ride', `<span class="neg">−${esc(t.ambulance)}</span>`, 'ambulance') : ''}
    ${line('Profit', t.profit.startsWith('-') ? esc(t.profit) : `+${esc(t.profit)}`, `total ${t.profit.startsWith('-') ? 'loss' : ''}`)}
    ${vm.tab ? line('Hospital tab (half of each profit pays it)', esc(vm.tab)) : ''}</div>
    ${growOfferHtml(vm.grow)}`;
}

/** P4 B3: the manager's report drawer. */
function reportBody(r: ReportVM | undefined, br?: BranchVM): string {
  if (!r) return '<p>No report yet: open the shop first.</p>';
  const $ = (n: number) => `$${n.toFixed(2)}`;
  const bar = (pct: number) => `<span class="mr-bar" aria-hidden="true"><i style="width:${Math.max(2, Math.min(100, pct))}%"></i></span>`;
  const wait = r.waitSec === null ? '—' : `${r.waitSec}s${r.waitDelta ? ` <small class="${r.waitDelta > 0 ? 'neg' : 'pos'}">${r.waitDelta > 0 ? '▲' : '▼'}${Math.abs(r.waitDelta)}s</small>` : ''}`;
  const kpis = `<div class="mr-kpis">
    <div><small>TAKINGS</small><b>${$(r.takings)}</b></div>
    <div><small>PROFIT</small><b class="${r.profit < 0 ? 'neg' : ''}">${r.profit < 0 ? '−' : '+'}${$(Math.abs(r.profit))}</b></div>
    <div><small>SERVED</small><b>${r.served}</b><small class="${r.walkedPct >= 25 ? 'neg' : ''}">${r.walked} walked (${r.walkedPct}%)</small></div>
    <div><small>AVG WAIT</small><b>${wait}</b></div></div>`;
  const costs = `<div class="mr-sec"><div class="sec-h">Costs</div>
    <div class="mr-row two"><span>Rent</span><b>${$(r.rent)}</b></div>
    <div class="mr-row two"><span>Wages</span><b>${r.wages ? `${$(r.wages)} <small class="${r.wagePct >= 35 ? 'neg' : ''}">${r.wagePct}% of takings</small>` : 'none'}</b></div></div>`;
  const drinks = r.drinks.length
    ? `<div class="mr-sec"><div class="sec-h">Money drinks</div>${r.drinks.map((x) => `<div class="mr-row"><span>${x.icon} ${esc(x.name)} <small>×${x.cups}</small></span>${bar(x.pct)}<b>${$(x.takings)}</b></div>`).join('')}</div>`
    : '';
  const crew = r.crew.length
    ? `<div class="mr-sec"><div class="sec-h">Who served</div>${r.crew.map((c) => `<div class="mr-row"><span>${c.bot ? '🤖' : '🧑'} ${esc(c.name)} <small>${c.serves} cups</small></span>${bar(c.pct)}<b>${$(c.takings)}</b></div>`).join('')}</div>`
    : '';
  const notes = `<div class="mr-notes">${r.notes.map((n) => `<p>📝 ${esc(n)}</p>`).join('')}</div>`;
  const y = br?.yesterday;
  const shop = y && br?.area
    ? `<div class="mr-sec"><div class="sec-h">🏪 Second shop · ${esc(br.area.name)}</div><div class="mr-row two"><span>${y.served} served${y.walked ? ` · <span class="neg">${y.walked} walked</span>` : ''}${y.fromStock ? ` · ${$(y.fromStock)} from our stock` : ''}${y.call ? ` · ${esc(y.call)}` : ''}</span><b class="${y.profit < 0 ? 'neg' : ''}">${y.profit < 0 ? '−' : '+'}${$(Math.abs(y.profit))}</b></div></div>`
    : '';
  return `<div class="mreport">${kpis}${notes}${costs}${shop}${drinks}${crew}</div>`;
}

function newspaper(f: ForecastVM | undefined): string {
  if (!f) return '';
  const iced = 100 - f.hotPct;
  return `<article class="paper-news" aria-label="Tomorrow's forecast: ${esc(f.name)}">
    <header class="pn-mast"><span>THE DAILY GRIND</span><small>${esc(f.edition)} edition</small></header>
    <h2 class="pn-head">${esc(f.headline)}</h2>
    <div class="pn-name"><span aria-hidden="true">${f.icon}</span>${esc(f.name)} · ~${f.customers} walk-ins</div>
    <p>${esc(f.blurb)}</p><p><b>Crew tip:</b> ${esc(f.plan)}</p>
    <div class="pn-split" title="Hot vs iced orders tomorrow"><span class="hot" style="flex:${f.hotPct}">☕ ${f.hotPct}%</span><span class="iced" style="flex:${iced}">🧊 ${iced}%</span></div>
    ${f.effects ? `<p>${esc(f.effects)}</p>` : ''}${f.eventNote ? `<p class="pn-ev">⚠ ${esc(f.eventNote)}</p>` : ''}
    ${f.radio ? `<p>📻 <b>Radio:</b> ${esc(f.radio)}</p>` : ''}${f.challenges ? `<p>${esc(f.challenges)}</p>` : ''}
    ${f.taste ? `<p>☕ <b>Taste:</b> ${esc(f.taste)}</p>` : ''}<p class="pn-later">Day after: ${f.later.icon} ${esc(f.later.name)} (rumour)</p>
  </article>`;
}

function rivalCard(r: RivalVM): string {
  const copy = r.copy
    ? `<p class="rv-copy ${r.copy.matched ? 'ok' : 'bad'}">Their “${esc(r.copy.of)}”: <b>${esc(r.copy.price)}</b>, ours <b>${esc(r.copy.ours)}</b>. We keep ~${r.copy.keep}% of the asks.${r.copy.matched ? '' : ' Match the price or make a new signature.'}</p>`
    : '';
  const peek = r.scouted && r.menu
    ? `<table class="rv-menu"><tr><th></th><th>${esc(r.name)}</th><th>Us</th></tr>${r.menu.map((x) => `<tr><td>${x.icon} ${esc(x.name)}</td><td class="${x.cheaper ? 'neg' : ''}">${esc(x.price)}</td><td>${esc(x.ours)}</td></tr>`).join('')}</table>
       ${r.eyeing !== undefined ? `<p class="rv-eye">${r.eyeing === 0 ? 'Expect a knock-off of our signature tomorrow.' : `A knock-off of our signature in about ${r.eyeing + 1} days.`}</p>` : ''}`
    : `<button class="btn mini" data-action="scout" ${r.affordable ? '' : 'disabled'}>🔭 Scout · ${esc(r.cost)}</button>`;
  return `<div class="rival-card"><h3>☕ ${esc(r.name)} <small>down the street</small></h3>${copy}${peek}</div>`;
}

function regularsBody(regs: RegularVM[]): string {
  const note = { ok: 'happy', off: 'favourite is off: skips tomorrow', pricey: 'thinks it is overpriced' } as const;
  return `<div class="regs">${regs.map((r) => `<div class="rg-row ${r.status}">${itemIcon(r.drink, 28)}<div class="rg-txt"><b>${r.snob ? '🎩 ' : ''}${esc(r.name)}</b> <span>${esc(r.drinkName)}</span><small>${r.snob && r.status === 'ok' ? 'snob: big tips for a perfect cup, little for sloppy ones' : note[r.status]}</small></div>
      <span class="rg-hearts" aria-label="loyalty ${r.loyalty} of ${r.max}">${'♥'.repeat(r.loyalty)}<i>${'♥'.repeat(r.max - r.loyalty)}</i></span></div>`).join('')}</div>`;
}

type SigDraft = { name: string; drink: DrinkId; twist: TwistId; premium: number };

function signatureCard(vm: SignatureVM | undefined, d: SigDraft | null): string {
  if (!vm || !vm.drinks.length) return '<p>Unlock a second drink to design a signature.</p>';
  const draft = d ?? { name: '', drink: vm.drinks[0], twist: TWISTS[0], premium: 2 };
  const book = vm.book[draft.drink] ?? [];
  const starsOf = (t: TwistId) => book.find((b) => b.twist === t)?.stars ?? null;
  const cur = vm.current;
  const dirty = !cur || cur.name !== draft.name || cur.drink !== draft.drink || cur.twist !== draft.twist || cur.premium !== draft.premium;
  const now = cur
    ? `<p class="sig-now"><b>Now: “${esc(cur.name)}”</b> · ${cur.stars === null ? '★ ?' : starRow(cur.stars)} · +$${(cur.premium * vm.premiumStep).toFixed(2)}${cur.onMenu ? ` · ~${vm.asks} asks tomorrow` : ' · <em class="neg">its base is off the menu</em>'}</p>`
    : '<p class="sig-now">No signature yet. Regulars-to-be will ask for it by name.</p>';
  return `<div class="sig-card">${now}
    <div class="sig-form">
      <label>Name <input class="sig-name" maxlength="20" placeholder="${esc(`${TWIST_INFO[draft.twist].name} ${DRINK_INFO[draft.drink].short.toLowerCase()}`)}" value="${esc(draft.name)}"></label>
      <label>Base <select class="sig-drink">${vm.drinks.map((x) => `<option value="${x}" ${x === draft.drink ? 'selected' : ''}>${esc(DRINK_INFO[x].name)}</option>`).join('')}</select></label>
      <label>Twist <select class="sig-twist">${TWISTS.map((t) => {
        const s = starsOf(t);
        const old = book.find((b) => b.twist === t)?.stale ? ' (last season)' : '';
        return `<option value="${t}" ${t === draft.twist ? 'selected' : ''}>${TWIST_INFO[t].icon} ${esc(TWIST_INFO[t].name)} ${s === null ? '?' : '★'.repeat(s)}${old}</option>`;
      }).join('')}</select></label>
      <span class="sig-prem">Premium
        <button class="btn mini pr-btn" data-action="sig-prem" data-step="-1" ${draft.premium <= 0 ? 'disabled' : ''} aria-label="Lower the premium">−</button>
        <b>+$${(draft.premium * vm.premiumStep).toFixed(2)}</b>
        <button class="btn mini pr-btn" data-action="sig-prem" data-step="1" ${draft.premium >= vm.maxPremium ? 'disabled' : ''} aria-label="Raise the premium">+</button></span>
    </div>
    <div class="sig-btns"><button class="btn primary" data-action="sig-save" ${dirty ? '' : 'disabled'}>${cur ? 'Update signature' : 'Put it on the board'}</button>
      ${cur ? '<button class="btn" data-action="sig-retire">Retire</button>' : ''}</div>
    <p class="dr-note">Signature cups sell at the premium. A 5★ combo earns +$1.50 a cup and 4★ +$0.75; ★★ or worse costs rating. A higher premium means fewer asks.</p>
  </div>`;
}

function twistBody(m: MenuLineVM): string {
  const chip = (twist: TwistId | null, label: string, stars: string, title: string, stale = false) =>
    `<button class="tw-chip ${(m.twist ?? null) === twist ? 'on' : ''}${stale ? ' stale' : ''}" data-action="twist" data-drink="${m.drink}" data-twist="${twist ?? ''}" title="${esc(title)}" aria-pressed="${(m.twist ?? null) === twist}">${label}${stars ? `<small>${stars}</small>` : ''}</button>`;
  const chips = chip(null, 'Plain', '', 'No twist') + m.book
    .map((b) => {
      const info = TWIST_INFO[b.twist];
      return chip(b.twist, `${info.icon} ${esc(info.name)}`, b.stars === null ? '?' : `${b.stale ? '~' : ''}${starRow(b.stars)}`, b.stars === null ? `${info.name}: not tried yet` : `${info.name}: ${b.stars} of 5 stars${b.stale ? ' last season' : ''}`, b.stale);
    })
    .join('');
  return `<div class="tw-row">${chips}</div>
    <p class="dr-note">Each twisted cup costs $${TASTE.cost.toFixed(2)}. Every drink has one ★★★★★ twist and one ★ flop, different every run: serve it to find out. Tastes turn every 3 days (~ marks last season's stars). Great combos tip up to +45%.</p>
    <p class="dr-note">Recipe: ${DRINK_INFO[m.drink].ticket.map((s) => esc(s)).join(' → ')} → counter</p>`;
}

function pricingHelp(vm: NightVM): string {
  const honest = !!vm.strategist || !(vm.menu ?? []).some((m) => m.rough);
  const guess = honest
    ? 'The orders and $ under each price are tomorrow\'s forecast, before tips and rent. Weather, events and the rival can still swing it.'
    : 'The orders and $ under each price are a rough guess at tomorrow, before tips and rent. Weather, events and the rival can swing it a lot. A strategist can tell you more.';
  return `<p>Each −/+ moves a drink's price one step from its list price.</p>
  <p>Higher prices earn more per cup but bring fewer customers, and the ones who come are less patient.</p>
  <p>Lower prices bring more orders but a thinner margin. Regulars notice when their favourite gets pricey.</p>
  <p>${guess}</p>`;
}

function drawerHtml(d: Drawer | null, vm: NightVM, extras: NightExtras | undefined, sig: SigDraft | null): string {
  if (!d) return '';
  let title = '';
  let body = '';
  if (d === 'receipt') { title = 'Receipt'; body = receiptBody(vm, extras?.day ?? 1); }
  else if (d === 'report') { title = `📋 Manager's report · Day ${vm.report?.day ?? ''}`; body = reportBody(vm.report, vm.branch); }
  else if (d === 'branch') { title = '🏪 Second shop'; body = branchBody(vm.branch); }
  else if (d === 'paper') { title = 'The paper'; body = newspaper(vm.forecast) + rivalCard(vm.rival); }
  else if (d === 'regulars') { title = 'Regulars'; body = regularsBody(vm.regulars ?? []); }
  else if (d === 'signature') { title = '⭐ Signature drink'; body = signatureCard(vm.signature, sig); }
  else if (d === 'pricing') { title = 'How pricing works'; body = pricingHelp(vm); }
  else if (d === 'notebook') { title = '📓 Street notebook'; body = notebookBody(vm.gear); }
  else {
    const m = vm.menu?.find((x) => `twist:${x.drink}` === d);
    if (!m) return '';
    title = `${DRINK_INFO[m.drink].name}: twist`;
    body = twistBody(m);
  }
  return `<div class="drawer-shade" data-action="drawer-close"></div><section class="drawer" role="dialog" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2><button class="btn mini" data-action="drawer-close" aria-label="Close">✕</button></header><div class="dr-body">${body}</div></section>`;
}

// ---------------------------------------------------------------------------------------------- The board

function nextStep(order: { id: NightTab; label: string; icon: string }[], tab: NightTab): { id: NightTab; label: string; icon: string; n: number } | null {
  const i = order.findIndex((t) => t.id === tab);
  return i >= 0 && i < order.length - 1 ? { ...order[i + 1], n: i + 2 } : null;
}
const nextLabel = (t: { label: string; icon: string; n: number }) => `Next: ${t.n} ${t.icon} ${esc(t.label)} ▸`;

export interface NightUiState { tab: NightTab; spend: SpendView; drawer: Drawer | null; sig: SigDraft | null; pitch: PitchDraft }

/** The whole board as HTML (pure: tests and the word-count check use it). */
export function nightHtml(vm: NightVM, extras: NightExtras | undefined, room: string | null | undefined, ui: NightUiState): string {
  const cash = parseMoney(vm.cash);
  const day = extras?.day ?? 1;
  const title = day <= 1 ? (vm.gear && ui.tab === 'gear' ? 'Pick your gear' : 'Opening night') : `After Day ${day - 1}`;
  const sub = `planning ${extras ? `${extras.weekday}, ` : ''}Day ${day}`;
  const alertN = vm.brief.alerts.filter((a) => a.severity === 'danger' || a.severity === 'warn').length;
  const badge: Record<NightTab, string> = { tonight: alertN ? `${alertN}` : '', menu: '', spend: vm.hand.length ? `${vm.hand.length}` : '', gear: '' };
  const order = nightTabs(vm.gear);
  const tabs = order
    .map((t, i) => `<button class="tab ntab ${t.id === ui.tab ? 'on' : ''} ${t.id === 'tonight' && alertN ? 'alert' : ''} ${t.id === 'menu' && vm.strategist ? 'quiet' : ''}" role="tab" data-action="tab" data-tab="${t.id}" aria-selected="${t.id === ui.tab}"${t.id === 'menu' && vm.strategist ? ' title="Your Strategist sets the menu; you can still override until next night"' : ''}>${vm.gear ? `<span class="step-n" aria-hidden="true">${i + 1}</span>` : ''}${t.icon} ${t.label}${badge[t.id] ? ` <small>${esc(badge[t.id])}</small>` : ''}${t.id === 'menu' && vm.strategist ? ' <small class="by-strat">Strategist</small>' : ''}</button>`)
    .join('');
  const next = vm.gear ? nextStep(order, ui.tab) : null;
  const bought = extras?.bought ?? [];
  const cards = vm.hand.map((c) => handCard(c, cash)).join('') + bought.map((b) => boughtCard(b.itemId)).join('');
  const spendBody: Record<SpendView, string> = {
    cards: `${vm.sets.length ? `<div class="sp-bar"><span class="sets-on" title="Set bonuses switched on">${vm.sets.map((n) => `<span>✓ ${esc(n)}</span>`).join('')}</span></div>` : ''}
      <div class="hand">${cards || '<p class="empty">Nothing left to buy tonight.</p>'}</div>`,
    ads: adsBoard(vm.ads),
    pitch: pitchCard(vm.pitch, ui.pitch),
    checkout: checkoutBoard(vm.checkout),
  };
  const views = SPEND_VIEWS;
  const spend = `<div class="sp-nav" role="tablist">${views.map((s) => `<button class="chip sv ${s.id === ui.spend ? 'on' : ''}" data-action="spend" data-sv="${s.id}" aria-selected="${s.id === ui.spend}">${s.label}</button>`).join('')}</div>
    ${views.map((s) => `<div class="sv-pane ${s.id === ui.spend ? 'on' : ''}" data-sv-pane="${s.id}">${spendBody[s.id]}</div>`).join('')}`;
  const colors = new Map((extras?.crew ?? []).map((c) => [c.id, c]));
  const ready = vm.ready
    .map((p) => {
      const c = colors.get(p.id);
      return `<span class="rp"><span class="av" style="background:${c?.color ?? '#c9b294'}">${esc(c?.initial ?? p.name[0] ?? '?')}</span>${esc(p.name)}${c?.me ? ' <em>(you)</em>' : ''}
        ${p.ready ? '<span class="ok">✓</span>' : '<span class="wait">…</span>'}</span>`;
    })
    .join('');
  const solo = vm.ready.length <= 1;
  const relaxed = vm.timer.relaxed;
  const note = relaxed ? (solo ? 'Relaxed night: opens when you are ready' : 'Relaxed night: opens when everyone is ready') : solo ? 'Opens when you are ready or at 0:00' : 'Opens when everyone is ready or at 0:00';
  const w0 = vm.warnings[0];
  const footWarn = w0 && ui.tab !== 'tonight'
    ? `<button class="foot-warn ${vm.warnings.some((w) => w.level === 'danger') ? 'danger' : 'low'}" data-action="goto" data-tab="tonight" title="${esc(vm.warnings.map((w) => w.title).join(' · '))}"><span aria-hidden="true">⚠</span> <span class="fw-t">${esc(w0.title)}</span></button>`
    : '';
  return `
    <div class="night-shade"></div>
    <div class="night-head">${moon(34)}<h1>${title} <small>· ${esc(sub)}</small></h1>${extras?.season ? `<span class="season-chip" title="This week's season target: profit made so far this week">🏆 ${esc(extras.season)}</span>` : ''}<div class="spacer"></div>
      <div class="pill timer ${relaxed ? 'relaxed' : ''}" role="timer" aria-label="${relaxed ? 'Relaxed night' : 'Night time left'}">${relaxed ? '<span aria-hidden="true">☾</span>' : `<svg class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="none" stroke="#ffffff22" stroke-width="5"/><circle class="arc" cx="18" cy="18" r="14" fill="none" stroke="#ffcf7a" stroke-width="5" stroke-linecap="round" stroke-dasharray="${RING} ${RING}" transform="rotate(-90 18 18)"/></svg>`}<span class="clock">${relaxed ? 'Relaxed' : esc(vm.clock)}</span>${readyTag(vm.timer)}</div>
      <div class="pill">${coin(24)}<span class="cash">${esc(vm.cash)}</span></div>
      ${vm.growth.nudge ? nudgeChip(vm.growth.nudge) : ''}
      ${room ? `<div class="pill room"><small>ROOM</small><b>${esc(room)}</b></div>` : ''}
    </div>
    <div class="board" data-tab="${ui.tab}">
      <div class="tabs" role="tablist">${tabs}</div>
      <div class="pane tonight-pane ${ui.tab === 'tonight' ? 'on' : ''}" data-pane="tonight" role="tabpanel">${tonightPane(vm, extras)}</div>
      <div class="pane menu-pane ${ui.tab === 'menu' ? 'on' : ''}" data-pane="menu" role="tabpanel">${menuPane(vm)}</div>
      <div class="pane spend-pane ${ui.tab === 'spend' ? 'on' : ''}" data-pane="spend" role="tabpanel">${spend}</div>
      ${vm.gear ? `<div class="pane gear-pane ${ui.tab === 'gear' ? 'on' : ''}" data-pane="gear" role="tabpanel">${gearBoard(vm.gear)}</div>` : ''}
      <div class="foot">
        <div class="ready">${ready}</div>
        <div class="spacer"></div>
        ${footWarn}
        <span class="foot-note">${note}</span>
        ${vm.gear ? `<button class="btn big next-step" data-action="tab" data-tab="${next?.id ?? ''}" ${next ? '' : 'hidden'}>${next ? nextLabel(next) : ''}</button>` : ''}
        <button class="btn primary big" data-action="ready" ${vm.meReady ? 'disabled' : ''}>${vm.meReady ? 'Ready ✓ waiting' : `${sun(24).replaceAll('#f6c35b', '#fff4e2')}Open the shop`}</button>
      </div>
      <div class="drawer-slot">${drawerHtml(ui.drawer, vm, extras, ui.sig)}</div>
    </div>`;
}

export function createNight(
  container: HTMLElement,
  handlers: { onBuy(itemId: string): void; onRestock(supply: SupplyId): void; onReady(): void; onMenu?(drink: DrinkId, on: boolean): void; onPrice?(drink: DrinkId, step: number): void; onTwist?(drink: DrinkId, twist: TwistId | null): void; onSignature?(sig: SigDraft | null): void; onScout?(): void; onAd?(ad: AdId | null): void; onPitch?(kind: PitchKind, text: string): void; onCheckout?(checkout: CheckoutId): void; onGrow?(tier: TierId): void; onGear?(action: 'buy', gear: GearId, wand?: AddOnWand): void; onWand?(station: string, wand: AddOnWand): void; onGearSell?(index: number): void; onGearVote?(yes: boolean): void; onFridge?(fridge: FridgeId): void; onTip?(input: NightFix): void; onCondimentBox?(): void; onEditLook?(): void; onStaff?(action: 'hire' | 'fire', role?: 'strategist' | 'marketer'): void; onBranch?(action: 'open' | 'staff' | 'send' | 'close', opts: { area?: AreaId; staff?: number; supply?: SupplyId }): void },
): { render(vm: NightVM, extras?: NightExtras, room?: string | null): void; toast(lines: string[]): void; show(): void; hide(): void } {
  // ui-3.7.1: a bubble for news like the Strategist's menu changes; it sits outside the board, which rebuilds.
  const bubble = document.createElement('div');
  bubble.className = 'night-bubble';
  bubble.setAttribute('role', 'status');
  bubble.hidden = true;
  if (container.parentElement) container.after(bubble);
  else container.append(bubble);
  let bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  const ui: NightUiState = { tab: 'tonight', spend: 'cards', drawer: null, sig: null, pitch: { kind: 'promo', text: '' } };
  let lastVm: NightVM | null = null;
  let lastExtras: NightExtras | undefined;
  let lastKey = '';
  let lastSig = '';
  let lastDay: number | null = null;

  /** Review Block 6: soft open gate — warn when nothing is makeable; never hard-block. */
  function confirmOpenAnyway(): void {
    const shade = document.createElement('div');
    shade.className = 'soft-open';
    shade.setAttribute('role', 'dialog');
    shade.setAttribute('aria-modal', 'true');
    shade.setAttribute('aria-labelledby', 'soft-open-h');
    shade.innerHTML = `<div class="soft-open-card">
      <h3 id="soft-open-h">You can't make any drinks yet.</h3>
      <p>No stock or no machine for anything on the menu. Open anyway?</p>
      <div class="soft-open-btns">
        <button type="button" class="btn primary" data-soft="go">Open anyway</button>
        <button type="button" class="btn ghost" data-soft="back">Go back</button>
      </div></div>`;
    const close = () => shade.remove();
    shade.addEventListener('click', (ev) => {
      const a = (ev.target as HTMLElement).closest<HTMLElement>('[data-soft]')?.dataset.soft;
      if (a === 'go') {
        close();
        handlers.onReady();
      } else if (a === 'back' || ev.target === shade) close();
    });
    container.append(shade);
    shade.querySelector<HTMLElement>('[data-soft=back]')?.focus();
  }

  onAction(container, (action, el) => {
    if (action === 'buy') handlers.onBuy(el.dataset.item!);
    else if (action === 'restock') handlers.onRestock(el.dataset.supply as SupplyId);
    else if (action === 'ready') {
      // Soft open: UI-only gate before onReady when nothing is makeable.
      if (lastVm && !lastVm.makeable && !lastVm.meReady) confirmOpenAnyway();
      else handlers.onReady();
    }
    else if (action === 'menu') handlers.onMenu?.(el.dataset.drink as DrinkId, el.dataset.on === '1');
    else if (action === 'twist') handlers.onTwist?.(el.dataset.drink as DrinkId, (el.dataset.twist || null) as TwistId | null);
    else if (action === 'price') handlers.onPrice?.(el.dataset.drink as DrinkId, Number(el.dataset.step));
    else if (action === 'tab' || action === 'goto') {
      selectTab(el.dataset.tab as NightTab);
      if (el.dataset.sub) selectSpend(el.dataset.sub as SpendView);
    } else if (action === 'spend') selectSpend(el.dataset.sv as SpendView);
    else if (action === 'drawer') openDrawer(el.dataset.d as Drawer);
    else if (action === 'drawer-close') openDrawer(null);
    else if (action === 'sig-prem' && lastVm?.signature) {
      const v = lastVm.signature;
      const d = draftOr(v);
      ui.sig = { ...d, premium: Math.max(0, Math.min(v.maxPremium, d.premium + Number(el.dataset.step))) };
      redrawDrawer();
    } else if (action === 'sig-save' && lastVm?.signature) handlers.onSignature?.(draftOr(lastVm.signature));
    else if (action === 'sig-retire') {
      ui.sig = null;
      handlers.onSignature?.(null);
    } else if (action === 'scout') handlers.onScout?.();
    else if (action === 'branch') {
      const op = el.dataset.op;
      if (op === 'open' && el.dataset.area) handlers.onBranch?.('open', { area: el.dataset.area as AreaId });
      else if (op === 'staff') handlers.onBranch?.('staff', { staff: Number(el.dataset.staff) });
      else if (op === 'send' && el.dataset.supply) handlers.onBranch?.('send', { supply: el.dataset.supply as SupplyId });
      else if (op === 'close') handlers.onBranch?.('close', {});
    } else if (action === 'staff') {
      const role = el.dataset.role === 'strategist' || el.dataset.role === 'marketer' ? el.dataset.role : undefined;
      handlers.onStaff?.(el.dataset.staff === 'fire' ? 'fire' : 'hire', role);
    }
    else if (action === 'ad') handlers.onAd?.((el.dataset.ad || null) as AdId | null);
    else if (action === 'checkout' && el.dataset.checkout) handlers.onCheckout?.(el.dataset.checkout as CheckoutId);
    else if (action === 'grow' && el.dataset.tier) handlers.onGrow?.(el.dataset.tier as TierId);
    else if (action === 'gear-buy' && isGearId(el.dataset.gear)) handlers.onGear?.('buy', el.dataset.gear, isAddOnWand(el.dataset.wand) ? el.dataset.wand : undefined);
    else if (action === 'edit-look') handlers.onEditLook?.();
    else if (action === 'wand-buy' && el.dataset.station && isAddOnWand(el.dataset.wand)) handlers.onWand?.(el.dataset.station, el.dataset.wand);
    else if (action === 'gear-sell') handlers.onGearSell?.(Number(el.dataset.index));
    else if (action === 'gear-vote') handlers.onGearVote?.(el.dataset.yes === '1');
    else if (action === 'fridge-buy' && isFridgeId(el.dataset.fridge)) handlers.onFridge?.(el.dataset.fridge);
    else if (action === 'condiment-box') handlers.onCondimentBox?.();
    else if (action === 'fix') {
      const fix = lastVm?.brief.alerts.find((a) => a.id === el.dataset.fix)?.fix?.input;
      if (fix) handlers.onTip?.(fix);
    } else if (action === 'tip') {
      const tip = lastVm?.tips.find((t) => t.id === el.dataset.tip);
      if (tip) handlers.onTip?.(tip.input);
    }
    else if (action === 'pitch-kind') {
      ui.pitch = { ...ui.pitch, kind: el.dataset.kind === 'item' ? 'item' : 'promo' };
      redrawPitch();
    } else if (action === 'pitch' && ui.pitch.text.trim()) handlers.onPitch?.(ui.pitch.kind, ui.pitch.text);
  });
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.drawer) {
      e.stopPropagation();
      openDrawer(null);
    }
  });
  const draftOr = (v: SignatureVM): SigDraft => ui.sig ?? { name: '', drink: v.drinks[0], twist: TWISTS[0], premium: 2 };
  function syncDraft(v: SignatureVM | undefined): void {
    const key = JSON.stringify(v?.current ?? null);
    if (key === lastSig) return;
    lastSig = key;
    const c = v?.current;
    if (c) ui.sig = { name: c.name, drink: c.drink, twist: c.twist, premium: c.premium };
  }
  function redrawDrawer(): void {
    const slot = container.querySelector('.drawer-slot');
    if (slot && lastVm) slot.innerHTML = drawerHtml(ui.drawer, lastVm, lastExtras, ui.sig);
    container.querySelector<HTMLElement>('.drawer [data-action="drawer-close"]')?.focus({ preventScroll: true });
  }
  function openDrawer(d: Drawer | null): void {
    ui.drawer = d;
    redrawDrawer();
  }
  function redrawPitch(): void {
    const el = container.querySelector('.pitch-card');
    if (el && lastVm) el.outerHTML = pitchCard(lastVm.pitch, ui.pitch);
  }
  container.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.classList?.contains('pitch-text')) {
      ui.pitch = { ...ui.pitch, text: t.value };
      const go = container.querySelector<HTMLButtonElement>('[data-action="pitch"]');
      if (go) go.disabled = !t.value.trim();
      return;
    }
    const v = lastVm?.signature;
    if (!v || !t.closest?.('.sig-card')) return;
    const d = draftOr(v);
    if (t.classList.contains('sig-name')) {
      ui.sig = { ...d, name: t.value };
      const save = container.querySelector<HTMLButtonElement>('[data-action="sig-save"]');
      if (save) save.disabled = false;
      return;
    }
    if (t.classList.contains('sig-drink')) ui.sig = { ...d, drink: t.value as DrinkId };
    else if (t.classList.contains('sig-twist')) ui.sig = { ...d, twist: t.value as TwistId };
    else return;
    redrawDrawer();
  });
  function selectTab(tab: NightTab): void {
    const order = nightTabs(lastVm?.gear);
    if (!order.some((t) => t.id === tab)) return;
    ui.tab = tab;
    const nx = container.querySelector<HTMLElement>('.next-step');
    if (nx) {
      const n = nextStep(order, tab);
      nx.hidden = !n;
      nx.dataset.tab = n?.id ?? '';
      nx.textContent = n ? `Next: ${n.n} ${n.icon} ${n.label} ▸` : '';
    }
    container.querySelectorAll<HTMLElement>('.ntab').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    container.querySelectorAll<HTMLElement>('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === tab));
    container.querySelector<HTMLElement>('.board')?.setAttribute('data-tab', tab);
    const fw = container.querySelector<HTMLElement>('.foot-warn');
    if (fw) fw.hidden = tab === 'tonight';
  }
  function selectSpend(v: SpendView): void {
    if (!SPEND_VIEWS.some((s) => s.id === v)) return;
    ui.spend = v;
    container.querySelectorAll<HTMLElement>('.sv').forEach((b) => {
      const on = b.dataset.sv === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    container.querySelectorAll<HTMLElement>('.sv-pane').forEach((p) => p.classList.toggle('on', p.dataset.svPane === v));
  }

  function patch(vm: NightVM, extras?: NightExtras): void {
    const clock = container.querySelector('.night-head .clock');
    if (clock) clock.textContent = vm.timer.relaxed ? (vm.timer.lastCall ? `Last call ${vm.timer.lastCallClock ?? vm.clock}` : 'Relaxed') : vm.clock;
    container.querySelector('.night-head .timer')?.classList.toggle('last-call', vm.timer.lastCall);
    const rd = container.querySelector<HTMLElement>('.night-head .timer .rd');
    if (rd) {
      rd.textContent = readyText(vm.timer);
      rd.classList.toggle('all', vm.timer.needed > 0 && vm.timer.ready >= vm.timer.needed);
    }
    const cashEl = container.querySelector('.night-head .cash');
    if (cashEl) cashEl.textContent = vm.cash;
    const ring = container.querySelector<SVGCircleElement>('.night-head .ring .arc');
    if (ring && extras) ring.setAttribute('stroke-dasharray', `${(extras.left * RING).toFixed(1)} ${RING.toFixed(1)}`);
    for (const a of vm.brief.alerts) {
      const li = container.querySelector<HTMLElement>(`.alerts li[data-wid="${a.id}"] .al-t`);
      if (li) li.textContent = a.text;
      const jarT = container.querySelector<HTMLElement>(`.restock [data-wid="${a.id}"] .al-t`);
      if (jarT) jarT.textContent = a.id === 'condiments' ? 'Runs out tomorrow' : jarLine(a.text);
    }
    const fw = container.querySelector('.foot-warn .fw-t');
    if (fw && vm.warnings[0]) fw.textContent = vm.warnings[0].title;
    const cash = parseMoney(vm.cash);
    container.querySelectorAll<HTMLElement>('.icard.poor').forEach((card) => {
      const need = card.querySelector('.need');
      if (need) need.textContent = needText(Number(card.dataset.cost), cash);
    });
  }

  return {
    render(vm, extras, room) {
      lastVm = vm;
      lastExtras = extras;
      if (vm.pitch?.result) ui.pitch = { ...ui.pitch, text: '' };
      const key = `${nightStructureKey(vm)}#${extras ? nightExtrasKey(extras) : ''}#${room ?? ''}`;
      if (key === lastKey) return patch(vm, extras);
      lastKey = key;
      // ui-3.5.1: every night opens on ① Restock (Tonight in a classic run), whatever tab was open last night.
      const day = extras?.day ?? null;
      if (day !== lastDay) {
        lastDay = day;
        ui.tab = 'tonight';
        ui.drawer = null;
      }
      // a classic run has no Gear tab
      if (!vm.gear && ui.tab === 'gear') ui.tab = 'tonight';
      syncDraft(vm.signature);
      if (ui.drawer?.startsWith('twist:') && !vm.menu?.some((m) => `twist:${m.drink}` === ui.drawer)) ui.drawer = null;
      const focused = document.activeElement instanceof HTMLElement && container.contains(document.activeElement) ? document.activeElement : null;
      // keep keyboard focus on the same control across a rebuild (−/+ prices rebuild the board)
      const label = focused?.getAttribute('aria-label');
      const focusSel = label ? `[aria-label="${CSS.escape(label)}"]` : focused?.dataset.action ? `[data-action="${focused.dataset.action}"]${focused.dataset.drink ? `[data-drink="${focused.dataset.drink}"]` : ''}${focused.dataset.supply ? `[data-supply="${focused.dataset.supply}"]` : ''}` : '';
      container.innerHTML = nightHtml(vm, extras, room, ui);
      if (focusSel) container.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
      patch(vm, extras);
    },
    toast(lines) {
      if (!lines.length) return;
      bubble.innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join('');
      bubble.hidden = false;
      bubble.classList.remove('in');
      void bubble.offsetWidth;
      bubble.classList.add('in');
      if (bubbleTimer) clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => (bubble.hidden = true), 8000);
    },
    show: () => show(container),
    hide: () => {
      hide(container);
      bubble.hidden = true;
    },
  };
}
