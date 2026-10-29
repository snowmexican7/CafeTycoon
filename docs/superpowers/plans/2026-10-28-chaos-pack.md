# Chaos Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the R drop key, floor messes (grounds piles and spills) that spread, slip and stun, a mop and a cleanliness score, and the rare rogue customer who makes their own drink. All of it is deterministic, host-authoritative and in sync in co-op.

**Architecture:** Task 1 (foundation) lands every new type, field, constant, default, version bump, validation rule and `stepDay` slot. Each slot is a **named no-op function** in the module that will own it (`onTileEntry`, `stepCleanliness`, `spillTiles` in `floor.ts`; `resolveDrops` in `drop.ts`; `mopInteract`, `stepCleaning` in `mop.ts`; `stepRogue`, `rogueTiles`, `rogueNear` in `rogue.ts`; `stepFloor` in `brain.ts`; `floorHud`, `rogueHud` in `viewModels.ts`). After that, Track A (floor) and Track B (rogue) run in parallel worktrees. Each track fills only its own stubs and edits only its own files, so the two merges never touch the same lines. Tile maths and stun gating live in the foundation's `src/sim/tiles.ts`, which neither track edits.

**Tech Stack:** TypeScript 5.9, Vite 8, Vitest 5 (tests next to sources, `createRun` fixtures).

**Spec:** `docs/superpowers/specs/2026-10-28-chaos-pack-design.md` (binding, including the 2026-10-28 builder-check rulings in §§4–7, 9, 12). Builds on `docs/superpowers/specs/2026-10-28-phase-2-busy-season-design.md` and the conventions of `docs/superpowers/plans/2026-10-28-phase-2-busy-season.md`. Ownership: `docs/UI_OVERHAUL.md` ("Group B constraints", "Ownership").

## Global Constraints

