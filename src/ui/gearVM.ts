import { AREAS, DRINK_FAMILY, type DrinkFamily } from '../data/areas';
import { gearArea } from '../sim/gear';
/**
 * Gear Tree G3: the Spend › Gear card (replaces Spend › Stations in a Gear run). Pure view model over
 * sim/gear.ts: the back-bar slots with the gear in each, then one row per tree with every tier and what
 * pressing it would do (buy, upgrade with a trade-in, owned, passed, too dear, no free slot).
 */
import { GEAR, GEAR_TREES, treeTiers, type GearId, type GearTree } from '../data/gear';
import { slotCount } from '../sim/slots';
import type { DrinkId, GameState } from '../sim/types';

export type GearTierState = 'owned' | 'another' | 'passed' | 'buy' | 'upgrade' | 'poor' | 'noSlot';

export interface GearTierVM {
  id: GearId;
  name: string;
  /** G4e: how many of this machine the crew has in its slots. */
  copies: number;
  price: number;
  sell: number;
  sticker: string;
  blurb: string;
  /** Short stat line: "Slow · 1 mark · 8 cups/day". */
  stats: string;
  state: GearTierState;
  /** What the button costs after the trade-in. */
  net: number;
}
export interface GearSlotVM { index: number; id: GearId | null; name: string; icon: string; sell: number }
export interface GearVM {
  /** The first night of a Gear run: "Pick your gear". */
  pickNight: boolean;
  slots: GearSlotVM[];
  trees: { id: GearTree; name: string; icon: string; tiers: GearTierVM[] }[];
  freeSlots: number;
  /** One line about what's missing ("No grinder: espresso can't be made"), or null. */
  note: string | null;
  /** G7b: the street notebook. One row per drink family; stars once you've served enough of it. */
  notebook: NotebookRowVM[];
}

export interface NotebookRowVM { family: DrinkFamily; label: string; icon: string; served: number; stars: number | null; left: number }

/** G7b: serve this many of a family before the street tells you how it feels about it. */
export const NOTEBOOK_AFTER = 10;
const FAMILIES: { family: DrinkFamily; label: string; icon: string }[] = [
  { family: 'espresso', label: 'Espresso', icon: '☕' },
  { family: 'milky', label: 'Milky', icon: '🥛' },
  { family: 'iced', label: 'Iced', icon: '🧊' },
  { family: 'filter', label: 'Filter', icon: '🫖' }, // G4d: drip
];

/** G7b: served counts per family over finished days, and a 2–5★ verdict once there are enough. */
export function notebookVM(state: GameState): NotebookRowVM[] {
  const id = gearArea(state);
  if (!id) return [];
  const area = AREAS[id];
  const served: Record<DrinkFamily, number> = { espresso: 0, milky: 0, iced: 0, filter: 0 };
  for (const d of state.days) for (const [drink, n] of Object.entries(d.drinks ?? {})) {
    const fam = DRINK_FAMILY[drink as DrinkId];
    if (fam) served[fam] += n ?? 0;
  }
  return FAMILIES.map((f) => {
    const n = served[f.family];
    const stars = n < NOTEBOOK_AFTER ? null : area.loves.includes(f.family) ? 5 : area.meh.includes(f.family) ? 2 : area.all ? 4 : 3;
    return { ...f, served: n, stars, left: Math.max(0, NOTEBOOK_AFTER - n) };
  });
}

const ICON: Record<GearTree, string> = Object.fromEntries(GEAR_TREES.map((t) => [t.id, t.icon])) as Record<GearTree, string>;

export function gearStats(id: GearId): string {
  const g = GEAR[id];
  const out: string[] = [];
  out.push(g.speed < 1 ? 'Slow' : g.speed > 1 ? 'Fast' : 'Normal speed');
  if (g.marks) out.push(`-${g.marks}★ per cup`);
  if (g.pods) out.push('Pods, no grinder');
  if (g.pot) out.push(`${g.pot.cups}-cup pot · ${g.pot.coldAfter === null ? 'stays hot' : `cold after ${g.pot.coldAfter} s`}${g.pot.miss ? ` · ${Math.round(g.pot.miss * 100)}% too hot/cold` : ''}`);
  if (g.priceMul && g.priceMul !== 1) out.push(`Sells at ×${g.priceMul}`);
  if (g.batch) out.push(`${g.batch} cups/day`);
  else if (g.tree === 'coldBrew') out.push('No daily cap');
  return out.join(' · ');
}

