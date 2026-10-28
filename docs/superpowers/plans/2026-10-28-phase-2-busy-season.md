# Phase 2 "Busy season" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A game night with one to three humans feels like a full café: a pass to set drinks down, a night menu switch, day events, varied customers, scripted bots that fill empty stations, a host-recorded telemetry log, and a headless balance tester.

**Architecture:** Everything gameplay lives in the pure, deterministic sim (`src/sim/**`, numbers in `src/data/economy.ts`); bots are `Player`s with a `bot` field, stepped by `stepBots` inside `stepDay` before `applyMovement`, so they drive the same `moveDir`/`interactQueued` path as humans and draw only from `state.rng`. The sim appends notable happenings to a short-lived `state.log` that rides in snapshots; the host-side telemetry collector (`src/host/telemetry.ts`) wraps the local `Transport`, records validated inputs, phase-boundary snapshots and log entries, and peers send UI events with a new `tele` room action. The balance tester is a Node-free core (`scripts/balanceCore.ts`) driven by a thin `tsx` CLI.

**Tech Stack:** TypeScript 5.9, Vite 8, Vitest 5 (tests next to sources, `createRun` fixtures), `tsx` (new dev dependency, exact pin) for the tester.

**Spec:** `docs/superpowers/specs/2026-10-28-phase-2-busy-season-design.md` (binding, including the 2026-10-28 builder-check rulings in §§5, 7, 8, 9, 11, 16). Mechanics today: `docs/reference/2026-10-28-kitchen-mechanics.md`. Telemetry: `docs/superpowers/specs/2026-10-28-cafetycoon-design.md` §13. Ownership: `docs/UI_OVERHAUL.md` "Group B constraints" and "Ownership".

## Global Constraints

- Edit only `src/sim/**`, `src/data/**`, `src/net/**`, `src/host/**`, `src/storage/**`, `scripts/**`, tests, docs, `public/roadmap.json` (slice 9 goal states only), `package.json`/`package-lock.json` (the `tsx` dev dependency and the `balance` script only).
- `src/ui/viewModels.ts`: additive only (new optional fields, new functions; never rename or remove). `src/ui/viewModels.test.ts` and `src/ui/live.test.ts` are not ours and must stay green and type-check unchanged.
- Never touch any other `src/ui/*` file, `src/render/*`, theme, fonts, `index.html`, `style.css`, `vite.config.ts`, `tsconfig.json`.
- `src/main.ts`: only the telemetry hook-ins listed in Task 16, never the title wiring.
- No new `StationKind`. Never change the meaning of `Customer.drink`, `Player.holding`, `Station.output`, `Player.pos`, `Player.connected`.
- Every random draw goes through `rngNext`/`rngInt` on `state.rng`. Same seed and inputs → identical state on every machine.
- No LLM/AI calls, no network service, no player-to-player collision.
- New fields on types that `src/ui`/`src/render` tests build as literals (`Customer`, `DayStats`) are **optional**; sim code always sets them.
- `SNAPSHOT_VERSION = 2` and `PROTOCOL_VERSION = 2` from Task 1 on.
- Every task ends with `npm test` and `npm run build` green (build runs `tsc --noEmit`; check its exit code).
- One branch per slice (`phase2-s1-pass` … `phase2-s9-docs`), merged to `main` and pushed at the slice's last task when green.
- Commit messages: `feat(sim): …`, `feat(net): …`, `feat(host): …`, `test: …`, `docs: …`, `chore: …`, each ending with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

Failure modes a player will meet that the spec implies but no feature test exercises. Each line's test is in the named task, marked `// Review Focus N`.

1. A bot's customer walks out (or a human serves them) while the bot is mid-chain: the bot drops the claim, puts the drink on the pass or bins it, and goes back to work; it never stands frozen holding a drink (Task 10).
2. A station blocked by someone else's forgotten output (grounds left in the grinder, a shot left in the machine): the bot takes it if it fits its chain, otherwise gives up after `maxWaitTicks` and re-plans; never waits forever (Task 10).
3. A peer joins with token `bot-1`, or sends `move`/`leave`/`ready`/`menu` naming a bot id: ignored; bots cannot be hijacked or disconnected from outside (Task 8).
4. The host resumes a saved run that has bots: bots stay connected (not "away"), the night ready check still opens the doors when every human is ready, and the bot count is corrected next morning (Task 8).
5. The day ends while an inspector visit or influencer is still active and drinks sit on the pass: the inspection resolves at `finishDay`, the pass is cleared without counting waste, active events are cleared, and the next day starts clean (Task 5).

---

## File structure

```
src/data/economy.ts            + pass, events, customers, bots blocks (spec §12, wastedLimit 4) + bots.maxWaitTicks
src/sim/types.ts               new types and fields (Task 1 table)
src/sim/log.ts        (new)    emitLog(state, kind, data), pruneLog(state); SimEvent kinds
src/sim/tally.ts      (new)    tally(today, key, by?) for optional DayStats counters
src/sim/pass.ts       (new)    counterInteract, stepPass
src/sim/menu.ts       (new)    applyMenuInput
src/sim/events.ts     (new)    scheduleEvents, stepEvents, judgeInspection, eventActive
src/sim/customers.ts           kinds, groups, regulars, serveCustomer, loseCustomer; availableDrinks honours menu
src/sim/bots/roster.ts (new)   syncBots, isBot, isBotId, botSpeed, makeBotState, addStandIns, resetBotsForNight
src/sim/bots/path.ts   (new)   isWalkable, nodeOf, findPath, targetNodes, idleNode
src/sim/bots/brain.ts  (new)   stepBots, think, coverage, chainFor, afterBotInteract
src/sim/{run,step,stations,closing,night,effects,movement,validate,score}.ts   hook-ins (per task)
src/net/protocol.ts            PROTOCOL_VERSION 2, 'tele' action, TeleMsg, parseTele
src/net/hostRoom.ts            optional hooks.onTele
src/net/peerSession.ts         sendTele(events)
src/net/hostResume.ts          skip bots
src/storage/snapshotStore.ts   SNAPSHOT_VERSION 2
src/host/telemetry.ts  (new)   createTelemetry, withTelemetry, createUiBuffer, uiTelemetry, setUiTelemetrySink
src/ui/viewModels.ts           optional HudVM.pass/events, NightVM.menu, receiptViewModel, ready list without bots, hudStructureKey ignores per-tick seconds
src/main.ts                    Task 16 hook-ins only
scripts/balanceCore.ts (new)   parseArgs, runWeek, runBalance, formatReport, main(argv) — no Node APIs
scripts/balance.ts     (new)   CLI wrapper (process.argv, exit codes)
src/balance.test.ts    (new)   one short week through main()
src/sim/viewModels2.test.ts (new)  phase-2 view-model tests (kept out of src/ui)
```

Order inside `stepDay(s, doorsOpen)` once all slices land (each task adds its line in this position):

1. `stepEvents(s, doorsOpen)` (Task 4) 2. `const m = computeModifiers(s)` 3. `stepBots(s, m)` (Task 10) 4. `applyMovement(s, m.moveSpeed)` 5. for each player with `interactQueued`: remember `held = p.holding`, `interact(s, p.id)`, then `afterBotInteract(s, p, held)` for bots (Task 12) 6. idle tally: each connected player with zero `moveDir` and no queued interact gets `idleTicks += 1` (Task 1) 7. clear `interactQueued` 8. `stepStations(s)` 9. `stepPass(s)` (Task 2) 10. `if (doorsOpen) spawnCustomers(s)` 11. `stepCustomers(s)` 12. phase timer as today.

`step()` additionally calls `pruneLog(s)` right after `s.tick += 1`.

`startDay` order: phase/timer → `state.customers = []` → `state.pass = []` → `state.events = []` → `state.eventSchedule = []` → `state.today = freshDayStats(day)` → `syncBots(state)` (Task 8) → `scheduleEvents(state)` (Task 4) → `morningNotes`.

`finishDay` order: `judgeInspection` if an inspector is still active (Task 5) → lose the queue via `loseCustomer` (Task 6) → clear stations, hands, `pass`, `events` → `resetBotsForNight` (Task 8) → rent → reputation (weighted ratio Task 7, inspection bonus Task 5) → push day → rest as today.

---

## Slice 1: the pass and stale drinks (branch `phase2-s1-pass`)

### Task 1: GameState v2 shape, sim log, version bumps

This is the first task that changes the shape of `GameState`, so it bumps `SNAPSHOT_VERSION` to 2 (a v1 save would load without `pass`, `menu`, `log` and crash the worker; the store discards it with the existing notice) and `PROTOCOL_VERSION` to 2 (a stale peer tab would otherwise accept v2 snapshots and break; now it gets the version-mismatch message).

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/run.ts`, `src/sim/step.ts`, `src/data/economy.ts`, `src/storage/snapshotStore.ts:7`, `src/net/protocol.ts:6`
- Create: `src/sim/log.ts`, `src/sim/tally.ts`
- Test: `src/sim/run.test.ts`, `src/sim/log.test.ts`, `src/net/hostRoom.test.ts`, `src/net/peerSession.test.ts`, `src/net/protocol.test.ts`, `src/sim/step.test.ts`, `src/storage/stores.test.ts`

**Interfaces:**
- Produces (`types.ts`, all added in this task even if used later, so the version bumps once):

```ts
export type EventKind = 'rushHour' | 'powerFlicker' | 'influencerVisit' | 'healthInspector';
export type CustomerKind = 'normal' | 'impatient' | 'group' | 'regular' | 'influencer';
export type Personality = 'rookie' | 'steady' | 'veteran' | 'human';   // 'human' = tester stand-in
export type BotSkill = 1 | 2 | 3 | 4 | 5;
export type BotAction = 'insert' | 'take' | 'serve' | 'put' | 'trash';
export type BotStep = { kind: 'use'; station: string; action: BotAction } | { kind: 'idle'; node: Vec2 };
export interface PassItem { item: DrinkId; ticksLeft: number }
export interface ScheduledEvent { kind: EventKind; startTick: number }          // absolute state.tick
export interface ActiveEvent { kind: EventKind; ticksLeft: number; customerId?: number }
export interface Regular { name: string; drink: DrinkId; visits: number; lost: number }
export interface BotState {
  personality: Personality; reactionTicksLeft: number; yieldTicksLeft: number; plan: BotStep[];
  claim: number | null; mistakes: number;
  claimDrink: DrinkId | null; thinkTicksLeft: number; path: Vec2[]; yields: number;
  nodeRank: number; waitTicks: number; noticeTicksLeft: number;
}
export type SimEventKind = 'pass.put' | 'pass.take' | 'pass.serve' | 'pass.stale' | 'trash'
  | 'bot.mistake' | 'event.start' | 'event.end' | 'inspection' | 'influencer';