- Edit only `src/sim/**`, `src/data/**`, `src/net/**`, `src/host/**`, `src/storage/**`, tests, docs (`CHANGELOG.md`, `README.md`, `docs/**`, `public/roadmap.json` changelog array only).
- `src/ui/viewModels.ts`: additive only (new optional fields, new functions; never rename or remove). `src/ui/viewModels.test.ts` and `src/ui/live.test.ts` stay green and unchanged. Never any other `src/ui/*`, never `src/render/*`, never `keys.ts`/`keyboard.ts`.
- `src/main.ts`: only the `KeyR` branch inside the existing `window.addEventListener('keydown', …)` near the Escape handler. The title wiring stays untouched.
- No new `StationKind`. No new `ItemKind` value (`ITEM_LABEL: Record<ItemKind, string>` in `src/ui/live.ts` would break), so the mop is `Player.tool`. Never change the meaning of `Customer.drink`, `Player.holding`, `Station.output`, `Player.pos`, `Player.connected`.
- Every number comes from `ECONOMY.mess` / `ECONOMY.rogue` (spec §9 plus the four extra keys in Task 1) or `LAYOUT.mopHome` / `LAYOUT.rogueStart`. No numeric literals in sim code other than 0, 1 and 60 for tick conversion via `secondsToTicks`.
- Every random draw goes through `rngNext`/`rngInt` on `state.rng`, in a fixed order: tile-entry events in `players` order, then drops, then interacts (the rogue roll happens inside `serveCustomer` during interacts, and a bot's spill roll where it would have binned a drink), then spawns, then the rogue. Same seed and inputs give an identical state on every machine.
- State stays JSON-safe: plain arrays and objects, no `Map`/`Set` in `GameState`.
- New fields on types that `src/ui`/`src/render` tests build as literals (`Customer`, `DayStats`) are **optional**, and sim code always sets them. `Player` and `Station` fields are required; every test literal that builds a `Player` (e.g. `boxedIn` in `src/sim/bots/brain.test.ts`) spreads `floorFields(pos)` — Task 1 updates them (grep `pos:` literals in `src/**/*.test.ts`).
- `SNAPSHOT_VERSION = 3` and `PROTOCOL_VERSION = 3` from Task 1 on.
- Bots keep the contracts in `brain.ts`/`path.ts`: extend, don't rewrite. Bot fixtures stop arrivals with the `test-no-traffic` owned item (`{ itemId: 'test-no-traffic', effects: [{ kind: 'traffic', mul: 0 }] }`).
- Every task ends with `npm test` and `npm run build` green (build runs `tsc --noEmit`; check its exit code).
- Branches: `chaos-1-foundation` (merged to `main` before the tracks start); then `chaos-a-floor` and `chaos-b-rogue` in separate worktrees off that `main`; then `chaos-8-docs`. Before merging, each track fetches and rebases on `main`.
- Commit messages: `feat(sim): …`, `feat(net): …`, `feat(host): …`, `test: …`, `docs: …`, each ending with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

These are the failure modes a player will hit that the spec implies but no feature test covers. Each line's test is in the named task, marked `// Review Focus N`.

1. **A drop at the cap.** With 12 messes on the floor, R with a drink, a slip while holding grounds, or a bot noticing a botched drink adds nothing to the floor. The human keeps the item, no waste is counted and nothing is logged. The bot bins the drink instead (Task 2 for R and the slip, Task 4 for the bot).
2. **A stun or R during a mop channel.** A cleaning player who is stunned, or who presses R, loses the clean: the mess stays, the mop is home after R, and after the stun one E press cleans again. Nobody is stuck in the channel (Task 3).
3. **A rogue whose only free station is one a bot is walking to.** Whoever arrives first gets the station. A bot that arrives second waits as for a busy machine and re-plans within `bots.maxWaitTicks`. A rogue that arrives second waits up to 300 ticks, then storms out. Nobody waits forever, and the station is never left occupied (Task 7).
4. **A bot's mop plan interrupted by an order.** A bot mid-clean when an uncovered order appears returns the mop with R, so the mop is home and free. It then claims the order and serves it. A bot never holds the mop and an item at once (Task 4).
5. **A spill on every approach to the counter.** With spills on every walkable neighbour of the bot's counter node, the avoid path fails. The bot falls back to the plain path, walks through (it may slip, and recovers within 300 ticks), and completes the serve (Task 4).

---

## File structure and ownership

```
src/data/economy.ts          T1: mess + rogue blocks (§9 + mergeAdd, spreadLoss, minAmount, spreadFactor)
src/data/layout.ts           T1: mopHome {11,7}, rogueStart {6,7}
src/sim/types.ts             T1: every new type/field (table below)
src/sim/tiles.ts      (new)  T1 only: tileOf, facingOf, tileAhead, floorFields, clearFloorFields, trackTiles, stepStuns
src/sim/floor.ts      (new)  T1 stubs; Track A: onTileEntry, stepCleanliness, spillTiles, placeMess, spillHeld
src/sim/drop.ts       (new)  T1 stub; Track A: resolveDrops
src/sim/mop.ts        (new)  T1 stubs; Track A: mopInteract, stepCleaning, returnMop
src/sim/rogue.ts      (new)  T1 stubs; Track B: rogueActive, startRogue, stepRogue, rogueTiles, rogueNear, freeStation
src/sim/step.ts              T1 only (slots, drop input, heldDir)
src/sim/run.ts               T1 only (defaults)
src/sim/stations.ts          T1 only (occupancy in stepStations + interact guards)
src/sim/closing.ts           T1 (day-end clears); Track B (rogue reputation hit)
src/sim/validate.ts, tally.ts T1 only
src/sim/effects.ts, events.ts Track A only (patience factor, inspector)
src/sim/customers.ts, pass.ts, describe.ts  Track B only
src/sim/bots/brain.ts        T1 (planPath slots, shouldYield slot, coverage skip, stepFloor stub, stun skip); Track A only after that
src/sim/bots/path.ts         Track A only: exports `walkableNodes`, `byDistance` for `cleanNode`
src/net/protocol.ts, src/storage/snapshotStore.ts, src/host/telemetry.ts  T1 only
src/ui/viewModels.ts         T1 (fields, slots, key); Track A fills floorHud; Track B fills rogueHud + receipt rogues
src/main.ts                  T1 only (KeyR)
```

**Track B must not touch:** `floor.ts`, `drop.ts`, `mop.ts`, `tiles.ts`, `movement.ts`, `effects.ts`, `events.ts`, `bots/brain.ts`, `bots/path.ts` (Track A may only export `walkableNodes`/`byDistance` there), `floorHud`.
**Track A must not touch:** `rogue.ts`, `customers.ts`, `pass.ts`, `closing.ts`, `describe.ts`, `rogueHud`, `receiptViewModel`, `src/sim/viewModels2.test.ts`.
Test files: Track A adds `floor.test.ts`, `drop.test.ts`, `mop.test.ts`, `viewModelsFloor.test.ts` and appends to `bots/brain.test.ts`. Track B adds `rogue.test.ts` and `viewModelsRogue.test.ts`, and edits `customers.test.ts` and `viewModels2.test.ts`.

**`stepDay(s, doorsOpen)` order after Task 1** (spec §8; slot owner in brackets):

1. `stepEvents(s, doorsOpen)`
2. `const m = computeModifiers(s)`
3. `stepStuns(s)` [T1]
4. `stepBots(s, m)` (skips stunned bots) [T1]
5. `applyMovement(s, m.moveSpeed)`
6. `onTileEntry(s, trackTiles(s))` [T1 `trackTiles`, A `onTileEntry`]
7. idle tally (as today)
8. queued interacts + `afterBotInteract` (as today)
9. `resolveDrops(s)` [A], then clear `interactQueued` and `dropQueued` on every player [T1]
10. `stepCleaning(s)` [A]
11. `stepStations(s)`
12. `stepPass(s)`
13. `stepCleanliness(s)` [A]
14. `if (doorsOpen) spawnCustomers(s)`
15. `stepCustomers(s)` (upset window, Track B)
16. `stepRogue(s)` [B]
17. phase timer (as today)

**Tile maths** (`tiles.ts`): the tile of a position is `{ x: Math.round(x), y: Math.round(y) }`. The tile in front is `tileOf(pos + facing)`. A **floor tile** is exactly `isWalkable(state, t)` from `bots/path.ts`: x in 1..11, y in 1..7, and not a station square. A station square is a station's integer `pos`; `blocked()` excludes it. A floor drop targets the tile in front if it is a floor tile, else the own tile if it is a floor tile, else `nodeOf(state, pos)`. Tile entry is detected right after `applyMovement` by comparing `tileOf(p.pos)` with the stored `Player.tile`.

---

### Task 1: Foundation (state v3, slots, tiles, stuns, occupancy, R key)

This is the first task that changes the shape of `GameState`, so it bumps `SNAPSHOT_VERSION` to 3 (a v2 save is discarded with the existing notice) and `PROTOCOL_VERSION` to 3 (a stale peer tab gets the version-mismatch message).

**Files:**
- Modify: `src/sim/types.ts`, `src/data/economy.ts`, `src/data/layout.ts`, `src/sim/run.ts`, `src/sim/step.ts`, `src/sim/stations.ts`, `src/sim/closing.ts`, `src/sim/validate.ts`, `src/sim/tally.ts`, `src/sim/bots/brain.ts`, `src/sim/bots/roster.ts` (`newBarista`), `src/net/protocol.ts:7`, `src/net/hostResume.ts`, `src/storage/snapshotStore.ts:7`, `src/host/telemetry.ts:41-44`, `src/ui/viewModels.ts`, `src/main.ts` (keydown listener only)
- Create: `src/sim/tiles.ts`, `src/sim/floor.ts`, `src/sim/drop.ts`, `src/sim/mop.ts`, `src/sim/rogue.ts` (stubs below)
- Test: `src/sim/tiles.test.ts` (new), `src/sim/run.test.ts`, `src/sim/step.test.ts`, `src/sim/stations.test.ts`, `src/sim/bots/brain.test.ts`, `src/sim/viewModels2.test.ts` (structure key only), `src/net/protocol.test.ts`, `src/net/hostRoom.test.ts`, `src/net/hostResume.test.ts`, `src/storage/stores.test.ts`, `src/host/telemetry.test.ts`

**Interfaces:**
- Produces (`types.ts`):

```ts
export type MessKind = 'grounds' | 'spill';
export interface Mess { id: number; kind: MessKind; x: number; y: number; amount: number }
export interface Mop { pos: Vec2; heldBy: PlayerId | null }
export type RogueStage = 'walking' | 'waiting' | 'making' | 'leaving' | 'stormingOut';
export interface Rogue {
  customerId: number; name?: string; drink: DrinkId; stage: RogueStage;
  pos: Vec2; path: Vec2[]; station: string | null; ticksLeft: number; waitTicks: number;
}
export type FloorAction = 'takeMop' | 'clean' | 'returnMop';
export type BotStep = { kind: 'use'; station: string; action: BotAction } | { kind: 'idle'; node: Vec2 }
  | { kind: 'floor'; node: Vec2; action: FloorAction };
// SimEventKind += 'drop' | 'slip' | 'clean' | 'rogue.upset' | 'rogue.remade' | 'rogue.made' | 'rogue.stormed'
// Player   += facing: Vec2 ({0,1}); heldDir: Vec2 ({0,0}, latest move input); stunTicksLeft: number (0);
//             tool: 'mop' | null (null); cleaningTicksLeft: number (0); cleaningMess: number | null (null);
//             dropQueued: boolean (false); tile: Vec2 (tileOf(pos))
// Station  += occupiedBy: number | null (null; a rogue's customer id)
// Customer += upset?: { ticksLeft: number }
// DayStats += rogues?: number (freshDayStats sets 0)
// GameState += messes: Mess[]; nextMessId: number (1); cleanliness: number (100); mop: Mop; rogue: Rogue | null
// PlayerInput += { kind: 'drop'; playerId: PlayerId }
```

- Produces (`economy.ts`): `mess: { max: 12, spreadChance: 0.25, spreadMin: 0.5, slipChance: 0.05, stunTicks: [180, 300], cleanTicks: 90, dirtPerMessPerTick: 0.0025, recoverPerTick: 0.01, inspectorMin: 60, botMopBelow: 70, botMopMesses: 3, botMopMax: 3, patienceFloor: 0.8, botSpillChance: 0.5, mergeAdd: 0.5, spreadLoss: 0.25, minAmount: 0.25, spreadFactor: 0.5 }` and `rogue: { chance: 0.015, remakeSeconds: 15, waitSeconds: 5, makeSeconds: 10, speed: 0.8, repHit: 0.1, minDay: 2 }`. `layout.ts`: `mopHome: Vec2 = { x: 11, y: 7 }`, `rogueStart: Vec2 = { x: 6, y: 7 }` (add both to the `LAYOUT` type).
- Produces (`tiles.ts`, foundation-only, both tracks import):
  - `tileOf(pos: Vec2): Vec2`
  - `facingOf(dir: Vec2): Vec2`: `|y| >= |x|` gives `{0, sign y}`, else `{sign x, 0}`. Never called with zero.
  - `tileAhead(p: Player): Vec2`
  - `floorFields(pos: Vec2): Pick<Player, 'facing' | 'heldDir' | 'stunTicksLeft' | 'tool' | 'cleaningTicksLeft' | 'cleaningMess' | 'dropQueued' | 'tile'>`. It is spread into the three places that build a `Player`: `createRun`, `join` in `step.ts`, and `newBarista`.
  - `clearFloorFields(p: Player): void`: zero stun and cleaning, `tool = null`, `dropQueued = false`.
  - `trackTiles(state: GameState): Player[]`: for each connected, unstunned player in `players` order, set `facing = facingOf(moveDir)` when `moveDir` is non-zero. Then, if `tileOf(pos)` differs from `tile`, update `tile` and include the player. Returns the players who entered a tile.
  - `stepStuns(state: GameState): void`: for a player with `stunTicksLeft > 0`, decrement it, zero `moveDir`, and clear `interactQueued` and `dropQueued`. Otherwise, a connected human gets `moveDir = { ...heldDir }`. A stun of N therefore freezes exactly N ticks, and a key still held when it ends resumes motion.
- Produces (stubs; bodies filled by the named track):
  - `floor.ts`: `onTileEntry(state: GameState, entered: Player[]): void {}`, `stepCleanliness(state: GameState): void {}`, `spillTiles(state: GameState): Vec2[]` returns `[]` (A)
  - `drop.ts`: `resolveDrops(state: GameState): void {}` (A)
  - `mop.ts`: `mopInteract(state: GameState, player: Player): void {}`, `stepCleaning(state: GameState): void {}` (A)
  - `rogue.ts`: `stepRogue(state: GameState): void {}`, `rogueTiles(state: GameState): Vec2[]` returns `[]`, `rogueNear(state: GameState, at: Vec2): boolean` returns `false` (B)
  - `brain.ts`: `stepFloor(state: GameState, p: Player, step: Extract<BotStep, { kind: 'floor' }>): void` pops the step (A)
  - `viewModels.ts`: `floorHud(state: GameState): Pick<HudVM, 'messes' | 'cleanliness' | 'mop' | 'stuns' | 'cleaning'>` returns `{}`, placed just above `hudViewModel` (A); `rogueHud(state: GameState): Pick<HudVM, 'rogue'>` returns `{}`, placed at the end of the file (B). `hudViewModel` spreads `...floorHud(state), ...rogueHud(state)`.
- Produces (behaviour fully done here):
  - `step.ts` `applyInput`: `'move'` sets `heldDir` always and `moveDir` only when `stunTicksLeft === 0`. `'drop'` sets `dropQueued = true` only in phase `day`/`closing` (the existing guard already ignores bot ids). `'leave'` also zeroes `heldDir`, calls `clearFloorFields(p)` and, if the player held the mop, sends it home (`mop.heldBy = null`, `pos = LAYOUT.mopHome`).
  - `markPeersAway` (`src/net/hostResume.ts`) zeroes `heldDir` and `moveDir` of players it marks away.
  - `validate.ts`: `case 'drop': return { kind: 'drop', playerId }`.
  - `tally.ts`: `TallyKey += 'rogues'`.
  - `stations.ts` `stepStations`: when `busyTicksLeft` reaches 0 on a station with `occupiedBy !== null`, set `occupiedBy = null` and leave `output` null. `interact`: (a) `if (player.tool !== null) { mopInteract(state, player); return state; }` before the station lookup; (b) with no station in range, `if (player.holding === null) mopInteract(state, player)`; (c) `if (station.occupiedBy !== null) return state`.
  - `brain.ts`:
    - `stepBots` steps only bots with `stunTicksLeft === 0`.
    - `planPath(state, p, node)` tries, in order, `findPath` avoiding `[...spillTiles(s), ...people]`, then avoiding `spillTiles(s)`, then the plain path. Empty avoid lists are skipped. `people` = other connected players' nodes plus `rogueTiles(s)`, only after a yield (`hasYielded`). With no spills and no rogue this behaves exactly as today.
    - `shouldYield` also returns true when `rogueNear(state, waypoint)`.
    - `coveragePool` skips stations with `occupiedBy !== null`.
    - `stepBot` treats a `floor` step like `idle` for pathing (node = `step.node`, `maxRank` 0) and on arrival calls `stepFloor`.
  - `run.ts`: `createRun` sets every default above. `startDay` sets `messes = []`, `cleanliness = 100`, `mop = { pos: { ...LAYOUT.mopHome }, heldBy: null }`, `rogue = null`, and `tile = tileOf(pos)` for each player. `freshDayStats` adds `rogues: 0`. Stations get `occupiedBy: null`.
  - `closing.ts` `finishDay`: after clearing the queue, set `messes = []`, `rogue = null`, mop home and free; in the station loop set `occupiedBy = null`; in the hand loop call `clearFloorFields(p)`.
  - `RESERVED_TELE_KINDS` += the seven new kinds.
  - `hudStructureKey`: also strips `cleanliness`. It keys `messes` as `[id, kind, x, y]`, `mop` as `heldBy`, `stuns` and `cleaning` as `playerId` lists, and `rogue` as `{ stage, drink, name }` (rogue `x`, `y` and `secondsLeft` are patched).
  - HudVM fields: `messes?: { id: number; kind: MessKind; x: number; y: number; amount: number }[]`, `cleanliness?: number`, `mop?: { x: number; y: number; heldBy: string | null }`, `stuns?: { playerId: string; secondsLeft: number }[]`, `cleaning?: { playerId: string; secondsLeft: number }[]`, `rogue?: { stage: RogueStage; drink: DrinkId; x: number; y: number; secondsLeft: number; name?: string }`.

- [ ] **Step 1: Write the failing tests**

`run.test.ts` `'starts chaos state clean'`:
```ts
const s = startDay(createRun(opts));
expect([s.messes, s.cleanliness, s.mop, s.rogue, s.nextMessId]).toEqual([[], 100, { pos: { x: 11, y: 7 }, heldBy: null }, null, 1]);
expect(s.today.rogues).toBe(0);
expect(s.stations.every((st) => st.occupiedBy === null)).toBe(true);
expect(s.players[0]).toMatchObject({ facing: { x: 0, y: 1 }, heldDir: { x: 0, y: 0 }, stunTicksLeft: 0, tool: null, cleaningTicksLeft: 0, cleaningMess: null, dropQueued: false, tile: { x: 6, y: 4 } });
```

`tiles.test.ts`:
- `'facing is 4-way from the dominant axis, ties vertical'`: `facingOf({x:1,y:0.3})` gives `{1,0}`; `facingOf({x:-0.02,y:0})` gives `{-1,0}`; `facingOf({x:0.5,y:-0.5})` gives `{0,-1}`.
- `'one tick of movement sets facing and the tile'`: fixture `chaosCafe()` = `createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 } })`, push `test-no-traffic`, `startDay`. p1 at `{x: 6.45, y: 4}`; step `move {x:1,y:0}`, then expect `facing {1,0}` and `tile {7,4}`. On the next tick with `move {0,0}`, facing stays `{1,0}`.
- `'stunned players ignore inputs for exactly the stun, then a held key resumes'`: set `stunTicksLeft = 3`. Step with `move {1,0, interact:true}` and `drop`; pos unchanged for 3 ticks, and `interactQueued`/`dropQueued` are false after each. On tick 4, with no new input, pos.x increases.

`step.test.ts`:
- `'drop input validates, queues only by day and is cleared each tick'`: `validateInput({kind:'drop', playerId:'p1'})` gives `{kind:'drop', playerId:'p1'}`. At night, `step(s,[drop])` leaves `dropQueued` false (night never clears it, so this pins the phase guard). By day, after one tick with a drop, `dropQueued === false`.
- `'a drop naming a bot is ignored'`: with `bots: 1`, `step(s, [{kind:'drop', playerId:'bot-1'}])` changes no `bot-1` field.

`stations.test.ts`:
- `'an occupied station ends with no output and is freed'`: set espresso `busyTicksLeft = 2`, `occupiedBy = 7`, step twice through `stepStations`; expect `output === null`, `occupiedBy === null`.
- `'E does nothing at an occupied station'`: espresso idle, `occupiedBy = 7`, p1 adjacent holding grounds; after `interact`, p1 still holds grounds and `busyTicksLeft === 0`.
- `'a mop carrier cannot use a station'`: p1 at the grinder with `tool = 'mop'`, empty hands; after `interact`, grinder `busyTicksLeft === 0` and beans unchanged.

`brain.test.ts` `'an occupied station does not cover an order'`: `cafe(1)`, one espresso customer with `huge` patience, espresso station `busyTicksLeft = 600`, `occupiedBy = 99`; expect `uncoveredOrder(s, bot(s))?.drink === 'espresso'`.

`closing` (in `step.test.ts`) `'day end clears floor and rogue state'`: before `finishDay`, set one mess, `cleanliness = 40`, `mop.heldBy = 'p1'`, p1 `tool = 'mop'`, `stunTicksLeft = 50`, `cleaningTicksLeft = 10`, a rogue record, and steamer `occupiedBy = 3`. After it, expect messes, rogue, mop, stuns, cleaning, tool and occupancy all cleared, the mop home, and `rogue === null`. `cleanliness` is NOT reset by `finishDay` (it resets at `startDay`), so the assertion does not check it.

`viewModels2.test.ts` `'hud key ignores per-tick chaos values'`: build two `HudVM`s with `{ ...hudViewModel(s), messes: [{id:1,kind:'spill',x:3,y:4,amount:1}], cleanliness: 90, mop: {x:11,y:7,heldBy:null}, stuns:[{playerId:'p1',secondsLeft:3}], rogue:{stage:'walking',drink:'latte',x:6,y:7,secondsLeft:0} }` that differ only in `amount`, `cleanliness`, `secondsLeft` and rogue `x`: keys are equal. Changing the mess `kind`, `mop.heldBy` or rogue `stage` changes the key.

`hostResume.test.ts` `'markPeersAway zeroes heldDir and moveDir'`: a connected player with `heldDir {1,0}` and `moveDir {1,0}` is marked away; both are `{0,0}`.

Versions: `protocol.test.ts` `expect(PROTOCOL_VERSION).toBe(3)`; `stores.test.ts` rename `'is on version 2'` to `'is on version 3'` and `toBe(3)`; `hostRoom.test.ts` `'rejects a different protocol version'` sends `2` instead of `1`; `telemetry.test.ts` `expect(RESERVED_TELE_KINDS).toEqual(expect.arrayContaining(['drop','slip','clean','rogue.upset','rogue.remade','rogue.made','rogue.stormed']))`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim src/net src/storage src/host`
Expected: FAIL, e.g. `expected 2 to be 3`, `Cannot find module './tiles'`, `expected undefined to deeply equal []`.

Also update every test literal that builds a `Player` by spreading `floorFields(pos)` (at least `boxedIn` in `src/sim/bots/brain.test.ts`).

- [ ] **Step 3: Implement the types, constants, defaults, `tiles.ts`, the stubs, the `stepDay` order above, occupancy, the interact guards, the brain slots, the version bumps, the HUD fields/slots/key, and the R key**

`main.ts`, inside the existing keydown listener, after the Escape branch (no other change):
```ts
const field = document.activeElement?.tagName ?? '';
if (e.code === 'KeyR' && !e.repeat && session?.next && !['INPUT', 'TEXTAREA', 'SELECT'].includes(field)) {
  e.preventDefault();
  session.transport.sendInput({ kind: 'drop', playerId: session.me });
}
```

- [ ] **Step 4: Run all tests and the build**

Run: `npm test && npm run build`
Expected: PASS with build exit code 0. Existing seeded tests are unchanged, because no stub draws from the rng and `planPath` behaves as before with no spills and no rogue.

- [ ] **Step 5: Commit, merge, push**

```bash
git checkout -b chaos-1-foundation
git add src/sim src/data src/net src/storage src/host src/ui/viewModels.ts src/main.ts
git commit -m "feat(sim): chaos pack foundation: state v3, tiles, stuns, occupancy, drop input and R key

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Merge to `main` and push. Then create the two worktrees (`chaos-a-floor`, `chaos-b-rogue`) off the new `main`.

---

## Track A: the floor (branch `chaos-a-floor`, own worktree)

### Task 2: Drops, messes, grounds spread, slips

**Files:**
- Modify: `src/sim/floor.ts`, `src/sim/drop.ts`
- Test: `src/sim/floor.test.ts`, `src/sim/drop.test.ts` (new)

**Interfaces:**
- Consumes: `tileOf`, `tileAhead` (tiles.ts); `isWalkable`, `nodeOf` (bots/path.ts); `nearestStation`; `STATION_RECIPES`; `emitLog`, `tally`; `ECONOMY.mess`, `ECONOMY.pass`.
- Produces (`floor.ts`):
  - `placeMess(state: GameState, kind: MessKind, tile: Vec2): boolean`. With no mess on the tile: if `messes.length >= max`, return false; otherwise push `{ id: nextMessId++, kind, x, y, amount: 1 }`. If the tile already has a mess, `amount = min(1, amount + mergeAdd)`, and a spill landing on grounds turns that mess's `kind` to `'spill'` (it keeps its id). Grounds landing on a spill keep it a spill. **At the cap nothing is placed or merged** (return false).
  - `dropTile(state: GameState, p: Player): Vec2` (front, then own, then `nodeOf`).
  - `onTileEntry(state, entered)`: for each entered player whose tile holds a mess:
    - **Grounds** with `amount >= spreadMin`: draw `rngNext < spreadChance`. On a hit, candidates are the 4 neighbours in fixed order `[+x, -x, +y, -y]` that are walkable and either empty (only while `messes.length < max`) or hold a grounds pile with `amount < half`. If there are any, `rngInt(candidates.length)` picks one, which gets `half = amount * ECONOMY.mess.spreadFactor` (new pile or raised to half). The source loses `spreadLoss`, and a source below `minAmount` is removed.
    - **Spill**: draw `rngNext < slipChance`. On a hit, `stunTicksLeft = stunTicks[0] + rngInt(stunTicks[1] - stunTicks[0] + 1)`, `moveDir` zeroed, `interactQueued`/`dropQueued` false, cleaning cancelled. If something is held and `placeMess(own tile, drink → 'spill', grounds → 'grounds')` succeeds, hands empty, and a drink tallies `wasted`. Log `slip { player, x, y, ticks, item? }`.
  - `stepCleanliness(state)`: `cleanliness -= dirtPerMessPerTick × messes.length`, or `+= recoverPerTick` when there are none; clamp to [0, 100].
  - `spillTiles(state)`: the tiles of `'spill'` messes.
  - `spillHeld(state: GameState, p: Player): boolean` (used by Task 4): places the held drink as a spill on `dropTile`'s own-tile rule (own tile, else `nodeOf`), tallies `wasted`, empties hands and logs `drop { item, x, y }`. Returns false at the cap.
- Produces (`drop.ts`): `resolveDrops(state)`. Players are handled in order, for those with `dropQueued`:
  - `tool === 'mop'`: hand off to Task 3's `returnMop`. Until Task 3 lands, mop drops are a no-op here.
  - Empty hands: nothing.
  - Station in range (`nearestStation`):
    - **trash**: empty hands, a drink tallies `wasted`; log `drop { item, station }`.
    - **counter**: a drink with `pass.length < slots` is pushed as `{ item, ticksLeft: staleSeconds[item] * 60 }`; grounds or a full pass do nothing.
    - **recipe station**: `busyTicksLeft === 0 && output === null` (an occupied station is busy) puts the item in `output`; otherwise nothing.
  - No station in range: a **floor drop** to `dropTile`. Grounds become a pile and a drink becomes a spill (tallying `wasted`). When `placeMess` refuses, the hand keeps the item. Log `drop { item, x, y }`.

- [ ] **Step 1: Write the failing tests**

Fixture `chaosCafe()` from Task 1 (copy into each new test file), plus `face(s, dir)`: one `move` tick in `dir`, then one `move {0,0}` tick.

`drop.test.ts`:
- `'drop at an idle empty station places the item'`: p1 at `{3,2}` holding grounds; the espresso machine gets `output 'grounds'` and p1 holds null.
- `'drop at a busy or full station does nothing'`: with espresso `busyTicksLeft = 5`, p1 keeps grounds and no mess appears. Do the same with `output = 'espresso'`.
- `'drop at the counter puts a drink on the pass, grounds stay in hand'`: p1 at `{6,5}` with a latte gets `pass [{item:'latte', ticksLeft:3600}]`, calling `resolveDrops` directly (through `step()` the pass would show `ECONOMY.pass.staleSeconds.latte * 60 - 1`, because `stepPass` runs after drops); grounds stay in hand.
- `'drop at the trash bins and counts drink waste'`: `today.wasted` goes 0 to 1 for a latte, and stays 1 for grounds.
- `'floor drop lands on the tile in front'`: p1 at `{6,4}`, `face(s,{x:-1,y:0})`, holding espresso, then a drop tick. Expect `messes` to equal `[{id:1, kind:'spill', x:5, y:4, amount:1}]` (p1 drifted a tile fraction, so assert `x: 5`), and `wasted === 1`.
- `'facing a station square or off the floor drops on the own tile'`: p1 at `{3,2.45}` with `facing = {0,-1}` holding grounds (front `{3,1}` is the espresso square, 1.45 tiles away so no station is in range); the pile lands on `{3,2}`. p1 at `{1,7}` facing `{-1,0}` (front `{0,7}` is off the floor) drops on `{1,7}`.
- `'merging and one-mess-per-tile'`: two grounds drops on one tile give amount `1`. A third drop of grounds onto a spill keeps it `'spill'`. A spill dropped on a grounds pile turns it `'spill'` with the same id.
- `// Review Focus 1` `'nothing drops at the cap'`: fill 12 messes on distinct floor tiles; p1 with a latte drops on the floor and still holds the latte, `wasted === 0`, and no `drop` log.

`floor.test.ts`:
- `'grounds spread stays bounded'`: one grounds pile at `{5,4}`. Over 200 iterations, take the pile with the largest amount, set p1 `pos` to a neighbour and call `trackTiles(s)`, then set `pos` onto the pile and call `onTileEntry(s, trackTiles(s))` (`onTileEntry` trusts `p.tile`, so tests never set `p.tile` by hand). After each iteration, expect `messes.length <= 12` and every `amount` in `[0.25, 1]`.
- `'slip rate is about 5% and stuns 180–300 ticks, dropping what is held'`: a spill at `{5,4}`. For 2000 iterations: reset `stunTicksLeft = 0`, `holding = null`, set `pos = {4,4}` and call `trackTiles(s)`, then `pos = {5,4}` and `onTileEntry(s, trackTiles(s))`. Expect the slip count in `[60, 140]` and every observed stun in `[180, 300]`. Then one slip while holding grounds: record `rngBefore` each iteration; on the first slip, restore `s.rng = rngBefore`, give p1 grounds and repeat the entry. Expect a grounds-on-spill merge on `{5,4}` (still one mess, `'spill'`) and hands empty.
- `// Review Focus 1` `'a slip at the cap keeps the item'`: 12 messes, p1 holding grounds slips (loop until slip). p1 still holds grounds and there are still 12 messes.
- `'a slipped player does not interact this tick'`: force a slip via `stepDay`: p1 moves onto a spill with `interact: true` at the grinder. Loop seeds until a `slip` log appears; on that tick the grinder stays idle.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/drop.test.ts src/sim/floor.test.ts`
Expected: FAIL, e.g. `expected [] to deeply equal [{ id: 1, kind: 'spill', … }]`.

- [ ] **Step 3: Implement `placeMess`, `dropTile`, `onTileEntry`, `stepCleanliness`, `spillTiles`, `spillHeld` in `floor.ts` and `resolveDrops` in `drop.ts`**

- [ ] **Step 4: Run all tests and the build**

Run: `npm test && npm run build`
Expected: PASS, build exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/sim/floor.ts src/sim/drop.ts src/sim/floor.test.ts src/sim/drop.test.ts
git commit -m "feat(sim): drop key resolution, floor messes, grounds spread and slips

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: Mop, cleaning, cleanliness effects

**Files:**
- Modify: `src/sim/mop.ts`, `src/sim/drop.ts` (mop branch), `src/sim/effects.ts` (`computeModifiers`), `src/sim/events.ts` (`judgeInspection`)
- Test: `src/sim/mop.test.ts` (new), `src/sim/effects.test.ts`, `src/sim/events.test.ts`

**Interfaces:**
- Consumes: `placeMess`, `stepCleanliness` (Task 2); `ECONOMY.mess`, `ECONOMY.interactRangeTiles`, `LAYOUT.mopHome`.
- Produces (`mop.ts`):
  - `nearestMess(state: GameState, pos: Vec2): Mess | null`: within `interactRangeTiles` of the tile centre; ties go to the lower `messes` index.
  - `mopInteract(state, player)`:
    - `tool === 'mop'`: if `cleaningTicksLeft === 0` and `nearestMess` exists, set `cleaningTicksLeft = cleanTicks` and `cleaningMess = id`; otherwise nothing (never a station action).
    - `tool === null && holding === null && mop.heldBy === null` with the mop within range: `tool = 'mop'`, `mop.heldBy = id`.
  - `returnMop(state: GameState, p: Player): void`: `tool = null`, cleaning cleared, `mop = { pos: { ...LAYOUT.mopHome }, heldBy: null }`, log `drop { item: 'mop', x, y }` (home tile).
  - `stepCleaning(state)`:
    - **Mop holder.** If `mop.heldBy` names a missing or disconnected player, or one whose `tool !== 'mop'`, return the mop home. Otherwise `mop.pos = { ...holder.pos }`.
    - **Each cleaning player.** Cancel (zero, null) when stunned, when `tool !== 'mop'`, or when `moveDir` is non-zero. Otherwise decrement. At 0, remove the mess with id `cleaningMess` if it still exists, log `clean { player, x, y }`, and set `cleaningMess = null`.
- `drop.ts`: `tool === 'mop'` calls `returnMop`.
- `effects.ts` `computeModifiers`: `m.patience *= patienceFloor + (1 - patienceFloor) * cleanliness / 100`. It is read when a customer arrives (`patienceFor`), so waiting customers are not re-rated.
- `events.ts` `judgeInspection`: fails when `wasted >= wastedLimit || cleanliness < inspectorMin`; still one fine.

- [ ] **Step 1: Write the failing tests** (`mop.test.ts`, fixture `chaosCafe()`)

- `'pick up the mop with empty hands and no station in range'`: p1 at `{10.5,7}`, E. Expect `tool === 'mop'` and `mop.heldBy === 'p1'`. Holding grounds instead, E does nothing.
- `'E with the mop cleans the nearest mess after 90 still ticks'`: a spill at `{9,7}`, p1 with the mop at `{10,7}`. One tick with `interact: true`, then 88 still ticks: the mess is still there. One more tick: the mess is gone and a `clean` log exists.
- `'moving cancels the clean'`: start a clean, then one tick with `move {0,-1}`: `cleaningTicksLeft === 0` and the mess is still there.
- `'E with the mop and no mess in range does nothing'`: p1 with the mop at the grinder: grinder idle, beans unchanged.
- `'R returns the mop home from anywhere'`: p1 with the mop at `{2,6}`, drop tick: `tool === null`, `mop` equals `{pos:{x:11,y:7}, heldBy:null}`.
- `// Review Focus 2` `'a stun or R mid-clean cancels the channel'`:
  - (a) Start a clean, set `stunTicksLeft = 5`, step 5 ticks: no clean log, mess present, `cleaningTicksLeft === 0`. Then E and 90 still ticks clean it.
  - (b) Start a clean, then a drop tick: mop home, mess present.
- `'a leaving holder sends the mop home'`: p1 holds the mop and sends `leave`; after one tick the mop is home. A player who leaves (`leave` input) while holding the mop: Task 1's `leave` handling sends it home; `mopInteract` must cope with `mop.heldBy` naming a disconnected player (treat the mop as free).
- `'cleanliness falls with messes and recovers without'`: 2 messes, 200 ticks give `cleanliness` `toBeCloseTo(99, 6)`. Clear them and set 50; 100 ticks give `toBeCloseTo(51, 6)`. Start from 99.5 with no messes: 200 recovery ticks reach the clamp, `toBeCloseTo(100, 6)` and never above. (All cleanliness assertions use `toBeCloseTo(value, 6)`.)

`effects.test.ts` `'a dirty café makes new customers less patient'`: `computeModifiers` patience at cleanliness 50 divided by that at 100 is `0.9` (toBeCloseTo).
`events.test.ts` `'the inspector fails a dirty café with one fine'`: (a) `cleanliness 59`, `wasted 0`: `'fail'`, `fines === 15`. (b) `cleanliness 59`, `wasted 4`: `fines === 15`. (c) `cleanliness 60`: `'pass'`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/mop.test.ts src/sim/effects.test.ts src/sim/events.test.ts`
Expected: FAIL, e.g. `expected null to be 'mop'`. The cleanliness-guard test only exercises Task 2 code and passes before this task's code exists; report that honestly in the TDD evidence (guard-style tests are acceptable there).

- [ ] **Step 3: Implement `nearestMess`, `mopInteract`, `returnMop`, `stepCleaning`, the drop branch, the patience factor and the inspector rule**

- [ ] **Step 4: Run all tests and the build**

Run: `npm test && npm run build`
Expected: PASS, build exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/sim/mop.ts src/sim/drop.ts src/sim/effects.ts src/sim/events.ts src/sim/*.test.ts
git commit -m "feat(sim): mop pick-up, clean channel and return; cleanliness on patience and the inspector

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: Floor bots, floor HUD, Needs UI

**Files:**
- Modify: `src/sim/bots/brain.ts` (`think`, `stepBot`, `stepFloor`, new `mopPlan`, `cleanNode`), `src/ui/viewModels.ts` (`floorHud` body only), `docs/BACKLOG.md`
- Test: `src/sim/bots/brain.test.ts` (append), `src/sim/viewModelsFloor.test.ts` (new)

**Interfaces:**
- Consumes: `spillHeld`, `spillTiles` (Task 2); `nearestMess` (Task 3); `uncoveredOrder`, `setPlan`, `pop`, `walkToward` (existing brain internals).
- Produces (`brain.ts`):
  - `mopPlan(state: GameState, p: Player): BotStep[]`: `takeMop` at `nodeOf(mop.pos)`, then up to `botMopMax` `clean` steps (messes greedy nearest-first from the previous node, ties `messes` index) at `cleanNode`, then `returnMop` at the last clean node.
  - `cleanNode(state: GameState, mess: Mess, from: Vec2): Vec2` (Track A may export `walkableNodes` and `byDistance` from `src/sim/bots/path.ts` and import them here instead of copying; Track B never touches `path.ts`): the walkable tile within `interactRangeTiles` of the mess with no spill on it, nearest to `from` (ties lower y, then x), else the mess tile.
  - `think` rule 0 adds `if (p.tool === 'mop') return [{ kind: 'floor', node: nodeOf(state, p.pos), action: 'returnMop' }]`. A new rule 3b (after prep, before idle) returns `mopPlan` when all of these hold:
    - `mop.heldBy === null`
    - `messes.length > 0`
    - `cleanliness < botMopBelow || messes.length >= botMopMesses`
    - no other bot's plan contains a `floor` step
  - `stepBot`:
    - **Order interrupt (first).** Before executing any `floor` step, including while `cleaningTicksLeft > 0`, the bot checks `uncoveredOrder`. If one exists it cancels the clean (`cleaningTicksLeft = 0`, `cleaningMess = null`), returns the mop (`tool = null`, mop home), clears the plan (`setPlan(b, [])`, `b.thinkTicksLeft = 0`) and claims the order.
    - **Cleaning hold (second).** `if (p.cleaningTicksLeft > 0)` keep still and return; this is placed after the order interrupt and before reaction and yield.
    - **Notice block.** When `noticeTicksLeft` hits 0 with a drink in hand, draw `rngNext(state) < botSpillChance`. On a hit where `spillHeld` succeeds, the plan is the remake chain only; otherwise `[trash, ...remake]` as today.
  - `stepFloor`:
    - `takeMop`: queue E if the mop is free, in range and hands are empty, and pop; otherwise `setPlan(b, [])`.
    - `clean`: queue E if `nearestMess(state, p.pos)` exists; pop either way.
    - `returnMop`: `dropQueued = true`; pop.
- Produces (`viewModels.ts` `floorHud`): `messes` (straight map), `cleanliness` (`Math.round`), `mop` (`{x, y, heldBy}`), `stuns` (players with `stunTicksLeft > 0`, `secondsLeft = Math.ceil(t / 60)`) and `cleaning` (same for `cleaningTicksLeft`).

- [ ] **Step 1: Write the failing tests** (`brain.test.ts`, existing `cafe(n)` fixture with `test-no-traffic`, `runUntil`)

- `'a bot avoids a spill when a dry route exists'`: `cafe(1)`, bot at `{6,4}`, spill at `{7,4}`, an espresso customer with `huge` patience. The bot's path is `findPath(...)` around the spill: `runUntil` serve, and assert the bot's `tile` never equals `{7,4}` (record tiles each tick).
- `// Review Focus 5` `'spills on every approach to the counter: the bot walks through and still serves'`: spills on every walkable neighbour of `targetNodes(s, counter, bot.pos)[0]`, one espresso customer. Within 3000 ticks `today.served === 1`, and no bot stays stunned for more than 300 consecutive ticks.
- `'a forced bot can slip and keeps its plan'`: bot plan `[use counter put]` holding a latte, spill on the only start tile route (bot at `{6,3}` with spills on all neighbours). Use explicit seeds passed to `createRun` in the fixture until a `slip` log for the bot appears. During the stun its `plan` is unchanged and `pos` constant; after the stun it continues.
- `'a bot mops when idle and the floor is dirty'`: `cafe(1)`, 3 spills, no customers. `runUntil` messes `=== 0` (≤ 3000 ticks), then step one more tick: the mop is home and the bot's `tool === null`.
- `'a bot does not mop a clean-enough floor'`: 1 mess with cleanliness 90: 600 ticks pass and `mop.heldBy` stays null.
- `// Review Focus 4` `'an order interrupts a mop plan'` (precedence: before executing any `floor` step, including while `cleaningTicksLeft > 0`, the bot checks `uncoveredOrder`): bot mid-clean (`runUntil` `cleaningTicksLeft > 0`), then push an espresso customer with `huge` patience. Within `thinkTicks + 2` ticks, the mop is home (`heldBy === null`) and the bot's `claim` is that customer. Within 3000 ticks the customer is served, and on every tick `!(tool === 'mop' && holding !== null)`.
- `// Review Focus 1` `'a botched drink at the cap is binned, not spilled'`: 12 messes, force a mistake by setting the bot's `noticeTicksLeft = 1` while it holds a latte. After the notice, still 12 messes and plan[0] is trash.
- Update the existing `'bot feel: mistakes, noticing and remaking'` expectations that assume a trash step: accept either a trash step or a `drop` log with the bot's tile (the remake chain is unchanged).

`viewModelsFloor.test.ts` `'hud shows messes, mop, cleanliness, stuns and cleaning'`: build the state by hand and assert `hudViewModel(s)` fields, including `stuns: [{playerId:'p1', secondsLeft: 2}]` for 61 ticks.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/bots/brain.test.ts src/sim/viewModelsFloor.test.ts`
Expected: FAIL, e.g. `condition not met within 3000 ticks` and `expected undefined to deeply equal [...]`.

- [ ] **Step 3: Implement the bot floor logic and `floorHud`; add to `docs/BACKLOG.md` a new heading `## Needs UI (chaos pack: floor)` (do not append to the existing "Needs UI (phase 2)" section)**

Add these lines:
- piles and puddles from `HudVM.messes` (amount scales the size)
- the slip animation from `HudVM.stuns`
- the mop in its corner and in hand from `HudVM.mop`
- the cleaning progress from `HudVM.cleaning`
- a cleanliness meter from `HudVM.cleanliness`
- 4-way facing from `Player.facing`
- the R key in the controls hint

- [ ] **Step 4: Track A determinism/JSON test, then the full suite and build**

`step.test.ts` `'a floor day with drops, a slip and a mop plan is deterministic and JSON-safe'`:
- `cafe`-style, 1 human + 1 bot, traffic on.
- Script p1: drop a latte on the floor, walk over spills for 600 ticks, and press R at intervals.
- Run twice and expect `toEqual`; also `JSON.parse(JSON.stringify(a))` steps identically.
- A different seed gives a different state.

Run: `npm test && npm run build`
Expected: PASS, build exit code 0.

- [ ] **Step 5: Commit, rebase on `main`, merge, push**

```bash
git add src/sim/bots src/ui/viewModels.ts src/sim/viewModelsFloor.test.ts src/sim/step.test.ts docs/BACKLOG.md
git commit -m "feat(sim): bots avoid spills, slip when forced, mop when idle; floor HUD fields

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Track B: the rogue (branch `chaos-b-rogue`, own worktree)

Fixture for every Track B test file: `rogueCafe(day = 2)`. It is `createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }], settings: { bots: 0, dayLengthSec: 600 } })`, then push `test-no-traffic`, set `s.day = day`, call `startDay`, and set `s.eventSchedule = []`. p1 is parked at `{10,4}`, away from every station.

### Task 5: Upset trigger, remake window, going rogue

**Files:**
- Modify: `src/sim/customers.ts` (`serveCustomer`, `stepCustomers`, `serveDrink` target), `src/sim/pass.ts` (`mostImpatient`), `src/sim/rogue.ts` (`rogueActive`, `startRogue` record)
- Test: `src/sim/customers.test.ts`, `src/sim/rogue.test.ts` (new)

**Interfaces:**
- Produces (`rogue.ts`):
  - `rogueActive(state: GameState): boolean` is `state.rogue !== null || state.customers.some((c) => c.upset)`.
  - `startRogue(state: GameState, c: Customer): void` sets `state.rogue = { customerId: c.id, name: c.name, drink: c.drink, stage: 'walking', pos: { ...LAYOUT.rogueStart }, path: [], station: null, ticksLeft: 0, waitTicks: 0 }`. Task 6 extends it with the station pick.
- `serveCustomer`, at the top:
  - If `customer.upset`: delete `upset`, log `rogue.remade`, and pay as usual.
  - Else if all of these hold, draw `rngNext(state) < ECONOMY.rogue.chance`:
    - `state.day >= minDay`
    - `!rogueActive(state)`
    - `kind` is undefined, `'impatient'` or `'regular'`
  - On a hit: `customer.upset = { ticksLeft: secondsToTicks(remakeSeconds) }`, log `rogue.upset { drink }`, and return. That means no pay, no serve, no waste, and the drink is gone. The rng is not drawn otherwise.
- `stepCustomers`: an upset customer's `patienceLeft` is not decremented; `upset.ticksLeft` is. At 0 the customer is removed from the queue, then `loseCustomer(state, c)` (lost + regular bookkeeping), `tally(today, 'rogues')`, and `startRogue(state, c)`.
- Serve targeting: in `mostImpatient` (pass.ts) and `serveDrink` (customers.ts), an upset customer whose drink matches wins over any non-upset one.

- [ ] **Step 1: Write the failing tests**

- `'rogue rate is 0.8–2.5% over 2000 day-2 serves'`: loop 2000 times: `s.customers = [fresh normal latte customer]`, `s.rogue = null`, `serveCustomer(s, c, 'latte')`, and count `c.upset !== undefined`. Expect the count in `[16, 50]`.
- `'never on day 1, and day 1 draws nothing'`: `rogueCafe(1)`, 2000 serves give 0 upsets and `s.rng` equals its value before the loop.
- `'never for an influencer, a group, or while one is active'`: 2000 serves each of an influencer, a group, and a normal customer while another queued customer is upset (and again with `s.rogue` set) give 0 upsets, and `s.rng` does not advance.
- Helper for the next tests: `upsetServe(s, c, drink)` clones `s` and serves fresh normal customers until one comes back upset, then returns that clone positioned just before the hit, so the hit is reproducible.
- `'an upset customer is not paid, keeps patience, and the drink is gone'`: after `upsetServe`, cash, `served`, `wasted` and `today.sales` are unchanged and the customer is still queued. 120 `stepCustomers` ticks later `patienceLeft` is unchanged and `upset.ticksLeft === 900 - 120`.
- `'remake inside the window pays and never rolls again'`: after `upsetServe`, a serve of the matching drink pays, `served += 1`, the customer leaves, and a `rogue.remade` log exists. Spy the rng: `s.rng` is the same as a no-roll serve.
- `'an upset customer is served first among matches'`: two latte customers, the upset one with more patience. `counterInteract` with a latte serves the upset one.
- `'window ends: they leave the queue as a rogue, counted lost and a lost regular'`: an upset regular `Ada`, step `stepCustomers` 900 ticks. Expect `customers` without them, `today.lost === 1`, `today.rogues === 1`, `lostRegulars === 1`, `regulars[0].lost === 1`, and `rogue` matching `{ customerId, stage: 'walking', pos: {6,7}, drink }`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/customers.test.ts src/sim/rogue.test.ts`
Expected: FAIL, e.g. `expected 0 to be within [16, 50]`.

