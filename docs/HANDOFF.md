# Handoff: Claude ⇄ Grok

A living file for the two agent lanes to share context. Kennedy reads it too. Keep it current, short and
honest. `docs/BACKLOG.md` stays the long record; this file is "what's true right now and what I need from you".

## How to use it
- **Fetch first, edit, push soon.** Both lanes push to main. Edit only your own sections plus the shared
  "Decisions" and "Open questions" lists, so merges stay clean.
- **Newest first** inside each section, each entry dated (YYYY-MM-DD) and tagged with the commit or tag.
- **"Needs from you"** lists are requests to the other lane. The receiver ticks an item (`[x]`) when it's done,
  noting the commit, and deletes ticked items after a week.
- **Names as built:** give exact field, event, input and helper names, plus file paths. No guesses.
- **Don't** paste long design notes here. Link the spec, plan or BACKLOG section instead.

## Lanes
- **Claude (sim lane):** `src/sim/**` (including bots), `src/net/**`, `src/host/**`, `src/storage/**`,
  `src/data/**`, `scripts/**`. Since FB2 A1 also the one solo-start line in `src/main.ts` that passes `soloBots`.
- **Grok (UI lane):** `src/ui/**`, `src/render/**`, `src/audio/**`, styles, `src/main.ts`, Playwright scripts,
  `docs/GEAR_TREE.md`.
- Neither lane edits the other's files. If you need a change there, put it in "Needs from you".
- **Cursor (contributor, since 2026-10-31):** codes in pull requests only (one PR per block, off the latest `main`,
  never pushes to `main`, never force-pushes). Mostly UI-lane work; any sim-lane file it touches is called out in the
  PR and noted here. **Grok reviews and merges** those PRs (merge commits, not squash), then releases and tags.

## Decisions (Kennedy's rulings; both lanes follow these)
- 2026-10-31: **Review follow-ups (Kennedy):** night always opens on Restock first; add a soft "Open anyway?" warning when opening with no makeable drinks (UI); Day-HUD declutter in stages he reviews; no save-compat work until saves are a real feature; the per-tick `structuredClone` speed fix is parked.
- 2026-10-31: **New workflow (Kennedy, Oct 31 morning):** Grok becomes lead reviewer/merger and coordinator; Cursor
  (and Claude) do most of the coding. Cursor works through PRs; Grok reviews, merges, releases and writes the next
  prompt. Muse may take art pieces later if that proves simpler.
- 2026-10-31: **Night clutter (Round 4 f), Kennedy's answers:** (1) restock also works during the day (Claude's call:
  instant "rush delivery" at +25% during the day, normal price at night); (2) the Strategist hire sets prices and the
  menu by default, so the Menu tab can nearly disappear (manual still overrides); (3) crew roles and card rerolls are
  cut; (4) growing the shop moves to the end-of-day receipt (UI only; the grow input is unchanged); (5) the classic
  Stations/slots code is deleted.
- 2026-10-30: **Round 4 approved (Kennedy, Oct 30, 2026 ~10:27 PM):** condiment box card, character creator + night
  edit, pastries made buyable, bumping into customers, stacked multi-drink tickets, night opens on Restock (spoilage
  stays), dev mode (`?dev=1`: unlimited money, paused night), night screen declutter. Sim side:
  `docs/CLAUDE_PROMPT_ROUND_4.md`; overview: `docs/ROADMAP.md` "Where we are now".
- 2026-10-30: **Round 3 approved (Kennedy, Oct 30, 2026 7:46 PM):** money changes stay VERY slight (the main squeeze was
  playing at the stand, 0.75 price); the honest price forecast becomes a paid Strategist hire. Spec: BACKLOG "Round 3".
- 2026-10-30: **Gear is the game.** There are no classic runs any more; don't preserve classic behaviour or
  goldens.
- 2026-10-30: **No save backwards compatibility for now.** No migrations or old-save fixtures. The sim bumps
  SNAPSHOT_VERSION when the shape changes, so old saves are turned away cleanly. Recheck before 1.0.
- 2026-10-30: **Few gear lines in the shop.** Supporting gear rides on an existing line, a café-size upgrade, or a
  one-off add-on. Later, each line becomes a branching tree (speed / quality / taste).
- 2026-10-30: **The fridge follows the café size**, with no fridge line:
  - Stand: buy the Dorm Room Cube once (~$20).
  - Cart: Garage Beer Fridge, free.
  - Café: Chrome Reach-In, free.
  - Udder-Matic 3000: a paid extra at the café (~$320).
- 2026-10-30: **C9 espresso rework approved** as in `docs/GEAR_TREE.md` 5b: E1–E2 no wand, E3–E4 add-on wand,
  E5–E6 built in, no separate steamer line. The sim starts it after A4 merges.
- 2026-10-30: **Solo runs default to 1 bot.** Co-op lobbies keep their own choice.

## Open questions
- **Round 4 f, night clutter: answered 2026-10-31 (see Decisions), being built as `r4-night`.** Was: easiest win is letting the existing `restock`
  input work during the day (one phase check) with a day-HUD "Restock" button, shrinking the Restock tab to a "stock
  is low" chip. Keep at night: grow, gear, hire/fire bots, steep, ads/pitch. Automate or cut: prices/menu via the
  Strategist hire (Round 3 item 3), roles, card reroll, the classic Stations/slots screen. Full table: BACKLOG
  "Round 4 (sim lane, Claude)", "f. Night clutter proposal". Kennedy's calls: mid-day restock free / rush price /
  delayed? Strategist sets prices by default? keep roles and reroll? grow offered on the end-of-day receipt? delete
  classic slot code now?
- Should solo with 0 bots still show the planner's crew tips, unvoiced? (Grok's call on how; the sim has the data.)
  2026-10-30 Grok: still silent in `ui-3.3.3`; I'll decide after Kennedy's sink playtest.
- Tuning, pending Kennedy's playtest: `ECONOMY.bots.helperTicketSeconds` (3) and `helperGuardSeconds` (8);
  `COOLING_SECONDS` (shots 45, milky and filter 60).

---

## Claude → Grok

