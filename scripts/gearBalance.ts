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
import { GEAR_PATH, PATH_WAND, planNight, wandFirst } from '../src/sim/bots/planner';
import { ECONOMY } from '../src/data/economy';
import { GEAR, WANDS } from '../src/data/gear';
import { fridgeWanted } from '../src/sim/fridge';
import { TIERS, nextTier } from '../src/sim/growth';
import { gearArea, wandCards } from '../src/sim/gear';
import type { GameState, PlayerInput, ScenarioId, SupplyId, TierId } from '../src/sim/types';
// Node globals, typed locally so src tests can import this file without @types/node.
declare const process: { env: Record<string, string | undefined>; argv: string[]; exit(code?: number): never };

// FB2 C9: the planner's path (milk waits for E3 and its wand, so E3 comes with the little wand and E4 with the proper one).
const PATH = GEAR_PATH;
const RESERVE = 45;
/** FB2 A4: what the crew keeps back when buying the $20 Dorm Room Cube (milk drinks need it). */
const CUBE_RESERVE = 25;
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
    // Batch coffee / condiments: the stand-ins have no human to steep or buy boxes, so take the planner's advice for both.
    // FB2 balance: the steep is asked of the shop as it will be after the crew's own restock (the planner sizes it from
    // the concentrate in stock plus what its own budget would buy, and on a tight night that said "steep 0").
    const restocked: GameState = JSON.parse(JSON.stringify(state));
    for (const r of out) if (r.kind === 'restock') restocked.supplies[r.supply] = (restocked.supplies[r.supply] ?? 0) + r.packs * ECONOMY.packs[r.supply].size;
    restocked.cash = cash;
    for (const a of planNight(state)) if (a.id === 'condimentBox' && a.input.kind === 'condimentBox') out.push({ ...a.input, playerId: by });
    for (const a of planNight(restocked)) if (a.id === 'steep' && a.input.kind === 'steep') out.push({ ...a.input, playerId: by });
    return out;
  }
  const nt = nextTier(state);
  if (nt && !skip.has('grow') && !wandFirst(state, nt) && state.day >= 3 && state.cash > TIERS[nt].cost + 60) return [{ kind: 'grow', playerId: by, tier: nt }];
  // FB2 A4: a fridge card when one is worth it (the cube as soon as a milk drink is on the board: lattes need it, so it
  // only keeps a small reserve for the night's restock; the Udder-Matic keeps the full reserve).
  const fridge = fridgeWanted(state, expectedUse(state).milk);
  if (fridge && !skip.has(fridge.id) && state.cash - fridge.price >= (fridge.id === 'f1' ? CUBE_RESERVE : RESERVE)) {
    return [{ kind: 'fridge', playerId: by, fridge: fridge.id }];
  }
  // FB2 C9: a machine that takes a wand and has none (or E4's little one) gets it first, as the planner advises.
  const card = wandCards(state).find((c) => !c.upgrade) ?? wandCards(state).find((c) => c.upgrade && c.wand === PATH_WAND[c.gear]);
  if (card && !skip.has(`wand:${card.station}`)) return state.cash - card.price >= RESERVE ? [{ kind: 'wand', playerId: by, station: card.station, wand: card.wand }] : [];
  const owned = new Set(state.slotGear ?? []);
  for (const id of PATH) {
    if (owned.has(id) || skip.has(id)) continue;
    const g = GEAR[id];
    // Past the pod machine an espresso machine needs a grinder: don't trade the pods away before one is in.
    if (g.tree === 'espresso' && g.tier >= 2 && !state.stations.some((x) => x.kind === 'grinder')) continue;
    const better = (state.slotGear ?? []).some((o) => o && GEAR[o].tree === g.tree && GEAR[o].tier >= g.tier);
    if (better) continue;
    const trade = (state.slotGear ?? []).reduce((t, o, i) => {
      const w = state.slotWand?.[i];
      return o && GEAR[o].tree === g.tree ? Math.max(t, GEAR[o].sell + (w ? WANDS[w].sell : 0)) : t;
    }, 0);
    const wand = PATH_WAND[id];
    if (state.cash + trade - g.price - (wand ? WANDS[wand].withMachine : 0) < RESERVE) return [];
    return [{ kind: 'gear', playerId: by, action: 'buy', gear: id, ...(wand ? { wand } : {}) }];
  }
  return [];
}

/** P4 B8: an optional extra crew move, asked when the scripted night has nothing left to do (and each day tick). */
export type ExtraMoves = (state: GameState, ids: string[]) => PlayerInput[];

export function playGear(humans: number, seed: number, scenario: ScenarioId | null, days: number, bots = 0, extra?: ExtraMoves, onState?: (s: GameState) => void, start?: { tier: TierId; cash: number }) {
  let s = createRun({ seed, hostId: 'tester', players: [], tier: start?.tier ?? 'stand', gear: true, settings: { bots, dayLengthSec: Number(process.env.DAY ?? 150), nightLengthSec: 4 } });
  // P6-6: start further along (e.g. the café tier with cash) so later systems get exercised. createRun builds the tier's floor.
  if (start) s.cash = s.startingCash = start.cash;
  addStandIns(s, humans);
  if (bots) syncBots(s);
  if (scenario) s.scenario = scenario;
  const ids = s.players.filter((p) => p.id.startsWith('sim-')).map((p) => p.id);
  let stage = 0;
  let last = s.phase;
  let lastSlotGear = '';
  let stuck = 0;
  const skip = new Set<string>();
  // FB2 A3: the floor meter while the doors are open (time-weighted mean, and the lowest it got).
  let floorSum = 0;
  let floorTicks = 0;
  let floorMin = 100;
  let messTicks = 0;
  const floorEnd: number[] = [];
  while (s.phase !== 'ended' && s.days.length < days) {
    if (s.phase === 'day') {
      floorSum += s.cleanliness;
      floorTicks += 1;
      floorMin = Math.min(floorMin, s.cleanliness);
      if (s.messes.length > 0) messTicks += 1;
      if (s.phaseTicksLeft === 1) floorEnd.push(s.cleanliness); // the meter as the doors lock
    }
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
      const sg = JSON.stringify([s.slotGear, s.slotWand, s.tier, s.gearVote, s.fridge]);
      if (stage !== 99 && inputs.length && sg === lastSlotGear && ++stuck > 2) {
        // The deal didn't go through (no free slot, a requirement, an open vote): skip it tonight.
        const want = inputs[0]!;
        if (want.kind === 'gear' && want.action === 'buy') skip.add(want.gear);
        else if (want.kind === 'grow') skip.add('grow');
        else if (want.kind === 'fridge') skip.add(want.fridge);
        else if (want.kind === 'wand') skip.add(`wand:${want.station}`);
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
    stars: cups ? r2(stars / cups) : null, tier: s.tier ?? 'cafe', gear: (s.slotGear ?? []).filter(Boolean).join(' '),
    drinks: d.reduce((a, x) => { for (const [k, v] of Object.entries(x.drinks ?? {})) if (v) a[k] = (a[k] ?? 0) + v; return a; }, {} as Record<string, number>),
    botMistakes: d.reduce((a, x) => a + (x.botMistakes ?? 0), 0),
    black: d.reduce((a, x) => a + (x.blackCoffees ?? 0), 0),
    floor: floorTicks ? Math.round((floorSum / floorTicks) * 10) / 10 : null,
    floorMin: Math.round(floorMin),
    messy: floorTicks ? Math.round((messTicks / floorTicks) * 100) : null,
    floorEnd: floorEnd.length ? Math.round(floorEnd.reduce((a, x) => a + x, 0) / floorEnd.length) : null,
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