export interface SimEvent { seq: number; tick: number; kind: SimEventKind; data: Record<string, string | number | boolean> }
// Player   += bot?: BotState; idleTicks: number
// Customer += kind?: CustomerKind (absent = 'normal'); extra?: DrinkId[]; name?: string
// Settings += bots: number | 'auto'; botSkill: BotSkill
// DayStats += wasted?, fines?, bonus?, botMistakes?, lostRegulars?: number;
//             inspection?: 'pass' | 'fail' | null; events?: EventKind[];
//             drinks?: Record<DrinkId, number>; influencer?: 'served' | 'lost' | null
// GameState += pass: PassItem[]; menu: Record<DrinkId, boolean>; eventSchedule: ScheduledEvent[];
//              events: ActiveEvent[]; regulars: Regular[]; log: SimEvent[]; nextLogSeq: number
// PlayerInput += { kind: 'menu'; playerId: PlayerId; drink: DrinkId; on: boolean }   (handled in Task 3)
```

- Produces (`log.ts`): `LOG_KEEP_TICKS = 120`; `emitLog(state: GameState, kind: SimEventKind, data?: SimEvent['data']): void` (pushes `{ seq: state.nextLogSeq++, tick: state.tick, kind, data: data ?? {} }`); `pruneLog(state: GameState): void` (drops entries with `state.tick - e.tick > LOG_KEEP_TICKS`).
- Produces (`tally.ts`): `type TallyKey = 'wasted' | 'fines' | 'bonus' | 'botMistakes' | 'lostRegulars'`; `tally(today: DayStats, key: TallyKey, by = 1): void`; `tallyDrink(today: DayStats, drink: DrinkId): void`.
- Produces (`run.ts`): `freshDayStats(day)` (now exported) returns all new counters at 0, `inspection: null`, `events: []`, `drinks: { espresso: 0, latte: 0, coldBrew: 0 }`, `influencer: null`. `createRun` sets `settings.bots = 'auto'`, `settings.botSkill = 3`, `pass: []`, `menu: { espresso: true, latte: true, coldBrew: true }`, `eventSchedule: []`, `events: []`, `regulars: []`, `log: []`, `nextLogSeq: 1`, each player `idleTicks: 0`. `step.ts` `join` sets `idleTicks: 0`.
- Produces (`economy.ts`): the spec §12 blocks verbatim with `inspector.wastedLimit: 4`, plus `regulars.names: ['Ada', 'Ravi', 'June']` inside `customers.regular`, and `bots.maxWaitTicks: 600`, `bots.arriveRadius: 0.08`. `bots.personalities` includes `human: { speed: 1, reaction: 0, mistake: 0, preps: true }`. Skill arrays indexed `skill - 1`.

- [ ] **Step 1: Write the failing tests**

In `run.test.ts`, update `'starts on the first night with spec values'`: `expect(s.settings).toEqual({ dayLengthSec: 150, nightLengthSec: 60, pace: 3, bots: 'auto', botSkill: 3 })` and add:

```ts
it('starts phase 2 state empty', () => {
  const s = createRun(opts);
  expect(s.pass).toEqual([]);
  expect(s.menu).toEqual({ espresso: true, latte: true, coldBrew: true });
  expect([s.eventSchedule, s.events, s.regulars, s.log]).toEqual([[], [], [], []]);
  expect(s.today).toMatchObject({ wasted: 0, fines: 0, bonus: 0, botMistakes: 0, lostRegulars: 0, inspection: null, events: [], drinks: { espresso: 0, latte: 0, coldBrew: 0 } });
  expect(s.players.every((p) => p.idleTicks === 0 && p.bot === undefined)).toBe(true);
});
```

`log.test.ts`: `'emits with increasing seq and prunes after 120 ticks'` — emit two entries at tick 5, assert seqs `[1, 2]`; set `tick = 125`, `pruneLog` keeps both; `tick = 126` drops both.

`step.test.ts`: `'counts idle ticks for still players'` — after doors open, step 60 ticks with p1 moving `{x:1,y:0}`: `p1.idleTicks === 0`, `p2.idleTicks === 60`.

Net/storage: in `hostRoom.test.ts` and `peerSession.test.ts`, replace the literal `protocol: 1`/`protocol = 1` defaults and expectations with `PROTOCOL_VERSION`, and change `'rejects a different protocol version'` to send `1` (the old build) instead of `2`; add to `protocol.test.ts` `expect(PROTOCOL_VERSION).toBe(2)`; add to `stores.test.ts` `expect(SNAPSHOT_VERSION).toBe(2)`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim src/net src/storage`
Expected: FAIL, e.g. `expected 1 to be 2` and `expected undefined to deeply equal []`.

- [ ] **Step 3: Implement the types, defaults, log, tally, idle tally and the two constants**

Idle tally goes in `stepDay` at position 6 of the order above.

- [ ] **Step 4: Run all tests and the build**

Run: `npm test && npm run build`
Expected: PASS, build exit code 0 (`src/ui/live.test.ts` still type-checks because `Customer.kind`/`extra` are optional).

- [ ] **Step 5: Commit**

```bash
git checkout -b phase2-s1-pass
git add src/sim src/data/economy.ts src/net src/storage
git commit -m "feat(sim): phase 2 state shape, sim log, snapshot and protocol v2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: Pass, stale drinks and trash waste

**Files:**
- Create: `src/sim/pass.ts`, `src/sim/pass.test.ts`, `src/sim/viewModels2.test.ts`
- Modify: `src/sim/stations.ts` (counter → `counterInteract`; trash counts waste), `src/sim/customers.ts` (extract `serveCustomer`), `src/sim/step.ts`, `src/sim/closing.ts`, `src/ui/viewModels.ts`, `src/sim/customers.test.ts`

**Interfaces:**
- Consumes: `emitLog`, `tally`, `tallyDrink`, `ECONOMY.pass`.
- Produces: `counterInteract(state: GameState, playerId: PlayerId): GameState`; `stepPass(state: GameState): GameState`; `serveCustomer(state: GameState, customer: Customer, drink: DrinkId): void` (price, tip, cash, `served += 1`, `tallyDrink`, removes the customer; Task 6 extends it); `serveDrink` keeps its signature and calls `serveCustomer`. `HudVM.pass?: { item: DrinkId; secondsLeft: number }[]` (`secondsLeft = Math.ceil(ticksLeft / 60)`).

Rules (spec §5): holding a drink → serve if any customer's `drink` matches; else if `pass.length < 3` push `{ item, ticksLeft: staleSeconds[item] * 60 }`, `emitLog('pass.put', { item, by: playerId })`; else nothing. Holding nothing → among customers whose `drink` is on the pass pick the least `patienceLeft` (ties: queue order), serve with the matching pass item with least `ticksLeft` (`pass.serve`); else if pass non-empty pick up the least-`ticksLeft` item (`pass.take`); else nothing. Holding grounds → nothing. `stepPass` decrements; at 0 removes, `tally(today, 'wasted')`, `pass.stale`. Trash: if `holding` is a `DrinkId` then `tally(today, 'wasted')` and `emitLog('trash', { item, by })`. `finishDay` sets `state.pass = []` without waste.

`hudStructureKey` (additive behaviour fix, Group B rule "per-tick values are patched"): strip `secondsLeft` from `pass` (and later `events`) before stringifying, so a ticking pass never rebuilds the HUD.

- [ ] **Step 1: Write the failing tests** (`pass.test.ts`, fixture: `createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } })`, `startDay`, p1 at `{ x: 6, y: 5 }`)

```ts
it('puts an unwanted drink on the pass with its stale timer', () => {
  p.holding = 'espresso'; counterInteract(s, 'p1');
  expect(s.pass).toEqual([{ item: 'espresso', ticksLeft: 2700 }]);
  expect(p.holding).toBeNull();
  expect(s.log.at(-1)).toMatchObject({ kind: 'pass.put', data: { item: 'espresso' } });
});
it('keeps the drink when the pass is full', () => { /* 3 items on pass, holding latte → still latte, pass length 3 */ });
it('serves the most impatient matching customer from the pass, oldest pass item first', () => {
  s.pass = [{ item: 'latte', ticksLeft: 900 }, { item: 'latte', ticksLeft: 100 }];
  s.customers = [{ id: 1, drink: 'latte', patienceLeft: 500, patienceMax: 1500 }, { id: 2, drink: 'latte', patienceLeft: 200, patienceMax: 1500 }];
  counterInteract(s, 'p1');
  expect(s.customers.map((c) => c.id)).toEqual([1]);
  expect(s.pass).toEqual([{ item: 'latte', ticksLeft: 900 }]);
  expect(s.today.served).toBe(1); expect(s.today.drinks!.latte).toBe(1);
});
it('picks up the stalest pass drink when nobody wants one', () => { /* pass [coldBrew 3000, espresso 50], no customers → holding 'espresso' */ });
it('grounds never go on the pass', () => { /* holding grounds → pass [] and still grounds */ });
it('stale drinks vanish and count as waste; day end clears without waste', () => {
  s.pass = [{ item: 'espresso', ticksLeft: 1 }]; stepPass(s);
  expect(s.pass).toEqual([]); expect(s.today.wasted).toBe(1);
  s.pass = [{ item: 'coldBrew', ticksLeft: 999 }]; s.phase = 'closing'; s.phaseTicksLeft = 1; s = step(s, []);
  expect(s.pass).toEqual([]); expect(s.days.at(-1)!.wasted).toBe(1);
});
it('binning a drink counts as waste, binning grounds does not', () => { /* at trash (10,2): latte → wasted 1; grounds → still 1 */ });
```

In `customers.test.ts`, the case that expects an unwanted cold brew to stay in the player's hand (around its lines 66–68) changes: the drink now goes onto `state.pass` and `holding` becomes `null`.

`viewModels2.test.ts`: `'hud lists the pass and keys it without seconds'` — pass `[{ item: 'latte', ticksLeft: 125 }]` → `hudViewModel(s).pass` equals `[{ item: 'latte', secondsLeft: 3 }]`; key unchanged after `ticksLeft = 60`; changed after pushing a second item.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/pass.test.ts src/sim/viewModels2.test.ts`
Expected: FAIL with `counterInteract is not a function` / `Cannot find module './pass'`.

- [ ] **Step 3: Implement `counterInteract`, `stepPass`, `serveCustomer`, the trash tally, the `finishDay` clear and `HudVM.pass`**

- [ ] **Step 4: Run all tests and the build**

Run: `npm test && npm run build`
Expected: PASS (the updated `customers.test.ts` passes).

- [ ] **Step 5: Commit, merge, push**

```bash
git add src/sim src/ui/viewModels.ts
git commit -m "feat(sim): counter pass with stale timers; binned drinks count as waste

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git checkout main && git merge --no-ff phase2-s1-pass && npm test && npm run build && git push
```

---

## Slice 2: menu switch (branch `phase2-s2-menu`)

### Task 3: Menu input, validation and ordering

**Files:**
- Create: `src/sim/menu.ts`, `src/sim/menu.test.ts`
- Modify: `src/sim/validate.ts`, `src/sim/step.ts` (`case 'menu'`), `src/sim/customers.ts` (`availableDrinks`), `src/ui/viewModels.ts`, `src/sim/viewModels2.test.ts`

**Interfaces:**
- Produces: `applyMenuInput(state: GameState, input: Extract<PlayerInput, { kind: 'menu' }>): GameState`. `availableDrinks(state)` = drinks with `state.menu[d]` **and** supplies in stock (HUD `menu[].available` follows automatically). `NightVM.menu?: { drink: DrinkId; on: boolean }[]`.
- `validateInput` case `'menu'`: returns `{ kind, playerId, drink, on }` only when `drink` is one of the three `DrinkId`s and `typeof on === 'boolean'`; else `null`.

