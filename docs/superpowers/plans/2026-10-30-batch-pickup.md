# Batch coffee, pickup counter and condiment bar: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Gear runs, cold brew is steeped at night and poured instantly, customers order at the till and take
their own drinks from a 4-slot pickup counter, drip and cold brew drinkers use a carried-and-refilled condiment
bar, made-to-order drinks get a longer patience table, and bots and the night planner follow the new flow.

**Architecture:** Everything new is gated on `state.gear === true`; classic runs keep today's hand-serve code paths
untouched. The pickup counter and condiment bar are two extra stations of kind `'counter'` (ids `pickup`,
`condiments`) appended after the till in Gear shops, so no `Record<StationKind, …>` in the UI changes. New logic lives
in three new modules (`src/sim/steep.ts`, `src/sim/pickup.ts`, `src/sim/condiments.ts`); a short foundation (Tasks 1–2)
lands every shared-hub edit first so the tracks after it touch disjoint files.

**Tech Stack:** TypeScript 5.9 (strict), Vitest 5 (tests beside sources), tsx for `scripts/`.

**Spec:** `docs/superpowers/specs/2026-10-30-batch-pickup-design.md` (binding, including "Builder's questions,
settled"). Read it before any task.

## Global Constraints

- Gear only: every new behaviour checks `state.gear === true` (or `isGearRun`). Classic runs keep hand-serve, the
  3-slot pass, `DRINK_INFO[d].wait` and per-cup concentrate; classic tests and goldens must not change.
- Values (spec, verbatim): base patience 33 s; Gear patience by drink: drip, cold brew ×0.9; sweet-cream cold brew,
  café au lait ×1.0; espresso, americano ×1.3; doppio, red-eye, latte, iced latte, matcha ×1.4; cappuccino, mocha,
  maple cold foam (`special`) ×1.5; pour-over ×1.7. Pickup counter 4 slots. Ring-up refills patience by +50% of max,
  capped at max (replaces +25%). Condiment bar 20 servings; 60% of plain drip and plain cold brew customers want a
  serving; empty bar = tip ×0.8. Box $6, refills the bar to 20, boxes keep. Steep cost 1 concentrate per fresh cup;
  steep caps 8 / 16 / 30 (C1/C2/C3), taps add up; leftovers keep one day; target is sticky; a new run (target
  absent) steeps the full cap.
- Determinism: no `Math.random`, `Date` or unordered iteration in `src/sim`. No new `rngNext` draws: the condiment
  "wants it" roll is a pure hash of the customer id (Task 10).
- Event names (exact): `till.rung { customer, drink, by }`, `pickup.take { drink, customer, by }`,
  `condiment.use { customer }`, `condiment.black { customer, text }`, `condiment.refill { by }`,
  `steep { cups, paid }`. State (exact): `Customer.stage?: 'order' | 'pickup'`, `Station.potLeft` (exists),
  `Station.batchLeft` (exists), `Station.batchOld`, `GameState.steep`, `GameState.coldBrewLeft`,
  `GameState.condiments: { servings }`, `GameState.condimentBoxes`, `PassItem.by`, `Player.tool: 'mop' | 'box' | null`,
  `DayStats.blackCoffees`.
- Lanes: touch only `src/sim`, `src/data`, `src/net`, `src/host`, `src/storage`, `scripts` and tests. No UI edits are
  planned (new spots are kind `'counter'`, new alerts reuse kind `'stock'`, new advice reuses kind `'restock'`). If
  `npm run build` still fails in `src/ui` or `src/render`, the only allowed fix is one line, named in the commit message.
- `src/sim/bots/brain.ts` is being rewritten on branch `bots-gear-stations`. Do not touch it before Task 13, and write
  Tasks 13–15 against whatever `think` / `chainFor` / `act` / `use` look like after that branch merges.
- Versions: exactly one `SNAPSHOT_VERSION` bump (27 → 28, Task 11) and one `PROTOCOL_VERSION` bump (40 → 41, Task 16).
- Every task ends green: `npx vitest run` and `npx tsc --noEmit`. Git: `git fetch` first, one branch per track, merge
  into `main` locally and push (no pull requests while pre-release). Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Selling or downgrading the cold brew tap with leftovers (more leftover cups than the new cap, or no tap at all):
   the extra cups are poured out with a morning note; nothing goes negative and nothing throws. Test: Task 4.
2. A drink set on the pickup counter before its customer is rung: no serve, no pay; the customer takes it in the same
   tick the till rings them. Test: Task 7.
3. A barista who leaves, or a day that ends, while someone carries a condiment box: the box goes back to the corner,
   never lost and never duplicated. Test: Task 1.
4. A group whose later drink lands first: they take it and pay for it, keep waiting for the rest, and leave only when
   every drink is taken. Test: Task 7.
5. A mid-day Gear save from v3.x with customers already rung under the old till: after loading they are back in the
   `order` stage and the till can ring them again (not stuck between stages). Test: Task 11.

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `src/sim/types.ts`, `src/sim/tally.ts`, `src/sim/validate.ts`, `src/host/telemetry.ts` | new fields, inputs, events | 1 (15 adds bot actions) |
| `src/sim/steep.ts` (new) | steep cap/target/plan, night input, morning steep, closing carry-over | 1, 4 |
| `src/sim/condiments.ts` (new) | condiment constants, box input, carry/return, refill, condiment stop | 1, 8, 10 |
| `src/sim/pickup.ts` (new) | counter spots, pickup slots, who takes what, `stepPickup` | 7, 10 |
| `src/data/layout.ts`, `src/sim/slots.ts` | spot tiles, spot stations, `ensureCounterSpots`, `reasonOff` | 2, 3 |
| `src/sim/gear.ts`, `src/sim/stations.ts`, `src/sim/rogue.ts`, `src/data/gear.ts` | instant tap pour, tap cups, morning hook, C4/C5 caps | 3, 4 |
| `src/data/drinks.ts`, `src/sim/customers.ts` | `TAP_DRINKS`, `GEAR_WAIT`, availability, stage, `tipMul` | 1, 3, 5 |
| `src/sim/till.ts`, `src/sim/pass.ts`, `src/sim/eggs.ts`, `src/sim/drop.ts`, `src/sim/step.ts` | ring-up, counter spots, pickup put/take | 1, 2, 6, 7 |
| `src/sim/mop.ts`, `src/sim/closing.ts` | tool return, box pickup routing, closing hooks | 1, 4, 8 |
| `src/sim/brief.ts` | `expectedOrders`, steep and condiment alerts | 9 |
| `src/storage/snapshotStore.ts` | v28 migration | 11 |
| `src/sim/bots/planner.ts` | steep and box advice | 12 |
| `src/sim/bots/brain.ts` | ring, pickup put, tap pour, box carry | 13–15 |
| `scripts/gearBalance.ts`, `scripts/p4Smoke.ts`, `src/net/protocol.ts`, docs | crews, balance, protocol, changelog | 16 |

Test helper used below (write it locally in each new test file): `gearDay(gear: GearId[], supplies = {})` =
`createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier: 'stand', gear: true })`,
buy each id with `applyGearInput(s, { kind: 'gear', playerId: 'p1', action: 'buy', gear })`, `Object.assign(s.supplies, supplies)`,
then `startDay(s)`. `stand(s, id)` puts `p1` on the barista side of station `id` (back bar: `y + 1`; counter spots: `y - 1`).
`gearNight(gear)` is the same without `startDay`.

---

### Task 1: Shared state, night inputs and box returns (foundation)

Depends on: none.

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/tally.ts`, `src/sim/validate.ts`, `src/sim/step.ts`, `src/sim/closing.ts`,
  `src/sim/mop.ts`, `src/sim/drop.ts:19-22`, `src/sim/gear.ts` (`gearStart` only), `src/sim/customers.ts`
  (`addCustomer`, `spawnInfluencer`, `serveCustomer` signature), `src/data/drinks.ts`, `src/host/telemetry.ts`
- Create: `src/sim/steep.ts`, `src/sim/condiments.ts`
- Test: `src/sim/steep.test.ts`, `src/sim/condiments.test.ts`

**Interfaces:**
- Produces (types): `Customer.stage?: 'order' | 'pickup'` (absent = `'order'`), `PassItem.by?: PlayerId`,
  `Station.batchOld?: number` (cups of `batchLeft` steeped the day before, poured first), `GameState.steep?: number`
  (sticky target; absent = full cap), `GameState.coldBrewLeft?: number` (fresh cups carried overnight),
  `GameState.condiments?: { servings: number }`, `GameState.condimentBoxes?: number`, `Player.tool: 'mop' | 'box' | null`,
  `DayStats.blackCoffees?: number`, `TallyKey` gains `'blackCoffees'`, `SimEventKind` gains `'till.rung' | 'pickup.take' |
  'condiment.use' | 'condiment.black' | 'condiment.refill' | 'steep'`, `PlayerInput` gains
  `{ kind: 'steep'; playerId: PlayerId; cups: number }` and `{ kind: 'condimentBox'; playerId: PlayerId; boxes: number }`.
- Produces (`src/data/drinks.ts`): `TAP_DRINKS: DrinkId[]` = every drink whose `recipeChain` has a `coldBrewTap` step
  (`coldBrew`, `icedLatte`, `special`, `sweetCream`), declared after `recipeChain`.
- Produces (`src/sim/steep.ts`, must not import `./gear`): `STEEP = { maxInput: 200 } as const`;
  `tapCap(s: Station): number` (`GEAR[s.gear].batch ?? 0` for a `coldBrewTap` with gear, else 0);
  `steepCap(state): number` (sum of `tapCap` over stations, 0 outside Gear);
  `steepTarget(state): number` (`min(state.steep ?? cap, cap)`);
  `interface SteepPlan { cap; target; leftover; topUp; paid; short }` (all numbers) and `steepPlan(state): SteepPlan` with
  `leftover = min(coldBrewLeft ?? 0, cap)`, `topUp = max(0, target - leftover)`, `paid = min(topUp, floor(concentrate))`,
  `short = topUp - paid`; `applySteepInput(state, input): GameState`.
- Produces (`src/sim/condiments.ts`, must not import `./gear`):
  `CONDIMENTS = { servings: 20, share: 0.6, blackTip: 0.8, boxCost: 6, maxBoxes: 10 } as const`;
  `applyCondimentBoxInput(state, input): GameState`; `returnBox(state, p: Player): void` (tool → null,
  `condimentBoxes += 1`, emits `drop { item: 'box', x, y }` at `layoutFor(state.tier).boxCorner` once Task 2 adds it;
  until then use `mopHome`).
- Produces (`src/sim/mop.ts`): `returnTool(state, p: Player): void` (mop → `returnMop`, box → `returnBox`).
- Produces (`src/sim/customers.ts`): `serveCustomer(state, customer, drink, by?, slips = 0, tempMiss = false, tipMul = 1)`;
  `tipMul` multiplies the tip right after the temp-miss halving and before the speed tip.

- [ ] **Step 1: Write the failing tests**

```ts
// steep.test.ts
it('validates the steep input', () => {
  expect(validateInput({ kind: 'steep', playerId: 'p1', cups: 12 })).toEqual({ kind: 'steep', playerId: 'p1', cups: 12 });
  for (const cups of [2.5, -1, 201, NaN]) expect(validateInput({ kind: 'steep', playerId: 'p1', cups } as PlayerInput)).toBeNull();
});
it('steep sets the sticky target, clamped to the taps; night, Gear and people only', () => {
  const s = gearNight(['c1']);
  expect(steepTarget(s)).toBe(8);                       // absent = full cap
  expect(step(s, [{ kind: 'steep', playerId: 'p1', cups: 20 }]).steep).toBe(8);
  expect(step(s, [{ kind: 'steep', playerId: 'p1', cups: 5 }]).steep).toBe(5);
  const none = gearNight([]);                           // no tap: cap 0, input ignored
  expect(step(none, [{ kind: 'steep', playerId: 'p1', cups: 5 }]).steep).toBeUndefined();
  const classic = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
  expect(step(classic, [{ kind: 'steep', playerId: 'p1', cups: 5 }]).steep).toBeUndefined();
});
it('caps add up over taps', () => {
  expect(steepCap(gearNight(['c1', 'c1']))).toBe(16);
  expect(steepCap(gearNight(['c2']))).toBe(16);
});
it('steepPlan: leftovers first, concentrate for the top-up only', () => {
  const s = gearNight(['c1']);
  s.supplies.concentrate = 5;
  s.coldBrewLeft = 2;
  expect(steepPlan(s)).toEqual({ cap: 8, target: 8, leftover: 2, topUp: 6, paid: 5, short: 1 });
});
// condiments.test.ts
it('validates the box input', () => {
  expect(validateInput({ kind: 'condimentBox', playerId: 'p1', boxes: 1 })).toEqual({ kind: 'condimentBox', playerId: 'p1', boxes: 1 });
  for (const boxes of [0, 11, 1.5]) expect(validateInput({ kind: 'condimentBox', playerId: 'p1', boxes } as PlayerInput)).toBeNull();
});
it('a Gear run opens with a full bar and no boxes; classic has neither', () => {
  const s = gearNight([]);
  expect(s.condiments).toEqual({ servings: 20 });
  expect(s.condimentBoxes).toBe(0);
  const c = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 } });
  expect(c.condiments).toBeUndefined();
});
it('buying boxes costs $6 each, night and Gear only, never on credit', () => {
  const s = gearNight([]);
  s.cash = 20;
  const t = step(s, [{ kind: 'condimentBox', playerId: 'p1', boxes: 2 }]);
  expect([t.cash, t.condimentBoxes]).toEqual([8, 2]);
  expect(step(t, [{ kind: 'condimentBox', playerId: 'p1', boxes: 2 }]).condimentBoxes).toBe(2); // $8 < $12
});
it('a carried box goes back to the corner on R, on leaving and at closing (Review Focus 3)', () => {
  for (const how of ['drop', 'leave', 'close'] as const) {
    let s = gearDay([]);
    s.condimentBoxes = 0;
    s.players[0].tool = 'box';
    if (how === 'drop') s = step(s, [{ kind: 'drop', playerId: 'p1' }]);
    if (how === 'leave') s = step(s, [{ kind: 'leave', playerId: 'p1' }]);
    if (how === 'close') finishDay(s);
    expect(s.condimentBoxes).toBe(1);
    expect(s.players[0].tool).toBeNull();
  }
});
it('Gear customers start in the order stage; classic customers have no stage', () => { /* addCustomer on each; expect stage 'order' / undefined */ });
it('tipMul scales the tip', () => { /* same customer, serveCustomer with tipMul 1 and 0.8 on cloned states: tip08 ≈ round2(tip1 * 0.8) ±0.01 */ });
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/sim/steep.test.ts src/sim/condiments.test.ts`. Expected: FAIL
  (missing exports / `validateInput` returns null for the new kinds).

- [ ] **Step 3: Implement**
  - types, tally, `TAP_DRINKS` as in Interfaces; add the six event kinds to `RESERVED_TELE_KINDS` in `src/host/telemetry.ts`.
  - `validate.ts`: `steep` needs integer `0 ≤ cups ≤ STEEP.maxInput`; `condimentBox` needs integer `1 ≤ boxes ≤ CONDIMENTS.maxBoxes`.
  - `applySteepInput` / `applyCondimentBoxInput`: Gear run, `phase === 'night'`, player exists, `connected`, not a bot;
    steep ignores a shop with `steepCap === 0` and stores `min(cups, cap)`; boxes charge `round2(boxes × 6)` only if
    `cash` covers it. Route both in `step.ts` `applyInput`.
  - `gearStart`: `state.condiments = { servings: CONDIMENTS.servings }; state.condimentBoxes = 0`.
  - `drop.ts`: `if (p.tool !== null) { returnTool(state, p); return; }`. `step.ts` `leave` and `closing.ts` players loop:
    `if (p.tool === 'box') returnBox(state, p)` before `clearFloorFields(p)`.
  - `addCustomer` / `spawnInfluencer`: `if (state.gear === true) customer.stage = 'order'`.

- [ ] **Step 4: Run the tests and the suite** — `npx vitest run` and `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(sim): steep and condiment-box night inputs, batch/pickup state fields"`.

