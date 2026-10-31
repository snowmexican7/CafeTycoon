# Backlog, known limitations and decisions

Things both agents and the crew should be able to find without reading chat logs. Add to
this file whenever a review defers something, or a decision is made that no other doc
records. Roadmap: [`ROADMAP.md`](ROADMAP.md). Design:
[`superpowers/specs/2026-10-28-cafetycoon-design.md`](superpowers/specs/2026-10-28-cafetycoon-design.md).

## Deferred review items

Found by the fresh-context reviews of phases 1a and 1b and judged Minor: real, but not
worth a fix before the first game night. Fix one when touching its area, or when a
playtest complains about it.

### From phase 1a (solo café)
- Cards bought during the night are not written to the saved snapshot right away, so a
  refresh in the middle of the night may not restore a just-bought card.
- A gamble card's outcome is never shown to the player; it only shows up in the numbers.
- A speed modifier reads as "+100% faster" where "twice as fast" is meant.
- Pressing Space while a button has keyboard focus both activates the button and interacts
  in the café.
- The settings store generates a fresh random token on every read when none is saved.
- The notice shown when a run is discarded is generic and doesn't say what was lost.
- Run history leaves out one-day ad items.
- One Review Focus case from the 1a plan (item 2) has no step-level test.

### From phase 1b (peer-to-peer co-op)
- A peer that rejoins with a different token over the same connection never sends a leave
  for its old token, so the old barista lingers until the host resumes.
- The per-tab identity fallback for browsers that block storage is unreachable; with
  storage blocked, identity resets on refresh.
- Sending to a peer that just left logs an unhandled promise rejection in the console.
- The host logs nothing when a friend's join fails.
- Closing the tab (as opposed to refreshing) loses both the barista and the Rejoin offer.
  The README tells players to keep playing in the same tab.

## Known limitations, accepted for now
- Peers draw the latest host snapshot directly, with no interpolation buffer, so a jittery
  connection shows jittery movement.
- No player cap and no input rate limit on the host.
- Player tokens travel inside snapshots, so a friend in the room could impersonate another
  player. Fine among friends; not fine for strangers.
- No TURN fallback. If two homes can't connect directly, the fix is the Cloudflare relay
  described in design spec §10.
- The browser console shows a failing connection to one public Nostr relay
  (relay.flashapp.me). Expected noise; the other relays carry the room.

## UI overhaul, group B: deferred and open items
- Suggestion flow: "Suggest an idea" opens a blank issue at
  https://github.com/snowmexican7/CafeTycoon/issues/new. Once Kennedy approves the suggestion
  issue template, point `SUGGEST_URL` in `src/ui/roadmapModel.ts` at it
  (`issues/new?template=…`) and create the `suggestion` label. The Suggestions tab lists open
  issues with that label, so it reads "No ideas yet" until the label exists.
