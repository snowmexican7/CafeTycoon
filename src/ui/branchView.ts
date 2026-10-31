/** P4 B4: the second shop's view model and its night drawer. */
import { AREAS, type AreaId } from '../data/areas';
import { areaFit, BRANCH, BRANCH_SUPPLIES, branchAreas, branchDay, canOpenBranch } from '../sim/branch';
import { ECONOMY } from '../data/economy';
import { restockCost } from '../sim/night';
import { wageEach } from '../sim/staff';
import type { GameState, SupplyId } from '../sim/types';

const SUPPLY: Record<SupplyId, string> = { beans: 'Beans', milk: 'Milk', concentrate: 'Cold brew', flavour: 'Flavours', pastry: 'Pastries' };
import { esc } from './dom';

const $ = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
const signed = (n: number) => `${n < 0 ? '−' : '+'}$${Math.abs(n).toFixed(2)}`;

export interface BranchAreaVM { id: AreaId; name: string; crowd: string; fit: number; fitWord: string }
export interface BranchDayVM { served: number; walked: number; profit: number; fromStock?: number; call?: string }

/** P4 B6: one line for how the branch's phone call went. */
export function callLine(c: { kind: 'machine' | 'order'; took: boolean; by?: string } | undefined): string | undefined {
  if (!c) return undefined;
  if (c.kind === 'machine') return c.took ? `📞 ${c.by ?? 'We'} sent a fix for the machine` : '📞 Machine broke, nobody fixed it: half the cups';
  return c.took ? `📞 ${c.by ?? 'We'} took a big office order` : '📞 Turned down an office order';
}
export interface BranchSupplyVM { id: SupplyId; name: string; have: number; send: number; worth: number }
export interface BranchVM {
  open: boolean;
  cost: number;
  canOpen: boolean;
  /** Why the open buttons are greyed (null when they work). */
  why: string | null;
  areas: BranchAreaVM[];
  area?: { name: string; crowd: string; fit: number; fitWord: string; since: number; by: string };
  staff?: number;
  wage: number;
  tomorrow?: BranchDayVM;
  yesterday?: BranchDayVM;
  resale?: number;
  /** P4 B5: stock credit waiting at the branch and what can be sent. */
  credit?: number;
  supplies?: BranchSupplyVM[];
  /** DEPRECATED (ui-3.7.1): the Manager role is cut and nothing sets this; kept only for src/sim/branch.test.ts (asked of Claude to drop). */
  manager?: null;
}

function fitWord(fit: number): string {
  if (fit >= 1.1) return 'loves our menu';
  if (fit >= 0.98) return 'likes our menu';
  return 'shrugs at our menu';
}

export function branchViewModel(state: GameState): BranchVM | undefined {
  if (!state.gear) return undefined;
  const b = state.branch;
  const why = b ? null : state.tier !== 'cafe' ? 'Grow into the café first.' : state.cash < BRANCH.cost ? `Needs ${$(BRANCH.cost)} in the till.` : null;
  const areas = branchAreas(state).map((id) => {
    const fit = areaFit(state, id);
    return { id, name: AREAS[id].name, crowd: AREAS[id].crowd, fit, fitWord: fitWord(fit) };
  });
  const last = state.days[state.days.length - 1]?.branch;
  const t = branchDay(state, state.day);
  const vm: BranchVM = { open: !!b, cost: BRANCH.cost, canOpen: canOpenBranch(state), why, areas, wage: wageEach(state) };
  if (b) {
    const fit = areaFit(state, b.area);
    vm.area = { name: AREAS[b.area].name, crowd: AREAS[b.area].crowd, fit, fitWord: fitWord(fit), since: b.openedDay, by: b.by };
    vm.staff = b.staff;
    vm.resale = b.spent / 2;
    if (t) vm.tomorrow = { served: t.served, walked: t.walked, profit: t.profit, ...(t.fromStock ? { fromStock: t.fromStock } : {}) };
    vm.credit = b.stockCredit ?? 0;
    vm.supplies = BRANCH_SUPPLIES.map((id) => {
      const pack = ECONOMY.packs[id];
      const have = state.supplies[id] ?? 0;
      const send = Math.min(have, pack.size);
      // 3.3.1: the sim credits a send at tonight's restock price (card discounts count, review M3)
      return { id, name: SUPPLY[id], have, send, worth: Math.round(((send * restockCost(state, id, 1)) / pack.size) * 100) / 100 };
    });
  }
  const cl = callLine(last?.call);
  if (last) vm.yesterday = { served: last.served, walked: last.walked, profit: last.profit, ...(last.fromStock ? { fromStock: last.fromStock } : {}), ...(cl ? { call: cl } : {}) };
  return vm;
}

