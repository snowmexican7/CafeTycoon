/**
 * Gear G10 balance pass: plays Gear runs headless with stand-ins (1, 2 and 4 baristas) and a simple
 * "sensible crew" night: restock to ~1.3 days of expected use, grow when there's a cushion, then buy the
 * next tier on a fixed upgrade path while keeping a supply reserve. Prints one row per run.
 * Usage: npx tsx scripts/gearBalance.ts [days=7] [seeds=4]
 */
import { createRun, startNight } from '../src/sim/run';
import { beginSeason } from '../src/sim/season';
import { step } from '../src/sim/step';
import { addStandIns, syncBots } from '../src/sim/bots/roster';
import { restockCost } from '../src/sim/night';
import { expectedUse } from '../src/sim/brief';
import { ECONOMY } from '../src/data/economy';
import { GEAR, type GearId } from '../src/data/gear';
import { TIERS, nextTier } from '../src/sim/growth';
import { gearArea } from '../src/sim/gear';
import type { GameState, PlayerInput, ScenarioId, SupplyId, TierId } from '../src/sim/types';
// Node globals, typed locally so src tests can import this file without @types/node.
declare const process: { env: Record<string, string | undefined>; argv: string[]; exit(code?: number): never };

const PATH: GearId[] = ['c1', 'e1', 's1', 'c2', 's2', 'g1', 'e2', 'c3', 'g2', 'e3', 's3', 'd1', 'c4', 'e4', 'd2', 'd3', 'g3', 'e5', 'd4b', 'c5', 'd5b', 'e6'];
const RESERVE = 45;
const r2 = (n: number) => Math.round(n * 100) / 100;

function night(state: GameState, ids: string[], stage: number, skip: Set<string>): PlayerInput[] {
  const by = ids[0]!;
  // others vote yes on any open proposal
  if (state.gearVote) return ids.filter((id) => id !== state.gearVote!.by && !state.gearVote!.yes.includes(id)).map((id) => ({ kind: 'gear', playerId: id, action: 'vote', yes: true }));
  if (stage === 99) {
    const out: PlayerInput[] = [];
    let cash = state.cash;
    const use = expectedUse(state);
    for (const sup of Object.keys(use) as SupplyId[]) {
      const need = use[sup] * 1.3 - (state.supplies[sup] ?? 0);
      if (need <= 0) continue;
      let packs = Math.ceil(need / ECONOMY.packs[sup].size);
      while (packs > 0 && restockCost(state, sup, packs) > cash) packs--;
      if (packs <= 0) continue;
      cash = r2(cash - restockCost(state, sup, packs));
      out.push({ kind: 'restock', playerId: by, supply: sup, packs });
    }
    return out;
  }
  const nt = nextTier(state);
  if (nt && !skip.has('grow') && state.day >= 3 && state.cash > TIERS[nt].cost + 60) return [{ kind: 'grow', playerId: by, tier: nt }];
  const owned = new Set(state.slotGear ?? []);
  for (const id of PATH) {
    if (owned.has(id) || skip.has(id)) continue;
    const g = GEAR[id];
    // Past the pod machine an espresso machine needs a grinder: don't trade the pods away before one is in.
    if (g.tree === 'espresso' && g.tier >= 2 && !state.stations.some((x) => x.kind === 'grinder')) continue;
    const better = (state.slotGear ?? []).some((o) => o && GEAR[o].tree === g.tree && GEAR[o].tier >= g.tier);
    if (better) continue;
    const trade = (state.slotGear ?? []).reduce((t, o) => (o && GEAR[o].tree === g.tree ? Math.max(t, GEAR[o].sell) : t), 0);
    if (state.cash + trade - g.price < RESERVE) return [];
    return [{ kind: 'gear', playerId: by, action: 'buy', gear: id }];
  }
  return [];
}

/** P4 B8: an optional extra crew move, asked when the scripted night has nothing left to do (and each day tick). */
export type ExtraMoves = (state: GameState, ids: string[]) => PlayerInput[];

