/**
 * Gear Tree G3: the Spend › Gear card (replaces Spend › Stations in a Gear run). Pure view model over
 * sim/gear.ts: the back-bar slots with the gear in each, then one row per tree with every tier and what
 * pressing it would do (buy, upgrade with a trade-in, owned, passed, too dear, no free slot).
 */
import { GEAR, GEAR_TREES, treeTiers, type GearId, type GearTree } from '../data/gear';
import { slotCount } from '../sim/slots';
import type { GameState } from '../sim/types';

export type GearTierState = 'owned' | 'passed' | 'buy' | 'upgrade' | 'poor' | 'noSlot';

export interface GearTierVM {
  id: GearId;
  name: string;
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
}

const ICON: Record<GearTree, string> = Object.fromEntries(GEAR_TREES.map((t) => [t.id, t.icon])) as Record<GearTree, string>;

export function gearStats(id: GearId): string {
  const g = GEAR[id];
  const out: string[] = [];
  out.push(g.speed < 1 ? 'Slow' : g.speed > 1 ? 'Fast' : 'Normal speed');
  if (g.marks) out.push(`-${g.marks}★ per cup`);
  if (g.pods) out.push('Pods, no grinder');
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
      if (top && top.id === g.id) st = 'owned';
      else if (top && top.tier > g.tier) st = 'passed';
      else if (state.cash + tradeIn < g.price) st = 'poor';
      else if (!top && freeSlots === 0) st = 'noSlot';
      else st = top ? 'upgrade' : 'buy';
      return { id: g.id, name: g.name, price: g.price, sell: g.sell, sticker: g.sticker, blurb: g.blurb, stats: gearStats(g.id), state: st, net };
    });
    return { id: t.id, name: t.name, icon: t.icon, tiers };
  });
  const has = (tree: GearTree) => slots.some((s) => s.id && GEAR[s.id].tree === tree);
  let note: string | null = null;
  if (!has('coldBrew') && !has('espresso')) note = 'Nothing to sell yet: buy a cold brew rig or an espresso machine.';
  else if (has('espresso') && !has('grinder') && !slots.some((s) => s.id && GEAR[s.id].pods)) note = 'Espresso needs beans ground first: buy a grinder.';
  else if (!Object.values(state.supplies).some((x) => x > 0)) note = 'No supplies yet: restock on the Tonight tab.';
  return { pickNight: state.day <= 1, slots, trees, freeSlots, note };
}

/** Polish: what the sell button says. Worthless gear gets tossed, not sold. */
export function sellLabel(id: GearId, sell: number): { text: string; title: string } {
  if (sell > 0) return { text: `Sell · $${sell}`, title: `Sell it back for $${sell}.` };
  if (id === 'c1') return { text: 'Bin the sock', title: 'Nobody wants the sock. Frees the slot ($0).' };
  if (id === 's1') return { text: 'Toss it', title: 'Even the dollar store won\'t take it back. Frees the slot ($0).' };
  return { text: 'Toss it', title: 'Worth nothing, but frees the slot ($0).' };
}