---

### Task 2: The pickup counter and condiment bar on the floor

Depends on: Task 1.

**Files:**
- Modify: `src/data/layout.ts`, `src/sim/slots.ts` (`stationsFromSlots`, new `ensureCounterSpots`),
  `src/sim/stations.ts:101-103`, `src/sim/pass.ts:11` (signature only), `src/sim/condiments.ts` (`returnBox` uses `boxCorner`)
- Test: `src/sim/counterSpots.test.ts`

**Interfaces:**
- Produces: `PICKUP_ID = 'pickup'`, `CONDIMENTS_ID = 'condiments'`; `TierLayout` gains `pickup: Vec2`, `condiments: Vec2`,
  `boxCorner: Vec2`. Values, every tier: `pickup {x:5,y:6}`, `condiments {x:4,y:6}`; `boxCorner` = stand `{1,7}`,
  cart `{7,7}`, café `{9,7}` (two tiles left of `mopHome`). The till keeps id `counter` at `{6,6}`.
- Produces: `stationsFromSlots(tier, slots, gear?)` appends, when `gear` is passed (Gear runs), after the counter:
  `{ id: 'pickup', kind: 'counter', pos: pickup }` then `{ id: 'condiments', kind: 'counter', pos: condiments }`
  (idle station fields as for the counter). Classic calls (no `gear`) are unchanged.
