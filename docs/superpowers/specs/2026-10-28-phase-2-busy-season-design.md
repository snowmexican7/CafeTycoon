# Phase 2 "Busy season": gameplay design (simulation side)

**Date:** 2026-10-28 · **Owner:** Claude (sim, net, host, storage, bots, telemetry, tester)
**Status:** decided; built in slices, each merged to `main` when green. Kennedy asked for
decisions and iteration rather than questions, so every call below is mine unless it says
otherwise. Tweak by editing this doc and the numbers in `src/data/economy.ts`.

Companion docs: the brief and phase list in [`../../ROADMAP.md`](../../ROADMAP.md) (Phase 2),
ownership and Group B constraints in [`../../UI_OVERHAUL.md`](../../UI_OVERHAUL.md), the
mechanics snapshot in [`../../reference/2026-10-28-kitchen-mechanics.md`](../../reference/2026-10-28-kitchen-mechanics.md),
telemetry in the original design doc §13, and deferred items in [`../../BACKLOG.md`](../../BACKLOG.md).

## 1. Intent and why

A game night with one to three humans should feel like a full, busy café. Today the day is
"walk, E, walk, E" with every machine blocked until someone's hands are free, and a solo
player runs the whole shop. Phase 2 adds coworkers (scripted bots), a place to put drinks
down, a real menu switch, days that differ from each other, customers who differ from each
other, a recorded log of every run for the design-analysis agent, and a headless tester so
balance is tuned by simulation instead of by hand-playing.

## 2. Goals, non-goals, anti-goals

**Goals**
- Scripted bots fill empty stations and feel like decent, imperfect coworkers.
- Two humans plus one bot can finish a seven-day week; the bot is helpful, not perfect.
- Days vary (rush hour, health inspector, power flicker, influencer visit) and so do
  customers (regulars, impatient, groups).
- Drinks can be set down and picked up again; prep ahead is possible but bounded.
- The menu can be narrowed at night.
- Telemetry per the original design §13, downloadable as one file, no new accounts.
- A headless balance tester prints a summary for hundreds of simulated days.
- Everything stays deterministic from the seed, co-op stays in sync, CI stays green.

**Non-goals (this phase)**
- Syrups and a flavour picker. Deferred: see §4.
- Buying or placing new stations; starting with one machine. That is Phase 3's upgrade path.
- Any LLM or outside service. Phase 5.
- Any new screen or restyle. The UI agent owns visuals; this phase only adds data.

**Anti-goals**
- A bot that is better than a human, or one that makes the humans feel unneeded.
- A mechanic the player cannot see or infer. Where visuals lag behind data, the data goes
  into view models and the gap is listed in `BACKLOG.md` under "Needs UI".
- Breaking the renderer's type maps (`Record<StationKind, …>`): no new `StationKind`.
- Changing a field the renderer reads (`Customer.drink`, `Player.holding`, `Station.output`).

## 3. Constraints

- **Ownership.** Edit only `src/sim/**`, `src/net/**`, `src/host/**`, `src/storage/**`,
  `src/data/**`, `scripts/**`, tests, and docs. Additive-only changes to
  `src/ui/viewModels.ts` (new optional fields; never rename). Small hook-ins to `src/main.ts`
  outside the title wiring (telemetry collection, console API), each noted in `BACKLOG.md`.
  Never `src/ui/*` markup or styles, `src/render/*`, theme or fonts.
- **Determinism.** Every random decision, including bot decisions, draws from `state.rng`.
  The same seed and inputs produce the same week on every machine.
- **Co-op.** Bots run inside the host's simulation like any other state; peers see them in
  snapshots. New wire messages go through `src/net/protocol.ts`.
- **Saves.** `SNAPSHOT_VERSION` becomes 2 (state shape changes); older saves are discarded
  with the existing notice. `PROTOCOL_VERSION` becomes 2 so a stale peer tab gets the
  version-mismatch message instead of a broken snapshot.
- **Render-once-then-patch.** Anything that changes every tick is patched in place by the
  UI; new structural fields are listed for the UI agent, never rendered here.

## 4. Decisions on Kennedy's open ideas

