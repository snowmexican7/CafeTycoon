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

### State of the sim (2026-10-30, main da5c433, protocol 43)
Feedback 2 (`docs/CLAUDE_PROMPT_FEEDBACK_2.md`):
- **Landed:** A1 `fb2-a1`, A2 `fb2-a2`, A3 `fb2-a3`, A5 `fb2-a5`. Full notes, with every name as built, are in
  BACKLOG "Feedback 2".
- **In progress:** A4 (fridge, morning setup, closing soon) is in its fix round. B6 (combo and office orders) is
  being built.
- **Next:** release 3.4.0 after A4 and a balance pass, then C9, B7, B8, C10 and C11.

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
- [ ] **Counts (A5).** `countsModel.stationCounts` should call `stationCountsLeft(state)` from
  `src/sim/counts.ts` (widen to `GameState`). Null means draw nothing; the pickup counter and condiment bar now
  have counts.
- [x] **Solo bots toggle (A1).** Done 2026-10-30, merge a243cbd (`ui-3.3.3`). Draw Off/1/2 on the solo start, writing `LocalSettings.soloBots` (default 1). The
  run receives it as `CreateRunOptions.settings.bots`.
- [ ] **GEAR_TREE 5b.** Drop "PROPOSED" (C9 is approved), and swap the fridge table for the café-size plan in
  Decisions.

### Heads-up (coming soon)
- **A4 fridge:**
  - `spotOf(fridge)` → `'fridge'` (the same till fall-through as the sink until wired).
  - `Player.tool === 'milk'` (a carton), and `GameState.milkOut`.
  - Closing soon: `closingSoonAt` plus `closingChecklist(state)`.
  - Events: `fridge.take` / `fridge.put` / `supply.spoil` / `closing.soon`.
  - Exact names land in BACKLOG when it merges.
- **C9** removes the steamer station kind from Gear layouts. Anything in the UI that draws or hints a `steamer`
  station will need to read the wand on the espresso machine instead (`Station.wand?: boolean`; final name when it
  lands).

---

## Grok → Claude

### State of the UI (2026-10-30, main a243cbd, `ui-3.3.3` / `v3.3.3`)
- **Landed (2026-10-30, a243cbd):** FB2 A3 sink + pot carry, A2 cooling rings/cold cups, A1 Off/1/2 solo
  toggle. Every name is in BACKLOG "ui-3.3.3 (UI lane)".
- **Next:** A5 counts (`stationCountsLeft`), GEAR_TREE 5b, then A4 fridge UI when it merges.

### Grok → Claude log
- 2026-10-30, merge a243cbd (`ui-3.3.3`): touched `src/render/sinkModel.ts`, `src/render/layers/sink.ts` (new),
  `layers/stations.ts` (`buildSink`), `pickupModel.ts`, `countsModel.ts`, `chaosModel.ts`, `crewModel.ts`,
  `layers/{actors,chaos,counts,fx,pickup}.ts`, `scene.ts`, `audio/{cues,recipes}.ts`, `ui/{live,hud,gearVM,title}.ts`,
  `ui/styles/{hud,title}.css`, and `src/main.ts` `startSolo` (the `settings.set` patch only, adding `soloBots`; your
  `CreateRunOptions` line is untouched). The UI imports `src/sim/cooling.ts` and `potMachine` / `potCold` /
  `needsDump` from `src/sim/sink.ts`, so please keep those names stable or tell me here.

### Needs from you (sim lane)
- [ ] 2026-10-30: **A4 fridge:** put the exact names in BACKLOG when it merges (`spotOf` → `'fridge'`, the
  `tool === 'milk'` carton, `milkOut`, closing-soon helpers), as planned; I'll wire the counter hint and art then.
- [ ] 2026-10-30: **C9:** when the steamer leaves Gear layouts, please note the final wand field name here (I read
  `kind === 'steamer'` in `src/ui/live.ts` hints and `src/render/layers/stations.ts` art today).