/** The yesterday card's one-line chip ("🏪 +$31.20"), or ''. */
export function branchChip(v: BranchVM | undefined): string {
  if (!v?.yesterday) return '';
  return `<span class="br-chip ${v.yesterday.profit < 0 ? 'neg' : ''}">🏪 ${signed(v.yesterday.profit)}</span>`;
}

export function branchBody(v: BranchVM | undefined): string {
  if (!v) return '<p>Second shops come with Gear runs.</p>';
  const day = (label: string, d: BranchDayVM) =>
    `<div class="br-day"><small>${label}</small><b class="${d.profit < 0 ? 'neg' : ''}">${signed(d.profit)}</b><span>${d.served} served${d.walked ? ` · <span class="neg">${d.walked} walked</span>` : ''}${d.fromStock ? ` · ${$(d.fromStock)} from our stock` : ''}${d.call ? `<br>${esc(d.call)}` : ''}</span></div>`;
  if (!v.open || !v.area) {
    const rows = v.areas
      .map((a) => `<div class="br-area"><div><b>${esc(a.name)}</b><small>${esc(a.crowd)}</small><small class="${a.fit < 0.98 ? 'neg' : 'pos'}">${esc(a.fitWord)} (×${a.fit.toFixed(2)})</small></div>
        <button class="btn mini" data-action="branch" data-op="open" data-area="${a.id}" ${v.canOpen ? '' : 'disabled'}>Open here · ${$(v.cost)}</button></div>`)
      .join('');
    return `<div class="branch"><p class="br-lead">Open a second shop across town. It runs itself every day: our reputation and the weather bring people in, the area decides how much they like tonight's menu, and the staff you hire decide how many get served. Its profit (or loss) lands in our till at closing.</p>
      ${v.why ? `<p class="br-why">🔒 ${esc(v.why)}</p>` : ''}<div class="br-areas">${rows}</div>
      <p class="br-fine">Rent ${$(BRANCH.rent)}/day · ${$(v.wage)}/day per barista · each serves up to ${BRANCH.perStaff} cups. Sell the lease any night for half back.</p></div>`;
  }
  const a = v.area;
  const s = v.staff ?? 1;
  return `<div class="branch"><div class="br-head"><b>🏪 ${esc(a.name)}</b><small>${esc(a.crowd)} · ${esc(a.fitWord)} (×${a.fit.toFixed(2)}) · opened day ${a.since} by ${esc(a.by)}</small></div>
    <div class="br-days">${v.yesterday ? day('LAST DAY', v.yesterday) : ''}${v.tomorrow ? day('TOMORROW (EST.)', v.tomorrow) : ''}</div>
    <div class="br-staff"><span>Baristas</span><button class="btn mini" data-action="branch" data-op="staff" data-staff="${s - 1}" ${s <= BRANCH.staff.min ? 'disabled' : ''} aria-label="One fewer barista">−</button>
      <b>${s}</b><button class="btn mini" data-action="branch" data-op="staff" data-staff="${s + 1}" ${s >= BRANCH.staff.max ? 'disabled' : ''} aria-label="One more barista">＋</button>
      <small>up to ${s * BRANCH.perStaff} cups · ${$(s * v.wage)}/day</small></div>
    ${stockHtml(v)}
    <p class="br-fine">Walked customers mean too few baristas; a loss with nobody walking means too many. Menu changes at home change what this area thinks of us.</p>
    <button class="btn mini ghost" data-action="branch" data-op="close">Sell the lease (+${$(v.resale ?? 0)})</button></div>`;
}

function stockHtml(v: BranchVM): string {
  if (!v.supplies) return '';
  const btns = v.supplies
    .map((s) => `<button class="btn mini ghost" data-action="branch" data-op="send" data-supply="${s.id}" ${s.send > 0 ? '' : 'disabled'} title="We have ${s.have}">${esc(s.name)} ×${s.send || 0}${s.send ? ` · ${$(s.worth)}` : ''}</button>`)
    .join('');
  return `<div class="br-stock"><div class="br-stock-h"><b>Send stock over</b><small>${v.credit ? `${$(v.credit)} of our stock is there, paying for its cups first` : 'Spare stock pays for its cups instead of going off here'}</small></div><div class="br-stock-btns">${btns}</div></div>`;
}