- [ ] **Step 3: Implement `rogueActive`, `startRogue`, the trigger, the frozen patience, the window end and the targeting**

- [ ] **Step 4: Run all tests and the build**

Run: `npm test && npm run build`
Expected: PASS. The new roll on day ≥ 2 serves shifts the rng stream. If an existing seeded test asserts an exact count past day 1 (e.g. `src/balance.test.ts`), investigate. Re-baseline only exact numbers that move because of the roll, never range checks, and say so in the commit body.

- [ ] **Step 5: Commit**

```bash
git add src/sim/customers.ts src/sim/pass.ts src/sim/rogue.ts src/sim/customers.test.ts src/sim/rogue.test.ts
git commit -m "feat(sim): upset customers: rogue roll on serve, remake window, going rogue

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: The rogue entity

**Files:**
- Modify: `src/sim/rogue.ts`, `src/sim/closing.ts` (reputation line), `src/sim/describe.ts` (`morningNotes`)
- Test: `src/sim/rogue.test.ts`, `src/sim/describe.test.ts`

**Interfaces:**
- Consumes: `findPath`, `targetNodes` (bots/path.ts); `STATION_RECIPES`; `ECONOMY.rogue`, `ECONOMY.moveSpeedTilesPerSecond`, `ECONOMY.interactRangeTiles`, `ECONOMY.drinkSupplies`, `ECONOMY.bots.arriveRadius`; `LAYOUT.door`.
- Produces (`rogue.ts`):
  - `ROGUE_STATION: Record<DrinkId, string>` = `{ espresso: 'espresso', latte: 'steamer', coldBrew: 'coldBrewTap' }`.
  - `isFreeForRogue(state: GameState, st: Station, from: Vec2): boolean`: a recipe station with `busyTicksLeft === 0`, `output === null` and `occupiedBy === null`, no connected player within `interactRangeTiles` of `st.pos`, and `targetNodes(state, st, from).length > 0`.
  - `pickStation(state: GameState, from: Vec2, drink: DrinkId, exclude: string | null): Station | null`: the drink's own station if free and not excluded; else the free recipe station nearest to `from` (Euclidean distance, ties layout order).
  - `startRogue` (extended): `pickStation` from `rogueStart`. If one is found, path to `targetNodes(...)[0]`; if not, call `stormOut`.
  - `stormOut(state: GameState): void`: stage `stormingOut`, path to `LAYOUT.door`, `station = null`, log `rogue.stormed`.
  - `stepRogue(state)`:
    - **Moving.** In every walking stage, move along `path` at `moveSpeedTilesPerSecond × speed / TICK_RATE`, with no collisions. Snap to a waypoint within the step distance and shift it.
    - **`walking`, on arrival.** If the station is busy, has output or is occupied, re-pick (exclude the current station). If a player is within range, go to `waiting` with `waitTicks = 0`. Otherwise **make**.
    - **`waiting`.** Same checks as arrival. If a player is still in range, `waitTicks += 1`; at `waitTicks >= secondsToTicks(waitSeconds)`, re-pick excluding this station. A re-pick that finds nothing storms out.
    - **Make.** `occupiedBy = customerId`, `busyTicksLeft = secondsToTicks(makeSeconds)`, `ticksLeft` the same. Each supply in `drinkSupplies[drink]` with stock ≥ 1 loses 1. Stage `making`.
    - **`making`.** `ticksLeft = station.busyTicksLeft`. When `station.occupiedBy !== customerId` (freed by `stepStations`), log `rogue.made`, set stage `leaving` and path to the door.
    - **`leaving`/`stormingOut`.** On arrival at the door, `state.rogue = null`.
  - `rogueTiles(state)`: `[nodeOf(state, rogue.pos)]`, or `[]` with no rogue. `rogueNear(state, at)`: a rogue exists and `dist(rogue.pos, at) <= ECONOMY.bots.yieldRadius`.
- `closing.ts`: in the reputation sum, subtract `ECONOMY.rogue.repHit * (today.rogues ?? 0)` before clamping.
- `describe.ts`: `export const ROGUE_REVIEW = 'Had to make it myself. Two stars. Good beans though.'`. `morningNotes` pushes it once when `state.days.at(-1)?.rogues` is greater than 0.

- [ ] **Step 1: Write the failing tests** (`rogue.test.ts`, helper `goRogue(s, drink)` = queue one customer with `upset: { ticksLeft: 1 }`, then one `step`)

- `'a rogue heads for their own station when free'`: latte gives `station 'steamer'`, stage `walking`, and a non-empty path.
- `'own station busy: the nearest other free recipe station'`: steamer `busyTicksLeft = 100` sends the rogue to the nearest of the other recipe stations from `{6,7}` (assert by computing it in the test).
- `'walks at 0.8× the base speed'`: after 60 ticks the path distance covered is ≤ `4 × 0.8 + 0.01`.
- `'makes for 10 s: occupied, supplies used, no output, then leaves and is removed at the door'`: latte with beans and milk. `runUntil` stage `making`: `occupiedBy === customerId`, `busyTicksLeft === 600`, beans −1, milk −1. `runUntil` `rogue === null`: steamer `output === null`, `occupiedBy === null`, and `rogue.made` logged.
- `'out of milk: makes it anyway'`: milk 0 still reaches `making`; milk stays 0.
- `'a player at the station: wait 5 s, then another station'`: p1 is moved to the steamer AFTER the rogue has picked it (`isFreeForRogue` skips stations with a player in range at pick time). Arrival gives `waiting`. 299 ticks later still waiting; at 300 the station changes and the stage is `walking`.
- `'the player steps away during the wait: making starts'`
- `'nothing free at decision time or after the wait: storm out'`: all four recipe stations busy at going-rogue time gives `stormingOut` and a `rogue.stormed` log; removed at the door.
- `'never two rogues'`: while `s.rogue` is set, 500 forced-eligible serves upset nobody.
- `'day end with a rogue mid-make frees the station and counts once'`: `finishDay` during `making`: station `occupiedBy === null`, `rogue === null`, `days.at(-1).lost === 1`, `rogues === 1`.
- `'rogues cost reputation and a review next morning'`: two runs to `finishDay` with `today.rogues` 0 vs 2: reputation differs by `0.2` (toBeCloseTo). After `startNight`/`startDay` the notes contain `ROGUE_REVIEW` once.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/rogue.test.ts src/sim/describe.test.ts`
Expected: FAIL, e.g. `expected null to be 'steamer'`.