- "X served a Latte" toasts in the HUD need a served event from the sim (Claude's side).
- "Crew says" mood reactions on the HUD/night only show when `feedbackIssue` is set; it is
  always null today, so they stay hidden.
- Night shop Upgrades and Ads tabs (and the pitch tab) are locked "Soon" placeholders until
  phase 3 ships those systems.
- The lobby offers "Copy code" only. A join link (`?room=CODE`) needs URL-param handling in
  `main.ts` and the title screen.
- The roadmap progress bar counts a doing goal as half done. It is computed from
  `public/roadmap.json` in `src/ui/roadmapModel.ts`.

## Decisions not recorded elsewhere
- 2026-10-28: The first balance pass met every spec §11 target, so `economy.ts` is unchanged. Re-run the two commands in spec §16 ("Balance pass") after any sim change.
- 2026-10-28: Telemetry is a phase 2 goal. The roadmap rewrite had dropped it; Kennedy wants
  it. Host-recorded, downloaded as a file, no new accounts; see design spec §13.
- 2026-10-28: Saves and unlocks carried between game nights are a nice-to-have, not phase 1;
  they stay in phase 3.
- 2026-10-28: Where AI keys live (the host's browser, or a small backend) is decided in
  phase 5, not before. The design spec's default is the host's browser; the roadmap lists a
  backend as an option.
- 2026-10-28: `main` stays the stable, playable build; finished phases get git tags. No
  versioned paths.
- 2026-10-28: Ownership split, recorded in [`UI_OVERHAUL.md`](UI_OVERHAUL.md): the Video
  Game Designer agent owns `src/ui/*` and the title wiring in `src/main.ts`; Claude owns
  `src/sim`, `src/net`, `src/host`, `src/storage` and the phase 2 bots.
- Pull requests and code review start when someone other than Kennedy contributes. Until
  then both agents push straight to `main` once tests and the build pass.
- 2026-10-28: Group B UI. Seed entry, run history and the key list stay on the title
  screen but are folded down (a seed field in the footer and a "Past runs & controls"
  disclosure). The pause menu shows the roadmap read-only, with no Suggestions tab. The
  legacy dark-panel CSS in `src/style.css` is gone, and every screen now uses
  `src/ui/styles/*.css`.

## Kennedy's design notes, 2026-10-29 (for the Video Game Designer agent and FB1)

Written down from a voice note after the Phase 3 playtest. Only the first item is in FB1 scope
(package 3, station slots); the rest is brainstorming to pick up later, saved so it is not lost.

- **Stations are things you buy, place and remove, from the very start.** A stations tab where the
  crew buys each station (grinder, espresso machine, steamer, cold-brew tap) and then places it
  where they want; stations can be taken out again or moved. The bin and the mop bucket are
  purchases too. No mop bucket means spills stay on the floor all day; no bin means a dropped item
  is a floor mess. The strategy is throughput against mess risk: more machines pump out more
  coffee, but a crowded floor spills more. FB1 package 3 builds the sim side (slots, equipment,
  a `slot` night input, second machines, no-bin drops); Phase 3 Block 14 (layout editor) is the
  same idea from the roadmap side. *2026-10-29: FB1 delivered the sim side of this (slots per tier,
  the `slot` and `equip` inputs, a fixed-price stations shop incl. a second espresso machine and a
  bin, bots that cope with duplicate or missing stations); the mop bucket as purchasable equipment is
  deferred (the render reads `state.mop`), and the stations tab UI is the UI lane's. See "FB1 WP5 reflection".*
- **Collisions should cause spills.** Once player collisions exist, a bump while someone carries a
  drink should have a decent chance of a spill (Kennedy's first guess: around 60%), so the mop
  actually matters and the floor feels like Overcooked. Not in FB1; needs collisions first.
- **Tune a station during the day.** Hold E on a station to open its settings and adjust the
  coffee: espresso has temperature and shot time, the grinder has fine/coarse and grams, cold brew
  is prepped overnight so in the moment it is mostly ice and dilution. Customers give feedback
  lines through the day ("espresso is bitter", "cold brew needs more ice") that tell you which
  knob to turn. This pairs with recipe accuracy (P3 B5) and the taste map (P3 B6). Brainstorm
  only; nothing designed yet.

## Kennedy's notes after the v2.2.0 playtest, 2026-10-29 evening

- **Gear Tree (next big update, v3).** A run starts with almost nothing, opens on "Pick your gear",
  and every machine has its own silly upgrade tree (Hanes-sock cold brew, thrift-store drip, Pod-o-Matic
  up to "The Annihilator"), with cheap-gear downsides, drinks that level up with use, a hidden area
  taste and co-op votes on big buys. Full plan, numbers and build order (G0–G11):
  [`GEAR_TREE.md`](GEAR_TREE.md). Design only; nothing built yet.
- **Bots on/off + count in single player** (UI lane). The sim already takes `settings.bots`, and the
  co-op lobby has the Off/1/2/3 card, but "Play solo" skips the lobby and always sends `'auto'`. Add the
  picker to the solo start. Zero bots = a full chaos solo run.
- **Collision spills** (Claude lane). Players don't collide today. First make bodies bump, then a bump
  while carrying has a chance to spill (Kennedy's guess: about 60%): the cup is lost and a puddle appears.
- **Bots trashing someone else's prep** (Claude lane). A bot picks up grounds or a shot a human prepped
  and bins it when no ticket matches yet. Leave items a human started recently alone, and wait longer
  before binning.
- Corrections: stations are already buyable (FB1 WP5), and slots replaced the layout editor. Only the
  mop bucket as a purchase is still open.

## FB1 WP3+4 reflection

- **What shipped (branch fb1-sim-day).** *Close early:* input `{ kind: 'closeEarly'; playerId; on: boolean }`
  (a connected human, day phase, at least 15 s in; anything else is ignored). State `closeVotes?: PlayerId[]`
  (absent = nobody; cleared in `startDay` and `startNight`; a `leave` removes the vote) and `emptySince?: number`
  (tick stamp, set in `stepDay` when the queue empties, deleted when someone is queued). `stepDay` checks
  unanimity every tick while the doors are open and at least one connected human exists, before the clock
  decrements, so a vote that becomes unanimous because a partner left still closes the shop. Both that path and the
  timer call the exported `enterClosing(state)` in `step.ts`; `finishDay` is untouched. `today.closedEarly` = whole
  seconds left on the clock; log `closedEarly { votes, left }`; morning note "You closed early yesterday with M:SS
  still on the clock." *Sold-out walk-ups:* with the menu on but nothing makeable, `spawnCustomers` rolls one arrival
  per tick (`baseArrivalsPerSecond x m.traffic / TICK_RATE`, so rush hour counts); a hit tallies
  `today.soldOutWalkouts`, logs `walkout { reason: 'soldOut' }` and sets `today.soldOutAt` (seconds into the day).
  No customer, no `lost`, no `turnedAway`, so the rating is untouched. Menu all off: nobody comes, as before.
  Morning note "N people walked away from a sold-out board yesterday."
- **Final shapes.**
  `closeEarlyState(state): { votes: number; needed: number; voted: PlayerId[]; open: boolean; hint: 'soldOut' | 'empty' | null }`
  in `src/sim/closeEarly.ts` (`needed` = connected humans; `open` = day phase and the 15 s gate passed; `hint`
  `'soldOut'` = menu on, nothing makeable; `'empty'` = no customer, no rogue, and nothing on the menu or the queue
  empty for 10 s; `'soldOut'` wins). `enterClosing(state: GameState): void`. `DayStats.closedEarly?: number`,
  `soldOutWalkouts?: number`, `soldOutAt?: number`. `GameState.closeVotes?: PlayerId[]`, `emptySince?: number`.
  `SimEventKind` gains `'closedEarly'` and `'walkout'`.
  Snapshot 22 to 23 (`soldOutWalkouts ??= 0` on `today` and every `days[]` entry), protocol 25 to 26.
- **Numbers (40 weeks, seed 1, humans 2, bots 1, skill 3, pace 3).** Baseline (main e276359) vs after:
  smart mean cash 260.53 / score 276.53 / loss 26.4% / profit 97.5% -> 260.53 / 276.53 / 26.4% / 97.5%;
  taste 274.88 / 288.19 / 28.1% / 100% -> 274.88 / 288.19 / 28.1% / 100%. Unchanged to the cent: the balance bots
  never vote, and the policies never sell out with the menu on, so the new RNG draw never fires. Suite: 86 files / 596 tests
  on the baseline, now 87 files / 621 tests.
- **`emptySince`.** The queue-empty tick stamp is set on every day run (it feeds the `'empty'` hint), so the whole-state
  JSON of a day differs from a pre-FB1 save; accepted, the rule is that the RNG stream is unchanged, and the golden
  `rng` tests pin it against e503518.
- **Needs UI.** A "close early" button for the HUD (the open flag and the vote count are in `closeEarlyState`; show
  the hint as a nudge when `hint` is not null), and a sold-out sign or a "walked away" puff driven by the `walkout`
  log entries. The README controls list gets a line once the button has a key.
- **What to watch.** The bots never vote, so a solo run with two bots closes on the human's single vote, and a
  full-bot tester never closes early (use the input directly). `emptySince` is a plain tick stamp: a pause or a
  resync does not reset it. A sold-out board now consumes one `rngNext` per tick, so seeds replay differently
  from before only on days that sold out with the menu on.

## FB1 WP1-sim reflection

- **What shipped (night side of FB1 work package 1, sim only).**
  - A relaxed night: `settings.nightLengthSec === 0` never counts down. The doors open when every connected
    human is ready, or when the 30 s last call runs out. The last call starts once more than half the
    connected humans are ready (or at once when none is connected), and keeps running if the ready share drops.
    Only connected humans count, so someone who readied and then left does not start it. A timed night is unchanged.
  - `nightClock(state)` for the UI, and the default night is now 120 s (`ECONOMY`).
  - `nightBrief(state)` in `src/sim/brief.ts`, with `dayClock`, `expectedUse` and `runOutFraction`. A restock
    fix is left off an alert when the till cannot pay for it (the alert stays).
  - `profitOf` moved into the sim (`src/sim/profit.ts`); `viewModels.ts` re-exports it.
  - Save version 24 (migration 23 is a no-op; migration 22, the `soldOutWalkouts` backfill, came in with fb1-sim-day and is real now),
    network protocol 27.
- **Final shapes.**

  ```
  nightClock(state): {
    mode: 'timed' | 'relaxed';          // relaxed when settings.nightLengthSec === 0
    secondsLeft: number | null;         // ceil(phaseTicksLeft / TICK_RATE) when timed, null when relaxed
    lastCallSecondsLeft: number | null; // ceil(lastCall / TICK_RATE) once a relaxed last call runs, else null
    ready: PlayerId[];                  // connected humans who have readied up tonight
    needed: number;                     // connected humans (the ready count that opens the shop)
  }
  type NightFix = DistributiveOmit<PlayerInput, 'playerId'>
  interface NightAlert {
    id: string;   // cash:short | cash:low | stock:<supply>:out | stock:<supply>:low | soldOut | spoil | grow | checkout | rival | signature
    kind: 'cash' | 'stock' | 'soldOut' | 'spoil' | 'grow' | 'checkout' | 'rival' | 'signature';
    severity: 'info' | 'warn' | 'danger';
    text: string;
    fix?: NightFix;   // restock fixes are left off when state.cash < restockCost(state, supply, packs)
  }
  nightBrief(state): { profit: number | null; headline: string; alerts: NightAlert[] }
    // profit = profitOf(days.at(-1)) or null on the first night; alerts sorted danger, warn, info,
    // then in the order cash, stock (pantry order), soldOut, spoil, grow, checkout, rival, signature.
  dayClock(fraction: number): string                    // 0..1 -> "8:00 AM".."6:00 PM", ten-minute steps
  expectedUse(state): Record<SupplyId, number>          // supplies a normal day should use
  runOutFraction(state, supply): number | null          // have / expectedUse clamped 0..1, null when unused
  ```

  `GameState.lastCall?: number` (ticks left; absent = no last call). `DayStats` gains optional
  `soldOutWalkouts?` and `soldOutAt?` (filled by Track A; until it lands the soldOut alert only fires from test setup).
- **Checks.** 596 tests before this package, 630 after (87 files); `tsc` and `npm run build` clean.
- **Balance, before and after** (40 weeks, seed 1, 2 humans + 1 bot, 150 s days). The balance script passes its own
  30 s night to the sim, so the 120 s default and the relaxed night cannot move it; the numbers are identical, as intended.

  | policy | mean cash | score | loss | profitable weeks |
  | ------ | --------- | ----- | ---- | ---------------- |
  | smart, before | 260.53 | 276.53 | 26.4% | 97.5% |
  | smart, after  | 260.53 | 276.53 | 26.4% | 97.5% |
  | taste, before | 274.88 | 288.19 | 28.1% | 100% |
  | taste, after  | 274.88 | 288.19 | 28.1% | 100% |

  Logs: `.superpowers/sdd/2026-10-29-fb1-sim/balance-B-smart.log` and `balance-B-taste.log`.
- **Open questions for the UI lane.**
  - The UI view models still show 0:00 on a relaxed night (`viewModels.ts` `clockFor(phaseTicksLeft)`, `live.ts`
    `nightExtras.left`); they should read `nightClock`, and show ready as `ready.length / needed`.
  - `src/ui/nightWarnings.ts` duplicates `expectedUse` (and the low-stock threshold) from `brief.ts`. Nothing pins the
    two together; the night screen should move to `nightBrief` and delete its copy.
  - Stored browser settings keep `nightLengthSec: 60` until the lobby offers a night-length choice (including 0 for relaxed).
  - `viewModels.ts` now imports `profitOf` from the sim (re-export kept for old imports).
  - Changing `nightLengthSec` from 0 to a timed value mid-night leaves `phaseTicksLeft` at 0 and opens the day at once;
    only reachable if the UI exposes the setting during a night.
## FB1 WP1 (UI lane): needs from Claude (sim lane)

The night board was rebuilt as three tabs (Tonight, Menu, Spend) against thin adapters in
`src/ui/viewModels.ts` (search `TODO(fb1 WP1-sim, Claude)`). When these land, swap the adapters:
- **Relaxed nights:** `validate.ts` clamps `nightLengthSec` to 30..600, so the UI sends 600 s
  for Relaxed (`RELAXED_FALLBACK_SEC`) and reads ≥600 back as Relaxed. Please accept
  `nightLengthSec: 0` as "untimed, ends on ready-up", then flip `SIM_ACCEPTS_RELAXED` to true.
- **Last call:** the UI shows "Last call m:ss" in the final 30 s (`LAST_CALL_SEC`) of a relaxed
  night. Once the sim has a real last-call trigger (e.g. 30 s once most of the crew is ready),
  expose it on state (e.g. `state.lastCallTicksLeft`) and `nightTimerVM` will read it.
- **Default length:** `ECONOMY.nightLengthSec` is still 60. The UI default is 120 and a one-time
  settings migration in `main.ts` (flag `cafetycoon.fb1.nightLength`) moves a stored 60 to
  120. Please move the ECONOMY default to 120 too (and update `stores.test.ts`).
- **nightBrief selector:** `nightBriefVM` builds the Tonight alerts (top 3, worst first) from
  the existing night VM. If a sim-side `nightBrief(state)` lands, map it into `NightBriefVM`.
- **Branch names:** a branch called `fb1` exists, so git can't create `fb1/...` refs (a
  directory/file clash). UI branches use dashes: `fb1-ui-night`, `fb1-ui-tickets` (the sim
  lane already does the same).
- The planned sim shapes (`nightClock`, `state.lastCall`, `nightBrief` in the fb1 sim spec §3)
  fit these adapters: on merge, `nightTimerVM` reads `nightClock().mode`/`lastCallSecondsLeft`
  and `nightBriefVM` maps `nightBrief().alerts`.
- **Status (fb1-ui-nightclock):** the clock adapter swap is done. `SIM_ACCEPTS_RELAXED` is true (Relaxed
  is sent as 0), `nightTimerVM` reads `nightClock(state)` (mode, `lastCallSecondsLeft`) and the pill shows
  "Last call m:ss" from `state.lastCall`. `LAST_CALL_SEC` is gone. The `main.ts` migration is now
  versioned (flag value 2): it also moves the old 600 s stand-in to 0. Still open:
  - `nightBriefVM` still builds Tonight alerts in the UI (it adds icons and one-tap UI fixes). Map
    `nightBrief(state).alerts` into it and drop `nightWarnings.ts`'s copy of `expectedUse` (follow-up, UI).
  - The pill doesn't show `ready / needed` yet.
- **Check only:** a kerbside stand should never list a latte. `unlockedDrinks` already filters
  by `canMake` for non-café tiers, so this is probably fine; worth a quick test in the sim lane.

## FB1 WP2 (UI lane): order tickets

- WP2 needs nothing from the sim. The "Recipe hints" setting (on click, always, off) is kept per browser in
  localStorage (`cafetycoon.recipeHints`), like sound. It isn't a run setting, so saves and the protocol are unchanged.
- The next-step highlight is a guess based on what you're holding (`nextStepIndex` in `src/ui/tickets.ts`).
  If recipes change (new drinks or steps), update `DRINK_STEPS` and that mapping together.
- The left gutter now has its own width, `--gutter-l: clamp(230px, 21vw, 330px)` (panel 284 px at 1512 wide).
  The café stage is narrower by the same amount, and the canvas scales to fit.
- Still open on the UI side (WP3 and WP4, not in this pass): the press-and-hold "Close early" button in the clock
  pill, which reads `closeEarlyState`, and a sold-out sign.
## FB1 WP5 reflection

- **What shipped (branch fb1-sim-slots, sim side of FB1 package 3).**
  - *Slots per tier:* the back bar is a row of fixed slots (`SLOT_POSITIONS`, `src/data/layout.ts`): stand 4 at x 1,3,5,7;
    cart 5 at x 1,3,5,7,9; café 6 at x 1,3,5,8,10 and a sixth, empty by default, at (11,1). The café keeps its five old
    positions (they are not on an even grid and moving them would change every bot path). The counter is not a slot.
  - *State:* `state.slots` (one `StationKind | null` per slot), `state.equipment` (owned, unplaced), `state.equipLog`
    (`{ station, day, by }` per purchase). `state.stations` is rebuilt from the slots after every slot change: ids `grinder`,
    `espresso`, … for the first of a kind and `espresso-2`, … for the next; positions come from `SLOT_POSITIONS`; the counter is last.
    Default slots reproduce the pre-slots stations exactly (deep-equal and JSON-equal tests, and golden rng/hash tests for bots 0..3).
  - *Inputs:* `slot` (put an owned station into a slot, or empty it; free rearranging) and `equip` (buy a station), both night-only,
    connected humans only. Any station can be removed, the grinder and the bin included.
  - *The fixed-price EQUIPMENT shop replaces the plan's two dealt cards.* Cards in the deck change every seed's dealt hands, which
    breaks the "unchanged runs keep their stream" rule, and a fixed stations shop is what Kennedy asked for. Prices: espresso $45,
    grinder $30, steamer $40, cold-brew tap $35, bin $15; they count in `fittingsValue` at half, like cards.
  - *`reasonOff(state, drink)`* (`'noStation' | 'noStock' | 'off' | null`): why a drink is off the board. `hasStation` and `canMake`
    now read `state.stations` (the café shortcut is gone), so removing the steamer takes lattes, mochas, matcha and the special off
    the menu through `unlockedDrinks`, `menuDrinks` and `uselessAtTier`.
  - *Bots:* `use(kind, action)` resolves to the nearest idle, unclaimed station of the kind (else the first); at insert time a busy
    machine re-targets to an idle twin. With no bin a bot walks to the nearest walkable node with no station in reach and no spill
    (`floorDropNode`) and drops there (floor action `'drop'`). *Mess-cap fallback:* with no bin and the floor at `ECONOMY.mess.max`,
    grounds go through the espresso machine (`insert`, `take`, `counter put`) instead of failing to drop. Rogue customers
    (`ROGUE_STATION`, `pickStation`) prefer any free station of the drink's kind, and `canDrinkEspresso` accepts any espresso machine in range.
  - *Growing conserves what the crew owns* (`growSlots`): per kind, `equipmentAfter = ownedBefore + max(0, defaults(to) - defaults(from)) - defaults(to)`,
    clamped at 0 (ownedBefore = placed + equipment). A steamer bought on the stand survives the move to the cart (the cart's own
    steamer is a gift on top), and a grinder removed into equipment is not duplicated. Surplus is kept in kind order grinder, espresso,
    steamer, coldBrewTap, trash. (An earlier version, `owned - defaults(to)`, swallowed a bought steamer; fixed in `40396e3`.)
  - *Save version 25, network protocol 28.* Migration 24→25 sets `slots = defaultSlots(tier)` and `equipment = []`; the 22 and 23
    steps are real (`soldOutWalkouts` backfill and a no-op); the day/night branches filled them at merge.
- **Final shapes** (header comments, verbatim in spirit).
  - `src/sim/slots.ts`: `slotCount(tier): number`; `defaultSlots(tier): (StationKind | null)[]`; `stationsFromSlots(tier, slots): Station[]`
    (slot order, empty slots skipped, counter last); `growSlots(state, to)` (called before `state.tier` changes);
    `applySlotInput(state, input)`, `applyEquipInput(state, input)`, `equipmentSpent(state)`; `reasonOff(state, drink)`.
    Pure, no RNG, everything in slot order.
  - `src/data/equipment.ts`: `EquipmentKind = Exclude<StationKind, 'counter'>`; `EQUIPMENT_KINDS = ['grinder', 'espresso', 'steamer', 'coldBrewTap', 'trash']`;
    `EQUIPMENT: Record<EquipmentKind, { name, cost, blurb }>`.
  - Inputs: `{ kind: 'slot'; playerId; index: number; station: StationKind | null }` (night, connected human, `index` within `slotCount(tier)`,
    `station` from `state.equipment` or `null`; the old content goes to equipment) and `{ kind: 'equip'; playerId; station: StationKind }`
    (night, connected human, cash in hand, not `'counter'`; goes into the first empty slot, else into `state.equipment`; logged in `equipLog`).
  - Tester: `--layout default | twinEspresso | noColdBrew | noTrash` (`BalanceOptions.layout`, `applyLayout(state, layout)` in `scripts/balanceCore.ts`),
    applied right after `createRun` and `addStandIns` by editing slots and equipment and rebuilding the stations. Under the `grow` policy the
    layout only shapes the stand: growing hands the new tier's defaults back (the bin comes back as a default), so use it with the café-start policies.
- **Tests.** 596 before FB1; 787 now (92 files) on `fb1-sim-fixes` with the whole fb1 sim lane merged in, of which the slots work adds
  48 in `slots.test.ts`, the bots work about 16 in `brain.test.ts`/`rogue.test.ts`/`espresso.test.ts`, and C4 adds three in `balance.test.ts` plus the grow-formula tests.
- **Balance (40 weeks from seed 1, smart policy, 2 stand-in humans + 1 bot, café start).**

  | layout | mean cash | score | loss | profit | loss by day 1..7 |
  |---|---|---|---|---|---|
  | default (baseline) | 260.53 | 276.53 | 26.4% | 97.5% | 11/16/23/27/29/36/32 |
  | twinEspresso | 301.94 | 329.63 | 23.2% | 100% | 10/15/18/24/26/31/28 |
  | noColdBrew | 151.36 | 92.05 | 43.7% | 87.5% | 27/38/39/44/48/55/48 |
  | noTrash | 260.62 | 275.75 | 26.7% | 100% | 10/18/21/29/32/35/33 |
  | taste, default | 274.88 | 288.19 | 28.1% | 100% | 11/17/24/26/34/39/35 |

  The default and taste rows equal the pre-slots baselines (smart 260.53 / 276.53 / 26.4% / 97.5%, taste 274.88 / 288.19 / 28.1% / 100%), so the
  slots change nothing until a crew rearranges them. A second espresso machine helps a lot (+$41 mean cash, score +$53, 3 points less loss, and the tester gets it
  free, so read the real gain as that minus the $45), which says the price is not too low. Losing the cold-brew tap
  is the heavy one (-$109, loss 43.7%) because the tester keeps cold brew on the menu and those orders walk away. A missing bin is currently free: bots
  drop grounds on the floor and the mop keeps up, so "throughput against mess risk" needs a harsher floor (see below) before no-bin is a real choice.
  Logs: `.superpowers/sdd/2026-10-29-fb1-sim/balance-C-<layout>.log`, `balance-C-taste.log`.
- **Open questions for the UI lane.**
  - Render reads `layoutFor(tier).stations` (viewModels.ts, scene.ts). It must draw from `state.stations` instead, including duplicates with ids
    `kind-2` and empty slots (draw an empty bracket or plinth at `SLOT_POSITIONS[tier][i]` where `state.slots[i] === null`).
  - The Spend/Shopfront slots strip needs `slotCount(tier)`, `state.slots`, `state.equipment`, `EQUIPMENT` and the two inputs (`slot`, `equip`).
  - `reasonOff(state, drink)` is for the "lattes off: no steamer" note on the Menu tab.
  - A mop bucket as purchasable equipment was deferred because the render reads `state.mop` (see Kennedy's design notes, first bullet): no mop bucket
    should mean spills stay all day, which needs a `state.mop` that can be absent and a render that tolerates it.
  - Tuning for later: with a bin gone the floor should punish (grounds piles and spills mop-cost more, or slow walkers); today the tester says it does not.
  - A `slot` input can put any kind into any slot, including a steamer on the stand, so a kerbside stand can sell lattes once it owns one (tested).

## FB1 WP6 reflection

- **What shipped (branch fb1-sim-bots, sim side of FB1 package 6, the planner half).**
  - *The night planner* (`src/sim/bots/planner.ts`, pure and RNG-free, reads only what the crew can see: never `comboStars`,
    `adOutcome` or `rivalMenu`). Final shapes:
    ```ts
    interface Advice {
      id: string;   // restock:<supply> | price:<drink> | twist:<drink> | signature | scout | rival |
                    // grow:<tier> | checkout:<id> | slot:<index> | equip:espresso | menu:<drink>
      kind: 'restock' | 'price' | 'twist' | 'signature' | 'scout' | 'rival' | 'grow' | 'checkout' | 'slot' | 'equip' | 'menu';
      text: string;
      input: NightFix;   // the input without its playerId
      priority: number;  // restock out 100, low 90; rival 80; grow 70; checkout 60; slot 55; price 50;
                         // twist 40; signature 35; equip 30; scout 20; menu 10
    }
    planNight(state): Advice[]                                   // priority desc, then id asc
    crewTips(state, max = 2): (Advice & { by: PlayerId })[]      // top `max`, round-robin over connected bots
    restockAdvice(state, budget?): Advice[]                      // exported for the tester
    ```
  - *Rules.* Restock every supply a menu drink needs to the day's expected use x 1.25 (out of stock first). Price: each drink
    at the step in -2..+4 that maximises its own `priceForecast` profit; the signature drink is left to the rival rule while the knock-off is live. Twists: set a known 4-5 star
    twist, drop a known 2-star-or-worse one, otherwise try the first untried twist on yesterday's best seller (and wait while one is
    being explored). Signature: propose the best known 4-star-plus combo at premium 2 when none exists. Rival: when the copy
    undercuts, cut the signature drink's menu step just enough, else lower the premium. Grow when cash after tonight's restock and
    rent covers the tier; otherwise the next checkout; place unplaced equipment into the first empty slot; buy a second espresso
    machine when yesterday lost more than it served at a one-machine bar; scout from day 2 when $20 is spare; switch off a drink the
    bar has no station for, unless the plan grows, the station sits unplaced in equipment, or it would leave the board empty.
    Opening night is for stocking: grow, checkout and equip wait for a finished day. One day's rent is held back and every spending
    advice draws on the rest in priority order, so applying the whole list never overdraws the till.
  - *`--policy planner`* (`scripts/balanceCore.ts`): opens as the stand (like `grow`), and at night stage 0 `plannerNight` applies
    every advice from `planNight(state)` in list order with `applyAdvice`, `grow` last, then re-plans once (growing resets the
    slots) and applies what the bigger shop calls for. `applyAdvice` mirrors the sim's apply functions by direct mutation, as
    `tasteNight`/`growNight` do (the tester has no human player): restock, price, twist, signature, scout, grow (`growSlots`),
    checkout, slot, equip (with `equipLog`), menu (never the last drink); the rival advice is a price or signature input and goes
    through the same code. Nothing it cannot pay for or the sim would refuse is applied. Card buys still come from
    `smartNightInputs(state, 'smart', stage)` after stage 0 (stage 0's smart restock is skipped: the planner already restocked).
  - *Hurried personality.* `Personality` gains `'hurried'` (`ECONOMY.bots.personalities.hurried`:
    speed 1.15, reaction 0.85, mistake 0.08, no cold-brew prep) and the roster grows to four bots
    (`BOT_IDS` ×4, `BOT_PERSONALITIES = ['steady', 'hurried', 'veteran', 'rookie']`, named Bo, Lu, Mo, Zip), so any game
    with two or more bots has a hurried one and the veteran (Mo, shades and espresso) stays in the three-bot
    crews the lobby can ask for; the rookie is the fourth, tester-only bot (`--bots 4`). In `act` for a `take` step, a hurried bot whose machine is in
    the last 40% of its run (`ACCURACY.earlyShare`) with `ECONOMY.bots.hurriedQueue` (3) or more
    customers queued presses use: the existing early pull takes the cup one star down and logs
    `cup.early`. `ECONOMY.bots.autoCrew = 3` keeps `bots: 'auto'` at three bots; the lobby cap stays
    at spawn points − 1 and the tester accepts `--bots 0..4`. Runs with `bots: 0` or one bot keep the
    base RNG stream (goldens); two- and three-bot runs change by design (the roster is the feature).
    Open: the render's `botLook` gives hurried the steady look (UI lane); no `cup.early` showed up in
    the seed-5 900-tick runs, so telemetry from a game night should confirm hurried bots do rush.
- **Final fix wave (fb1-sim-fixes).** `crewTips` names the ids the roster will spawn (`BOT_IDS.slice(0, botsFor(...))`) on the
  opening night, before any bot has clocked in; the roster order keeps the veteran in three-bot crews; the planner switches a
  drink off while at least one other stays on (it used to keep two); the early-close note reads whole seconds rounded up (never
  0:00); wheeled-out players are not counted as close-early voters.
- **Suite.** 86 files / 596 tests before FB1; after this branch and the final fix wave 92 files / 787 tests. `tsc` and `npm run build` clean.
- **Balance (40 weeks, seed 1, humans 2, bots 1, skill 3, pace 3, scenario random, day 150 s).**

  | policy | start | mean cash | score | loss | profitable | bankrupt |
  |---|---|---|---|---|---|---|
  | smart | cafe | 260.53 | 276.53 | 26.4% | 97.5% | 0% |
  | taste | cafe | 274.88 | 288.19 | 28.1% | 100% | 0% |
  | grow | stand | 186.10 | 173.42 | 17.9% | 100% | 0% |
  | planner | stand | 183.37 | 222.87 | 15.9% | 100% | 0% |

  smart and taste reproduce the pre-FB1 baselines to the cent. `grow` at 40 weeks is 186.10 / 173.42 (the 20-week figure in the
  C1 report, 194.08 / 185.21, is the same code on fewer seeds). Logs: `.superpowers/sdd/2026-10-29-fb1-sim/balance-D-*.log`.
- **Growth days (stand start, 40 weeks).** planner: cart in 38 of 40 weeks at a mean of day 2.68, café in 10 of 40 at day 6.30;
  weeks end as 28 cart, 10 café, 2 stand. grow: cart in 35 of 40 at day 4.71, café in 6 of 40 at day 6.67; 29 cart, 6 café, 5 stand.
  The planner grows two days sooner because it spends only what is above the rent reserve and its own restock, not "price + $60".
- **Reading.** The planner is a bit behind `grow` on cash (-2.73) and well ahead on score (+49.45), which counts fittings at
  resale value: it turns cash into stations and tiers (a café in a quarter of its weeks, against 15%) and loses fewer customers (15.9%
  against 17.9%, and a flatter loss curve: 3/9/15/15/19/27/18 against 4/3/13/16/23/31/24 by day). It is far below the café-start
  policies in cash (260-275), but those start with the full bar and a bigger room, so the fair comparison is `grow`, and there it
  is level on cash and clearly better on score. What it does badly: it cuts the drinks to -2 (at the three openings I checked; the forecast says that is
  where profit peaks, and it never tests the crowd's actual reaction), and it explores twists one drink a night, so a short week
  may not find a signature (not measured; the telemetry would say how often it did). Its card buying is smart's, but it starts
  poorer, so it rerolls rarely (0.3 a week against 2.7 for smart).
  *Pricing:* a one-pass menu-total objective (each drink at the step that maximises the profit summed over the whole menu) was
  tried and produced identical steps in every one of 1029 states the reviewer brute-forced (stand, cart and café, every step
  combination) and the same 40-week result (183.37), so the per-drink rule stays. The planner still prices most drinks at step -2
  because `priceForecast`'s demand model (elasticity 1.8) puts the profit peak there, which is a balance question for the pricing
  model, not the planner.
- **Open questions for the UI lane.**
  - Show `crewTips(state, 2)` as chips on Tonight (attributed to the bot in `by`; `[]` with no connected bot). The UI applies an
    advice by sending `{ ...advice.input, playerId: me() }`; the sim re-checks everything, so a stale chip is a no-op.
  - Advice is suggestions only until P3 B15 (the planner never spends a real player's money). Should a chip vanish once its input
    has been applied (planNight will stop listing it) or stay as "done"?
  - The planner proposes grow and checkout from the first finished day; the nightBrief alerts also say so. Pick one place to show
    them, or dedupe by `id` (`grow:<tier>` against the brief's `grow` alert).
  - `crewTips` text uses the café's own words ("walked out to ... served"); the UI may want to shorten it for a chip.

## main.ts hook-ins (phase 2)

Telemetry hook-ins in `src/main.ts` (slice 7); the UI agent should expect these when merging the title wiring.

- Imports: `createTelemetry`, `withTelemetry`, `createUiBuffer`, `setUiTelemetrySink`, `uiTelemetry`, `Telemetry` from `./host/telemetry`; `PROTOCOL_VERSION` from `./net/protocol`.
- `Session` gains `telemetry` and `teleTimer`, both initialised `null` in `createSession`.
- `main()` scope: `newTelemetry(host)`, `attachTelemetry(s, tele)`, `downloadTelemetry()`, `telemetryRows()` and `lastFrameAt` helpers sit beside `interactPending`.
- `startSolo`, `startHost`, `resume`: the local transport is wrapped with `withTelemetry`, and `attachTelemetry` runs right after `createSession` (sets `s.telemetry` and the UI sink).
- `openHostRoom`: `createHostRoom` gets a fifth `hooks` argument forwarding peer tele events to `s.telemetry?.peerEvents`.
- `startPeer`: a `createUiBuffer()` feeds the UI sink, and a 2000 ms interval (`s.teleTimer`) sends `transport.sendTele(buffer.drain())`.
- `frame()`: tracks the previous frame time and records `frame.long { ms }` through `uiTelemetry.ui` when the gap exceeds 250 ms (first frame skipped).
- End of `main()`: `window.cafetycoon = { telemetry: { download, rows } }`; wire `downloadTelemetry` / `telemetryRows` to UI buttons if wanted.
- `endSession`: clears `teleTimer` and calls `setUiTelemetrySink(null)`.

## Needs UI (phase 2)

The data exists; the visuals are the UI agent's.

- `HudVM.pass`: items on the counter, plus a HUD list.
- `NightVM.menu` toggles, and the `menu` input `{ kind: 'menu', playerId, drink, on }` (night only).
- `HudVM.events`: banners and toasts for `state.log` kinds `inspection` and `influencer`.
- Customer kind tells: `Customer.kind`, `name`, `extra.length`.
- Bot tells: `Player.bot` present means a name tag "(bot)"; `bot.personality`.
- Receipt fields via `receiptViewModel(dayStats)`: wasted, fines, bonus, inspection, events, botMistakes, lostRegulars, drinks.
- Telemetry download button on the pause and week-end screens, calling `downloadTelemetry()` in `main.ts`.
- `uiTelemetry.ui(kind, data)` calls from the night screen (cards hovered or opened but not bought).
- Title or pause settings for `bots` (0 to 3 or 'auto') and `botSkill` (1 to 5), through the existing `settings` input.
- `nightViewModel.ready` now omits bots; `hudStructureKey` ignores per-tick `secondsLeft` fields (pass, events).
- Show the version from `package.json` (e.g. `v1.0.0`) on the title screen, and have the Roadmap drawer's Changelog tab read `CHANGELOG.md` (or a generated copy) instead of the short `changelog` array in `roadmap.json`.

## Needs UI (chaos pack: floor)

Shipped in Block 1 (`src/render/layers/chaos.ts`, `src/render/chaosModel.ts`), except where noted.

- piles and puddles from `HudVM.messes` (amount scales the size)
- the slip animation from `HudVM.stuns`
- the mop in its corner and in hand from `HudVM.mop`
- the cleaning progress from `HudVM.cleaning`
- a cleanliness meter from `HudVM.cleanliness`
- 4-way facing from `Player.facing`
- the R key in the controls hint

## Deferred (phase 2)

- Syrups and a flavour picker wait for Group B (sketch: a syrup station, number keys 1 to 9 to pick a flavour, flavoured orders on tickets).
- Buying and placing stations, and a one-machine start, are phase 3.
- Telemetry rows are never capped in memory; a long four-player run may reach tens of MB. Coalesce repeated move rows later.
- `frame.long` should be suppressed while `document.hidden`.
- A human standing idle within reach of a machine holding a finished drink blocks bots from collecting it; add an idle grace.
- After a host resume, bots added before friends rejoin can give a six-barista day until the next morning; trim on join.
- `tele` batches have no host-side rate limit.
- `frame.long` still logs one row covering the whole hidden period on the first frame after a tab returns (animation frames stop while hidden); add a `visibilitychange` listener in `main.ts` that resets the previous-frame timestamp. Until then, drop `frame.long` rows over a few seconds when analysing.
- Grounds abandoned as the grinder's output count as a pending drink for bot coverage, so a single espresso or latte order reads as covered until someone takes them; extend the orphan rule so a bot picks up abandoned grounds and continues the chain when an espresso/latte order is uncovered.

## Sound and music (stage 1): deferred and open items

Sound is client-only (`src/audio/`): cues come from diffing two snapshots this client already has,
so it cannot affect the sim, co-op sync or the seed. Settings live in `localStorage` under `cafetycoon.audio`.

- **Station sounds don't pause in a power flicker.** A grind or pull is scheduled for the station's
  busy time when it starts; if the power cuts out mid-pull the sound plays on. The music does
  tape-stop and muffle during the flicker. Fix: track playing station voices per station id and
  fade them when `busyTicksLeft` stops falling.
- **No positional audio.** Everything is centred; the local player's own actions are only a little
  louder (`mine`). Panning by station x position would be cheap (StereoPannerNode per voice).
- **Synth recipes are procedural, not recorded.** Grinder, espresso, steam and pour are Web Audio
  recipes tuned by ear; real CC0 recordings (freesound) would sound richer if someone finds good ones.
- **Music is generated at runtime** (about a second of OfflineAudioContext work after the first
  click). It is cheap, but there is no "pre-rendered file" fallback if a browser lacks OfflineAudioContext;
  such browsers simply get no music.
- **No per-customer-kind sounds** (regulars, VIPs) and no menu/tab switch sounds on the night screen
  beyond the generic UI click.
- **No volume ducking for stingers**: the day/night music keeps playing under event jingles.

## Espresso Easter egg (stage 2): sim touchpoints, tuning, open items

The logic is all in `src/sim/espresso.ts` (plus `espresso.test.ts`). **Claude, heads up: these are
the only lines touched in your areas**, each a one-line call into that file:

- `types.ts`: optional `Player.espresso`, `GameState.debt`, `DayStats.ambulance` / `debtPaid`; input
  kind `{ kind: 'espresso', playerId }`; log kinds `espresso.shot` / `espresso.collapse`.
- `validate.ts`: `'espresso'` added to the playerId-only case list.
- `step.ts`: `case 'espresso': drinkEspresso(...)` in `applyInput`; `stepEspresso(s)` first in `stepDay`
  (counts the boost down, freezes a collapsed player, moves them to the door once wheeled out).
- `movement.ts`: per-player speed `* espressoSpeed(p)` (1 unless boosted).
- `closing.ts`: `settleEspresso(state)` right after rent (bill goes on the tab, tab is repaid).
- `run.ts`: `espressoMorning(state)` at the end of `startDay` (collapsed player back, counters reset).
- `bots/roster.ts`: `humanCount` skips `p.espresso?.out`, so `syncBots` adds a cover bot mid-day when
  the crew has room and drops it next morning.
- Client: `KeyQ` sends the `espresso` input (src/render/keys.ts, keyboard.ts, main.ts). Old hosts
  ignore the unknown kind, so no protocol bump.

Tuning (all in `ESPRESSO`): Q within interact range of the espresso machine, day or closing, costs
1 bean (no beans, no shot). Shots 1-5 today give +30/35/40/45/50% speed for 15 s; re-drinking
refreshes the timer. Shot 6 collapses: out for the day, held item dropped, $150 ambulance bill.
The bill goes on a hospital tab (`state.debt`) at close; from the next close on, half of each
day's positive profit pays it down, never more than the cash in the till (so it can't bankrupt
anyone). No RNG involved. Bots never drink.

Open items:
- Unpaid hospital debt is not subtracted from the week score (`scoreRun` is cash-based).
- If a collapsed player disconnects and rejoins, they stay out until morning (intended).
- The cover bot only appears if the crew is under the bot cap (`bots: 'auto'` or a free bot slot).

## Phase 1 UI polish: night warnings, cash vs. score

- **(Done in P3 B15: `billsForDay` in `src/sim/staff.ts`; `rentTomorrow` now returns it.) Needs from sim: wages.** The night warning works out "cash after tomorrow's bills" from rent only (`rentForDay`), because there are no wages in the sim yet. When hired staff land (phase 3), expose the next day's wage bill (or a `billsForDay(state)` helper next to `rentForDay`) and `src/ui/nightWarnings.ts` will add it to `rentTomorrow`.
- Supply "low" warnings use a UI-side estimate (`expectedUse`: base arrivals × day length × traffic, split by order bias over the drinks on the menu). A supply counts as low below 75% of that (`LOW_SUPPLY_SHARE`), since some customers walk out, so a fresh run's starting stock doesn't nag. If the sim ever tracks an expected-orders number, use that instead.
- Warnings never block Ready. The structure key only includes each warning's `id:level`; titles and amounts are patched in place.

## Needs UI (chaos pack: rogue)

Shipped in Block 1 (the review in the morning notes was already there).

- the angry bubble on an upset customer (`Customer.upset`)
- the rogue walking behind the counter and out the door (`HudVM.rogue`)
- the occupied-station tell (`Station.occupiedBy`)
- the review in the morning notes
- the receipt's `rogues` line

## Chaos pack open items

- **Mopping under traffic (tuning question).** Bots only mop when no order is waiting, so on a busy floor they rarely get to it: with 2 bots on day 2, 9 of 16 seeds produced a bot clean in 4000 ticks, and a floor nobody mops hits cleanliness ~11 within a minute. Candidate tweaks: allow `shouldMop` when `cleanliness < inspectorMin` even with orders waiting, or whenever the queue is ≤ 1.
- **The tester has no chaos columns.** Add rogues, messes, cleanliness and cleans to its output.
- **Host tip (game night).** Until the UI draws piles on stations, a bot standing idle with an order waiting may mean grounds parked in a machine. Fixed in the sim (bots no longer count stray grounds as a shot and bin them); kept here for the record.

Deferred minors:
- Drop logs (`drop` events) carry no player id.
- Mop logging differs between a holder leaving and a stale holder being cleared.
- `idleNode` may pick a spill tile.
- The spill-avoiding path search runs twice when nobody is near (the "around people" pass adds nothing).
- Determinism tests compare whole states with `toEqual`.
- The mop corner sits in the queue column (layout/visual note).

## Block 0 (Phase 1 close-out, 2026-10-29 overnight)

Review of the chaos pack (tracks A and B, Claude, since `076d181`) and its final-review fixes
(`318c1e9`, `b0e7b86`, `55d8ba9`): tests, `tsc` and the build are green; no `Math.random`, `Date`
or unordered iteration in the new sim code; the rogue, floor, mop and drop logic only reads
`state.rng`. Findings:

- **Fixed:** the sim never called `pruneLog`, so `state.log` (and every snapshot) grew all day.
  `step()` now prunes every tick (`LOG_KEEP_TICKS` = 120). Telemetry and sound consume the log by
  `seq` on every snapshot (20 Hz), so nothing is lost. Tests that inspected `s.log` after long runs
  now record the kinds while stepping.
- **Fixed:** `pass.ts` and `drop.ts` hard-coded 60 ticks per second for staleness; they use
  `secondsToTicks` now.
- **Deferred (tuning):** `placeMess` refuses a new mess at the cap (12) even when the tile already
  has one it could merge into, so at the cap a drop onto an existing puddle is refused and the
  player keeps the item. Probably better to allow the merge; tests "nothing drops at the cap" and
  "slip at the cap keeps item" pin today's behaviour.
- **Deferred:** a bot's `returnMop` step relies on R preferring the mop over a held cup (it does,
  in `resolveDrop`); worth a direct test if R ever changes.
- Claude's own open items are in "Chaos pack open items" above.

Decisions:

- **Closing.** At 0:00 the doors lock (no new arrivals); everyone inside can still be served. The
  day ends when the shop is empty (customers and the rogue) or after `ECONOMY.closingGraceSeconds`
  (30 s); leftovers storm out and count as lost. The closing phase lasts at least
  `closingMinSeconds` (1 s) so the banner and receipt always show. The HUD shows "Doors locked:
  finish up! N left"; the banner's presence is structural, the count is patched.
- **Seats.** A peer offers the seat this browser last played in that room (`prev`, from
  `localStorage` `cafetycoon.seat.<CODE>`); the host gives it back only if it is a human seat that
  is away (not live, not the host). Without one, an away seat with the same name (trimmed,
  case-insensitive) is reclaimed. Otherwise a new seat if fewer than 4 humans, else the room is full
  (`hello.reject = 'full'`, "The café is full"). A live seat is never handed to a second
  connection. The host tells the peer its seat with a new `seat` message (protocol 4). Peers leave
  the room on `pagehide` so a closed tab shows as away quickly. The peer's room (for "Rejoin") is
  now per browser too.
- **Known seat risks (accepted):** two people with the same name, one of them away, can swap into
  each other's seat by the name match; a duplicated browser tab copies `sessionStorage`, so both
  copies claim the same token and the later connection wins (the earlier one is replaced). Both
  need the same browser or the same name; fine for game night.
- **Bots setting.** Off or 1–3, picked by the host on a paper card in the lobby (peers see it
  read-only). Until the host picks: Off with 2+ humans, auto (fill to three baristas) for a lone
  host. Saved in `state.settings.bots` with the run; the roster, morning sync and the espresso
  cover bot read it. Bots never take a spot behind the counter a human would need (max 4
  baristas), so with 4 humans the card says no bot fits.
- **Deferred:** a host-only Bots row in the pause menu (the sim already accepts a `settings`
  input with `bots` and applies it next morning; only the UI row is missing).
- **Dev hook:** `window.cafetycoon.peek` (`state()`, `me()`) is a read-only copy of the latest
  snapshot for smoke scripts and playtests.

## Block 1 reflection (chaos pack visuals)

Shipped: grounds heaps and lumpy puddles (cold brew/espresso darker) that grow in, ripple when
they spread and shrink away when mopped; THUD! + dust + swirly eyes, orbiting stars and a wobble on
a slip; the mop bucket in its corner, a carry pose and a scrub swing, a wet-floor sign that hops to
whoever is mopping, a scrub progress ring; the Floor meter card (patched in place, never in the
structure key); the rogue (anger vein and steam, a sneaking crouch, "Move it! 4s", OCCUPIED tape on
their station, "Two stars." on the way out, speed lines and SLAM! with a swinging door and a small
screen jolt); the upset customer's red shaking bubble; receipt lines for wasted drinks, pratfalls
and rogues; 12 new cues (slide-whistle thud, splosh, scatter, mop clack/squeak, sneaky pizzicato,
smug ta-da, door slam). A dev-only fixtures page (`fixtures.html?f=floor|rogue|slam|receipt`,
served by `vite`, not in the build) drives screenshots.

What could be better:
- A puddle is often hidden under the barista standing on it; a thin highlight ring around messes
  near a player would help. Messes on the rug read a little less well than on planks.
- The rogue mostly walks up the screen, so we see their back: the anger vein carries it, but a side
  view would sell the sneak better.
- The comic texts use `Math.random` for tilt (visual only, but two clients tilt differently).
- The door slam draws a temporary door: the room has no real front door yet (B6 decor could add one).

What's missing (deferred):
- Blame: "Cleo slipped on Ben's latte!" needs the mess's owner in the sim (`Mess.by`). Small sim
  change; parked for B10 (awards) where it pays off most.
- Grounds footprints when someone walks through a heap (purely visual trail).

Co-op fun:
- Folded in now: the name tag reads "Ben · mop" so the crew knows who to shout for, and the
  receipt counts the day's **pratfalls** (`DayStats.slips`, a tally only).
- Next: a "Butterfingers" / "Pratfall champion" award at the week end (B10); letting a player
  carry the wet-floor sign to fence off a puddle for the bots (B5 bots already path round spills).

## Block 2 reflection (event visuals)

Shipped: an intro card per event (title, one line of crew advice, tone colour) over the back wall,
and a chip per active event under the top bar (seconds patched in place); power flicker dims and
stutters the whole room (`flickerDarkness`), busy machines spark, a ballast buzz repeats every
`BUZZ_TICKS` while it lasts; the inspector walks a fixed patrol with a clipboard, scribbles at
stops, mutters (or "Tsk tsk." near a mess), and the chip carries a scrutiny meter (wasted n/4,
floor %, "looking good / hmm… / would fail!"), then a PASSED/FAILED stamp card; the influencer has
a selfie-stick ring light that flashes the room, floating likes, and a "Posted! +2.5k followers"
card when served; rush hour lights a marquee board by the door. Stings: brassy run, "dun dun
dunnn", glitter gliss, ballast buzz, layered on the existing samples. Morning notes foreshadow
the day's drawn events (`EVENT_FORESHADOW`, sim/describe). Receipt: today's events, inspection
verdict with the fine, influencer bonus.

What could be better:
- The receipt's "today's profit" is sales + tips − rent, so a FAILED −$15 line or a +$10 bonus
  doesn't add up on the card. For Claude (economy): show profit net of fines and bonus, or label it.
- The inspector is render-only: they walk through baristas and the sim has no body for them.
- The intro card briefly covers the menu chalkboard; fine for 3 s, but a smaller card on narrow
  screens would help.
- Night-screen forecast for *tomorrow* isn't possible without the sim drawing the schedule a day
  early (it rolls at `startDay`, after night inputs). Kept to the morning note so the RNG order is
  unchanged. A forecast item ("Weather radio": see tomorrow's events) could be a night-shop card.

What's missing (deferred):
- The influencer's order ticket isn't marked in the Orders list yet (moved to B3 with the other
  customer kinds).
- A rush-hour "line out the door" visual when the queue is full.

Co-op fun:
- Shipped: the intro cards tell the crew how to split up ("one grinds, one steams, one serves"),
  and the inspector's "Tsk tsk." at a mess is a cue for whoever has the mop.
- Folded into B3: when the influencer is served, the whole crew strikes a pose for the photo
  (flash, sparkles over every barista, "Say latte!").
- Later: a "Weather radio" night card that reveals tomorrow's events, so planning becomes a team
  decision at the shop.

## Block 3 reflection (customer and bot personality visuals)

Shipped: customer tells drawn per kind in `Actors` (impatient stopwatch, foot tap and sweat drop;
group companions that leave as their drinks are served plus a ×N pill; regular's name tag with a
heart; influencer ring light from B2); ticket tags in the Orders list (`ticketTag`, part of
`ordersKey`); bots with a white "Name · bot" tag in their colour and a personality look and emote
(`botLook`: rookie NEW sticker + sweat drop, steady headphones + hum, veteran shades + espresso),
dashed crew avatars with a gear badge; away humans greyed with "· away" and z z z; a new sim log
entry `served` `{by, item, amount, kind, cid, perfect, left, name?}` (log only; `PERFECT_PATIENCE`
0.75) driving stacked serve toasts in the server's colour (max 4), confetti and "Perfect!",
hearts and "Ada's usual!", a bot's "Oops!", and the influencer group photo (flash, sparkles over
every barista, "Say latte!"). The old "+$" earnings pop is replaced by the toasts.

Performance: Scene + HUD update measured on the fixtures page (`cost.mjs`): median 0.3 ms per
frame, 0.5 ms with everything at once (p95 0.7 ms). Four headless browsers on software GL ran at
~9 fps both on `phase1-final` and on this block, so no measurable regression from the new layers.
Caps: 4 toasts, 140 confetti/heart/star bits, 80 chaos particles, 8 comic texts; idle Graphics are
not redrawn.

What could be better:
- With four people serving fast, the toast stack sits over the counter and can hide a drink on the
  pass for a moment. A side column (right of the counter) or merging "Ana ×3" would be calmer.
- Group companions are drawn once at arrival; a group that grew (it can't today) would not update.
- "Perfect" is a fixed 75 % patience: it may want tuning with the tester in B11.

What's missing (deferred):
- Emotes reacting to the game (a bot sweating harder in a rush, a veteran's thumbs-up after a
  perfect serve) rather than on a timer.
- Bot speech lines ("On it!", "Behind you!"): B5 bot personalities.

Co-op fun:
- Folded in now: a **teamwork!** cheer when one barista parks a drink on the pass and another
  serves it (`crewBursts` remembers who parked what), a **hat trick** shout-out for three perfect
  serves in a row, and the influencer **group photo**.
- Next: count hand-offs and perfect streaks per player for the week-end awards (B10: "Best
  passer", "Mr. Perfect"), and a crew high-five emote when a rush hour ends with nobody lost.

## Block 4 reflection (neighbourhood days)

Shipped: 12 seeded neighbourhood forecasts (`src/data/forecasts.ts`) in six families (calm, wet,
busy, quiet, money, hot) with weekday rules (Market only on Saturday, lazy Sunday only on Sunday,
exam week Mon–Thu, payday Thu–Fri, office closed / roadworks / commuter crush on weekdays).
`weekPlan(seed, week)` deals each week with its own seeded RNG (never touches `state.rng`), with
a backtracking search so no forecast repeats in a week and no family runs two days in a row (also
across Sunday → Monday). Forecasts feed `computeModifiers`: order tags (hot/iced), customer mix,
event odds, queue length, tips, patience, arrivals and a traffic shape over the day (slow start,
late crowd, lunch peak, morning rush). Events now draw their kind with the forecast's odds while
consuming the same single RNG draw, so event days still schedule exactly as before. The night
shop opens with **The Daily Grind** newspaper (headline, crew tip, expected walk-ins, hot/iced
split, likely event, rumour for the day after); the HUD shows a forecast chip. Save v4 with a
migration from v3, protocol v5. Quick fix in the same block: the receipt's profit includes fines,
bonuses and tab paid, with a net line.

Balance (20 weeks, `npm run balance`): mean final cash **$323.68**, loss rate **29.4 %**, 0/20
bankrupt, vs. baseline $334.78 / 28.9 %. A touch harder on average, well within noise.

What could be better:
- The paper's walk-in count is the base estimate; it does not yet include owned cards or
  reputation, so a strong crew sees "~11" and gets 16. Fine for planning, but could be exact.
- The bot crew ignores the forecast (it preps cold brew on a rainy day). B5's brain changes are a
  good place to make "prep for the paper" a bot trait.
- Forecast effects stack with scenario effects multiplicatively; a heat wave + "summer" scenario
  could push iced orders very high. Not seen in the tester, but worth a cap in B11 tuning.

What's missing (deferred):
- A weekly preview (the whole week's papers at Sunday night) for long-range planning.
- Forecast-specific decor in the scene (rain on the window, market stalls outside).
- Ordering supplies by forecast in the balance bot (it restocks to a flat target).

Co-op fun:
- Folded in now: the rumour line ("Day after: …") so the crew argues about whether to save cash
  tonight for tomorrow's market crowd; a crew tip on every paper.
- Next: let one player "read the paper aloud" (a ping on the paper that highlights it for everyone)
  and a stamp when the crew stocked what the paper suggested.

## Block 5 reflection (menu variety)

Shipped: four new drinks built from the existing stations in new combinations, all data-driven in
`src/data/drinks.ts` (recipes per station, `recipeChain`, `suppliesFor`, `DRINK_INFO` with icon,
ticket, blurb, order bias and patience). Iced latte = espresso shot into the tap (+milk); mocha =
latte back into the steamer (+flavour); matcha = empty hands at the steamer (+milk, +flavour);
maple cold foam = cold brew into the steamer (+milk, +flavour). Iced latte unlocks on day 3, mocha
on day 5; matcha and the special only via cards (Matcha whisk $25, Seasonal board $30), Cocoa tin
$15 brings the mocha early. Cards that would teach nothing are not dealt. One cheap new supply,
flavour pumps (starter bottle on first unlock, hidden until needed). Forecasts nudge the new
drinks. The bot brain derives its chains from the recipes, so bots make every drink. UI: recipe
chips on order tickets, a "New on the menu" banner the night before, a menu board with On/Off at
night, SVG + Pixi icons, spill tints. Save v5 (migration from v4: unlocked from the day, menu keys,
flavour 0, zeroed drink counts), protocol v6.

Balance (20 weeks, menu "all" so every drink is ordered as it unlocks): first run **$296.84 /
35.0 %** — too hard (the steamer is now shared by five drinks). Folded in a fix: fancy drinks buy
patience (iced latte ×1.15, special ×1.2, mocha ×1.3) and lower order weights for mocha/special.
Final: mean final cash **$310.22**, loss rate **32.5 %**, 0/20 bankrupt (B4: $323.68 / 29.4 %).
Slightly harder, by design a little: the menu is wider and more complex; not a cliff.

What could be better:
- The steamer is the new bottleneck (latte, mocha ×2, matcha, special). A second steamer card in
  B6 (or a "Dual wand" upgrade) is the natural answer and a good Speed-path card.
- The wall chalkboard in the scene still lists the three classics; it is drawn once. Make it
  redraw from the menu (deferred: needs a render-layer refresh hook).
- The "New on the menu" banner pushes the hand down on small screens; the hand scrolls but the
  cards can sit below the fold on 800 px tall windows. Consider a compact chip row.
- Balance bot restocks flavour to a flat 10; forecast-aware restock still deferred (from B4).

What's missing (deferred):
- Audio cue for a new drink (a little bell on the banner).
- Customers who ask for "the special" by name with a speech-bubble line.
- More seasonal specials rotating by week (pumpkin spice in a fall scenario).

Co-op fun:
- Mocha is a natural hand-off drink (one player pulls the latte, the other does cocoa), and the
  menu board lets the crew argue about turning the slow mocha off on a Market Saturday.
- Next: a "signature drink" vote at night where each player picks one to push (tips bonus).

## Block 6 reflection (upgrade cards)

Shipped: the catalogue grew from 19 to 52 cards, all data in `src/data/catalogue.ts`, each with a
`path` (speed / quality / reach), rarity and an optional `set`. 33 new cards across the three paths,
including a Second steam wand for the B5 steamer bottleneck, Roaster partner (rare), Pop-up stall
(rare, one day), and seven spicy cards whose downsides render in red (`splitEffects`). Eight sets in
`src/data/cardSets.ts`, each "own 2 → bonus", folded into `computeModifiers` after owned/tomorrow
cards; the card shows have/need, the bonus, and "Completes …" when buying it would finish the set.
New effect kinds: `quality` (reputation per day), `temp` (one-day rookie barista "Robin (temp)",
via `syncTemp`, removed at night, never past 4 players) and `reveal` (Weather radio). The radio
pre-rolls tomorrow's events with `drawEvents` (same RNG draws as `scheduleEvents`, so owning the
radio never changes what happens, proven over seeds 1–12) and the paper prints a radio line. Hand is
4 cards, at least two paths, cheap-card guarantee kept; paid re-roll ($5 + $5 per re-roll that
night, seeded, never re-deals the current hand or tonight's buys). Save v6 (migration: rerolls 0),
protocol v7. 469 tests (+22).

Balance (20 weeks): mean final cash **$293.55**, loss rate **34.3 %**, 0/20 bankrupt (B5: $310.22 /
32.5 %). About 5 % less cash; not a cliff. Checked the obvious suspect: a tester that skips spicy
cards does *no* better ($280.50 / 33.2 %), so the spicy cards are fair trades; the dip comes from the
smaller, wider hand (4 of 52 instead of 5 of 19, so the tester's "cheapest permanent" rule lands on
weaker Reach/Quality cards more often). Real players pick; left as is.

What could be better:
- The balance bot buys blindly (cheapest permanent). A path- and set-aware buyer would measure the
  real ceiling; it should also try re-rolls and the radio.
- Hire-a-temp at $35 competes with re-rolls on early nights; in Playwright, four re-rolls left too
  little cash to hire. Consider $30 or a re-roll cap note.
- The radio's day-1 report is always "a quiet day" (the grand opening has no events) — true but dull.
- Card faces are dense at 800 px tall: set box + flavour text can clip. A hover/expand view would help.
- Synergy is only pairs. Three-of-a-set tiers would make long runs more interesting.

Deferred:
- Selling or scrapping owned cards; card upgrades (level 2); a "locked" card you can hold to next night.
- Per-player hands / voting on buys (everyone currently shares one hand).
- Radio accuracy upgrades (exact times) and a rumour-busting card.

Co-op fun:
- Re-rolls are a group argument ("one more roll!") with a visible, rising price, and sets give the
  crew a shared plan across nights ("we need one more Cold bar card").
- The temp is a fun surprise: a fourth body at the counter for one hectic day, then gone.

## Block 7 reflection (daily challenges + day curve)

Shipped: 15 optional daily goals in `src/data/challenges.ts` (perfect serves, floor %, no
storm-outs / spills, serve N, sell N of a drink, clear before grace, serve the influencer). Dealt
1–2 per night onto the paper (`dealChallenges` at `startNight`, pruned after events at `startDay`),
tracked live on HUD chips, settled at closing for a tip + `challenge.won` log / cheer. A soft
day-of-week curve (`DAY_CURVE`) multiplies traffic and patience and shifts 0/1/2-event schedule
weights so Mon is a warm-up and Sun is the finale, stacked on the existing week ramp. Challenge
deals use a derived RNG (seed ⊕ day) so they never perturb event / radio / customer draws. Snapshot
v7 (`challenges: []` migration) / protocol v8. 481 tests (+12).

Balance (20 weeks): mean final cash **$338.38**, loss rate **36.9 %**, 0/20 bankrupt (B6: $293.55 /
34.3 %). Cash up ~15 % (challenge tips + slightly softer early-week traffic), loss rate up ~2.6 pp
from the late-week squeeze. Day 1 cash in the sample weeks is healthier; day 7 still pays without
bankrupting the bot. Left as is — the curve is doing what it should.

What could be better:
- Challenge pool on day 1 is only three goals; a couple more warm-up goals (e.g. "serve 6", "buy
  one supply") would keep the paper from feeling samey across opening weeks.
- Floor challenges start `have` at 100 and watermark down; a day that never ticks (test shortcuts)
  can free-win at settle. Fine in real play; worth a "touched" flag if we ever skip days.
- HUD chips don't celebrate the win with the B3 cheer / confetti yet — just a ✓. Wire into the
  juice pass (B9).
- The balance bot ignores challenges (never steers toward them), so the tip income is a lower bound
  of what a crew chasing goals would earn.

Deferred:
- Multi-day / weekly meta-challenges ("hit 3 daily goals this week").
- Player-picked challenge from a larger offered set.
- Difficulty options that scale or disable the day curve.

Co-op fun:
- Optional goals give the crew a shared plan for the day without punishing a miss, and the receipt
  tick is a nice group high-five. The Sunday finale curve makes "we survived the week" land.

## Block 8 reflection (Easter egg pack 2)

Shipped all six approved gags in `src/data/eggs.ts` + `src/sim/eggs.ts`:
- **Shop cat** — rare nap on espresso/steamer after a brew; blocks the station; pet/shoo or wait.
- **Name mix-ups** — rare mangled cup name on a regular; they refuse the first serve until remade
  or you correct the name at the counter (empty hands).
- **Wi-Fi camper** — rare day≥2 arrival who takes a seat, never orders; quiet leave or polite kick.
- **Burnt beans / smoke** — espresso left on the machine too long → soft alarm + smoke puff; dump
  the shot to clear (one waste).
- **Latte art fail** — rare steamed drink gets a floating 2★ review card and a tiny tip joke.
- **Secret menu** — type FOAM or UUDDLRLRBA to unlock today's special as "🦄 Unicorn foam"; first
  serve pays a small bonus tip.

Egg rolls use a derived RNG (seed ⊕ day ⊕ tick ⊕ salt) so they never perturb customers / events /
bots — same pattern as B7 challenges. Snapshot v8 / protocol v9. Light visuals (cat loaf, smoke
puffs, laptop bubble, wrong-name tag, comic bursts) and cue ids wired to existing synths. 493 tests.

What could be better:
- Cat / smoke / camper are one-shot per day; a second gentle roll late-day could keep long days
  funny without stacking pressure.
- Secret menu forces `special` onto the unlocked list for the day — fine mechanically, but the
  silly label is only in the log/burst today; HUD drink name still says "Special".
- Latte-art tip is paid even when the drink later goes stale on the pass (the gag fires at finish).
- No dedicated meow / smoke synth yet — reused oops/buzz/hmph.

Deferred / didn't fit cleanly:
- A "pet the cat" happiness buff (kept shoo-only so the gag stays optional).
- Camper ordering after being ignored long enough (kept never-orders).
- Multiplayer-only secret codes per seat.

Co-op fun:
- Catching the cat, correcting "Kennedee", and kicking the camper are great shared bits; the secret
  code is a table-side whisper. None of them punish a busy crew hard enough to sink the day.

## Block 9 reflection (juice pass)

Shipped as client-side juice on top of B3 cheers — no save/protocol bump (vibe and combo live in
`CrewMemory` like the hat-trick streak):
- **Combo streaks** — perfect serves *and* pass hand-offs share one counter; hat-trick at 3, then
  every 3 (`STREAK_AT`). Resets on slip, storm-out, bot oops, trash, name-mix refuse, or a non-perfect
  serve.
- **Screen punch** — `Chaos.punch` jolts the stage on streak / teamwork / storm / challenge / selfie.
- **Particle bursts** — denser confetti + sparkles on perfects, combos, challenges; FX bits capped at
  100 (was 140); chaos particles already capped at 80.
- **Fail feedback** — pops for storm-outs (`today.lost` delta), slips, dumped drinks, wrong-name
  refuse; challenge wins get a cheer + confetti (closes the B7 HUD gap).
- **Crew vibe meter** — 0..100 on a HUD pill (Buzzing / Steady / Rough) with a combo ×N chip when
  the streak is ≥2.

493→~502 tests (+3 juice). Determinism untouched (visual-only).

What could be better:
- Vibe is per-client memory, so a late joiner starts at 55 mid-day; fine for friends, not for a
  shared scoreboard.
- Storm detection via `today.lost` can fire when the queue is cleared at closing — a tiny "closing
  flush" suppress would quiet that.
- Wrong-*order* (serving the wrong recipe) still isn't a distinct fail; trash is the proxy.
- Particle look is still simple dots/stars; a dedicated juice sprite sheet would sell the punch.

Deferred:
- Shared host-authoritative vibe (would need a snapshot field).
- Accessibility option to reduce motion / disable screen punch.
- Per-player vibe contributions in co-op.

Co-op fun:
- Hand-off combos make parking a drink for a teammate feel as juicy as serving it yourself, and the
  shared vibe meter is a quick glance at "are we cooking or are we drowning".

## Block 10 reflection (local stats + end-of-week awards)

Shipped:
- **Per-player crew stats** (`src/sim/stats.ts`, `state.crew`): serves, perfect, tips brought in,
  hand-offs, slips, messes, mopped, espressos, collapses, rescues (rogue remakes + fixed name
  mix-ups), cat pets, campers shooed, alarms stopped, binned, cards bought, re-rolls, idle. They're
  counted from the sim log on every tick, before `pruneLog` (the log only keeps 120 ticks, so
  nothing can be worked out afterwards). Drop logs and `rogue.remade` now say who did it (`by`).
- **Awards ceremony** on the week-end screen (`src/sim/awards.ts`, `src/ui/weekEnd.ts`):
  - A Crew MVP podium, then up to 9 more trophies: Speed Demon, Slip King, Mop Hero, Caffeine
    Gremlin, Hand-off Hero, Cat Whisperer, Agent of Chaos, Customer Whisperer, Frequent Flyer,
    Wi-Fi Bouncer, Fire Marshal, Latte Laureate, Tip Magnet, Bin Diver, Shopaholic, Professional
    Gambler, and Best Supporting Bot.
  - Every person who goes home without a trophy gets a deadpan joke award (Professional Statue,
    Vibes Manager, …).
  - There's a "walked out %" chip and a **Copy awards for the group chat** button.
  - The card is two columns (about 940 px wide) and fits 1280x800 without scrolling.
- **Lifetime records** (`src/storage/recordsStore.ts`, key `cafetycoon.records`, `src/ui/records.ts`):
  - Best week, busiest day (most served), best day profit, weeks run, longest run, walked-out %,
    lifetime totals, a hall of fame and recent MVPs.
  - Opened from a 🏆 Records pill beside Roadmap on the title screen.
- Snapshot v9 (a migration adds an empty `crew`); protocol v10.

Decisions (made overnight, Kennedy can overrule):
- Stats cover the **whole run**, not just a week, because the week-end only happens once (after day
  7) and unlimited play keeps going.
- Bots get stats and can win trophies, but the **MVP always goes to a person**. Bots get "Best
  Supporting Bot" instead. MVP score = serves×3 + perfect×2 + hand-offs×2 + mopped×2 + rescues×3 +
  alarms×2 + campers − messes.
- Nobody holds **more than two trophies** (MVP included), and the award list order is the
  priority. That keeps the ceremony on one screen and spreads the glory around, so a strong player
  can lose "Latte Laureate" to the runner-up.
- Records live **per browser**: peers record the week too, so everyone has their own wall. A run
  counts once (keyed by seed and host); stopping later only adds the new days. Joke and bot awards
  stay out of the hall of fame.
- Saves migrated from v8 start counting from the moment they're loaded, so their earlier days
  don't credit anyone.

504 tests (+8: stats, awards, records).

What could be better:
- Ties go to whoever joined first. A shared trophy ("Ana & Ben") would feel fairer.
- "Speed Demon" is really "most serves", not speed. Per-serve timing would need a new log field.
- Records are lost if you clear the site data, and there's no export or import.
- Idle is tracked but not used for anything yet. A "Professional Statue" award based on real idle
  time could replace the random joke award.

Deferred:
- Per-day awards on the closing receipt ("today's Slip King").
- An award screenshot or share-card generator.

Co-op fun:
- The ceremony is the screenshot moment. It's built so everyone gets named, the clumsy friend is
  crowned Slip King, and the copy button drops the whole list into the group chat.

## Block 11 reflection (balance pass + telemetry)

Shipped:
- **A smarter balance tester** (`scripts/balanceCore.ts`, `npm run balance -- --policy smart`).
  Night policies: `smart` (default), `simple` (the old cheapest-permanent buyer), `speed`,
  `quality`, `reach` and `none`.
  - Smart follows the path it already owns most of and values set completions and the third card of
    a set. It hires the temp from day 4 and buys the radio early.
  - It re-rolls when the hand is weak and there's spare cash, keeps a rent reserve, and scales
    restocks by the forecast's traffic.
  - `--compare policies` runs every policy on the same seeds. `--summary` prints a per-policy table
    (score, loss %, loss by day 1..7, re-rolls, challenges won) and a card ownership vs score table.
    `scripts/balanceSummary.ts` merges JSON reports from parallel runs.
- **Three-of-a-set tier** (B6 note). Every set has a third-card bonus on top of the pair, for
  example Espresso bar gives espresso a further ×1.08. Card faces say "Fills the X set!", "X ✓ full
  set" and name the bonus.
- **Fittings count in the score.** The week's score is now cash profit plus the permanent cards at
  half price (`ECONOMY.fittingsResale`). The week-end money split shows a FITTINGS column.
- **Economy tuning:**
  - Permanent cards costing $20 or more are 20% cheaper (rounded to $5).
  - Hire-a-temp costs $30 (B6 note).
  - Base patience is 33 s (was 25).
  - The day-7 finale curve is traffic ×1.3, patience ×0.8 and event bias 0.22.
- **Radio** (B6 note). A quiet report now has character: an opening-day line, or one of three lines
  that rotate by day (deterministic).
- **Card faces at 800 px tall** (B6 note):
  - The hand grid rows now size to their content, which fixes text spilling out of tall spicy
    cards. That was a real bug.
  - Below 820 px tall, flavour text is clamped to two lines and hidden when a set box needs the
    room. The full text stays in a tooltip.
  - The art is slightly shorter.
- **Telemetry summary:** forecasts per day, challenges dealt and won, re-rolls per night, egg
  counts, awards with winners, and the score. Snapshot rows no longer carry the sim log (it's
  already recorded row by row), which keeps files small.
- Protocol v11, because rules and costs changed and mixed builds would disagree. The snapshot
  shape didn't change, so it stays at v9.

Balance numbers (56 seeds; 2 humans, 1 bot, skill 3, pace 3; `/workspace/overnight/b11/r4*.txt`):

| policy  | score  | mean cash | loss  | profitable | loss by day 1..7     |
|---------|--------|-----------|-------|------------|----------------------|
| smart   | 291.10 | $272.26   | 27.7% | 100%       | 12/19/24/30/30/37/33 |
| simple  | 347.90 | $386.20   | 28.4% |            |                      |
| quality | 370.10 | $362.37   | 24.2% |            |                      |
| reach   | 313.67 | $347.02   | 30.5% |            |                      |
| none    | 347.07 | $447.07   | 31.0% |            |                      |

- Three bots alone (smart): score 191, loss 35.8%, profitable in 96% of weeks.
- Hard settings (skill 2, pace 4): score 276, loss 37.3%.
- Before tuning: smart lost 35% of customers and buying nothing lost 38.8%. Buying nothing also
  out-scored smart by about $200.
- B7 baseline: $338 and 36.9% lost.

Decisions:
- **Buying nothing was the dominant strategy.** Fixed with fittings resale, cheaper cards and
  higher patience. "None" still banks the most *cash*, but it now loses more customers than any
  buyer, and quality and simple out-score it.
- The day curve now reads as a warm-up (12% lost on day 1) and a finale (33–37% on days 6–7).
- **No dominant card:** ownership lifts are within about ±$90 and confounded (rich runs buy more).
- Smart re-rolls 2.9 times a week. Its score trails simple and quality because it spends more on
  re-rolls and temps, which aren't resold. That's acceptable: the targets are "winnable but tight"
  and "no dominant strategy", not "the tester maximises".

What could be better:
- Bot crews aren't station-limited, so speed cards barely help them. The sim undervalues the speed
  path, and human playtests should judge it.
- The tester doesn't react to events mid-day, or use the radio beyond buying it.
- Card lift analysis needs a controlled experiment (force-own one card) rather than correlation.

Deferred:
- A force-own `--card X` A/B mode in the balance CLI.
- Hover or expand to read full card text at small heights.

Final-code check (8 seeds per policy, `/workspace/overnight/b11/bal/r5.txt`): smart 319.77 / 26.6%,
simple 356.70 / 27.9%, speed 318.87 / 24.4%, quality 422.88 / 24.1%, reach 307.18 / 29.8%, none
361.03 / 30.7%. Quality leads on a small sample (370 vs 348 for none over 56 seeds). Watch it in
playtests; a nerf of Quality's reputation cards is the first lever if it holds.

## Block 12 reflection (Phase 2 integration, 2.0.0)

Shipped:
- **Version 2.0.0**, baked into the build from `package.json` (`__APP_VERSION__`). It shows at
  the bottom of *Past runs & controls* and as `window.cafetycoon.version`.
- **A real Phase 1 save fixture** (`src/storage/phase1-save.fixture.json`, a v3 envelope from
  `phase1-final`). A test loads it, plays night → day → night, scores the run and re-saves it at the
  current snapshot version.
- **`?link=local`** (`src/net/localLink.ts`): a dev-only BroadcastChannel room link, so several
  tabs of one browser can play a real room without WebRTC. The default is still Trystero/nostr.
- **A perf probe** (`scripts/perf4.ts`, `npx tsx scripts/perf4.ts`): a week with four stand-in
  baristas, timing `step()` and measuring snapshot size.
- Docs: a "What's new" section in the CHANGELOG, README, ROADMAP (Phase 1 and Phase 2 done, Phase
  3 next) and `public/roadmap.json`. R (drop) is in the controls help.

Review findings:
- **Determinism:** there's no `Math.random`, `Date.now` or `performance.now` in `src/sim` or
  `src/data`. Every draw goes through the seeded RNG.
- **localStorage keys:** all of them are `cafetycoon.*` (audio, history, records, roadmap.seen,
  room, room.host, room.peer, run, seat.*, settings, tab). They don't conflict.
- **Sync:** four local-link tabs stay within about 12 ticks (≈0.2 s at 60 Hz) of the host.
- **Perf** (4 baristas, a 120 s day, a whole week): `step()` takes p50 0.10 ms, p99 0.26 ms and at
  most 6.6 ms. Snapshots average 8.5 KB and peak at 11.3 KB of JSON. There are at most 6 customers
  on screen.
- **Bandwidth:** 20 Hz × 3 peers × about 8.5 KB comes to about 510–680 KB/s (4–5 Mbit/s) of host
  upload. That's fine on home broadband but heavy on a phone hotspot.

Decisions:
- **This box's Chrome has a managed policy** (`WebRtcIPHandling: disable_non_proxied_udp`). WebRTC
  gathers no ICE candidates, so real-network rooms can't connect here. I didn't override the
  policy. Instead I added the local link, which uses the same sim and messages with a different
  transport. Real-network play is left for the human game night.
- The multi-tab playtest caps animation frames in the harness, because software GL can't draw four
  Pixi canvases. That's a test-only change; the game itself is unchanged.

Deferred:
- Delta or binary snapshots, or a lower peer snapshot rate, to cut host upload. This is the first
  lever if game night shows lag.
- A real-network smoke test from a machine without the WebRTC policy.
- Phase 2's game night and the telemetry review carry over (see ROADMAP).

Playtests (built game, Playwright, `/workspace/overnight/b12/`):
- **Host + 3 peers** (4 tabs, `?link=local`, 60 s days, every tab mashing keys). Peers stayed 0–12
  ticks behind the host and there were no page errors. Four random key-mashers serve nobody, so
  the café missed rent after day 2. The missed-rent screen, the awards (all joke awards) and
  Records showed correctly on every tab (`week-4p/`).
- **Solo with 2 bots** (60 s days). A full week reached the week-end ceremony with no page errors.
  Days served/lost: 9/0, 10/4, 6/2, 6/4, 7/5, 2/14, 3/6. The bots served 43 between them. The
  harness didn't keep milk and cold brew stocked, so day 6 ran dry (`week-solo/`).
- **Bug found and fixed:** after the last day or a missed rent, the day's receipt ("On to the night
  shop") was stacked under the week-end screen. It now only shows when night follows.
- **Harness lesson:** every tab gets the closing receipt each night and has to dismiss it. In the
  first runs, the blocked clicks looked like hangs.
- **Layout:** 1280x800 and 1920x1080 (`layout/`) show no overflow. The title shows v2.0.0.
  - At 1920x1080 the right column leaves a gap between Floor and the Menu board. That's cosmetic
    and deferred.

## Hotfix 2.0.1 reflection (lighter network updates)

- **What shipped.** `src/net/delta.ts`: a structural JSON patch (`r` replace, `o` object keys and
  deletions, `a` array slots plus length) diffed against what the peers already hold, with floats
  rounded to 3 decimals on the wire. The host sends a keyframe on join, on a peer's `resync` and
  every 100 sends (5 s); everything else is a `snapd` delta. Protocol 11 → 12 (`seq` on `snap`,
  new `snapd` and `resync` actions); an old tab gets the usual "different version" message.
- **Numbers (scripts/perf4.ts, a 4-barista week, 20 Hz):** full snapshot avg 8,676 B → delta avg
  744 B (keyframes included), max single delta 3.9 KB. Host upload with 3 peers 4.16 → 0.36 Mbit/s.
  Diffing costs about 0.1 ms per send on the host. Days played identically (same served/lost).
- **Where the bytes were:** `players` (3 KB, mostly bot brain fields, changing every tick),
  `stations`, `customers` and `pass`. Static data (`days`, `crew`, `owned`, `menu`, forecast…) was
  about half of every snapshot and now goes only when it changes, which falls out of the diff for free.
- **What went well.** A generic diff instead of hand-picked fields means new state in Phase 3 is
  covered with no extra work. The end-to-end host → peer test drops a delta mid-day and checks the
  peer heals via `resync`.
- **What to watch.** A rewritten array is sent whole when that is smaller; bot `path`/`plan` arrays
  are the biggest remaining churn. If a bigger café pushes deltas up, strip bot brain fields
  (render never reads them) before diffing. Real-network P2P is still untested from this box.

## P3 Block 01 reflection (barista roles)

- **What shipped.** `src/sim/roles.ts`: Chef, Creator, Host and Manager, each a perk paired with a
  weakness, as plain multipliers in one table (machine time, walk speed, tips, a flat craft bonus,
  restock cost). A `role` input is night-only and one-holder-per-role, so two baristas can't race
  for the same role. The four roles hook into existing code paths (stations, movement, customers,
  night restock), so they need no new state beyond `Player.role`. Save v10 (no-op migration),
  protocol v13.
- **Checks.** Six new tests (pick/swap/drop, day lock and validation, machine time, tips and craft,
  Manager discount, walk speed): 529 tests in total. A 3-tab local-link run picked three roles
  from the night screen; the night sync check (now including roles) said `same` on every tab.
- **What went well.** The perks are visible numbers, which leaves the strategy decision to the
  players. A Host on the register and a Chef on the machines is an obvious plan, but the Chef's
  tip penalty punishes a Chef who also runs the pass.
- **What to watch / deferred.**
  - Bots never take roles; when bots become hired staff (B15) they could come with one.
  - The role list makes the night's left column longer. At 1280x800 it scrolls under Restock.
    A compact two-column grid would fit better once pricing (B2) adds more to that column.
  - The balance numbers are first guesses. A playtest should show whether the Creator's
    +$0.75 beats the Host's +50% tips at higher prices.

## P3 Block 02 reflection (per-item pricing)

- **What shipped.** `src/sim/pricing.ts`: `priceSteps` per drink ($0.25 a step, −4…+8), a
  `price` night input, and three demand levers taken from the price ratio (new price over list
  price):
  - the drink's order weight scales by ratio^−1.8 (clamped 0.25–1.8);
  - walk-ins scale by the menu's weighted demand;
  - patience moves by 0.6 × (1 − ratio) (clamped 0.7–1.25).

  The night menu board shows the price, the change, the expected orders with their %, and the
  profit per drink, with a total line. The newspaper's walk-ins follow the prices. Save v11,
  protocol v14.
- **Determinism.** No new RNG draws. With no steps every factor short-circuits to exactly 1, so
  un-priced runs replay identically, and all of the earlier tests pass unchanged. One VM test now
  maps the menu lines back to {drink, on}.
- **Checks.** Six new tests (input, clamping and day lock; identity at list price; mix shift and
  patience; the served price; fewer seeded walk-ins on a pricey menu; the forecast numbers):
  535 tests in total. A 3-tab local-link run set the prices from a peer's night screen; all
  tabs agreed.
- **What went well.** The forecast reuses the same functions as the sim, so the night numbers
  can't drift from what happens in the day.
- **What to watch / deferred.**
  - The forecast ignores group extras and rounds small numbers, so on short days "~3 orders"
    is coarse. Playtest whether players trust it.
  - The chalkboard menu on the café wall (render) still shows list prices. It's decorative, so
    deferred.
  - Elasticity of 1.8 makes a raise lose money over a whole menu, but a raise on one drink can
    win: steady regulars (B3) should be less price-sensitive, and that is where pricing gets
    its depth.
  - The night's left column is getting long (Restock, Roles, Menu board). A tabbed or two-column
    layout is worth doing before B7's menu designer.

## P3 Block 03 reflection (regulars with favourites)

- **What shipped.** `src/sim/regulars.ts`: loyalty from 0 to 5 hearts on each regular.
  - A fair serve earns +1 heart (fair means at most 6% over list, so one $0.25 step on a $4+ drink).
  - Each heart adds 8% to the regular's tip.
  - A gouge (half tip at 25% over) costs a heart, and so does a storm-out or the favourite being
    off the menu at close.
  - The night screen shows a Regulars board with hearts and an off/pricey warning, and the menu
    lines show "♥ Ada" on that regular's favourite.
  - Save v12, protocol v15.
- **Checks.** Four new tests (loyalty cap and the tip it pays; gouge and the fair edge; storm-outs
  and off-menu days; the night VM and fans): 539 in total. Balance sim over 10 seeds: mean final
  cash 291.59 → 283.62, loss rate 27.2% → 27.5%, 0 bankruptcies in both. That is within seed
  noise; the change is the tip, which moves cash, so the bots' later buys diverge.
- **What went well.** Pricing (B2) and the regulars now pull against each other: raising the
  latte costs June's hearts. That is the "choices over repetition" Kennedy asked for.
- **What to watch / deferred.**
  - Hearts never make a regular leave for good. A "lost regular" at 0 hearts after N misses
    could raise the stakes, but it's a balance question for the integration block.
  - Regulars are still immune to the B2 demand curve: they come for the favourite anyway. That's
    intended, but it's worth saying so in the PLAYTEST_GUIDE.
  - The night left column now has Restock, Roles, Regulars and Menu board. It needs the
    two-column or tabbed layout soon (noted under B2).

## P3 Block 04 reflection (tabbed night board, supplies that spoil)

- **What shipped.**
  - The night board is tabbed: Shop / Menu & prices / Crew & roles / Regulars / Paper. The tab
    state lives in the UI only (no sim or protocol change) and survives rebuilds.
  - `src/sim/spoilage.ts`: milk 30% and pastries 50% of leftovers go off at closing (floors, no
    RNG); a Manager ×0.5; a `spoil` effect and the Walk-in fridge card ×0.4.
  - Pastries are a new supply sold on the side with a served drink (seeded 35% roll, only when
    the case is not empty, so runs without pastries keep the exact same RNG stream).
  - The night board shows what went off and the share per fresh row. Save v13, protocol v16.
- **Checks.** Six new tests (spoil shares; Manager and fridge; pastry sales deterministic and
  capped by stock; RNG untouched with no pastries; night VM; v12→v13 migration): 545 in total.
  Balance over 10 seeds: mean final cash 283.62 → 288.48, loss rate 27.5% → 25.6%, 0 bankruptcies.
  Pastry sales roughly pay for the extra milk waste, so it's within noise.
- **What went well.** The tabs fixed the overlong left column without touching the sim, and the
  fresh-stock trade-off is visible right on the restock row where the decision is made.
- **What to watch / deferred.**
  - The weather-radio test assumed the deal consumed a fixed amount of RNG. A new card broke
    that, so the test now holds the deck equal. Dealing from its own seeded stream would make
    this robust; that's a candidate for the integration block.
  - Pastries have no station or art beyond the jar colour; a counter case sprite would help.
  - There's no over-order warning yet. The night warnings only flag running out.

## P3 Block 05 reflection (recipe accuracy)

- **What shipped.**
  - `src/sim/accuracy.ts`: cups carry sloppy marks (`Player.cupSlips`, `Station.cupSlips`,
    `PassItem.slips`). Three marks: rushing (empty-handed E in the last 40% of a run takes the
    drink now), left sitting (picked up more than 8 s after `Station.doneAt`), and fumbling (a cup
    offered to an idle station that has no recipe for it). Stars = 3 − marks.
  - Stars multiply the tip, tally `today.cups`, `today.cupStars` and `today.perfectCups`, and at
    closing the rating moves by −0.15 × (3 − avg). It is never a bonus, so careful play costs
    nothing it had before. There's no RNG anywhere in the block.
  - UI: stars on the served toast, a receipt line with a tooltip explaining the three marks, and
    the hand hint ("Rush it out now (−1★)", "sat too long, −1★", "Wrong station: E fumbles it").
  - Save v14 (busy machines get a `busyTotal` so they can still be rushed), protocol v17.
- **Checks.** Seven new tests (scoring maths; perfect cup; rush window; sitting and marks
  following the cup; fumble; pass carry, tip, rating and receipt; migration), with two existing
  expectations updated: the perfect-cup tip and the wrong-station hint. 552 in total.
  Balance over 10 seeds: mean final cash 288.48 → 291.28, loss rate 25.6% → 25.4%, 0 bankrupt.
  The bots never rush or fumble (they only press E on a ready output with a valid recipe), so
  they earn the ×1.05 perfect-cup tip almost every time. That's within noise.
- **What went well.** The tension is spatial and immediate: you're standing at the machine,
  the hint tells you that you could rush it now, and you choose. Nothing new to learn at night.
- **What to watch / deferred.**
  - The bots are always careful. A "hurried" bot personality that rushes when the queue is long
    would show the trade-off in solo games.
  - The 8 s sitting window is generous on purpose. Playtests should tell whether drinks left
    sitting happen at all in 3–4 player crews.
  - There's no star mark on the held cup sprite yet; the hint and toast carry it for now.

## P3 Block 06 reflection (taste map)

- **What shipped.**
  - `src/sim/taste.ts`: five twists, with `comboStars(seed, drink, twist)` as a pure integer
    hash that shuffles the ladder [5,4,3,2,1] per drink. It makes no RNG draws, so runs without
    twists are byte-identical to before (there's a test for that), and peers agree without syncing
    the map.
  - New state: `GameState.twists` (the night choice per drink) and `GameState.tasteBook`
    (discovered stars, keyed `drink:twist`). New input: `{kind:'twist'}`, night-only, humans only,
    and validated.
  - At serve, `serveCombo` records a discovery (`today.combosFound`), adds stars − 3 to
    `today.comboStarSum`, and charges $0.20 (`today.twistCost`, now subtracted in `profitOf`).
    The tip is ×`TASTE.tip[stars]`, and closing adds the capped `comboRating`.
  - UI: twist chips under each menu-board row (icon and name, with ★★★★☆ or "?"), an explainer
    line, receipt lines ("New combo: 🌼 Vanilla latte ★★★★★", "Twists −$2.80"), and the toast
    suffix.
  - Save v15 (no-op migration from 14), protocol v18.
- **Checks.** Five new tests: the ladder is a permutation and pure, and differs across seeds; the
  input is night-only and validated; first-serve discovery, tip and cost; the rating cap, the
  notebook and the receipt; no-twist determinism. 557 in total. Balance over 10 seeds is
  unchanged at 291.28 / 25.4% / 0 bankrupt, because bots never set twists. That confirms the
  plain path didn't move.
- **The economics by hand** (average tip about $0.90 a cup):
  - A 5★ combo nets about +$0.16 a cup, plus up to +0.25 rating a day.
  - A 1★ flop nets about −$0.47 a cup, and some rating.
  - Picking blind averages about −$0.17 a cup.
  - So exploring has a real price and finding the hit pays back over a run. That's the "plan,
    don't grind" choice the phase is after: test one twist on a low-volume drink, or commit a hit
    to your best seller.
- **What to watch / deferred.**
  - Bots don't use twists. A night-planner bot could adopt the best-known combo for solo runs.
  - Cash gains are small next to the rating lever. If playtests shrug, try a 5★ tip of ×1.6 or a
    regulars' "favourite combo" hook.
  - The chips are dense at 1280×800 (six per drink). A collapsed "notebook" popover might read
    better once more drinks unlock.
  - There's no hint on the day screen showing which twist is on. The toast is the only in-shift
    cue.


## P3 Block 07 reflection (signature drink)

- **What shipped.**
  - `src/sim/signature.ts`: the `SIG` tuning table, plus draft cleaning, the ask share, the
    premium, `applySignatureInput` (night-only, humans only, unlocked drinks; `since` resets only
    when the base or twist changes), `signatureServed` and a capped `sigRating`.
  - New state: `GameState.signature {name, drink, twist, premium, since}`. New input:
    `{kind:'signature'}` (null retires it), validated. New day stats: `sigServed`,
    `sigStarSum`, `sigBonus`.
  - Customers: a single non-regular walk-in draws one extra RNG value, but only while a
    signature exists and its drink is on the menu. On a hit, the first drink becomes the
    signature and the customer is tagged `sig`. With no signature the RNG stream is untouched.
  - Serving a signature cup charges the premium, forces the signature twist (`serveCombo`
    override, so the house twist on that drink is independent), and adds the star bonus to cash
    and to `today.bonus`.
  - UI: the signature card at the top of the menu tab (name, base, twist with known stars,
    premium −/+, Save/Update, Retire, and "~N asks tomorrow"). The draft lives in the closure, so
    re-renders don't eat typing. Also a receipt line and the name on crew cards.
  - The 1★ risk lever: tips are now [–, ×0.55, ×0.85, ×1, ×1.2, ×1.45].
  - Save v16 (no-op migration), protocol v19.
- **Checks.** Four new tests (561 total): the design input, the asks share, the sale with bonus
  and receipt, and the rating cap.
  - Default balance is unchanged at 291.28 / 25.4% / 0 bankrupt (bots don't touch signatures).
  - A new `--policy taste` balance bot explores one untried twist per night, keeps a known 4–5★
    one, and makes the best known ≥4★ combo a "House special" at a +$1 premium. Over 10 seeds it
    gets mean cash 294.35, score 334.35 vs 319.53, and a 28.1% loss rate vs 25.4%. So the taste
    and signature layer pays a little, and early exploring costs a few days. That's the intended
    shape.
- **Deferred.**
  - **Hurried bot personality: not done.** The cheap route is a `settings.hurriedBots` toggle,
    so personality assignment isn't touched. In `brain.ts` `take`, the bot pulls a cup early under
    pressure once `busyTicksLeft ≤ busyTotal × ACCURACY.earlyShare`, which costs it a star. It's
    left for a quiet block because it needs sanitizeSettings and a settings UI row.
  - Only one signature at a time and one twist per signature. "Twist(s)" stacking would need a
    combo ladder over pairs.
  - The fixture harness renders night with no `extras`, so the header always says "Opening
    night · Day 0". That's cosmetic and only happens in the dev harness.
  - Mobile (390 wide): the night tabs become a narrow side rail and the menu board is squeezed
    into it. That predates B7, but the signature card makes it worse. It needs a stacked mobile
    night layout.

## P3 Block 08 reflection (taste seasons)

- **What shipped.**
  - `taste.ts`: `seasonOf(day)` (3-day seasons) and `seasonStarts(day)`. `comboStars` now takes a
    `day` (default 1, so season 0 and every B6 test are unchanged).
  - The season ladder is built from the base ladder. For each season k it swaps the reigning 5★
    with a hash-chosen 4★ or 3★. Everything is a pure integer hash with no RNG, so peers agree
    without syncing it and runs without twists are untouched.
  - `risingTwist` names the new hit. `knownStale` compares `GameState.tasteSeason[key]` (absent
    means season 0) with tomorrow's season.
  - On serve, a stale entry is re-learned: new stars and season, and it's listed in
    `combosFound` again.
  - UI: a grey `~` on stale chips with a "last season" tooltip, "(last season)" in the signature
    twist picker, a taste column in the paper (two nights out, then the night before with one
    drink's riser named), and an updated explainer line.
  - Save v17 (no-op migration: old entries read as season 0, which is correct), protocol v20.
- **Checks.**
  - Four new tests (565 total): the season maths; the ladder invariants over seeds (a
    permutation each season, the 5★ moves every season, the riser is named correctly, the flop
    stays put, day 1 equals B6, the old hit only slips to 3–4★); stale marking and re-learning; the
    paper line timing.
  - Default balance is unchanged at 291.28 / 25.4%.
  - The taste bot, which keeps a stale 4–5★ until it re-learns, drops from 294.35 / score 334.35 (B7)
    to 287.30 / 321.80, with loss 28.8%. Seasons cost a complacent crew about 12 score points
    over a week, and the layer still edges the smart bot (319.53). That's the size of nudge
    intended: worth reading the paper, not a punishment.
- **Deferred / watch.**
  - The bot doesn't read the paper. A smarter planner would switch to the named riser on turn
    night.
  - Seasons are fixed at 3 days. A "short seasons" difficulty or event card ("Food blogger: tastes
    turn tonight") would be easy to add.
  - The signature isn't warned specifically when its combo goes stale. A receipt line ("Your
    signature tasted ★★★ this season") would make the cause and effect clearer. B9's rival
    pressure makes this more relevant.

## P3 Block 09 reflection (rival Starbuck$)

- **What shipped.**
  - `src/sim/rival.ts`: a `RIVAL` tuning table (scout $5, copy after 3 days, undercut $0.50,
    asks ×0.5 while the copy is cheaper and ×0.85 when matched, a floor at 75% of list, a menu of 3).
  - `rivalMenu` is a pure hash of seed and day: three unlocked drinks at 85–105% of list, rounded
    to $0.25. It never touches the RNG.
  - `rivalMorning` runs in `startDay` after the morning notes. It copies a signature that has
    stood for 3 days, or re-undercuts a matched copy every 3 days down to the floor. Both write a
    morning note.
  - `rivalAskFactor` scales the signature ask share inside the existing draw, so there's no extra
    RNG draw.
  - A new `scout` input works at night, for humans only, once a night, and costs $5.
  - UI: a Starbuck$ card under the paper. It has the Scout button; once scouted, it shows the
    menu table with our prices (theirs in red when cheaper) and an "eyeing your signature in N
    days" line. When a knock-off is live it shows a red status line with the counter-move hints,
    or a green one when we match it.
  - Save v18 (no-op migration, since `rival` is optional) and protocol v21.
- **Checks.**
  - Four new tests (569 total): menu determinism and price bands; the copy timing, undercut and
    floor; the ask factor, matching, and a new recipe dropping the copy; scout rules (night only,
    once, cost, bots refused). A game with no signature has an identical state and RNG stream.
  - Default balance is unchanged at 291.28 / 319.53 / 25.4%.
  - The taste bot, which re-picks its best combo as the signature whenever the best combo changes
    and so counters by accident, scores 289.08 / 323.58 / loss 28.6%. B8 was 287.30 / 321.80 /
    28.8%.
  - The rival didn't cost the bot anything, and it gained slightly. The likely reason is fewer
    premium-price signature asks while its stale signature was 3★, which earns no bonus and costs
    patience. So the rival is a mild pressure, and it bites hardest on a good signature the crew
    leaves standing. That's the intent, but watch it in playtest; `askCut` is the lever.
  - The 4-tab week run synced all 3 nights (see p3/b09/week.log).
- **Deferred / watch.**
  - Bots never scout and never deliberately counter. A price-match counter in `tasteNight` is a
    few lines.
  - There's no general traffic pressure. The rival only affects signature asks; its menu prices
    are information only for now. A follow-up could shave walk-ins when our list price for a
    drink is well above theirs.
  - There's only one copy at a time and no escalation. Ideas: rival loyalty cards, or a rival
    event card in the paper.
  - The scout result lasts for that night only. There's no history of past rival menus.

## P3 Block 10 reflection (parody ads)

- **What shipped.**
  - `src/sim/ads.ts` has five parody platforms, each with a target crowd (group, regular,
    impatient, influencer, or everyone), a cost, ad copy, and odds for flop, fine and viral.
  - The outcome is a pure `hash32(seed, day, platform)`, so there are no new RNG draws. It is
    resolved in `startDay` and kept hidden at night, so the forecast and the paper can't leak it.
  - When an ad runs, `applyAd` changes `computeModifiers`: it multiplies the target's share of
    the crowd mix (×1.5 for fine, ×2.2 for viral), and influencer ads multiply
    `eventOdds.influencerVisit` instead (×2.5 / ×6). Traffic goes up a little (×1.04 / ×1.1).
    Tik Tak changes overall traffic only: ×0.95 on a flop, ×1.08 fine, ×1.22 viral.
  - A new `ad` input works at night, for humans only. It books, switches (with a refund) or
    cancels (`ad: null`, refunded).
  - UI: a 📣 Ads tab with ad cards (copy, reach, odds, Run it / Switch), a booked strip with a
    Cancel button, yesterday's result banner, and a line on the receipt.
  - Save v19 (no-op migration) and protocol v22.
- **Checks.**
  - Four new tests (573 total): outcome odds and determinism; book, switch and cancel cash, plus
    poor, bot and day-phase refusals and validation; the result stays hidden at night, then the
    reveal, morning note, `today.ad`, mix change, receipt line, and the ad expiring the next day;
    a no-ad run has an identical state and RNG stream.
  - Balance is unchanged: default 291.28 / 319.53 / 25.4%, taste 289.08 / 323.58 / 28.6%. Bots
    and the policies don't buy ads.
  - Screenshots are in p3/b10. The 4-tab week sync results are in p3/b10/week.log.
- **Deferred / watch.**
  - Ads are never worth measuring in balance yet, because no policy buys them. B11 adds a promo
    policy.
  - The EV is roughly break-even by design: fine plus viral is about 65–75%, and a group- or
    regular-heavy mix pays mostly through bigger orders and tips. Tune the costs after playtest.
  - Only one campaign per night, with no stacking and no multi-day campaigns.
  - The ad copy is static, one line per platform. A rotating pool chosen by `hash32` would keep
    it fresh across a week.
  - Influencer ads stack with the influencer-scouting goal. Watch for that being too strong.

## P3 Block 11 reflection (pitch an idea)

- **What shipped.**
  - `src/sim/pitch.ts` has three scripted judges, each with a keyword list and verdict lines in
    three bands: low (0–3), mid (4–6) and high (7–10).
  - A judge scores `2 + 2 × min(3, hits)`, plus menu context (twist, drink or signature names,
    capped at +3), plus 1 when the pitch suits the judge (Gordon likes items, Chad likes
    promos). Each buzzword costs 3 points, except with Chad, who gains 1. ALL CAPS costs 2, fewer
    than 4 words costs 3, and a repeat of last night's pitch costs 4. Scores are clamped to 0–10.
  - Tiers: passed under 12, meh 12–17, green-lit 18+, ovation 24+.
  - Lines are chosen by `strHash(kind:text)`, so they're pure and stable with no RNG.
  - The input is cleaned (control characters, whitespace, 140 characters) and validated. It
    allows one pitch a night, at night, by humans only. It is scored at submit time and stored as
    `state.pitch`. Like ads, it only applies when `pitch.day === state.day`.
  - A green-lit promo multiplies traffic (×1.04, or ×1.08 for an ovation); a green-lit item adds
    to the tip rate (+0.02 / +0.04). There's a morning note.
  - UI: the panel card on the "Ads & pitch" tab has promo/item toggles, a textarea whose draft
    survives re-renders, and a result card with per-judge scores, verdicts, the boost pill and
    notes.
  - Save v20 and protocol v23.
- **Ads tune.**
  - A new `promo` balance policy plays taste plus an ad (Palm Book and Nextdoorish alternating,
    only with $60 to spare) and a stock pitch every night.
  - It showed that B10 ads were a trap: ads alone scored 211.89 against taste's 289.08, with
    loss up from 28.6% to 33.5%. The café is capacity-bound, so more and bigger crowds didn't
    convert.
  - Fix: costs were cut by about 40%, and fine/viral runs add +0.015/+0.03 to the tip rate.
    Ads alone now score 312.47 (+$23 over taste).
  - Pitches alone score 305.73. The full promo policy scores 299.20 / 317.95 / loss 29.0%,
    against taste's 289.08 / 323.58 / 28.6%. The two traffic boosts stack poorly on a full
    café, so the payoff of doing both is modest. That's fine for a fun side system.
- **Checks.**
  - Five pitch tests plus one ad-tip assertion (578 total). They cover pure scoring and tiers,
    the Chad buzzword quirk, caps and repeat penalties, cleaning and validation, one pitch a
    night and humans only, promo/item/flop modifiers, the morning note and expiry, the VM, and an
    identical stream with no pitch.
  - Default balance is unchanged at 291.28 / 319.53 / 25.4%.
  - Screenshots are in p3/b11. The 4-tab week sync results are in p3/b11/week.log.
- **Bug caught.** B11's first cut put its CSS in a stray `src/ui/night.css` that nothing imports.
  The screenshots showed the panel unstyled. The rules moved into `src/ui/styles/night.css`
  under `#night`.
- **Deferred / watch.**
  - Keyword-stuffing is the dominant strategy. That's half the joke, but a "word salad" penalty
    (judges docking points when hits exceed about 40% of the words) would reward real sentences.
  - Pitches are text-only. Nothing on the menu changes yet: there's no real new item and no
    named promo on the receipt. A follow-up could let a green-lit item become a limited-time
    menu entry.
  - There's no per-player credit or history wall of past pitches. A "Pitch of the week" award
    would fit the awards screen.
  - The judges aren't seasonal. Rotating a guest judge (Starbuck$'s regional manager?) per
    season would keep it fresh.

## P3 Block 12 reflection (checkout path)

- **What shipped.**
  - `src/sim/checkout.ts` defines a three-step path: register (free) → OrderBot kiosk ($40,
    $2/day licence, patience ×1.12, line +1, tips −0.04, prices ×1.04) → "Squarely" tap
    terminal ($75, 3% of price + tip, patience ×1.05, tips +0.08). It's pure arithmetic with no
    RNG, so a run that stays on the register keeps an identical stream (tested).
  - The night input `checkout` installs the next step (in order, humans only, with enough cash)
    or switches back to any owned checkout for free. Install spend counts as fittings.
  - "Line holds one more" needed a new `Modifiers.queueRoom`. The queue cap was
    `min(6, 6 + queue)`, so a +1 could never raise it. There's also a 7th queue slot left of the
    counter, where the kiosk stands.
  - UI: a 🏪 Shopfront tab with a three-card path (pros/cons, install / switch / locked / "On the
    counter"), a "Checkout fees" receipt line, and a morning note.
  - Render: the counter art is rebuilt when the active checkout changes. The register is a beige
    till, the kiosk is a card reader plus an "ORDER HERE" totem, and Squarely is a white swivel
    screen with tip buttons. The rebuild (`Scene.buildStations(key)`) is generic, so B13 tiers
    reuse it.
  - The old `digitalKiosk` / `squarelyTerminal` shop cards are removed. The v20→v21 migration
    turns owned copies into the matching checkout and strips them from hand and bought-tonight.
    Save v21, protocol v24.
- **Balance (40 weeks, seed 1).**

  | Policy | Cash | Score | Loss |
  |---|---|---|---|
  | Baseline smart | 266.17 | 277.11 | 26.7% |
  | B12 smart | 260.53 | 276.53 | 26.4% |
  | Kiosk (smart + kiosk once there's $60 spare) | 269.91 | 290.03 | 26.2% |
  | Squarely (smart + kiosk, then Squarely) | 246.90 | 269.97 | 26.3% |
  | Baseline taste | 272.58 | 283.52 | 28.6% |
  | B12 taste | 274.88 | 288.19 | 28.1% |

  - The kiosk is a modest win (+$13.5). Squarely is roughly break-even inside a week (−$6.6):
    the 3% cut eats most of the tip jump on cheap drinks. That's the intended "is it worth it?"
    trade-off, and it pays more on pricier menus and with a Host.
  - Removing the two cards shifted the deal pool slightly. Smart is unchanged within noise.
- **Checks.**
  - Six checkout tests (584 total). They cover path order and costs, free switching, refusals
    (poor / bot / day), validation, modifiers, the Squarely fee per sale, the kiosk licence at
    close, profit and VM, the morning note, fittings, the v20 migration, and an identical stream
    on the register.
  - Screenshots are in p3/b12: every night tab at 1280×800 and 1920×1080, plus the three
    counters.
  - The 4-tab week sync, with a peer installing the kiosk, is logged in p3/b12/week.log.
- **Bug caught.** The first balance/week run was done with six 40-week balance runs hogging the
  CPU. The night timer ran out before the week script could click, which looked like a UI
  regression. It wasn't: a rerun on a quiet box is clean. Don't run the browser sync alongside
  heavy batch jobs.
- **Deferred / watch.**
  - Bots never touch the checkout. A crew of bots stays on the register forever.
  - There's no queue-speed difference yet. "Tap and go" is modelled as patience, not as faster
    serving. A real per-sale pay time (register slow, Squarely instant) would make the speed
    trade-off visible, but it would change the serve loop.
  - Night fixtures show "YESTERDAY · DAY 0" on the receipt because the harness passes no
    `extras.day`. This is cosmetic and harness-only.

## P3 Block 13 reflection (growth path)

**Shipped.** New runs start as a ⛱️ stand (8 tiles, line of 3, $10 rent, commuter crowd, no
steamer), grow at night to a 🛺 cart ($80: 10 tiles, steamer, line 5, $17 rent) and then to
☕ the café ($150: the old game). Hoarding + FOR LEASE sign (with a narrow mode for the cart
strip), a "Grand re-opening" confetti burst the next morning, a milestone note, and a
Shopfront "Grow the shop" card. Host-authoritative `grow` input (night only, humans only, must
afford it). Snapshot v22 (migration 21: old saves count as `tier: 'cafe'`), protocol v25.
Fittings resale includes tier spend. A café run's RNG stream is identical to B12.

**Balance (40 weeks).** The first pass had staying at the stand dominant (stand 337 cash / 383
score vs grow 197 / 266), because the stand paid café prices with lower rent. Fix: tier price
and traffic multipliers (stand ×0.75 / ×0.65, cart ×0.9 / ×0.85, café 1/1).

| policy | cash | score | loss% |
|---|---|---|---|
| stand (never grows) | 182.78 | 150.03 | 9.2% |
| grow | 186.10 | 173.42 | 17.9% |
| smart (café start) | 260.53 | 276.53 | 26.4% (= B12) |
| taste (café start) | 274.88 | 288.19 | 28.1% |

Growth days (grow policy): cart 35/40 seeds, avg day 4.7; café 6/40 within the week, avg day 6.7.
So growing now beats staying small, and the café is a week-2 goal for most runs.

**Checks.** 596 tests, tsc and build green; the 4-tab week sync with a night-1 grow showed
cash/tier/tierLog/stations/mop the same on every peer, with no page errors; screenshots of
every tier (day fixtures plus night tabs at 1280×800 and 1920×1080) are in `overnight/p3/b13`.

**Bugs caught.** The preview served a stale dist (first sync run showed café: rebuild first);
the growth `affordable` flag was in the VM structure key, so it re-keyed with cash (test + CI
failure on 40dbbfd, fixed); the FOR LEASE sign overflowed on the narrow cart strip.

**Deferred.**
- Bots never grow (and never use checkout); a solo run with bots relies on the human.
- The signature base select still offers latte at the stand, and the chalkboard menu art still
  lists latte at the stand. Both need to be stand-aware.
- The chaos sign position still starts at LAYOUT.mopHome rather than per tier.
- The week harness's role click flakes ("element not stable/detached").
- New-run scores (~170–190) are lower than café-start records (~277), so old week records don't
  compare directly. Consider a separate leaderboard or a "started as" tag.
- The week-end screen doesn't show the growth journey yet.

## Gear Tree build — for Claude to review (UI lane touched sim files, approved by Kennedy 2026-10-29)

Merged so far (all behind `createRun({gear:true})` / the hidden `?gear=1` link; classic runs are unchanged and v2.2.0 rollback tag is `pre-gear-work`):
- **G1 `gear-g01`** — `src/data/gear.ts` (+tests): gear trees, tiers, prices, speeds, marks, batch caps, `GEAR_START`.
- **G2 `gear-g02`** — `src/sim/gear.ts` (+tests) and small hooks in `types.ts`, `slots.ts` (classic slot/equip ignored in Gear runs; `noStock` when batch is out), `stations.ts` (gear speed, marks, batch countdown), `customers.ts` (no concentrate drinks when batch out), `run.ts` (gearStart / gearMorning), `growth.ts` (growGearSlots), `step.ts` + `validate.ts` (`{kind:'gear'}` input). No save/protocol bump: all fields optional.
- **G3 `gear-g03`** — UI only: `src/ui/gearVM.ts`, Spend › ⚙️ Gear board in `night.ts`, `?gear=1` in `main.ts` via `ui/gearFlag.ts`.

Please review: the stations.ts speed/batch edits (determinism), the slots.ts ↔ gear.ts circular import, validate.ts bounds, and whether any net/storage path should whitelist the new fields.

- **G4 `gear-g04`** — Pod-o-Matic 3000 (E1): `gearRecipe` in `stations.ts` interact (empty hands → espresso, 1 beans = 1 pod, no grinder; `growth.ts` canMake treats pods as covering the grinder). Price multipliers via `applyGearPrices` at the end of `effects.ts` computeModifiers (c5 ×1.25, e5 ×1.1, e6 ×1.2, e1 ×0.85). Night board `sellLabel`: $0 items say "Toss it" / "Bin the sock".
- **G5 `gear-g05`** — quirks in `GEAR[*].quirks`, run by `gearMorning`, `gearBlocked` (top of `interact` when idle) and `gearAfterUse` (after a brew starts) in `src/sim/gear.ts`: Pod jams (whack with empty hands), goose spills (`placeMess`), spice-grinder off notes (+1 mark), whisk dies after 6–13 uses/day, jar crack (lose the batch), sock question (−0.05 rep), Lucky Sock (no lint mark), funny lines as `gear.quirk` log → toast in `main.ts`. New optional Station fields `jammed/dead/usesToDie/lucky`. RNG (`state.rng`) is only drawn in Gear runs, so classic replays/goldens are unchanged.
- **G5b `gear-g05b`** — day HUD "Gear" card (compact chips: 🧊 6/8 left · 🥛 ready · ☕ jammed!).
- **G7a `gear-g07a`** — hidden area (`src/data/areas.ts`, `gearArea`/`areaTipMul` in `sim/gear.ts`): pure from scenario + seed (no RNG draw); one hook in `customers.ts` serveCustomer multiplies the tip (×1 in classic runs, so goldens are unchanged). Not yet: asked-for walk-outs, receipt tips per family, the street notebook, gear pulling orders.
- **G7b `gear-g07b`** — UI only: "📓 Street notebook" strip on the Gear board (after Night 0): served per family over finished days (`state.days[].drinks`), 2–5★ verdict after 10 (`notebookVM` in `ui/gearVM.ts`).
- **G7c `gear-g07c`** — asked-for walk-outs: `gearAskedFor` hook in `customers.ts` spawnCustomers right after the arrival roll (12% of arrivals when the area loves a family not on the menu; they leave, no rating hit; RNG only in Gear runs). New optional `GameState.gearAsked`; `gearMorning` turns it into "3 people asked for something iced yesterday and walked on." Office park loves filter, which can't be served until drip exists, so it always leaks a few walk-ins — revisit with the D-tree.

Please also review (G4/G5): the `interact` hooks order in `stations.ts` (gearBlocked before recipe; gearAfterUse after busyTotal), and RNG use. **Bots are untouched**: they don't know pods (won't make espresso on E1), and may walk to a dead/jammed machine and get nothing — bot logic for gear is yours.
Deviations from GEAR_TREE.md: pods use the beans supply (no new SupplyId); jar crack = lost batch + morning note, not a floor spill; "+1★ quality cap" skipped (3★ is already the max); drip (D-tree) not built yet — it needs a new StationKind/drink/supply + sprites + bots.

Still to build: drip (D1–D5), G6 level-ups, G7 area taste, co-op $50 majority votes (G8), dual boiler sides (G9), G10 pour-over/balance, bots using gear, inspector/other rare events, records split + protocol bump at the v3 flip (G11).

### Claude's review of Gear G1–G5 sim edits (2026-10-29, at Kennedy's request)

Read-only review of f28f9c6, 6b2d55b, a467e25 and bdcb659 (src/data/gear.ts, src/sim/gear.ts and the hooks in
stations, slots, growth, customers, effects, run, step, validate, types). Classic runs are untouched: every hook
is behind `state.gear` or `Station.gear`, which only `gearStart` sets. 867 tests green on main 25c51e3.

Answers to the four questions:
- **stations.ts speed and batch, and the G4/G5 `interact` hook order (determinism):** sound. `gearBlocked` before
  the recipe and `gearAfterUse` after `busyTotal` is the right order (a jam or dead battery blocks before any
  supply is consumed; the off-note mark lands on the cup already in the machine). Gear speed divides the brew time, the batch counts down at
  insert, and gear marks are added after `cupIntoStation`, so they stick. G5 quirk rolls (`gearMorning`,
  `gearAfterUse`) draw RNG only for stations that carry gear with quirks, in station order, so classic streams are
  unchanged. The `src/sim/gear.ts` header still says "no RNG"; it should say the G5 quirks roll RNG.
- **slots.ts ↔ gear.ts import cycle:** safe. Neither module uses the other at load time (only inside functions);
  the build and the suite confirm it. Leave it.
- **validate.ts bounds:** fine. `isGearId` uses an own-property check, so `__proto__`-style ids are refused;
  `sell` checks an integer index and `applyGearInput` range-checks it.
- **net/storage whitelisting:** nothing to whitelist. Inputs pass through `validateInput`, snapshots carry new
  optional fields as they are, and delta sync is generic. Versions: G1–G5 added optional state fields and the
  `gear` input without a snapshot/protocol bump; harmless because every field is optional, and the planned bump at
  G11 covers it. Snapshot 26/27 and protocol 29/30 were taken by the bot-prep and collision tweaks.

Findings:
- **Planner suggested classic purchases in a Gear run (Claude's lane; fixed 2026-10-29, tag `fix-planner-gear`).** On a Gear run
  `planNight` still proposes `equip` (e.g. a second espresso machine), which `applyEquipInput` ignores there, so a
  crew-tip chip would do nothing. Fix: skip `equip`/`slot` advice when `isGearRun(state)`.
- **Bots can't use a Pod-o-Matic (Claude's lane, low priority; Gear's G5b note agrees).** Probe: a Gear run with the E1 pod machine, one bot, an espresso
  order waiting → the bot idled for 60 s and served nothing. `chainFor` builds every espresso drink from the
  grinder, which a pod run doesn't have; bots also never whack a jammed machine. Fine while bots are rare; worth a
  line in the G-block that teaches bots about gear.
- **Minor:** the portafilter-spill quirk logs "coffee on the floor" even when the mess cap stops the puddle;
  `gearAfterUse` uses `tileOf(p.pos)` where the rest of the floor code uses `ownTile` (nearest walkable node).
- **UI question:** the Gear board is gated on the local `?gear=1` flag. A friend who joins a Gear room without the
  flag gets a Gear run with no Gear board; gating on `state.gear` would follow the host.

UI lane follow-up (`gear-g05c`): fixed the minor one (spill now uses `ownTile` and only logs when `placeMess` lands a puddle, with a test) and the gear.ts header now describes the G5 RNG rolls. On the UI question: the Gear board and day HUD card already follow `state.gear` from the host (`nightViewModel`/`hudViewModel`); `?gear=1` only decides `gear: true` when this client creates the run. Planner `equip` advice and bots on pods/jams stay in Claude's lane.

### G4d — Drip tree (UI lane, tag `gear-g04d`)
- New Gear-only station kind `drip` and drink `drip` (appended to `DRINK_IDS`, filter family, $2.50). Classic never
  unlocks it; `EquipmentKind` excludes `drip`, so the classic stations shop is unchanged. Buying the first drip
  machine unlocks drip and puts it on the menu.
- Tree D1 Thrift Store Special ($15, 4-cup pot, 20 s, cold after 45 s, 12% too hot/cold) → D2 Mister Kaffee
  ($40, 8 cups, 14 s, 60 s, 5%) → D3 Office Urn ($85, 16 cups, 12 s, never cold, 2%) → D4 Twin-Batch Fetch-O
  ($160, 24 cups, 10 s). Pour-over branch (D4b/D5b) is not built: it needs another drink.
- Mechanic: empty hands + E brews a pot (one unit of beans, no grinder) via the normal `RECIPES.drip`; when it
  finishes `gearPotFinished` fills `potLeft` and rolls one RNG draw for a too-hot/too-cold pot (Gear + pot machines
  only). Each pick-up pours a cup (`gearPotPour`) and the station keeps its output until the pot is empty. Cups
  from a missed or cold pot get one mark (−1★, smaller tip) and a complaint toast (`gearTempMiss`). The doc says
  "half tip"; the mark is the light version (no per-cup flag through the pass).
- Office-park walk-ins asking for filter now stop once drip is on the menu; the notebook gains a Filter row.
- **Bots (Claude):** `recipeChain('drip')` exists, so bots can probably brew and pour already (screenshots show
  bots serving drip), but they don't know pots go cold or prefer pouring from a full pot. Worth checking.

## G4e — Buy multiples of the same machine (UI lane, tag `gear-g04e`)
- Playtest: buying the machine you already own now adds a second copy into a free slot (no trade-in). Board shows "Buy another · $X" and "Yours ×N ✓". Lower tiers still do nothing; a higher tier upgrades one copy.
- Bots: nothing needed (they already pick any station of a kind).

## G4f — One clear night order (UI lane, tag `gear-g04f`)
- Playtest: night tabs were confusing. Gear runs now show numbered steps ① Restock (stock first, full width) → ② Gear shop (its own tab; no longer under Spend › Stations) → ③ Menu → ④ Extras (cards, ads, pitch, grow, checkout). Pick-your-gear night puts Gear first (nothing to stock yet). A green "Next: N … ▸" footer button walks the order. Classic runs unchanged.

## G4g — Till job + co-op hint (UI lane, tag `gear-g04g`)
- Playtest: in co-op the register is now a real job (Gear runs, humans only). At the counter with empty hands, E first serves a ready drink from the pass; otherwise it **rings up** the next waiting customer (`tillRingUp` in `src/sim/till.ts`): sets `rungAt`, +25% patience, log line. Serving a rung customer within 30 s adds +$0.50 tip, within 60 s +$0.25 (`tillSpeedTip`, added in `serveCustomer`; served event carries `till`). Unrung customers are served exactly as before, so solo is unaffected (optional). Hand hint shows "Ring up: <drink>".
- Pick-your-gear night with 2+ humans shows a 👥 Co-op tip: two cheap machines (Hanes $5 + Pod-o-Matic $45) give two people a job; whoever's free runs the till.
- **Bots (Claude):** bots never ring up (`tillRingUp` refuses `player.bot`). Optional: let a free bot run the till in Gear co-op.

## Bot-side Gear work for Claude (collected)
- Bots on pods (E1 Pod-o-Matic: no grinder, pods stock) — they can't make espresso there today.
- Bots handling jams/dead machines: whack a jam (the G5 quirks), avoid walking to a dead machine.
- Drip pot awareness: prefer pouring from a full pot, rebrew when empty/cold.
- Till: a free bot may ring up in co-op (Gear only).
- Planner `equip` advice for Gear runs; any new Gear drinks (G6 americano/cappuccino when built).

### Gear G6 — drinks level up with use (gear-g06)
- Built: 12 espresso served → **Americano** unlocks (espresso + water at the espresso machine, 1.5s; not on the pod machine). 12 lattes served → **Cappuccino** unlocks (latte + milk at the steamer, 2s). Unlocks happen mid-day with a "🎉 … unlocked!" toast, plus a morning note the next day. The night board's "🎓 Drinks to learn" row shows progress. Gear only; classic runs are unchanged.
- Save: optional `gearServed` / `gearLearned` fields. SNAPSHOT_VERSION stays 27.
- Recipe clash (latte at the steamer → mocha or cappuccino): the station makes whatever the oldest waiting customer ordered, otherwise the first match.
- Not done yet: doppio, mocha, sweet-cream, café au lait, and red-eye level-ups; pour-over; the doc's "replaces day-3/day-5 unlocks"; temperature miss should halve the tip (it's −1★ for now).
- **For Claude (bots):** teach bots to make americano and cappuccino (recipeChain already resolves them). Bots should know about the steamer clash rule. Optionally, bots could prefer serving the drink that is close to a level-up (`gearServed`).

### Gear G7d — receipt tips by drink type + gear pulls customers (gear-g07d)
- Receipt: new optional `DayStats.tipsByFamily` (Gear runs only), filled in serveCustomer via `noteFamilyTip`. The night receipt shows indented ☕/🥛/🧊/🫖 rows under Tips, biggest first. Old saves and classic runs: no rows.
- Gear pulls customers: `gearPullMul` makes a family's orders 5% more likely per tier above 1, using the best tier in that family's tree (espresso→espresso machine, milky→steamer, iced→cold brew tap, filter→drip). It reweights `drawDrink`. It's ×1 in classic runs, so goldens are unchanged. It uses no new RNG draws, but Gear-run order outcomes shift.
- Not done yet: "top tiers add snob regulars"; the area crowd column (impatient commuters, grumpy, and so on).
- **For Claude (bots):** nothing needed. Bots could optionally favour high-tip families.

### Gear G6b — level-ups replace the day-3/day-5 unlocks (gear-g06b)
- Gear runs skip `unlockForDay`. Iced latte now unlocks after 10 espressos + 10 cold brews (`LevelUp.also`), and Mocha after 25 lattes (the flavour starter pack comes via unlockDrink). Classic runs are unchanged. The night "Drinks to learn" row shows both counts.
- **For Claude (bots):** bots could aim for level-up counts (`levelUpProgress`). Optional.

### Gear G4h — too hot / too cold = half tip (gear-g04h)
- Per doc §4.2, a drip temperature miss no longer marks the cup (−1★). Instead it sets `Player.cupTemp`, which halves the tip when that cup is served. The flag rides through the pass (`PassItem.temp`). It's cleared on empty hands, on going into or out of a machine, and on serving. The complaint toast now says "(half tip)".
- Optional fields, no version bump. Classic runs never set it.
- **For Claude (bots):** bots carrying a `cupTemp` cup could prefer rebrewing over serving if time allows (optional).

### Gear G8 — co-op majority vote for big buys (gear-g08)
- Per doc §8, with more than one connected human, buying gear priced $50+ or selling gear worth $50+ opens `state.gearVote` instead of happening at once. The proposer counts as yes, and only one proposal can be open. Others vote with the new input `{kind:'gear', action:'vote', yes}`, and a no from the proposer withdraws it. A strict majority of connected humans passes it; a tie fails. Cash and slots are checked when it passes. Bots and disconnected players don't count. It lapses when the day starts. `gearVoteLast` shows the result on the board.
- Solo and cheap buys are unchanged. The night Gear board shows a blue banner with 👍 Yes / 👎 No (Withdraw for the proposer), plus a 🗳️ mark on vote-needing buy buttons in co-op.
- **PROTOCOL_VERSION 30 → 31** (new input shape). The snapshot is unchanged (optional fields).
- **For Claude (bots/net):** bots never vote, so a human-majority-only rule needs no bot work. Optional: a toast for the vote result, and a host-side `settleVote` call when a player leaves (it currently re-settles on the next gear input).

### Gear G6c — the rest of the level-up drinks (gear-g06c)
- New drinks, appended to `DRINK_IDS` (seeds are safe): **doppio** (30 espressos, needs E3+; espresso in hand at the machine, +beans, 3 s), **sweetCream** (15 cold brews; cold brew in hand at the tap, +milk), **cafeAuLait** (12 drips, needs a steamer; drip in hand at the steamer, +milk), **redEye** (20 drips, needs E2+; drip in hand at the machine, +beans). Gear gates are `LevelUp.needs` and `levelUpGearOk`. The night row shows "needs a Sylvia or better" and similar. Pod machines refuse drip and espresso in hand.
- Americano vs doppio at the machine uses the existing recipe-clash rule (the oldest ticket decides). Prices are $4.50, $5, $3.75 and $4.25. All have Pixi and DOM cup art.
- Classic runs are unchanged (nothing unlocks them). The growth cards now hide Gear-only drinks in classic runs (`GEAR_ONLY_DRINKS`).
- **For Claude (bots):** teach bots the new chains (`recipeChain` resolves them). Red-eye and au lait start from a drip pour. Doppio clashes with americano like mocha clashes with cappuccino.

### Gear G10a — the pour-over branch, D4b/D5b (gear-g10a)
- New tree row **Pour-over** (`tree: 'pourOver'`, tiers 4/5 to keep the doc names). Both need the **Office Urn (D3)** or better in a slot first (`GearInfo.requires`, `gearRequiresMet`; the button reads "Needs Office Urn"). It takes its own slot, so the drip machine stays. Owning the bar keeps the branch open after you sell the urn.
- **D4b Pour-Over Bar** ($70, sells for $30): station kind `drip`, but `gearRecipe` makes one **Pour-over** from empty hands in 8 s (beans). There is no pot. It has a 3% spill quirk and a rare "flow state" funny line. **D5b The Pour-Over Lab** ($150, sells for $75): a cup every 2.5 s (three cones) and Pour-over ×1.15 (`gearPriceMul` follows only pour gear).
- New drink `pourOver` is appended to `DRINK_IDS`. It is Gear-only, family filter (the arts district loves it), costs $4.50, and goes stale after 90 s. It has Pixi and DOM cup art and a ticket. Buying the bar puts it on the menu. `recipeChain('pourOver')` returns one drip-station step (`POUR_OVER_RECIPE`), which is not in RECIPES, so a drip pot never makes one.
- **Bug fixes found while shooting:** a Gear run crashed the night screen when drip was on the menu but no drip machine was on the floor (for example after selling it). `STATION_SHORT` and `STATION_ICON` lacked `drip`, and so did the planner's `stationName`. The "Nothing to sell yet" note also ignored drip and pour-over machines.
- Deferred: the flow state doubling speed (only a line for now), the "+1★ cap", and the snob draw for the Lab (next block: snob regulars). The station still renders as a drip machine sprite (machine polish block).
- **For Claude (bots):** the pour-over is made at the pour-over gear only (a `drip`-kind station whose `GEAR[gear].pour` is set). Bots must choose that station and not a drip pot.

### Gear G10b — area crowds and snob regulars (gear-g10b)
- Every area now has a **crowd** (`AreaInfo.crowd`, GEAR_TREE.md §7). Campus students tip ×0.9 on everything. Drizzleton waits ×1.25 longer for milky orders. Office commuters and the gym rush have ×0.85 patience. The arts crowd notices quality: tip ×(1 + 0.1 × (stars − 2)), so a 3★ cup is ×1.1 and a 0★ cup ×0.8. Tourists tip ×1.15. All of these are Gear-only and pure, with no RNG (`areaPatienceMul`, `areaQualityTip`).
- **Per-drink overrides** beat the family rule (`lovesDrink`/`mehDrink`): the arts district loves pour-over though filter is meh there, and the office park shrugs at pour-over (too slow) though it loves filter.
- The street notebook shows the crowd line (👥) once any family has stars.
- **Snob regulars:** owning top-tier gear (E5/E6, S3, C5, D5b; `SNOB_GEAR`) makes the next regular a snob (🎩 Margaux, then Sebastian; at most 2, one per family). They order the fanciest drink of that family on the menu and tip ×1.3 for a perfect 3★ cup, ×0.5 for 1★ or less. A toast announces them; tickets read "🎩 Margaux · snob: wants it perfect"; the regulars drawer marks them. `Regular.snob` is optional, so old saves load. Snobs do not use up the three ordinary regular names.
- Deferred: tourist "crowds" (more arrivals) and the doc's ×1.4/×1.5 per-area tip strengths (all loves stay ×1.2) are for the G10 balance pass.

### Gear G9 — dual boiler and two-group twin stations (gear-g09)
- **E4 Double Trouble** now really has two sides: the espresso machine plus a **steam wand** half a tile (`TWIN_OFFSET` 0.55) to its right, both in one slot (`GearInfo.twin`, `Station.twin`). There are no new buttons: a barista picks a side by standing nearer it, so one person can pull a shot and steam milk at the same time.
- **E5/E6** keep the steam wand (so upgrading from E4 never loses steam; a design call, GEAR_TREE §5 only says "two group heads") and add a **second group head** on the other side, with the same gear (`espresso-2`).
- On the floor's last column the first twin goes left. Bots: from the slot's own whole tile the main side is nearest; from the next tile over only the twin is in reach (1.097 ≤ 1.1). On an edge slot the far twin can have no walkable node, so it is human-only there (see the Claude prompt).
- The E4 steam wand counts as "a milk steamer" for the café au lait level-up (`levelUpGearOk`).
- Render: twins are drawn at 0.7 scale behind the main side with no name plate, so the pair reads as one machine. The gear HUD lists the machine once; gear cards say "Steam wand built in" / "Two groups + steam wand".
- No snapshot/protocol bump: `twin` is optional and stations are rebuilt from `slotGear` at night. Classic runs never get twins.
- Screenshots: /workspace/overnight/sprint/g09-twin-{e4,e5}-{1512x982,1280x800}.png.
- Tests: src/sim/gearTwin.test.ts (11, incl. a headless bot day: two bots used both groups and the built-in wand).

### Gear G10 — balance pass and top-tier perks (gear-g10)
- **Top-tier perks** (GEAR_TREE §5 promises, now real): **C5** and **E6** "polish" forgives one slip per cup (+1★, `gearPolish`); **D4b** pour-over bar rolls a rare **flow state** (2% per cup: ×2 speed for 20 s, toast "Flow state! …"; cleared each morning; `Station.flowUntil`); **C5** draws +10% iced orders (`draws`); **E6** makes influencer visits ×1.5 (`influencerOdds`, via `applyGearPrices`). Twins never double-count a perk. Gear cards list each perk.
- **Area order pull** (`AreaInfo.pull` / `pullDrink`, inside `gearPullMul`): office filter ×1.5 and pour-over back to ×1 (too slow for commuters); arts espresso ×1.4 and pour-over ×1.4; gym iced and espresso ×1.3. The three scenario areas already tilt orders through their scenarios (campus cold brew ×1.5, Drizzleton latte ×1.5, tourist traffic ×1.25 and tips +0.1), so they get no extra pull.
- **Bot fix found by the balance run:** stand-ins/bots never used the **E1 pod machine** (they planned a grinder step and the bot's "insert" check ignored gear recipes), so a fresh Gear stand only ever sold cold brew. `chainFor` now drops the grind step when pods cover it, and the bot's insert check uses `gearRecipe` first, as `stations.ts` does (this also covers the pour-over bar). Small, targeted, logged for Claude.
- **Balance check** (`npx tsx scripts/gearBalance.ts [days] [seeds]`): stand-ins play Gear weeks with a simple crew policy (buy the next tier on a fixed path keeping a $45 supply reserve, never trade pods away before a grinder, grow when cash > cost + $60, restock ~1.3 days). Results, 7-day weeks, seeds 100–103 (tourist, campus, Drizzleton, tourist):

  | Crew | Served/week | Lost/week | Avg ★ | Week-end cash | Gear by day 7 |
  |---|---|---|---|---|---|
  | 1 | 60–90 | 15–29 | 1.6–2.3 | $41–102 | C2–C3, E1, S1–S3 |
  | 2 | 71–94 | 17–32 | 1.7–2.1 | $64–111 | C2–C3, E1, S1–S3 |
  | 4 | 71–96 | 18–36 | 1.7–2.1 | $63–113 | C2–C3, E1, S2–S3 |

  Before the pod fix the same runs served 21–41 a week with 50–70 lost and two bankruptcies. Read: no bankruptcies; sales ~$35–60 a day; week 1 climbs the cheap rungs and the Cart/E2+grinder step is a week-2 goal, which matches GEAR_TREE's "scrappy stand" week. Crew size barely matters at the stand (it is machine-bound with 3 machines), which is the intended push to grow. Drizzleton is the hardest area (the whisk dies, iced is weak). No price numbers changed; revisit after a real week-2 run with growth (the harness rarely grows, because it spends on gear first).
- Tests: src/sim/gearBalance.test.ts (8: flow on/off/reset, polish, nitro draw, area pull, influencer odds and classic untouched, card lines, a stand-in pulling pod shots with no grinder). 970 tests.


### Gear polish — till, machines, night order (gear-polish)
- **Machines.** The separate steamer next to an E4 no longer wears a "2" badge: `stationBadges` (render/slotModel.ts) numbers repeats per kind and skips G9 twins. D4b/D5b now draw as a real pour-over (wooden stand, two ceramic cones over glass servers, gooseneck kettle, POUR-OVER plate) instead of a drip machine labelled DRIP. The station key includes the gear id, so swapping D4→D4b rebuilds the art.
- **Wall chalkboard.** It used to list the three classics at list price forever (deferred since P2). It now follows the live menu (`wallMenuRows`: makeable, switched-on drinks at today's price including price mods, max four rows, then "+N more"; "Coming soon" when empty). Redraws only when the rows change.
- **Till.** A rung-up customer wears a paper receipt with a green tick next to the order bubble, and a fast hand-off adds "· 🧾 +$0.50" to the serve toast (`tillText`).
- **Night order.** The header says "Pick your gear" only on the gear tab; the other first-night tabs say "Opening night". On a Gear run the Restock jars only turn red when tonight's menu needs that supply (no all-red row on an empty counter). Pastries never turn red (an optional side), in classic too.
- **HUD.** An empty menu says "Nothing on the menu yet" with a hint to check the Gear tab, instead of an empty chalk pill. The right rail no longer squashes Pantry/Gear/Floor/Menu at 1280x800; only the morning note shrinks and scrolls.
- Screenshots: `/workspace/overnight/sprint/polish-{before,after,day,till,night-gear,night-tonight}-*.png`.
- Still open: HUD order tickets don't show a "rung" mark; crew tips on night 1 of a Gear run suggest "Take the Espresso off the board" while nothing can be made (bot/crewTips side, for Claude).

### Gear integration smoke (gear-smoke)
- Ran `/workspace/overnight/pw/weekgear.mjs` (week.mjs + `GEAR=1`: buys C1 + E1 night 1, a Spice grinder night 3, restocks beans/milk/cold brew) for a full 7-day week, 60 s days: solo at 1512x982 and 1280x800, `?link=local` co-op (2 tabs + 2 bots) at 1280x800 and 1512x982. No page errors, every night's sync check "same", week-end ceremony reached in all runs.
- **Found and fixed:** a grinder beside a pod-only espresso bar made bots grind beans the Pod-o-Matic refuses; espresso sales went to zero (solo days 3–7 fell from 6–7 served to 0–2). Fix: `podsOnly(state)` in sim/gear.ts; bot `chainFor` skips the grind step; order tickets show one "Pod" step instead of Grind + Pull (and the empty rail says "Tidy up"); the Gear tab warns "The Pod-o-Matic takes pods, not grounds". Headless A/B (1 stand-in, 150 s day): espresso with grinder 0 → same as without (9/6/8 on seeds 1–3). Tests: `src/sim/podsGrinder.test.ts` (5).
- **After the fix (smoke 2):** solo 1280x800 and co-op 1512x982 (2 tabs + 2 bots, Spice grinder from night 3) both reached the week-end with no page errors and every night "same". Co-op with the grinder kept serving 3–6 a day (before the fix, solo fell to 0–2 once the grinder arrived). Also fixed from its screenshots: the hand hint at a pod machine said "Espresso machine needs grounds"; it now says "needs empty hands (it takes pods)". Screenshots: `/workspace/overnight/sprint/smoke-{solo-1512,coop-1280}/` (before) and `/workspace/overnight/sprint/smoke2-{solo-1280,coop-1512}/` (after). gearBalance re-run (7 days, 3 seeds): 1/2/4 crew week-end cash $41–81 / $64–89 / $63–91, no bankruptcies, same as G10. Tests 984.
- Harness note: the board re-renders after every click, so Playwright element handles go stale; click by selector (week.mjs's classic restock loop has the same issue).
- Balance note (not a blocker): on the 60 s "quick" day setting, Gear runs survive but stagnate (headless sensible crew: cash $29–72 after a week, no growth, no bankruptcies). The default 150 s days meet the G10 targets. Consider a bigger starting cash or cheaper packs for quick days.
- Open (for Claude): mixed espresso bar (E1 + E2+ with a grinder) can still send grounds to the pod machine.

### Phase 6 polish P6-6 — headless café-start Phase 4 run (p6-p4-path, tag p6-06)

- [x] `playGear(..., start?)` / `p4Run(..., start?)` can start a Gear run at a later tier with a given till (sets `tier` and `cash`/`startingCash` like the dev fixtures; `createRun` ignores a `tier` option). Such runs ask the scripted crew first each night, so the till isn't spent on gear before the branch.
- [x] `CAFE=1 npx tsx scripts/p4Smoke.ts 14 2`: OK. Seeds 200/201 opened the branch on night 1, branch profit $456/$269 over 14 days, 3/7 calls, 3/2 stock runs, both bronze after week 2, no NaN, save round-trip and replay identical.
- [x] Vitest: `src/p4Smoke.test.ts` adds a 6-day café-start case (branch opens, calls answered, finite, deterministic).
- [ ] Note for balance (not a bug): week 1 at the café tier with $500 loses $57–234 with two stand-ins; the branch is what pays it back.

### Phase 6 polish P6-5 — real old-save fixtures (p6-old-saves, tag p6-05)

- [x] Saves generated in `v2.1.0` and `v3.1.0` worktrees (seeded stand-in crews; v2.1.0 classic run night 4 = snapshot 22; v3.1.0 Gear run night 5 and week-end, snapshot 27): `src/storage/{v2.1.0-save,v3.1.0-night,v3.1.0-weekend}.fixture.json`.
- [x] `src/storage/oldSaves.test.ts` (3): load, night VM, play to the next night, save/reload round trip; the v3.1.0 week-end save shows the season teaser and the week strip, and Keep going starts a season.
- [x] Browser: each save injected into `localStorage` on the built preview, ▶ Resume, no page errors (only the known favicon 404) at 1512 and 1280: `overnight/sprint/p6-05/*.png` (script `overnight/pw/oldsave.mjs`).
- [ ] Follow-up: add a v3.2.0 save (with a season, branch and stamp card) once 3.3.0 changes the shape; bump SNAPSHOT only when a field stops being optional.

### Phase 6 polish P6-4 — readable labels (p6-readable-labels, tag p6-04)

- [x] Layout audit over all 54 fixtures at 1512×982 and 1280×800 (`overnight/pw/audit.mjs`: off-screen dialogs, clipped leaf text, text under 11.5px). No clipping found; all sub-11px text was small-caps labels.
- [x] Bumped to 12px: `.tiles small`, `.money-split small`, `.rec small`, `.sec-h .chip`, `.botscard .chip`, host chip, title history `th`, roadmap log tags; bot tag on awards to 11.5px; `.sec-h small` 13px. The receipt (`.menu.results`) gets the short-screen tightening the week-end already had, since the bigger tiles pushed it 2px off the bottom at 1280×800.
- [x] Shots: `overnight/sprint/p6-04/{receipt,seasonDone}-{1512,1280}.png`.
- [ ] Left as-is (11px, fine on both sizes): HUD "OPEN"/cleanliness words, "CREW MVP".

### Phase 6 polish P6-3 — week strip on the week-end screen (p6-week-strip, tag p6-03)

- [x] `weekStripViewModel` (last ≤7 `state.days`, profit per day via `profitOf`, bar height relative to the biggest |profit|, loss days flagged) → `WeekEndVM.week`; `weekStripHtml` renders "LAST 7 DAYS · total · served" plus 7 bars. UI only, no sim/save changes. Compact layout under 820px tall (fits the 4-row season card at 1280×800).
- [x] Tests: `viewModels.test.ts` (week-end VM includes the strip; 9-day slice, loss day, HTML). Shots: `overnight/sprint/p6-03/{weekEnd,seasonDone}-{1512,1280}.png`.
- [x] Resolves the B3 follow-up "a week view (sum of days) on the week-end screen".
- [ ] Follow-ups: tap a bar for that day's report; per-shop split once the branch has its own day stats.

### Phase 6 polish P6-2 — season detail on tap (p6-season-detail, tag p6-02)

- [x] `SeasonRecord.weeks?` (week, target, profit) folded by `foldRecords`; load drops malformed rows (`cleanSeasonWeeks`). Records store version unchanged. `seasonRowHtml` renders a `<details>` row with a Target / Made / ✅ table. Screens: `overnight/sprint/p6-02/records-{1512,1280}.png`.
- [x] Resolves the F1 follow-up "per-season detail (week-by-week table) on tap". Still open: share a season card.

### Phase 6 polish P6-1 — phone ring (p6-phone-ring, tag p6-01)

- [x] `phoneRing` cue (`src/audio/cues.ts`, synth `phone`): rings when `callRinging` starts and every `RING_EVERY_SEC` (3 s) while it rings; silent once answered. Client-side only (no sim, protocol or save change). Test in `src/sim/call.test.ts`.
- [ ] Playtest the volume next to a busy rush; maybe a quieter ring for bots-only crews.

### Phase 4 B8 — integration + release 3.2.0 (p4-b08-integration, tag v3.2.0)

- [x] `scripts/p4Smoke.ts`: headless Gear runs with a scripted crew that answers calls, counters promos, buys the stamp card, opens the branch and sends stock; checks finite cash, a finished season at 28 days, save round-trip, records fold, and determinism. `npx tsx scripts/p4Smoke.ts 28 3` was OK (seeds 200–202; two went bankrupt around day 25, the third finished the season with a bronze, so the scripted crew is weak, not the sim). A 6-day version runs in vitest (`src/p4Smoke.test.ts`).
- [x] Browser smoke on the built game (`overnight/pw/p4smoke.mjs`): solo and `?link=local` co-op (2 tabs, peer joins the lobby) at 1512×982 and 1280×800, 2 days each, no page errors.
- [x] Released as **3.2.0** (Phase 4 lite). **4.0.0** stays reserved for Phase 4 complete (travel, 2v2, human playtests).
- [x] ~~The scripted crew never got a phone call or reached the branch in 28 days at 2 humans with no bots (cash stays under the $420 it waits for). Worth a seeded fixture run that starts at the café tier with $500 so the branch/call/send path gets exercised headlessly end to end.~~ Done in P6-6 (`CAFE=1 npx tsx scripts/p4Smoke.ts`, plus a vitest case).
- [ ] Human co-op playtest of a full season with the branch and calls (Kennedy).
- [ ] Bots ignore calls, the stamp card, the branch and send-stock (logged for Claude in the morning prompt).

### Phase 4 B7 — 2v2 design spike (p4-b07-design-spike, tag p4-b07-spike)

- [x] Written design: [`P4_B7_VERSUS_SPIKE.md`](P4_B7_VERSUS_SPIKE.md). Recommends two `GameState`s stepped in lockstep by a pure `street.ts` (one arrival stream split by a hashed `pickCafe` pull), per-team delta baselines in `hostRoom`, `?versus=1`, Starbuck$ off and street moves instead. Milestones V1–V5.
- [ ] Kennedy: answer the open questions (match length, shared weather, poaching regulars), then V1 (street sim, no UI).

### Phase 4 follow-up F2 — rival loyalty card (p4-f02-rival-loyalty, tag p4-f02)

- [x] Sim (`rival.ts`): Gear runs, from day 15 (`RIVAL.loyaltyDay`) the rival's loyalty card keeps `loyaltyTraffic` 0.93 of walk-ins; `stampCard` night input (humans, $30 once, from the launch night) sets `Rival.stamps` → walk-ins back, prices × `stampPrice` 0.97 from that day. Brief alert `rival:loyalty` (warn on launch night, info after; fix only when affordable); morning notes on launch / our card. PROTOCOL 39 → 40; optional field, old saves load.
- [x] Tests: `src/sim/rivalLoyalty.test.ts` (3). 1046 tests.
- [x] Shots: `/workspace/overnight/sprint/p4-f02/rivalLoyalty-*` (fixture `rivalLoyalty`).
- [ ] Follow-ups: playtest the numbers (stamp card pays back in ~4–6 days at typical week-3 takings); bots never buy it (Claude prompt); a rival second shop near ours (needs the branch areas).

### Phase 4 follow-up F1 — season board (p4-f01-season-board, tag p4-f01)

- [x] `recordsStore.ts`: optional `Records.seasons` (`SeasonRecord {key, seed, date, crew, weeksPlayed, hit, made, medal, done}`), upserted by `foldRecords` whenever the run has a `season` (one row per run, refreshed at each season week-end), sorted by medal → hits → made (`seasonOrder`), keeps the best 6; `sanitize` drops junk. No version bump: old records load with no seasons.
- [x] UI `records.ts`: "Season board" section (medal, "N of 3 targets · $X made", crew · date, "in progress (week N of 4)" with a caramel ring), only when there is at least one season; `.seasons` in menus.css.
- [x] Tests: `recordsStore.test.ts` +1 (upsert across weeks, gold at 3 hits, order, HTML, no seasons for plain runs / empty records, junk sanitised). 1043 tests.
- [x] Shots: `/workspace/overnight/sprint/p4-f01/records-*` (fixture `records` now folds two seasons).
- [ ] Follow-ups: ~~per-season detail (week-by-week table) on tap~~ (done in P6-2); share a season card.

### Phase 4 B6 — phone calls, lite (p4-b06-phone-calls, tag p4-b06)

- [x] Sim `src/sim/call.ts`: deterministic calls (hash, no RNG): 45% of days once the branch has run a full day, Gear runs only; `machine` (fix $25, or the branch serves half its cups) or `order` (+$30, uses 10 of its cups). Rings 25–55% into the day for 25 s. Input `call {take}` (people only, while ringing) → `GameState.callAnswer`; closing applies it via `branchDay(…, withCall)`, records `DayStats.branch.call`, clears the answer. The night estimate never shows tomorrow's call. PROTOCOL 38 → 39; optional fields, old saves load.
- [x] UI: a big ringing card on the day HUD (where, what, seconds left, two buttons); the outcome on the branch drawer's last-day line and in the Manager's report.
- [x] Tests: `src/sim/call.test.ts` (5: frequency/gating/determinism, window + people only + validation, machine outcomes, order outcome + closing record/clear, card HTML + bots + old saves). 1042 tests.
- [x] Shots: `/workspace/overnight/sprint/p4-b06/branchCall-*`, `branchCallOrder-*` (fixtures `branchCall`, `branchCallOrder`).
- [ ] Follow-ups: travel to the branch for the rest of the day (two live floors, the original B6 scope); more call kinds (staff sick, inspector); ~~a phone sound~~ (P6-1); bots answering (Claude prompt); playtest whether the card over the station row is in the way (it sits for ≤25 s).

### Phase 4 B5 — manager mode, lite (p4-b05-manager-mode, tag p4-b05)

- [x] Sim (`branch.ts`): with a Manager picked, the branch serves +2 cups per barista and its cups cost × `roleSupplyCost`. New branch action `send` (night, people only; beans/milk/cold brew/flavours) moves up to one pack from home supplies into `Branch.stockCredit` at pack value; at closing the credit pays for cups first (`DayStats.branch.fromStock`) and is used up. PROTOCOL 37 → 38; optional fields only, old saves load.
- [x] UI: drawer shows the Manager line (or how to get one), "Send stock over" buttons with amount and value, credit waiting, "from our stock" on last day / tomorrow; the Manager's report gets a 🏪 Second shop row.
- [x] Tests: `branch.test.ts` +2 (send → credit → paid cups → decrement, validation; Manager capacity + drawer HTML). 1037 tests.
- [x] Shots: `/workspace/overnight/sprint/p4-b05/branchManagedDrawer-*`, `branchManagedReport-*` (fixture `branchManaged`).
- [ ] Follow-ups: move hired staff between shops (the original B5 scope); per-shop report tabs; bots sending stock (Claude prompt). Note (resolved: released as v3.2.0): main auto-deploys to Pages, so P4 was live under the 3.1.0 label until the 3.2.0 bump.

### Phase 4 B4 — second shop (p4-b04-second-shop, tag p4-b04)

- [x] `src/sim/branch.ts`: `BRANCH` tunables (cost $300, 20 base walk-ins, 12 cups per barista, 1–3 staff, rent $28, 5% tips, ±15% noise). `branchDay(state)` = walk-ins × home traffic modifiers (reputation, weather, week ramp; computed as at night so the day shape is ignored) × area fit (doubled swing of the menu's loved/meh multiplier, × the area's `all`) × seeded hash noise (no RNG draw, replays identical), capped by staff; takings at menu prices; costs = rent + staff × `wageEach` + cups × average unit cost.
- [x] `settleBranch` in `finishDay` after espresso: cash += profit, `DayStats.branch`. `profitOf` includes it; `fittingsValue` counts the lease at half. `branch` input (open/staff/close; night, Gear, people only; café tier, cash, area ≠ home), validated. PROTOCOL 36 → 37. `GameState.branch?` optional: old saves load.
- [x] UI `src/ui/branchView.ts`: `branchViewModel` (`NightVM.branch`), drawer (area picker with fit words, or running view with last day / tomorrow estimate / staff −/+ / sell for half), 🏪 chip on the Day card, receipt line. Button "🏪 Open a 2nd shop ▸" / "Second shop ▸" on the Day or In-the-till card.
- [x] Tests: `src/sim/branch.test.ts` (5: gating + half-value fitting, deterministic capped closing + profitOf, sell-back is score-neutral, area fit, validation + drawer HTML + old saves).
- [x] Shots: `/workspace/overnight/sprint/p4-b04/branchPickBoard-*`, `branchPick-*` (drawer), `branchRunning-*` (fixtures `branchPick`, `branchRunning`).
- [ ] Follow-ups: playtest the numbers (≈$10–45/day at 2 staff in stand-in runs: payback ~1–2 weeks); bots never open/staff the branch (planner hint for Claude); more than one shop and a per-shop menu; branch rows in the manager report and the week-end screen; rival second shop (P4 B1 follow-up) could compete in the same area.

### Phase 4 B3 — manager reports (p4-b03-manager-reports, tag p4-b03)

- [x] Sim tallies in `serveCustomer` (`noteReport`): `DayStats.waitTicks` (patienceMax − patienceLeft at the hand-off), `takingsByDrink` (price + tip), `byPlayer` ({serves, takings}). Optional fields, PROTOCOL 35 → 36.
- [x] `src/ui/report.ts` `reportViewModel`: takings, profit, served/walked %, avg wait + trend vs. the day before, rent, wages and wage share, top 4 drinks by takings, crew ranked by cups, up to two rule-based notes (sold-out walkouts, ≥25% walked, wages ≥35% of takings, waits up ≥5s, one drink ≥50% of money; else a tidy/quiet-day line).
- [x] Night UI: "📋 Report ▸" next to Receipt on the Day card opens a drawer (KPIs, notes, costs, money drinks and crew with bars).
- [x] Tests: `src/ui/report.test.ts` (4: sim tallies, VM maths and notes, old saves / first night, night HTML button and drawer).
- [x] Shots: `/workspace/overnight/sprint/p4-b03/managerReport-{1512,1280}.png` (fixture `managerReport`, `CLICK='[data-d=report]'` in fxshot).
- [ ] Follow-ups: per-shop tabs once the second shop lands (B4); ~~a week view (sum of days) on the week-end screen~~ (done in P6-3).

### Phase 4 B2 — seasons (p4-b02-seasons, tag p4-b02)

- [x] `src/sim/season.ts`: `SEASON {weeks 4, floor $30, growth 15%}`, `seasonTarget(base, week)` (rounded to $5), `beginSeason` (first Keep going of a Gear run, base = max(floor, week-1 score)), `seasonWeekEnd` (every 7th day while the season runs; records week profit = score change, once per week), `targetsHit`, `seasonMedal`, `seasonNow`.
- [x] Hooks: `step.ts` weekEnd continue calls `beginSeason`; `closing.ts` stops at weekEnd on a season checkpoint. `GameState.season?` optional (old saves load and play on without one); PROTOCOL 34 → 35.
- [x] UI: week-end teaser at end of week 1 ("Start the season"), "Week N of 4 is over!" with next target, season table (target / made / ✓✗), season-over medal line; night header chip "🏆 Week 2 of 4 · $x of $y" (`nightExtras.season`).
- [x] Records: a season checkpoint re-runs the week-end fold; records are keyed `seed|host` with a `counted` list, so a run still counts once.
- [x] Tests: `src/sim/season.test.ts` (5: targets, full four-week flow through `finishDay` and `step`, classic runs untouched, idempotent checkpoints, old saves).
- [x] Headless: `KEEP=1` in `scripts/gearBalance.ts` (28 days, 3 seeds × 1/2/4 stand-ins): stand-ins hit ~1/3 of the $30–40 targets; weekly profit swings a lot when they grow a tier (fittings at half price). Humans should do better; tune after a playtest.
- [x] Shots: `/workspace/overnight/sprint/p4-b02/season{Teaser,Week,Done,Night}-{1512,1280}.png`.
- [ ] Follow-ups: season board in Records; season stats per player; planner hint (see Claude prompt).

### Phase 4 B1 — rival escalation (p4-b01-rival-escalation, tag p4-b01)
- **Happy hour** (Gear runs only; classic unchanged): `promoLevel` is 0 in week 1, 1 in week 2, 2 from week 3. `isPromoDay` picks that many of days 2–7 of each week by a hash of seed and week (no RNG draws, so it's deterministic and the same for host and guests). On a promo day `applyRivalPromo` (last in `computeModifiers`) cuts traffic to ×0.8.
- **Counter:** a night input `{kind:'rivalCounter', on?: boolean}`. It is for humans only, at night, and only when tomorrow is a promo day. It sets `Rival.counter = day` (optional field; old saves read as "not countered"); `on:false` undoes it. When countered, every drink sells at ×0.85 and traffic is unchanged. Profit per walk-in is about the same, but you serve more people, so you get more tips, stars and served counts. PROTOCOL 34.
- **Heads up** alert `rival:promo` (warn, or info once countered) with a **Match it · 15% off** / **Undo** button (generic `fix` → `onTip`). There's also a morning note on the promo day.
- **Faster knock-offs:** `copyAfter(state)` is 2 days from week 3 of a Gear run (3 before).
- Tests: `src/sim/rivalPromo.test.ts` (6: schedule per week and seed, never on a week's first day, classic none; traffic vs. counter prices; input gating and validation; brief + button + morning notes; faster copy; old-save shape). Dev fixture `rivalPromo`; shots `/workspace/overnight/sprint/p4-b01/rivalPromo-{1512,1280}.png`.
- Follow-ups: rival loyalty card (week 4+), a rival second shop at the cart/café tier, a bot planner hint (logged in the Claude prompt), and a headless balance run past week 1 (`gearBalance.ts` stops at the week-end; it needs a Keep going loop).

### Phase 3 B17 — integration and v3.1.0 (p3-b17-release, tag v3.1.0)
- **Phase 3 is complete** (B1–B17). Version 3.1.0; CHANGELOG `## 3.1.0`; ROADMAP marks Phase 3 done and Phase 4 next; the in-game Roadmap (`public/roadmap.json`) shows Phase 3 done (incl. the Gear Tree) and Phase 4 "now". Phase 4 is planned in `docs/PHASE4_PLAN.md` (8 blocks, branches `p4-bNN-…`, tags `p4-bNN`).
- **Hourly wages:** `wageEach` now scales with `settings.dayLengthSec / 150`, so hired bots on 60 s quick days cost 40% (cafe tier $2 instead of $5 per bot per day). Headless `DAY=60 npx tsx scripts/staffBalance.ts`: 0/28 bankruptcies, week-end cash $28–100. `scripts/gearBalance.ts` takes `DAY=` too.
- **Week-end fix:** "Bought this run" said "Nothing. Bold." on every Gear run; it now lists each gear buy (from `gearLog`).
- **Integration smokes** (`/workspace/overnight/pw/weekgear.mjs`, GEAR=1, 60 s days): with wandering test players, solo 1512 went bankrupt on day 6 and co-op went bankrupt on day 3 (at 1280 with no bots, and at 1512 with 2 bots). These are harness bankruptcies: random humans bump into things, restock badly, and buy a grinder for pods. Every night was in sync and there were no page errors. With NOWANDER, co-op 1280 (2 tabs + 2 bots) reached the week-end at $13 with 41 served, every night "same", no page errors; solo 1512 (1 tab + 2 bots) reached the week-end at $13 with 37 served, no page errors. Shots: `/workspace/overnight/sprint/{b17-solo-1512,b17-coop-1280,b17-coop-1512,b17-coopweek-1280,b17-soloweek-1512}/`, roadmap drawer `/workspace/overnight/sprint/b17/roadmap-{1512,1280}.png`.
- Open (harness, not game): weekgear.mjs humans are poor baristas (solo serves 0–10 a day); a smarter harness player (or bots-only runs) would make browser smokes a better balance signal. The headless balance scripts are the real numbers.

### Phase 3 B16 — head starts carried between runs (p3-b16-meta, tag p3-b16)
- **Meta save:** `src/storage/metaStore.ts`, key `cafetycoon.meta`, its own `version: 1` (separate from the run snapshot and the records). `migrateMeta(raw, records)` never throws: nothing saved → fresh, seeded from G11+ records (a Gear-era best week = one finished week, so v3.0.0 players keep credit); wrong type / bad JSON / wrong version → fresh, raw text kept once under `cafetycoon.meta.bad`; a **newer** version is read but never overwritten; junk fields are cleaned, unlocks never go away. Storage that throws reads as fresh. `main.ts` also wraps every meta call in try/catch, so the title and a new run never depend on it.
- **Progress (Gear runs only):** `foldMeta` at the week-end screen next to the records, keyed `seed|host` so Keep going → Stop only adds the new drinks and a week counts once. Tracks finished weeks (7+ days, not bankrupt), drinks served, the biggest tier, and drinks discovered (the "recipe book" count shown in Records).
- **Head starts** (`src/data/perks.ts`, applied once in `createRun` by `src/sim/perks.ts`, `CreateRunOptions.perk` → `GameState.perk`, both optional, no snapshot or protocol bump): Nest egg +$20 (also raises `startingCash`, so the score stays profit vs. start) for finishing a week; Stocked pantry +10 beans and milk for 100 drinks served; Word of mouth opens at 3★ for growing to the cart. Classic runs and unknown ids ignore it. In co-op the host's pick applies.
- **UI:** a "Head start" select on the title (only once something is unlocked; remembers the last pick), a green "Unlocked for your next run" box on the week-end screen, and a "Head starts" section in Records with progress for the locked ones (e.g. 42/100). Dev fixture `weekEndUnlock`.
- Tests: `src/storage/metaStore.test.ts` (15: perks in the sim incl. score and determinism, fold idempotence, keep-going, bankrupt/classic, cart unlock, records seeding, five kinds of corrupt save, junk cleanup, future version untouched, throwing storage, last pick, title picker, records rows).
- Browser check (`/workspace/overnight/pw/b16.mjs`, 1512x982 and 1280x800, no page errors): fresh browser has no picker; a corrupt `{this is not json` save still starts a run ($120) and leaves the backup; an earned save preselects the last pick, and Nest egg starts at $140 with startingCash $140. Shots: `/workspace/overnight/sprint/b16/{title-headstart,records-headstarts,nestegg-night0,weekend-unlocks}-{1512,1280}.png`.
- Follow-ups: more head starts (a free used grinder, a named regular), cosmetic unlocks (cup colours, shop sign), a "saved lobby" for long co-op runs, and syncing meta across devices (needs accounts, Phase 4+).

### Phase 3 B15 — hired staff with wages (p3-b15-staff, tag p3-b15)
- **Gear runs only** (classic keeps free bots, goldens untouched). New `src/sim/staff.ts`: `WAGE_BY_TIER` stand $1 / cart $3 / café $5 per crew bot per day; `crewCount` (between days = the crew that clocks in tomorrow, since bots only clock in at `startDay`; during the day = bots behind the bar); `wagesForDay`, **`billsForDay` = rent + wages** (the helper asked for above, next to `rentForDay`); `canHire`; `applyStaffInput`; `payWages` at closing right after rent → `DayStats.wages` (optional, old saves fine). Temps and stand-ins never draw a wage.
- **Hire / let go:** new `staff` input (`hire` | `fire`), any connected person, night only. It sets `settings.bots` to a number (crew ± 1) and calls `syncBots`, so firing drops the newest (highest id) and hiring takes the lowest free id, capped at four baristas. PROTOCOL 33.
- **Bills everywhere:** `profitOf` and the records day profit subtract wages; the night brief / `nightWarnings` use `billsForDay` and say "rent and wages" when wages are due; the bot night planner budgets with `billsForDay` (two-line bot-side edit, logged for Claude).
- **Why so cheap at the stand:** `scripts/staffBalance.ts` (7 days, 4 seeds, 150 s days). Without wages a solo stand gains only ~$1–3/day of takings per bot (the line is machine-bound). With wages on, week-end cash: solo + 0/1/2 bots $41–102 / $69–121 / $59–101; duo + 0/1/2 bots $64–111 / $61–97 / $47–92. No bankruptcies. Cart/café wages are a guess until runs reach those tiers; retune after a playtest.
- UI: "Hired staff" row inside the Tonight crew card (names, $/day each, total at closing, ＋ Hire, Let <newest> go), "Crew wages" on the closing receipt and the night receipt drawer.
- Tests: `src/sim/staff.test.ts` (11: auto crew projection, classic no wages, tier scaling, hire cap and fire order, night/person-only, validation, closing pays + records + closing VM, wages can bankrupt, old days' profit unchanged, warning wording, night HTML).
- Browser check (`/workspace/overnight/pw/b15.mjs`, 1512x982 and 1280x800, no page errors): opening night shows Bo and Lu at $1/day; Hire brings in Mo and then greys out (crew of four); letting two go leaves Bo; the Day 1 receipt shows Crew wages −$1.00 and the math adds up. Shots: `/workspace/overnight/sprint/b15/{night-staff,night-staff-one,closing-wages}-{1512,1280}.png`.
- Follow-ups: staff roles (line 1167 idea), per-personality wages, a co-op vote on hiring (today anyone can hire), and a morning-paper line naming the wage bill.

### G11 — the flip: v3.0.0 Gear Tree (gear-g11, tag v3.0.0)
- `pre-gear` tag on main at a36f951 (the last pre-flip commit, == gear-smoke). Rollback: redeploy `v2.2.0` or revert the G11 merge.
- **Gear is the default.** `gearFlag()` is now true unless the URL says `?gear=0` (a hidden classic escape hatch for comparing). Title "Play solo" and co-op lobbies both open on Night 0 "Pick your gear" with $120. `createRun` still defaults to classic, so goldens and old saves are untouched. Old classic saves resume as classic (checked in the browser: a `?gear=0` run left at night, reloaded without the flag, Resume → classic stations, same seed).
- **Records split** (GEAR_TREE §2.1). Still `version: 1` (v2 code reads it fine). New `split` marker and `classic` bests; on first load, pre-v3 bests move to "Classic (retired)" and the headline tiles start fresh for Gear runs. Classic runs (old saves, `?gear=0`) only update the classic line. Lifetime totals and the hall of fame carry on. The records dialog shows one "Classic (retired): Best week $1,480 · Busiest day 41 served · …" line.
- **Protocol 32** so a friend on a cached v2.2 tab gets the existing "refresh" message instead of joining a Gear room with old code.
- `package.json` 3.0.0 (title shows "CafeTycoon v3.0.0"), CHANGELOG 3.0.0 section (the Gear Tree in players' words, plus the two Unreleased bot/collision lines).
- Tests: gearFlag default, 3 records-split tests (old blob migrates, Gear vs classic folding, dialog line). Browser check `/workspace/overnight/pw/g11check.mjs` at 1512x982 and 1280x800 + `?link=local` co-op (host and guest both Gear, $120), no page errors. Screenshots: `/workspace/overnight/sprint/g11/{title,records,resumed-classic,new-run-night0}-{1512,1280}.png`, `coop-guest-night0-1280.png`.
- Note: GEAR_TREE §10 asked for "at least one good `?gear=1` playtest" before the flip. Kennedy asked overnight for the flip once the integration smoke was clean; the overnight smokes (4 full weeks, solo and co-op, both sizes) stand in for it. If the first real game night disagrees, roll back to `v2.2.0`.

## Ideas from Kennedy, 2026-10-30 (later, not scheduled)

- **Overcooked-style recipe orders.** Customers come in with a specific build, not just a menu drink: "oat
  latte, extra shot, vanilla", shown on the ticket as the steps and add-ins to assemble. Today tickets show the
  fixed recipe steps for a menu drink, and twists are set by the crew per drink at night, never per customer, so
  this is new. It pairs with longer patience for heavily customized drinks (see the batch/pickup design) and
  with the station-tuning idea in "Kennedy's design notes, 2026-10-29".
- **Wrong drink at pickup, names on cups.** Once customers pick up their own drinks, someone may grab the wrong
  one, and names on cups become the fix. Follows the batch/pickup work
  (docs/superpowers/specs/2026-10-30-batch-pickup-design.md).

## Morning-prompt work, 2026-10-30 (Claude)

- **Planner for Gear and Phase 4** (tag `planner-gear-p4`): gear buys along the gearBalance path, staff:fire,
  rival:promo, rival:loyalty, branch:open/staff/send; budget holds back `billsForDay`; no menu tips on an empty
  counter. **For the UI lane:** the new rows reuse existing `AdviceKind` values (a new kind would break
  `tipsVM`'s `Record<AdviceKind, …>`), so tell them apart by `id` prefix or `input.kind`; `coveredBy()` should
  learn `rival:promo` / `rival:loyalty` so chips don't repeat the night brief's alerts. Adding proper kinds later
  is fine: change `AdviceKind` and `tipsVM` together.
- **Overnight-edit review fixes** (tag `review-fixes-1`): I1 gear vote (settle on leave, withdraw first; when
  the only other voter leaves, the proposer's vote passes), I2 call counts only once rung (`callRang`), I3
  americano needs E2+ and americano/doppio/red-eye are off a pods-only bar, I4 `isReservedId` guards on join,
  seat, `noteReport` and the records hall; M1 café branch, M2 records `dayProfit` = `profitOf`, M3 branch
  stock credit, M6 cover bots unpaid, M8 connected Managers only, M9 pots cleared at closing, M10 promo-day memo.
  Open: review item 8 (branch loss in the brief's/planner's bills) and M4, M5, M7. **For the UI lane:**
  src/ui/branchView.ts still values a send at list price (the sim now uses the restock price).
- **Bots on Gear stations** (tag `bots-gear-1`): pods and mixed bars, jams and dead machines, drip pots,
  level-up drinks with the clash rule, pour-over, twins/edge slots, no early pulls for snobs and the arts crowd;
  `recipeAt` (shared with `interact`), insert steps carry `makes`. gearBalance 28×3: served 750 → 769, lost
  201 → 193, cash $643 → $751, 0 bot mistakes. Open: a cold pot can't be dumped (bots serve it at half tip until
  empty; the batch/pickup work may add a "dump the pot" action); the optional "prefer near-level-up / better
  area tip" ordering was skipped (it would break queue order); drip pots, twins and mixed bars are proven by
  unit tests only (gearBalance stays on the stand): worth a browser smoke on a café Gear run.

## 3.3.0: batch coffee, pickup counter, condiment bar (Claude, 2026-10-30)

Design `docs/superpowers/specs/2026-10-30-batch-pickup-design.md` (approved by Kennedy), plan
`docs/superpowers/plans/2026-10-30-batch-pickup.md` (16 tasks). Tags along the way: `batch-foundation-1`,
`batch-saves-1` (snapshot 28), `batch-till-1`, `batch-planner-1`, `batch-condiments-1`, `batch-steep-1`,
`batch-pickup-1`, `phone-bots-1`, `batch-extras-1`, then `v3.3.0` (protocol 41). Final checks on main: 1286 tests; gearBalance 28×3 and p4Smoke 28×3 with no bankruptcies and no black coffees, p4Smoke OK.

What landed (Gear runs; classic is legacy):
- Steeped cold brew and drip pots pour instantly; cold brew is steeped at night (`steep` input, sticky target,
  concentrate only for the top-up, leftovers keep a day, `coldBrewLeft`), C4/C5 got a 60-cup steep cap.
- Gear patience by drink (batch ×0.9 … pour-over ×1.7).
- Till → pickup: ring-up moves a customer to `stage: 'pickup'` (+50% patience); drinks set on the 4-slot pickup
  counter are taken by the longest-waiting customer for that drink, who pays and tips there; hand-serve is gone.
- Condiment bar (20 servings, fixed spot `condiments`) and boxes ($6, carried from the corner, `Player.tool:
  'box'`); 60% of plain drip / cold brew customers (pure hash of customer id) stop there; empty bar = tip ×0.8.
- Bots: ring up, set drinks on the pickup counter, pour taps in one step, fetch a box when the bar is at ≤ 2,
  skip the Wi-Fi camper, never prep cold brew onto the counter, keep counter spots free when idle, answer the
  branch phone after 10 s (idle bot; order taken after a no-walk-out day, machine fixed with ≥ 2 branch staff).
- Planner: tomorrow's steep number and condiment boxes; brief alerts for an unaffordable steep and a dry bar.
- Saves: snapshot 28 moves loaded Gear saves to the order stage and adds the bar.

Events for the UI: `till.rung { customer, drink, by }`, `pickup.take { drink, customer, by }`,
`condiment.use { customer }`, `condiment.black { customer, text }` (a grumble line), `condiment.refill { by }`,
`steep { cups, paid }`, `call.answer { by, take, kind }`; a box going home is `drop { item: 'box' }`. Log entries
are pruned after 120 ticks.

**For the UI lane (Grok):** all done in `ui-3.3.1` (branch `ui-batch-pickup`, version 3.3.1, protocol still 41).
- [x] `src/ui/live.ts` counter hints: in Gear the till says "Ring up", the pickup counter says "Set on the pickup
  counter" with a drink in hand (or takes a cup back with empty hands), the condiment bar takes a box; tickets end in
  "Pickup". The old hand-off-first hiding rule is gone in Gear. Classic hints are unchanged.
- [x] Gear draws the 4 pickup coasters (`PICKUP.slots`) with cups; a cup a waiting customer wants glows, and a stale one
  blinks red. Also drawn: the condiment bar with a 20-pip servings gauge (amber when low, red and blinking "EMPTY: bring
  a box"), the box stack in the corner ("BOXES ×N" / "NO BOXES"), a box in a carrier's hands, and the pickup crowd
  (`stage: 'pickup'`) on a "PICKUP · WAIT HERE" mark, left of the till on the order line's y. Helpers are pure in
  `src/render/pickupModel.ts` (tested). The pickup counter and the bar no longer get "2"/"3" duplicate-station badges.
- [x] `crewModel`: `pickup.take` shifts `mem.putters` and fires the teamwork burst; an R-drop on the counter counts as
  a put. Serve and teamwork bursts anchor at the pickup counter in Gear.
- [x] Audio: `pickup.take` plays the serve cue. The till ring, a cup set down, the bar refill, the grumble and a box set down
  have their own cues too.
- [x] Feedback bursts: `condiment.black` shows the grumble line over the bar (and costs vibe like a slow serve),
  `steep` shows "🧊 N cold brews on tap (P fresh)" at the morning, and `call.answer` shows who took the branch's
  order, talked it through the machine, or let the phone ring.
- [x] `nightWarnings.rentTomorrow` adds `branchExpectedLoss` (the warning says "Rent, wages and the branch are $X").
  `branchView` values a send at `restockCost(state, supply, 1) / pack.size`, as `sendStock` credits it.
- [x] Planner chips tell the reused `AdviceKind` rows apart by `input.kind` (steep, condiment boxes, gear, staff fire,
  rival promo/loyalty, branch send/staff), with their own icon and short text. `coveredBy()` is exported and learns
  `rival:promo`, `rival:loyalty`, `condiments` (boxes) and `steep` (concentrate restock).
- Screenshots (1512×982 and 1280×800): `/workspace/overnight/sprint/ui-331/` on the overnight box.

**Notes for Claude (from the UI lane, 3.3.1):**
- The night screen has no manual steep control. The steep target is set only by accepting the planner's steep
  chip. If players should set it by hand, it needs a sim-side input contract first; the UI will draw it after.
- Cups the pickup crowd doesn't want sit on the counter until they go stale. A visible "bin it" or "take back" use at
  the counter would need M2 (below) settled first.
- The `steep` event fires at the morning, so its burst shows over the opening scene, not at night.

Open (sim lane):
- Pickup review minors still open: tests at src/sim/pickup.test.ts:182, :244 and :208-219 would pass without
  the feature (tighten them); a full counter bins the held drink rather than taking back a cup nobody wants (M2).
- A cold drip pot can't be dumped; bots serve it at half tip until empty.
- Bots answer the phone but never travel to the branch (travel is not built).

## ui-3.4.1 (UI lane): FB2 A4 fridge

UI side of A4 (sim `fb2-a4`, protocol 44). No sim, net, host, storage or data changes; protocol unchanged.

- [x] **Fridge art:** `render/layers/fridgeArt.ts` (`buildFridgeArt(id)` f1 Dorm Room Cube, f2 Garage Beer Fridge,
  f3 Chrome Reach-In, f4 Udder-Matic 3000; `drawCarton`, `drawBarCaddy`), `fridgeArtRise.ts` (`FRIDGE_RISE`, no Pixi).
  `layers/stations.ts` `buildFridge`; `pickupModel.counterSpotOf` → `'fridge'`; `scene.buildStations` keys on
  `fridgeGear(state)`.
- [x] **Milk out + glow:** `render/fridgeModel.ts` (pure: `fridgeToast`, `fridgeLabel`, `milkSpot`, `cartonsFor`,
  `fridgeGlow`) and `render/layers/fridge.ts` (`FridgeVisuals`: cartons by the steamer, "N milk out" tag, floor glow).
- [x] **Counts:** `countsModel` gives the fridge `unit: 'milk left'` and `rise` (`FRIDGE_RISE`); `counts.ts` draws it.
- [x] **Carry art:** `actors.ts` draws the carton (`tool 'milk'`) and the bar box (`tool 'bar'`).
- [x] **Hints (`ui/live.ts`):** `fridgeHint` (Grab milk / No milk in the fridge / Hands full), `carryHint` (Put a
  carton out / Put the milk away / Put the condiment bar away / Set the bar back out), `liftHint` at closing (Pick
  up the milk / Pack up the condiment bar). `emptyHandsWanted` is mirrored with `tapCupRecipe` (not exported by sim).
  `toolLabel(player)` adds "· N milk" / "· N servings"; `TOOL_LABEL.bar` is "Condiment bar, packed up" 🧺.
- [x] **Closing checklist:** `closingListVM(state)` → `HudLive.checklist` while `closingSoon`; `hud.ts` `.hud-checklist`.
- [x] **Night:** `gearVM.fridgeVM(state, voters)` → `GearVM.fridge`; `night.ts` `fridgePanel` (`data-action="fridge-buy"`),
  `onFridge` → `{ kind: 'fridge', fridge }`; the Udder-Matic vote shows in the existing gear-vote bar. Brief row
  `fix.kind === 'fridge'` gets "Buy it · $N" / "🗳️ Ask the crew · $N".
- [x] **Bubbles and sounds:** `crewModel` (all eight events; `supply.spoil` also dips the vibe), `audio/cues.ts` cues
  `fridgeOpen`, `fridgeShut`, `milkOut`, `liftUp`, `spoil`, `closingSoon`, `moo`.
- Tests: `src/ui/fridgeUi.test.ts`. Screenshots: `/workspace/overnight/sprint/ui-fridge/`.
- [ ] Later: C9 wand (steamer → espresso wand) will need `milkSpot` to point at the espresso machine.

## ui-3.4.0 (UI lane): tier looks, grow transition, nudge, tips

- [x] **Tier looks:** `render/tierLook.ts` (`tierLook`, `isOutdoor`, `barSkin`, `leaseLines`) and
  `render/layers/outdoor.ts` (`buildOutdoor(look)` → back / props / over). Stand = sidewalk (umbrella, lamppost,
  pots, A-frame, kerb + road); cart = park plaza (awning, string lights, bench, trees, cobbles). Café unchanged.
  `layers/stations.ts` `setBarSkin` draws the counters as a folding table (stand) or cart panels (cart). Layout and
  station positions untouched; the menu board moved into its own container (`wall.menuBoard`).
- [x] **Grow transition:** `ui/growModel.ts` `detectGrow(prev, state)` (same seed, tier index up) +
  `gainedDiff(from, to, gear)`; `ui/growFx.ts` wipe + banner + confetti (1.6 s), then the "What you gained" card.
- [x] **Night nudge:** `growNudge(state)` (night, next tier affordable, not a Gear run's day 1) →
  `GrowthVM.nudge` → chip `[data-nudge]` jumping to Extras ▸ Shopfront (Spend view `grow` renamed "🏪 Shopfront").
- [x] **Tips:** `ui/hintsModel.ts` (pure: once each, snooze 15 min, off, reset; triggers) + `ui/hints.ts` bubble.
  Stored per browser under localStorage `cafetycoon.tips` (UI-owned). Pause menu: Snooze / Turn off / on / Show again.
- [x] **Price forecast** labelled "Rough guess … A strategist can tell you more" (no strategist hire built).
- Tests: `src/ui/uiTiers.test.ts`.
- [ ] Later: a strategist hire that gives a better forecast (Kennedy's idea; not built).

## ui-3.3.5 (UI lane): no "tap" in cold brew wording

- [x] UI strings: `live.ts` `DRINK_STEPS` ('Tap' → 'Pour cold brew'; iced latte 'Ice + milk') and
  `STATION_NAME.coldBrewTap` → 'Cold brew'; `countsModel.STEP_ICON` keys follow; `viewModels` station list
  '🧊 cold brew' and checkout fee '% per card sale'; `scene.ts` steep pop-up "N cups of cold brew ready".
  Touch-gesture "tap" ("Tap for steps", "tap to undo", "Tap a slot") is left as is: it means tapping the screen.
- [ ] Sim/data strings still saying tap: listed for Claude in `docs/HANDOFF.md` (Grok → Claude, 2026-10-30).

## ui-3.3.4 (UI lane): A5 counts, GEAR_TREE 5b: notes for Claude

- [x] **A5 counts:** `render/countsModel.stationCounts(state: GameState)` now loops `stationCountsLeft(state)` and only
  adds the look (tone `low` for a batch tap at ≤ `COUNT_LOW`, `cold` for a cold/stale drip pot or a cold waiting
  output, and the cooling ring). The old UI-side rules (skipping counters/trash, brewing, pot out) are gone. The
  condiment bar is skipped on purpose: its servings gauge already shows the same number. `ui/gearVM.hudGearVM`
  reads `stationLeft` for the tap's "n/8 left" and the pot's "n/8 cups" (null → "sold out" / "empty pot (E)").
- [x] **GEAR_TREE 5b:** APPROVED; folds in the HANDOFF decisions; the fridge table is now the café-size plan.
- A4 (fridge) and C9 (wand) not landed in the sim yet, so nothing wired; names stay as planned in HANDOFF.

## ui-3.3.3 (UI lane): sink, pots, cold cups, solo helpers: notes for Claude

Wires the UI side of Feedback 2 A1–A3. No sim, net, host, storage or data changes; protocol unchanged.

- [x] **A3 sink:** `src/render/sinkModel.ts` (pure, tested) and `src/render/layers/sink.ts`; the sink fixture is
  `buildSink` in `layers/stations.ts`. `pickupModel.counterSpotOf` and `countsModel` treat `'sink'` as its own spot
  (no till, no count). `live.ts`: `counterName` → "Back sink"; `sinkHint` runs before the other counter hints:
  drink → "Dump it" (cold: "Dump it: the … went cold"), `tool === 'pot'` → "Dump the pot", grounds → "Grounds go in
  the bin", empty hands → nothing.
- [x] **A3 pot carry:** `tool === 'pot'` draws the pot in hand (`layers/actors.ts`), hint "Carry it to the sink";
  the hand slot shows `TOOL_LABEL` ("Old drip pot"). A drip machine with `needsDump` shows "Stale pot / Pot went
  cold: lift the pot (E)" and the badge "STALE: dump at sink" / "COLD: dump at sink"; `Station.potOut` shows
  "POT OUT · name" and "pot out (sink)" on the Gear card.
- [x] **A3 events:** splashes on `mess.spawn` (milk, grounds) and `bin.leak` (`chaosModel`); sounds `sinkDump`,
  `potLift`, `stalePot`, `binLeak`, `coldCup` (`audio/cues.ts`, `audio/recipes.ts`); pop-ups for `sink.dump`,
  `pot.stale`, `bin.leak`, `pickup.cold` (`crewModel` notes, held ~3 s in `layers/fx.ts`).
- [x] **A2 cooling ring:** `pickupModel` and `passCool` read `slotCool` when `coolsOnCounter` (hot cups) and
  fall back to `PassItem.ticksLeft` for iced/old cups; drip rings keep `potColdAt`, and a waiting machine output
  now rings by `outputSince`; a held cup reads `heldCool` (hand slot
  "cold" tag, hint "cold: dump it at the sink"). Pickup take-back hint uses `takeBackIndex` / `takeBackCold`.
- [x] **A1 solo toggle:** `title.ts` `SOLO_BOT_CHOICES` [0,1,2], `soloBotsSeg`, `readSoloBots`; `StartChoice.soloBots`
  is saved by `startSolo` in `src/main.ts` via `settings.set({ soloBots })` (UI side; the `CreateRunOptions` line is
  untouched).
- [x] **A5 counts:** done in ui-3.3.4.
- Crew tips with 0 solo bots: still silent (open question in HANDOFF).

## ui-3.3.2 (UI lane): counts, cooling rings, step icons: notes for Claude

Built in `src/render/countsModel.ts` (pure, tested) and `src/render/layers/counts.ts` (Pixi). No sim changes.

- **Cooling ring is wired only where the sim has a real timer:** cups on the pickup coasters (`PassItem.ticksLeft`
  against `ECONOMY.pass.staleSeconds`) and drip pots (`potColdAt` against `GEAR[id].pot.coldAfter`).
  **Left unwired: a shot or milk waiting at a machine (`Station.output`).** It has no age or stale timer, so it
  never cools. If you want it to (Kennedy's "shots die"), add a timer to the station (e.g. `outputSince` plus a
  per-item limit). Then `drawCoolRing(g, x, y, r, frac)` in `layers/counts.ts` and `coolFraction(left, total)` take
  a 0..1 fraction directly, and `stationCounts()` already has a `cool` field per station to fill in.
- **Step icons over a carried cup** read the tickets' own step lists (`ticketSteps` / `nextStepIndex`). The target
  is the customer whose drink exactly matches what's held, else the first ticket (pickup first) the item fits.
  This is a guess: the sim doesn't record which order a cup is "for". If it ever does, pass that drink in.
- **Espresso rework and fridge line** are a proposal only: `docs/GEAR_TREE.md` section 5b, marked PROPOSED and
  awaiting Kennedy's OK. It touches gear data, the sim and saves (retiring S1–S3), all in your lane.

## Feedback 2 (Claude, sim lane, 2026-10-30)

Source: `docs/CLAUDE_PROMPT_FEEDBACK_2.md`. One branch and tag per item. Names below are as built.

- **A1 solo bots + helper bots (`fb2-a1`).** Solo runs read a new local setting `soloBots` (default 1; 0–3 or
  'auto'; `src/storage/settingsStore.ts`), passed to the run as `CreateRunOptions.settings.bots`; co-op lobbies
  keep their own choice. `src/main.ts` solo start passes it (one line, sim lane). 0 bots is a supported solo game
  (no wages, no staff advice; crew tips are silent because no bot voices them: the UI may want an unvoiced
  fallback). In Gear runs with a person in the café, crew bots act as helpers (`src/sim/bots/helper.ts`): a person
  keeps the machine nearest them (within `ECONOMY.bots.helperGuardTiles` 1.5) while it brews or holds a cup,
  while they hold something it takes, or until an order needing it has waited `helperGuardSeconds` (8 s); the
  till stays theirs only while their hands are empty and the front customer is under 3 s; fresh tickets
  (`helperTicketSeconds`, 3 s after appearing or being rung) are left to free people. No new state, inputs or
  events. **UI lane:** draw the Off/1/2 solo toggle writing `soloBots` (done, ui-3.3.3). Open: tune both windows by playtest.
  Morning-prompt leftovers (optional, not built): bots favouring well-tipping families and drinks near a level-up;
  bots treating a flowing D4b as the fast station; planner leaning to cash late in a short season week; bot
  self-review from `report.crew`; G8 vote toast (UI lane).
- **A2 cups go cold (`fb2-a2`, protocol 42).** Hot drinks cool from the tick they're made; the clock follows the
  cup: `Station.outputSince` (machine output), `Player.heldSince` (in hand), `PassItem.madeAt` (pickup counter);
  absent = fresh. Helpers in `src/sim/cooling.ts`: `coolFraction(state, madeAt, drink)` (0 fresh .. 1 cold; always
  0 for iced), `slotCool(state, state.pass[i])`, `stationCool(state, station)` (a drip pot by its own `potColdAt`,
  else the waiting output), `heldCool(state, player)`, `takeBackIndex(state)` / `takeBackCold(state)`. Thresholds
  `LUKEWARM` 0.5 (half tip) and 1 (cold: taken, not paid, counts as a walk-out). `COOLING_SECONDS`: shots 45 s,
  milky and filter 60 s, iced never. Customers take the freshest matching cup; empty hands at pickup take back
  cooling cups coldest first, then oldest. Hot cups with a clock no longer go stale on the counter (iced and
  old-save cups still do). Bots clear a cold counter cup before ringing, bin and remake a claim whose cup went
  cold, clear a cold or stray output blocking a machine (a warm stray goes on the counter). Events:
  `cup.cold { slot | station, drink }` (once per cup), `pickup.cold { customer, drink }`,
  `review.bad { customer, drink, reason: 'cold' }`, `pickup.takeBack { drink, by, cold }` (`pass.take` still
  fires). **UI lane:** `pickupModel`'s stale blink and 3.3.2's `passCool` read `PassItem.ticksLeft`, which no
  longer runs down for hot Gear cups: read `slotCool` instead (note it runs 0 fresh → 1 cold, the opposite of
  `countsModel.coolFraction`) (done, ui-3.3.3). Settles pickup M2. Open: no thermal gear yet; p4Smoke end cash is lower (served
  within 2%), to revisit in the A balance pass.
- **A3 back sink, stale pots, more messes (`fb2-a3`, protocol 43).** Spawns: `src/sim/spawn.ts` `freeSpot`/`settle` keep
  every barista placed off fixtures.
  - Fixed counter-kind spot `sink` (`SINK_ID`, `layoutFor(tier).sink`, `spotOf` → `'sink'`): stand (7,4), cart (9,4), café (11,4). It is worked from the tile to its left or the one above it, and is never bought, sold or moved.
  - E or R with a drink at the sink: `sink.dump { by, item }` (counts as wasted, no money back, clears the cup clock).
  - E with empty hands at a cold (past `potColdAt` with cups left) or stale drip pot lifts it: `Player.tool = 'pot'`, `Station.potOut = playerId`, `pot.lift { by, station }`. The machine can't pour, brew or take a parked drink while the pot is out.
  - The pot dumped at the sink goes home empty: `sink.dump { by, item: 'pot' }`. Put back undumped (R away from the sink, leaving, closing, an espresso collapse) it goes home stale: `drop { item: 'pot', station, by }`.
  - A pot with cups left at closing is stale next morning (`Station.stale = true`). `pot.stale { station }` fires **each morning** while it stays undumped. A stale pot can't pour or brew until dumped.
  - Cold pots no longer pour half-tip cups. A brew miss (`potOff`) still does.
  - Bin leak: 1% per binned drink, a spill on the bin's front tile, `bin.leak { by, at, x, y }`. Milk drip at a steamer or wand: 3% per steam. Grounds at a grinder: 3% per grind.
  - Every Gear mess logs `mess.spawn { kind: 'milk'|'grounds'|'leak'|'spill', x, y, at? }`.
  - Gear floor meter: −8 per new mess, then −0.12/s per mess while it sits, and +0.12/s once the floor is clear (a mess mopped at once heals in about a minute). Customers mind the floor only below 80%.
  - Bots:
    - dump an old pot when they need the drip machine, or when idle and no person is working it (A1 `heldByPerson`);
    - skip a machine whose pot a person carries;
    - pour spare and cold drinks down the sink when it is as close as the bin;
    - mop any mess when they have nothing to make (orders still interrupt).
  - **UI lane to wire (done, ui-3.3.3):**
    - sink art and a hint (`spotOf` → `'sink'`; today `counterName` says "Till", `gearCounterHint` falls into the condiment-bar branch, and `render/pickupModel.counterSpotOf` draws a till);
    - the pot in hand (`tool === 'pot'`, hint "carry it to the sink");
    - a cold or stale pot hint and a "STALE: dump at sink" badge (`Station.stale`);
    - a machine with its pot out (`Station.potOut`);
    - puddle splashes on `mess.spawn` / `bin.leak`;
    - sounds for `sink.dump` / `pot.lift`.
- **A5 exact counts (`fb2-a5`).** `src/sim/counts.ts`: `stationLeft(state, stationId): number | null` and
  `stationCountsLeft(state): { id, n }[]` (stations with a count, in station order). Null means draw nothing, never 0.
  Counts: tap `batchLeft`; drip `potLeft` (null while brewing or while the pot is out; a stale pot still shows its
  cups); a waiting machine output 1 (one slot per machine); condiment bar servings; pickup counter cups. Till, sink,
  trash: null. Fridge milk joins with A4. No state, inputs or events. **UI lane:** have `countsModel.stationCounts`
  call `stationCountsLeft` (widen its state type to `GameState`) instead of reading fields; cooling stays in
  `src/sim/cooling.ts` (`stationCool`, `slotCool`). (done, ui-3.3.4)
- **A4 Fridge, morning setup and closing (`fb2-a4`, protocol 44).**

  **Ownership.** Gear runs keep milk in a fridge, a counter-kind station with id `fridge` (`FRIDGE_ID`) at `layoutFor(tier).fridge` = (1,3), and `spotOf` returns `'fridge'`. The fridge follows the shop size (`src/data/fridges.ts`):
  - the stand has none until it buys the Dorm Room Cube (f1, a $20 card, holds 24);
  - the cart comes with the Garage Beer Fridge (f2, 48);
  - the café comes with the Chrome Reach-In (f3, 96, overnight milk spoil ×0.5);
  - the café can buy the Udder-Matic 3000 (f4, a $320 card, 128, ×0.25, pours milk to the bar by itself).

  Fridges are never sold or downgraded. `GameState.fridge?: FridgeId` is the one bought; `fridgeGear(state)` is the one the shop has (null = none). The shop shows `fridgeCards(state)` (`{ id, price }[]`) as single cards; a buy sends `{ kind: 'fridge', fridge }`.

  **No fridge** means no milk restock, no cartons, and a bar that spoils every night. Milk restock buys only whole packs that fit.

  **Milk out at the bar.** `supplies.milk` is the milk in the fridge; steamers, wands and the tap draw from `GameState.milkOut`. E with empty hands at the fridge takes a carton (`Player.tool = 'milk'`, `Player.carry` ≤ 8; `fridge.take { by, item: 'milk', n }`). E at a steamer, wand or tap puts it out (`milk.out { by, n, station }`).

  **Closing soon** is the last 30 s of the day (`GameState.closingSoonAt`, `closing.soon { left }` once, also on close-early). During it:
  - empty hands at a milk station lift the milk (`milk.lift { by, n, station }`);
  - empty hands at the condiment bar lift what's left (`Player.tool = 'bar'`, `bar.lift { by, n }`);
  - E at the fridge stores either (`fridge.put { by, item: 'milk' | 'bar', n }`). Bar servings go to `GameState.barAway` and come back on the bar next morning; any overflow waits in the fridge.

  **At close**, anything left out spoils: `supply.spoil { item: 'milk' | 'bar', count }`, `DayStats.spoiled.milk` and `DayStats.spoiledBar`, costed in `spoiledValue`. The Udder-Matic emits `fridge.auto { n }`.

  **Helpers** (sim/fridge.ts): `closingChecklist(state) → { milkAway, barAway, potsEmpty, floorClean, counterClear }`, `closingSoon`, `readyStock(state, 'milk')` (what the steamer can draw now), `fridgeGear`, `fridgeCards`, `fridgeCapacity`, `autoMilk`. A5's `stationLeft(state, 'fridge')` is the milk inside the fridge.

  **Bots** put a carton out ahead of milk orders, count cartons on their way, and put the milk and the bar away once the doors lock and nothing is left to steam (or in the last 8 s); the closing waits for them.

  **Planner and brief:** advice `fridge:f1` / `fridge:f4` and alert `fridge`.

  **UI lane:**
  - the fridge sprite, and its level from `fridgeGear`;
  - the two fridge cards on the night shop;
  - a "Put a carton out" hint from `readyStock`;
  - the Closing soon banner with checklist ticks;
  - carton and bar-box carry sprites;
  - fridge hand hints: live.ts `counterName` and `gearCounterHint` currently treat `'fridge'` as the till or the bar, and render `pickupModel.counterSpotOf` draws it as a till;
  - at the tap during closing soon, a hint that E lifts the milk.

  **No fridge.** Pantry milk doesn't count until a fridge is owned.

  **Co-op vote.** The Udder-Matic card ($320) goes to a co-op vote like $50+ gear: `state.fridgeVote { by, byName, fridge, amount, yes, no }`, voted with the gear vote input, one proposal at a time, lapsing at opening, with the result in `gearVoteLast`. The UI lane draws it like the gear vote.

  **Known limit.** Last call doesn't interrupt a bot that is busy making a drink.
- **Cold brew wording (`fb2-tap-wording`, Grok's request).** No "tap" in sim/data player text: tickets read
  'Pour cold brew' / 'Ice + milk' / 'Cold brew again (sweet cream)'; equipment 'Cold-brew keg', catalogue 'Second
  cold brew keg', gear c4 'The Kegerator', describe 'cold brew', steep's morning note "…had no room left…". Code ids
  (`coldBrewTap`, `batchLeft`) unchanged; card-payment "tap terminal" unchanged.


## Round 3 (Kennedy approved 2026-10-30)
Approved Oct 30, 2026 7:46 PM (Toronto). Sim lane builds; UI lane (Grok) wires. Linked from HANDOFF.

1. **More lattes.** Goal: coffee shops make their money on lattes; shift the order mix toward `latte` and
   `cappuccino` when the gear can make them, plus occasional "and a latte for my friend" add-on asks if cheap.
   Freedom: weights, how add-ons attach (combo machinery from B6 is fine). Don't touch: batch must stay viable,
   don't make espresso mandatory. Grok wires: add-on ask bubble and ticket line.
2. **Money (VERY slight).** Goal: soften the squeeze a little; the main cause was the stand's 0.75 price. Suggested:
   stand price 0.75→0.8, supply packs −10%, elasticity 1.8→~1.4, fix `unitCost` (drip per pot, cappuccino counts two
   milks), fix `brief.ts` `expectedUse` restock estimate, cap forecast orders by real capacity (queue + serve rate).
   Log price walkouts as `walkout { customer, reason: 'price' }` instead of silently not spawning. Freedom: exact
   numbers within "slight". Don't touch: cart/café price multipliers. Grok wires: "Too pricey!" bubble + walk-out.
3. **Price calculator becomes a paid hire.** Goal (Kennedy's idea): without a hire, the night shows only a rough
   guess. `staff.strategist` (~$7/week) gives the honest forecast and sets peak prices for the current crowd.
   `staff.marketer` (weekly fee) brings more customers at your current prices. Both stack. Freedom: fees, how
   "rough" the guess is, input names (please list). Don't touch: manual pricing stays available. Grok wires: hire
   cards on the night screen, rough-vs-honest forecast display, "set by Strategist" marks.
4. **Line and waiting area.** Queue capacity is already per tier (stand 3, cart 5, café `ECONOMY.queueCapacity`).
   Goal: an inside waiting area where a few customers browse before joining the line. If the line doesn't move for a
   while, one customer says "Line's too long!" (`line.complain`), with a cooldown; during it, others just leave with a
   tumbleweed (`line.leave { customer, quiet: true }`). Freedom: timings, area size per tier. Don't touch: queue
   caps. Grok wires: waiting-area art and browsers, complaint bubble, tumbleweed.
5. **Order-taking time by register tier (small).** Cheapest register ~1–1.5 s to ring up, faster per tier; the top
   tier is self-order and moves the customer to pickup with bonus patience. Expose ring-up progress 0..1. Freedom:
   exact seconds, field name. Don't touch: keep it small. Grok wires: ring-up bar at the till.
6. **Early growth (nudge).** Maybe cart $80→$70. Emit an event or state for "next tier affordable". Freedom: name
   and amount. Grok wires: night nudge "You can afford a cart!".
7. **Tier upgrade summary.** On `grow`, give the UI a diff (queue, price, traffic, rent, new crowd, unlocks).
   Grok wires: transition between stand / cart / café and a "what you gained" card.

### Later (not this round)
- **Café add-ons first:** a seating nook that juts out with a big window; an outside queue of shadow figures.
- A cashier hire who entertains the line (line can grow to 6+).
- Area upgrades mid-day rather than on another screen.
- A split money pool for co-op.
- Upgrade paths: speed, reliability, taste, quality.
- A smart café path (top registers pair with smart machines), ending in a self-running shop with conveyor belts.
- **Balance pass (`fb2-balance`, stopped early by Kennedy's call: playtests drive balance now).** Fixes kept:
  the balance harness steeps cold brew on night 1; bots `reclaim` a lost claim onto another order for the same
  drink and collect grounds left in a grinder after 15 s (`leftGrounds`, ported from B6); during closing soon, E
  at the cold brew for a sweet cream pours instead of lifting the milk; bots meeting head-on behind the bar no
  longer block each other all day (also in v3.3.1). No constants changed; the cube stays $20.
- **3.5.0 released** (Feedback 2 part A + balance fixes). UI lane already shipped 3.4.0/3.4.1, hence 3.5.0.
- **B6 multi-drink orders (`fb2-b6`, protocol 45; UI lane to draw).** Gear only.
  - **Tickets:** a group, a combo or an office run is one ticket: `Customer.items: { drink, done, by?, slips?, temp?, black?, cold? }[]`, with `Customer.order: 'combo' | 'office'` (absent for groups). `drink`/`extra` mirror the undone items. Rung once; each cup taken off the pickup counter ticks one item; the ticket pays when the last item is taken (`order.done { customer, paid, tip }`, and every cup's `served` event lands then, with `left: 0`). Walk out part done: nothing paid, the cups taken are wasted (not an office run's).
  - **Cold cups:** a cold cup ticks its item unpaid (`pickup.cold`, plus `review.bad` except office) and the rest carries on.
  - **Gear groups** now pay once, at the end.
  - **Combos:** from day 2, about 1 in 12 walk-ins order 2 drinks (`ORDERS.combo.chance` 0.08; a pair, or espresso drink + drip), ×1.3 patience. `order.combo { customer, items: "latte,drip" }`.
  - **Office runs:** on the cart and at the café from day 3, about every other day (`GameState.office { day, at, called?, came? }`). The phone rings 10 s ahead (`office.call { at }`, `at` = the tick they're due; with the queue over capacity they wait outside and come later). 4–6 drinks (`ORDERS.office.size` by tier), ×4 patience, arriving 5–15% into the day (`order.office { customer, count }`). Finished: +25% bonus tip, counts as one customer for reputation (`DayStats.officeExtra`). Lost (patience out, or still in when the doors lock): `order.lost { customer }`, no lost customers, no waste, no bad review, no reputation hit. `DayStats.office: 'served' | 'lost'`. They take a cup only when nobody else wants it; bots keep one office drink in the queue at a time and make the rest after the walk-ins'. Kennedy to tune size, patience and combo rate in play.
  - **Bots:** cover each undone item as its own order (one claim per item, never two on one item left). In Gear, a claim lost mid-chain moves to another order for the same drink (never onto a ticket held for a free person), and grounds left in a grinder are collected after 15 s (30 s while someone else on the floor counts as a person by A1's rule).
  - **UI to do:** a tall ticket with a tick per item (`items[].done`, maybe the cold one crossed out), the office-run phone card (`office.call`, a countdown to `at`), and a receipt line for `DayStats.office`.
  - Open: two bots crossing a corridor mirrored each other all day on p4 seed 205 day 9 before the balance
    branch's head-on fix (748100f); recheck in play.

## Round 4 (sim lane, Claude)

Spec: `docs/CLAUDE_PROMPT_ROUND_4.md`. One branch and tag per item; names as built.

- **c. Bumping into customers (`r4-bump`, protocol 46).** `stepCustomerBumps` (src/sim/bumps.ts): a person (not a bot,
  `ECONOMY.bump.botsBumpCustomers: false`) walking into a customer within `customerTiles` (0.6) costs them
  `customerPatience` (8%) of max patience, logs `customer.bump { customer, by, x, y }`, with a per-customer cooldown of
  `customerCooldownSeconds` (1 s); the 3rd bump (`customerAngryAt`) within `customerWindowSeconds` (10 s) logs
  `walkout { customer, reason: 'bumped', x, y }` and loses them like any walk-out (no extra reputation hit). State:
  `Customer.bumpedAt?: number[]`, `DayStats.customerBumps?`. Customer positions: `customerSpots(state)`
  (src/sim/customerSpots.ts), a sim copy of the render's `pickupModel.customerSpots`, kept equal by a test.
- **a. Dev mode (`r4-dev`, protocol 47).** `?dev=1` → `CreateRunOptions.dev` → `GameState.dev` (only when true).
  `DEV_CASH` 999,999 topped up at the end of every step and in `createRun` (`topUpDevCash`, src/sim/dev.ts); it
  raises `startingCash` too, so score, profit and season targets ignore it. Input `{ kind: 'devPause', playerId,
  paused }` (host, dev run, night/weekEnd) sets `GameState.devPaused`, holding the night timer (and a relaxed night's
  last call); Ready still opens the shop and `startDay` clears it. Dev runs write nothing to meta, records or history
  (`foldMeta`, `recordsStore.record`, `historyStore.append` via `RunRecord.dev`). Cash can read a bit over 999,999
  after takings. The café's six slots still limit gear (pour-over lines don't fit beside everything).
- **e. Character look (`r4-look`, protocol 48).** `PlayerLook { hair, hairColor?, skin, outfit, shirtColor }` (UI
  ids; 1–32 chars of `[A-Za-z0-9_#-]`), `Player.look?`, `cleanLook` / `setLook` in src/sim/look.ts. Join path:
  `CreateRunOptions.players[].look?`, `join` input `look?`, `JoinMsg.look?`, lobby `Member.look?`,
  `PeerSessionOptions.look?`. Edit: `{ kind: 'look', playerId, look }`, night/weekEnd only, people only, own player;
  a bad look is refused. Bots have none.
- **d. Stacking (answered in `r4-look`).** `Customer.id` + `Customer.items` is all the UI needs to stack one
  customer's drinks, groups included. No `PassItem.customer`: a cup isn't anyone's until it's taken (the taker is
  decided at take time); for a "who'd take this cup" hint use `pickupTarget(state, drink)` (exported).
- **Export (`r4-look`).** `emptyHandsWanted` is exported from src/sim/stations.ts, so `src/ui/live.ts` can drop its
  mirror.
