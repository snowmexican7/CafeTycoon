# Phase 2 chaos pack: floor hazards, the drop key, the mop, and the rogue customer

**Date:** 2026-10-28 · **Owner:** Claude (sim, net, host, storage) · **Status:** decided; built in
slices merged to `main` when green. Kennedy asked for decisions and iteration, so every call
below is mine unless it says otherwise; tweak by editing this doc and `src/data/economy.ts`.
Companion docs: [`../../ROADMAP.md`](../../ROADMAP.md), ownership in
[`../../UI_OVERHAUL.md`](../../UI_OVERHAUL.md), deferred items in [`../../BACKLOG.md`](../../BACKLOG.md),
the phase 2 sim design [`2026-10-28-phase-2-busy-season-design.md`](2026-10-28-phase-2-busy-season-design.md).

## 1. Intent

Two briefs from the planning session, built together: **"drop it"** (players can make a mess
and the mess matters) and **"fine, I'll do it myself"** (a rare upset customer who makes their
own drink and leaves without paying). Plus Kennedy's rule: dropping next to a station places
the item on that station instead of the floor.

## 2. Goals, non-goals, anti-goals

**Goals.** A drop key that works on the floor and on stations; grounds piles that spread but
never flood; spills that occasionally slip and stun; a mop that cleans; a cleanliness score
that customers and the inspector feel; bots that avoid spills and sometimes mop; a rogue
customer who walks behind the counter at most once at a time, never on day 1; everything
deterministic from the seed, host-authoritative, in sync in co-op, and tested.

**Non-goals.** Any visuals (piles, puddles, slip animation, mop, angry bubble, the walk behind
the counter): data goes in view models and the list for the UI agent. No new key module work
beyond catching one key in `main.ts`. No new `StationKind`, no change to the fields the renderer
reads (`Customer.drink`, `Player.holding`, `Station.output`, `Player.pos`, `Player.connected`).

**Anti-goals.** A floor that fills with mess; a player or bot frozen for more than five seconds
by anything here; a rogue customer who blocks a machine forever; two rogues at once.

## 3. Constraints

Ownership as in UI_OVERHAUL.md: edit only `src/sim/**`, `src/data/**`, `src/net/**`,
`src/host/**`, `src/storage/**`, tests, docs, `src/ui/viewModels.ts` additively, and in
`src/main.ts` only the keydown hook (the title wiring and everything else stays). Never
`src/ui/*` markup/styles, `src/render/*`, keys.ts/keyboard.ts (render-owned). Randomness only
through `rngNext`/`rngInt` on `state.rng`. `SNAPSHOT_VERSION` → 3 and `PROTOCOL_VERSION` → 3 in
the first task that changes the state shape (old saves are discarded with the existing notice;
a stale peer tab gets the version-mismatch message). Both tracks share one foundation task
(§8) so they can be built in parallel without touching the same lines.

## 4. The drop key (R)

- Physical key `KeyR`, caught by a `keydown` listener in `main.ts` (ignored while a form
  control has focus, like the other keys), sent as a new input `{ kind: 'drop'; playerId }`,
  validated like the others, queued on the player as `dropQueued` and resolved in `stepDay`
  right after queued interacts. Peers send it like any input; the host sim resolves it.
- **Kennedy's rule, first:** if a station is within interact range (same rule as E):
  - trash → bin it (a drink counts as waste, as today);
  - counter → put it on the pass if there is room, else nothing;
  - a recipe station → if it is idle (`busyTicksLeft === 0`) and its output slot is empty,
    the item goes into the output slot and the hand empties; if the station is busy or
    already holds something, **nothing happens** (no floor drop either).
- **Otherwise the floor.** The target tile is the tile in front of the player
  (`round(pos + facing)`, where `Player.facing` is a 4-way unit vector taken from the dominant
  axis of the last non-zero `moveDir`, ties to vertical, default facing down `{0, 1}`; the
  renderer currently draws only up/down facing, so "4-way facing" is a Needs UI line); if that tile is a station square or outside the floor, the player's
  own tile. Grounds → a **grounds pile** (amount 1.0; onto an existing pile: amount = min(1,
  amount + 0.5)). A drink → a **spill** (same merging). The mop (§6) dropped anywhere goes
  back to its corner. Nothing drops while the mess cap is reached (the hand keeps the item).