- [ ] **Step 3: Implement the entity, the reputation hit and the review**

- [ ] **Step 4: Run all tests and the build**

Run: `npm test && npm run build`
Expected: PASS, build exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/sim/rogue.ts src/sim/closing.ts src/sim/describe.ts src/sim/rogue.test.ts src/sim/describe.test.ts
git commit -m "feat(sim): the rogue customer walks behind the counter, makes their drink or storms out

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: Bots and the rogue, rogue HUD, telemetry, Needs UI

`brain.ts` is not edited in this task: the foundation's `rogueNear`/`rogueTiles` slots plus Task 6's bodies already wire the bots.

**Files:**
- Modify: `src/ui/viewModels.ts` (`rogueHud` body, `ReceiptVM.rogues`, `receiptViewModel`), `docs/BACKLOG.md`
- Test: `src/sim/bots/brain.test.ts` is Track A's file, so put these bot tests in `src/sim/rogue.test.ts`. Also `src/sim/viewModelsRogue.test.ts` (new), `src/sim/viewModels2.test.ts` (add `rogues: 0` to the two receipt `toEqual`s), `src/host/telemetry.test.ts`.

**Interfaces:**
- Produces: `rogueHud(state)` returns `{ rogue: { stage, drink, x, y, secondsLeft, name? } }`, or `{}` with no rogue. `secondsLeft` is `Math.ceil(ticksLeft / 60)` when making, `Math.ceil((secondsToTicks(waitSeconds) - waitTicks) / 60)` when waiting, else 0. Also `ReceiptVM.rogues: number` is required (always set by `receiptViewModel`, `d.rogues ?? 0`); the two receipt `toEqual` literals in `src/sim/viewModels2.test.ts` gain `rogues: 0`.

