# Claude: playtest feedback 2 (paste as-is)

> Kennedy's playtest notes from 2026-10-30, written up by Grok Bot (UI lane). Main is at **v3.3.1**
> (protocol 41, snapshot 28). Read first: the "3.3.0: batch coffee, pickup counter, condiment bar" section
> and the "Notes for Claude (from the UI lane, 3.3.1)" / "Open (sim lane)" lists near the end of
> `docs/BACKLOG.md`, and `docs/GEAR_TREE.md` (sections 4.3, 4.4 and 5 for espresso and the steamer).
> Work top to bottom: **A** first, then **B**, then **C**. Everything is Gear-only (`state.gear === true`).

## Who does what

- **You (Claude):** sim, net, host, storage, data and bots. You decide the maths, state shape and inputs.
- **Grok (UI lane), working in parallel:** floating station counts, cooling rings, the closing checklist,
  recipe icons over carried cups, the tray list, the social feed UI, and the GEAR_TREE espresso doc (item 9).
  Grok won't touch `src/sim/**`, `src/net/**`, `src/host/**`, `src/storage/**` or `src/data/**`.
- If you name a field or event differently from what's below, that's fine. Write the real name in BACKLOG
  under the item so Grok wires the right one.

## Rules for every item

- One dash-named branch per item, merged into main with `--no-ff` and tagged (for example `fb2-a1`), so
  each one can be reverted alone. tsc, vitest and build stay green, with tests for the new logic.
- Bump PROTOCOL_VERSION when inputs or synced state change (with a note in the comment). Bump SNAPSHOT
  only when a field stops being optional. Old saves keep loading (`src/storage/*.fixture.json`,
  `oldSaves.test.ts`). Add a v3.3.x fixture once the shape changes.
- `DRINK_IDS` is append only. Classic runs and goldens don't change.
- Don't touch: `src/ui/**`, `src/render/**`, styles, Playwright scripts, the night tab order.
- After each item: a line in `docs/BACKLOG.md` (under a new "Feedback 2" section, with the event and field
  names as built) and in the CHANGELOG `## Unreleased`. Run `npx tsx scripts/gearBalance.ts 28 3` and
  `npx tsx scripts/p4Smoke.ts 28 3` before the release.

---

## A. Do these first

### A1. Single-player bots: on/off and count, default 1

**Goal.** Kennedy sees this as a 2-player game that works with 1 at a pinch. Solo with 3 bots feels like the
bots play the game for you. `Settings.bots` (`number | 'auto'`) and the lobby's Off/1/2/3 card already exist
(`d401839`), but the solo start has no switch and the default fills seats.
- Default a **solo** run to **1 bot** (co-op lobbies keep `auto`). 0 must be a real, balanced option.
- Make sure the setting reaches a solo run from the title (host/run options), and persists in settings.
- Tune bots so one bot is a helper, not the whole crew: it should leave the player's current task and the
  nearest station to them alone, and not grab every ticket first.
- If anything from `docs/CLAUDE_MORNING_PROMPT.md` part 1/2 is still unfinished, carry it forward here and
  list what's left in BACKLOG.

**Freedom.** Any bot-brain or planner change; how "helper" behaviour works; the exact default (1, or 0 with a
prompt) if playtests say so.

**Don't touch.** Lobby/title markup (Grok draws the solo toggle).

**Grok wires afterward.** An Off/1/2 bots toggle on the solo start. Needs: the settings key and how a solo
run receives it (for example `CreateRunOptions.bots` or `Settings.bots`), plus the default value.

### A2. Cups go cold

**Goal.** Stop the "brew drip, fill the pickup counter, then ring everyone up" cheese without banning it.
- Drinks on the pickup counter and in machines (a pulled shot waiting, a drip pot, a steamed jug if you
  like) cool over time. Iced/cold brew can skip it or "warm up" (your call).
- Taking a cup back from pickup with empty hands grabs the **oldest** cup first (this also settles M2 in
  BACKLOG: cups nobody wants).
- A customer who takes a **cold** cup doesn't pay and leaves a bad review (event). Optional: a small chance
  they don't notice when it's only lukewarm.

**Freedom.** Cooling times per drink/station, whether gear tier slows cooling (a thermal carafe drip tier
would
be fun), how "cold" scores in reviews.

**Don't touch.** Customer pathing UI, the pickup coaster drawing.

**Grok wires afterward.** A shrinking ring per cup (red → orange → yellow → blue at cold) on pickup coasters,
over a pulled shot and over drip pots. Needs, per pickup slot and per station holding a drink:
- `madeAt` (tick) or `age` (ticks), and `cool: number` 0..1 (0 = fresh, 1 = cold), or a pure helper such as
  `coolFraction(state, item)` exported from the sim.
