/**
 * ui-3.7.1 (Round 4 f follow-up): growing lives on the end-of-day receipt (the closing dialog and the night's Receipt
 * drawer). Anyone connected can grow, at night only (sim/growth.ts `applyGrowInput`), so the offer shows the next tier,
 * its cost, whether the cash covers it, and what changes. The button sends `{ kind: 'grow', tier }`.
 */
import { nextTier, tierOf, TIERS } from '../sim/growth';
import type { GameState, TierId } from '../sim/types';
import { esc } from './dom';
import { gainedDiff, type GainedRow } from './growModel';

export interface GrowOffer {
  tier: TierId;
  name: string;
  icon: string;
  cost: number;
  affordable: boolean;
  /** Cash still needed when it can't be afforded, else 0. */
  short: number;
  blurb: string;
  rows: GainedRow[];
  unlocks: string[];
}

/** The next tier's offer, or null at the top tier. */
export function growOffer(state: GameState): GrowOffer | null {
  const next = nextTier(state);
  if (!next) return null;
  const t = TIERS[next];
  const d = gainedDiff(tierOf(state), next, state.gear === true);
  const short = Math.max(0, Math.round((t.cost - state.cash) * 100) / 100);
  return { tier: next, name: t.name, icon: t.icon, cost: t.cost, affordable: short === 0, short, blurb: t.blurb, rows: d.rows.filter((r) => r.from !== r.to), unlocks: d.unlocks };
}

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** The receipt's grow card (big, plain words); `canAct` false shows it read-only (outside the night). */
export function growOfferHtml(o: GrowOffer | null | undefined, canAct = true): string {
  if (!o) return '';
  const rows = o.rows.map((r) => `<li class="${r.tone}"><span>${esc(r.label)}</span><b>${esc(r.from)} → ${esc(r.to)}</b></li>`).join('');
  const btn = o.affordable
    ? `<button class="btn primary big" type="button" data-action="grow" data-tier="${o.tier}" ${canAct ? '' : 'disabled'} aria-label="Grow into the ${esc(o.name)} for ${money(o.cost)}">Grow · ${money(o.cost)}</button>`
    : `<span class="go-need" role="note">Need ${money(o.short)} more</span>`;
  return `<section class="grow-offer ${o.affordable ? 'ok' : 'poor'}" aria-label="Grow the shop">
    <div class="go-top"><span class="go-ic" aria-hidden="true">${o.icon}</span>
      <div class="go-t"><small>NEXT UP</small><b>${esc(o.name)}</b><span>${money(o.cost)} · ${o.affordable ? 'you can afford it' : 'not enough cash yet'}</span></div>${btn}</div>
    ${rows ? `<ul class="go-rows">${rows}</ul>` : ''}
    ${o.unlocks.length ? `<p class="go-unlocks">Also: ${o.unlocks.map(esc).join(' · ')}</p>` : ''}
    <p class="go-fine">Anyone in the crew can grow tonight. No going back: the rent goes up too.</p></section>`;
}