| Idea | Decision | Why |
|---|---|---|
| "Can't put a coffee back down" | **The counter becomes a pass with 3 slots** (§5). E at the counter with an unwanted drink sets it down; E with empty hands serves from the pass or picks up. | Smallest change that fixes the stuck hand and enables batching. Needs no new station kind. |
| Prep area / pull two shots ahead / cold brews ready | Covered by the pass plus **stale timers** (§5): espresso 45 s, latte 60 s, cold brew all day. | Rewards prepping cold brew, bounds espresso batching. |
| Menu tweaking (drop espresso, one-drink café) | **A menu switch per drink at night** (§6) plus a `--menu` option in the balance tester, which answers "is one drink faster?" with numbers. | Cheap in the sim; the night-screen toggle is UI work listed for the UI agent. |
| Start with one machine; buy the rest | **Deferred to Phase 3** (stand → cart → café). | Station art is built once from `LAYOUT`; adding stations at runtime needs renderer work the UI agent is mid-rewrite on. |
| Syrup station with a flavour picker | **Deferred until Group B lands.** Design sketch in `BACKLOG.md`. | A picker needs the keyboard module, the HUD ticket and new station art, all UI-agent files being rewritten this week. The sim side alone would be invisible. |
| More to do than "walk, E" | Bots to coordinate with, a pass to manage, events to react to, groups and regulars to prioritise, and the menu to shape. | The variety comes from decisions, not more keys. |
| Auto-serve from the pass | **No.** A barista presses E at the counter to hand a pass drink over. | Keeps the player in the loop; a self-serve shelf is a natural Phase 3 card. |

## 5. The pass (counter slots) and stale drinks

- `GameState.pass: PassItem[]`, `PassItem = { item: DrinkId; ticksLeft: number }`, at most
  `ECONOMY.pass.slots = 3`.
- E at the counter **holding a drink**: if a customer wants it → serve as today. Else if the
  pass has room → the drink goes on the pass with `ticksLeft = staleSeconds[item] × 60`.
  Else → nothing (the player keeps it).
- E at the counter **holding nothing**: if any pass drink matches a waiting customer → serve
  that customer from the pass (the drink with the least `ticksLeft` among matches; the
  customer with the least patience among matches; normal price and tip). Else if the pass
  has a drink → pick up the one with the least `ticksLeft`. Else → nothing.
- `ECONOMY.pass.staleSeconds = { espresso: 45, latte: 60, coldBrew: 600 }`. Each tick
  decrements `ticksLeft`; at 0 the drink vanishes and `today.wasted += 1`.
- Grounds can never go on the pass (they are not a `DrinkId`).
- Day end clears the pass (nothing is counted as wasted then).
- Telemetry records `pass.put`, `pass.take`, `pass.serve`, `pass.stale`.

## 6. Menu switch

- `GameState.menu: Record<DrinkId, boolean>`, all `true` at run start.
- Input `{ kind: 'menu'; playerId; drink: DrinkId; on: boolean }`, accepted from any
  connected player during the **night only**. Turning off the last drink that is on is
  ignored (at least one stays on).