- A stunned player cannot drop, interact or move.
- Log `drop { item, x, y }` or `drop { item, station }`.

## 5. Messes on the floor

- `GameState.messes: Mess[]`, `Mess = { id; kind: 'grounds' | 'spill'; x; y; amount }`, tiles
  are integer centres like stations (the tile of a position is `round(x), round(y)`); at most
  one mess per tile; at most `ECONOMY.mess.max = 12` messes.
- **Tile entry.** After movement each tick, a player (human or bot) whose tile changed
  "enters" that tile. Events fire only on entry, in `players` order, so the rng stream is
  deterministic.
- **Grounds spread.** Entering a grounds pile with amount ≥ `spreadMin` (0.5): with
  probability `spreadChance` (0.25) one neighbour (4-way, drawn with `rngInt`, fixed order,
  walkable, under the cap) gets a pile of half the amount (merging into a smaller pile there),
  and the source loses 0.25. Piles below 0.25 vanish (tracked dirt wears out). The cap plus the
  halving bound the spread: a dropped pile can touch at most a handful of tiles.
- **Slips.** Entering a spill: with probability `slipChance` (0.05) the player slips and is
  stunned for `stunTicks` drawn from `[180, 300]` (3–5 s): `moveDir` forced to zero, inputs
  ignored (the latest move input is still remembered so a held key does not freeze the player
  past the stun), a bot keeps its plan and waits. **The held item hits the floor** on the
  player's own tile (a drink becomes a spill, grounds a pile; bounded by the cap). Log `slip`.
- **Messes without pranks.** So the system lives in normal play and the tester can tune it: a
  bot that botches a drink drops it where it stands as a spill half the time (`botSpillChance`
  0.5) instead of binning it (still a mistake, still waste, the remake plan unchanged), and a
  slip drops what was held (above). Humans pressing R are the third source.
- **One mess per tile.** A spill landing on a grounds pile replaces it (a wet pile is a
  spill); grounds landing on a spill are absorbed (the spill stays, amount merged).
- **Cleanliness.** `GameState.cleanliness` 0–100, starts 100 each morning. Every tick it
  drops by `dirtPerMessPerTick` (0.0025) per mess and, with no messes, recovers by
  `recoverPerTick` (0.01). Customers: patience × `(patienceFloor + (1 − patienceFloor) ×
  cleanliness / 100)` with `patienceFloor` 0.8, applied through `computeModifiers` when a
  customer arrives (it sets `patienceMax` once); waiting customers are not re-rated. The health inspector fails the visit when
  cleanliness < `inspectorMin` (60), as well as on wasted drinks; one fine either way.
- **Day end** clears every mess, every stun and every cleaning in progress; the mop returns
  to its corner; cleanliness resets to 100 at the next `startDay`.

## 6. The mop

- One mop, leaning at `LAYOUT.mopHome = { x: 11, y: 7 }`; `GameState.mop = { pos, heldBy }`.
  A player carries it as `Player.tool: 'mop' | null`, separate from `holding`, so the
  renderer's item drawing is untouched; a player holding the mop cannot pick up items, and
  cannot pick up the mop while holding an item.
- **Pick up:** E with empty hands, no station within interact range, the mop within interact
  range and not held.
- **E while carrying the mop:** cleaning comes first — if a mess is within interact range,
  E starts a clean (below); otherwise E does nothing (a mop carrier cannot start a machine,
  take an output or serve from the pass; the mop fills their hands).
- **Clean:** E while carrying the mop with a mess within interact range starts a clean of the
  nearest mess: `cleaningTicksLeft = cleanTicks` (90, 1.5 s). Moving cancels it. At 0 the mess
  is removed (log `clean`). One press cleans one mess; a held key is not needed.