Rules: applied only when `phase === 'night'`, the player exists, is connected and has no `bot`; turning off the last drink that is on is ignored.

- [ ] **Step 1: Write the failing tests** (`menu.test.ts`)

```ts
it('switches a drink off at night and customers stop ordering it', () => {
  let s = step(createRun(opts), [{ kind: 'menu', playerId: 'p2', drink: 'latte', on: false }]);
  expect(s.menu.latte).toBe(false);
  s = startDay(s); expect(availableDrinks(s)).toEqual(['espresso', 'coldBrew']);
  for (let i = 0; i < 60 * 300; i++) spawnCustomers(s);
  expect(s.customers.some((c) => c.drink === 'latte')).toBe(false);
});
it('never switches off the last drink', () => { /* off espresso, off latte, off coldBrew → coldBrew still true */ });
it('ignores menu inputs by day, from unknown or disconnected players, and malformed ones', () => {
  // day: unchanged; playerId 'ghost': unchanged; drink 'tea' / on 'yes' → validateInput returns null
});
```

`viewModels2.test.ts`: `nightViewModel(s, 'p1').menu` equals `[{ drink: 'espresso', on: true }, { drink: 'latte', on: false }, { drink: 'coldBrew', on: true }]`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/menu.test.ts src/sim/viewModels2.test.ts`
Expected: FAIL with `expected true to be false`.

- [ ] **Step 3: Implement validation, `applyMenuInput`, the `availableDrinks` filter and `NightVM.menu`**

- [ ] **Step 4: Run all tests and the build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit, merge, push**

```bash
git checkout -b phase2-s2-menu   # before Step 1
git add src/sim src/ui/viewModels.ts
git commit -m "feat(sim): night menu switch; customers order only drinks on the menu

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git checkout main && git merge --no-ff phase2-s2-menu && npm test && npm run build && git push
```

---

## Slice 3: day events (branch `phase2-s3-events`)

### Task 4: Event schedule, rush hour, power flicker, HUD banners

**Files:**
- Create: `src/sim/events.ts`, `src/sim/events.test.ts`
- Modify: `src/sim/run.ts` (`startDay`), `src/sim/step.ts` (`stepDay` position 1), `src/sim/effects.ts`, `src/sim/stations.ts`, `src/ui/viewModels.ts`, `src/sim/viewModels2.test.ts`

**Interfaces:**
- Produces: `scheduleEvents(state: GameState): GameState`; `stepEvents(state: GameState, doorsOpen: boolean): GameState`; `eventActive(state: GameState, kind: EventKind): boolean`; `EVENT_LABELS: Record<EventKind, string> = { rushHour: 'Rush hour', powerFlicker: 'Power flicker', influencerVisit: 'Influencer visiting', healthInspector: 'Health inspector' }`. `HudVM.events?: { kind: EventKind; label: string; secondsLeft: number }[]` (stripped of `secondsLeft` in `hudStructureKey`).

`scheduleEvents` (day ≥ 2 only, draws in this order): `r = rngNext` → count 0 if `r < 0.35`, 1 if `r < 0.80`, else 2; for each event `kind = remaining[rngInt(remaining.length)]` (remove it; `remaining` starts `['rushHour', 'powerFlicker', 'influencerVisit', 'healthInspector']`) then `startTick = state.tick + Math.round(dayTicks * (0.15 + rngNext * 0.6))` with `dayTicks = secondsToTicks(settings.dayLengthSec)`; sort by `startTick`.

`stepEvents`: when `doorsOpen`, move every scheduled entry with `startTick <= state.tick` into `events` (`rushHour` 1800 ticks, `powerFlicker` 240, `healthInspector` 1200; influencer in Task 5), push its kind to `today.events`, `emitLog('event.start', { kind })`. Then decrement every active event; remove at 0 with `event.end` (inspector calls `judgeInspection` first, Task 5). `computeModifiers`: while `rushHour` active, `traffic *= 2.0`, `patience *= 0.9`. `stepStations`: no countdown while `powerFlicker` is active.

- [ ] **Step 1: Write the failing tests** (`events.test.ts`)

```ts
it('day 1 has no events; later days follow the 0.35/0.45/0.20 count split', () => {
  // startDay on day 1 → eventSchedule []. Over seeds 1..400 at day 2: share with 0 events in [0.28, 0.42], with 2 in [0.14, 0.26];
  // every schedule has distinct kinds and startTick - tick within [0.15, 0.75] × 9000.
});
it('rush hour doubles traffic and trims patience for 30 s', () => {
  const base = computeModifiers(s);
  s.eventSchedule = [{ kind: 'rushHour', startTick: s.tick + 1 }]; s = step(s, []);
  expect(computeModifiers(s).traffic).toBeCloseTo(base.traffic * 2);
  expect(computeModifiers(s).patience).toBeCloseTo(base.patience * 0.9);
  s = ticks(s, 1800); expect(s.events).toEqual([]); expect(s.today.events).toEqual(['rushHour']);
});
it('a power flicker pauses stations for 4 s and loses nothing', () => {
  s.stations[0].busyTicksLeft = 100; s.events = [{ kind: 'powerFlicker', ticksLeft: 240 }];
  s = ticks(s, 240); expect(s.stations[0].busyTicksLeft).toBe(99);  // stepEvents removes the event on tick 240, then stepStations counts down once
  s = ticks(s, 100); expect(s.stations[0].output).toBe('grounds');
});
it('is deterministic per seed', () => { /* two startDay(day 2) from same state → equal eventSchedule */ });
```

`viewModels2.test.ts`: active `rushHour` with `ticksLeft: 61` → `hudViewModel(s).events` equals `[{ kind: 'rushHour', label: 'Rush hour', secondsLeft: 2 }]`; structure key unchanged after `ticksLeft = 30`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/events.test.ts`
Expected: FAIL with `Cannot find module './events'`.

- [ ] **Step 3: Implement `scheduleEvents`, `stepEvents`, the modifier and flicker hooks, and `HudVM.events`**

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git checkout -b phase2-s3-events   # before Step 1
git add src/sim src/ui/viewModels.ts
git commit -m "feat(sim): daily event schedule with rush hour and power flicker

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: Health inspector and influencer visit

**Files:**
- Modify: `src/sim/events.ts`, `src/sim/customers.ts`, `src/sim/closing.ts`, `src/sim/effects.ts`, `src/sim/events.test.ts`

**Interfaces:**
- Produces: `judgeInspection(state: GameState): void` — `today.wasted >= 4` → `tally(today, 'fines', 15)`, `cash -= 15`, `inspection = 'fail'`; else `inspection = 'pass'`; `emitLog('inspection', { result })`. `spawnInfluencer(state: GameState): Customer | null` in `customers.ts`.
- `spawnInfluencer`: drink = available drink with the highest `orderBias` modifier; ties → `latte` if tied, else first in `['espresso','latte','coldBrew']` order; none available → `null`. Patience `round(25 × m.patience × 1.5 × 60)`. Pushed even when the queue holds 6 (never past 7). Active event `{ kind: 'influencerVisit', ticksLeft: patienceMax, customerId }`; it ends when that customer is no longer in the queue. If `null`, the kind is still recorded in `today.events` with `event.start` + `event.end`.
- `serveCustomer` on an influencer: `tally(today, 'bonus', 10)`, `cash += 10`, `today.influencer = 'served'`, `emitLog('influencer', { result: 'served' })`. Losing one (`stepCustomers`, `finishDay`): `today.influencer = 'lost'`. `computeModifiers`: `today.influencer === 'served'` → `traffic *= 1.3`.
- `finishDay`: an inspector still active is judged first; `inspection === 'pass'` adds `+0.1` reputation on top of ±0.2 (before clamping); `state.events = []`.

- [ ] **Step 1: Write the failing tests**

```ts
it('the inspector fines 15 at four wasted drinks and passes below', () => {
  s.today.wasted = 4; s.events = [{ kind: 'healthInspector', ticksLeft: 1 }]; const cash = s.cash;
  s = step(s, []); expect(s.today).toMatchObject({ fines: 15, inspection: 'fail' }); expect(s.cash).toBeCloseTo(cash - 15);
  // fresh day with wasted 3 → inspection 'pass', and finishDay reputation 2.5 + 0.2 + 0.1 = 2.8 with served 10 lost 0
});
it('an influencer jumps a full queue, pays a bonus and boosts traffic', () => {
  s.scenario = 'normal'; s.owned = [];  // the seed-rolled scenario may bias cold brew
  s.customers = six normal espresso customers; s.eventSchedule = [{ kind: 'influencerVisit', startTick: s.tick + 1 }];
  s = step(s, []); const inf = s.customers.find((c) => c.kind === 'influencer')!;
  expect(s.customers).toHaveLength(7); expect(inf.drink).toBe('latte');
  expect(inf.patienceMax).toBe(Math.round(25 * computeModifiers(s).patience * 1.5 * 60));
  // serve it via counterInteract holding latte: cash +price+tip+10, today.bonus 10, influencer 'served', events [] after next step,
  // computeModifiers(s).traffic is 1.3× the value before serving
});
it('Review Focus 5: day end with an active inspector and drinks on the pass', () => {
  s.today.wasted = 0; s.events = [{ kind: 'healthInspector', ticksLeft: 500 }, { kind: 'rushHour', ticksLeft: 900 }];
  s.pass = [{ item: 'latte', ticksLeft: 999 }]; s.phase = 'closing'; s.phaseTicksLeft = 1; s = step(s, []);
  const d = s.days.at(-1)!; expect(d.inspection).toBe('pass'); expect(d.wasted).toBe(0);
  expect([s.pass, s.events]).toEqual([[], []]);
  s = ticks(s, 60 * 60); expect(s.phase).toBe('day'); expect(s.today.inspection).toBeNull();
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/events.test.ts`
Expected: FAIL with `expected undefined to be 'fail'`.

- [ ] **Step 3: Implement the inspector, the influencer and the `finishDay` hooks**

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit, merge, push**

```bash
git add src/sim
git commit -m "feat(sim): health inspector and influencer visit events

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git checkout main && git merge --no-ff phase2-s3-events && npm test && npm run build && git push
```

---

## Slice 4: customer variety (branch `phase2-s4-customers`)

### Task 6: Customer kinds, groups and per-drink accounting

**Files:**
- Modify: `src/sim/customers.ts`, `src/sim/closing.ts`, `src/sim/customers.test.ts`