- [ ] **Step 1: Write the failing tests**

`rogue.test.ts` (bots, fixture with `bots: 1`):
- `'a bot yields to a rogue on its waypoint and paths around it'`: put the rogue (stage `waiting`, frozen by p1 at a station) on the bot's next waypoint. The bot's `yields` increases, and after the yield its fresh path avoids the rogue's tile.
- `'a bot treats an occupied station as busy and carries on after'`: the rogue is `making` at the espresso machine and the bot has an espresso order. The bot waits (no insert while occupied, no grounds lost). Within 600 + `maxWaitTicks` ticks the order is served or re-planned, and `occupiedBy` ends null.
- `// Review Focus 3` `'the only free station, a bot walking to it: no deadlock'`: three recipe stations busy (`busyTicksLeft` 5000), the tap free, the bot sent to the tap (cold brew order), and the rogue's drink coldBrew. Within 1500 ticks, `state.rogue === null` or the stage is `leaving`/`stormingOut`; the tap is never `occupiedBy` with no rogue; the bot's `waitTicks` never exceeds `maxWaitTicks`.

`viewModelsRogue.test.ts`:
- `'hud shows the rogue with patched seconds'`: making with `ticksLeft` 61 gives `secondsLeft 2`. Waiting with `waitTicks` 0 gives 5.
- `'receipt carries rogues'`: `receiptViewModel({...day, rogues: 2}).rogues === 2`, and it is 0 when absent.

