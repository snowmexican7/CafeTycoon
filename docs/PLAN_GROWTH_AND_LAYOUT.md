# Plan: cart, then stand, then café, and a layout you can actually move

Status: **draft for Kennedy to review (2026-11-09). Not approved to build.**

Two changes. They share a file because the long game (`docs/PLAN_CAMPAIGN_AND_BLITZ.md`) needs both: the sizes in real-life order, and a floor where tables and supply boxes can sit anywhere the later furniture needs.

Standing rules: human play only. No new bot logic. The robot cashier keeps using the till; it does not rearrange. Co-op has no bots. No save-compatibility work. A snapshot bump refuses old saves, as it does today (`SNAPSHOT_VERSION` 35).

## For the player

You start with a coffee cart. It is the small one: wheels, a short line, no fridge until you buy the little cube. When you can afford it, you move up to a stand, a fixed stall with more floor, a queue, and a fridge that comes with the keys. The café is still the shop with the door and the window, last.

At night, Layout lets you pick up anything that is not the door or the line, and set it down where you like. Machines, the milk shelf, the syrups, the box of cream and sugar, and later the tables. Spots are loose. You are not sliding tokens along a back-bar grid.

## How this sits on the code

### The order today

`TIER_IDS` in `src/sim/growth.ts` is `['stand', 'cart', 'cafe']`. New runs pass `tier: 'stand'` from `src/main.ts`. The footprints and the numbers:

| | Kerbside stand (start) | Coffee cart ($70) | The café ($150) |
|---|---|---|---|
| Floor | 8 tiles (`TIER_LAYOUTS.stand`) | 10 tiles | 12 tiles (`LAYOUT.width`) |
| Queue | 3 | 5 | 6 (`ECONOMY.queueCapacity`) |
| Rent | $10 | $17 | $25 |
| Prices / traffic | ×0.8 / ×0.65 | ×0.9 / ×0.85 | ×1 / ×1 |
| Waiting browsers | 0 | 2 | 4 (`ECONOMY.line.waiting`) |
| Fridge | none; Dorm Room Cube is $20 | Garage Beer Fridge, free | Chrome Reach-In, free; Udder-Matic $320 |
| Look | sidewalk (`buildStand`) | park plaza (`buildCart`) | the indoor café |
| Office runs | no | yes, 4–6 drinks | yes, 4–6 drinks |

Those numbers live in `TIERS`, `TIER_LAYOUTS` (`src/data/layout.ts`), `TIER_FRIDGE` (`src/data/fridges.ts`), `ORDERS.office.size`, and `src/render/tierLook.ts`. The drip machine's default seat is (1, 5) on the stand and (9, 5) on the cart (Kennedy, 2026-11-03). `growDiff` already describes what the next size adds, and the receipt already sends `{ kind: 'grow', tier }`.

The footprints are in the right physical order. The names are backwards. The thing you start with is called a stand, and the middle size is called a cart.

### What changes

Keep every footprint's numbers on that footprint. The 8-tile shop stays the cheap, short-line, no-fridge, no-office start. The 10-tile shop stays the $70 step with the beer fridge and the office runs. The café stays last and stays $150.

Swap the names, the art, and the order you meet them:

- Start: **Coffee cart.** The 8-tile floor, cart panels and an awning, on the sidewalk (the cart is on the street, which is also what the street-view plan draws). Queue 3, rent $10, prices ×0.8, traffic ×0.65, no fridge, no office run.
- Next, $70: **The stand.** The 10-tile floor, a fixed stall, the beer fridge, office runs, queue 5, waiting 2.
- Last, $150: **The café.** Unchanged.

`TIER_IDS` becomes `['cart', 'stand', 'cafe']`. `nextTier` and the receipt follow that array, so the grow button does not need a new rule. Copy that says "Came with the cart" on the beer fridge (`f2`) moves to the stand, because the fridge follows the 10-tile shop, not the old name.

`main.ts` starts a new run at `'cart'`. Blitz and Campaign both do. Campaign's pot sits on the cart; that loadout is the other plan.

Ids are the sharp edge. `stand` and `cart` appear in layouts, fridges, office sizes, outdoor art, the drip seat, and tests. Recommended approach: rename the data so the id matches the new name (`cart` is the 8-tile shop), and update every reader in the same change. A compatibility shim that treats an old `tier: 'stand'` as the new cart would be save migration, which this plan does not do. Old snapshots are refused.

### Layout today

Rearranging is `moveStation` (`src/sim/rearrange.ts`), at night, from the Gear shop map (`src/ui/nightLayout.ts`).

