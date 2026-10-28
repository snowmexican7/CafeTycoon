# Kitchen mechanics as of main `225f2eb` (2026-10-28)

A read-only map of how the day simulation works, made before the Phase 2 gameplay work
started. Paths are relative to `src/`. Phase 2 changes several of these rules; the design
doc that changes them is `superpowers/specs/2026-10-28-phase-2-busy-season-design.md`.

## 1. Holding
- `Player.holding: ItemKind | null` (sim/types.ts). `ItemKind = 'grounds' | DrinkId`,
  `DrinkId = 'espresso' | 'latte' | 'coldBrew'`. One item at a time.
- Set only by picking up a station's `output` while holding nothing (sim/stations.ts).
- Cleared by inserting into a station, pressing E at the trash, serving at the counter,
  the `leave` input, and at the end of the day (`finishDay`).
- There is no way to put a drink down other than serving or trashing it.
- The `trash` station is an instant, unconditional `holding = null`.

## 2. Stations
- `GameState.stations: Station[]` is built once from `LAYOUT` in `createRun`. The sim
  reads only `state.stations`; the renderer builds static art from `LAYOUT.stations` once
  and draws per-frame overlays (progress, output ring, focus) from `state.stations`.
- `StationKind = 'grinder' | 'espresso' | 'steamer' | 'coldBrewTap' | 'counter' | 'trash'`.
  Several renderer maps are `Record<StationKind, …>` (theme.ts labels and progress-bar
  rise; describe.ts names; effects.ts base speeds), so a new kind touches them all.
- `Station = { id, kind, pos, busyTicksLeft, output: ItemKind | null }`.
- Recipes (`STATION_RECIPES`): grinder → grounds (beans, 2.5 s); espresso: grounds →
  espresso (5 s); steamer: espresso → latte (milk, 3.5 s); coldBrewTap → coldBrew
  (concentrate, 1.5 s). Seconds come from `ECONOMY.stationSeconds` divided by the
  `stationSpeed` modifier, at 60 ticks per second.
- A finished `output` sits in the station and blocks it until picked up. One output slot
  per station. Supplies are consumed when the input goes in. Outputs are wiped at day end.
- Layout 12×8 tiles: grinder (1,1), espresso (3,1), steamer (5,1), coldBrewTap (8,1),
  trash (10,1), counter (6,6). Each station blocks a unit square centred on its `pos`.
  Interact range is 1.1 tiles. Barista half-width is 0.35.

## 3. Interact
- Keys: `KeyE` and `Space` interact; WASD and arrows move (render/keys.ts). Keys are
  ignored while a form control has focus.
- `main.ts` sends `{ kind: 'move', playerId, x, y, interact }` when the movement vector
  changes or an interact is pending. The sim sets `interactQueued`, and `stepDay` runs
  `interact(state, playerId)` after movement for each queued player.
- `PlayerInput` kinds: move, buy, restock, ready, weekEnd, settings, join, leave. Nothing
  carries a station or drink choice.
- `interact` picks the nearest station within range. trash: clear hand. counter: serve.
  Recipe stations: pick up the output if hands are empty; else start the recipe if the
  station is idle, the held item matches `takes`, and the supply is in stock; else nothing.

## 4. Customers
- `Customer = { id, drink, patienceLeft, patienceMax }`, no position.
- Orders are drawn from drinks whose supplies are in stock, weighted by the `orderBias`
  modifier (base 1, scenario and card effects multiply). No stock means no spawns.
- Patience is 25 s × pace multiplier × week ramp × card/scenario effects.
- Serving: the matching customer with the least patience left is served. No match is a
  silent no-op and the player keeps the drink. Price × price modifier, tip = price ×
  (0.35 × patience fraction + tip modifier). Expired customers count as `lost`.
- Reputation moves ±0.2 at day end on served/(served+lost) ≥ 0.7, clamped to [0.5, 5].

## 5. Catalogue and effects
- Effect kinds: stationSpeed, moveSpeed, price, traffic, patience, tipRate, orderBias,
  supplyCost, gamble. None adds a station, capacity, or changes the menu.
- 16 items from $0 to $320; `secondColdBrewTap` only doubles the tap's speed.
- Scenarios only add effects (campusTown traffic and cold brew; rainyWeek patience and
  latte; touristSeason traffic, patience, tips).

## 6. Night inputs
- `settings` (host only, any phase): pace 1–5, day and night length 30–600 s.
- buy, restock (1–100 packs of 10), ready. The night ends when all connected players are
  ready or the timer runs out.
- No menu toggle exists; the menu is whatever supplies allow.

## 7. Rendering of state
- The held item is drawn on the barista (render/layers/actors.ts) and a station's single
  output next to the station (render/layers/stations.ts), both through `drawItem`.
- Customers are drawn at `LAYOUT.queueSlots` by array index; the sim has no positions.
- Nothing exists for items sitting on a counter.

## 8. Day loop
- `stepDay`: modifiers → movement → queued interacts → stations → spawns (doors open) →
  customers → phase timer. Day → closing (10 s grace) → `finishDay`.
- Arrivals: one Bernoulli trial per tick, p = (1/6 per second × traffic) / 60; queue
  capacity 6, overflow counts as `turnedAway`.
- `DayStats = { day, served, lost, turnedAway, sales, tips, rent }`. Not tracked: per-drink
  counts, wrong-drink attempts, station usage, trash use.