`telemetry.test.ts` `'records rogue log rows from the sim'`: following the existing sim-log row test, a state whose `log` has a `rogue.upset` entry produces one row of that kind. A peer `tele` event with kind `rogue.made` is rejected by `parseTele`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sim/rogue.test.ts src/sim/viewModelsRogue.test.ts src/sim/viewModels2.test.ts src/host/telemetry.test.ts`
Expected: FAIL, e.g. `expected undefined to be 2`. The telemetry test and the three bot tests pass before this task's code exists (earlier tasks deliver them); report that honestly in the TDD evidence (guard-style tests are acceptable there).

- [ ] **Step 3: Implement `rogueHud` and `receiptViewModel.rogues`; add to `docs/BACKLOG.md` a new heading `## Needs UI (chaos pack: rogue)` (do not append to the existing "Needs UI (phase 2)" section)**

Add these lines:
- the angry bubble on an upset customer (`Customer.upset`)
- the rogue walking behind the counter and out the door (`HudVM.rogue`)
- the occupied-station tell (`Station.occupiedBy`)
- the review in the morning notes
- the receipt's `rogues` line

- [ ] **Step 4: Track B determinism/JSON test, then the full suite and build**

`rogue.test.ts` `'a day with a rogue is deterministic and JSON-safe'`:
- day 2, traffic on, 1 bot.
- Force one upset at tick 300 by setting `upset` on the head customer.
- Run 3000 ticks twice and expect `toEqual`; also `JSON.parse(JSON.stringify(a))` steps identically.