- **Return:** R while carrying the mop puts it back in its corner from anywhere (the corner
  is a walk away; the mop teleporting home is the simple, readable rule).
- Bots: when nothing is waiting (no uncovered order, nothing to prep) and either
  cleanliness < `botMopBelow` (70) or there are ≥ 3 messes, and the mop is free, a bot plans:
  take the mop → clean the nearest mess, up to three → return the mop. New `BotStep`
  variant `{ kind: 'floor'; node: Vec2; action: 'takeMop' | 'clean' | 'returnMop' }`.
  Orders always come first: an uncovered order interrupts a mop plan (claim rules unchanged).
- Bot pathing avoids spill tiles when an alternative route exists (the existing `avoid` list
  in `findPath`, with a plain-path fallback); a bot forced through a spill can slip.

## 7. The rogue customer ("fine, I'll do it myself")

- **Trigger.** In `serveCustomer`, from day 2, when no rogue is active, for a normal,
  impatient or regular customer (never an influencer or a group with drinks left): roll
  `rngNext < ECONOMY.rogue.chance` (0.015). On a hit the customer is **not paid for and not
  counted served**; the drink they were handed is gone (consumed, not counted as waste); they
  stay in the queue with `upset: { ticksLeft }` where `ticksLeft = remakeSeconds` (15 s) and
  their patience stops counting down. An upset customer counts as the active rogue (so a second
  cannot start) and the remake serve never rolls again. Log `rogue.upset`.
- **Remake.** Serving them a matching drink inside the window pays normally and counts a
  serve; they leave happy. Log `rogue.remade`.
- **Going rogue.** When the window ends they leave the queue (others move up) and become
  `GameState.rogue = { customerId, name?, drink, stage, pos, path, station, ticksLeft,
  waitTicks }`, starting on the customer side of the counter (tile `(6, 7)`), stage
  `walking`. They path with `findPath` to a **free** station: first their drink's station
  (espresso machine, steamer, or the tap), then any recipe station; free means idle, no output,
  not occupied, and no player within interact range of it. They walk at 0.8 × the base move
  speed and pass through everyone (no collisions, as for humans).
- **Blocked.** On arrival, if a player is within interact range of the station, they wait
  up to `waitSeconds` (5), then re-pick another free station; if none is free (at decision
  time or after the wait), they **storm out**: stage `stormingOut`, path to the door, removed
  on arrival.
- **Making.** Stage `making`: `station.occupiedBy = customerId` and `busyTicksLeft =
  makeSeconds × 60` (10 s); players and bots cannot use an occupied station (E does nothing;
  bots treat it as busy); when the timer ends the station is freed with **no output**; the drink's supply is consumed
  if in stock (one unit, like a normal make), otherwise they make it anyway. Then
  stage `leaving`: path to the door, removed on arrival.
- **Cost.** Made-it-themselves or stormed out: `today.lost += 1` (a regular also counts as a
  lost regular, as any lost regular does), `today.rogues += 1`, and
  reputation −`repHit` (0.1) per rogue at day end; the next morning's notes carry a one-line
  review ("Had to make it myself. Two stars. Good beans though."). That is the lost sale plus
  a small hit; no gain variant (the review is the joke).
- Bots yield to and path around the rogue exactly as they do for players (the rogue's tile
  joins the avoid list after a yield; `shouldYield` sees them). The rogue neither spreads
  grounds nor slips (simplicity; they are a visitor, not a barista).
- Never more than one rogue at a time (structural: one `state.rogue`); none on day 1; a rogue
  still active at day end storms out silently (counted as lost) and the station is freed.

## 8. Foundation shared by both tracks (first task)