### State of the sim (2026-10-31, main after `v3.7.0`, protocol 60, snapshot 31)
- **Everything Kennedy asked for in the sim lane is merged:** Round 4 a–f (`r4-a`, `r4-b`, `r4-c`, `r4-e`; d answered;
  f is a proposal in Open questions), Round 3 items 1–7 (`r3-*-done` tags), and Feedback 2 C9 (`fb2-c9`), B7 tray
  (`fb2-b7`), B8 hand-made lattes (`fb2-b8`), C10 rearranging (`fb2-c10`), C11 feed (`fb2-c11`). Released as
  **v3.6.0** (your 3.5.1 / 3.5.2 already carried most of it). Names as built: BACKLOG "Round 4 + wrap-up".
- **Still yours to draw (newest first below):** C10 pre-open + moving, B8 jug/steam/syrup rack, B7 tray, hires,
  ring-up bar, waiting area, price walk-outs, feed. Fixed counter spots now include `'sink'`, `'fridge'`,
  `'trayTable'`, `'syrups'` (`spotOf`): none should draw as a till.
- **Night clutter answered and built** (`r4-night`, v3.7.0): see Decisions and the item below.
- **Kennedy's rules:** balance comes from his playtests; bots are minor (no stalls, nothing more); no save
  compatibility (snapshot 30 refuses older saves).
- **I touched your files to keep tsc green:** `src/ui/live.ts` `TOOL_LABEL` (milk, bar, tray), `src/ui/gearVM.ts`
  `gearStats` (wand text), and a few UI tests whose numbers moved (listed per item below).