export function playGear(humans: number, seed: number, scenario: ScenarioId | null, days: number, bots = 0, extra?: ExtraMoves, onState?: (s: GameState) => void, start?: { tier: TierId; cash: number }) {
  let s = createRun({ seed, hostId: 'tester', players: [], tier: 'stand', gear: true, settings: { bots, dayLengthSec: Number(process.env.DAY ?? 150), nightLengthSec: 4 } });
  // P6-6: start further along (e.g. the café tier with cash) so later systems get exercised.
  if (start) { s.tier = start.tier; s.cash = s.startingCash = start.cash; }
  addStandIns(s, humans);
  if (bots) syncBots(s);
  if (scenario) s.scenario = scenario;
  const ids = s.players.filter((p) => p.id.startsWith('sim-')).map((p) => p.id);
  let stage = 0;
  let last = s.phase;
  let lastSlotGear = '';
  let stuck = 0;
  const skip = new Set<string>();
  while (s.phase !== 'ended' && s.days.length < days) {
    if (s.phase === 'weekEnd') {
      // P4 B2: KEEP=1 plays on through a season (as the host pressing Keep going).
      if (extra) {
        // P4 B8: the real Keep going input (as the host pressing it), so season checkpoints run as in a game.
        s = step(s, [{ kind: 'weekEnd', playerId: s.hostId, choice: 'continue' }]);
        if (s.phase === 'weekEnd') break;
        continue;
      }
      if (!process.env.KEEP) break;
      beginSeason(s);
      s.unlimited = true;
      s.day += 1;
      s = startNight(s);
      continue;
    }
    if (s.phase === 'night' && last !== 'night') { stage = 0; stuck = 0; skip.clear(); }
    let inputs: PlayerInput[] = [];
    // P6-6: a run started further along asks the crew first each night (so the till isn't spent on gear first).
    if (extra && start && s.phase === 'night' && stage === 0) inputs = extra(s, ids);
    if (inputs.length === 0 && s.phase === 'night' && stage >= 0) {
      inputs = night(s, ids, stage, skip);
      const sg = JSON.stringify([s.slotGear, s.tier, s.gearVote]);
      if (stage !== 99 && inputs.length && sg === lastSlotGear && ++stuck > 2) {
        // The deal didn't go through (no free slot, a requirement, an open vote): skip it tonight.
        const want = inputs[0]!;
        if (want.kind === 'gear' && want.action === 'buy') skip.add(want.gear);
        else if (want.kind === 'grow') skip.add('grow');
        stuck = 0;
        delete s.gearVote;
      } else if (inputs.length === 0 || sg !== lastSlotGear) stuck = 0;
      lastSlotGear = sg;
      if (stage >= 0 && stage !== 99) stage = inputs.length === 0 ? 99 : stage + 1;
      else if (stage === 99) stage = -1;
    }
    if (extra && inputs.length === 0 && (s.phase === 'day' || (s.phase === 'night' && stage === -1))) inputs = extra(s, ids);
    if (process.env.DBG && s.phase === 'day' && last !== 'day') console.error('day', s.day, 'cash', s.cash, JSON.stringify(s.supplies), s.stations.map((x) => x.kind + ':' + x.gear).join(','), 'menu', JSON.stringify(Object.keys(s.menu).filter((k) => (s.menu as Record<string, boolean>)[k]).length));
    last = s.phase;
    // Stand-ins are bot-driven, and step() ignores inputs from bots; lift the flag on the night buyer for this one step.
    const buyer = inputs.length ? s.players.find((p) => p.id === ids[0]) : undefined;
    const bot = buyer?.bot;
    if (buyer) delete buyer.bot;
    s = step(s, inputs);
    if (buyer && bot) s.players.find((p) => p.id === ids[0])!.bot = bot;
  }
  onState?.(s);
  const d = s.days;
  const cups = d.reduce((a, x) => a + (x.cups ?? 0), 0);
  const stars = d.reduce((a, x) => a + (x.cupStars ?? 0), 0);
  return {
    humans, seed, area: gearArea(s), days: d.length, cash: r2(s.cash), bankrupt: s.bankrupt,
    served: d.reduce((a, x) => a + x.served, 0), lost: d.reduce((a, x) => a + x.lost, 0),
    stars: cups ? r2(stars / cups) : null, tier: s.tier, gear: (s.slotGear ?? []).filter(Boolean).join(' '),
    drinks: d.reduce((a, x) => { for (const [k, v] of Object.entries(x.drinks ?? {})) if (v) a[k] = (a[k] ?? 0) + v; return a; }, {} as Record<string, number>),
    botMistakes: d.reduce((a, x) => a + (x.botMistakes ?? 0), 0),
    cashByDay: d.map((x) => Math.round(x.sales + x.tips)),
    ...(s.season ? { season: s.season.weeks.map((w) => `w${w.week}:${Math.round(w.profit)}${w.target !== null ? '/' + w.target : ''}`).join(' ') } : {}),
  };
}

const isMain = process.argv[1]?.endsWith('gearBalance.ts');
if (isMain) {
  const days = Number(process.argv[2] ?? 7);
  const seeds = Number(process.argv[3] ?? 4);
  const scen: (ScenarioId | null)[] = [null, 'campusTown', 'rainyWeek', 'touristSeason'];
  for (const h of [1, 2, 4]) {
    for (let i = 0; i < seeds; i++) {
      const r = playGear(h, 100 + i, scen[i % scen.length]!, days);
      console.log(JSON.stringify(r));
    }
  }
}