- Produces: `ensureCounterSpots(state: GameState): void` — in a Gear run, appends whichever spot station is missing.
- Produces: `counterInteract(state, playerId, at?: Station)`; `interact` passes the station. `at` is unused until Task 7.

- [ ] **Step 1: Write the failing tests**

```ts
it('a Gear shop has the till, then the pickup counter, then the condiment bar; classic has the till only', () => {
  for (const tier of ['stand', 'cart', 'cafe'] as const) {
    const s = createRun({ seed: 7, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0 }, tier, gear: true });
    expect(s.stations.filter((x) => x.kind === 'counter').map((x) => [x.id, x.pos])).toEqual([
      ['counter', { x: 6, y: 6 }], ['pickup', { x: 5, y: 6 }], ['condiments', { x: 4, y: 6 }],
    ]);
  }
  expect(createRun({ seed: 7, hostId: 'p1', players: [], settings: { bots: 0 } }).stations.filter((x) => x.kind === 'counter')).toHaveLength(1);
});
it('every spot has a barista tile; the door, rogue start and both corners stay clear', () => {
  for (const tier of ['stand', 'cart', 'cafe'] as const) {
    const s = /* Gear run at `tier`, every slot filled with gear (e.g. c1/e1/s1/b0 + d1/g1 where slots allow) */;
    for (const id of ['counter', 'pickup', 'condiments']) expect(targetNodes(s, s.stations.find((x) => x.id === id)!, LAYOUT.door).length).toBeGreaterThan(0);
    expect(findPath(s, LAYOUT.rogueStart, LAYOUT.door)).not.toBeNull();
    expect(nearestStation(s, layoutFor(tier).boxCorner)).toBeNull();
    expect(nearestStation(s, layoutFor(tier).mopHome)).toBeNull();
  }
});
it('growing and gear deals keep the spots; ensureCounterSpots adds missing ones once', () => { /* grow stand→cart, buy c1: ids present; strip spots, ensure twice: one of each */ });
it('the till is still the first counter-kind station (eggs, idle nodes)', () => { /* s.stations.find(kind 'counter').id === 'counter' */ });
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/sim/counterSpots.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the layout fields, the spot stations, `ensureCounterSpots`, the `counterInteract` param.
- [ ] **Step 4: Run the suite.** Expected fallout: tests that list a Gear shop's stations or count them; update them to
  include the two spots (assertions only, no behaviour). `npx vitest run`, `npx tsc --noEmit`: PASS.
- [ ] **Step 5: Commit** — `feat(sim): pickup counter and condiment bar spots in Gear shops`.

---

### Task 3: Instant cold brew from the steeped tap (Track A)

Depends on: Task 2.

**Files:**
- Modify: `src/sim/gear.ts` (`gearRecipe`, new tap helpers), `src/sim/stations.ts` (`interact`, lines ~119–148 only),
  `src/sim/customers.ts` (`availableDrinks`), `src/sim/slots.ts` (`reasonOff`), `src/sim/rogue.ts` (`make`)
- Test: `src/sim/tapPour.test.ts`; update `src/sim/gear.test.ts` ("cold brew batch caps")

**Interfaces:**
- Produces (`gear.ts`): `TAP_POUR: Recipe = { takes: null, gives: 'coldBrew', consumes: [] }`; `gearRecipe` returns
  `TAP_POUR` for a `coldBrewTap` with gear and empty hands (bots that read `gearRecipe`/`recipeAt` then see a stocked recipe);
  `tapCupRecipe(r: Recipe): boolean` (`r.gives === 'coldBrew' || r.gives === 'icedLatte'`);
  `takeTapCup(s: Station): boolean` (false at 0/absent; else `batchLeft -= 1`, `batchOld -= 1` when > 0, delete at 0);
  `gearTapPour(state, s, p): boolean`; `drinkSuppliesFor(state, d): SupplyId[]` (Gear: `ECONOMY.drinkSupplies[d]` without
  `'concentrate'`; classic: unchanged).
- `gearTapPour` returns false unless Gear, `s.kind === 'coldBrewTap'`, `s.gear`, empty hands, no tool, `busyTicksLeft === 0`,
  `output === null`. Otherwise it returns true, and when `takeTapCup(s)` succeeds: `p.holding = 'coldBrew'`, `p.cupSlips =
  gearMarks(s)` (deleted when 0), `delete p.cupTemp`, then `gearAfterUse(state, s, p)`.
- `interact`: call `if (gearTapPour(state, station, player)) return state;` after the early-pull branch and before
  `const idle`. The recipe branch keeps its recipe line as is (it becomes `recipeAt(...)` once `bots-gear-stations` merges);
  change only the batch checks: start when `station.batchLeft !== 0 || !tapCupRecipe(recipe)`, and replace the
  `batchLeft -= 1` with `if (tapCupRecipe(recipe)) takeTapCup(station)` (the iced-latte step uses a steeped cup, the
  sweet-cream step does not).
- `availableDrinks` / `reasonOff`: supplies via `drinkSuppliesFor`; sold out when `batchOut(state) && TAP_DRINKS.includes(d)`.
- `rogue.ts make`: supplies via `drinkSuppliesFor`; in Gear, a rogue making a `TAP_DRINKS` drink at a tap calls `takeTapCup(st)`.

- [ ] **Step 1: Write the failing tests**

```ts
it('one press pours a cold brew at once, no concentrate, the C1 lint on the cup', () => {
  const s = gearDay(['c1'], { concentrate: 10 });
  const tap = s.stations.find((x) => x.kind === 'coldBrewTap')!;
  tap.batchLeft = 8; s.supplies.concentrate = 0;
  stand(s, tap.id); interact(s, 'p1');
  expect([s.players[0].holding, s.players[0].cupSlips, tap.busyTicksLeft, tap.batchLeft]).toEqual(['coldBrew', 1, 0, 7]);
  expect(availableDrinks(s)).toContain('coldBrew');
});
it('yesterday\'s cups pour first', () => { /* batchLeft 5, batchOld 2: three pours → batchOld undefined, batchLeft 2 */ });
it('an empty tap pours nothing and sells out every tap drink', () => {
  /* batchLeft 0: interact → holding null; with icedLatte/sweetCream/special unlocked and on the menu, none in availableDrinks; reasonOff(s,'icedLatte') === 'noStock' */
});
it('the iced latte step takes a steeped cup; the sweet-cream step does not', () => {
  /* holding 'espresso', milk 5, batchLeft 1 → after interact batchLeft 0 and busy; holding 'coldBrew' with sweetCream unlocked, batchLeft 0 → busy, batchLeft 0; holding 'espresso' at batchLeft 0 → refused (still holding) */
});
it('classic taps still brew for 1.5 s and use concentrate', () => { /* classic run: busyTicksLeft 90, concentrate − 1 */ });
it('a drip pot pours a cup on every press, no waiting', () => { /* d1 brewed (potLeft 4): four presses on four consecutive ticks each hand a drip, potLeft 3,2,1,undefined */ });
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/sim/tapPour.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. In `gear.test.ts` "cold brew batch caps", the tap press at `batchLeft 0` now
  leaves `[busyTicksLeft, concentrate]` unchanged for a different reason; keep the assertion.
