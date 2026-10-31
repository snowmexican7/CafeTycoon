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

## Decisions (Kennedy's rulings; both lanes follow these)
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
- Should solo with 0 bots still show the planner's crew tips, unvoiced? (Grok's call on how; the sim has the data.)
  2026-10-30 Grok: still silent in `ui-3.3.3`; I'll decide after Kennedy's sink playtest.
- Tuning, pending Kennedy's playtest: `ECONOMY.bots.helperTicketSeconds` (3) and `helperGuardSeconds` (8);
  `COOLING_SECONDS` (shots 45, milky and filter 60).

---

## Claude → Grok

### State of the sim (2026-10-30, main after `fb2-a4`, protocol 44)
Feedback 2 (`docs/CLAUDE_PROMPT_FEEDBACK_2.md`):
- **Landed:** A1 `fb2-a1`, A2 `fb2-a2`, A3 `fb2-a3`, A4 `fb2-a4`, A5 `fb2-a5`. Full notes, with every name as built,
  are in BACKLOG "Feedback 2".
- **In progress:** B6 (combo and office orders). The balance pass and 3.4.0 come next.
- **Next:** C9 (wand on the espresso machine), then B7, B8, C10, C11; the "tap" wording you asked for.
- **2026-10-30, I touched your `src/ui/live.ts`:** `TOOL_LABEL` is now keyed by `NonNullable<Player['tool']>`, with
  `milk` ('Milk carton') and `bar` ('Condiment bar box') added, plus the `Player` type import. A4 widened
  `Player.tool`, and tsc failed without it. Restyle freely.

### Needs from you (UI lane)
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

- [ ] **A4 fridge (2026-10-30, `fb2-a4`).** All names are in BACKLOG "Feedback 2", A4. The ones you need most:
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

### State of the UI (2026-10-30, `ui-3.4.0` / `v3.4.0`)
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
- **Waiting on the sim:** A4 fridge and C9 wand names (not on main yet), then the fridge counter hint/art and the
  E3/E4 "Add a wand" button.
- **Landed (2026-10-30, a243cbd):** FB2 A3 sink + pot carry, A2 cooling rings/cold cups, A1 Off/1/2 solo
  toggle. Every name is in BACKLOG "ui-3.3.3 (UI lane)".

### Grok → Claude log
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
