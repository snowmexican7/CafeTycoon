/**
 * P3 B12: the checkout path. The café starts on an old cash register; at night the crew can install
 * an OrderBot kiosk, then a "Squarely" tap terminal (in that order). Each changes how paying and
 * queueing work, with a real trade-off, and the crew can switch back to any one they own for free:
 *
 *  - Register: free, no fees, a tip jar. The baseline.
 *  - Kiosk: customers order on a screen while they wait, so the line holds one more and they are
 *    calmer, and the screen upsells an extra shot. But nobody tips a screen, and the licence costs
 *    a little every day.
 *  - Squarely: the screen flips around ("18% · 20% · 25%"), so tips jump and tap-to-pay is quick.
 *    Squarely takes a cut of every sale.
 *
 * Pure arithmetic: no RNG, so a run that never installs anything keeps an identical stream.
 */
import type { CheckoutId, CheckoutState, GameState, PlayerInput } from './types';
import type { Modifiers } from './effects';

export interface CheckoutInfo {
  name: string;
  icon: string;
  /** One-off install price. */
  cost: number;
  /** Charged at every closing while it is the active checkout. */
  daily: number;
  /** Share of each sale (price + tip) the payment company keeps. */
  fee: number;
  /** Modifier changes while active. */
  patience: number;
  queue: number;
  tipRate: number;
  price: number;
  /** Short pros and cons for the card. */
  pros: string[];
  cons: string[];
  blurb: string;
}

export const CHECKOUT_IDS: CheckoutId[] = ['register', 'kiosk', 'squarely'];

export const CHECKOUT: Record<CheckoutId, CheckoutInfo> = {
  register: {
    name: 'Ka-Ching 3000 register',
    icon: '🧾',
    cost: 0,
    daily: 0,
    fee: 0,
    patience: 1,
    queue: 0,
    tipRate: 0,
    price: 1,
    pros: ['No fees, ever', 'Tip jar on the counter'],
    cons: ['The drawer sticks'],
    blurb: 'Beige, loud and older than the crew. It goes ka-ching and that is all it does.',
  },
  kiosk: {
    name: 'OrderBot kiosk',
    icon: '🖥️',
    cost: 40,
    daily: 2,
    fee: 0,
    patience: 1.12,
    queue: 1,
    tipRate: -0.04,
    price: 1.04,
    pros: ['Line holds one more', 'Calmer waits (+12% patience)', 'Upsells an extra shot (+4% prices)'],
    cons: ['Nobody tips a screen (−4 pts tips)', '$2 licence every day'],
    blurb: 'Customers order on a touchscreen while they wait. It asks "Add an extra shot?" every single time.',
  },
  squarely: {
    name: '"Squarely" tap terminal',
    icon: '📱',
    cost: 75,
    daily: 0,
    fee: 0.03,
    patience: 1.05,
    queue: 0,
    tipRate: 0.08,
    price: 1,
    pros: ['The screen flips around: +8 pts tips', 'Tap and go (+5% patience)'],
    cons: ['Squarely keeps 3% of every sale'],
    blurb: 'It swivels to face the customer and shows 18% · 20% · 25%. Everyone tips out of shame.',
  },
};

export function isCheckoutId(x: unknown): x is CheckoutId {
  return typeof x === 'string' && (CHECKOUT_IDS as string[]).includes(x);
}

/** The checkouts the café owns (the register always) and the one in use. Absent = register only. */
export function checkoutOf(state: GameState): CheckoutState {
  return state.checkout ?? { owned: ['register'], active: 'register' };
}

export function activeCheckout(state: GameState): CheckoutInfo {
  return CHECKOUT[checkoutOf(state).active];
}

/** The next checkout on the path that is not owned yet, or null at the end. */
export function nextCheckout(state: GameState): CheckoutId | null {
  const { owned } = checkoutOf(state);
  return CHECKOUT_IDS.find((id) => !owned.includes(id)) ?? null;
}

/** Fold the active checkout into the modifiers (called from computeModifiers). */
export function applyCheckout(state: GameState, m: Modifiers): void {
  const c = activeCheckout(state);
  m.patience *= c.patience;
  m.queue += c.queue;
  m.queueRoom += c.queue;
  m.tipRate += c.tipRate;
  if (c.price !== 1) for (const d of Object.keys(m.price) as (keyof Modifiers['price'])[]) m.price[d] *= c.price;
}

/** The payment company's cut of one sale (price + tip), in dollars. */
export function checkoutFee(state: GameState, amount: number): number {
  const fee = activeCheckout(state).fee;
  return fee > 0 ? Math.round(amount * fee * 100) / 100 : 0;
}

/** What the installed checkouts are worth (their install prices), for the week's fittings value. */
export function checkoutSpent(state: GameState): number {
  return checkoutOf(state).owned.reduce((a, id) => a + CHECKOUT[id].cost, 0);
}

/** Night input: install the next checkout on the path (and switch to it), or switch to one already owned. Humans only. */
export function applyCheckoutInput(state: GameState, input: Extract<PlayerInput, { kind: 'checkout' }>): GameState {
  if (state.phase !== 'night') return state;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!p || !p.connected || p.bot) return state;
  const cur = checkoutOf(state);
  if (cur.owned.includes(input.checkout)) {
    if (cur.active !== input.checkout) state.checkout = { ...cur, owned: [...cur.owned], active: input.checkout };
    return state;
  }
  if (nextCheckout(state) !== input.checkout) return state;
  const cost = CHECKOUT[input.checkout].cost;
  if (state.cash < cost) return state;
  state.cash = Math.round((state.cash - cost) * 100) / 100;
  state.checkout = { owned: [...cur.owned, input.checkout], active: input.checkout, since: state.day, by: p.name };
  return state;
}

/** Morning: a note on the first day with a new checkout. */
export function checkoutMorning(state: GameState): string | null {
  const c = state.checkout;
  if (!c || c.since !== state.day || c.active === 'register') return null;
  const info = CHECKOUT[c.active];
  const line = c.active === 'kiosk' ? 'The first customer asked it for directions.' : 'The first customer tipped 25% and looked haunted.';
  return `${info.icon} New ${info.name}${c.by ? `, installed by ${c.by}` : ''}. ${line}`;
}