export function gearVM(state: GameState): GearVM {
  const n = slotCount(state.tier);
  const gear = state.slotGear ?? [];
  const slots: GearSlotVM[] = Array.from({ length: n }, (_, i) => {
    const id = gear[i] ?? null;
    return id ? { index: i, id, name: GEAR[id].name, icon: ICON[GEAR[id].tree], sell: GEAR[id].sell } : { index: i, id: null, name: 'Empty', icon: '＋', sell: 0 };
  });
  const freeSlots = slots.filter((s) => !s.id).length;
  const trees = GEAR_TREES.filter((t) => t.id !== 'bin').map((t) => {
    const owned = slots.filter((s) => s.id && GEAR[s.id].tree === t.id).map((s) => GEAR[s.id!]);
    const top = owned.sort((a, b) => b.tier - a.tier)[0];
    const tiers = treeTiers(t.id).map((g): GearTierVM => {
      const tradeIn = top ? top.sell : 0;
      const net = Math.max(0, g.price - tradeIn);
      let st: GearTierState;
      // G4e: the machine you have can be bought again when a slot is free.
      if (top && top.id === g.id) st = freeSlots > 0 && state.cash >= g.price ? 'another' : 'owned';
      else if (top && top.tier > g.tier) st = 'passed';
      else if (state.cash + tradeIn < g.price) st = 'poor';
      else if (!top && freeSlots === 0) st = 'noSlot';
      else st = top ? 'upgrade' : 'buy';
      const copies = owned.filter((o) => o.id === g.id).length;
      return { copies, id: g.id, name: g.name, price: g.price, sell: g.sell, sticker: g.sticker, blurb: g.blurb, stats: gearStats(g.id), state: st, net };
    });
    return { id: t.id, name: t.name, icon: t.icon, tiers };
  });
  const has = (tree: GearTree) => slots.some((s) => s.id && GEAR[s.id].tree === tree);
  let note: string | null = null;
  if (!has('coldBrew') && !has('espresso')) note = 'Nothing to sell yet: buy a cold brew rig or an espresso machine.';
  else if (has('espresso') && !has('grinder') && !slots.some((s) => s.id && GEAR[s.id].pods)) note = 'Espresso needs beans ground first: buy a grinder.';
  else if (!Object.values(state.supplies).some((x) => x > 0)) note = 'No supplies yet: restock on the Restock tab.';
  return { pickNight: state.day <= 1, slots, trees, freeSlots, note, notebook: notebookVM(state) };
}

/** Polish: what the sell button says. Worthless gear gets tossed, not sold. */
export function sellLabel(id: GearId, sell: number): { text: string; title: string } {
  if (sell > 0) return { text: `Sell · $${sell}`, title: `Sell it back for $${sell}.` };
  if (id === 'c1') return { text: 'Bin the sock', title: 'Nobody wants the sock. Frees the slot ($0).' };
  if (id === 's1') return { text: 'Toss it', title: 'Even the dollar store won\'t take it back. Frees the slot ($0).' };
  return { text: 'Toss it', title: 'Worth nothing, but frees the slot ($0).' };
}

export interface HudGearVM { icon: string; name: string; status: string; warn: boolean }

/** G5: one short line per machine on the counter for the day HUD (the bin is left out). */
export function hudGearVM(state: GameState): HudGearVM[] {
  return state.stations
    .filter((s) => s.gear && s.gear !== 'b0')
    .map((s) => {
      const g = GEAR[s.gear!];
      let status = 'ready';
      let warn = false;
      if (s.dead) [status, warn] = ['dead', true];
      else if (s.jammed) [status, warn] = ['jammed! (E)', true];
      else if (s.batchLeft !== undefined) [status, warn] = [s.batchLeft > 0 ? `${s.batchLeft}/${g.batch} left` : 'sold out', s.batchLeft === 0];
      else if (g.pot && s.busyTicksLeft > 0) status = 'brewing…';
      else if (g.pot && s.potLeft !== undefined) {
        const cold = s.potOff === 'cold' || (s.potColdAt !== undefined && state.tick >= s.potColdAt);
        [status, warn] = [`${s.potLeft}/${g.pot.cups} cups${cold ? ' · cold' : s.potOff === 'hot' ? ' · scalding' : ''}`, cold || s.potOff === 'hot'];
      } else if (g.pot) status = 'empty pot (E)';
      else if (s.lucky) status = 'lucky ✨';
      return { icon: ICON[g.tree], name: g.name, status, warn };
    });
}