- [ ] **Step 4: Run the suite.** Bot-driven Gear tests may shift (bots now get the cup on the insert step and drop the
  claim on the following take); adjust thresholds only where that is the cause, and say so in the commit. PASS.
- [ ] **Step 5: Commit** — `feat(sim): steeped cold brew pours instantly in Gear runs`.

---

### Task 4: Steeping at night: morning top-up, leftovers, closing (Track A)

Depends on: Task 3.

**Files:**
- Modify: `src/sim/steep.ts` (add `steepMorning`, `steepClosing`), `src/sim/gear.ts` (`gearMorning`),
  `src/sim/closing.ts` (one call), `src/data/gear.ts` (C4/C5)
- Test: `src/sim/steep.test.ts`; update `src/sim/gear.test.ts`, `src/sim/gearG5.test.ts` (crack test)

**Interfaces:**
- Consumes: `steepPlan`, `tapCap` (Task 1), `takeTapCup` semantics (Task 3).
- Produces: `steepMorning(state): void` — Gear with `cap > 0`: charge `plan.paid` concentrate; fill taps in station
  (slot) order up to each `tapCap`, old cups first then fresh; set each tap's `batchLeft` (0 allowed) and `batchOld`
  (deleted when 0); delete `coldBrewLeft`; emit `steep { cups: leftover + paid, paid }`; when `short > 0` push the note
  `Only ${paid} of ${topUp} cold brews could steep: not enough concentrate.`; when `coldBrewLeft > cap` push
  `${n} cups of yesterday's cold brew had no tap to go in and were poured out.` With `cap === 0`, the same note for any
  `coldBrewLeft`, then delete it.
- Produces: `steepClosing(state): void` — Gear: for each tap, `batchOld` cups are poured out (`tally(today, 'wasted', n)`),
  the rest is added to `state.coldBrewLeft` (absent when 0); delete the tap's `batchLeft`/`batchOld`.
- `gearMorning`: call `steepMorning(state)` before the per-station loop; remove the `batchLeft = cap / delete` lines; the
  crack quirk keeps its draw and now does `batchLeft = max(0, batchLeft - crackLoss)` then
  `batchOld = min(batchOld, batchLeft)`.
- `finishDay`: `steepClosing(state)` right after the `judgeInspection` line (the inspector never sees closing waste).
- `src/data/gear.ts`: `c4.batch = 60`, `c5.batch = 60`; c4 blurb `'A real tap. Steep up to 60 cups a night.'`.

- [ ] **Step 1: Write the failing tests**

```ts
it('the morning tops the tap up to the target and charges concentrate for fresh cups only', () => {
  const s = gearDay(['c1'], { concentrate: 10 });
  const tap = s.stations.find((x) => x.kind === 'coldBrewTap')!;
  expect([tap.batchLeft, s.supplies.concentrate]).toEqual([8, 2]);
  expect(s.log.find((e) => e.kind === 'steep')?.data).toEqual({ cups: 8, paid: 8 });
});
it('a lower target steeps fewer; the number sticks to the next night', () => { /* steep 5 at night → batchLeft 5, concentrate −5; s.steep still 5 after startDay */ });
it('short on concentrate: steeps what it can and says so', () => {
  /* concentrate 3 → batchLeft 3, note 'Only 3 of 8 cold brews could steep: not enough concentrate.', event { cups: 3, paid: 3 } */
});
it('leftovers keep one day, then pour out at closing', () => {
  /* day 1: batchLeft 5 left at finishDay → coldBrewLeft 5, tap batchLeft undefined, wasted +0;
     next startDay with concentrate 10 → batchLeft 8, batchOld 5, concentrate −3;
     at the next closing with batchLeft 6, batchOld 2 → wasted +2, coldBrewLeft 4 */
});
it('two taps pool the target in slot order', () => { /* c1 + c1, steep 12 → first tap 8, second 4 */ });
it('more leftovers than the tap holds: the rest is poured out with a note (Review Focus 1)', () => {
  /* c1, coldBrewLeft 20 → batchLeft 8, batchOld 8, concentrate unchanged, note '12 cups … poured out';
     no tap at all: coldBrewLeft 5 → deleted, note, no throw, no negative numbers */
});
it('C4 and C5 steep up to 60', () => { /* steepCap(gearNight(['c4'])) === 60 */ });
```