Run: `npm test && npm run build`
Expected: PASS, build exit code 0.

- [ ] **Step 5: Commit, rebase on `main`, merge, push**

```bash
git add src/ui/viewModels.ts src/sim/rogue.test.ts src/sim/viewModelsRogue.test.ts src/sim/viewModels2.test.ts src/host/telemetry.test.ts docs/BACKLOG.md
git commit -m "feat(sim): bots yield to the rogue; rogue HUD and receipt fields

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Combined check, docs and release notes (branch `chaos-8-docs`, after both tracks merge)

**Files:**
- Test: `src/sim/step.test.ts`
- Modify: `CHANGELOG.md` (Unreleased), `README.md` (controls), `public/roadmap.json` (`changelog` array only)

- [ ] **Step 1: Write the combined test**

`'a day with messes, a mop plan and a rogue is deterministic and JSON-safe'`:
- day 2, 1 human + 1 bot, traffic on.
- Force the scenario by state: place 3 messes (`placeMess` or direct `messes` entries), set `cleanliness = 60`, and set one queued customer's `upset = { ticksLeft: 60 }` directly.
- Run 4000 ticks twice from the same state and assert `toEqual`; a JSON round-trip of the state steps identically.
- Collect `state.log` per tick: at least one `clean` log row is seen, and `state.rogue` was non-null at some tick. No `rogue.upset` log assertion (a forced `upset` field never emits it).

- [ ] **Step 2: Run it**

Run: `npx vitest run src/sim/step.test.ts`
Expected: PASS. If it fails, the bug is in a track's code; fix it there with its own test.

- [ ] **Step 3: Write the docs**

**`CHANGELOG.md` Unreleased** (minor-bump candidate `1.1.0`; the version bump itself is the controller's):
- "Press R to drop what you're holding: next to a machine it goes in the machine, at the counter it goes on the pass, at the bin it's binned, anywhere else it hits the floor."
- "Floors get messy: grounds piles spread when walked through, spills can make you slip for a few seconds, and a dirty café makes customers less patient and can fail the health inspection. Grab the mop in the corner (E to pick up, E next to a mess to clean, R to put it back). Bots mop when it's quiet."
- "Now and then (from day 2) a customer handed a drink gets upset. Remake it within 15 seconds or they walk behind the counter and make it themselves, without paying."

**`README.md`:** add `- **Drop:** R (into a machine, onto the pass, in the bin, or on the floor; puts the mop back)` after the "Use a station" line, plus one line each on messes and the mop and on the rogue customer, under the existing bullet list.

**`public/roadmap.json` `changelog`:** append `{ "date": "2026-10-28", "text": "Chaos pack sim side: drop key, floor messes, mop and cleanliness, rogue customer" }`.

- [ ] **Step 4: Run all tests and the build**

Run: `npm test && npm run build`
Expected: PASS, build exit code 0.

- [ ] **Step 5: Commit, merge, push**

```bash
git add src/sim/step.test.ts CHANGELOG.md README.md public/roadmap.json
git commit -m "docs: chaos pack changelog, R key in the README, roadmap entry

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Planner rulings