One task adds every new field and constant so the two tracks can be built in parallel without
touching the same lines: `Player.facing`, `Player.stunTicksLeft`, `Player.tool`,
`Player.cleaningTicksLeft`, `Player.cleaningMess`, `Player.dropQueued`, `Player.tile`;
`Customer.upset`; `Station.occupiedBy`; `GameState.messes`, `cleanliness`, `mop`, `rogue`;
`DayStats.rogues`; the `BotStep` floor variant; the `drop` input and its validation; `Mess`,
`Rogue` types; `SimEventKind` += `drop`, `slip`, `clean`, `rogue.upset`, `rogue.remade`,
`rogue.made`, `rogue.stormed` (and the matching entries in `RESERVED_TELE_KINDS`);
`LAYOUT.mopHome`; `ECONOMY.mess` and `ECONOMY.rogue` blocks; defaults in `createRun`,
`startDay`, `finishDay`; `stepStations` freeing an occupied station with no output; the
`stepDay` slots in order: stuns tick down → bots → movement → tile entry → interacts → drops →
cleaning → stations → pass → cleanliness → spawns → customers → rogue; `SNAPSHOT_VERSION` 3,
`PROTOCOL_VERSION` 3; the `main.ts` keydown hook sending `drop`.

## 9. Numbers (`src/data/economy.ts`)

`mess: { max: 12, spreadChance: 0.25, spreadMin: 0.5, slipChance: 0.05, stunTicks: [180, 300],
cleanTicks: 90, dirtPerMessPerTick: 0.0025, recoverPerTick: 0.01, inspectorMin: 60,
botMopBelow: 70, botMopMesses: 3, botMopMax: 3, patienceFloor: 0.8, botSpillChance: 0.5 }`
`rogue: { chance: 0.015, remakeSeconds: 15, waitSeconds: 5, makeSeconds: 10, speed: 0.8,
repHit: 0.1, minDay: 2 }`

## 10. View models (additive) and the UI hand-off

`HudVM.messes?: { id; kind; x; y; amount }[]` (key: ids, kinds and tiles; amount patched),
`HudVM.cleanliness?: number` (patched), `HudVM.mop?: { x; y; heldBy: string | null }`,
`HudVM.stuns?: { playerId; secondsLeft }[]` and `HudVM.cleaning?: { playerId; secondsLeft }[]`
(seconds stripped from the key), `HudVM.rogue?: { stage; drink; x; y; secondsLeft; name? }`
(seconds stripped), and in `receiptViewModel`: `rogues`. Each becomes a "Needs UI" line:
piles and puddles on the floor, the slip animation, the mop in its corner and in hand, a
cleanliness meter, the angry bubble, the walk behind the counter and the exit, the review in
the morning notes, and the R key in the controls hint.

## 11. Tests the plan must pin

Drop on a station (idle/empty → placed; busy or full → nothing; counter → pass; trash → waste);
drop on the floor in front (facing) and on a station square (own tile); grounds spread is
bounded (200 crossings never exceed the cap or spread past amount 0.25); slip chance ≈ 5% over
seeded entries and stun in [180, 300]; stunned players ignore inputs; mop pick-up, clean after
90 still ticks, cancel on move, return on R; cleanliness falls with messes and recovers without,
patience and inspector react; bots avoid a spill when a dry route exists and can slip when
forced; a bot mops when idle and the floor is dirty; day end clears all; rogue trigger rate
over 2000 seeded serves within [0.8%, 2.5%] and never on day 1; remake inside the window pays;
occupancy blocks E and bots; blocked station → wait then another → storm out when none;
never two rogues; a day with messes, a mop plan and a rogue is deterministic and JSON-safe.

## 12. Calls Kennedy may want to reverse

- Slipping drops what was held (so spills breed spills, bounded by the cap).
- Bots spill half their botched drinks; the upset customer's first drink is consumed, not waste.
- Facing is 4-way from the dominant axis of the last movement, not the renderer's up/down.
- A mop carrier's E only cleans; cleanliness rates customers on arrival only.
- Rogues consume supplies and a rogue regular counts as a lost regular.
- Bots may take an item a human parked on a station once the human walks away.
- The mop teleports home when dropped, instead of being carried back.
- One E press cleans one mess after a 1.5 s stand-still, instead of holding E.
- The rogue's review is a joke in the morning notes, not a reputation gain.
- Rogues can use any free recipe station when their own is taken.
- Rogues never slip or spread grounds.
- The cleanliness floor for patience is 0.8 (a filthy café costs at most 20% patience).