- [ ] **Step 2: Run to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update `gear.test.ts` (`concentrate` after `startDay` is now 42, not 50) and the G5 crack
  test (`j.supplies.concentrate = 10_000` before the loop; a cracked C2 morning reads `batchLeft === 12`).
- [ ] **Step 4: Run the suite**: PASS.
- [ ] **Step 5: Commit** — `feat(sim): cold brew steeped at night with leftovers and pour-out`.

---

### Task 5: Gear patience by drink (Track A)

Depends on: Task 4.

**Files:**
- Modify: `src/data/drinks.ts` (`GEAR_WAIT`), `src/sim/customers.ts` (`drinkWait`, `addCustomer`)
- Test: `src/sim/gearPatience.test.ts`

**Interfaces:**
- Produces: `GEAR_WAIT: Record<DrinkId, number>` = `{ drip: 0.9, coldBrew: 0.9, sweetCream: 1, cafeAuLait: 1, espresso: 1.3,
  americano: 1.3, doppio: 1.4, redEye: 1.4, latte: 1.4, icedLatte: 1.4, matcha: 1.4, cappuccino: 1.5, mocha: 1.5,
  special: 1.5, pourOver: 1.7 }`; `drinkWait(state, d): number` = Gear ? `GEAR_WAIT[d]` : `DRINK_INFO[d].wait ?? 1`.