- Only a gear-slot machine moves. A twin moves with its machine (`twinPos`).
- The target is a whole tile in the back-bar rows: x from 1 to the floor width minus 1, y from 1 to the row above the till (`inBar`).
- The till, pickup counter, condiment bar, sink, fridge, tray table, syrup rack, and milk shelf never move. The comment in `rearrange.ts` says so, and `isMovableStation` is `slotOf >= 0`.
- Condiment stock is a count, `state.condimentBoxes`, sitting on `layoutFor(tier).boxCorner`. A player carries one with `tool === 'box'` (`src/sim/condiments.ts`). The corner is not a placeable. The layout check only insists the corner stays reachable.
- `layoutProblems` refuses a layout that covers or cuts off a spawn, the door, the mop home, or the box corner, leaves a station with no working tile, leaves no idle tile by the till, or overlaps two owners.
- The night map draws only those bar rows. Empty tiles light up when `validStationSpots` would accept them. Fixtures are drawn and cannot be selected. The box pile is not on the map.
- Movement is tile nodes (`src/sim/path.ts`). A station blocks the unit square around its `pos` (`blocked` in `src/sim/movement.ts`). Reach is `ECONOMY.interactRangeTiles` (1.1).

`GameState.slotPos` remembers one spot per slot. A grow or a gear buy keeps those spots when they still fit, and resets every slot when they do not (`keepMovesOrReset`).

### What "loose" means here

One placement rule for everything you can buy, so a later table does not grow a second editor.

- The night map is the whole floor, including the front counter and the corner where the boxes sit, out to the tier's width. The door tile and the queue tiles stay locked, because customers, the line, and `LAYOUT.door` assume them.
- A placeable has a `Vec2` in tile units. Recommended snap: a quarter tile (0.25). That is loose next to today's whole-tile bar grid, and it still lines up with the unit-square blocker and the 1.1 reach. A fully free float makes overlap and "can I work this" into special cases. Quarter-tile is the proposal.
- Machines, the milk shelf, the syrup rack, the fridge, the sink, the tray table, the condiment bar, and the supply-box pile use that snap. The till stays on the front counter. The robot cashier, ring-up, and the queue all look for the counter. Moving the till is a different project.
- The box pile is one position (`boxPos`), defaulting to today's `boxCorner`. Carrying a box stays the tool it is now. You drag the pile, not each cardboard box.
- Tables and decorations, when Campaign adds them, are more entries in the same list with the same move and the same night map.
- `layoutProblems` stays the safety check: door, spawns, mop, and a working tile within 1.1 of every station, plus an idle tile by the till. Overlap stays forbidden. The "bar rows only" test goes away. A layout that was legal before a grow and is illegal after still resets, the way `keepMovesOrReset` does.

The pathfinder does not need a rewrite for the quarter-tile snap. Stations already block squares. A placeable that overlaps a tile marks that tile blocked. Phase 1 of layout can ship as "any whole tile on the floor" before the quarter-tile snap, so the map grows before the coordinates change. The quarter-tile snap is the phase that matches "not a grid of spots." Stopping after whole tiles would miss the request.

## Data and state

Growth:

- `TIER_IDS = ['cart', 'stand', 'cafe']`.
- The 8-tile `TierLayout`, queue 3, rent 10, and the no-fridge row move under `cart`. The 10-tile row moves under `stand`. Café fields stay.
- `TIER_FRIDGE`: cart `null`, stand `'f2'`, cafe `'f3'`. Fridge blurbs updated.
- `ORDERS.office.size` keyed so the 8-tile shop has no office run and the 10-tile shop does.
- The drip seat stays with the footprint. Kennedy's ruling puts the small shop's drip by the door at (1, 5) and the middle shop's at (9, 5). A newly bought drip still tries the row above the till (`seatDripByTill` in `src/sim/gear.ts`) and takes the first tile that does not make the layout worse.
- `slotPos` for a run that has not moved stays absent, as today.

Layout:

- `slotPos` keeps machine spots and may store quarter-tile coordinates (`{ x: 2.25, y: 1 }`).
- `fixturePos?: Partial<Record<string, Vec2>>` for the shelf, syrups, fridge, sink, tray, condiment bar. Absent means the tier default from `layoutFor`.
- `boxPos?: Vec2`. Absent means `boxCorner`. `condimentBoxes` stays a count.
- Later, `placeables?: { id, kind, pos }[]` for tables and decor. The same `moveStation` family, or one `moveThing { id, to }` that machines, fixtures, the pile, and tables all accept. One input is easier for the night map. Recommended when fixtures start moving; machines can keep `moveStation` until then so the first layout phase stays small.
- Protocol and snapshot bump when `fixturePos` or quarter-tile spots start being sent. Old saves are refused. No migration.

