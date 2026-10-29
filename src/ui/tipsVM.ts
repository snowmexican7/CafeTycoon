/**
 * FB1 WP6 (UI lane): the bot crew's tips on the Tonight tab, as tap-to-apply chips.
 *
 * The sim's `crewTips(state, n)` picks the top advice and says which bot voices it. The chips
 * skip anything the Heads up list already offers (its grow / checkout / restock rows have their
 * own buttons), and a chip simply disappears once its advice does (it is applied, or no longer
 * worth doing), because the list is rebuilt from state every frame.
 */
import { ECONOMY } from '../data/economy';
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
  restock: '📦', price: '🏷️', twist: '✨', signature: '⭐', scout: '🔭', rival: '☕', grow: '🏗️', checkout: '🧾', slot: '🛠️', equip: '🛠️', menu: '📋',
};
const SUPPLY_NAME: Record<SupplyId, string> = { beans: 'beans', milk: 'milk', concentrate: 'cold brew', flavour: 'flavours', pastry: 'pastries' };

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** The sim's advice sentence, cut to what fits on a chip. */
export function shortTip(a: Pick<Advice, 'kind' | 'text' | 'input'>): string {
  const i = a.input;
  if (a.kind === 'restock' && i.kind === 'restock') return `Buy ${i.packs} ${i.packs === 1 ? 'pack' : 'packs'} of ${SUPPLY_NAME[i.supply]}`;
  let t = a.text;
  const colon = t.indexOf(': ');
  if (colon > 0 && (a.kind === 'rival' || a.kind === 'equip')) t = cap(t.slice(colon + 2));
  else if (colon > 0 && a.kind === 'menu') t = t.slice(0, colon);
  t = t.replace(/\s*\((now|known|untried)[^)]*\)/g, '').replace(/, then free a slot for it$/, '');
  return t.length > 44 ? `${t.slice(0, 43).trimEnd()}…` : t;
}

/** Alert ids that already cover a piece of advice (the sim brief's and the Tonight list's). */
function coveredBy(id: string): string[] {
  const [kind, arg] = id.split(':');
  if (kind === 'grow') return ['grow', id];
  if (kind === 'checkout') return ['checkout', id];
  if (kind === 'restock' && arg) return [`stock:${arg}:out`, `stock:${arg}:low`, `supply:${arg}:out`, `supply:${arg}:low`];
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
      return { id: a.id, kind: a.kind, icon: TIP_ICON[a.kind], by: who.name, personality: who.personality, text: shortTip(a), full: a.text, input: a.input };
    });
}