- Events: `cup.cold { slot | station, drink }` when one crosses to cold, `pickup.takeBack { drink, by, cold }`,
  `pickup.cold { customer, drink }` (took a cold cup, no pay), and the review event from C11 (or
  `review.bad { customer, drink, reason: 'cold' }` until C11 lands).

### A3. Back sink and more cleaning pressure

**Goal.** Give quiet moments a job, and make the floor score move (it sits at 100% all day now).
- A **back sink**: a permanent fixture (fixed spot like `condiments`), can't be bought, sold or moved.
  Dump cold coffee, old shots and stale pots there (held drink + E, or carry the pot).
- A drip pot (or cold brew batch, your call) left full overnight is **stale** in the morning and must be
  dumped at the sink before you can brew. This also fixes "a cold drip pot can't be dumped" in BACKLOG.
- Dumping a liquid in the **trash bin** instead: each item has a 1% chance to leak and make a mop mess.
- More messes in general: ideas from Kennedy's chat are milk drips at the steam wand and grounds by the
  grinder. Keep them small and fair.

**Freedom.** Where the sink sits in the back, dump times, mess chances, how messes hit the floor score.

**Don't touch.** Classic floor rules.

**Grok wires afterward.** The sink sprite and hint ("Dump it"), a "STALE: dump at sink" badge on a pot, mess
puddles. Needs: the station id (for example `sink`) and its fixed position, `Station.stale?: boolean` (or
similar), and events `sink.dump { by, item }`, `bin.leak { by, at }`, `mess.spawn { kind, at }`,
`pot.stale { station }` at morning.

### A4. Fridge, morning setup and closing

**Goal.** Opening and closing become real tasks.
- **Milk comes from the fridge.** It starts next to the espresso machine.
- **Fridge is gear** with silly names in a short tree: mini fridge → medium → high-end → one with an
  auto milk dispenser. Bigger = holds more, less goes bad, the top one pours milk by itself. Add the rows to
  `src/data/gear.ts`; Grok adds the GEAR_TREE.md table (send names/prices in BACKLOG, or write them yourself).
- **Morning setup:** supplies (milk, pastries when they exist, condiments) start in the fridge and must be
  put out before or after doors open. Skip it and the first customers hit empty spots.
- **Close:** supplies put back in the fridge keep; anything left out goes bad, even 19 of 20.
- **Closing soon:** the last 30 s of the day is a "closing soon" moment with a checklist.

**Freedom.** Capacities, spoil rules, whether set-out is one press or per item, fridge prices.

**Don't touch.** The night tab layout.

**Grok wires afterward.** The fridge sprite and level, a morning "Put supplies out" hint, the "Closing soon"
banner with ticks. Needs: `fridge` station id and gear ids; per-supply "out vs. in fridge" state;
`closingSoon: boolean` (or `closingAt` tick) and a checklist view such as
`closingChecklist(state) → { suppliesAway: boolean, potsEmpty: boolean, ... }`; events `fridge.take { by,
item }`, `fridge.put { by, item }`, `supply.spoil { item, count }` at close, `closing.soon` once.

### A5. Exact "left" counts for floating counters

**Goal.** Grok floats a number over each station with what's left: drip pot cups, cold brew left, shots
waiting, bar servings, fridge milk. At empty it shows nothing (no stuck "0").
- Check every station exposes an exact count in state; add any missing (for example a pulled shot count
  per machine, pot cups per drip station, `coldBrewLeft` per tap if there are several).

**Freedom.** Field names; a pure helper `stationLeft(state, stationId): number | null` would be ideal.

**Grok wires afterward.** The floating counters. Needs the field per station kind, or the helper.

---

## B. Next

### B6. Multi-drink orders

**Goal.** More variety per order.
- **Common combos:** 2 drinks (for a spouse in the car), espresso + drip, drink + pastry (when pastries
  exist). One ticket, a bit more patience, paid only when all of it is served.
- **Rare office runs:** 6–10 drinks, long patience, a big payout + tip if finished, **no bad review** if
  not. Optional: a phone heads-up a few seconds before they walk in (reuse `src/sim/call.ts` style).

**Freedom.** Odds, patience, payout, which drinks combine, area effects.

**Grok wires afterward.** Tall tickets with a tick per drink, an office-run phone card. Needs:
`Customer.items: { drink, done }[]` (or similar), events `order.combo { customer, items }`,
`order.office { customer, count }`, `office.call { at }`, `order.done { customer, paid, tip }`,
`order.lost { customer }` (office, no review).

### B7. Tray table (batching table)

**Goal.** Big orders shouldn't steal other customers' cups.
- A **tray table** in the back. Empty most of the time. The first drink set down claims the **oldest unfilled
  multi-drink ticket** that needs it; later drinks join only if that ticket still needs them.