- `addCustomer`: `wait = max over drinks of drinkWait(state, d) * pricePatience(state, d)`. The influencer is unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
const solo = (d: DrinkId, gear = true) => { /* night run; s.unlocked = [d]; menu only d; supplies 50 each; startDay; s.customers = [] */ };
it('a Gear customer waits 33 s × modifiers × the drink\'s pace', () => {
  for (const d of ['drip', 'espresso', 'latte', 'cappuccino', 'pourOver'] as DrinkId[]) {
    const s = solo(d);
    const c = addCustomer(s, 'normal')!;
    expect(c.patienceMax).toBe(Math.round(ECONOMY.patienceSeconds * computeModifiers(s).patience * GEAR_WAIT[d] * areaPatienceMul(s, [d]) * TICK_RATE));
  }
});
it('a group waits as long as its slowest order', () => { /* menu drip + pourOver, force a group of [drip, pourOver] via a seed search: patienceMax uses 1.7 × group 1.3 */ });
it('classic keeps DRINK_INFO wait', () => { /* classic icedLatte customer: × 1.15 */ });
```

- [ ] **Step 2: Run to verify they fail.** **Step 3: Implement.** **Step 4: Run the suite** (Gear patience totals shift
  in crowd/balance tests: update numbers that are pure patience arithmetic). **Step 5: Commit** —
  `feat(sim): Gear patience table by drink (batch fast, handmade slow)`.

---

### Task 6: The till rings customers through to pickup (Track B)

Depends on: Task 2.

**Files:**
- Modify: `src/sim/till.ts`
- Test: `src/sim/gearTill.test.ts` (update)

**Interfaces:**
- Produces: `TILL.patienceBoost = 0.5`; `tillNext(state)`: Gear, not a camper, `(c.stage ?? 'order') === 'order'`, not upset,
  `rungAt === undefined`, first in line. `tillRingUp(state, playerId)`: any player (bots too) with empty hands and no tool;
  sets `rungAt`, `stage = 'pickup'`, `patienceLeft = min(max, left + 0.5 × max)`, emits
  `till.rung { customer: c.id, drink: c.drink, by }` and keeps the `gear.quirk` line with the tail
  `Set it on the pickup counter fast for a tip.`

- [ ] **Step 1: Update the tests**

```ts
it('ringing up moves the customer to pickup with +50% patience, in line order', () => {
  /* a: 50/100 → 100, stage 'pickup', rungAt tick; b: 20/100 → 70; log has till.rung { customer: 901, drink: 'coldBrew', by: 'p1' } */
});
it('the till skips campers, upset customers and anyone already at pickup; classic never rings', () => { /* tillNext undefined cases */ });
it('bots ring too', () => { /* p1 with a bot field: counterInteract rings */ });
```

- [ ] **Step 2: Run to verify they fail.** **Step 3: Implement.** **Step 4: Run the suite.** **Step 5: Commit** —
  `feat(sim): till rings customers to pickup (+50% patience, bots may ring)`.

---

### Task 7: Pickup counter: set drinks down, customers take them (Track B)

Depends on: Task 6. Merges to `main` only together with Task 13 (see Parallel tracks).

**Files:**
- Create: `src/sim/pickup.ts`
- Modify: `src/sim/pass.ts` (`counterInteract` Gear branch), `src/sim/eggs.ts` (`tryCorrectName`), `src/sim/drop.ts`
  (counter drop), `src/sim/step.ts` (one call)
- Test: `src/sim/pickup.test.ts`; update Gear tests that hand-serve (`gearHalfTip.test.ts` and any other Gear test whose
  serve goes through `counterInteract` with a drink): put + ring + `stepPickup`.

**Interfaces:**
- Produces: `PICKUP = { slots: 4 } as const`; `type CounterSpot = 'till' | 'pickup' | 'condiments'`;
  `spotOf(at?: Station): CounterSpot` (absent or id `counter` = till); `passSlots(state): number` (Gear 4, classic
  `ECONOMY.pass.slots`); `wantsDrink(c: Customer, d: DrinkId): boolean` (`c.drink === d || c.extra?.includes(d)`);
  `pickupTarget(state, drink): Customer | null` (stage `pickup`, not a camper, wants it; upset first, then lowest `rungAt`,
  then lowest id); `stepPickup(state): void`.
- `counterInteract` in Gear (classic path unchanged): grounds do nothing. A drink in hand at any counter spot (the till,
  the pickup counter or the bar: one long counter) goes on the pickup counter when `pass.length < passSlots(state)`:
  push `{ item, ticksLeft, slips?, temp?, by: playerId }`, clear the hand, emit `pass.put`. Empty hands: till →
  `tryKickCamper`, then `tillRingUp`; pickup → `tryCorrectName(state, playerId, at)`, then take the stalest item back
  (`pass.take`); bar → nothing.
- `stepPickup` (Gear only; call it in `stepDay` right after `resolveDrops(s)`): repeatedly, over pass items stalest first,
  give the first item that has a `pickupTarget` to that customer: remove it; if the drink is in `extra`, swap it with
  `c.drink`; emit `pickup.take { drink, customer: c.id, by: item.by ?? '' }`; `serveCustomer(state, c, drink, item.by,
  item.slips ?? 0, item.temp === true)`. Stop when no item has a target.
- `tryCorrectName(state, playerId, at?: Station)`: range is checked against `at` when given, else the till.
- `drop.ts`: in Gear, R at the till or pickup counter puts the drink on the pickup counter (with `by`, limit
  `passSlots`); at the bar nothing.

- [ ] **Step 1: Write the failing tests**

```ts
it('a drink set on the pickup counter waits for its customer to be rung (Review Focus 2)', () => {
  let s = gearDay(['c1', 'e1'], { beans: 9, milk: 9 });
  s.customers = [{ id: 1, drink: 'espresso', patienceLeft: 900, patienceMax: 1800, stage: 'order' }];
  stand(s, 'pickup'); s.players[0].holding = 'espresso';
  s = step(s, [{ kind: 'move', playerId: 'p1', x: 0, y: 0, interact: true }]);
  expect([s.pass.length, s.today.served, s.pass[0].by]).toEqual([1, 0, 'p1']);
  stand(s, 'counter');
  s = step(s, [{ kind: 'move', playerId: 'p1', x: 0, y: 0, interact: true }]);
  expect([s.pass.length, s.today.served, s.customers.length]).toEqual([0, 1, 0]);
  const kinds = s.log.map((e) => e.kind);
  expect(kinds.indexOf('till.rung')).toBeLessThan(kinds.indexOf('pickup.take'));
  expect(s.log.find((e) => e.kind === 'pickup.take')?.data).toEqual({ drink: 'espresso', customer: 1, by: 'p1' });
});
it('the till and the bar also set a drink down; the counter holds 4 in Gear, 3 in classic', () => { /* 5th stays in hand */ });
it('the customer who has waited longest at pickup takes it; an upset one first', () => { /* rungAt 10 vs 20; then an upset one */ });
it('a group takes each drink as it lands and leaves when all are taken (Review Focus 4)', () => {
  /* group { drink: 'latte', extra: ['coldBrew'], stage: 'pickup', rungAt }: coldBrew put → served 1, customer stays with drink 'latte', extra [];
     latte put → served 2, gone */
});
it('the speed tip runs from ring-up to pickup', () => { /* taken within 30 s → served event till: 0.5 */ });
it('giving up at pickup is a lost customer', () => { /* patienceLeft 1 at pickup → stepCustomers → today.lost 1 */ });
it('empty hands at pickup take a drink back; at the till with nobody to ring, nothing happens', () => {});
it('the name mix-up fires at pickup and is fixed there', () => { /* nameMix customer takes → upset, no pay; empty hands at pickup clear egg */ });
it('R at pickup or the till sets the drink down; R at the bar does not', () => {});
it('an untaken drink still goes stale', () => { /* stepPass to 0 → wasted 1 */ });
```

- [ ] **Step 2: Run to verify they fail.** **Step 3: Implement.**
- [ ] **Step 4: Run the suite.** Bot-driven Gear tests that fail because bots do not ring or use the pickup counter yet
  are expected (Task 13 restores them): list each in the commit message and leave them failing on this branch only.
  All non-bot tests: PASS.
- [ ] **Step 5: Commit** — `feat(sim): order at the till, take from the pickup counter (Gear)`.

---

### Task 8: Carry a box to the condiment bar (Track C)

Depends on: Task 2.

**Files:**
- Modify: `src/sim/condiments.ts` (`takeBox`, `refillBar`), `src/sim/mop.ts` (`mopInteract` routing)
- Test: `src/sim/condiments.test.ts`

**Interfaces:**
- Produces: `takeBox(state, p): boolean` (Gear, empty hands, no tool, `condimentBoxes > 0`, within
  `ECONOMY.interactRangeTiles` of `boxCorner` → `tool = 'box'`, `condimentBoxes -= 1`);
  `refillBar(state, p): boolean` (tool `box`, `nearestStation(state, p.pos)?.id === CONDIMENTS_ID`,
  `servings < CONDIMENTS.servings` → `servings = 20`, `tool = null`, emit `condiment.refill { by: p.id }`).
- `mopInteract`: with tool `box` → `refillBar` and return. Empty hands with no tool: take a box when the box corner is
  strictly nearer than the mop (and in range), else the mop rule as today, and if that took nothing try `takeBox`.

- [ ] **Step 1: Write the failing tests**

```ts
it('empty hands at the corner pick up a box; none left, nothing', () => { /* boxes 2 → tool 'box', boxes 1; boxes 0 → tool null */ });
it('between the mop and the boxes, the nearer wins; a tie goes to the mop', () => {});
it('a box at the bar refills it to 20; a full bar keeps the box; elsewhere nothing', () => {
  /* servings 3 at the bar → 20, tool null, event condiment.refill { by: 'p1' } */
});
it('hands full: a box blocks every station', () => { /* tool 'box' at the tap: holding stays null, batchLeft unchanged */ });
```

- [ ] **Step 2–5:** fail, implement, suite PASS, commit `feat(sim): condiment boxes are carried to the bar`.

---

### Task 9: Night brief: steep and condiment alerts (Track C)

Depends on: Task 8.

**Files:**
- Modify: `src/sim/brief.ts` (header comment ids too)
- Test: `src/sim/briefGear.test.ts`

**Interfaces:**
- Produces: `expectedOrders(state): Record<DrinkId, number>` (unrounded expected orders per menu drink; 0 off the menu);
  `expectedUse` is rewritten on top of it with identical results.
- Gear runs: the per-supply stock loop skips `'concentrate'`. Steep alert when `steepPlan(state).cap > 0 && short > 0`:
  `{ id: 'steep', kind: 'stock', severity: have === 0 ? 'danger' : 'warn', text: \`Only ${leftover + paid} of ${target}
  cold brews will be ready tomorrow: concentrate is short\`, fix: restockFix(state, 'concentrate', ceil(short / 10)) }`.
  Condiment alert when `state.condiments` exists and `use > have`, with
  `use = ceil(CONDIMENTS.share × (orders.drip + orders.coldBrew))`, `have = servings + condimentBoxes × 20`:
  `{ id: 'condiments', kind: 'stock', severity: 'warn', text: \`Cream and sugar run out tomorrow: ${have} servings for about
  ${use} drip and cold brew drinkers\`, fix: { kind: 'condimentBox', boxes: n } }` with `n = ceil((use − have) / 20)`, the fix
  left off when `cash < n × 6`. Both go right after the stock alerts.

- [ ] **Step 1: Write the failing tests**

```ts
it('expectedUse is unchanged for a classic run', () => { /* equals the pre-refactor numbers captured from main for seed 5 */ });
it('warns when tomorrow\'s steep can\'t be paid, with a concentrate restock', () => {
  /* c1, concentrate 3: alert steep, warn, 'Only 3 of 8 cold brews will be ready tomorrow: concentrate is short', fix restock concentrate 1;
     concentrate 0 → danger; concentrate 10 → no steep alert; never a 'stock:concentrate:*' alert in a Gear run */
});
it('warns when the bar will run dry, with a box fix', () => { /* c1 + d1 on the menu, servings 2, boxes 0 → condiments alert, fix boxes n; one box covering → none; cash 0 → no fix */ });
```

- [ ] **Step 2–5:** fail, implement, suite PASS, commit `feat(sim): night brief warns about steep and condiments`.

---

### Task 10: The condiment stop at pickup (join of B and C)

Depends on: Task 7, Task 8. Merges with Task 7.

**Files:**
- Modify: `src/sim/condiments.ts`, `src/sim/pickup.ts` (the take in `stepPickup`)
- Test: `src/sim/condimentStop.test.ts`

**Interfaces:**
- Produces: `condimentRoll(cid: number, left: number): number` in `[0, 1)` =
  `(Math.imul(cid * 8 + left + 1, 2654435761) >>> 0) / 4294967296`;
  `wantsCondiments(state, c, drink): boolean` = Gear, `state.condiments` present, `drink` is `'drip'` or `'coldBrew'`,
  `condimentRoll(c.id, c.extra?.length ?? 0) < CONDIMENTS.share`;
  `noteCondiments(state, c, black: boolean): void` (black → `tally(today, 'blackCoffees')`, emit
  `condiment.black { customer: c.id, text: BLACK_LINES[c.id % 3] }`; else `servings -= 1`, emit
  `condiment.use { customer: c.id }`), with
  `BLACK_LINES = ['"No milk? Fine. Black it is."', '"Out of sugar. Bold choice."', '"Guess I take it black now."']`.
- In `stepPickup`, before paying: `want = wantsCondiments(...)` (roll uses `extra.length` before the swap);
  `black = want && servings <= 0`; pay with `tipMul = black ? CONDIMENTS.blackTip : 1`; only when `today.served` went up,
  `if (want) noteCondiments(state, c, black)`.

- [ ] **Step 1: Write the failing tests**

```ts
it('about 60% of plain drip and cold brew drinkers want condiments; nobody else', () => {
  let n = 0; for (let id = 1; id <= 1000; id++) if (condimentRoll(id, 0) < 0.6) n++;
  expect(n).toBeGreaterThan(550); expect(n).toBeLessThan(650);
  /* latte, sweetCream, pourOver: wantsCondiments false for every id */
});
it('a wanting customer uses a serving at pickup', () => { /* servings 20 → 19, condiment.use */ });
it('an empty bar means black coffee: tip × 0.8 and a grumble', () => {
  /* same wanting customer on two clones, servings 20 vs 0: tipBlack within 0.01 of round2(tipFull × 0.8); blackCoffees 1; condiment.black text from BLACK_LINES */
});
it('a refused cup (name mix-up) uses no serving', () => {});
```

- [ ] **Step 2–5:** fail, implement, suite PASS (bot failures from Task 7 aside), commit
  `feat(sim): drip and cold brew drinkers stop at the condiment bar`.

---

### Task 11: Saves: snapshot v28 migration (Track S)

Depends on: Task 2.

**Files:**
- Modify: `src/storage/snapshotStore.ts`
- Test: `src/storage/stores.test.ts`, `src/storage/oldSaves.test.ts`

**Interfaces:**
- Produces: `SNAPSHOT_VERSION = 28`; `MIGRATIONS[27]`: Gear saves only (`s.gear === true`): every customer gets
  `stage = 'order'` and loses `rungAt`; `condiments ??= { servings: 20 }`; `condimentBoxes ??= 0`; `steep` stays absent
  (= the gear's cap); `ensureCounterSpots(s)`. Classic saves: nothing.

- [ ] **Step 1: Write the failing tests**

```ts
it('pins the snapshot version', () => expect(SNAPSHOT_VERSION).toBe(28));
it('a mid-day v27 Gear save puts rung customers back in line (Review Focus 5)', () => {
  const s = /* Gear day state; customers [{ id: 1, drink: 'latte', patienceLeft: 500, patienceMax: 900, rungAt: 3 }]; delete condiments, condimentBoxes; strip spot stations */;
  const m = migrateSnapshot(27, s)!;
  expect(m.customers[0]).toMatchObject({ stage: 'order' });
  expect(m.customers[0].rungAt).toBeUndefined();
  expect(tillNext(m)?.id).toBe(1);
  expect([m.condiments, m.condimentBoxes, m.steep]).toEqual([{ servings: 20 }, 0, undefined]);
  expect(m.stations.map((x) => x.id)).toEqual(expect.arrayContaining(['pickup', 'condiments']));
});
it('a v27 classic save gains nothing', () => {});
// oldSaves.test.ts, v3.1.0 night fixture: after load, s.condiments toEqual { servings: 20 } and the spot ids are present (before nextNight)
```

- [ ] **Step 2–5:** fail, implement, suite PASS, commit `feat(storage): snapshot v28 migrates Gear saves to the pickup flow`.

---

### Task 12: Planner: steep number and condiment boxes (Track D)

Depends on: Task 4, Task 9.

**Files:**
- Modify: `src/sim/bots/planner.ts` (header table too)
- Test: `src/sim/bots/plannerBatch.test.ts`

**Interfaces:**
- Produces: `PLAN_PRIORITY.steep = 86`, `PLAN_PRIORITY.condimentBox = 84`; `STEEP_MARGIN = 1.2`;
  `restockAdvice(state, budget, targets?: Partial<Record<SupplyId, number>>)` (a target replaces `use × RESTOCK_MARGIN`).
- In Gear, `planNight`: `want = min(steepCap, ceil(Σ_{d ∈ TAP_DRINKS} expectedOrders[d] × STEEP_MARGIN))`; restock passes
  `{ concentrate: max(0, want − leftover) }`; then `n = min(want, leftover + concentrate + 10 × packs bought by
  restock:concentrate)`; advice `{ id: 'steep', kind: 'restock', text: \`Steep ${n} cold brews for tomorrow (about ${round(Σ)}
  cold brew orders expected)\`, input: { kind: 'steep', cups: n }, priority: 86 }` only when `n !== steepTarget(state)`.
  Box advice with the Task 9 `use`/`have`, `n` boxes within the budget:
  `{ id: 'condimentBox', kind: 'restock', text: \`Buy ${n} condiment ${n === 1 ? 'box' : 'boxes'} (${dollars(6n)}): the bar
  runs dry tomorrow\`, input: { kind: 'condimentBox', boxes: n }, priority: 84 }`. Classic: neither.

- [ ] **Step 1: Write the failing tests** — steep advice equals the formula and is capped at 8 for a C1; no advice when
  the target already matches; with `cash` = bills only, `n = leftover + concentrate`; box advice appears for a low bar and
  not for a covered one; applying every advice never spends more than `cash − billsForDay`; a classic run has neither id.
- [ ] **Step 2–5:** fail, implement, suite PASS, commit `feat(planner): steep number and condiment box advice`.

---

### Task 13: Bots ring up and set drinks on the pickup counter (Track D)

Depends on: Task 7, Task 10, and `bots-gear-stations` merged into `main`.

**Files:**
- Modify: `src/sim/bots/brain.ts`, `src/sim/types.ts` (`BotAction` gains `'ring'`)
- Test: `src/sim/bots/pickupBots.test.ts`

**Interfaces:**
- Consumes: `PICKUP_ID`, `passSlots`, `tillNext`.
- Produces: `spotStep(state, id: string, action: BotAction): BotStep | null` (a `use` step on that station id, null when
  the shop has none). In Gear runs: `chainFor`'s last step (both `serve` and `put`) is `spotStep(state, PICKUP_ID, 'put')`;
  `dropPlan` puts drinks there; `think` rule 0 (drink in hand) → pickup put while `state.pass.length < passSlots(state)`,
  else the bin; the pass-serve rule 1 is replaced by: `tillNext(state)` exists and no other bot's plan has a `ring` step →
  `[spotStep(state, 'counter', 'ring')]`; `act` case `ring`: empty hands, no tool and `tillNext(state)` → `execute`, else
  `setPlan(b, [])`. `ECONOMY.pass.slots` reads in brain become `passSlots(state)`. Classic plans are unchanged.

- [ ] **Step 1: Write the failing tests** — `chainFor` in Gear ends `{ station: 'pickup', action: 'put' }` and in classic
  `{ station: 'counter', action: 'serve' }`; a bot with empty hands and an unrung customer plans `[ring at counter]`, and
  a second bot does not; integration: Gear stand run (C1 + E1, stocked), one stand-in, 60 s of day → `served > 0`, no
  `pass.serve` events, every `served` customer id has a `till.rung` before it.
- [ ] **Step 2–3:** fail, implement. **Step 4:** full suite now PASSES, including the bot tests listed in Task 7's commit.
- [ ] **Step 5: Commit** — `feat(bots): ring up the queue and put drinks on the pickup counter`.

---

### Task 14: Bots at the steeped tap (Track D)

Depends on: Task 13, Task 4.

**Files:** Modify `src/sim/bots/brain.ts`. Test: `src/sim/bots/pickupBots.test.ts`.

**Interfaces:**
- Consumes: `tapCupRecipe`, `TAP_POUR` (Task 3).
- In Gear: a cold brew from empty hands at a gear tap is one `insert` step with `makes: 'coldBrew'` (no `take`: the cup is in
  hand at once); station checks that read `batchLeft === 0` / `!== 0` apply only when `tapCupRecipe(r)`; cold brew prep
  (`shouldPrep`) is off.

- [ ] **Step 1: Write the failing tests** — Gear `chainFor(.., 'coldBrew', ..)` = `[tap insert makes coldBrew, pickup put]`;
  a bot pours with `concentrate 0` and `batchLeft 3`; a sweet-cream chain from cold brew in hand is planned at `batchLeft 0`;
  `shouldPrep` is false in Gear.
- [ ] **Step 2–5:** fail, implement, suite PASS, commit `feat(bots): pour steeped cold brew in one step`.

---

### Task 15: Bots carry the condiment box (Track D)

Depends on: Task 14, Task 8.

**Files:** Modify `src/sim/bots/brain.ts`, `src/sim/types.ts` (`BotAction` gains `'refill'`, `FloorAction` gains
`'takeBox'`). Test: `src/sim/bots/pickupBots.test.ts`.

**Interfaces:**
- `think` rule 0: tool `box` → `[spotStep(state, CONDIMENTS_ID, 'refill')]`. After the order and prep rules, before
  mopping: bar `servings === 0`, `condimentBoxes > 0` and no other bot plans `takeBox` →
  `[{ kind: 'floor', node: nodeOf(state, boxCorner), action: 'takeBox' }, spotStep(state, CONDIMENTS_ID, 'refill')]`.
  `stepFloor` `takeBox`: press when in range with empty hands, no tool and boxes left, else drop the plan. `act` `refill`:
  tool `box` → `execute`, else abandon. A bot that loses the plan with a box in hand uses the floor `drop` (returns it).

- [ ] **Step 1: Write the failing tests** — an idle bot with an empty bar and one box plans takeBox + refill and, stepped,
  leaves the bar at 20 and the corner at 0; with servings > 0 it does not; two bots never both plan it.
- [ ] **Step 2–5:** fail, implement, suite PASS, commit `feat(bots): restock the condiment bar from the box corner`.

---

### Task 16: Scripts, balance check, protocol bump, docs

Depends on: every task above.

**Files:**
- Modify: `scripts/gearBalance.ts`, `scripts/p4Smoke.ts`, `src/net/protocol.ts`, `src/net/protocol.test.ts`,
  `CHANGELOG.md`, `docs/BACKLOG.md`
- Test: `src/p4Smoke.test.ts` (existing; must pass)

**Interfaces:**
- `gearBalance.ts` night stage 99: after the restock inputs, append the inputs of `planNight(state)` advice with ids
  `steep` and `condimentBox` (with `playerId: by`). The result row gains `black` (sum of `blackCoffees`).
- `p4Smoke.ts` `problems`: add `bar out of range` when `condiments.servings` is outside 0..20 or `condimentBoxes < 0`.
- `PROTOCOL_VERSION = 41` with the comment prefix `41: batch coffee + pickup counter + condiment bar (steep/condimentBox
  inputs, Customer.stage, PassItem.by, steep/coldBrewLeft/condiments/condimentBoxes, Station.batchOld, tool 'box', new
  events).`

- [ ] **Step 1: Baseline.** `git worktree add ../ct-base 4e382a0`, then in it run `npx tsx scripts/gearBalance.ts 28 3` and
  `npx tsx scripts/p4Smoke.ts 28 3`; keep both outputs outside the repo.
- [ ] **Step 2: Update the scripts and the protocol pin** (`protocol.test.ts` expects 41). Run `npx vitest run`: PASS.
- [ ] **Step 3: Balance.** On the merged branch run `npx tsx scripts/gearBalance.ts 28 3` and `npx tsx scripts/p4Smoke.ts 28 3`.
  Expected: p4Smoke prints `OK`; no row bankrupt that was solvent at baseline; per row, `lost / (served + lost)` within 10
  points of baseline. Anything outside goes to Kennedy with both tables; do not retune the spec values silently.
- [ ] **Step 4: Docs.** `CHANGELOG.md` Unreleased: one player-facing line each for steeping at night, instant pours, the
  pickup counter, the condiment bar and box, and the patience table. `docs/BACKLOG.md`: a UI-lane handoff listing the
  events, state fields, spot ids/tiles and box corner, the stand queue slots (5,7.6)/(4,7.6) that now sit in front of the
  pickup counter, and the balance numbers.
- [ ] **Step 5: Verify and commit** — `npx vitest run`, `npm run build`; commit
  `chore: protocol 41, balance crews for the pickup flow, changelog`; tag nothing (release is Kennedy's call).

---

## Parallel tracks

| Track | Tasks | Files it owns (after the foundation) |
|---|---|---|
| Foundation (sequential, first) | 1 → 2 | the hub files: `types.ts`, `validate.ts`, `step.ts`, `closing.ts` (box), `tally.ts`, `layout.ts`, `slots.ts` (`stationsFromSlots`), `drinks.ts` (`TAP_DRINKS`), `telemetry.ts` |
| A: batch pours, steeping, patience | 3 → 4 → 5 | `steep.ts`, `gear.ts`, `stations.ts`, `customers.ts`, `slots.ts` (`reasonOff`), `rogue.ts`, `closing.ts` (steep), `data/gear.ts`, `data/drinks.ts` |
| B: till and pickup | 6 → 7 | `till.ts`, `pass.ts`, `pickup.ts`, `eggs.ts`, `drop.ts`, `step.ts` |
| C: condiment bar, box, brief | 8 → 9 | `condiments.ts`, `mop.ts`, `brief.ts` |
| S: saves | 11 | `snapshotStore.ts`, storage tests |
| Join | 10 (after 7 and 8) | `condiments.ts`, `pickup.ts` |
| D: planner, bots, wrap-up | 12; 13 → 14 → 15; 16 | `planner.ts`; `brain.ts`, `types.ts` (bot actions); scripts, protocol, docs |

Merge order: 1 → 2 to `main`. Then A (3, 4, 5), task 6, C (8, 9), S (11) and 12 (after 4 and 9) merge to `main` in any
order as each is green; they touch disjoint files. Task 7 and Task 10 stay on branch `pickup-flow` (cut from `main` after
6 and 8). When `bots-gear-stations` has merged into `main`, rebase `pickup-flow` onto `main`, add 13 → 14 → 15 on it, and
merge it once the whole suite is green. Task 16 goes last, on `main`.