## Screens

- **Receipt and shopfront.** `growOffer.ts` and `leaseLines` (`tierLook.ts`) already say the next size and the price. They follow `nextTier` and `TIERS`, so the labels change with the data. The FOR LEASE strip on the unused floor should say the next real name ("Stand" on the cart's hoarding, "Café" on the stand's).
- **Grand re-opening.** The "What you gained" card already reads `growDiff`. After the swap it should describe the stand, then the café. The outdoor scene swaps with the tier, which `buildOutdoor` already does by look. The art pass is: the small shop draws the cart (wheels, awning) on the sidewalk; the middle shop draws a fixed stand, not a park plaza that is larger than the cart.
- **Night Layout.** The map grows from the bar rows to the floor. Selectable things gain a fixture and the box pile. The blurb today says fixtures stay put (`nightLayout.ts`). It becomes "Click something, then click where it goes. The till, the door, and the line stay put." Highlights come from the same accept-list the sim uses, as they do now (`validStationSpots`). A quarter-tile map can light the four corners inside a tile, or the player drags and the ghost snaps. Dragging is the clearer "loose" feel; click-then-click can stay as the first slice because it is what the map already does.
- **Day.** No layout editing during service. The morning pre-open was removed on purpose (Round 5). Boxes picked up during the day still come from `boxPos`.

## Build order

1. **Rename and reorder the sizes.** Data, `main.ts` start tier, art swap, fridge and office keys, receipt copy. One playable change: a new game starts on the cart and grows to the stand. Balance numbers on each footprint stay. Tests that name the tiers update with the data. No layout change in this phase.
2. **Whole floor, whole tiles, machines only.** The night map shows the floor. `inBar` becomes "a free tile that does not make `layoutProblems` worse." Fixtures and the box pile still fixed. This is the map the next phase extends.
3. **Quarter-tile snap for machines.** Ghost snaps to 0.25. Reach and overlap use the squares they already use. Playtest whether 0.25 feels loose enough.
4. **Fixtures and the box pile.** `fixturePos` and `boxPos` on the same map. The till stays. Reset-on-grow includes them.
5. **Tables and decor.** The Campaign furniture list, only after phase 4, so they call the same move.

Phase 1 can ship without phase 2. Campaign's pot start can ship on phase 1. Campaign furniture waits for phase 4.

## Open questions

1. Does the cart keep the park, and the stand take the sidewalk, or does the cart sit on the sidewalk so the street-view cars have a road from the first day? This plan recommends the cart on the sidewalk.
2. Is a quarter tile the right snap, or do you want half-tile, or a drag that only snaps when you let go near another object?
3. Which fixtures may move in phase 4? Recommended movable: milk shelf, syrups, fridge, sink, tray table, condiment bar, box pile. Recommended fixed: till, door, queue, mop home.
4. May two machines sit closer than a full tile if their art fits, or does the unit square stay the minimum gap?
5. Should a grow that invalidates a wild layout reset everything (today's rule), or keep every piece that still fits and reset only the ones that do not?
6. Is the 8-tile start still called a cart if its art is a folding cart, even though some of today's "stand" copy ("folding table", commuters) is the better description of day 1? The names can be "Cart" and "Stand" while the blurbs get a pass in the same phase.

## Risks

- Renaming `stand` and `cart` touches data, sim, render, and tests in one change. Shipping it as copy-only, while the ids stay backwards, leaves the next change guessing. One rename is the smaller long-term risk. It is still a wide diff.
- Office runs and the free fridge must follow the footprint. If they follow the id without the swap, the tiny cart gains a 4–6 drink office order and a beer fridge, and the start stops being the poor start Campaign wants.
- Loose placement can block the only tile a station is worked from, or the cashier's idle spot. `layoutProblems` has to stay the authority, and the map has to highlight only what it accepts. The map already promises that for machines.
- Quarter-tile positions make `same()` and the swap-two-slots logic (today they compare whole tiles) need a snap key. Getting that wrong stacks two machines in one square.
- Guest lag gets worse if the night map sends a move per drag-frame. Send on drop, one `moveThing`, as `moveStation` does now.
- The test harness pathfinds to stations. It stays in `src/harness/`. Layout phases should keep a harness day from walking into a wall, and should not add game bots to try the new spots.
