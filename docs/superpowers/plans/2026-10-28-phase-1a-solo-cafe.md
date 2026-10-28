# Phase 1a: Solo-Playable Café Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic, testable café simulation playable solo in the browser at the live GitHub Pages URL: seven-day run, night draft, frantic day, score screen, crash-resume, run history.

**Architecture:** All game rules live in `src/sim` as pure functions over one plain JSON-able `GameState`, stepped at a fixed 60 Hz with a seeded RNG stored inside the state. The simulation runs in a Web Worker (`src/host`) that receives `PlayerInput`s and posts full-state snapshots at 20 Hz; the page never steps the sim itself. A `Transport` interface (`src/net`) hides whether snapshots come from the local Worker (this plan) or a relay (phase 1b). PixiJS draws the café from interpolated snapshots; every menu and HUD is plain HTML in `src/ui`, driven by tested pure view-model functions.

**Tech Stack:** TypeScript 5, Vite 8, Vitest 5, PixiJS 8, Node 24, npm. GitHub Actions for test, build, and Pages deploy.

**Spec:** `docs/superpowers/specs/2026-10-28-cafetycoon-design.md` (sections 5–9, 11, 12, 15, 18 are implemented here; section 10 multiplayer and the Cloudflare relay are phase 1b).

## Global Constraints