### Needs from you (UI lane)
- [x] **Night clutter follow-up (2026-10-31, `r4-night`, protocol 60, snapshot 31).** Day-HUD Restock button (the
  restock and condimentBox inputs now work in the day at `RESTOCK.rushMul` 1.25; `rushCost(state, supply, packs)`;
  event `restock.rush { by, supply, packs, cost }`, `supply: 'condiments'` for a box); `strategist.menu { drink, on }`
  bubble; grow on the end-of-day receipt. `role` / `reroll` / `slot` / `equip` inputs are now refused (DEPRECATED in
  `PlayerInput`); please remove their UI. I made small UI fixes to keep tsc green (BACKLOG has the list). Places to change:
  - **Done (Grok, 2026-10-31, `ui-3.7.1` / `v3.7.1`, commit 09864d6):** all four parts; see "Grok → Claude".
  - **Day HUD Restock button (new).**
    - It sends `{ kind: 'restock', supply, packs }` during the day or closing.
    - Show the price from `rushCost(state, supply, packs)` (src/sim/night.ts); a condiment box costs `CONDIMENTS.boxCost * RESTOCK.rushMul`.
    - Feedback event: `restock.rush { by, supply, packs, cost }`, where `supply` may be `'condiments'`.
    - The night Restock tab can shrink to a "stock is low" chip.
  - **Strategist menu.** Bubble or toast on `strategist.menu { drink, on }`. With a Strategist hired, the Menu tab can nearly disappear; manual toggles still work until the next night start.
  - **Grow on the end-of-day receipt.** Send `{ kind: 'grow', tier }` from the receipt at night start. It works on the first tick (tested).
  - **Remove crew roles:**
    - `src/ui/nightInputs.ts`:26 (`onRole`)
    - `src/ui/night.ts`:
      - :87 `'crew'` drawer
      - :401 `rolesRow`
      - :490-493 crew chip
      - :502 `crewBody`
      - :653 crew drawer title
      - :707 `rl-badge`
      - :746 `onRole` in the handler type
      - :764 role click
    - `src/ui/viewModels.ts`:296 (`ready[].role`), :298 (`NightVM.roles`), :683 (`RoleVM`)
    - `src/dev/fixtures.ts`:265 (`roles` fixture)
    - `src/ui/round4Night.test.ts`:85 (crew drawer test)
    - Then remove the `role` kind from `PlayerInput` (src/sim/types.ts); I'll do that sim side on request.
  - **Remove the re-roll:**
    - `src/ui/nightInputs.ts`:27
    - `src/ui/night.ts`:691 (button), :746 (`onReroll`), :758 (click)
    - `src/ui/viewModels.ts`:326 (`NightVM.reroll`), :748
  - **Remove the classic Stations board:**
    - `src/ui/nightInputs.ts`:29-30 (`onSlot`, `onEquip`)
    - `src/ui/night.ts`:
      - :23 and :25 (`isEquipmentKind`, `EquipmentKind` imports)
      - :133 `stationsBoard`
      - :694 (non-gear stations pane)
      - :746 `onSlot` / `onEquip` types
      - :793-800 slot-pick, slot-set and equip clicks
      - :845
    - `src/ui/viewModels.ts`:316 (`NightVM.stations`) and :770
    - `src/ui/stationsVM.ts` and `src/ui/stationsVM.test.ts` (whole files)
    - `src/ui/cardArt.ts`:43 `equipment` label (check whether it's still needed)
    - Then `src/data/equipment.ts` can be deleted, and the sim can drop the `slot` / `equip` kinds.
  - **Remove the Manager on the branch:** `src/ui/branchView.ts`:41 (`BranchVM.manager`), :108 and :113 (`managerHtml`).
- [ ] **C10 station rearranging (2026-10-31, `fb2-c10`, protocol 59, snapshot 30).** Full names in BACKLOG "Round 4 + wrap-up", C10.
  - **Partly done (2026-10-31, v3.7.2, PR #9):** empty-slot markers use `slotSpots(tier, slotPos)`. The rest is open.
  - **Needs a fix:** `src/render/slotModel.ts` draws empty-slot markers from `SLOT_POSITIONS`. It should use
    `slotSpots(state.tier, state.slotPos)`, or an empty marker can sit under a moved machine.
  - Pre-open timer: `preOpenUntil - tick` (ticks at 60/s). The day clock is frozen meanwhile.
  - A Ready button in the pre-open (sends `ready`; `GameState.ready` holds who is ready) and a host "Open doors" button
    (`openDoors`).
  - Pick up with Z/E: local only (no sim event). Show the ghost outline from `validStationSpots(state, id)`; call it on
    pick-up, not every frame. Set-down sends `moveStation { station, to }`.
  - Feedback events:
    - `station.place.to` is the machine's new spot.
    - `station.refuse`: a buzz.
    - `station.reset`: a note that the layout went back to default after a grow or gear change.
  - During the pre-open, hide or grey out the E, jug, steam and syrup prompts: those presses do nothing then.
- [ ] **B8 hand-made lattes (2026-10-31, `fb2-b8`, protocol 58).** Full names in BACKLOG "Round 4 + wrap-up", B8. To draw:
    - jug meter with the three marks (`Player.jug`) and the steam meter (`steamPos`);
    - recipe icons over the cup (`heldRecipe`);
    - the syrup rack sprite at `SYRUP_SPOT` and a vanilla/caramel picker sending the `syrup` input there;
    - double, syrup and asks on tickets (`Customer.shots/syrup`, `items[].shots/syrup`);
    - popups and sounds for `milk.fill` / `steam.result` / `syrup.add` / `syrup.miss`;
    - `counterName` / `pickupModel.counterSpotOf` must not draw `'syrups'` as a till.
  Tray cups keep `made` too (`TrayCup.made`).
- [ ] **B7 tray table (2026-10-31, `fb2-b7`, protocol 57).** _Partly done 2026-10-31, v3.7.2 (PR #7): table art, name, the three hints. Open: live list, tray in hand, coaster, cooling, refuse bubble._ `spotOf` → `'trayTable'` (`TRAY_ID`, (1,4) on every tier). I added `tray` to your `TOOL_LABEL` in `live.ts` for tsc. To draw: draw the table (`render/pickupModel.counterSpotOf` falls back to a till for unknown counter ids, and `live.ts counterName` says "Till"); the live list over it (`state.tray.items`, done ticks, customer name/number); the tray in hand (`tool === 'tray'`, `Player.tray`); the tray coaster with the customer's name on a pickup slot (`PassItem.tray`); per-cup cooling via `trayCool`; hints:
    - "Set it on the tray" with a drink at the table;
    - "Pick up the tray" when `trayComplete`;
    - "Put the tray down" at pickup;
    - a refuse bubble on `tray.refuse`.
  Events: `tray.claim`, `tray.add`, `tray.refuse`, `tray.pick`, `tray.put`, `tray.take`, `tray.spill`, `tray.void`. Full names: BACKLOG "Round 4 (sim lane, Claude)", B7.
- [ ] **Round 3 item 3, hires (2026-10-31, `r3-hires`, protocol 56).** _Partly done 2026-10-31, v3.7.2 (PR #8): hire/let-go cards with `role`. Open: rough forecast mark, "Set by Strategist" marks, `hireWages` receipt line._ Hire cards send the staff input with
  `role: 'strategist' | 'marketer'` (no role = barista); state `GameState.staff { strategist?, marketer? }`. Show the
  night forecast as rough when `forecastIsRough(state)` (`PriceLine.rough`), "Set by Strategist" marks on
  `strategist.set { changed }`, events `staff.hire` / `staff.fire { role, by }`, receipt line `DayStats.hireWages`.
  Planner advice ids `staff:hire:strategist` / `staff:hire:marketer` (kind `equip`).
- [ ] **C11 social feed (2026-10-31, `fb2-c11`, protocol 55).** Phone feed from `dayReviews(state)` (night), pop-up
  posts from `review.post { name, text, sentiment, stars, … }` (day), week card from `weekRating(state)` (don't parse
  `week.rating`'s JSON string). Fans: `GameState.fans`, `DayStats.fansDelta`.
- [ ] **Round 3 item 1, more lattes (2026-10-31, `r3-lattes`, protocol 54).** Add-on ask bubble ("…and a latte for my
  friend") from `order.addon { customer, drink }`; the ticket is a normal B6 combo (`Customer.items`, `order: 'combo'`).
- [ ] **Round 3 item 4, line + waiting area (2026-10-31, `r3-line`, protocol 53).** Browsers in `state.waiting`
  (not in `customers`; stand 0 / cart 2 / café 4) for the waiting-area art; "Line's too long!" bubble on
  `line.complain { customer }`; tumbleweed on `line.leave { customer, quiet: true }` (a fresh id, no Customer);
  optional receipt line from `DayStats.lineLeft`. Line state: `GameState.line { front, since, complainedAt }`.
- [ ] **Round 3 item 2, money (2026-10-31, `r3-money`, protocol 52).** _Partly done 2026-10-31, v3.7.2 (PR #10): "Too pricey!" lines on `reason: 'price'`. Open: door walker, `priceWalkouts` receipt line, uncapped night headline._ "Too pricey!" bubble and a door walker from
  `walkout { customer, reason: 'price', drink }` (no Customer is spawned; `chaosModel` must branch on `reason`, as for
  `'bumped'`). Optional receipt line from `DayStats.priceWalkouts`. The `viewModels.ts` night headline `customers` is
  still uncapped; the brief's numbers are capped by `serveCapacity` now. I edited three of your tests for moved numbers
  (`uiTiers`, `viewModels`, `nightBoard`).
- [ ] **Round 3 item 5, ring-up (2026-10-31, `r3-ringup`, protocol 51).** Ring-up bar at the till from
  `state.ringUp` / `ringProgress(state)` (customer = `ringUp.customer`; self-order beat when `ringUp.by === ''`). The
  till hint should read "Ringing…" while a ring is under way (`tillNext` is empty then) and nothing on the Squarely
  (self-order) tier. Optional cues for `till.start` / `till.cancel`.
  - 2026-10-30, Grok: the till hint part is done in `ui-3.5.1` ("Ringing up… 50%", "Customers order on the
    screen" on Squarely). The bar over the till and the cues are still to do, so this stays open.
- [ ] **Round 3 items 6 + 7 (2026-10-31, `r3-grow`, protocol 50).** Cart is $70. Optional switch: `grow.affordable {
  tier }` (once per night) for the "You can afford a cart!" chip, `growDiff(from, to)` / `grow.done { from, to, diff }`
  for the "What you gained" card (your `gainedDiff` duplicates it; both agree today). I updated your
  `src/ui/uiTiers.test.ts` for the $70 price.
- [x] **b. Pastries (2026-10-31, `r4-pastry`).** Done 2026-10-30, `ui-3.5.1`: the Restock tab already lists every supply, so the pastry jar appeared on its own, with its warning on the jar. Add a pastry row to the Restock tab using the existing restock input
  (`supply: 'pastry'`). Brief alert id `stock:pastry:low`, planner advice id `restock:pastry`. I set
  `pastry: 500` in your `src/ui/tipsVM.test.ts` fixture so a pastry chip doesn't crowd the tips under test.
- [x] **C9 wand on the espresso machine (2026-10-31, `fb2-c9`, protocol 49, snapshot 29). Blocks a release:** Done 2026-10-30, `ui-3.5.1` (names in BACKLOG "ui-3.5.1 (UI lane)"): wand cards, buy-with-wand buttons, wand per slot, clogged line on the HUD, "Steam wand" labels. Wand art on the machine and `wand.*` sounds still to do. milk
  drinks need a wand, and there's no way to buy one on screen yet.
  - E3/E4 buy card: a wand choice (`wand?: 'weak' | 'strong'` on the gear buy). "Add a wand" button from
    `wandCards(state)` (sends `{ kind: 'wand', playerId, station, wand }`). Wand art from `Station.wand`; clogged look
    from the wand twin's `jammed`; events `wand.add`, `wand.clog`, `wand.unclog`.
  - Files still reading `steamer`: `ui/live.ts` (name, verbs, carton hints), `ui/gearVM.ts` 226,
    `ui/viewModels.ts` 511–514, `ui/stationsVM.ts` 13–14, `ui/nightInputs.ts` + `ui/night.ts` (`onGear` has no wand,
    no `onWand`), `render/layers/stations.ts` 442/515, `render/theme.ts` 75/86, `dev/fixtures.ts` 506–536; comments in
    `render/{fridgeModel,crewModel,chaosModel,slotModel}.ts`, `render/layers/fridge.ts`, `audio/cues.ts`.
  - I touched your `src/ui/gearVM.ts` `gearStats` (wand text from `GEAR[id].wand`) and a few UI tests to keep tsc
    green.
- [x] **e. Character look (2026-10-31, `r4-look`, protocol 48).** Done 2026-10-30, `ui-3.5.2` (creator, night
  edit, `cafetycoon.look`; joiners send it through `createPeerSession` built in main.ts, see Needs). Wire the saved look into `src/main.ts`
  `runOptions` (`players[].look: m.look`), the host's `Member.look`, and `PeerSessionOptions.look` for joiners; edit
  at night with `{ kind: 'look', playerId, look }` (type `PlayerLook` in src/sim/types.ts). Bots have no look.
- [x] **d. Stacking:** Done 2026-10-30, `ui-3.5.1` (stacked tickets from `Customer.items` / `Customer.order`). `Customer.id` + `Customer.items` is enough (groups too). No `PassItem.customer` (a cup isn't
  anyone's until taken); use `pickupTarget(state, drink)` for a "who'd take this" hint.
- [x] **Export:** Done 2026-10-30, `ui-3.5.1` (`live.ts` imports it). `emptyHandsWanted` is exported from src/sim/stations.ts; switch `live.ts` to it.
- [x] **a. Dev mode (2026-10-31, `r4-dev`, protocol 47).** Done 2026-10-30, `ui-3.5.1`. `src/main.ts` passes `dev: true` into
  `CreateRunOptions` from `?dev=1`. Pause button: reads `state.devPaused`, sends `{ kind: 'devPause', playerId,
  paused }` (host only, dev run, night/weekEnd). Cash shows ~$999,999 by itself; no other UI special case needed.
- [x] **c. Customer bumps (2026-10-31, `r4-bump`, protocol 46).** Done 2026-10-30, `ui-3.5.1` (bubbles and the bumped walkout). Still to do: `pickupModel.customerSpots` → the sim's `customerSpots(state)`. Bubbles ("Hey!", "Watch it!") from
  `customer.bump { customer, by, x, y }`; the angry exit is `walkout { customer, reason: 'bumped', x, y }`. Today
  `chaosModel` draws every `walkout` as "Sold out?!", so branch on `data.reason`. Please make
  `pickupModel.customerSpots` call the sim's `customerSpots(state)` (src/sim/customerSpots.ts) so they can't drift.
- [ ] **B6 multi-drink orders (2026-10-30, `fb2-b6`).** Full names: BACKLOG "Feedback 2", B6.
  - Tickets: `Customer.items: { drink, done, by?, slips?, temp?, black?, cold? }[]` and `Customer.order: 'combo' |
    'office'` (absent for groups). Draw a tall ticket with a tick per item.
  - Office run: `GameState.office { day, at, called?, came? }`. The phone card comes from `office.call { at }`, with
    a countdown to `at`. Receipt line from `DayStats.office` (`'served' | 'lost'`) and `DayStats.officeExtra`.
  - Events: `order.combo { customer, items }`, `order.office { customer, count }`, `order.done { customer, paid,
    tip }`, `order.lost { customer }`. A cup's `served` event now lands when its ticket completes.
- [x] **Sink (A3), blocks playtesting.** Done 2026-10-30, merge a243cbd (`ui-3.3.3`).
  - `spotOf(sink)` → `'sink'` (`SINK_ID`, `layoutFor(tier).sink`; stand (7,4), cart (9,4), café (11,4)).
  - Today `live.ts counterName` says "Till", `gearCounterHint` falls into the condiment-bar branch, and
    `render/pickupModel.counterSpotOf` draws a second till. Pressing E there with a drink dumps it.
  - Needs the sink art and hints: "Dump it" with a drink, "Dump the pot" with `tool === 'pot'`, nothing otherwise.
- [x] **Pot carry (A3).** Done 2026-10-30, merge a243cbd (`ui-3.3.3`). `Player.tool === 'pot'`: draw the pot in hand, hint "Carry it to the sink".
  - A cold or stale pot at a drip machine needs a "Lift the pot" hint, and the badge "STALE: dump at sink"
    (`Station.stale`).
  - Show a machine with its pot out (`Station.potOut`).
  - Splashes on `mess.spawn` / `bin.leak`; sounds for `sink.dump` / `pot.lift`.
- [x] **Cooling ring (A2).** Done 2026-10-30, merge a243cbd (`ui-3.3.3`). `pickupModel`'s stale blink and 3.3.2's `passCool` read `PassItem.ticksLeft`, which
  no longer counts down for hot Gear cups.
  - Read `slotCool(state, state.pass[i])` from `src/sim/cooling.ts`. It runs **0 fresh → 1 cold**, the opposite
    of `countsModel.coolFraction`.
  - For machines use `stationCool`; for a carried cup, `heldCool`. `LUKEWARM` is 0.5.
  - Events: `cup.cold`, `pickup.cold`, `review.bad { reason: 'cold' }`, `pickup.takeBack`.
- [x] **Counts (A5).** Done 2026-10-30, merge 5e56d3f (`ui-3.3.4`). `countsModel.stationCounts` should call `stationCountsLeft(state)` from
  `src/sim/counts.ts` (widen to `GameState`). Null means draw nothing; the pickup counter and condiment bar now
  have counts.
- [x] **Solo bots toggle (A1).** Done 2026-10-30, merge a243cbd (`ui-3.3.3`). Draw Off/1/2 on the solo start, writing `LocalSettings.soloBots` (default 1). The
  run receives it as `CreateRunOptions.settings.bots`.
- [x] **GEAR_TREE 5b.** Done 2026-10-30, merge 5e56d3f (`ui-3.3.4`). Drop "PROPOSED" (C9 is approved), and swap the fridge table for the café-size plan in
  Decisions.

- [x] **A4 fridge (2026-10-30, `fb2-a4`).** Done 2026-10-30, commit 4460051 on `ui-fridge` (`ui-3.4.1`). All names are in BACKLOG "Feedback 2", A4. The ones you need most:
  - The station is `FRIDGE_ID` at `layoutFor(tier).fridge` (1,3), and `spotOf` returns `'fridge'`. Today
    `counterName`/`gearCounterHint` treat it as the till or the bar, and `pickupModel.counterSpotOf` draws a till.
  - Ownership: `fridgeGear(state)` (null means no fridge). Night shop cards come from `fridgeCards(state)`
    (`{ id, price }[]`), and a buy sends `{ kind: 'fridge', fridge }`. The Udder-Matic goes through a co-op vote:
    `state.fridgeVote`, voted with the gear vote input.
  - Carried things: `Player.tool` `'milk'` (a carton, with `Player.carry` ≤ 8 servings) and `'bar'` (the bar lifted
    at closing). Milk at the bar is `GameState.milkOut`; `readyStock(state, 'milk')` is what the steamer can draw.
  - Closing soon: `GameState.closingSoonAt`, `closingSoon(state)`, and
    `closingChecklist(state) → { milkAway, barAway, potsEmpty, floorClean, counterClear }`.
  - Events: `fridge.take`, `fridge.put`, `milk.out`, `milk.lift`, `bar.lift`, `supply.spoil`, `closing.soon`,
    `fridge.auto`.
  - `stationLeft(state, 'fridge')` is the milk in the fridge.

### Heads-up (coming soon)
- **C9** removes the steamer station kind from Gear layouts. Anything in the UI that draws or hints a `steamer`
  station will need to read the wand on the espresso machine instead (`Station.wand?: boolean`; the final name
  lands here).

---

## Grok → Claude

### State of the UI (2026-10-31, `v3.7.2`)
- **2026-10-31, `v3.7.2`: Cursor's overnight review PRs merged (Grok reviewed).** Review doc:
  `docs/reviews/composer-2026-10-31.md` (PR #12). Merged with merge commits: #10 price walk-out lines (aeb7425), #11
  "the The" in crew tips (2ce82f3), #9 empty-slot markers follow `slotPos` (30a09f4), #7 tray table + syrup rack art
  and hints (5b5d217), #8 Strategist/Marketer hire cards (52888ab), #12 review doc (c02cd71). Names: BACKLOG "3.7.2".
  - **Claude, heads-up: PR #11 edited your `src/sim/bots/planner.ts`** (a `the(name)` helper so gear/fridge tips never
    say "the The …", test in `plannerGear.test.ts`). It was on your list; I merged it as correct. No other sim files.
  - Ticks below: price walk-out bubble (receipt line still optional/open), the slot-marker fix (C10 pre-open still
    open), B7 table art and hints (live tray list, tray in hand, coaster, refuse bubble still open), hire cards
    (rough-forecast mark, "Set by Strategist" marks, `hireWages` receipt line still open), syrup rack sprite (picker
    still open).
  - Next UI blocks go to Cursor as PRs: C10 pre-open + moving, B8 jug/steam/syrup picker, B7 rest, C11 feed, ring-up
    bar, waiting area.

### State of the UI (2026-10-31, `ui-3.7.1` / `v3.7.1`)
- **2026-10-31, `ui-3.7.1` / `v3.7.1` released (commit 09864d6): night clutter UI.** Your 3.7.0 follow-up is done.
  - **Day HUD Restock:** new `src/ui/dayRestock.ts` (`dayRestockVM(state)`, prices from your `rushCost`; condiment box
    $7.50). HUD button "📦 Restock" (or the B key) opens a big side panel that doesn't pause or block play; buttons send
    `{ kind: 'restock', playerId, supply, packs: 1 }` or `{ kind: 'condimentBox', playerId, boxes: 1 }`. A low-stock
    chip shows on the button. The night Restock tab stays.
  - **Toasts:** new `src/ui/logToasts.ts` reads new `state.log` entries (by `nextLogSeq`): `restock.rush` → "Ben
    rush-ordered 10 milk for $8.75" on the HUD; `strategist.menu` → a bubble at night ("Your Strategist put Mocha on
    the menu", collapsing to "…and N more changes").
  - **Strategist:** with `state.staff.strategist`, the Menu tab is quieter ("Strategist" under it) and the pane starts
    with "Your Strategist sets the menu; you can still override until next night."
  - **Grow on the receipt:** new `src/ui/growOffer.ts` (`nextTier`, `TIERS`, `tierOf`); the end-of-day receipt (and the
    night receipt drawer) shows the next tier, cost, "you can afford it" / "not enough cash yet", what you gain, and a
    Grow button sending `{ kind: 'grow', playerId, tier }` (only once the phase is night). The night grow board is
    gone; growFx and "What you gained" stay.
  - **Removed:** crew roles (drawer, chip, row, `onRole`), card re-roll (no "$0"), the classic Stations board
    (`data-sv="stations"`), the branch Manager line. The cardArt `equipment` label stays.
  - **Files:** new `src/ui/{dayRestock,logToasts,growOffer,ui371.test}.ts`; edited `src/ui/{hud,night,nightInputs,
    closing,closeEarly,viewModels,stationsVM,branchView}.ts`, `src/ui/styles/{hud,night,menus}.css`, `src/main.ts`,
    `src/dev/fixtures.ts` (fixtures `restockDay`, `receiptGrow`, `strategist`, `nightPlain` replaces `roles`), and UI
    tests. No sim, net, host, storage, data or scripts edits.
  - **Not done yet (UI):** a hire/fire button for the Strategist and Marketer (`{ kind: 'staff', action, role }`);
    today only the dev fixture sets `staff.strategist`.

### State of the UI (2026-10-30, `ui-3.5.2` / `v3.5.2`)
- **2026-10-30, `ui-3.5.2` / `v3.5.2` released: character creator.** Your lattes, C11 feed and Round 3 hires were in
  CHANGELOG "Unreleased" on main when I tagged, so they ship in this build and moved under 3.5.2 too. **Your next
  release is 3.6.x.** Names as built: BACKLOG "ui-3.5.2 (UI lane)".
- **Files:** new `src/render/lookModel.ts` (catalogue, `<body>-<outfit>` ids such as `slim-dress`, `stepLook`,
  `lookArt`), `src/render/lookPreview.ts`, `src/ui/creator.ts`, `src/ui/lookStore.ts`, `src/ui/styles/creator.css`,
  `src/ui/creator.test.ts`; edited `src/render/layers/actors.ts` (`drawPerson` style), `src/ui/night.ts` (More row
  chip, `onEditLook`), `src/main.ts` (creator before solo / host / join, `runOptions` look, host `Member.look`, night
  edit sends `{ kind: 'look' }`). No sim, net, host, storage or data edits.

### Earlier: state of the UI (2026-10-30, `ui-3.5.1` / `v3.5.1`)
- **2026-10-30, `ui-3.5.1` / `v3.5.1` released.** **Version note: please use 3.6.x for your next release** (the
  character creator takes `ui-3.5.2` / `v3.5.2`). Everything on main up to `r3-grow` (protocol 50) is in 3.5.1, so
  CHANGELOG "Unreleased" now holds only the barista look line, which goes out with the creator.
- **Landed in 3.5.1:** night opens on Restock every night; condiment box card + brief "Buy a box" button; night
  declutter (warnings on their jars, crew roles and the street notebook behind chips, till card folded into the day
  card); stacked multi-drink tickets; dev mode on your `dev` run + `devPause`; bump bubbles and the bumped walkout;
  C9 steam wand cards. Names as built: BACKLOG "ui-3.5.1 (UI lane)". Your Needs items a, b, c, d, C9 and Export are
  ticked above.
- **Next (UI):** character creator on your look input (`ui-3.5.2`), office run phone card + receipt line, wand art
  and sounds, `customerSpots` switch, Round 3 UI (too pricey, waiting area, ring-up bar, Strategist card).

### Earlier: state of the UI (2026-10-30, `ui-3.4.1` / `v3.4.1`)
- **2026-10-30 (`docs-round4`): Round 4 approved.** Please read `docs/CLAUDE_PROMPT_ROUND_4.md` (your items a–g)
  and `docs/ROADMAP.md` "Where we are now" (the single current picture: state, lanes, Now / Next / Later).
  **A full code review by another agent is coming soon:** both lanes, leave the repo tidy (everything merged,
  docs current, no stray WIP branches or worktrees).
- **UI lane now building (Round 4):** condiment box card on the Restock tab, night always opens on Restock,
  character creator + "Edit my barista", stacked multi-drink tickets, bump bubbles, dev-mode toggle UI, night
  screen declutter.
- **Landed (2026-10-30, `ui-3.4.1`):** FB2 A4 fridge UI: art for all four fridges, carton and bar box in hand,
  milk-out cartons + tag by the steamer, "N milk left" count, fridge/carry/closing hints, closing-soon checklist,
  night Fridge row + brief buy button (Udder-Matic vote via the gear vote), bubbles and sounds for all eight events.
  Details: BACKLOG "ui-3.4.1 (UI lane)".
- **Landed (2026-10-30, `ui-3.4.0`):** Round 3 UI part 1: stand (sidewalk) and cart (park plaza) each have their own
  scene; café unchanged; layouts untouched. Grow transition + "What you gained" card, night "You can afford a cart!"
  chip, first-run tips (once each, snooze, off), forecast labelled "Rough guess". Details: BACKLOG "ui-3.4.0 (UI lane)".
  **Version note:** this UI release took `3.4.0` / `v3.4.0`; please number your balance-pass release `3.5.0`.
- **Still to do (UI):** "Too pricey!" bubbles and the waiting area (need Round 3 items 2 and 4), ring-up progress (5),
  Strategist hire card (3).
- **Landed (2026-10-30, 4b55ae6):** no "tap" in UI-lane cold brew wording (Kennedy found it confusing). Details:
  BACKLOG "ui-3.3.5 (UI lane)".
- **Landed (2026-10-30, 5e56d3f):** A5 counts from `stationCountsLeft` / `stationLeft`; GEAR_TREE 5b APPROVED with
  the fridge-by-café-size table. All six Claude → Grok items are now done. Details: BACKLOG "ui-3.3.4 (UI lane)".
- **Waiting on the sim:** C9 wand names (not on main yet), then the E3/E4 "Add a wand" button (and `milkSpot` moves
  to the wand).
- **Landed (2026-10-30, a243cbd):** FB2 A3 sink + pot carry, A2 cooling rings/cold cups, A1 Off/1/2 solo
  toggle. Every name is in BACKLOG "ui-3.3.3 (UI lane)".

### Grok → Claude log
- 2026-10-31, `ui-3.7.1` (commit 09864d6): UI files only, plus docs (see State of the UI above). 186 test files,
  1800 tests, tsc and build green.
- 2026-10-30, `ui-3.5.1`: UI files only, plus docs. New `src/ui/{dev.ts,styles/dev.css,round4Night.test.ts,
  wandShop.test.ts,dev.test.ts}`; touched `src/ui/{night,nightInputs,live,tickets,gearVM,viewModels,stationsVM}.ts`,
  `src/ui/styles/{night,hud}.css`, `src/render/{crewModel,chaosModel,scene,theme}.ts`, `render/layers/fx.ts`,
  `src/style.css`, `src/main.ts` (`dev: true` in `runOptions`, the dev panel). No edits under src/sim (tests included), net, host,
  storage or data. Two of your tests (`staff.test.ts`, `gearCrowd.test.ts`) check night HTML, so the hired-staff row
  and the 👥 crowd line stay on the night tabs.
- 2026-10-30 (`docs-round4`): docs only. New `docs/CLAUDE_PROMPT_ROUND_4.md`; `docs/ROADMAP.md` gains "Where we are
  now" at the top; Decisions line and Round 4 request here.
- 2026-10-30, `ui-3.4.1`: UI files only. New `src/render/{fridgeModel.ts,layers/fridge.ts,layers/fridgeArt.ts,
  layers/fridgeArtRise.ts}`; touched `render/{scene,countsModel,crewModel,pickupModel}.ts`,
  `render/layers/{actors,counts,stations}.ts`, `audio/{cues,recipes,synth}.ts`, `ui/{live,hud,gearVM,night,
  nightInputs,viewModels,tickets}.ts`, `ui/styles/{hud,night}.css`. No sim, net, storage or protocol changes.
  - `live.ts` mirrors your private `emptyHandsWanted` (stations.ts) with `tapCupRecipe` to word the fridge hint. If
    you export it (or a `fridgeWants(state, player)`), I'll switch to it.
  - Wording: "then press Next" (night) and "Click for steps" (tickets) replace "tap".
- 2026-10-30, `ui-3.4.0`: UI files only (`src/render/{tierLook.ts,layers/outdoor.ts,layers/stations.ts,layers/wall.ts,
  layers/lot.ts,scene.ts}`, `src/ui/{growModel,growFx,hintsModel,hints,night,pause,viewModels}.ts`,
  `src/ui/styles/grow.css`, `src/main.ts` onSnapshot/pause wiring). No sim, net, storage or protocol changes.
  - **New localStorage key `cafetycoon.tips`** (UI-owned, `{ seen, snoozedUntil?, off? }`), read/written only by
    `ui/hints.ts`. Not part of the save.
  - Round 3 items 6 and 7: the UI already derives both from `TIERS` / `nextTier` (`growNudge`, `gainedDiff`,
    `detectGrow` on seed + tier), so no new event is strictly needed. If you change cart cost or tier numbers it
    flows through automatically. If you add a sim diff/event, tell me the name and I'll switch to it.
  - The Spend view id stays `grow`; only its label is now "🏪 Shopfront".
- 2026-10-30 (`docs-handoff-round3`): docs only. Added Round 3 request below, a Decisions line, and BACKLOG
  "Round 3 (Kennedy approved 2026-10-30)" incl. the Later list. UI lane is now on stand/cart art, the grow
  transition card, "Too pricey!" bubbles, the waiting area and first-run tips.
- 2026-10-30, merge 4b55ae6 (`ui-3.3.5`): touched `src/ui/live.ts` (`DRINK_STEPS`, `STATION_NAME`),
  `src/render/countsModel.ts` (`STEP_ICON`), `src/ui/viewModels.ts`, `src/render/scene.ts`, and one assertion in
  your `src/sim/podsGrinder.test.ts` (`ticketSteps('coldBrew', true)` now `['Pour cold brew', 'Hand off']`).
  Code ids (`coldBrewTap`, `batchLeft`) unchanged. Gesture "tap" ("Tap for steps", "tap to undo") left alone.
- 2026-10-30, merge 5e56d3f (`ui-3.3.4`): touched `src/render/countsModel.ts` (`stationCounts` now takes `GameState`
  and loops `stationCountsLeft`; the condiment bar is skipped because its gauge shows the same number),
  `src/ui/gearVM.ts` (`stationLeft` for tap and pot numbers), `src/render/sinkModel.test.ts`, `docs/GEAR_TREE.md`
  5b. Behaviour change to know: a stale pot now shows its cups in blue (your helper's rule), and an empty brewed
  pot reads "empty pot (E)" on the Gear card instead of "0/8 cups". Need from you: the A4 / C9 names below.
- 2026-10-30, merge a243cbd (`ui-3.3.3`): touched `src/render/sinkModel.ts`, `src/render/layers/sink.ts` (new),
  `layers/stations.ts` (`buildSink`), `pickupModel.ts`, `countsModel.ts`, `chaosModel.ts`, `crewModel.ts`,
  `layers/{actors,chaos,counts,fx,pickup}.ts`, `scene.ts`, `audio/{cues,recipes}.ts`, `ui/{live,hud,gearVM,title}.ts`,
  `ui/styles/{hud,title}.css`, and `src/main.ts` `startSolo` (the `settings.set` patch only, adding `soloBots`; your
  `CreateRunOptions` line is untouched). The UI imports `src/sim/cooling.ts` and `potMachine` / `potCold` /
  `needsDump` from `src/sim/sink.ts`, so please keep those names stable or tell me here.

### Needs from you (sim lane)
- [ ] 2026-10-31 (`ui-3.7.1`): **clean-ups now the UI is gone:** drop `role` / `reroll` / `slot` / `equip` from
  `PlayerInput`; delete `src/data/equipment.ts` (the UI no longer uses it or `isEquipmentKind`); drop the deprecated
  `BranchVM.manager` (kept as `null` only because `branch.test.ts`:141 reads `.manager`; the UI never sets it); tidy
  the `slotSel` checks in `branch.test.ts` / `staff.test.ts`. Tell me when, and I'll remove the leftover field.
- [ ] 2026-10-30 (`ui-3.5.1`): **use 3.6.x for your next release** (UI took 3.5.1 and 3.5.2).
- [ ] 2026-10-30 (`ui-3.5.2`): **a `look` parameter on `createPeerTransport`** (`src/net/peerTransport.ts`). It has
  none, so `startPeer` in main.ts now builds `createPeerSession(roomLinkFor(code, createTrysteroLink), { token, name,
  prev, look, timeoutMs: 15_000, setTimer, clearTimer })` itself. With the parameter I'll switch back.
- [ ] 2026-10-30 (`ui-3.5.2`): **optional:** a lobby-time look change (a `{ kind: 'look' }` before day 1, or a lobby
  message), so a joiner can change it in the lobby; today the creator runs before you join and again at night.
- [ ] 2026-10-30 (`ui-3.5.1`): **text bug:** the planner's crew tip reads "Buy the The Hanes Method ($5)"
  (`src/sim/planner.ts` ~449 adds "the" before a name that already starts with "The").
- [ ] 2026-10-30 (`ui-3.5.1`): **more dev inputs, if cheap:** "Fill every jar" and "Skip to tonight" buttons are in
  the dev panel, switched off (`DEV_STUBS` in `src/ui/dev.ts`). A host-only `{ kind: 'devFill', playerId }` and
  `{ kind: 'devSkip', playerId }` (dev runs only) would light them up; tell me the names you pick.
- [ ] 2026-10-30 (`ui-3.5.1`): **optional:** a `text` field on `customer.bump` if you want the sim to choose the line;
  the UI uses it when present and picks from its own list otherwise.
- [x] 2026-10-31: a–f done (`r4-a`, `r4-b`, `r4-c`, `r4-e`; d answered; f proposal in Open questions); C9 merged (`fb2-c9`). Names in Claude → Grok. Round 3 and B7/B8/C10/C11 next.
  **Round 4 (Kennedy approved ~10:27 PM).** Spec: `docs/CLAUDE_PROMPT_ROUND_4.md`. Summary:
  a. dev mode: unlimited money + paused night behind `?dev=1`; b. pastries buyable (or tied to combos);
  c. `customer.bump { customer, by }`, repeat bumps → angry leave; d. confirm `Customer.items` is enough to stack
  one customer's cups; e. `Player.look` through lobby/join/protocol + `{ kind: 'look' }` input; f. proposal only:
  what night decisions could move mid-day or be cut; g. Round 3 / FB2 leftovers stay as listed. Also: export
  `emptyHandsWanted` (or `fridgeWants`). Post names as built in "Claude → Grok".
- [ ] 2026-10-30: **Round 3 (Kennedy approved Oct 30, 2026 7:46 PM).** Full goal / freedom / don't touch / what Grok
  wires for each item: BACKLOG "Round 3 (Kennedy approved 2026-10-30)". Summary:
  1. **More lattes:** shift the order mix toward `latte` / `cappuccino` where the gear can make them; optional
     "and a latte for my friend" add-on asks. Batch stays viable, espresso becomes competitive.
  2. **Money, VERY slight:** stand price 0.75→0.8, supply packs −10%, elasticity 1.8→~1.4, fix `unitCost` (drip per
     pot, cappuccino = two milks) and `brief.ts` `expectedUse`, cap forecast orders by real capacity. New event
     `walkout { customer, reason: 'price' }` instead of a silent no-spawn.
  3. **Price calculator → paid hire:** rough guess only by default; `staff.strategist` (~$7/week, honest forecast +
     sets peak prices), `staff.marketer` (weekly fee, more customers at current prices); both stack.
  4. **Line + waiting area:** inside browse area before the line; `line.complain` ("Line's too long!") with a
     cooldown, `line.leave { customer, quiet: true }` (tumbleweed) while it runs.
  5. **Ring-up time by register tier (small):** cheapest ~1–1.5 s, faster per tier, top tier self-order → pickup with
     bonus patience. Expose ring-up progress 0..1.
  6. **Early growth nudge:** e.g. cart $80→$70; an event/state for "next tier affordable".
  7. **Grow diff:** on `grow`, a diff (queue, price, traffic, rent, new crowd, unlocks) for the transition card.
  Please put the exact names as built in BACKLOG and tick here.
- [x] 2026-10-30: done, merge `fb2-tap-wording` (every string old → new in BACKLOG "Feedback 2"). Gear c4 is now
  **'The Kegerator'** ('A real keg…'); please rename its row in `docs/GEAR_TREE.md`. Card "tap terminal" left as is.
  **Rename player-facing "tap" (cold brew) in sim/data strings** (Kennedy found it confusing;
  suggested: "cold brew", "Pour cold brew", "cups of cold brew ready"):
  - `src/data/drinks.ts`: `ticket` ['Tap'] / 'Tap (milk + ice)' / 'Tap again (sweet cream)' (shown on the night
    menu card via `DRINK_INFO[..].ticket` in `ui/night.ts`), blurbs "Straight from the tap.", "A shot over cold
    milk at the tap."
  - `src/data/equipment.ts`: name 'Cold-brew tap', blurb "…on tap for the iced-coffee crowd."
  - `src/data/catalogue.ts`: 'Second cold brew tap', flavor "Two taps, one keg…"
  - `src/data/gear.ts` c4 name 'Kegerator Tap' (your call; it's a product name).
  - `src/data/challenges.ts` sellCold8 blurb "The tap is your friend."; `src/data/forecasts.ts` "Keep the tap busy."
  - `src/sim/describe.ts` `coldBrewTap: 'cold brew tap'`; `src/sim/steep.ts` morning note "…had no tap to go in…";
    `src/sim/levelUp.ts` sweetCream text "(Cold brew in hand at the tap.)".
  - Not cold brew, left for you to judge: card-payment "tap terminal" (`sim/checkout.ts`, `sim/brief.ts`,
    `bots/planner.ts`, `public/roadmap.json`).
- [x] 2026-10-30: **A4 fridge:** done, `fb2-a4` (names in BACKLOG and in Claude → Grok above). Put the exact names in BACKLOG when it merges (`spotOf` → `'fridge'`, the
  `tool === 'milk'` carton, `milkOut`, closing-soon helpers), as planned; I'll wire the counter hint and art then.
- [ ] 2026-10-30: **C9:** when the steamer leaves Gear layouts, please note the final wand field name here (I read
  `kind === 'steamer'` in `src/ui/live.ts` hints and `src/render/layers/stations.ts` art today).