Calls the spec left open, each with one line of reasoning. Spec §12 already lists the builder-check rulings.

1. **Four extra mess keys** (`mergeAdd 0.5`, `spreadLoss 0.25`, `minAmount 0.25`, `spreadFactor 0.5`) are added to `ECONOMY.mess`. The spec names these numbers in prose, and the no-literals rule needs them in economy.
2. **`LAYOUT.rogueStart = {6,7}`** is added for the same no-literals reason.
3. **`GameState.nextMessId`** gives mess ids that stay stable for the HUD key, even when a tile is cleaned and dirtied again.
4. **`Player.heldDir`** stores the latest move input. A stun zeroes `moveDir` (the renderer animates from it) and restores it from `heldDir` when the stun ends, which is how a held key survives the stun.
5. **Stun gating is centralised in the foundation's `stepStuns`** plus the `stepBots` skip, so neither track touches `movement.ts`.
6. **A floor tile is `isWalkable`, and a drop's last fallback is `nodeOf`.** This reuses the bots' grid, so drops, spreads and pathing agree on what counts as floor.
7. **At the cap nothing is added or merged by any source** (R, slip, bot botch, spread). This is one rule, it is literal to "nothing drops", and the human keeps the item.
8. **A spill over grounds keeps the mess id and becomes a spill**, with amounts merged. That reads as "a wet pile" and avoids a remove-plus-add flash in the view.
9. **A drink that hits the floor (R, slip, bot) counts as waste; one placed on a station or the pass does not.** It was thrown away, consistent with the trash rule.
10. **Grounds dropped at the counter stay in hand**, because the pass holds only drinks.
11. **E routing.** A mop carrier's E always goes to `mopInteract`. With no station in range and empty hands, E also goes to `mopInteract` (pick-up). An occupied station ignores E. These are three guards in `interact`, in the foundation.
12. **A clean is cancelled by movement, a stun, or losing the mop (R), checked in `stepCleaning`.** Track A owns the channel's full lifecycle.
13. **The mop's `pos` follows its holder each tick, and a missing or disconnected holder sends it home.** This covers a leaving player without touching `applyInput`.
14. **The rogue roll is drawn only for eligible serves.** Day 1 and ineligible serves keep today's rng stream, which keeps the existing seeded tests stable.
15. **Groups are never eligible, even on their last drink.** The spec lists only normal, impatient or regular.
16. **An upset customer is served first among matching customers.** The remake must reach them, and they are the most aggrieved.
17. **A rogue is counted (lost, rogues, regular bookkeeping) once, when they leave the queue.** An upset customer still queued at day end is lost as usual, not a rogue. One count point means no double counting at day end.
18. **The rogue's "other station" is the nearest free recipe station by straight-line distance, ties in layout order, excluding only the station just abandoned.** It is simple and deterministic.
19. **On arrival, a station that turned busy, full or occupied causes an immediate re-pick (no wait).** Only a player in range triggers the 5 s wait, and if the player leaves during the wait, making starts at once.
20. **A rogue latte uses one beans and one milk if in stock, at make start**, matching "like a normal make".
21. **Rogue speed ignores café move modifiers**, since those are barista effects. A power flicker pauses the rogue's make timer, because `stepStations` is paused.
22. **The rogue HUD key is stage, drink and name; position and seconds are patched.** The rogue moves every tick and must not rebuild the HUD.
23. **The bot mop plan is guarded so only one bot plans it at a time.** It ends with an in-place `returnMop` (R teleports the mop), and an order interrupt returns the mop first so hands are free for the chain.
24. **The bot spill roll happens at notice time** (the moment it would have binned the drink), so the existing botch and remake flow is unchanged.
25. **A peer's `drop` at night is ignored**, so a press in the shop cannot fire at the next sunrise.