- Public repo: no secrets, no third-party assets. Shapes and text only in this plan; no sprite files.
- Node `>=22.12` (`engines` in `package.json`); CI and docs use Node 24. Pin exact versions of `pixi.js@8`, `vite@8`, `vitest@5`, `typescript@5` at install time (whatever `npm install` resolves on the day; the lockfile records them).
- `src/sim` and `src/data` import nothing from `render`, `ui`, `net`, `host`, `storage`, `pixi.js`, or the DOM. No `Math.random`, `Date`, or timers anywhere in `src/sim`.
- `GameState` must survive `JSON.parse(JSON.stringify(state))` unchanged: no `Map`, `Set`, `Infinity`, `NaN`, class instances, or functions in it.
- Fixed step: `TICK_RATE = 60` ticks per second. Every duration in state is stored in ticks (integers).
- Vite `base` is `/CafeTycoon/`. The live URL is `https://snowmexican7.github.io/CafeTycoon/`.
- Parody names only in the catalogue (copied from the spec, section 8). Prices and times from the spec, section 6, verbatim.
- Data modules live in `src/data/` (the spec's layout shows a root `data/`; keeping them under `src` makes imports and `tsconfig` simpler, and the shape is the same).
- Work on branch `phase-1a`, commit after every task, push the branch. Merge to `main` only in the final task once the playtest checklist passes, so the live URL keeps the placeholder until the game is playable.
- Test files live next to the code as `*.test.ts`. `npm test` must stay green after every task.

## Review Focus

Failure modes the spec implies that a casual player will hit. Each has its test in the task named.

1. Two baristas press interact on the same station in the same tick: exactly one gets the output, nothing is duplicated or consumed twice (Task 7).
2. Two buy inputs in one night tick whose combined cost exceeds cash: the first succeeds, the second is rejected, cash never goes negative (Task 5).
3. Late in an unlimited run every permanent item is owned: `dealHand` deals fewer than five, possibly zero, and never loops (Task 5).
4. A snapshot taken mid-day or mid-closing, JSON round-tripped, resumes and continues deterministically; a player joining or leaving mid-day never leaves a dangling held item or a crash (Task 9).
5. The host changes pace mid-day: new arrivals and new customers use the new multipliers immediately; customers already in the queue keep their original `patienceMax` (Task 9).

---

## File structure

```
index.html                       Vite entry: canvas mount + overlay containers
vite.config.ts                   base '/CafeTycoon/', worker format 'es', vitest include
package.json, tsconfig.json
public/.nojekyll
.github/workflows/deploy.yml     test+build on every push; deploy Pages on main
src/main.ts                      wiring: title -> transport -> renderer/ui; storage
src/sim/types.ts                 every state, input, effect, and catalogue type
src/sim/constants.ts             TICK_RATE, secondsToTicks
src/sim/rng.ts                   mulberry32 over state.rng
src/sim/run.ts                   createRun, startNight, startDay
src/sim/effects.ts               itemModifiers, computeModifiers, rentForDay, resolveGamble
src/sim/night.ts                 eligibleItems, dealHand, applyNightInput, stepNight, restockCost
src/sim/movement.ts              applyMovement, nearestStation
src/sim/stations.ts              STATION_RECIPES, stepStations, interact
src/sim/customers.ts             availableDrinks, spawnCustomers, stepCustomers, serveDrink
src/sim/closing.ts               finishDay (rent, reputation, bankruptcy, clear tomorrow items)
src/sim/describe.ts              describeEffects, morningNotes
src/sim/score.ts                 scoreRun, summarizeRun
src/sim/step.ts                  step: phase dispatch, join/leave/settings inputs
src/data/economy.ts              every tunable number
src/data/layout.ts               floor size, station tiles, spawn points, door, queue slots
src/data/catalogue.ts            the 16 starter items
src/data/scenarios.ts            the 4 scenarios
src/host/loop.ts                 fixed-step accumulator + snapshot cadence (pure, testable)
src/host/simWorker.ts            Web Worker entry: owns GameState, runs the loop
src/net/transport.ts             Transport interface + worker message types
src/net/localTransport.ts        Transport over the Web Worker
src/net/sendGate.ts              20/s input send cap
src/storage/storageLike.ts       minimal Storage interface + in-memory impl for tests
src/storage/snapshotStore.ts     save/load/clear the running GameState
src/storage/historyStore.ts      append/list RunRecords (cap 50)
src/storage/settingsStore.ts     playerName, playerToken, pace, dayLengthSec, nightLengthSec
src/render/interpolate.ts        interpolateView(prev, next, alpha) -> RenderView
src/render/keys.ts               keysToVector(pressed) -> Vec2
src/render/keyboard.ts           DOM key tracking -> read()/takeInteract()
src/render/scene.ts              PixiJS: floor, stations, baristas, customers, bars
src/render/app.ts                createRenderer(mount) -> { update(view), destroy }
src/ui/viewModels.ts             money, hudViewModel, nightViewModel, closingViewModel, weekEndViewModel, titleViewModel
src/ui/dom.ts                    el(), show(), hide() helpers
src/ui/title.ts, hud.ts, night.ts, closing.ts, weekEnd.ts, pause.ts   overlays
src/style.css
docs/playtest-checklist.md       manual checklist for the solo run
```

---

### Task 1: Project scaffold, CI, and Pages deploy from Actions

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html` (replaces the placeholder), `public/.nojekyll`, `src/main.ts`, `src/smoke.test.ts`, `.github/workflows/deploy.yml`
- Modify: `.gitignore` (add `*.tsbuildinfo`), `README.md` (dev section)
- Delete: root `.nojekyll` (moved into `public/`)

**Interfaces:**
- Produces: `npm run dev`, `npm test` (`vitest run`), `npm run build` (`tsc --noEmit && vite build`), `npm run preview`. Vite config: `base: '/CafeTycoon/'`, `worker: { format: 'es' }`, `test: { include: ['src/**/*.test.ts'] }`.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b phase-1a
```

- [ ] **Step 2: Initialise npm and install pinned dependencies**

```bash
npm init -y
npm install --save-exact pixi.js@8
npm install --save-dev --save-exact vite@8 vitest@5 typescript@5
```

Set in `package.json`: `"private": true`, `"type": "module"`, `"engines": { "node": ">=22.12" }`, and the four scripts above.

- [ ] **Step 3: Write `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`**

`tsconfig.json`: `strict: true`, `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "bundler"`, `lib: ["ES2022", "DOM", "WebWorker"]`, `noEmit: true`, `include: ["src", "vite.config.ts"]`.

`index.html`: `<div id="game"></div>` for the canvas, one `<div>` per overlay with ids `title`, `hud`, `night`, `closing`, `weekEnd`, `pause`, all `hidden` except `title`, and `<script type="module" src="/src/main.ts">`. Title text "CafeTycoon".

`src/main.ts`: for this task only, `document.querySelector('#title')!.textContent = 'CafeTycoon: scaffold OK'`.

- [ ] **Step 4: Write the smoke test**

```ts
// src/smoke.test.ts
import { describe, it, expect } from 'vitest';
describe('toolchain', () => {
  it('runs tests', () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 5: Run test and build**

Run: `npm test && npm run build`
Expected: 1 test passed; `dist/index.html` exists and references `/CafeTycoon/assets/`.

- [ ] **Step 6: Write `.github/workflows/deploy.yml`**

Two jobs. `test` on every push and pull request: `actions/checkout@v7`, `actions/setup-node@v7` with `node-version: 24` and `cache: npm`, `npm ci`, `npm test`, `npm run build`, then `actions/upload-pages-artifact@v5` with `path: dist`. `deploy`: `needs: test`, `if: github.ref == 'refs/heads/main'`, permissions `pages: write` and `id-token: write`, environment `github-pages`, `actions/deploy-pages@v5`. Add `concurrency: { group: pages, cancel-in-progress: true }`.

- [ ] **Step 7: Switch Pages to the Actions source**

Run: `gh api -X PUT repos/snowmexican7/CafeTycoon/pages -f build_type=workflow`
Expected: JSON response containing `"build_type": "workflow"`.

- [ ] **Step 8: Update the README dev section**

Add under "Working on it": clone, `npm install`, `npm run dev`, `npm test`, `npm run build`; Node 24 recommended.

- [ ] **Step 9: Commit and push the branch**

```bash
git add -A && git commit -m "chore: Vite + Vitest + PixiJS scaffold, CI, Pages deploy workflow"
git push -u origin phase-1a
```

- [ ] **Step 10: Confirm CI**

Run: `gh run watch --exit-status`
Expected: the `test` job passes on the branch; `deploy` is skipped (not main).

---

### Task 2: Types, RNG, constants, and `createRun`

**Files:**
- Create: `src/sim/types.ts`, `src/sim/constants.ts`, `src/sim/rng.ts`, `src/sim/run.ts`, `src/data/economy.ts`, `src/data/layout.ts`
- Test: `src/sim/rng.test.ts`, `src/sim/run.test.ts`

**Interfaces:**
- Produces (`src/sim/types.ts`), used by every later task:

```ts
export type PlayerId = string;
export type DrinkId = 'espresso' | 'latte' | 'coldBrew';
export type SupplyId = 'beans' | 'milk' | 'concentrate';
export type ItemKind = 'grounds' | DrinkId;
export type StationKind = 'grinder' | 'espresso' | 'steamer' | 'coldBrewTap' | 'counter' | 'trash';
export type Phase = 'night' | 'day' | 'closing' | 'weekEnd' | 'ended';
export type ScenarioId = 'normal' | 'campusTown' | 'rainyWeek' | 'touristSeason';
export type Rarity = 'common' | 'uncommon' | 'rare';
export type Pace = 1 | 2 | 3 | 4 | 5;
export interface Vec2 { x: number; y: number }
export interface Player { id: PlayerId; name: string; pos: Vec2; moveDir: Vec2; interactQueued: boolean; holding: ItemKind | null; connected: boolean }
export interface Station { id: string; kind: StationKind; pos: Vec2; busyTicksLeft: number; output: ItemKind | null }
export interface Customer { id: number; drink: DrinkId; patienceLeft: number; patienceMax: number }
export type Effect =
  | { kind: 'stationSpeed'; station: StationKind; mul: number }
  | { kind: 'moveSpeed'; mul: number }
  | { kind: 'price'; drink?: DrinkId; mul: number }
  | { kind: 'traffic'; mul: number }
  | { kind: 'patience'; mul: number }
  | { kind: 'tipRate'; add: number }
  | { kind: 'orderBias'; drink: DrinkId; mul: number }
  | { kind: 'supplyCost'; supply: SupplyId; mul: number }
  | { kind: 'gamble'; chance: number; win: Effect[]; lose: Effect[] };
export interface CatalogueItem { id: string; name: string; category: 'equipment' | 'pos' | 'seating' | 'decor' | 'marketing' | 'staff' | 'oddball'; cost: number; rarity: Rarity; duration: 'permanent' | 'tomorrow'; effects: Effect[]; requires?: string[]; excludes?: string[]; flavor: string }
export interface OwnedItem { itemId: string; effects: Effect[] }
export interface Scenario { id: ScenarioId; name: string; note: string; effects: Effect[] }
export interface Settings { dayLengthSec: number; nightLengthSec: number; pace: Pace }
export interface DayStats { day: number; served: number; lost: number; turnedAway: number; sales: number; tips: number; rent: number }
export interface GameState {
  seed: number; rng: number; tick: number;
  phase: Phase; phaseTicksLeft: number;
  day: number; unlimited: boolean; bankrupt: boolean;
  hostId: PlayerId; settings: Settings;
  cash: number; startingCash: number; reputation: number;
  supplies: Record<SupplyId, number>;
  scenario: ScenarioId;
  owned: OwnedItem[]; activeTomorrow: OwnedItem[]; hand: string[]; boughtTonight: string[];
  ready: PlayerId[];
  players: Player[]; stations: Station[]; customers: Customer[]; nextCustomerId: number;
  today: DayStats; days: DayStats[]; morningNotes: string[];
}
export type PlayerInput =
  | { kind: 'move'; playerId: PlayerId; x: number; y: number; interact: boolean }
  | { kind: 'buy'; playerId: PlayerId; itemId: string }
  | { kind: 'restock'; playerId: PlayerId; supply: SupplyId; packs: number }
  | { kind: 'ready'; playerId: PlayerId }
  | { kind: 'weekEnd'; playerId: PlayerId; choice: 'stop' | 'continue' }
  | { kind: 'settings'; playerId: PlayerId; settings: Partial<Settings> }
  | { kind: 'join'; playerId: PlayerId; name: string }
  | { kind: 'leave'; playerId: PlayerId };
export interface CreateRunOptions { seed: number; hostId: PlayerId; players: { id: PlayerId; name: string }[]; settings?: Partial<Settings> }
export interface RunRecord { date: string; seed: number; scenario: ScenarioId; players: string[]; daysCompleted: number; score: number; itemsBought: string[] }
```

- Produces (`src/sim/constants.ts`): `TICK_RATE = 60`, `secondsToTicks(s: number): number` (rounded).
- Produces (`src/sim/rng.ts`): `seedRng(seed: number): number` (initial mulberry32 state, seed coerced to uint32), `rngNext(state: { rng: number }): number` (advances `state.rng`, returns a float in `[0, 1)`), `rngInt(state: { rng: number }, maxExclusive: number): number`.
- Produces (`src/sim/run.ts`): `createRun(opts: CreateRunOptions): GameState` (phase `'night'`, day 1; the hand is dealt by Task 5's `dealHand`, so until Task 5 it sets `hand: []`), `startNight(state: GameState): GameState`, `startDay(state: GameState): GameState`.
- Produces (`src/data/economy.ts`): `ECONOMY` with these exact values: `startingCash: 100`, `startingReputation: 2.5`, `rentPerDay: 25`, `startingSupplies: { beans: 20, milk: 10, concentrate: 15 }`, `packs: { beans: { size: 10, cost: 8 }, milk: { size: 10, cost: 10 }, concentrate: { size: 10, cost: 9 } }`, `prices: { espresso: 3, latte: 4.75, coldBrew: 4 }`, `stationSeconds: { grinder: 2.5, espresso: 5, steamer: 3.5, coldBrewTap: 1.5 }`, `patienceSeconds: 25`, `maxTipRate: 0.35`, `baseArrivalsPerSecond: 1 / 6`, `queueCapacity: 6`, `closingGraceSeconds: 10`, `reputation: { threshold: 0.7, delta: 0.2, min: 0.5, max: 5 }`, `trafficFromReputation: { base: 0.7, perStar: 0.12 }`, `pace: { arrival: [0.6, 0.8, 1, 1.3, 1.65], patience: [1.4, 1.2, 1, 0.85, 0.7] }`, `weekRamp: { rent: 1.25, traffic: 1.15, patience: 0.95 }`, `scoredWeekDays: 7`, `moveSpeedTilesPerSecond: 4`, `interactRangeTiles: 1.1`, `baristaHalfWidth: 0.35`, `dayLengthSec: 150`, `nightLengthSec: 60`, `handSize: 5`, `rarityWeights: { common: 60, uncommon: 30, rare: 10 }`, `cheapThreshold: 30`, `drinkSupplies: { espresso: ['beans'], latte: ['beans', 'milk'], coldBrew: ['concentrate'] }`.
- Produces (`src/data/layout.ts`): `LAYOUT = { width: 12, height: 8, stations: [{ id: 'grinder', kind: 'grinder', pos: {x:1,y:1} }, { id: 'espresso', kind: 'espresso', pos: {x:3,y:1} }, { id: 'steamer', kind: 'steamer', pos: {x:5,y:1} }, { id: 'coldBrewTap', kind: 'coldBrewTap', pos: {x:8,y:1} }, { id: 'trash', kind: 'trash', pos: {x:10,y:1} }, { id: 'counter', kind: 'counter', pos: {x:6,y:6} }], spawnPoints: [{x:6,y:4},{x:5,y:4},{x:7,y:4},{x:6,y:3}], door: {x:1,y:6}, queueSlots: [{x:6,y:7.6},{x:7,y:7.6},{x:8,y:7.6},{x:9,y:7.6},{x:10,y:7.6},{x:11,y:7.6}] }`. Positions are tile centres; a station occupies the unit square around its centre.

- [ ] **Step 1: Write the RNG tests**

```ts
// src/sim/rng.test.ts
import { seedRng, rngNext, rngInt } from './rng';
it('is deterministic for a seed', () => {
  const a = { rng: seedRng(42) }, b = { rng: seedRng(42) };
  const seqA = Array.from({ length: 5 }, () => rngNext(a));
  const seqB = Array.from({ length: 5 }, () => rngNext(b));
  expect(seqA).toEqual(seqB);
});
it('differs across seeds and stays in [0,1)', () => {
  const a = { rng: seedRng(1) }, b = { rng: seedRng(2) };
  expect(rngNext(a)).not.toBe(rngNext(b));
  for (let i = 0; i < 1000; i++) { const v = rngNext(a); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
});
it('rngInt covers the range', () => {
  const s = { rng: seedRng(7) }; const seen = new Set<number>();
  for (let i = 0; i < 500; i++) seen.add(rngInt(s, 4));
  expect([...seen].sort()).toEqual([0, 1, 2, 3]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/sim/rng.test.ts`
Expected: FAIL, cannot resolve `./rng`.

- [ ] **Step 3: Implement `rng.ts`, `constants.ts`, `types.ts`**

mulberry32: the state is a uint32; `rngNext` does `state.rng = (state.rng + 0x6D2B79F5) | 0`, then the standard mulberry32 mix on that value, and returns `(result >>> 0) / 4294967296`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/sim/rng.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Write the `createRun` tests**

```ts
// src/sim/run.test.ts
import { createRun } from './run';
import { ECONOMY } from '../data/economy';
import { LAYOUT } from '../data/layout';
const opts = { seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'Ken' }, { id: 'p2', name: 'Sam' }] };
it('starts on the first night with spec values', () => {
  const s = createRun(opts);
  expect(s.phase).toBe('night'); expect(s.day).toBe(1);
  expect(s.cash).toBe(100); expect(s.startingCash).toBe(100); expect(s.reputation).toBe(2.5);
  expect(s.supplies).toEqual({ beans: 20, milk: 10, concentrate: 15 });
  expect(s.phaseTicksLeft).toBe(60 * 60);
  expect(s.settings).toEqual({ dayLengthSec: 150, nightLengthSec: 60, pace: 3 });
  expect(s.stations.map(st => st.kind)).toEqual(['grinder', 'espresso', 'steamer', 'coldBrewTap', 'trash', 'counter']);
  expect(s.players.map(p => p.pos)).toEqual(LAYOUT.spawnPoints.slice(0, 2));
  expect(s.players.every(p => p.holding === null && p.connected && !p.interactQueued)).toBe(true);
  expect(ECONOMY.scoredWeekDays).toBe(7);
});
it('is JSON-safe and deterministic per seed', () => {
  const a = createRun(opts), b = createRun(opts);
  expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  expect(a).toEqual(b);
  expect(createRun({ ...opts, seed: 2 }).rng).not.toBe(a.rng);
});
it('honours settings overrides', () => {
  const s = createRun({ ...opts, settings: { pace: 5, nightLengthSec: 30 } });
  expect(s.settings.pace).toBe(5); expect(s.phaseTicksLeft).toBe(30 * 60);
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run src/sim/run.test.ts`
Expected: FAIL, cannot resolve `./run`.

- [ ] **Step 7: Implement `run.ts`, `economy.ts`, `layout.ts`**

`createRun`: seed the rng, pick `scenario` with `rngInt(state, 4)` over `['normal', 'campusTown', 'rainyWeek', 'touristSeason']` (Task 3 switches this to `SCENARIOS`), build players at `spawnPoints` in order, stations from `LAYOUT`, then `startNight`. `startNight` sets `phase: 'night'`, `phaseTicksLeft: secondsToTicks(settings.nightLengthSec)`, `ready: []`, `boughtTonight: []`, `hand: []` (Task 5 replaces with `dealHand`). `startDay` sets `phase: 'day'`, `phaseTicksLeft: secondsToTicks(settings.dayLengthSec)`, `customers: []`, `today: { day, served: 0, lost: 0, turnedAway: 0, sales: 0, tips: 0, rent: 0 }`, `morningNotes: []` (Task 9 fills them).

- [ ] **Step 8: Run all tests to verify pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/sim src/data && git commit -m "feat(sim): types, seeded rng, economy and layout data, createRun"
```

---

### Task 3: Catalogue and scenarios data with validity tests

**Files:**
- Create: `src/data/catalogue.ts`, `src/data/scenarios.ts`
- Modify: `src/sim/run.ts` (use `SCENARIOS` for the roll)
- Test: `src/data/catalogue.test.ts`

**Interfaces:**
- Produces: `CATALOGUE: CatalogueItem[]` (16 entries with ids `dualBoiler`, `laMazzoccaPro`, `flatBurrGrinder`, `autoSteamPitcher`, `brandedCups`, `nonSlipShoes`, `digitalKiosk`, `squarelyTerminal`, `chirperThread`, `corkboardFlyers`, `dailyGrindAd`, `instaGlamStory`, `secondColdBrewTap`, `bulkBeanDeal`, `mysteryRoasterSample`, `streetSign`), `catalogueById: Record<string, CatalogueItem>`, `SCENARIOS: Scenario[]`, `scenarioById: Record<ScenarioId, Scenario>`.
- Item values: effects exactly as the spec's section 8 list. Costs: dualBoiler 120, laMazzoccaPro 320 (rare, `requires: ['dualBoiler']`), flatBurrGrinder 60, autoSteamPitcher 90, brandedCups 50, nonSlipShoes 40, digitalKiosk 80, squarelyTerminal 200 (rare, `excludes: ['digitalKiosk']`), chirperThread 0 (`tomorrow`), corkboardFlyers 5 (`tomorrow`), dailyGrindAd 10 (`tomorrow`), instaGlamStory 25 (`tomorrow`), secondColdBrewTap 70 (effect `{ kind: 'stationSpeed', station: 'coldBrewTap', mul: 2 }` stands in for a second tap in 1a; a real extra station is phase two), bulkBeanDeal 35, mysteryRoasterSample 20 (`gamble`, chance 0.5, win `[{ kind: 'price', mul: 1.15 }]`, lose `[{ kind: 'patience', mul: 0.9 }]`), streetSign 15 (`traffic` 1.05). Rarity: `laMazzoccaPro` and `squarelyTerminal` rare; `dualBoiler`, `autoSteamPitcher`, `instaGlamStory`, `bulkBeanDeal`, `mysteryRoasterSample` uncommon; the rest common. Display names as in the spec ("Dual-boiler espresso machine", "Street sign", "InstaGlam latte-art story", and so on).
- Scenario values: effects as the spec's section 9. `name`: "Normal week", "Campus town", "Rainy week", "Tourist season". `note`: "A normal week. Nothing special in the air.", "Campus town: students everywhere, and they want cold brew.", "Rainy week: everyone's grumpy and wants a latte.", "Tourist season: crowds, short tempers, big tips."

- [ ] **Step 1: Write the validity tests**

```ts
// src/data/catalogue.test.ts
import { CATALOGUE, catalogueById } from './catalogue';
import { SCENARIOS, scenarioById } from './scenarios';
it('has 16 unique ids and valid references', () => {
  expect(CATALOGUE).toHaveLength(16);
  expect(new Set(CATALOGUE.map(i => i.id)).size).toBe(16);
  for (const i of CATALOGUE) for (const r of [...(i.requires ?? []), ...(i.excludes ?? [])]) expect(catalogueById[r]).toBeDefined();
});
it('matches spec prices and durations', () => {
  expect(catalogueById.chirperThread.cost).toBe(0);
  expect(catalogueById.chirperThread.duration).toBe('tomorrow');
  expect(catalogueById.laMazzoccaPro.requires).toEqual(['dualBoiler']);
  expect(catalogueById.squarelyTerminal.excludes).toEqual(['digitalKiosk']);
  expect(catalogueById.streetSign).toMatchObject({ name: 'Street sign', cost: 15, effects: [{ kind: 'traffic', mul: 1.05 }] });
  expect(CATALOGUE.filter(i => i.cost < 30).length).toBeGreaterThanOrEqual(5);
});
it('has four scenarios with names and notes', () => {
  expect(SCENARIOS.map(s => s.id)).toEqual(['normal', 'campusTown', 'rainyWeek', 'touristSeason']);
  expect(scenarioById.rainyWeek.name).toBe('Rainy week');
  expect(SCENARIOS.every(s => s.note.length > 0)).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/data`
Expected: FAIL, cannot resolve `./catalogue`.

- [ ] **Step 3: Implement `catalogue.ts` and `scenarios.ts`; switch `createRun` to `SCENARIOS`**

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/data src/sim/run.ts && git commit -m "feat(data): 16-item starter catalogue and 4 scenarios"
```

---

### Task 4: Effects and modifiers

**Files:**
- Create: `src/sim/effects.ts`
- Test: `src/sim/effects.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Modifiers {
  stationSpeed: Record<StationKind, number>; moveSpeed: number; price: Record<DrinkId, number>;
  traffic: number; patience: number; tipRate: number; orderBias: Record<DrinkId, number>; supplyCost: Record<SupplyId, number>;
}
export function baseModifiers(): Modifiers;                          // every multiplier 1, tipRate 0
export function itemModifiers(effects: Effect[]): Modifiers;          // mul effects multiply, add effects add; price without drink applies to all drinks; gamble effects are ignored (resolved at purchase)
export function weekOf(day: number): number;                          // Math.ceil(day / 7)
export function computeModifiers(state: GameState): Modifiers;        // itemModifiers(scenario effects ∪ owned ∪ activeTomorrow), then traffic × (base + perStar × reputation), × pace.arrival[pace-1]; patience × pace.patience[pace-1]; then traffic × weekRamp.traffic^(weekOf(day)-1), patience × weekRamp.patience^(weekOf(day)-1)
export function rentForDay(state: GameState): number;                 // rentPerDay × weekRamp.rent^(weekOf(day) - 1), rounded to cents
export function resolveGamble(effect: Effect, state: GameState): Effect[]; // non-gamble -> [effect]; gamble -> rngNext(state) < chance ? win : lose
```

- [ ] **Step 1: Write the tests**

```ts
// src/sim/effects.test.ts
it('composes item effects', () => {
  const m = itemModifiers([
    { kind: 'stationSpeed', station: 'espresso', mul: 1.3 }, { kind: 'stationSpeed', station: 'espresso', mul: 1.55 },
    { kind: 'price', mul: 1.08 }, { kind: 'tipRate', add: 0.05 }, { kind: 'tipRate', add: 0.2 }, { kind: 'orderBias', drink: 'latte', mul: 2 },
  ]);
  expect(m.stationSpeed.espresso).toBeCloseTo(1.3 * 1.55);
  expect(m.price).toEqual({ espresso: 1.08, latte: 1.08, coldBrew: 1.08 });
  expect(m.tipRate).toBeCloseTo(0.25); expect(m.orderBias.latte).toBe(2); expect(m.orderBias.espresso).toBe(1);
});
it('applies reputation, pace, and week ramp', () => {
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
  s.scenario = 'normal';
  expect(computeModifiers(s).traffic).toBeCloseTo(0.7 + 0.12 * 2.5);   // 1.0 at 2.5 stars, pace 3
  s.settings.pace = 5;
  expect(computeModifiers(s).traffic).toBeCloseTo(1.65); expect(computeModifiers(s).patience).toBeCloseTo(0.7);
  s.day = 8; s.settings.pace = 3;
  expect(computeModifiers(s).traffic).toBeCloseTo(1.15); expect(computeModifiers(s).patience).toBeCloseTo(0.95);
  expect(rentForDay(s)).toBeCloseTo(31.25);
});
it('resolves gambles with the state rng', () => {
  const g: Effect = { kind: 'gamble', chance: 1, win: [{ kind: 'traffic', mul: 2 }], lose: [] };
  expect(resolveGamble(g, { rng: seedRng(1) } as GameState)).toEqual([{ kind: 'traffic', mul: 2 }]);
  expect(resolveGamble({ ...g, chance: 0 }, { rng: seedRng(1) } as GameState)).toEqual([]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/sim/effects.test.ts`
Expected: FAIL, cannot resolve `./effects`.

- [ ] **Step 3: Implement `effects.ts`**

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/sim/effects.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/sim/effects.ts src/sim/effects.test.ts && git commit -m "feat(sim): effect composition and run modifiers"
```

---

### Task 5: Night phase: dealing hands, buying, restocking, ready-up, timer

**Files:**
- Create: `src/sim/night.ts`
- Modify: `src/sim/run.ts` (`startNight` calls `dealHand`, so `createRun` starts with a hand)
- Test: `src/sim/night.test.ts`

**Interfaces:**
- Produces:

```ts
export function eligibleItems(state: GameState, pool: CatalogueItem[] = CATALOGUE): CatalogueItem[];  // not (permanent and owned); requires ⊆ owned ids; excludes ∩ owned ids = ∅
export function dealHand(state: GameState, pool: CatalogueItem[] = CATALOGUE): GameState;            // sets state.hand (ids)
export function applyNightInput(state: GameState, input: PlayerInput): GameState;                    // buy | restock | ready; other kinds ignored; no-op outside phase 'night'
export function stepNight(state: GameState): GameState;   // phaseTicksLeft--; then startDay when it reaches 0 or when every connected player is in ready
export function restockCost(state: GameState, supply: SupplyId, packs: number): number;              // packs × pack cost × modifiers.supplyCost[supply], rounded to cents
```

Dealing algorithm (the one piece the tests don't determine): candidates = `eligibleItems(state, pool)`; draw without replacement up to `handSize` times, each draw weighted by `rarityWeights[rarity]` using `rngNext`; if the drawn hand has no item with `cost < cheapThreshold` and an undrawn cheap candidate exists, replace the last drawn with a weighted draw among the undrawn cheap candidates. Buying: valid when `itemId` is in `hand`, not in `boughtTonight`, and `cash >= cost`; then `cash -= cost`, effects resolved through `resolveGamble` one by one, `permanent` → push to `owned`, `tomorrow` → push to `activeTomorrow`, remove from `hand`, push to `boughtTonight`. Restock: valid when `cash >= restockCost`; `supplies[supply] += packs × size`.

- [ ] **Step 1: Write the tests**

```ts
// src/sim/night.test.ts
const run = (seed = 1) => createRun({ seed, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }] });
it('deals five distinct eligible ids with a cheap option', () => {
  const s = run();
  expect(s.hand).toHaveLength(5); expect(new Set(s.hand).size).toBe(5);
  expect(s.hand.some(id => catalogueById[id].cost < 30)).toBe(true);
  expect(s.hand).not.toContain('laMazzoccaPro');   // requires dualBoiler
});
it('respects owned, requires, and excludes', () => {
  const s = run(); s.owned = [{ itemId: 'dualBoiler', effects: [] }, { itemId: 'digitalKiosk', effects: [] }];
  const ids = eligibleItems(s).map(i => i.id);
  expect(ids).not.toContain('dualBoiler'); expect(ids).toContain('laMazzoccaPro'); expect(ids).not.toContain('squarelyTerminal');
  expect(ids).toContain('chirperThread');          // tomorrow items are always eligible
});
it('deals fewer than five when the pool is thin, and zero when empty', () => {   // Review Focus 3
  const s = run(); s.owned = CATALOGUE.filter(i => i.duration === 'permanent').map(i => ({ itemId: i.id, effects: [] }));
  expect(dealHand(s).hand).toHaveLength(4);        // only the four 'tomorrow' ads remain
  expect(dealHand(s, []).hand).toEqual([]);
  expect(dealHand(s, [catalogueById.streetSign]).hand).toEqual([]);   // owned permanent: nothing eligible
});
it('buys from the hand against shared cash, once per night', () => {   // Review Focus 2
  const s = run(); s.hand = ['streetSign', 'dualBoiler']; s.cash = 100;
  let t = applyNightInput(s, { kind: 'buy', playerId: 'p2', itemId: 'streetSign' });
  expect(t.cash).toBe(85); expect(t.owned.map(o => o.itemId)).toEqual(['streetSign']); expect(t.hand).toEqual(['dualBoiler']); expect(t.boughtTonight).toEqual(['streetSign']);
  t = applyNightInput(t, { kind: 'buy', playerId: 'p1', itemId: 'dualBoiler' });   // 120 > 85
  expect(t.cash).toBe(85); expect(t.owned).toHaveLength(1);
  t = applyNightInput(t, { kind: 'buy', playerId: 'p1', itemId: 'streetSign' });   // no longer in hand
  expect(t.cash).toBe(85);
});
it('puts tomorrow items in activeTomorrow and resolves gambles', () => {
  const s = run(); s.hand = ['instaGlamStory', 'mysteryRoasterSample'];
  let t = applyNightInput(s, { kind: 'buy', playerId: 'p1', itemId: 'instaGlamStory' });
  expect(t.activeTomorrow.map(o => o.itemId)).toEqual(['instaGlamStory']); expect(t.owned).toHaveLength(0);
  t = applyNightInput(t, { kind: 'buy', playerId: 'p1', itemId: 'mysteryRoasterSample' });
  expect(t.owned[0].effects).toHaveLength(1); expect(t.owned[0].effects[0].kind).not.toBe('gamble');
});
it('restocks at pack prices with the supplyCost modifier', () => {
  const s = run(); s.cash = 100;
  let t = applyNightInput(s, { kind: 'restock', playerId: 'p1', supply: 'beans', packs: 2 });
  expect(t.supplies.beans).toBe(40); expect(t.cash).toBe(84);
  t.owned.push({ itemId: 'bulkBeanDeal', effects: [{ kind: 'supplyCost', supply: 'beans', mul: 0.6 }] });
  expect(restockCost(t, 'beans', 1)).toBeCloseTo(4.8);
  expect(applyNightInput(t, { kind: 'restock', playerId: 'p1', supply: 'milk', packs: 100 }).cash).toBe(84);   // unaffordable: no change
});
it('ends the night on the timer or when all connected players are ready', () => {
  let t = applyNightInput(run(), { kind: 'ready', playerId: 'p1' });
  expect(stepNight(t).phase).toBe('night');
  t = applyNightInput(t, { kind: 'ready', playerId: 'p2' });
  expect(stepNight(t).phase).toBe('day');
  const u = run(); u.phaseTicksLeft = 1;
  expect(stepNight(u).phase).toBe('day');
  let v = run(); v.players[1].connected = false; v = applyNightInput(v, { kind: 'ready', playerId: 'p1' });
  expect(stepNight(v).phase).toBe('day');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/sim/night.test.ts`
Expected: FAIL, cannot resolve `./night`.

- [ ] **Step 3: Implement `night.ts` and wire `dealHand` into `startNight`**

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: all pass (the Task 2 `createRun` tests still pass with a dealt hand).

- [ ] **Step 5: Commit**

```bash
git add src/sim && git commit -m "feat(sim): night phase - dealt hand, buying, restock, ready-up"
```

---

### Task 6: Barista movement and collision

**Files:**
- Create: `src/sim/movement.ts`
- Test: `src/sim/movement.test.ts`

**Interfaces:**
- Produces: `applyMovement(state: GameState, moveSpeedMul: number): GameState` — for each connected player, normalise `moveDir` (zero stays zero), advance `pos` by `moveSpeedTilesPerSecond × moveSpeedMul / TICK_RATE` along it, axis-separated: move x then test, move y then test; a test fails if the barista square (`pos ± baristaHalfWidth`) overlaps any station's unit square (`station.pos ± 0.5`) or leaves `[baristaHalfWidth, width − baristaHalfWidth]` × `[baristaHalfWidth, height − baristaHalfWidth]`; a failed axis reverts that axis only. Players do not collide with each other.
- Produces: `nearestStation(state: GameState, pos: Vec2): Station | null` — closest station by Euclidean distance between `pos` and `station.pos`; `null` if beyond `interactRangeTiles`; ties go to the lower index.

- [ ] **Step 1: Write the tests**

```ts
// src/sim/movement.test.ts
const base = () => { const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] }); s.players[0].pos = { x: 6, y: 4 }; return s; };
it('moves at 4 tiles per second along a normalised direction', () => {
  const s = base(); s.players[0].moveDir = { x: 1, y: 1 };
  const t = applyMovement(s, 1);
  expect(t.players[0].pos.x).toBeCloseTo(6 + 4 / 60 / Math.SQRT2); expect(t.players[0].pos.y).toBeCloseTo(4 + 4 / 60 / Math.SQRT2);
  expect(applyMovement(s, 1.15).players[0].pos.x).toBeCloseTo(6 + 4.6 / 60 / Math.SQRT2);
});
it('stops at walls and station tiles, per axis', () => {
  const s = base(); s.players[0].pos = { x: 0.36, y: 4 }; s.players[0].moveDir = { x: -1, y: 0 };
  expect(applyMovement(s, 1).players[0].pos.x).toBeCloseTo(0.36);
  const u = base(); u.players[0].pos = { x: 3, y: 1.86 }; u.players[0].moveDir = { x: 1, y: -1 };   // just below the espresso machine at (3,1)
  const v = applyMovement(u, 1);
  expect(v.players[0].pos.y).toBeCloseTo(1.86); expect(v.players[0].pos.x).toBeGreaterThan(3);
});
it('finds the nearest station within range only', () => {
  const s = base();
  expect(nearestStation(s, { x: 3, y: 2 })!.id).toBe('espresso');
  expect(nearestStation(s, { x: 6, y: 4 })).toBeNull();
  expect(nearestStation(s, { x: 6, y: 5.05 })!.id).toBe('counter');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/sim/movement.test.ts`
Expected: FAIL, cannot resolve `./movement`.

- [ ] **Step 3: Implement `movement.ts`**

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/sim/movement.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/sim/movement.ts src/sim/movement.test.ts && git commit -m "feat(sim): barista movement with wall and station collision"
```

---

### Task 7: Stations and interaction

**Files:**
- Create: `src/sim/stations.ts`
- Test: `src/sim/stations.test.ts`

**Interfaces:**
- Consumes: `nearestStation` (Task 6), `computeModifiers` (Task 4). The counter branch calls `serveDrink` from Task 8; until Task 8 exists the counter branch returns the state unchanged, and the counter test lives in Task 8.
- Produces:

```ts
export const STATION_RECIPES: Record<Exclude<StationKind, 'counter' | 'trash'>, { takes: ItemKind | null; gives: ItemKind; consumes: SupplyId | null }>;
// grinder: null -> grounds, consumes beans | espresso: grounds -> espresso, nothing | steamer: espresso -> latte, milk | coldBrewTap: null -> coldBrew, concentrate
export function stepStations(state: GameState): GameState;   // busyTicksLeft--; when it reaches 0, output = the recipe's gives
export function interact(state: GameState, playerId: PlayerId): GameState;
```

Interaction, for the station nearest the player (nothing happens if none in range), first matching rule wins:
1. `trash`: if holding anything, holding becomes null.
2. `counter`: if holding a drink, `serveDrink` (Task 8).
3. Recipe station with `output` set and player hands empty: player takes the output, station output becomes null.
4. Recipe station idle (`busyTicksLeft === 0` and `output === null`), player holding exactly `takes`, and (`consumes` is null or `supplies[consumes] >= 1`): consume 1 supply, holding becomes null, `busyTicksLeft = round(stationSeconds[kind] / modifiers.stationSpeed[kind] × TICK_RATE)`.
5. Otherwise nothing.

Task 9's `step` calls `interact` once per player whose `interactQueued` is true, in `players` array order, then clears every `interactQueued`.

- [ ] **Step 1: Write the tests**

```ts
// src/sim/stations.test.ts
const at = (s: GameState, pid: string, x: number, y: number) => { s.players.find(p => p.id === pid)!.pos = { x, y }; return s; };
const run2 = () => createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }] });
it('grinds beans into grounds over 2.5 s', () => {
  let s = at(run2(), 'p1', 1, 2);
  s = interact(s, 'p1');
  expect(s.supplies.beans).toBe(19); expect(s.stations[0].busyTicksLeft).toBe(150);
  for (let i = 0; i < 150; i++) s = stepStations(s);
  expect(s.stations[0].output).toBe('grounds');
  s = interact(s, 'p1');
  expect(s.players[0].holding).toBe('grounds'); expect(s.stations[0].output).toBeNull();
});
it('chains grounds -> espresso -> latte and consumes milk', () => {
  let s = at(run2(), 'p1', 3, 2); s.players[0].holding = 'grounds';
  s = interact(s, 'p1'); expect(s.stations[1].busyTicksLeft).toBe(300); expect(s.players[0].holding).toBeNull();
  s.stations[1].busyTicksLeft = 1; s = stepStations(s); expect(s.stations[1].output).toBe('espresso');
  s = interact(s, 'p1'); expect(s.players[0].holding).toBe('espresso');
  s = at(s, 'p1', 5, 2); s = interact(s, 'p1');
  expect(s.supplies.milk).toBe(9); expect(s.stations[2].busyTicksLeft).toBe(210);
});
it('refuses without supply, ignores wrong items, and trashes', () => {
  let s = at(run2(), 'p1', 8, 2); s.supplies.concentrate = 0;
  expect(interact(s, 'p1').stations[3].busyTicksLeft).toBe(0);
  s = at(run2(), 'p1', 3, 2); s.players[0].holding = 'latte';
  expect(interact(s, 'p1').stations[1].busyTicksLeft).toBe(0);
  s = at(s, 'p1', 10, 2); expect(interact(s, 'p1').players[0].holding).toBeNull();
});
it('applies stationSpeed modifiers', () => {
  const s = at(run2(), 'p1', 1, 2); s.owned.push({ itemId: 'flatBurrGrinder', effects: [{ kind: 'stationSpeed', station: 'grinder', mul: 1.4 }] });
  expect(interact(s, 'p1').stations[0].busyTicksLeft).toBe(Math.round(2.5 / 1.4 * 60));
});
it('gives a finished output to only one of two baristas interacting the same tick', () => {   // Review Focus 1
  let s = at(at(run2(), 'p1', 1, 2), 'p2', 1.9, 1.5); s.stations[0].output = 'grounds';   // both within 1.1 of the grinder
  s = interact(s, 'p1'); s = interact(s, 'p2');
  expect([s.players[0].holding, s.players[1].holding]).toEqual(['grounds', null]);
  expect(s.stations[0].output).toBeNull(); expect(s.supplies.beans).toBe(20);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/sim/stations.test.ts`
Expected: FAIL, cannot resolve `./stations`.

- [ ] **Step 3: Implement `stations.ts`**

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/sim/stations.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/sim/stations.ts src/sim/stations.test.ts && git commit -m "feat(sim): station recipes, timing, and interaction"
```

---

### Task 8: Customers: arrivals, patience, serving, tips

**Files:**
- Create: `src/sim/customers.ts`
- Modify: `src/sim/stations.ts` (counter branch calls `serveDrink`)
- Test: `src/sim/customers.test.ts`

**Interfaces:**
- Consumes: `computeModifiers` (Task 4), `rngNext` (Task 2), `interact` (Task 7).
- Produces:

```ts
export function availableDrinks(state: GameState): DrinkId[];   // drinks whose every supply in drinkSupplies has >= 1 unit, in DrinkId order
export function spawnCustomers(state: GameState): GameState;    // one Bernoulli trial per tick with p = baseArrivalsPerSecond × modifiers.traffic / TICK_RATE; no trial if availableDrinks is empty; on success, if customers.length >= queueCapacity then today.turnedAway++ else push a customer: drink by weighted draw over availableDrinks with weights modifiers.orderBias, patienceMax = round(patienceSeconds × modifiers.patience × TICK_RATE), patienceLeft = patienceMax, id = nextCustomerId++
export function stepCustomers(state: GameState): GameState;     // patienceLeft--; at <= 0 remove and today.lost++
export function serveDrink(state: GameState, playerId: PlayerId): GameState;
// player must hold a drink; target = customer with that drink and the lowest patienceLeft; none -> unchanged.
// price = prices[drink] × modifiers.price[drink]; tip = price × (maxTipRate × patienceLeft / patienceMax + modifiers.tipRate); both rounded to cents;
// cash += price + tip; today.sales += price; today.tips += tip; today.served++; remove customer; holding = null
```

- [ ] **Step 1: Write the tests**

```ts
// src/sim/customers.test.ts
const day = () => { const s = createRun({ seed: 3, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] }); s.scenario = 'normal'; return startDay(s); };
it('spawns about one customer per six seconds at normal pace', () => {
  let s = day(); let spawned = 0;
  for (let i = 0; i < 60 * 600; i++) { s = spawnCustomers(s); spawned += s.customers.length; s.customers = []; }
  expect(spawned).toBeGreaterThan(70); expect(spawned).toBeLessThan(130);   // 100 expected over 600 s; deterministic for seed 3
});
it('only orders drinks with supplies, and never past the queue cap', () => {
  let s = day(); s.supplies = { beans: 0, milk: 5, concentrate: 3 };
  expect(availableDrinks(s)).toEqual(['coldBrew']);
  s.customers = Array.from({ length: 6 }, (_, i) => ({ id: i, drink: 'coldBrew' as const, patienceLeft: 100, patienceMax: 100 }));
  for (let i = 0; i < 60 * 60; i++) s = spawnCustomers(s);
  expect(s.customers).toHaveLength(6); expect(s.today.turnedAway).toBeGreaterThan(0);
  s.supplies.concentrate = 0; s.customers = []; s.today.turnedAway = 0;
  for (let i = 0; i < 60 * 60; i++) s = spawnCustomers(s);
  expect(s.customers).toHaveLength(0); expect(s.today.turnedAway).toBe(0);
});
it('customers leave at zero patience and count as lost', () => {
  let s = day(); s.customers = [{ id: 1, drink: 'espresso', patienceLeft: 2, patienceMax: 1500 }];
  s = stepCustomers(s); expect(s.customers).toHaveLength(1);
  s = stepCustomers(s); expect(s.customers).toHaveLength(0); expect(s.today.lost).toBe(1);
});
it('serves the most impatient matching customer with a patience-scaled tip', () => {
  let s = day(); s.players[0].holding = 'latte'; s.players[0].pos = { x: 6, y: 5.1 };
  s.customers = [{ id: 1, drink: 'latte', patienceLeft: 1000, patienceMax: 1000 }, { id: 2, drink: 'latte', patienceLeft: 500, patienceMax: 1000 }, { id: 3, drink: 'espresso', patienceLeft: 10, patienceMax: 1000 }];
  s = interact(s, 'p1');
  expect(s.customers.map(c => c.id)).toEqual([1, 3]);
  expect(s.cash).toBeCloseTo(100 + 4.75 + 0.83, 2);   // tip = 4.75 × 0.35 × 0.5 = 0.83125 -> 0.83
  expect(s.today.served).toBe(1); expect(s.today.sales).toBe(4.75); expect(s.players[0].holding).toBeNull();
  s.players[0].holding = 'coldBrew'; s = interact(s, 'p1');
  expect(s.players[0].holding).toBe('coldBrew');   // nobody ordered it: nothing happens
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/sim/customers.test.ts`
Expected: FAIL, cannot resolve `./customers`.

- [ ] **Step 3: Implement `customers.ts` and wire the counter branch in `stations.ts`**

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: all pass. If the arrival-count test lands outside 70–130 for seed 3, change the seed in the `day()` helper rather than the bounds, and say so in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/sim && git commit -m "feat(sim): customers - arrivals, patience, serving, tips"
```

---

### Task 9: The step function: phases, closing, week end, join/leave, settings, morning notes

**Files:**
- Create: `src/sim/closing.ts`, `src/sim/describe.ts`, `src/sim/score.ts`, `src/sim/step.ts`
- Modify: `src/sim/run.ts` (`startDay` fills `morningNotes`)
- Test: `src/sim/step.test.ts`, `src/sim/describe.test.ts`

**Interfaces:**
- Produces:

```ts
// closing.ts
export function finishDay(state: GameState): GameState;
// remaining customers -> today.lost and cleared; every station busyTicksLeft = 0 and output = null; every player holding = null;
// today.rent = rentForDay(state); cash -= rent; ratio = served / (served + lost), or 1 if both are 0;
// reputation += ratio >= threshold ? +delta : -delta, clamped to [min, max] and rounded to 2 decimals;
// days.push(today); activeTomorrow = []; then:
//   cash < 0                                   -> phase 'ended', bankrupt = true
//   !unlimited && day === scoredWeekDays       -> phase 'weekEnd'
//   otherwise                                  -> day++, startNight
// describe.ts
export function describeEffects(effects: Effect[]): string;
// joined with ', ': traffic -> '+40% customers' / '-30% customers'; patience -> '+10% patience'; price (all) -> 'prices +8%'; price (drink) -> 'latte price +15%';
// stationSpeed -> 'espresso machine +30% faster' (station display names: grinder, espresso machine, steamer, cold brew tap); moveSpeed -> '+15% move speed';
// tipRate -> 'tips +5%'; orderBias -> 'latte orders ×2' (×1.5 keeps one decimal); supplyCost -> 'beans 40% cheaper'; gamble -> 'a gamble'
export function morningNotes(state: GameState): string[];
// day 1: [scenario.note]; then one line per activeTomorrow item: `${name} is live: ${describeEffects(item effects)}`; then one per permanent item in boughtTonight: `${name} installed`
// score.ts
export function scoreRun(state: GameState): number;                          // cash - startingCash, rounded to cents
export function summarizeRun(state: GameState, date: string): RunRecord;     // itemsBought = owned ids in purchase order; players = all player names; daysCompleted = days.length
// step.ts
export function step(state: GameState, inputs: PlayerInput[]): GameState;    // pure: clone once, mutate the clone, return it
```

`step` order: `tick++`; apply inputs in array order: `join` (unknown id: new player at `LAYOUT.door`, empty hands, `connected: true`; known id: `connected = true`), `leave` (`connected = false`, `holding = null`, `moveDir = {0,0}`, `interactQueued = false`), `settings` (host only; merge into `settings`; `pace` takes effect through `computeModifiers` immediately; day and night lengths apply from the next phase start), `move` (store `moveDir`; if `interact` then `interactQueued = true`), `buy` / `restock` / `ready` → `applyNightInput`, `weekEnd` (host only and phase `weekEnd`: `stop` → `ended`; `continue` → `unlimited = true`, `day++`, `startNight`). Then by phase: `night` → `stepNight`; `day` → `applyMovement(state, modifiers.moveSpeed)`, `interact` for each queued player in order then clear flags, `stepStations`, `spawnCustomers`, `stepCustomers`, `phaseTicksLeft--`, at 0 → `phase = 'closing'`, `phaseTicksLeft = secondsToTicks(closingGraceSeconds)`; `closing` → same as day without `spawnCustomers`, at 0 → `finishDay`; `weekEnd` and `ended` → nothing further.

- [ ] **Step 1: Write the describe tests**

```ts
// src/sim/describe.test.ts
it('describes effects in plain words', () => {
  expect(describeEffects([{ kind: 'traffic', mul: 1.4 }, { kind: 'orderBias', drink: 'latte', mul: 2 }])).toBe('+40% customers, latte orders ×2');
  expect(describeEffects([{ kind: 'patience', mul: 0.85 }, { kind: 'tipRate', add: 0.1 }, { kind: 'stationSpeed', station: 'espresso', mul: 1.3 }])).toBe('-15% patience, tips +10%, espresso machine +30% faster');
  expect(describeEffects([{ kind: 'supplyCost', supply: 'beans', mul: 0.6 }, { kind: 'gamble', chance: 0.5, win: [], lose: [] }])).toBe('beans 40% cheaper, a gamble');
});
it('writes the morning notes', () => {
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
  s.scenario = 'rainyWeek'; s.activeTomorrow = [{ itemId: 'instaGlamStory', effects: catalogueById.instaGlamStory.effects }]; s.boughtTonight = ['instaGlamStory', 'streetSign']; s.owned = [{ itemId: 'streetSign', effects: [] }];
  expect(morningNotes(s)).toEqual(["Rainy week: everyone's grumpy and wants a latte.", 'InstaGlam latte-art story is live: +40% customers, latte orders ×2', 'Street sign installed']);
  s.day = 2; expect(morningNotes(s)[0]).toContain('InstaGlam');
});
```

- [ ] **Step 2: Write the step tests**

```ts
// src/sim/step.test.ts
const opts = { seed: 11, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }] };
const ticks = (s: GameState, n: number, inputs: PlayerInput[] = []) => { for (let i = 0; i < n; i++) s = step(s, i === 0 ? inputs : []); return s; };
it('runs night -> day -> closing -> night with the right timers', () => {
  let s = createRun(opts);
  s = ticks(s, 60 * 60); expect(s.phase).toBe('day'); expect(s.day).toBe(1); expect(s.morningNotes[0]).toBe(scenarioById[s.scenario].note);
  s = ticks(s, 150 * 60); expect(s.phase).toBe('closing');
  s = ticks(s, 10 * 60); expect(s.phase).toBe('night'); expect(s.day).toBe(2); expect(s.days).toHaveLength(1); expect(s.days[0].rent).toBe(25); expect(s.hand).toHaveLength(5);
});
it('closing clears stations and hands, pays rent, moves reputation, and can bankrupt', () => {
  let s = createRun(opts); s = ticks(s, 60 * 60); s.players[0].holding = 'latte'; s.stations[1].output = 'espresso';
  s.today = { ...s.today, served: 7, lost: 3 }; s.cash = 30;
  s.phase = 'closing'; s.phaseTicksLeft = 1; s = step(s, []);
  expect(s.cash).toBe(5); expect(s.reputation).toBe(2.7); expect(s.players[0].holding).toBeNull(); expect(s.stations[1].output).toBeNull(); expect(s.phase).toBe('night');
  s.today = { ...s.today, served: 1, lost: 9 }; s.phase = 'closing'; s.phaseTicksLeft = 1; s = step(s, []);
  expect(s.reputation).toBe(2.5); expect(s.cash).toBe(-20); expect(s.phase).toBe('ended'); expect(s.bankrupt).toBe(true);
});
it('reaches weekEnd after day 7 and continues into unlimited mode', () => {
  let s = createRun(opts); s.cash = 10000;
  for (let d = 1; d <= 7; d++) { s = ticks(s, 60 * 60); s = ticks(s, 160 * 60); }
  expect(s.phase).toBe('weekEnd'); expect(s.days).toHaveLength(7); expect(scoreRun(s)).toBeCloseTo(s.cash - 100);
  expect(step(s, [{ kind: 'weekEnd', playerId: 'p2', choice: 'stop' }]).phase).toBe('weekEnd');   // not the host
  s = step(s, [{ kind: 'weekEnd', playerId: 'p1', choice: 'continue' }]);
  expect(s.phase).toBe('night'); expect(s.day).toBe(8); expect(s.unlimited).toBe(true);
  s = ticks(s, 60 * 60); s = ticks(s, 160 * 60); expect(s.days[7].rent).toBeCloseTo(31.25); expect(s.phase).toBe('night');
  expect(step(s, [{ kind: 'weekEnd', playerId: 'p1', choice: 'stop' }]).phase).toBe('night');     // ignored outside weekEnd
});
it('is deterministic and JSON-safe mid-run', () => {   // Review Focus 4
  const script = (s: GameState) => { s = ticks(s, 60 * 60); s = ticks(s, 30, [{ kind: 'move', playerId: 'p1', x: 1, y: 0, interact: false }]); return ticks(s, 100 * 60); };
  const a = script(createRun(opts)), b = script(createRun(opts));
  expect(a).toEqual(b);
  const c = JSON.parse(JSON.stringify(a)) as GameState;
  expect(step(c, [])).toEqual(step(a, []));
  expect(script(createRun({ ...opts, seed: 12 }))).not.toEqual(a);
});
it('handles join and leave mid-day', () => {   // Review Focus 4
  let s = createRun(opts); s = ticks(s, 60 * 60); s.players[1].holding = 'latte';
  s = step(s, [{ kind: 'leave', playerId: 'p2' }, { kind: 'join', playerId: 'p3', name: 'Jo' }]);
  expect(s.players[1].connected).toBe(false); expect(s.players[1].holding).toBeNull();
  expect(s.players[2]).toMatchObject({ id: 'p3', name: 'Jo', pos: LAYOUT.door, holding: null, connected: true });
  s = ticks(s, 10); expect(s.players).toHaveLength(3);
  s = step(s, [{ kind: 'join', playerId: 'p2', name: 'S' }]); expect(s.players[1].connected).toBe(true); expect(s.players).toHaveLength(3);
});
it('applies a pace change immediately to new customers only', () => {   // Review Focus 5
  let s = createRun(opts); s = ticks(s, 60 * 60);
  s.customers = [{ id: 1, drink: 'espresso', patienceLeft: 1500, patienceMax: 1500 }];
  s = step(s, [{ kind: 'settings', playerId: 'p1', settings: { pace: 5 } }]);
  expect(s.settings.pace).toBe(5); expect(s.customers[0].patienceMax).toBe(1500);
  expect(computeModifiers(s).patience).toBeCloseTo(0.7);
  expect(step(s, [{ kind: 'settings', playerId: 'p2', settings: { pace: 1 } }]).settings.pace).toBe(5);   // not the host
});
it('summarizes a run', () => {
  const s = createRun(opts); s.owned = [{ itemId: 'streetSign', effects: [] }]; s.days = [s.today]; s.cash = 140;
  expect(summarizeRun(s, '2026-10-28')).toEqual({ date: '2026-10-28', seed: 11, scenario: s.scenario, players: ['K', 'S'], daysCompleted: 1, score: 40, itemsBought: ['streetSign'] });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/sim/step.test.ts src/sim/describe.test.ts`
Expected: FAIL, cannot resolve `./step` and `./describe`.

- [ ] **Step 4: Implement `closing.ts`, `describe.ts`, `score.ts`, `step.ts`; fill `morningNotes` in `startDay`**

- [ ] **Step 5: Run all tests to verify pass**

Run: `npm test`
Expected: all pass. The full-week test should take well under a second; if it doesn't, `step` is cloning more than once per call.

- [ ] **Step 6: Commit**

```bash
git add src/sim && git commit -m "feat(sim): step function, closing economy, week end, morning notes, scoring"
```

---

### Task 10: Fixed-step loop, Web Worker, and the Transport interface

**Files:**
- Create: `src/host/loop.ts`, `src/host/simWorker.ts`, `src/net/transport.ts`, `src/net/localTransport.ts`, `src/net/sendGate.ts`
- Test: `src/host/loop.test.ts`, `src/net/sendGate.test.ts`

**Interfaces:**
- Produces (`src/net/transport.ts`):

```ts
export type ClientToHost = { t: 'start'; opts: CreateRunOptions } | { t: 'resume'; state: GameState } | { t: 'input'; input: PlayerInput };
export type HostToClient = { t: 'snapshot'; state: GameState; sentAt: number };
export interface Transport {
  start(opts: CreateRunOptions): void;
  resume(state: GameState): void;
  sendInput(input: PlayerInput): void;
  onSnapshot(handler: (snap: HostToClient) => void): () => void;   // returns unsubscribe
  close(): void;
}
```

- Produces (`src/host/loop.ts`):

```ts
export const SNAPSHOT_INTERVAL_MS = 50;   // 20 Hz
export const MAX_CATCHUP_TICKS = 10;
export interface Loop { advance(nowMs: number): void; pushInput(input: PlayerInput): void; getState(): GameState }
export function createLoop(initial: GameState, post: (msg: HostToClient) => void, startMs: number): Loop;
```
`advance(now)`: add `now − lastNow` to an accumulator; while the accumulator holds at least `1000 / TICK_RATE` ms and fewer than `MAX_CATCHUP_TICKS` ticks have run this call, `step` once with the inputs pushed since the previous step and subtract one tick's ms; if the cap was hit, discard whatever remains in the accumulator; post a snapshot (`sentAt = now`) when `now − lastSnapshot >= SNAPSHOT_INTERVAL_MS` or when `state.phase` changed during this call. `getState()` returns the live object; callers treat it as read-only except in tests.

- Produces (`src/host/simWorker.ts`): worker entry; on `start` or `resume` it creates the loop and a `setInterval` at `1000 / TICK_RATE` calling `advance(performance.now())`; on `input` it calls `pushInput`. Posts with `self.postMessage`.
- Produces (`src/net/localTransport.ts`): `createLocalTransport(): Transport` built on `new Worker(new URL('../host/simWorker.ts', import.meta.url), { type: 'module' })`.
- Produces (`src/net/sendGate.ts`): `createSendGate(minIntervalMs: number, now: () => number): { allow(): boolean }` — returns true and records the time when at least `minIntervalMs` has passed since the last allowed call. Task 13 uses it with 50 ms.

- [ ] **Step 1: Write the loop tests**

```ts
// src/host/loop.test.ts
const initial = () => createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
it('steps at 60 Hz from elapsed time and snapshots at 20 Hz', () => {
  const posts: HostToClient[] = []; const loop = createLoop(initial(), m => posts.push(m), 0);
  loop.advance(100); expect(loop.getState().tick).toBe(6); expect(posts).toHaveLength(1); expect(posts[0].sentAt).toBe(100);
  loop.advance(149); expect(loop.getState().tick).toBe(8); expect(posts).toHaveLength(1);
  loop.advance(150); expect(loop.getState().tick).toBe(9); expect(posts).toHaveLength(2);
});
it('caps catch-up after a long stall', () => {
  const loop = createLoop(initial(), () => {}, 0);
  loop.advance(5000); expect(loop.getState().tick).toBe(10);
  loop.advance(5017); expect(loop.getState().tick).toBe(11);
});
it('applies pushed inputs on the next step and snapshots on phase change', () => {
  const posts: HostToClient[] = []; const loop = createLoop(initial(), m => posts.push(m), 0);
  loop.pushInput({ kind: 'move', playerId: 'p1', x: 1, y: 0, interact: false });
  loop.advance(17); expect(loop.getState().players[0].moveDir).toEqual({ x: 1, y: 0 });
  loop.getState().phaseTicksLeft = 1;   // force the night to end on the next tick
  const before = posts.length; loop.advance(34);
  expect(loop.getState().phase).toBe('day'); expect(posts.length).toBe(before + 1);
});
```

- [ ] **Step 2: Write the send-gate test**

```ts
// src/net/sendGate.test.ts
it('allows at most one send per interval', () => {
  let t = 0; const gate = createSendGate(50, () => t);
  expect(gate.allow()).toBe(true); expect(gate.allow()).toBe(false);
  t = 49; expect(gate.allow()).toBe(false); t = 50; expect(gate.allow()).toBe(true);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/host src/net`
Expected: FAIL, cannot resolve `./loop` and `./sendGate`.

- [ ] **Step 4: Implement all five files**

- [ ] **Step 5: Run tests and build to verify pass**

Run: `npm test && npm run build`
Expected: tests pass; the build emits a separate worker chunk under `dist/assets/`.

- [ ] **Step 6: Commit**

```bash
git add src/host src/net && git commit -m "feat(host): fixed-step loop in a Web Worker behind a Transport interface"
```

---

### Task 11: Browser storage: snapshot, history, settings

**Files:**
- Create: `src/storage/storageLike.ts`, `src/storage/snapshotStore.ts`, `src/storage/historyStore.ts`, `src/storage/settingsStore.ts`
- Test: `src/storage/stores.test.ts`

**Interfaces:**
- Produces:

```ts
// storageLike.ts
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export function memoryStorage(): StorageLike;
// snapshotStore.ts   key 'cafetycoon.run'
export function createSnapshotStore(storage: StorageLike): { save(state: GameState): void; load(): GameState | null; clear(): void };   // load returns null when missing or unparsable
// historyStore.ts    key 'cafetycoon.history', newest first, at most 50
export function createHistoryStore(storage: StorageLike): { append(record: RunRecord): void; list(): RunRecord[] };
// settingsStore.ts   key 'cafetycoon.settings'
export interface LocalSettings { playerName: string; playerToken: string; pace: Pace; dayLengthSec: number; nightLengthSec: number }
export function createSettingsStore(storage: StorageLike, randomToken: () => string): { get(): LocalSettings; set(patch: Partial<LocalSettings>): LocalSettings };
// defaults: playerName 'Barista', playerToken = randomToken() generated once and persisted, pace 3, dayLengthSec 150, nightLengthSec 60
```

- [ ] **Step 1: Write the tests**

```ts
// src/storage/stores.test.ts
it('round-trips a snapshot and survives garbage', () => {
  const st = memoryStorage(); const store = createSnapshotStore(st);
  const s = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
  store.save(s); expect(store.load()).toEqual(s);
  st.setItem('cafetycoon.run', '{not json'); expect(store.load()).toBeNull();
  store.clear(); expect(store.load()).toBeNull();
});
it('keeps history newest first, capped at 50', () => {
  const h = createHistoryStore(memoryStorage());
  for (let i = 0; i < 55; i++) h.append({ date: `d${i}`, seed: i, scenario: 'normal', players: ['K'], daysCompleted: 7, score: i, itemsBought: [] });
  expect(h.list()).toHaveLength(50); expect(h.list()[0].seed).toBe(54); expect(h.list()[49].seed).toBe(5);
});
it('generates a token once and merges settings', () => {
  const st = memoryStorage(); let n = 0; const s = createSettingsStore(st, () => `tok${++n}`);
  expect(s.get()).toEqual({ playerName: 'Barista', playerToken: 'tok1', pace: 3, dayLengthSec: 150, nightLengthSec: 60 });
  expect(createSettingsStore(st, () => 'other').get().playerToken).toBe('tok1');
  expect(s.set({ playerName: 'Ken' }).playerName).toBe('Ken'); expect(s.get().pace).toBe(3);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/storage`
Expected: FAIL, cannot resolve the store modules.

- [ ] **Step 3: Implement the four files**

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/storage`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/storage && git commit -m "feat(storage): snapshot, run history, and local settings stores"
```

---

### Task 12: Renderer: interpolation, keyboard, PixiJS scene

**Files:**
- Create: `src/render/interpolate.ts`, `src/render/keys.ts`, `src/render/keyboard.ts`, `src/render/scene.ts`, `src/render/app.ts`
- Test: `src/render/interpolate.test.ts`, `src/render/keys.test.ts`

**Interfaces:**
- Produces:

```ts
// interpolate.ts
export interface RenderView { state: GameState; baristaPositions: Record<PlayerId, Vec2> }
export function interpolateView(prev: GameState | null, next: GameState, alpha: number): RenderView;
// positions lerp prev -> next per player id (a player missing from prev snaps to next); alpha clamped to [0, 1]; everything else is read from next
// keys.ts
export const MOVE_KEYS: Record<string, Vec2>;   // KeyW/ArrowUp (0,-1), KeyS/ArrowDown (0,1), KeyA/ArrowLeft (-1,0), KeyD/ArrowRight (1,0)
export const INTERACT_KEYS: string[];           // ['KeyE', 'Space']
export function keysToVector(pressed: Iterable<string>): Vec2;   // sum of MOVE_KEYS for pressed codes, each component clamped to [-1, 1]
// keyboard.ts
export function createKeyboard(target: EventTarget): { read(): Vec2; takeInteract(): boolean; dispose(): void };
// tracks keydown/keyup by event.code; takeInteract returns true once per interact keydown (ignores auto-repeat); ignores events while document.activeElement is an input, textarea, or select
// app.ts
export function createRenderer(mount: HTMLElement): Promise<{ update(view: RenderView): void; destroy(): void }>;
```
Scene drawing (shapes only; `TILE = 64` px; canvas `LAYOUT.width × TILE` by `LAYOUT.height × TILE`, scaled to fit the mount): floor as a filled rectangle; each station as a rounded rectangle in a fixed colour per kind with its display name as `Text` beneath, a progress bar while `busyTicksLeft > 0` (fill `1 − busyTicksLeft / totalTicks`, where `totalTicks` is recomputed from `ECONOMY.stationSeconds` and `computeModifiers`), and a small coloured circle when `output` is set; each barista as a circle in one of four fixed colours by player index, name `Text` above, a small circle for the held item, dimmed when `connected` is false; customers in `LAYOUT.queueSlots` order as squares with a patience bar above (`patienceLeft / patienceMax`, green to red) and a drink-coloured circle. Item colours: grounds brown, espresso dark brown, latte cream, coldBrew navy.

- [ ] **Step 1: Write the pure tests**

```ts
// src/render/interpolate.test.ts
it('lerps barista positions and snaps new players', () => {
  const a = createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] });
  const b = JSON.parse(JSON.stringify(a)) as GameState; b.players[0].pos = { x: 7, y: 4 }; b.players.push({ ...b.players[0], id: 'p2', pos: { x: 1, y: 6 } });
  const v = interpolateView(a, b, 0.5);
  expect(v.baristaPositions.p1).toEqual({ x: 6.5, y: 4 }); expect(v.baristaPositions.p2).toEqual({ x: 1, y: 6 });
  expect(interpolateView(null, b, 0.3).baristaPositions.p1).toEqual({ x: 7, y: 4 });
  expect(interpolateView(a, b, 2).baristaPositions.p1).toEqual({ x: 7, y: 4 });
  expect(v.state).toBe(b);
});
// src/render/keys.test.ts
it('maps keys to a clamped vector', () => {
  expect(keysToVector(['KeyW', 'KeyD'])).toEqual({ x: 1, y: -1 });
  expect(keysToVector(['ArrowLeft', 'KeyA'])).toEqual({ x: -1, y: 0 });
  expect(keysToVector([])).toEqual({ x: 0, y: 0 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/render`
Expected: FAIL, cannot resolve `./interpolate` and `./keys`.

- [ ] **Step 3: Implement all five files**

- [ ] **Step 4: Run tests and build to verify pass**

Run: `npm test && npm run build`
Expected: tests pass; the build succeeds with `pixi.js` in the main chunk.

- [ ] **Step 5: Visual check in the dev server**

Temporarily make `src/main.ts` create a renderer and call `update(interpolateView(null, createRun({ seed: 1, hostId: 'p1', players: [{ id: 'p1', name: 'K' }] }), 0))`; run `npm run dev` and open the page. Expected: floor, six labelled stations at the layout positions, one named barista at `(6,4)`. Revert `main.ts` to the scaffold line before committing; Task 13 wires it for real.

- [ ] **Step 6: Commit**

```bash
git add src/render && git commit -m "feat(render): PixiJS café scene, snapshot interpolation, keyboard input"
```

---

### Task 13: HTML overlays, view models, and wiring in `main.ts`

**Files:**
- Create: `src/ui/viewModels.ts`, `src/ui/dom.ts`, `src/ui/title.ts`, `src/ui/hud.ts`, `src/ui/night.ts`, `src/ui/closing.ts`, `src/ui/weekEnd.ts`, `src/ui/pause.ts`, `src/style.css`
- Modify: `src/main.ts`, `index.html` (only if the overlay containers need inner markup)
- Test: `src/ui/viewModels.test.ts`

**Interfaces:**
- Consumes: `Transport` and `createLocalTransport` (Task 10), the stores (Task 11), `createRenderer`, `createKeyboard`, `interpolateView` (Task 12), `computeModifiers`, `restockCost`, `scoreRun`, `summarizeRun`, `describeEffects`, `catalogueById`, `scenarioById`, `ECONOMY`.
- Produces (`viewModels.ts`, all pure):

```ts
export function money(n: number): string;   // '$1,234.50', '-$20.00'
export interface HudVM { dayLabel: string; clock: string; cash: string; reputation: string; supplies: { id: SupplyId; count: number }[]; menu: { id: DrinkId; price: string; available: boolean }[]; notes: string[]; phase: Phase; seed: number }
export function hudViewModel(state: GameState): HudVM;   // dayLabel 'Day 3', or 'Day 9 (week 2)' from day 8 on; clock 'm:ss' from phaseTicksLeft; cash money(cash); reputation '2.7★'; price = money(prices × modifiers.price)
export interface HandCardVM { itemId: string; name: string; cost: string; effect: string; flavor: string; affordable: boolean; duration: 'permanent' | 'tomorrow' }
export interface NightVM { clock: string; cash: string; takings: { sales: string; tips: string; rent: string; profit: string } | null; hand: HandCardVM[]; restock: { supply: SupplyId; count: number; packSize: number; packCost: string; affordable: boolean }[]; ready: { id: PlayerId; name: string; ready: boolean }[]; meReady: boolean }
export function nightViewModel(state: GameState, me: PlayerId): NightVM;   // takings from the last entry of days when days.length > 0 and days.length === day - 1, else null (so the first night shows none)
export interface ClosingVM { dayLabel: string; served: number; lost: number; turnedAway: number; sales: string; tips: string; rent: string; profit: string; reputationBefore: string; reputationAfter: string }
export function closingViewModel(stateBefore: GameState, stateAfter: GameState): ClosingVM;   // before = last 'closing' snapshot, after = first snapshot of the next phase; profit = sales + tips - rent
export interface WeekEndVM { score: string; daysCompleted: number; customersServed: number; bestDay: { day: number; profit: string } | null; itemsBought: string[]; seed: number; isHost: boolean; bankrupt: boolean }
export function weekEndViewModel(state: GameState, me: PlayerId): WeekEndVM;   // itemsBought as display names
export interface TitleVM { history: { date: string; score: string; days: number; scenario: string; players: string }[]; canResume: boolean }
export function titleViewModel(history: RunRecord[], snapshot: GameState | null): TitleVM;   // scenario is the display name; players joined with ', '; canResume when the snapshot exists and its phase is not 'ended'
```

Overlay behaviour (each DOM module takes its container element and callbacks, and exposes `render(vm)`):
- `title.ts`: name field (settings store), seed field (blank means random: `Math.floor(Math.random() * 2 ** 31)` chosen in `main.ts`, the only `Math.random` in the client), pace and day-length selects, "Start solo run", "Resume run" (shown only when `canResume`), history table.
- `hud.ts`: top bar from `HudVM`; morning notes shown as a toast for 6 s when the phase becomes `day`; the seed in small print.
- `night.ts`: `NightVM` as a card grid; clicking a card sends `buy`; each restock button sends `restock` with `packs: 1`; "Ready" sends `ready`; the clock counts down from snapshots.
- `closing.ts`: `ClosingVM` with a "Continue" button that hides it; it also hides itself when the phase changes again.
- `weekEnd.ts`: `WeekEndVM`; the host sees "Keep going" and "See score & stop", a non-host sees "Waiting for the host" (phase 1b uses this). On `stop`, or when `phase === 'ended'`, `main.ts` appends `summarizeRun(state, new Date().toISOString().slice(0, 10))` to history, clears the snapshot, and returns to the title. When `bankrupt` the copy reads "The café couldn't make rent."
- `pause.ts`: Esc toggles it; shows pace and day-length controls (sends `settings`) and "Quit to title" (the snapshot stays, so the run can be resumed).

`main.ts` wiring: on start or resume, create the local transport, subscribe to snapshots, keep `prev` and `next` snapshots with their arrival times; a `requestAnimationFrame` loop computes `alpha = (now − nextArrivedAt) / SNAPSHOT_INTERVAL_MS` and calls `renderer.update(interpolateView(prev, next, alpha))`; every frame read the keyboard and send a `move` input when the vector changed or an interact is pending, through `createSendGate(50)` (a pending interact that the gate holds back is sent on the next allowed frame, never dropped); on every snapshot route to the overlay for its phase, and save the snapshot to the store on every phase change and at most every 10 s during `day`.

- [ ] **Step 1: Write the view-model tests**

```ts
// src/ui/viewModels.test.ts
const run = () => createRun({ seed: 5, hostId: 'p1', players: [{ id: 'p1', name: 'K' }, { id: 'p2', name: 'S' }] });
it('formats money and the hud', () => {
  expect(money(1234.5)).toBe('$1,234.50'); expect(money(-20)).toBe('-$20.00');
  const s = run(); s.phaseTicksLeft = 61 * 60; s.cash = 84.5; s.reputation = 2.7; s.supplies.milk = 0;
  const h = hudViewModel(s);
  expect(h.dayLabel).toBe('Day 1'); expect(h.clock).toBe('1:01'); expect(h.cash).toBe('$84.50'); expect(h.reputation).toBe('2.7★'); expect(h.seed).toBe(5);
  expect(h.menu.find(m => m.id === 'latte')!.available).toBe(false);
  s.day = 9; expect(hudViewModel(s).dayLabel).toBe('Day 9 (week 2)');
});
it('builds the night screen', () => {
  const s = run(); s.cash = 50; s.hand = ['dualBoiler', 'streetSign']; s.ready = ['p2'];
  const n = nightViewModel(s, 'p1');
  expect(n.takings).toBeNull(); expect(n.hand.map(c => c.affordable)).toEqual([false, true]);
  expect(n.hand[1]).toMatchObject({ name: 'Street sign', cost: '$15.00', effect: '+5% customers', duration: 'permanent' });
  expect(n.ready).toEqual([{ id: 'p1', name: 'K', ready: false }, { id: 'p2', name: 'S', ready: true }]); expect(n.meReady).toBe(false);
  expect(n.restock[0]).toMatchObject({ supply: 'beans', count: 20, packSize: 10, packCost: '$8.00', affordable: true });
  s.day = 2; s.days = [{ day: 1, served: 7, lost: 3, turnedAway: 0, sales: 30, tips: 5, rent: 25 }];
  expect(nightViewModel(s, 'p1').takings).toEqual({ sales: '$30.00', tips: '$5.00', rent: '$25.00', profit: '$10.00' });
});
it('builds closing and week-end screens', () => {
  const before = run(); before.today = { day: 1, served: 7, lost: 3, turnedAway: 1, sales: 30, tips: 5, rent: 0 }; before.reputation = 2.5;
  const after = run(); after.days = [{ ...before.today, rent: 25 }]; after.reputation = 2.7;
  expect(closingViewModel(before, after)).toEqual({ dayLabel: 'Day 1', served: 7, lost: 3, turnedAway: 1, sales: '$30.00', tips: '$5.00', rent: '$25.00', profit: '$10.00', reputationBefore: '2.5★', reputationAfter: '2.7★' });
  after.cash = 160; after.days.push({ day: 2, served: 9, lost: 1, turnedAway: 0, sales: 40, tips: 8, rent: 25 }); after.owned = [{ itemId: 'streetSign', effects: [] }];
  const w = weekEndViewModel(after, 'p2');
  expect(w).toEqual({ score: '$60.00', daysCompleted: 2, customersServed: 16, bestDay: { day: 2, profit: '$23.00' }, itemsBought: ['Street sign'], seed: 5, isHost: false, bankrupt: false });
});
it('builds the title screen', () => {
  const rec: RunRecord = { date: '2026-10-28', seed: 1, scenario: 'rainyWeek', players: ['K', 'S'], daysCompleted: 7, score: 412.25, itemsBought: [] };
  const t = titleViewModel([rec], null);
  expect(t.canResume).toBe(false); expect(t.history[0]).toEqual({ date: '2026-10-28', score: '$412.25', days: 7, scenario: 'Rainy week', players: 'K, S' });
  expect(titleViewModel([], run()).canResume).toBe(true);
  const ended = run(); ended.phase = 'ended'; expect(titleViewModel([], ended).canResume).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui`
Expected: FAIL, cannot resolve `./viewModels`.

- [ ] **Step 3: Implement `viewModels.ts`**

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/ui`
Expected: 4 passed.

- [ ] **Step 5: Implement the DOM modules, `style.css`, and `main.ts`**

Keep each overlay module under about 120 lines; build `innerHTML` from the view model and attach `addEventListener` for buttons. `style.css`: dark background, overlays as centred panels, hand cards as a flex row, a monospace clock.

- [ ] **Step 6: Run tests and build, then play one day in the dev server**

Run: `npm test && npm run build && npm run dev`
Expected: title → start → night screen with five cards and a countdown → Ready → day with the HUD clock running, WASD moves the barista, E at the grinder starts it, customers appear with patience bars, serving at the counter adds cash → closing summary → night 2 with takings shown. No console errors.

- [ ] **Step 7: Commit**

```bash
git add src index.html && git commit -m "feat(ui): title, hud, night, closing, week-end, pause overlays wired to the worker transport"
```

---

### Task 14: Playtest checklist, tuning pass, README, merge to main

**Files:**
- Create: `docs/playtest-checklist.md`
- Modify: `README.md`, `src/data/economy.ts` (tuning only), any test whose expected value was a tuning number

- [ ] **Step 1: Write `docs/playtest-checklist.md`**

A checklist to run on the deployed site in one browser, one checkbox per line: start a run with seed `1234`; the scenario note appears on day 1; buy a card and see it in the next morning note; run out of a supply and watch the drink leave the menu; let a customer storm out and see `lost` on the closing summary; refresh mid-day and resume from the title; Esc changes pace mid-day; reach day 7, see the score, keep going into week 2 and see higher rent; stop and find the run in history; start a new run and get a different hand.

- [ ] **Step 2: Play a full seven-day solo run on `npm run dev` and tune**

The gate from the spec: a seven-day run is fun and finishable solo at pace 3 without ever being trivially rich. Adjust `ECONOMY` numbers only (arrival rate, patience, prices, rent, pack costs). Re-run `npm test` after each change; fix any test whose expected value was a tuning number rather than a rule, and say which in the commit message.

- [ ] **Step 3: Update the README**

Replace "Working on it" with: how to play (controls, the loop in three sentences), how to develop (Node 24, `npm install`, `npm run dev`, `npm test`), how it deploys (push to `main` → Actions → Pages), and a one-line pointer to the design doc and this plan.

- [ ] **Step 4: Commit and push the branch**

```bash
git add -A && git commit -m "docs: playtest checklist, README for players and developers; tuning pass"
git push
```

- [ ] **Step 5: Merge to main and watch the deploy**

```bash
git checkout main && git merge --no-ff phase-1a -m "Phase 1a: solo-playable café" && git push
gh run watch --exit-status
```

Expected: both jobs green; the deploy job publishes.

- [ ] **Step 6: Run the playtest checklist on the live site**

Open `https://snowmexican7.github.io/CafeTycoon/` and work through `docs/playtest-checklist.md`. Expected: every box ticked; no console errors. Tick the boxes in the file and commit it.
