# Plan: cart, then stand, then café, and a layout you can actually move

Status: **draft. Not approved to build.** Kennedy answered the cart and the layout on 2026-11-09 (see Open questions). Those answers are part of the draft. They are not approval to write code.

Two changes. They share a file because the long game (`docs/PLAN_CAMPAIGN_AND_BLITZ.md`) needs both: the sizes in real-life order, and a floor where tables and supply boxes can sit anywhere the later furniture needs.

Standing rules: human play only. No new bot logic. The robot cashier keeps using the till; it does not rearrange. Co-op has no bots. No save-compatibility work. A snapshot bump refuses old saves, as it does today (`SNAPSHOT_VERSION` 35).

## For the player

You start with a coffee cart, on the sidewalk. It is the small one: wheels, a short line, no fridge until you buy the little cube. When you can afford it, you move up to a stand, a fixed stall with more floor, a queue, and a fridge that comes with the keys. The café is still the shop with the door and the window, last.

At night, Layout lets you pick something up and set it down on any tile. The spot snaps to the grid. It does not float. The cash register and the pickup counter are the only things that stay put, side by side at the front. Machines, the milk shelf, the syrups, the sink, the fridge, the box of cream and sugar, the door, the line, and later the tables can all move.

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

- Start: **Coffee cart, on the sidewalk.** Kennedy, 2026-11-09: the cart does not sit in the park. The 8-tile floor, cart panels and an awning, on the street the stand already paints. Queue 3, rent $10, prices ×0.8, traffic ×0.65, no fridge, no office run.
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

### What moves

One placement rule for everything you can buy, so a later table does not grow a second editor.

Kennedy, 2026-11-09: placement is snapped, and the player can put a piece on any snapped spot. The only fixed pieces are the cash register and the pickup counter. They stay next to each other at the front. Moving the pickup would mean redoing the serve, ring-up, and counter logic (`pickup.ts`, `till.ts`, the robot cashier). Everything else can go wherever the player wants: machines, fixtures, supply boxes, and later tables. The door and the queue are in "everything else." They are not a second pair of fixed spots.

- The night map is the whole floor, out to the tier's width, including the front and the corner where the boxes sit.
- A placeable snaps to a whole tile, the grid the sim already uses (`Vec2` tile centres, unit squares in `blocked`). Any tile the layout rules accept is a legal drop. There is no back-bar-only list, and there is no free float between tiles. A quarter-tile or half-tile snap was an earlier idea in this draft. It is not the decision.
- The register (`counter`, today (6, 6)) and the pickup (`PICKUP_ID`, today (5, 6)) stay where they are, adjacent on the front row. The night map draws them and does not select them. The robot cashier, ring-up, and handing a cup over keep finding them there.
- Everything else uses the same snap and the same move: machines and their twins, the milk shelf, the syrup rack, the fridge, the sink, the tray table, the condiment bar, the supply-box pile, the door, the queue, and the mop home. The box pile is one position (`boxPos`), defaulting to today's `boxCorner`. Carrying a box stays the tool it is now. You move the pile, not each cardboard box.
- Tables and decorations, when Campaign adds them, are more entries in the same list.
- `layoutProblems` stays the safety check, retargeted at wherever the door, the spawns, and the mop home now sit: those tiles stay reachable, every station keeps a working tile within `interactRangeTiles` (1.1), and the register still has an idle tile beside it. Overlap stays forbidden. The "bar rows only" test goes away. A layout that was legal before a grow and is illegal after still resets, the way `keepMovesOrReset` does.

The pathfinder does not need a new coordinate system. Stations already block squares. A placeable that sits on a tile marks that tile blocked. "Anywhere" means any of those tiles, not a finer grid.

## Data and state

Growth:

- `TIER_IDS = ['cart', 'stand', 'cafe']`.
- The 8-tile `TierLayout`, queue 3, rent 10, and the no-fridge row move under `cart`. The 10-tile row moves under `stand`. Café fields stay.
- `TIER_FRIDGE`: cart `null`, stand `'f2'`, cafe `'f3'`. Fridge blurbs updated.
- `ORDERS.office.size` keyed so the 8-tile shop has no office run and the 10-tile shop does.
- The drip seat stays with the footprint. Kennedy's ruling puts the small shop's drip by the door at (1, 5) and the middle shop's at (9, 5). A newly bought drip still tries the row above the till (`seatDripByTill` in `src/sim/gear.ts`) and takes the first tile that does not make the layout worse.
- `slotPos` for a run that has not moved stays absent, as today.

Layout:

- `slotPos` keeps machine spots on whole tiles.
- `fixturePos?: Partial<Record<string, Vec2>>` for the shelf, syrups, fridge, sink, tray, condiment bar. Absent means the tier default from `layoutFor`.
- `boxPos?: Vec2`. Absent means `boxCorner`. `condimentBoxes` stays a count.
- `doorPos?: Vec2` and a moved queue (the existing `queueSlots` list, stored once the player has dragged it). Absent means `LAYOUT.door` and the tier's `queueSlots`. Spawn points follow the door so customers still appear at the entrance the player chose.
- The register and the pickup have no stored position. They stay on the front pair.
- Later, `placeables?: { id, kind, pos }[]` for tables and decor. One `moveThing { id, to }` for machines, fixtures, the pile, the door, and tables. The night map sends it on drop.
- Protocol and snapshot bump when any of those positions start being sent. Old saves are refused. No migration.