- It keeps a live list ("1 drip, 1 latte, vanilla") and the customer's name/number.
- E with empty hands picks the whole tray up (max 2 trays carried? your call). On the pickup counter it takes
  **one** slot tagged to that customer. Only that customer takes it; singles can't take cups from a tray.
- A full tray has a higher spill chance on bumps.

**Freedom.** Whether a part-done tray can be picked up, spill maths, where the table sits, bot handling.

**Grok wires afterward.** The tray list over the table and the tray icon + name on a coaster. Needs: the
station id (`trayTable`), `tray: { customer, items: { drink, extras?, done }[] }` on the table, on a held
item and on a pickup slot; events `tray.claim { customer, by }`, `tray.add { drink, by }`, `tray.pick { by }`,
`tray.spill { by }`.

### B8. Hand-made lattes and cappuccinos

**Goal.** Lattes are where the chaos lives. Each step is a quick press or hold, not a minigame.
- **Milk jug:** hold E at the fridge to fill to a line: cappuccino, latte or large. Overfill wastes milk;
  underfill makes a weaker drink (lower stars/tip).
- **Steam meter:** a back-and-forth meter; stopping in the middle = perfect foam + bonus tip; a miss still
  makes the drink at a lower rating.
- **Shots:** single or double on tickets.
- **Syrup rack:** vanilla, caramel; forgetting the ticket's syrup = a grumble.
- Drip and cold brew stay simple. Bots skip the meters and get an "okay" result every time.

**Freedom.** Meter speed, windows, how quality maps to stars/tips, input shape (hold start/stop vs. a
single input with the result). The host must stay authoritative; the client can send the stop moment.

**Grok wires afterward.** The fill jug meter, the steam meter and recipe icons over the carried cup (done vs.
left). Needs: input names (for example `{kind:'fill', hold}` / `{kind:'steam', stop}`), meter state
(`fill: 0..1` with line marks, `meter: { pos, startedAt, speed }` or a pure helper), the recipe on a held cup
(`Held.recipe: { step, done }[]`, `shots: 1|2`, `syrup?`), and events `milk.fill { by, level, line }`,
`steam.result { by, grade: 'perfect'|'ok'|'miss' }`, `syrup.add { by, flavour }`.

---

## C. Later

### C9. Espresso rework (steamer goes away) — waits on Kennedy

**Goal.** No separate steamer. 6 espresso tiers:
- Tiers 1–2: espresso only.
- Tiers 3–4: better espresso, plus an **optional add-on steam wand** (weak and slow), bought with the machine
  or added on a later night.
- Tiers 5–6: always have a steam wand; the dual boiler is the top.
- Keep the silly names. **Grok rewrites GEAR_TREE.md sections 4.3/4.4/5 first; Kennedy approves before you
  change the sim.**
- Migrate saves that own a separate steamer (for example credit its sell value, or turn it into the add-on
  wand on a tier 3–4 machine).

**Freedom.** Numbers, migration rule, twin-station handling for the wand.

**Grok wires afterward.** Night shop cards for the add-on wand. Needs: the gear ids, the add-on input (for
example `{kind:'equip', gear, addon:'wand'}`) and `Station.wand?: boolean`.

### C10. Station rearranging

**Goal.** A 15 s pre-open time each morning. A key (Z, or E) picks up a station; setting it down on another
station swaps the two, and on an empty spot moves it there. Spots are looser than a strict grid.
- Fixed fixtures (sink, condiment bar, till?) can't move.
- Bots and pathing must handle new positions (`targetNodes`, twins, edge slots).

**Freedom.** The position model, key choice, how loose "loose" is, whether moves persist between days.

**Grok wires afterward.** The ghost outline and the pre-open timer. Needs: `preOpenUntil` (tick), the input
(for example `{kind:'moveStation', from, to}` or pick/place), a valid-spot helper, and events
`station.pick { by, station }`, `station.place { by, station, to, swapped }`.

### C11. Daily social feed and reviews

**Goal.** Like Game Dev Tycoon: end-of-day posts on a fake social app, fans that grow, posts that pop up during
the day after a bad drink, and an end-of-week reviewer rating.

**Freedom.** How many posts a day, fan maths, the weekly score formula.

**Grok wires afterward.** The phone feed, the pop-up posts and the week rating card, plus generated photos.
Needs events `review.post { customer, drink, sentiment: 'good'|'bad', reason, stars, at }` (live) and a
night view such as `dayReviews(state) → { posts[], fans, fansDelta }` and
`weekRating(state) → { reviewers: { name, score }[], fans }`, with `GameState.fans`.

---

## When you finish

Release as **3.4.0** once A is in (B and C can follow as 3.4.x / 3.5.0). Tell Kennedy which items landed and
which event/field names changed, so Grok can wire them.
