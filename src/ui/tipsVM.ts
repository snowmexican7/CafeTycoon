/**
 * FB1 WP6 (UI lane): the bot crew's tips on the Tonight tab, as tap-to-apply chips.
 *
 * The sim's `crewTips(state, n)` picks the top advice and says which bot voices it. The chips
 * skip anything the Heads up list already offers (its grow / checkout / restock rows have their
 * own buttons), and a chip simply disappears once its advice does (it is applied, or no longer
 * worth doing), because the list is rebuilt from state every frame.
 */
import { ECONOMY } from '../data/economy';
import { CONDIMENTS } from '../sim/condiments';
import { BOT_IDS, BOT_PERSONALITIES } from '../sim/bots/roster';
import { crewTips, type Advice, type AdviceKind } from '../sim/bots/planner';
import { nightBrief, type NightFix } from '../sim/brief';
import type { GameState, Personality, SupplyId } from '../sim/types';

export interface TipVM {
  /** The advice id (restock:milk, price:latte, grow:cafe, ...). */
  id: string;
  kind: AdviceKind;
  icon: string;
  /** Who says it: the bot's name ("Bo"). */
  by: string;
  /** Their personality, for the chip's colour. */
  personality: Personality;
  /** The chip text, short. */
  text: string;
  /** The sim's full sentence (tooltip). */
  full: string;
  /** What applying it sends, without the player id. */
  input: NightFix;
}

/** How many tips the Tonight tab shows. */
export const MAX_TIPS = 2;

const TIP_ICON: Record<AdviceKind, string> = {
  restock: '📦', price: '🏷️', twist: '✨', signature: '⭐', scout: '🔭', rival: '☕', grow: '🏗️', checkout: '🧾', equip: '🛠️', menu: '📋',
};
/**
 * 3.3.1: Gear and Phase 4 rows reuse AdviceKind values (planner.ts), so the icon follows the input first:
 * a steep row is not a restock box, a happy-hour match is not a knock-off.
 */
const INPUT_ICON: Partial<Record<NightFix['kind'], string>> = {
  steep: '🧊', condimentBox: '🥛', gear: '⚙️', staff: '👋', rivalCounter: '⏰', stampCard: '🎟️', branch: '🏪',
};

/** The chip's icon: by the input it sends, else by advice kind. */
export function tipIcon(a: Pick<Advice, 'kind' | 'input'>): string {
  return INPUT_ICON[a.input.kind] ?? TIP_ICON[a.kind];
}

const SUPPLY_NAME: Record<SupplyId, string> = { beans: 'beans', milk: 'milk', concentrate: 'cold brew', flavour: 'flavours', pastry: 'pastries' };

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Chip length: short enough to read at a glance, verb-first. */
const TIP_MAX = 40;

/** The sim's advice sentence, cut to a short actionable chip (Round 6). */
export function shortTip(a: Pick<Advice, 'kind' | 'text' | 'input'>): string {
  const i = a.input;
  if (a.kind === 'restock' && i.kind === 'restock') return `Restock ${SUPPLY_NAME[i.supply]} (×${i.packs})`;
  if (i.kind === 'steep') return `Steep ${i.cups} cold brew tonight`;
  if (i.kind === 'condimentBox') return `Buy condiment box ($${(i.boxes * CONDIMENTS.boxCost).toFixed(0)})`;
  if (i.kind === 'rivalCounter') return 'Match the happy hour';
  if (i.kind === 'stampCard') return 'Print our stamp card';
  if (i.kind === 'staff' && i.action === 'fire') return 'Let a paid barista go';
  if (i.kind === 'branch' && i.action === 'send' && i.supply) return `Send ${SUPPLY_NAME[i.supply as SupplyId] ?? i.supply} to the branch`;
  if (i.kind === 'branch' && i.action === 'staff' && typeof i.staff === 'number') return `Staff the branch (${i.staff})`;
  if (a.kind === 'price' && i.kind === 'price') {
    const m = a.text.match(/^(Cut|Raise) the (.+?) to \$([0-9.]+)/i);
    if (m) return `${m[1]} the ${m[2]} to $${m[3]}`;
  }
  let t = a.text;
  const colon = t.indexOf(': ');
  if (colon > 0 && (a.kind === 'rival' || a.kind === 'equip')) t = cap(t.slice(colon + 2));
  else if (colon > 0 && a.kind === 'menu') t = t.slice(0, colon);
  t = t.replace(/\s*\((now|known|untried)[^)]*\)/g, '').replace(/, then free a slot for it$/, '');
  return t.length > TIP_MAX ? `${t.slice(0, TIP_MAX - 1).trimEnd()}…` : t;
}

/** Alert ids that already cover a piece of advice (the sim brief's and the Tonight list's). */
export function coveredBy(id: string): string[] {
  const [kind, arg] = id.split(':');
  if (kind === 'grow') return ['grow', id];
  if (kind === 'checkout') return ['checkout', id];
  // Gear: concentrate is steeped, and the brief's steep alert carries the concentrate top-up
  if (kind === 'restock' && arg) return [`stock:${arg}:out`, `stock:${arg}:low`, ...(arg === 'concentrate' ? ['steep'] : [])];
  if (kind === 'condimentBox') return ['condiments'];
  // Phase 4: the brief's rival alerts have their own Match / Print buttons
  if (kind === 'rival' && (arg === 'promo' || arg === 'loyalty')) return [id];
  return [];
}

function botName(state: GameState, id: string): { name: string; personality: Personality } {
  const p = state.players.find((x) => x.id === id);
  const i = Math.max(0, BOT_IDS.indexOf(id));
  const personality = p?.bot?.personality ?? BOT_PERSONALITIES[i % BOT_PERSONALITIES.length]!;
  return { name: p?.name ?? ECONOMY.bots.names[i] ?? 'Bot', personality };
}

/**
 * The tips to show tonight: the top advice that the Heads up list does not already cover,
 * at most MAX_TIPS. `shown` is the ids of the alerts on screen.
 */
export function tipsVM(state: GameState, shown: readonly string[] = []): TipVM[] {
  const covered = new Set([...shown, ...nightBrief(state).alerts.map((a) => a.id)]);
  return crewTips(state, MAX_TIPS + 4)
    .filter((a) => !coveredBy(a.id).some((c) => covered.has(c)))
    .slice(0, MAX_TIPS)
    .map((a) => {
      const who = botName(state, a.by);
      return { id: a.id, kind: a.kind, icon: tipIcon(a), by: who.name, personality: who.personality, text: shortTip(a), full: a.text, input: a.input };
    });
}