**Interfaces:**
- Produces: `addCustomer(state: GameState, kind: Exclude<CustomerKind, 'influencer'>): Customer | null` (draws the drink(s), applies patience, pushes; `null` when nothing is available; Task 7 adds the regular branch; `spawnCustomers` calls it after `rollKind`, tests call it directly); `rollKind(state: GameState): Exclude<CustomerKind, 'influencer'>` (day 1 uses `mixDay1`, later days `mix`; one `rngNext`, cumulative in the order normal, impatient, group, regular); `loseCustomer(state: GameState, c: Customer): void` (`lost += 1 + (c.extra?.length ?? 0)`; regular/influencer bookkeeping); `drawDrink(state, menu, m): DrinkId` (today's weighted draw, extracted).
- `spawnCustomers` draw order after the arrival trial and capacity check: `rollKind` → drink(s). Patience multipliers: impatient 0.6, group 1.3 (influencer 1.5 from Task 5). Group: `count = 2 + rngInt(state, 2)`; `drink` = first draw, `extra` = the rest; one queue slot.
- `serveCustomer`: tip `= price × (0.35 × frac + m.tipRate) × kindTip` with impatient 1.5, regular 1.25, others 1. Each drink served: `served += 1`, `tallyDrink`. Group with `extra.length > 0`: `drink = extra.shift()`, `patienceLeft = min(patienceMax, patienceLeft + round(0.3 × patienceMax))`, stays in the queue; else removed.
- `stepCustomers` and `finishDay` route every departure through `loseCustomer`.

- [ ] **Step 1: Write the failing tests** (`customers.test.ts`, keep the existing ones; the fixture gains `settings: { bots: 0 }`)

```ts
it('day 1 spawns only normal and impatient; later days follow the 0.65/0.15/0.12/0.08 mix', () => {
  // 2000 rollKind draws on day 1: only normal and impatient, impatient share in [0.11, 0.19].
  // 2000 on day 2: group share in [0.09, 0.15], regular in [0.05, 0.11].
  // addCustomer(s, 'impatient').patienceMax / addCustomer(s, 'normal').patienceMax ≈ 0.6 (toBeCloseTo, 2);
  // addCustomer(s, 'group'): 1 + extra.length in {2, 3}, patience ratio ≈ 1.3
});
it('a group orders 2–3 drinks, refills patience on each, and leaves after the last', () => {
  s.customers = [{ id: 1, kind: 'group', drink: 'espresso', extra: ['latte'], patienceLeft: 100, patienceMax: 1000 }];
  hold espresso, counterInteract → customers[0] { drink: 'latte', extra: [], patienceLeft: 400 }, served 1, drinks.espresso 1
  hold latte, counterInteract → customers [], served 2, drinks.latte 1
});
it('a group that walks out counts one lost per unserved drink', () => {
  s.customers = [{ id: 1, kind: 'group', drink: 'espresso', extra: ['latte', 'coldBrew'], patienceLeft: 1, patienceMax: 1000 }];
  stepCustomers(s); expect(s.today.lost).toBe(3);
});
it('impatient customers tip 1.5×', () => { /* same frac, compare tip to a normal customer's tip */ });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/customers.test.ts`
Expected: FAIL with `expected 1 to be 3`.

- [ ] **Step 3: Implement kinds, groups, tips and `loseCustomer`**

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git checkout -b phase2-s4-customers   # before Step 1
git add src/sim
git commit -m "feat(sim): impatient and group customers with per-drink accounting

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: Regulars and weighted reputation

**Files:**
- Modify: `src/sim/customers.ts`, `src/sim/closing.ts`, `src/sim/customers.test.ts`, `src/ui/viewModels.ts`, `src/sim/viewModels2.test.ts`

**Interfaces:**
- Produces: `pickRegular(state: GameState, menu: DrinkId[]): Regular | null`.
- When `rollKind` gives `regular`: roster below 3 → create `{ name: names[roster.length], drink: drawDrink(...), visits: 0, lost: 0 }`; roster at 3 → candidates = regulars not in the queue (`customers.some(c => c.name === r.name)` false) whose drink is in `menu`; pick `candidates[rngInt(len)]`; none → spawn a `normal` customer instead. Every appearance: `visits += 1`; the customer gets `kind: 'regular'`, `name`, `drink = regular.drink`.
- `loseCustomer` on a regular: `regular.lost += 1`, `tally(today, 'lostRegulars')`. They keep returning.
- `finishDay` ratio: `served / (served + lost + lostRegulars × (lostWeight − 1))` with `lostWeight = 2`; `served + lost === 0` → 1.
- `src/ui/viewModels.ts` gains `receiptViewModel(d: DayStats): ReceiptVM` with `ReceiptVM = { wasted: number; fines: string; bonus: string; inspection: 'pass' | 'fail' | null; events: string[]; botMistakes: number; lostRegulars: number; drinks: { drink: DrinkId; count: number }[] }` (money via `money`, event names via `EVENT_LABELS`, zeros/`null`/`[]` for absent fields). Tested in `src/sim/viewModels2.test.ts`: a phase-1 `DayStats` literal gives all zeros; a full one maps every field.

- [ ] **Step 1: Write the failing tests**

```ts
it('creates up to three regulars, then brings back one not already queued', () => {
  for (let i = 0; i < 3; i++) addCustomer(s, 'regular');
  expect(s.regulars.map((r) => [r.name, r.visits])).toEqual([['Ada', 1], ['Ravi', 1], ['June', 1]]);
  s.customers = s.customers.filter((c) => c.name === 'Ada' || c.name === 'Ravi');
  expect(addCustomer(s, 'regular')).toMatchObject({ kind: 'regular', name: 'June' });
  expect(s.regulars[2].visits).toBe(2);
  expect(addCustomer(s, 'regular')!.kind).toBe('normal');   // all three queued
});
it('a lost regular counts double toward reputation and keeps coming back', () => {
  s.regulars = [{ name: 'Ada', drink: 'latte', visits: 1, lost: 0 }];
  s.customers = [{ id: 1, kind: 'regular', name: 'Ada', drink: 'latte', patienceLeft: 1, patienceMax: 100 }];
  stepCustomers(s); expect(s.today).toMatchObject({ lost: 1, lostRegulars: 1 }); expect(s.regulars[0].lost).toBe(1);
  s.today.served = 6; finish the day: ratio 6/8 = 0.75 → reputation 2.7; with served 4: 4/6 < 0.7 → 2.3
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/customers.test.ts`
Expected: FAIL with `expected [] to deeply equal [ 'Ada', 'Ravi', 'June' ]`.

- [ ] **Step 3: Implement `pickRegular`, the regular spawn branch and the weighted ratio**

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit, merge, push**

```bash
git add src/sim src/ui/viewModels.ts
git commit -m "feat(sim): regulars who return, and lost regulars weigh double on reputation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git checkout main && git merge --no-ff phase2-s4-customers && npm test && npm run build && git push
```

---

## Slice 5: bots — representation, pathfinding, decision loop (branch `phase2-s5-bots`)

### Task 8: Bot roster, count and input guards

**Files:**
- Create: `src/sim/bots/roster.ts`, `src/sim/bots/roster.test.ts`
- Modify: `src/sim/run.ts` (`startDay` calls `syncBots`), `src/sim/step.ts` (`applyInput`), `src/sim/night.ts` (`stepNight` ready check), `src/sim/closing.ts`, `src/sim/validate.ts` (`sanitizeSettings`), `src/sim/score.ts`, `src/net/hostResume.ts`, `src/net/hostResume.test.ts`, `src/ui/viewModels.ts`, `src/sim/viewModels2.test.ts`; every existing `createRun` fixture in `src/sim/*.test.ts`, `src/net/*.test.ts`, `src/storage/*.test.ts` and `src/host/*.test.ts` that runs the day loop gets `settings: { bots: 0 }` (keep roster tests on 'auto' or explicit counts); otherwise bots act inside unrelated tests from Task 10 on.

**Interfaces:**
- Produces (`roster.ts`): `BOT_IDS = ['bot-1', 'bot-2', 'bot-3']`; `BOT_PERSONALITIES: Personality[] = ['steady', 'rookie', 'veteran']`; `isBot(p: Player): boolean`; `isBotId(id: string): boolean` (`id.startsWith('bot-')`); `humanCount(state): number` (connected players without `bot`, plus bots with personality `'human'`); `wantedBots(state): number` — `'auto'` → `max(0, 3 − h)`, number `n` → `min(n, 4 − h, 3)`, floored at 0; `makeBotState(personality: Personality): BotState` (all counters 0, `plan: []`, `path: []`, `claim`/`claimDrink: null`, `thinkTicksLeft: 0`); `syncBots(state): GameState` (removes over-cap `bot-*` players highest id first; adds missing lowest free ids with name `names[i]`, personality `BOT_PERSONALITIES[i]`, `pos = { ...(LAYOUT.spawnPoints[state.players.length] ?? LAYOUT.door) }`, `connected: true`, `idleTicks: 0`, appended after everyone); `resetBotsForNight(state)` (plan, path, claim, claimDrink cleared, `moveDir` zero, counters zero except `mistakes`); `addStandIns(state, n): GameState` (ids `sim-1..n`, names `Stand-in 1..n`, personality `'human'`, used by the tester only); `botSpeed(state, bot: BotState): number` — `personalities[p].speed × (p === 'human' ? 1 : skill.speed[botSkill − 1])`.
- `sanitizeSettings`: `bots` → `'auto'` kept, finite number → `clamp(round, 0, 3)`, anything else dropped; `botSkill` → `clamp(round, 1, 5)`.
- `applyInput`: `join` with `isBotId(playerId)` → ignored; any input whose `playerId` names a player with `bot` → ignored. `join` of a new human inserts it **before the first bot** (`splice`), so humans stay first.
- `stepNight`: `connected` = connected players without `bot`. `nightViewModel.ready` lists players without `bot`. `summarizeRun.players` lists players without `bot`. `markPeersAway` skips players with `bot`. `finishDay` calls `resetBotsForNight`.

Bots join `players` at `startDay` (first morning included), not in `createRun`; see Planner rulings.

- [ ] **Step 1: Write the failing tests** (`roster.test.ts`; `two = createRun({ seed: 1, hostId: 'p1', players: [p1, p2] })`)

```ts
it('auto fills to three baristas on the first morning, after the humans', () => {
  const s = startDay(two());
  expect(s.players.map((p) => [p.id, p.name, p.bot?.personality])).toEqual([['p1', 'K', undefined], ['p2', 'S', undefined], ['bot-1', 'Bo', 'steady']]);
  expect(s.players[2].pos).toEqual(LAYOUT.spawnPoints[2]);
  expect(startDay(createRun({ ...solo })).players.filter(isBot)).toHaveLength(2);
});
it('a numeric setting is a cap of four baristas', () => {
  // settings.bots 3 with 2 humans → 2 bots (bot-1, bot-2); with 1 human → 3 bots; bots 0 → none
});
it('a friend who joins mid-week replaces a bot the next morning, highest id first', () => {
  // solo (bots bot-1, bot-2) → join p2 during the day → p2 at index 1 → next startDay: players p1, p2, bot-1
});
it('bots are not in the ready check, the night list or the run summary', () => { /* p1 and p2 ready → stepNight opens doors; nightViewModel.ready has 2 rows; summarizeRun.players ['K','S'] */ });
it('Review Focus 3: inputs naming a bot are ignored and nobody joins as a bot', () => {
  // state in the night phase (bots present after startDay, then back to night); no assertion about movement over a step
  const before = s.players.find((p) => p.id === 'bot-1')!; const ready = [...s.ready];
  s = step(s, [{ kind: 'join', playerId: 'bot-2', name: 'Evil' }, { kind: 'leave', playerId: 'bot-1' }, { kind: 'move', playerId: 'bot-1', x: 1, y: 0, interact: true }, { kind: 'ready', playerId: 'bot-1' }, { kind: 'menu', playerId: 'bot-1', drink: 'latte', on: false }]);
  const bot = s.players.find((p) => p.id === 'bot-1')!;
  expect([bot.connected, bot.moveDir, bot.holding]).toEqual([before.connected, before.moveDir, before.holding]);
  expect(s.ready).toEqual(ready); expect(s.menu.latte).toBe(true); expect(s.players.filter(isBot).map((p) => p.id)).not.toContain('bot-2');
});
it('settings clamp bots to 0..3 or auto and skill to 1..5', () => { /* bots 9 → 3, -1 → 0, 'x' dropped, 'auto' kept; botSkill 0 → 1 */ });
```

`hostResume.test.ts`: `'Review Focus 4: resume keeps bots connected'` — a day-state with p1 (host), p2, bot-1 → `markPeersAway` leaves bot-1 connected and p2 away; with p1 ready, `stepNight` opens the doors; next `startDay` with 1 connected human has 2 bots.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/bots src/net/hostResume.test.ts`
Expected: FAIL with `Cannot find module './roster'`.

- [ ] **Step 3: Implement `roster.ts` and the hook-ins; add `bots: 0` to sim fixtures whose expectations now break**

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS, including untouched `src/ui/live.test.ts` and `src/ui/viewModels.test.ts`.

- [ ] **Step 5: Commit**

```bash
git checkout -b phase2-s5-bots   # before Step 1
git add src/sim src/net src/ui/viewModels.ts
git commit -m "feat(sim): bot baristas join each morning, capped at four baristas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: A* pathfinding over tile centres

**Files:**
- Create: `src/sim/bots/path.ts`, `src/sim/bots/path.test.ts`
- Modify: `src/sim/movement.ts` (export `blocked`)

**Interfaces:**
- Produces: `isWalkable(state: GameState, node: Vec2): boolean` (`!blocked(node, state.stations)`, integer `1 ≤ x ≤ 11, 1 ≤ y ≤ 7`); `nodeOf(state, pos: Vec2): Vec2` (nearest walkable node; ties lower y, then lower x); `findPath(state, from: Vec2, to: Vec2): Vec2[] | null`; `targetNodes(state, station: Station, from: Vec2): Vec2[]`; `idleNode(state, self: Player): Vec2`.

`findPath`:
```
start = nodeOf(from); goal = to (a node)
open = [start] with g=0, h=manhattan(start, goal), order=0; cameFrom = {}; closed = {}
loop: pick open entry with lowest f=g+h, then lowest h, then lowest order; if none → return null
  if it is goal → rebuild nodes start→goal, drop start; if dist(from, start) > ECONOMY.bots.arriveRadius prepend start; return
  close it; for d in [+x, -x, +y, -y]: n = node + d; skip if !isWalkable or closed
    g2 = g + 1; if n not open or g2 < its g: record g2, cameFrom, order = counter++
```
`targetNodes`: walkable nodes with `dist(n, station.pos) ≤ interactRangeTiles` and `nearestStation(state, n)?.id === station.id`, and for the counter only `n.y ≤ station.pos.y`; sorted by distance to `from`, ties lower y then lower x. `idleNode`: walkable nodes within 2 tiles of the counter with `y ≤ counter.y`, no other connected player within `yieldRadius`, nearest to `self.pos` (same tie rule); fallback `nodeOf(state, self.pos)`.

- [ ] **Step 1: Write the failing tests**

```ts
it('station target nodes only reach the intended station', () => {
  const nodes = (id: string) => targetNodes(s, s.stations.find((x) => x.id === id)!, { x: 6, y: 4 }).map((n) => `${n.x},${n.y}`).sort();
  expect(nodes('grinder')).toEqual(['1,2', '2,1']);
  expect(nodes('espresso')).toEqual(['3,2', '4,1']);
  expect(nodes('steamer')).toEqual(['5,2', '6,1']);
  expect(nodes('coldBrewTap')).toEqual(['7,1', '8,2', '9,1']);
  expect(nodes('trash')).toEqual(['10,2', '11,1']);
  expect(nodes('counter')).toEqual(['5,6', '6,5', '7,6']);
});
it('finds a 4-neighbour path through walkable nodes', () => {
  const path = findPath(s, { x: 6, y: 4 }, { x: 1, y: 2 })!;
  expect(path.at(-1)).toEqual({ x: 1, y: 2 });
  expect(path.length).toBe(7);   // Manhattan distance (6,4)→(1,2); row y=2 is open
  for (const [a, b] of pairs([{ x: 6, y: 4 }, ...path])) expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
  expect(path.every((n) => isWalkable(s, n))).toBe(true);
});
it('starts from the nearest node when off-grid, and returns [] when already there', () => {
  expect(findPath(s, { x: 6.4, y: 4 }, { x: 6, y: 5 })).toEqual([{ x: 6, y: 4 }, { x: 6, y: 5 }]);
  expect(findPath(s, { x: 6, y: 5 }, { x: 6, y: 5 })).toEqual([]);
});
it('returns null for an unwalkable goal', () => { expect(findPath(s, { x: 6, y: 4 }, { x: 3, y: 1 })).toBeNull(); });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/bots/path.test.ts`
Expected: FAIL with `Cannot find module './path'`.

- [ ] **Step 3: Implement `path.ts` as specified above**

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim
git commit -m "feat(sim): A* pathfinding and station target nodes for bots

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 10: Bot decision loop, claims and stepping

**Files:**
- Create: `src/sim/bots/brain.ts`, `src/sim/bots/brain.test.ts`
- Modify: `src/sim/step.ts` (`stepBots` at position 3), `src/sim/movement.ts` (per-bot speed)

**Interfaces:**
- Consumes: Task 8 roster, Task 9 path, `counterInteract`, `availableDrinks`, `STATION_RECIPES`.
- Produces: `stepBots(state: GameState, m: Modifiers): GameState`; `think(state: GameState, p: Player): BotStep[]`; `chainFor(drink: DrinkId, finish: 'serve' | 'put'): BotStep[]`; `uncoveredOrder(state: GameState, self: Player): Customer | null`. `applyMovement` multiplies a bot's speed by `botSpeed(state, p.bot)`.
- `chainFor`: espresso → grinder insert, grinder take, espresso insert, espresso take, counter `finish`; latte → espresso's chain plus steamer insert, steamer take before the counter; coldBrew → coldBrewTap insert, coldBrewTap take, counter `finish`. Station ids from `LAYOUT`.

`uncoveredOrder`: pool per drink = drinks held by players other than claiming bots, plus station outputs, plus stations busy producing that drink, plus pass items. Walk `customers` in queue order: skip if another bot's `claim === c.id`; skip if `c.drink` not in `availableDrinks`; if `pool[c.drink] > 0` decrement and skip; else return `c`.

`dropPlan(state, p): BotStep[]` is one helper — `[counter put]` if `p` holds a drink, `[trash]` if it holds anything else, `[]` if empty — used in both the claim-drop and the abandon lines below (and the `serve` fallback).

`stepBots` per connected bot (players order), with `b = p.bot`:
```
p.moveDir = {0,0}
if b.claim !== null and (no customer with id claim, or its drink !== b.claimDrink): drop claim;
    b.plan = dropPlan(state, p)          // Review Focus 1
if b.plan empty or plan[0] is idle: b.thinkTicksLeft -= 1   // thinkTicks = ECONOMY.bots.thinkTicks (6)
    if b.thinkTicksLeft <= 0: b.thinkTicksLeft = ECONOMY.bots.thinkTicks (6); next = think(state, p)
        if next non-empty and next[0] is a 'use' step: b.plan = next; b.path = []; b.yields = 0; b.nodeRank = 0; b.waitTicks = 0
        else if b.plan empty: b.plan = next
if b.plan empty: return
step = plan[0]; node = idle ? step.node : targetNodes(station, p.pos)[min(nodeRank, len-1)]; none → abandon
if dist(p.pos, node) > ECONOMY.bots.arriveRadius (0.08):
    if b.path empty: b.path = findPath(state, p.pos, node) ?? abandon
    if dist(p.pos, path[0]) <= ECONOMY.bots.arriveRadius: path = [] and return (re-plan next tick)
    p.moveDir = path[0] − p.pos; return
if idle: pop; return
precondition by action (station st, recipe r):
  insert: st idle and holding === r.takes and supply in stock → E, pop
          holding null and st.output === r.gives → E (takes it), pop this step and the following take of st   // Review Focus 2
          st busy or st.output set → wait
          else abandon
  take:   st.output and holding null → E, pop;  st busy → wait;  else abandon
  serve:  noticeTicksLeft > 0 → wait; a customer wants the held drink, or holding null and a pass drink matches → E, pop;
          else plan = dropPlan(state, p)
  put:    noticeTicksLeft > 0 → wait; E, pop
  trash:  E, pop
wait: b.waitTicks += 1; > ECONOMY.bots.maxWaitTicks (600) → abandon
abandon: claim = null; plan = dropPlan(state, p); path = []
E = p.interactQueued = true; any pop resets waitTicks
```

`think` (first match wins):
0. Holding grounds → `[trash]`. Holding a drink → `[serve]` if a customer wants it, else `[put]` if the pass has room, else `[trash]`.
1. A customer not claimed by another bot whose drink is on the pass → `[serve]`.
2. `uncoveredOrder` → set `claim`, `claimDrink`; `chainFor(drink, 'serve')`.
3. Personality preps, no uncovered order, `pass.length < 3`, cold brews on the pass plus held plus in the tap < 2, coldBrew available → `chainFor('coldBrew', 'put')`.
4. `[{ kind: 'idle', node: idleNode(state, p) }]`.

In this slice there is no reaction delay, no mistake and no yielding (Task 11–13).

Bot test fixtures stop arrivals by pushing `{ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] }` onto `state.owned`, so only hand-placed customers exist; this is why the `served + 1`, `beans unchanged` and `two cold brews on the pass` assertions are exact.

- [ ] **Step 1: Write the failing tests** (`brain.test.ts`; `solo = createRun({ seed: 2, hostId: 'p1', players: [p1], settings: { bots: 1 } })` then `startDay`; p1 never moves; queue set by hand; `settings.dayLengthSec` 600 so the day does not end)

```ts
it('a bot makes and serves an espresso on its own', () => {
  s.customers = [{ id: 900, drink: 'espresso', patienceLeft: 10_000, patienceMax: 10_000 }];
  const served = s.today.served; s = runUntil(s, (x) => !x.customers.some((c) => c.id === 900), 60 * 30);
  expect(s.today.served).toBe(served + 1); expect(s.today.drinks!.espresso).toBeGreaterThan(0);
});
it('a latte goes through the steamer; a cold brew through the tap', () => { /* same shape, ids 901/902 */ });
it('two bots claim different customers', () => {
  // settings.bots 2, two latte customers → after 12 ticks claims are {id1, id2} in some order, never equal
});
it('Review Focus 1: when the claimed customer is served by someone else the bot puts its drink on the pass', () => {
  // bot claims 900 (espresso); once it holds an espresso, remove customer 900; within 600 ticks: bot holding null,
  // claim null, and pass contains an espresso (or today.wasted rose if the pass was full)
});
it('Review Focus 2: a bot does not wait forever at a blocked machine', () => {
  // espresso station output 'latte' (impossible leftover the bot cannot take for an espresso chain while holding grounds)
  // → within 60*15 ticks the bot has binned its grounds and re-planned (plan[0] not espresso insert, waitTicks 0)
});
it('bots prep cold brew for the pass when nothing is waiting, up to two', () => { /* empty queue, steady bot → pass has 2 coldBrew within 60*30 ticks, never 3 */ });
it('bots never make a drink that is off the menu', () => { /* menu.espresso false, espresso customer → no grinder use (beans unchanged) for 600 ticks */ });
it('a day with bots is deterministic and JSON-safe', () => { /* same script twice → toEqual; JSON round-trip then step → equal */ });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/bots/brain.test.ts`
Expected: FAIL with `Cannot find module './brain'`.

- [ ] **Step 3: Implement `brain.ts`, the `stepBots` call and per-bot speed**

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit, merge, push**

```bash
git add src/sim
git commit -m "feat(sim): bot decision loop with claims, chains and pass prep

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git checkout main && git merge --no-ff phase2-s5-bots && npm test && npm run build && git push
```

---

## Slice 6: bots feel human (branch `phase2-s6-bot-feel`)

### Task 11: Reaction delay, personalities, pressure and the skill dial

**Files:**
- Modify: `src/sim/bots/brain.ts`, `src/sim/bots/roster.ts`, `src/sim/bots/brain.test.ts`

**Interfaces:**
- Produces: `underPressure(state: GameState): boolean` (`customers.length >= ECONOMY.bots.pressureQueue` (4) `|| eventActive(state, 'rushHour')`); `reactionDelay(state: GameState, bot: BotState): number` = `round((lo + rngInt(state, hi - lo + 1)) × personality.reaction × skillReaction × (pressure ? ECONOMY.bots.pressure.reaction : 1))`, where `[lo, hi] = ECONOMY.bots.reactionTicks` (`[30, 120]`), `pressure.reaction` is 0.8, `skillReaction = ECONOMY.bots.skill.reaction[botSkill − 1]` (`[1.6, 1.3, 1.0, 0.8, 0.6]`) and is 1 for `'human'` (whose `reaction` 0 makes the delay 0). The rng draw happens even for `'human'` so the stream does not depend on personality mix.
- All bot numbers are read from `ECONOMY.bots`; none are literals in `brain.ts` or `roster.ts`, so Task 18 can tune them in `economy.ts`.
- `stepBots`: when a new `'use'` plan is adopted, `b.reactionTicksLeft = reactionDelay(...)`; while `reactionTicksLeft > 0` decrement and stand still (no step executes).

- [ ] **Step 1: Write the failing tests**

Fixtures: as in Task 10 Step 1 (arrivals stopped with the `test-no-traffic` owned item).

```ts
it('waits 0.5–2 s scaled by personality, skill and pressure before acting', () => {
  // steady, skill 3, no pressure: across 200 adoptions every delay in [30, 120]
  // veteran skill 1: delays in [round(30×1.3×1.6), round(120×1.3×1.6)] = [62, 250]
  // rookie skill 5 with 4 customers queued: [round(30×0.8×0.6×0.8), round(120×0.8×0.6×0.8)] = [12, 46]
});
it('stand-ins react instantly and move at speed 1 whatever the skill', () => { /* addStandIns 1, botSkill 1 → reaction 0, botSpeed 1 */ });
it('the skill dial scales speed', () => { /* steady bot, botSkill 1 → botSpeed 0.85; rookie skill 5 → 1.1 × 1.1 */ });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/bots/brain.test.ts`
Expected: FAIL with `reactionDelay is not a function`.

- [ ] **Step 3: Implement `underPressure`, `reactionDelay` and the wait**

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git checkout -b phase2-s6-bot-feel   # before Step 1
git add src/sim
git commit -m "feat(sim): bot reaction delay from personality, skill dial and pressure

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 12: Mistakes, noticing and remaking

**Files:**
- Modify: `src/sim/bots/brain.ts`, `src/sim/step.ts` (position 5), `src/sim/bots/brain.test.ts`

**Interfaces:**
- Produces: `afterBotInteract(state: GameState, p: Player, heldBefore: ItemKind | null): void` — when `p.bot`, `heldBefore === null`, `p.holding` is a `DrinkId`, and `nearestStation(state, p.pos)` is a recipe station: roll `rngNext(state) < personality.mistake × skillMistake × (pressure ? ECONOMY.bots.pressure.mistake : 1)` (`pressure.mistake` is 1.5; `skillMistake = ECONOMY.bots.skill.mistake[botSkill − 1]` = `[2.0, 1.5, 1.0, 0.7, 0.4]`, 1 for `'human'`). On a mistake: `b.mistakes += 1`, `tally(today, 'botMistakes')`, `emitLog('bot.mistake', { bot: p.name, drink })`, `b.noticeTicksLeft = lo + rngInt(state, hi - lo + 1)` with `[lo, hi] = ECONOMY.bots.noticeTicks` (`[48, 120]`).
- `stepBots`: while `noticeTicksLeft > 0` the bot keeps walking its plan but `serve`/`put` wait (Task 10); at 0 → `plan = [trash, ...(claimDrink && claim ? chainFor(claimDrink, 'serve') : [])]`, `path = []`. The binned drink counts as waste through the Task 2 trash rule.

- [ ] **Step 1: Write the failing tests**

Fixtures: as in Task 10 Step 1 (arrivals stopped with the `test-no-traffic` owned item).

```ts
it('a botched drink is noticed, binned, counted and remade', () => {
  // rookie, botSkill 1 (p = 0.12 × 2.0 = 0.24); espresso customers with huge patience; run 60 × 120 ticks
  // expect today.botMistakes > 0, bot.mistakes === today.botMistakes, today.wasted >= botMistakes,
  // a 'bot.mistake' entry appeared in the log at least once (collect s.log each tick), and served > 0
});
it('a botched drink is never handed over before it is noticed', () => {
  // force: set b.noticeTicksLeft = 100 with the bot holding the claimed espresso at the counter → 99 ticks later served unchanged
});
it('stand-ins never botch', () => { /* addStandIns 1 + bots 0, 60×120 ticks → botMistakes 0 */ });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/bots/brain.test.ts`
Expected: FAIL with `expected 0 to be greater than 0`.

- [ ] **Step 3: Implement `afterBotInteract`, the notice countdown and the remake plan**

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim
git commit -m "feat(sim): bots botch drinks sometimes, notice, bin and remake them

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 13: Yielding

**Files:**
- Modify: `src/sim/bots/brain.ts`, `src/sim/bots/brain.test.ts`

**Interfaces:**
- In `stepBots`, before setting `moveDir` toward `path[0]`: if any other connected player is within `ECONOMY.bots.yieldRadius` (0.7) of `path[0]` → `b.yieldTicksLeft = lo + rngInt(state, hi - lo + 1)` with `[lo, hi] = ECONOMY.bots.yieldTicks` (`[18, 60]`), `b.yields += 1`, `b.path = []`; if `b.yields >= 3` → `b.nodeRank += 1`, `b.yields = 0`. While `yieldTicksLeft > 0` decrement and stand still; at 0 the path is recomputed next tick. `nodeRank` resets when a step pops.

- [ ] **Step 1: Write the failing tests**

Fixtures: as in Task 10 Step 1 (arrivals stopped with the `test-no-traffic` owned item).

```ts
it('yields 0.3–1 s to a player on its next waypoint, then re-plans', () => {
  // bot at (6,4) heading to the grinder; put p1 (connected, still) on the bot's path[0] → next tick yieldTicksLeft in [18, 60], moveDir zero
});
it('after three yields it picks the next-nearest target node', () => {
  // keep p1 parked on every first waypoint toward grinder node rank 0 → after 3 yields nodeRank 1
});
it('humans never collide with bots', () => { /* p1 walks through a still bot's tile: p1.pos changes as with no bot */ });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/bots/brain.test.ts`
Expected: FAIL with `expected 0 to be greater than or equal to 18`.

- [ ] **Step 3: Implement yielding**

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit, merge, push**

```bash
git add src/sim
git commit -m "feat(sim): bots yield to players in their way and try another spot

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git checkout main && git merge --no-ff phase2-s6-bot-feel && npm test && npm run build && git push
```

---

## Slice 7: telemetry (branch `phase2-s7-telemetry`)

### Task 14: Telemetry collector

**Files:**
- Create: `src/host/telemetry.ts`, `src/host/telemetry.test.ts`

**Interfaces:**
- Produces:

```ts
export interface TelemetryMeta { host: string; build: string; protocol: number }
export interface TelemetryRow { kind: string; at: number; tick?: number; data: unknown }
export interface TeleEvent { kind: string; data: unknown; at: number }
export interface TelemetrySummary {
  days: DayStats[]; drinks: Record<DrinkId, number>;
  cards: { day: number; offered: string[]; bought: string[] }[];
  idleTicks: Record<string, number>; botMistakes: Record<string, number>;
  events: { day: number; events: EventKind[] }[];
  pass: { put: number; take: number; serve: number; stale: number };
}
export interface Telemetry {
  record(kind: string, data: unknown, tick?: number): void;
  input(input: PlayerInput): void;          // validated via validateInput; null → nothing
  snapshot(state: GameState): void;
  peerEvents(token: string, events: TeleEvent[]): void;   // rows '<kind>' (e.g. 'frame.long') with data { from: token, ...data }
  ui(kind: string, data?: unknown): void;   // row kind '<kind>' (e.g. 'frame.long', 'input.mash'), no 'ui.' prefix
  summary(state: GameState): TelemetrySummary;
  toNdjson(): string;
  rows(): TelemetryRow[];
  download(filename?: string): void;
}
export function createTelemetry(meta: TelemetryMeta, deps?: { now?: () => number; save?: (filename: string, text: string) => void }): Telemetry;
export function withTelemetry(inner: Transport, tele: Telemetry): Transport;
```

Behaviour: `at` = `now()` ms since creation. The first `snapshot` inserts the meta row at index 0: `{ kind: 'meta', data: { seed, scenario, host, players: names of non-bot players, build, protocol } }`. Every `snapshot`: on a phase change (and the first call) push `{ kind: 'snapshot', tick, data: state }`; push each `state.log` entry with `seq` above the last seen as `{ kind: e.kind, tick: e.tick, data: e.data }`; while `phase === 'night'` track `cards[day] = { offered: union(hand, boughtTonight), bought: boughtTonight }`; on reaching `'ended'` push one `{ kind: 'summary', data: summary(state) }`. `input`: row `'input'` with the cleaned input and the last seen tick; `join`/`leave` also push `peer.join`/`peer.leave`; a player's 4th `interact: true` within 1000 ms pushes `input.mash` `{ player, count: 4 }` once and restarts that player's window. `summary`: totals from `state.days` and `today`, idle and bot mistakes by player name from `players`, pass counts from recorded rows. `download` calls `save(filename ?? 'cafetycoon-<seed>-<yyyy-mm-dd>.ndjson', toNdjson())`; the default `save` builds a `Blob` and clicks a temporary `<a download>`. `withTelemetry` forwards everything to `inner`, calls `tele.input` before `inner.sendInput`, and subscribes once to `inner.onSnapshot` to call `tele.snapshot`.
- Also produces `createUiBuffer(now?): { push(kind: string, data?: unknown): void; drain(): TeleEvent[] }` (cap 200 buffered events; older dropped) and the module-level `uiTelemetry = { ui(kind: string, data?: unknown): void }` plus `setUiTelemetrySink(fn: ((kind: string, data: unknown) => void) | null): void`; with no sink `ui` records nothing.

- [ ] **Step 1: Write the failing tests** (`telemetry.test.ts`, fake clock `let t = 0; now: () => t`)

```ts
it('starts with a meta row and records phase-boundary snapshots once each', () => { /* two snapshots in the same phase → one 'snapshot' row; rows()[0].kind 'meta' with seed and players */ });
it('records validated inputs only, and peer joins', () => { /* move with x NaN → data.x 0; kind 'bogus' → nothing; join → 'input' + 'peer.join' */ });
it('flags four interacts within a second as mashing', () => { /* t = 0,200,400,600 interacts → one 'input.mash'; t=2000 single → none */ });
it('copies new sim log entries exactly once', () => { /* state.log seq 1..2 then seq 2..3 → rows pass.put ×1 per seq */ });
it('summarizes the run when it ends and serializes as ndjson', () => {
  // ended state with 2 days, a bot with mistakes 2, a player idleTicks 30, rows pass.put×2 pass.stale×1
  // summary.pass toEqual { put: 2, take: 0, serve: 0, stale: 1 }; botMistakes { Bo: 2 }; last row kind 'summary'
  // toNdjson().split('\n').filter(Boolean).map(JSON.parse) has rows().length entries
});
it('downloads through the injected saver', () => { /* save receives 'cafetycoon-7-…ndjson' and the ndjson text */ });
it('withTelemetry records inputs it forwards and snapshots it receives', () => { /* fake inner transport: sendInput(move) → inner got it, rows has 'input'; inner emits a snapshot → 'snapshot' row */ });
it('the ui hook records nothing without a sink', () => { /* uiTelemetry.ui('x') no throw; with sink set → sink called with ('x', undefined) */ });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/host/telemetry.test.ts`
Expected: FAIL with `Cannot find module './telemetry'`.

- [ ] **Step 3: Implement `telemetry.ts`**

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git checkout -b phase2-s7-telemetry   # before Step 1
git add src/host
git commit -m "feat(host): in-memory telemetry collector with ndjson download

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 15: `tele` room action

**Files:**
- Modify: `src/net/protocol.ts`, `src/net/hostRoom.ts`, `src/net/peerSession.ts`, their tests

**Interfaces:**
- Produces: `ACTIONS` gains `'tele'`; `TeleMsg = { t: 'tele'; token: string; events: TeleEvent[] }` (import `TeleEvent` type from `../host/telemetry`); `parseTele(data: unknown): TeleMsg | null` — token string 1–64 chars; `events` an array of at most 200; each event needs `kind` string of 1–40 chars and finite `at`; `data` kept when `JSON.stringify(data).length <= 1000`, else `null`; any malformed event → whole message `null`.
- `createHostRoom(link, local, host, onMembers?, hooks?: { onTele?(token: string, events: TeleEvent[]): void })` — on `'tele'`: parse; drop unless the sending peer is a member and `msg.token === member.token`; then `hooks.onTele(token, events)`.
- `PeerTransport.sendTele(events: TeleEvent[]): void` — sends `{ t: 'tele', token, events }` to the host peer when known; empty arrays are not sent.

- [ ] **Step 1: Write the failing tests**

```ts
// protocol.test.ts
it('parses tele batches and rejects bad ones', () => {
  expect(parseTele({ t: 'tele', token: 'T', events: [{ kind: 'frame.long', data: { ms: 300 }, at: 5 }] })).toEqual({ t: 'tele', token: 'T', events: [{ kind: 'frame.long', data: { ms: 300 }, at: 5 }] });
  expect(parseTele({ t: 'tele', token: 'T', events: Array(201).fill({ kind: 'x', data: 1, at: 1 }) })).toBeNull();
  expect(parseTele({ t: 'tele', token: 'T', events: [{ kind: '', data: 1, at: 1 }] })).toBeNull();
  expect(parseTele({ t: 'tele', token: 'T', events: [{ kind: 'x', data: 'y'.repeat(2000), at: 1 }] })!.events[0].data).toBeNull();
});
// hostRoom.test.ts
it('forwards a member's tele batch and drops impersonation', () => { /* member T1 sends token T1 → onTele('T1', events); token 'H' → no call; non-member → no call */ });
// hostResume-style integration in hostRoom.test.ts
it('a HostRoom on a telemetry-wrapped transport records peer joins and inputs', () => {
  // const local = fakeLocal(); const tele = createTelemetry(meta, { now: () => 0 }); const room = createHostRoom(link, withTelemetry(local.t, tele), host)  // keep `local` to assert on it below
  // peer T1 joins and sends a move → tele.rows() kinds include 'input' and 'peer.join'; `local` (the inner transport) received both
});
// peerSession.test.ts
it('sends tele batches to the host only once connected', () => { /* before hello: nothing; after: link.sent last { kind: 'tele', target: 'hostPeer' } */ });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/net`
Expected: FAIL with `parseTele is not a function`.

- [ ] **Step 3: Implement `parseTele`, the HostRoom handler and `sendTele`**

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/net
git commit -m "feat(net): tele room action carries peers' UI events to the host

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 16: main.ts hook-ins and console API

**Files:**
- Modify: `src/main.ts` (only the hook-ins below), `docs/BACKLOG.md` (one line per hook-in under a new "main.ts hook-ins (phase 2)" heading)

**Interfaces (exact hook-ins, nothing else in `main.ts` changes):**
1. Imports: `createTelemetry, withTelemetry, createUiBuffer, setUiTelemetrySink, uiTelemetry, type Telemetry` from `./host/telemetry`; `PROTOCOL_VERSION` from `./net/protocol`.
2. `Session` gains `telemetry: Telemetry | null` (initialised `null` in `createSession`) and `teleTimer: ReturnType<typeof setInterval> | null` (cleared in `endSession`).
3. `startSolo`, `startHost`, `resume`: `const tele = createTelemetry({ host: <host name>, build: new Date(document.lastModified).toISOString(), protocol: PROTOCOL_VERSION })` and `const local = withTelemetry(createLocalTransport(), tele)`; after `createSession`, `s.telemetry = tele; setUiTelemetrySink((k, d) => tele.ui(k, d))`.
4. `openHostRoom`: pass `undefined`-safe fifth argument `{ onTele: (token, events) => s.telemetry?.peerEvents(token, events) }`.
5. `startPeer`: `const buffer = createUiBuffer(); setUiTelemetrySink(buffer.push); s.teleTimer = setInterval(() => transport.sendTele(buffer.drain()), 2000)`.
6. `frame()`: the hook keeps its own `performance.now()` timestamp of the previous frame; when `now − previous > 250` record `frame.long { ms }` via `uiTelemetry.ui('frame.long', { ms })` (host sink writes to the collector, peer sink to the buffer).
7. After `main()` setup: `window.cafetycoon = { telemetry: { download: () => session?.telemetry?.download(), rows: () => session?.telemetry?.rows() ?? [] } }` (typed through a `declare global` block in `src/host/telemetry.ts`), plus `downloadTelemetry()` and a `telemetryRows()` getter in `main` scope for the UI agent to wire.
8. `endSession`: `setUiTelemetrySink(null)`.

`main.ts` has no unit tests (it needs a canvas and a Worker); the behaviour behind these hook-ins is pinned by the Task 14 and Task 15 tests, so this task is apply-then-verify.

- [ ] **Step 1: Apply the eight hook-ins and the BACKLOG lines**

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 3: Verify in the browser**

Run: `npm test && npm run build`, then `npm run dev`, play one solo day, and in the console run `cafetycoon.telemetry.rows().slice(0, 3)`.
Expected: green; the console shows a `meta` row, a `snapshot` row and `input` rows; `cafetycoon.telemetry.download()` saves an `.ndjson` file. With a second tab joined as a peer, the host's rows gain `peer.join` and, after a forced long frame in the peer tab, a `frame.long` row within 2 s.

- [ ] **Step 4: Commit, merge, push**

```bash
git add src/main.ts src/host docs/BACKLOG.md
git commit -m "feat(host): record solo and hosted runs; console download of the telemetry log

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git checkout main && git merge --no-ff phase2-s7-telemetry && npm test && npm run build && git push
```

---

## Slice 8: balance tester (branch `phase2-s8-balance`)

### Task 17: Tester core, CLI and `npm run balance`

**Files:**
- Create: `scripts/balanceCore.ts` (no Node APIs, so `tsc` can check it through the test), `scripts/balance.ts` (CLI), `src/balance.test.ts` (vitest only collects `src/**/*.test.ts`)
- Modify: `package.json` (`"balance": "tsx scripts/balance.ts"`; `npm install --save-dev --save-exact tsx`), `package-lock.json`

**Interfaces:**

```ts
export interface BalanceOptions {
  weeks: number; seed: number; humans: number; bots: number; skill: BotSkill; pace: Pace;
  scenario: ScenarioId | 'random'; menus: DrinkId[][]; compare: boolean; json: boolean; daySeconds: number;
}
export interface DayRow { day: number; cash: number; served: number; lost: number; turnedAway: number; wasted: number; botMistakes: number; events: EventKind[] }
export interface WeekResult { seed: number; menu: DrinkId[]; days: DayRow[]; finalCash: number; bankrupt: boolean; drinks: Record<DrinkId, number> }
export interface BalanceReport { options: BalanceOptions; weeks: WeekResult[]; warnings: string[] }
export function parseArgs(argv: string[]): BalanceOptions;           // throws UsageError on bad input
export function runWeek(opts: BalanceOptions, seed: number, menu: DrinkId[]): WeekResult;
export function runBalance(opts: BalanceOptions): BalanceReport;
export function formatReport(report: BalanceReport): string;         // JSON when opts.json
export function main(argv: string[]): { output: string; code: number };  // 0 ok, 2 usage error
```

- Defaults: `weeks 10, seed 1, humans 2, bots 1, skill 3, pace 3, scenario 'random', menus [['espresso','latte','coldBrew']], compare false, json false, daySeconds 150`. `--menu` takes `all`, one drink, or a comma list; `--compare menus` sets `menus` to all, espresso, latte, coldBrew; `--day N` (30–600) is a tester-only option. `humans + bots > 4`, unknown flags, or out-of-range values → `UsageError` → `main` returns `{ output: usage text, code: 2 }`. `humans 0 && bots 0` → `warnings` gets `'No baristas: nothing will be served.'`.
- `runWeek`: `createRun({ seed, hostId: 'tester', players: [], settings: { bots: opts.bots, botSkill: opts.skill, pace: opts.pace, dayLengthSec: opts.daySeconds, nightLengthSec: 30 } })`; if `scenario !== 'random'` set `state.scenario`; set `state.menu` from `menu`; each night (on entering `'night'`): restock each supply used by an on-menu drink up to targets beans 40, milk 20, concentrate 30 (`packs = ceil((target − have)/10)`, reduced until affordable) via `restock` inputs from `'tester'`, then `buy` the cheapest affordable `permanent` hand card whose `cost × 2 < cash`. Right after `createRun` the tester calls `addStandIns(state, opts.humans)`; the first `startDay`'s `syncBots` then counts them as humans when capping ordinary bots. Step with `step(state, inputs)` until `phase` is `weekEnd` or `ended`. One `DayRow` per pushed `DayStats` with `cash` after that day.
- Output: per week a day table (cash, served, lost, turned away, wasted, bot mistakes, events), totals, a per-drink table; with `compare`, one row per menu: mean final cash and loss rate `(lost) / (served + lost)` averaged over weeks. Warnings first.
- `scripts/balance.ts`: `try { const r = main(process.argv.slice(2)); process.stdout.write(r.output + '\n'); process.exitCode = r.code; } catch (e) { console.error(e); process.exitCode = 1; }`. Imports are relative without extensions (`./balanceCore`), which `tsx` resolves; `balanceCore.ts` imports `../src/sim/...` the same way.

- [ ] **Step 1: Write the failing test** (`src/balance.test.ts`)

```ts
it('runs one short week through the tester entry point, deterministically', () => {
  const a = main(['--weeks', '1', '--seed', '3', '--day', '30', '--json']);
  expect(a.code).toBe(0);
  const r = JSON.parse(a.output) as BalanceReport;
  expect(r.weeks).toHaveLength(1);
  expect(r.weeks[0].days.length).toBeGreaterThan(0);
  expect(r.weeks[0].days.length).toBeLessThanOrEqual(7);
  expect(r.weeks[0].days.reduce((n, d) => n + d.served, 0)).toBeGreaterThan(0);
  expect(main(['--weeks', '1', '--seed', '3', '--day', '30', '--json']).output).toBe(a.output);
});
it('rejects bad options with exit code 2 and warns about an empty café', () => {
  expect(main(['--humans', '3', '--bots', '2']).code).toBe(2);
  expect(main(['--frobnicate']).code).toBe(2);
  expect(main(['--weeks', '1', '--day', '30', '--humans', '0', '--bots', '0']).output).toContain('No baristas');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/balance.test.ts`
Expected: FAIL with `Cannot find module '../scripts/balanceCore'`.

- [ ] **Step 3: Implement `balanceCore.ts`, `balance.ts`, the dependency and the script**

- [ ] **Step 4: Run tests, build, and the CLI**

Run: `npm test && npm run build && npm run balance -- --weeks 2 --seed 1; echo "exit $?"`
Expected: green; a day table for two weeks and `exit 0`. `npm run balance -- --bogus; echo "exit $?"` prints usage and `exit 2`.

- [ ] **Step 5: Commit**

```bash
git checkout -b phase2-s8-balance   # before Step 1
git add scripts src/balance.test.ts package.json package-lock.json
git commit -m "feat: headless balance tester (npm run balance)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 18: First numbers and one tuning pass

**Files:**
- Modify: `src/data/economy.ts` (only the knobs below), `docs/superpowers/specs/2026-10-28-phase-2-busy-season-design.md` §16 (record the pass), `docs/BACKLOG.md` ("Decisions not recorded elsewhere")

- [ ] **Step 1: Measure** — `npx tsx scripts/balance.ts --weeks 50 --seed 1 --pace 3 --skill 3 --menu all --json > /tmp/h2b1.json` and `npx tsx scripts/balance.ts --weeks 50 --seed 1 --humans 0 --bots 3 --json > /tmp/b3.json` (not `npm run balance`: npm's banner line would break the JSON).
- [ ] **Step 2: Check the §11 targets** — two humans + one bot: ≥ 95% of weeks not bankrupt through seven days, ≥ 80% end with `finalCash > 100`, loss rate `lost / (served + lost)` in [0.15, 0.35]; three bots: ≥ 60% finish, and mean final cash below the two-humans table.
- [ ] **Step 3: Tune only if a target misses**, turning knobs strictly in this order and re-measuring after each: bot mistake rates, `pass.staleSeconds`, `baseArrivalsPerSecond`, `patienceSeconds`, `events.inspector.wastedLimit`. Nothing else.
- [ ] **Step 4: Record** before/after numbers for every target and each knob changed in spec §16 and one BACKLOG line; run `npm test && npm run build` (fix any sim test whose sampled numbers moved, by adjusting the fixture, not the rule).
- [ ] **Step 5: Commit, merge, push**

```bash
git add src/data/economy.ts docs src
git commit -m "chore(balance): first tester numbers and one tuning pass

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git checkout main && git merge --no-ff phase2-s8-balance && npm test && npm run build && git push
```

---

## Slice 9: docs (branch `phase2-s9-docs`)

### Task 19: README, BACKLOG "Needs UI", roadmap goal states

**Files:**
- Modify: `README.md`, `docs/BACKLOG.md`, `public/roadmap.json`

- [ ] **Step 1: README "Try it"** — under "How to play": the pass (E with a spare drink sets it down, E empty-handed serves or picks up; espresso goes stale in 45 s, latte 60 s, cold brew 10 min), bots (solo gets two, a friend replaces one next morning), events and customer kinds in one line each, the telemetry console commands and that nothing is uploaded. Under "Working on it": `npm run balance -- --weeks 10` and the main options.
- [ ] **Step 2: BACKLOG** — a "Needs UI" section with one line per spec §13 item: `HudVM.pass`; `NightVM.menu` + `menu` input; `HudVM.events` banners and inspection/influencer toasts (`state.log` kinds `inspection`, `influencer`); customer kind tells (`Customer.kind`, `name`, `extra.length`); bot tells (`Player.bot`, personality); receipt fields via `receiptViewModel` (Task 7); telemetry download button (`downloadTelemetry()`); `uiTelemetry.ui(kind, data)` calls on the night screen; title/pause settings for `bots` and `botSkill` (input `settings`). Add one line: "`nightViewModel.ready` now omits bots; `hudStructureKey` ignores per-tick `secondsLeft` fields (pass, events)." Also a "Deferred" line for syrups (spec §4 sketch).
- [ ] **Step 3: roadmap.json** — phase 2 goals: day events, better customers, scripted bots, bots feel human, bots path/yield, personalities, skill dial, telemetry → `"done"`; balance pass → `"doing"` (playtest pending); cards, sound, difficulty pacing stay `"todo"`.
- [ ] **Step 4: Verify** — `npm test && npm run build` (the `public/roadmap.json` shape test in `src/render/theme.test.ts` stays green).
- [ ] **Step 5: Commit, merge, push**

```bash
git checkout -b phase2-s9-docs   # before Step 1
git add README.md docs public/roadmap.json
git commit -m "docs: phase 2 try-it notes, Needs UI list, roadmap goal states

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git checkout main && git merge --no-ff phase2-s9-docs && npm test && npm run build && git push
```

---

## Planner rulings

Decisions the spec left open or that the ownership rules forced. Each is one line of reasoning.

1. **Bots join `players` at `startDay`, not in `createRun`.** `src/ui/live.test.ts` (not ours) builds a two-player run and expects a crew of exactly two; bots stand still at night anyway, so night 1 without them is invisible except in the crew list. Spec says "recomputed at run creation"; flag this to Kennedy.
2. **New `Customer` and `DayStats` fields are optional**, with `tally`/`tallyDrink` helpers; `src/ui` tests build those as literals and the build type-checks tests.
3. **Phase-2 view-model tests live in `src/sim/viewModels2.test.ts`**, because new files under `src/ui` are off limits.
4. **`hudStructureKey` ignores `secondsLeft` in `pass` and `events`**; otherwise the HUD rebuilds at 20 Hz, breaking the Group B render-once-then-patch rule. Existing keys are unchanged.
5. **`nightViewModel.ready` and `summarizeRun.players` skip bots**; bots are not in the ready check and are not run members.
6. **The receipt gets a new `receiptViewModel`** instead of fields on `ClosingVM`/`WeekEndVM`, whose existing tests use exact `toEqual`.
7. **Sim events reach the host collector through `state.log`** (seq-numbered, pruned after 120 ticks); snapshots arrive every 3 ticks (at most 10 in a catch-up), so nothing is missed and nothing re-sent.
8. **`ScheduledEvent.startTick` is an absolute `state.tick`**, which survives a mid-day day-length change and needs no extra counter.
9. **Influencer outcome lives in `today.influencer`**; `computeModifiers` reads it for the ×1.3 traffic, with no extra state.
10. **The inspector is judged at `finishDay` if the day ends mid-visit**; otherwise a late visit would vanish unjudged.
11. **`served` counts drinks, `lost` counts unserved drinks** (builder ruling 2), and a lost group counts `1 + extra.length`.
12. **Regular names are `['Ada', 'Ravi', 'June']`**, and a regular whose drink is unavailable (off menu or out of stock) is not a candidate. Spec §15 leaves the list to the builder.
13. **Customer spawn rng order is arrival → capacity → kind → drink(s) → regular pick**, so one fixed order keeps replays stable.
14. **`BotState` carries extra private fields** (`claimDrink`, `thinkTicksLeft`, `path`, `yields`, `nodeRank`, `waitTicks`, `noticeTicksLeft`); the spec's six fields are kept verbatim.
15. **`BotStep` is `use(station, action)` or `idle(node)`**, and the grinder chain includes a grinder `take`, which spec §9's chain omits but the recipe needs.
16. **A bot gives up a waiting step after `ECONOMY.bots.maxWaitTicks = 600` (10 s)**, so a blocked station cannot freeze a bot forever (Review Focus 2).
17. **A bot with a noticed-pending mistake never presses E at the counter**, so a botched drink is never handed over.
18. **Mistake rolls apply to every drink taken from a recipe station**, including the espresso inside a latte chain, as the spec's "takes a drink" reads.
19. **The counter's target nodes are on the barista side (`y ≤ 6`)**, so bots don't stand among the customers.
20. **`targetNodes` require `nearestStation(node)` to be that station**; nodes such as (2,1) tie grinder/espresso and would otherwise use the wrong machine.
21. **Bot ids are reserved**: `join` with a `bot-` id, and any input naming a bot, are ignored (Review Focus 3); `markPeersAway` skips bots (Review Focus 4).
22. **A joining human is inserted before the first bot**, which keeps humans first in `players`; the existing join test and the crew colours rely on index order.
23. **`applyMovement` reads `botSpeed` per bot**, which keeps a single movement path.
24. **The reaction-delay rng draw happens for stand-ins too**, so the rng stream doesn't depend on the personality mix.
25. **Tester stand-ins are ids `sim-1..`, counted as humans by `wantedBots`**, which makes the bot cap and the stand-in mix compose as builder ruling 4 and 5 describe.
26. **The tester sets `state.menu` directly and plays as an absent host `'tester'`**; the menu input needs a connected player, and night inputs only check the host id.
27. **Tester weeks are independent runs on seeds `S..S+N−1`**, which `--compare menus` requires ("same seeds").
28. **The tester adds `--day N`** so the CI test runs a week in seconds; restock skips supplies no on-menu drink uses, so single-drink menus aren't charged for unused stock.
29. **Tester logic is in `scripts/balanceCore.ts` with no Node APIs, tested from `src/balance.test.ts`**; vitest only collects `src/**`, `tsc` only sees `src`, and the CLI wrapper is the one file that touches `process`.
30. **Telemetry meta is completed from the first snapshot** (`seed`, `scenario`, players), and `build` is `document.lastModified`; `vite.config.ts` can't inject a build date.
31. **`peer.join`/`peer.leave` come from `join`/`leave` inputs**, which the wrapped transport already sees, so HostRoom needs only the `onTele` hook.
32. **The UI telemetry hook is a module singleton `uiTelemetry`** with a sink set by `main.ts`; UI files can't import `main.ts`.
33. **No `settingsStore` change for `bots`/`botSkill`**; it stays unused until the UI agent wires the title/pause controls (Needs UI).