## Screens

- **Receipt and shopfront.** `growOffer.ts` and `leaseLines` (`tierLook.ts`) already say the next size and the price. They follow `nextTier` and `TIERS`, so the labels change with the data. The FOR LEASE strip on the unused floor should say the next real name ("Stand" on the cart's hoarding, "Café" on the stand's).
- **Grand re-opening.** The "What you gained" card already reads `growDiff`. After the swap it should describe the stand, then the café. The outdoor scene swaps with the tier, which `buildOutdoor` already does by look. The art pass puts the cart (wheels, awning) on the sidewalk, in the scene `buildStand` already paints, and gives the middle shop a fixed stall. The park plaza (`buildCart`) is not the cart's home.
- **Night Layout.** The map grows from the bar rows to the floor. Anything except the register and the pickup can be selected, including fixtures, the box pile, the door, and the queue. The blurb today says fixtures stay put (`nightLayout.ts`). It becomes "Click something, then click a tile. The register and the pickup stay together at the front." Highlights are the tiles the sim would accept. The ghost snaps to the tile. A drag still sends one move on drop.
- **Day.** No layout editing during service. The morning pre-open was removed on purpose (Round 5). Boxes picked up during the day still come from `boxPos`.

## Build order

1. **Rename and reorder the sizes.** Data, `main.ts` start tier, art swap, fridge and office keys, receipt copy. The cart's scene is the sidewalk. One playable change: a new game starts on the cart and grows to the stand. Balance numbers on each footprint stay. Tests that name the tiers update with the data. No layout change in this phase.
2. **Whole floor, machines, snapped.** The night map shows the floor. A machine can drop on any whole tile that does not make `layoutProblems` worse. The register and the pickup are drawn and cannot be selected. Fixtures and the box pile still start fixed. This is the map the next phase extends.
3. **Fixtures and the box pile.** `fixturePos` and `boxPos` on that same snapped map. They can sit on any legal tile.
4. **Door, queue, and mop.** Same snap, same map. Customers spawn at the moved door, and the line follows it. The register and the pickup stay the front pair, so ring-up, serving, and the robot cashier do not move.
5. **Tables and decor.** The Campaign furniture list, only after phase 3, so they call the same move. They can share phase 4's timing. They must not land before the map can store a position.

Phase 1 can ship without phase 2. Campaign's pot start can ship on phase 1. Campaign furniture waits until a piece can be stored and moved.

## Open questions

1. **Decided 2026-11-09.** The cart sits on the sidewalk, not in the park.
2. **Decided 2026-11-09.** Placement snaps to the tile grid. The player can use any legal tile, anywhere on the floor. It is not a free float, and it is not the old list of back-bar spots.
3. **Decided 2026-11-09.** The cash register and the pickup are the only fixed pieces. They stay next to each other at the front, because moving the pickup would mean redoing the serve and ring-up logic. Everything else, including machines, fixtures, and supply boxes, can go wherever the player wants. The door, the queue, and the mop home are in that "everything else."
4. May two machines sit closer than a full tile if their art fits, or does the unit square stay the minimum gap? With the whole-tile snap above, they already cannot share a tile. This question is only about art that overhangs the square.
5. Should a grow that invalidates a wild layout reset everything (today's rule), or keep every piece that still fits and reset only the ones that do not?
6. Is the 8-tile start still called a cart if its art is a folding cart, even though some of today's "stand" copy ("folding table", commuters) is the better description of day 1? The names can be "Cart" and "Stand" while the blurbs get a pass in the same phase.

## Risks

- Renaming `stand` and `cart` touches data, sim, render, and tests in one change. Shipping it as copy-only, while the ids stay backwards, leaves the next change guessing. One rename is the smaller long-term risk. It is still a wide diff.
- Office runs and the free fridge must follow the footprint. If they follow the id without the swap, the tiny cart gains a 4–6 drink office order and a beer fridge, and the start stops being the poor start Campaign wants.
- Loose placement can block the only tile a station is worked from, the door, or the cashier's idle spot beside the register. `layoutProblems` has to stay the authority, and the map has to highlight only what it accepts. The map already promises that for machines.
- The door and the queue moving is customer-path work (`LAYOUT.door`, `queueSlots`, spawn). It is in the plan because they are not the register or the pickup. Phase 4 is where that work sits, so the first layout phases do not have to redraw the line.
- Whole-tile positions keep today's `same()` checks. A later finer snap would have to revisit them. This decision does not add that snap.
- Guest lag gets worse if the night map sends a move per drag-frame. Send on drop, one `moveThing`, as `moveStation` does now.
- The test harness pathfinds to stations. It stays in `src/harness/`. Layout phases should keep a harness day from walking into a wall, and should not add game bots to try the new spots.