- Customers order only drinks that are on the menu **and** have supplies in stock
  (today's rule). The HUD's `menu` view-model list follows the same rule, so the chalkboard
  needs no change to hide a switched-off drink.
- Bots never make a drink that is off the menu.

## 7. Day events

- At `startDay` for day ≥ 2 the sim draws today's schedule from the rng: 0 events with
  probability 0.35, 1 with 0.45, 2 with 0.20; kinds drawn without repeat from
  `rushHour | powerFlicker | influencerVisit | healthInspector`; each starts at a uniform
  point between 15% and 75% of the day length. Day 1 has no events.
- `GameState.eventSchedule: { kind; startTick }[]` (today's, cleared at `startDay`) and
  `GameState.events: { kind; ticksLeft }[]` (active). `today.events: EventKind[]` records
  what happened for the receipt and telemetry.
- **rushHour** (30 s): traffic ×2.0, patience ×0.9 while active.
- **powerFlicker** (4 s): every station's `busyTicksLeft` stops counting down. Work resumes
  afterwards; nothing is lost.
- **influencerVisit**: spawns one customer of kind `influencer` (patience ×1.5, wants the
  drink with the highest `orderBias`, ties → latte) even if the queue is full (capacity +1
  for them). Served → `today.bonus += 10` (cash +10) and traffic ×1.3 for the rest of the
  day. Lost → nothing beyond the normal loss. The event is active until the influencer
  leaves.
- **healthInspector** (20 s): at the end, if `today.wasted ≥ 3` → `today.fines += 15`
  (cash −15) and `today.inspection = 'fail'`; else `today.inspection = 'pass'` and
  reputation +0.1 at day end (in addition to the normal ±0.2).
- Events affect modifiers through `computeModifiers` (traffic, patience) and stations
  through `stepStations` (the flicker). No event spawns new stations or changes the layout.
- HUD view model gains `events: { kind; label; secondsLeft }[]` (UI agent draws banners).

## 8. Customer variety

- `Customer.kind: 'normal' | 'impatient' | 'group' | 'regular' | 'influencer'`;
  `Customer.extra: DrinkId[]` (further drinks for a group; `drink` stays the current one so
  the renderer's order bubble keeps working); `Customer.name?: string` for regulars.
- Spawn mix from day 2: normal 0.65, impatient 0.15, group 0.12, regular 0.08. Day 1:
  normal 0.85, impatient 0.15. Influencers come only from the event.
- **impatient**: patience ×0.6, tip ×1.5.
- **group**: 2–3 drinks, each drawn from the menu; patience ×1.3; after each drink is
  served, `patienceLeft = min(patienceMax, patienceLeft + 0.3 × patienceMax)`; each drink
  pays normally. Serving matches the current `drink`; when `extra` is empty they leave.
- **regular**: up to `ECONOMY.regulars.max = 3` per run, stored in
  `GameState.regulars: { name; drink; visits; lost }[]`, created on first appearance with a
  name from a fixed list and a drink from the menu; same drink every visit; tip ×1.25.
  Losing one adds `today.lostRegulars += 1`, and lost regulars count twice in the
  reputation ratio at day end.
- Each served drink increments `today.drinks[drink]`.

## 9. Scripted station bots

**Representation.** A bot is a `Player` with `bot: BotState` set. It has `connected: true`,
a name from `['Bo', 'Lu', 'Mo']`, an id `bot-1..3`, and spawns at the spawn points after the
humans. Bots render as baristas with no renderer change (the name tag is the UI agent's tell).
`BotState = { personality: 'rookie' | 'steady' | 'veteran'; reactionTicksLeft: number;
yieldTicksLeft: number; plan: BotStep[]; claim: number | null; mistakes: number }`.

**Count.** `Settings.bots: number | 'auto'` (default `'auto'`) and `Settings.botSkill: 1..5`
(default 3). Auto = `max(0, 3 − connected humans)`, recomputed at run creation and at every
`startDay`, so a friend who joins mid-week replaces a bot the next morning. Bots never count
toward the night's ready check and never buy or restock.

**Movement.** Bots move with `moveDir` and `interactQueued` exactly like humans; the same
`applyMovement` and `interact` run for them. Pathfinding is A* over integer tile centres
`1 ≤ x ≤ 11, 1 ≤ y ≤ 7` (4-neighbour), a node being walkable when `blocked` says a barista
can stand there ignoring other players. A station's target node is the walkable node within
interact range (1.1) that is nearest the bot. Paths are recomputed when the next waypoint
is reached or after a yield.

**Yielding.** If another connected player is within 0.7 tiles of the bot's next waypoint,
the bot stops for `yieldTicksLeft = rng 18..60` (0.3–1 s), then re-plans. After three yields
toward the same target it picks the next-nearest target node. Humans never collide with
bots or each other.

**Decision loop.** Every `ECONOMY.bots.thinkTicks = 6` ticks a bot with an empty plan looks
for work, then waits `reactionTicksLeft` before the first step:
1. **Serve from the pass** if a waiting customer's drink is on the pass → plan: counter, E.
2. **Fill an order**: the oldest customer whose current `drink` is not covered. Covered means
   claimed by another bot's `claim`, held by any player, sitting in a station output, or on
   the pass. The bot sets `claim = customer.id` and plans the chain: espresso → grinder E,
   espresso E (insert), espresso E (take), counter E; latte adds steamer E (insert) and
   steamer E (take) before the counter; coldBrew → tap E, tap E (take), counter E. A chain
   step at a busy station waits (the bot stands there) rather than re-planning.
3. **Prep** when nothing is waiting and the personality preps: make a cold brew for the pass
   if the pass has room and holds fewer than 2 cold brews.
4. Otherwise idle at the nearest free floor node by the counter.
A claim is dropped when the customer leaves or is served by someone else. A drink that is
off the menu or out of stock is never attempted.

**Reaction delay.** Before acting on a new plan the bot waits `rng 30..120` ticks
(0.5–2 s) × personality reaction × skill reaction × pressure reaction.

**Mistakes.** When a bot takes a *drink* out of a station, roll
`p = personality.mistake × skill.mistake × pressure.mistake`. On a mistake the bot "notices"
after `rng 48..120` ticks, walks to the trash, discards, and restarts that order's chain
from the grinder or tap (supplies are consumed again). `bot.mistakes`, `today.botMistakes`
and telemetry `bot.mistake` all count it.

**Personalities** (`ECONOMY.bots.personalities`):

| personality | speed | reaction | mistake | preps |
|---|---|---|---|---|
| rookie | 1.10 | 0.8 | 0.12 | no |
| steady | 1.00 | 1.0 | 0.06 | yes |
| veteran | 0.90 | 1.3 | 0.02 | yes |

Bot 1 is steady, bot 2 rookie, bot 3 veteran. Speed multiplies the bot's own move speed.

**Pressure.** While `customers.length ≥ 4` or rushHour is active: mistake ×1.5, reaction ×0.8.

**Skill dial** (`ECONOMY.bots.skill[1..5]`): reaction `[1.6, 1.3, 1.0, 0.8, 0.6]`,
mistake `[2.0, 1.5, 1.0, 0.7, 0.4]`, speed `[0.85, 0.92, 1.0, 1.05, 1.10]`.

**Night.** Bots stand still, keep their claim empty, and are excluded from `ready`.

## 10. Telemetry

- `src/host/telemetry.ts`: `createTelemetry(meta)` with `record(kind, data, tick?)`,
  `snapshot(state)`, `summary(state)`, `toNdjson()`, `rows()`, `download(filename?)`. The
  first row is the meta row (seed, scenario, host, players, build date, protocol version).
- Recorded by the host for solo and hosted runs: every validated `PlayerInput`; a snapshot
  row at each phase boundary; `peer.join` / `peer.leave`; `frame.long` when a frame exceeds
  250 ms; `input.mash` when the same player sends ≥ 4 interacts within one second; sim
  events surfaced in snapshots (pass use, bot mistakes, day events, inspections); and a
  `summary` row at run end.
- Peers batch UI events every 2 s and send them with a new room action `tele`
  (`{ token, events: { kind; data; at }[] }`); `HostRoom` forwards them to the collector.
  The UI agent gets `telemetry.ui(kind, data)` to call from overlays (night hovers, cards
  opened but not bought); until then the hook exists and records nothing.
- Idle time: `Player.idleTicks` counts ticks with a zero `moveDir` and no interact; the
  summary reports it per player.
- Summary fields: per day `DayStats`; per drink counts; cards offered vs bought per night;
  idle ticks per player; bot mistakes per bot; events per day; pass puts/takes/stale.
- Access: `window.cafetycoon.telemetry.download()` and `.rows()` in the console, plus
  `downloadTelemetry()` and `telemetryRows` in the host session for the UI agent to wire to
  a button on the pause and week-end screens (listed under Needs UI). The log lives in
  memory for the run; nothing is uploaded anywhere.

## 11. Headless balance tester

- `scripts/balance.ts`, run with `npm run balance -- [options]` through `tsx` (dev
  dependency). Options: `--weeks N` (default 10), `--seed S`, `--bots 0..3` (default 3),
  `--skill 1..5`, `--pace 1..5`, `--scenario id|random`, `--menu all|espresso|latte|coldBrew`
  or a comma list, `--compare menus` (runs the four menus on the same seeds), `--json`.
- Night policy: restock to targets (beans 40, milk 20, concentrate 30) when affordable; buy
  the cheapest affordable permanent card when cash exceeds twice its cost; otherwise nothing.
- Output per day: cash, served, lost, turned away, wasted, bot mistakes, events; totals and
  a per-drink table; with `--compare`, one row per menu with mean final cash and loss rate.
- Deterministic: the same options and seed print the same numbers. One test runs a single
  short week through the tester entry point.

## 12. Data additions (`src/data/economy.ts`)

`pass: { slots: 3, staleSeconds: { espresso: 45, latte: 60, coldBrew: 600 } }`,
`events: { scheduleWeights: [0.35, 0.45, 0.20], windowStart: 0.15, windowEnd: 0.75, rushHour: { seconds: 30, traffic: 2.0, patience: 0.9 }, powerFlicker: { seconds: 4 }, influencer: { patience: 1.5, bonus: 10, trafficAfter: 1.3 }, inspector: { seconds: 20, wastedLimit: 3, fine: 15, reputationBonus: 0.1 } }`,
`customers: { mixDay1: { normal: 0.85, impatient: 0.15 }, mix: { normal: 0.65, impatient: 0.15, group: 0.12, regular: 0.08 }, impatient: { patience: 0.6, tip: 1.5 }, group: { min: 2, max: 3, patience: 1.3, refill: 0.3 }, regular: { tip: 1.25, max: 3, lostWeight: 2 } }`,
`bots: { thinkTicks: 6, reactionTicks: [30, 120], noticeTicks: [48, 120], yieldTicks: [18, 60], yieldRadius: 0.7, pressureQueue: 4, pressure: { mistake: 1.5, reaction: 0.8 }, personalities: {…}, skill: {…}, names: ['Bo', 'Lu', 'Mo'] }`.

## 13. Hand-off to the UI side

Data lands in view models or state; visuals are the UI agent's. Each item below is also a
"Needs UI" line in `BACKLOG.md` when it ships.
- Pass contents on the counter and in the HUD (`HudVM.pass: { item; secondsLeft }[]`).
- Menu toggles on the night screen (`NightVM.menu: { drink; on }[]`, input `menu`).
- Event banners (`HudVM.events`), inspection result and influencer outcome toasts.
- Customer kind tells (`Customer.kind`, `Customer.name`, `Customer.extra.length`).
- Bot tells (`Player.bot` present → name tag "(bot)", personality).
- Receipt fields: `wasted`, `fines`, `bonus`, `inspection`, `events`, `botMistakes`,
  `lostRegulars`, per-drink counts.
- Telemetry download button on pause and week-end screens; `telemetry.ui(kind, data)` calls
  from the night screen.
- Title or pause settings for `bots` and `botSkill`.

## 14. Order of delivery and release rules

Each slice is its own branch of one or more tasks, reviewed, merged to `main` when tests
and the build are green, and pushed. The live site stays playable throughout.
1. Pass and stale drinks. 2. Menu switch. 3. Day events. 4. Customer variety. 5. Bots:
players, pathfinding, decision loop. 6. Bots: reaction, mistakes, personalities, pressure,
skill dial, yielding. 7. Telemetry. 8. Balance tester, first numbers, one tuning pass.
9. Docs: README "try it" notes, `BACKLOG.md` Needs UI list, `roadmap.json` goal states.

## 15. Left to the builder

File and function names inside the owned folders; A* implementation details; the exact
regulars' name list; test fixtures; how the tester formats its tables.

## 16. Calls Kennedy may want to reverse

- Solo runs now get two bots, so solo scores are not comparable with Phase 1 history.
- Stale espresso vanishes rather than being servable at a penalty.
- The health inspector judges wasted drinks, the only "mess" the sim has.
- Lost regulars count double toward reputation.
- No auto-serve from the pass.
- Syrups wait for Group B.
