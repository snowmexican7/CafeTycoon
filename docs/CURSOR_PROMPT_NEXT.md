# CafeTycoon — Round 5 for Cursor (Kennedy's Nov 2 playtest, approved Nov 3, 2026)

**Repo:** github.com/snowmexican7/CafeTycoon · **Base:** latest `main` (v3.8.0 or newer).
**Your role:** contributor. You code; Grok reviews and merges your PRs. **New this round:** several blocks need sim
edits, and you may make them (see "Lanes this round"). Claude reviews the sim parts (`docs/CLAUDE_PROMPT_ROUND5.md`).

## Before you start (required)
1. Read `docs/HANDOFF.md` (Lanes, Decisions, esp. the 2026-11-03 entry) and `docs/ROADMAP.md` "Round 5".
2. `npm ci && npm test && npx tsc --noEmit && npm run build` on a clean `main`, so you know the baseline is green.
3. Every name below was checked against `main` at df28d76. If something has moved, follow the code and say so in the PR.

## Carryover (still open from the last prompt)
- **PR #19** (3.8.0 polish: feed fold, floater stagger, syrup chips, ghosts, bot mark) and **PR #20** (B6 leftovers:
  tall tickets, office phone, receipt, add-on ask) are **open, waiting for Grok's review**. Don't redo them. Branch
  Round 5 off the latest `main`; if #19/#20 merge while you work, rebase your unmerged branch.
- **Ghost outlines (block 1 of the last prompt):** block 5 below replaces the morning set-down outlines. If #19's
  ghost dimming conflicts with it, keep block 5's version.
- **Still waiting on Claude:** the `look` parameter on `createPeerTransport` (`src/net/peerTransport.ts`); optional
  `canAddSyrup` / `canSetDown` exports. Skip unless they've landed.

## Rules
- **One PR per block**, each off the **latest `main`** (re-fetch first). **Never push to `main`. Never force-push.**
- **Lanes this round:** UI-lane files as usual (`src/ui`, `src/render`, `src/audio`, styles, `src/main.ts`,
  `src/dev/fixtures.ts`). Blocks 2–6 may also edit `src/sim/**` and `src/data/**`. List every sim, data, net or storage
  file you touch under **"Sim files touched"** in the PR description, so Claude can review them. If the shape of `GameState`, `Player` or `Station`
  changes, or a new input or event is added, bump `PROTOCOL_VERSION` (`src/net/protocol.ts`, now 60) and
  `SNAPSHOT_VERSION` (`src/storage/snapshotStore.ts`, now 31) with a one-line note, like the existing comments.
  No save migrations (Kennedy: saves aren't a feature yet).
- **Deterministic sim:** no `Math.random`, no wall clock. Use `rngNext(state)` only where a roll is needed. Keep
  `validateInput` (`src/sim/validate.ts`) in step with any new input.
- **Green before you open the PR:** `npm test`, `npx tsc --noEmit`, `npm run build`. Add tests for every rule you
  change (sim tests next to the file, e.g. `src/sim/podsGrinder.test.ts`, `src/sim/bumps.test.ts`; UI models like
  `src/render/ghostSpots.test.ts`). Update existing tests whose numbers change, and say which ones in the PR.
- **Honest hints:** a hint may only look like "go" when pressing the key really does something in the sim right now.
- **Plain English** in everything the player sees. Short, friendly, no jargon, and **never the word "tap"** (say
  "press E", "click").
- **Big and readable at 1280x800 and 1512x982:** add a fixture in `src/dev/fixtures.ts` per new screen or state, and
  attach Playwright screenshots at both sizes. Nothing cut off, and no scrolling needed for the main action.
- **PR description:** what changed, files touched, "Sim files touched", fixtures, screenshots, test count, anything
  not done, and questions for Kennedy.
- **CHANGELOG:** one player-facing line per PR under `## Unreleased`. **The last PR (block 6) also bumps the version**
  (see block 6).

## Kennedy's rulings, do not change
- The night ALWAYS opens on the Restock tab first. He doesn't want more night pages: fold new night things into an
  existing tab (`GEAR_NIGHT_TABS` in `src/ui/night.ts`: Restock · Menu · Gear shop · Extras).
- Day-HUD declutter goes in small stages Kennedy reviews. No save-compatibility work. The per-tick `structuredClone`
  speed fix is parked.
- **Parked (Nov 3):** the hand-made jug and steam meters (FB2 B8, `src/sim/handmade.ts` `HANDMADE`, `Player.jug`,
  `steamPos`). Too chaotic by day 4–5. Don't expand them, add to them or build new meters. Leave the code as it is.

## Blocks (in order, one PR each)

### 1. Hair sits on the hairline (all styles) — UI/render
**Problem:** the hairstyles don't sit on the hairline and leave a bald spot on top of the head. This affects every style,
male and female.
- Art: `src/render/layers/actors.ts` `backHair(g, style, colour, facing)` and `frontHair(g, style, colour, skin,
  facing)` (called around lines 104, 149 and 172). The styles are `HairStyle` in `src/render/lookModel.ts`: `short`, `buzz`,
  `spiky`, `curly`, `bob`, `long`, `ponytail`, `bun`. Check `src/render/lookPreview.ts` (the creator preview) and the
  espresso-egg pose in `src/render/layers/espresso.ts`, which also draws hair, so they match.
- Fix: every style covers the crown down to one shared hairline, with no skin showing between the hair and the top
  of the head, for both facings (`Facing` is `'up' | 'down'` in `src/render/theme.ts`). Pull the head-top and hairline numbers into one place (e.g. a `HEAD` constant)
  so every style draws from the same numbers.
- **Accept:** a fixture that shows all 8 styles × both facings (e.g. `hairGrid`), plus the creator screen, with
  screenshots at both sizes. Add a small pure test that each style's front-hair top reaches the head top and its
  bottom edge reaches the hairline (export the geometry numbers to test them).

### 2. Espresso speed rework — sim (data + one sim helper) + UI text
**Kennedy:** keep the two-step chaos (grind, then pull) and keep it different from instant drip. But today, swapping two
Pod-o-Matics for a grinder and espresso machine is *slower*. Grinder plus espresso must beat two pod machines **at every
tier, walking included**. Grinder tier 2 is much faster, and tier 3 adds quality. Combos (americano, red-eye, doppio)
shouldn't feel punishing.

**Today (checked on `main`):** shot time = recipe seconds / (card `stationSpeed` × `gearSpeed`).
`ECONOMY.stationSeconds` (`src/data/economy.ts`): `grinder: 2.5`, `espresso: 5`. The pod shot is `POD_SHOT` in
`src/sim/gear.ts` (5 s, from empty hands, no grinder) at E1 speed 5/6, which makes **6.0 s**. Gear speeds in
`src/data/gear.ts`: g1 0.6, g2 1, g3 1.65; e2 0.9, e3 1, e4 5/4.5 (twin), e5 5/3.5 (twin), e6 5/3 (twin). The combo
recipes in `src/data/drinks.ts` `RECIPES.espresso` are americano 1.5 s, doppio 3 s and red-eye 3 s (pods can't make any of these).
Walking: the default layouts put the grinder in slot 0 (1,1) and the espresso machine in slot 1 (3,1) on every
tier (`TIER_LAYOUTS`, `SLOT_POSITIONS` in `src/data/layout.ts`). With `interactRangeTiles` 1.1 and
`moveSpeedTilesPerSecond` 4, that's about **0.4 s** a leg. A Gear buy goes into the **first empty slot**
(`src/sim/gear.ts` header), so after selling pods the grinder can end up far from the espresso machine.

**Change (proposed numbers; Claude reviews):**
1. **Base pull** `ECONOMY.stationSeconds.espresso` 5 → **3** (pods are unaffected: `POD_SHOT` keeps its own 5 s, so
   they stay at 6.0 s).
2. **Espresso speeds:** e2 0.9 → **1.05** (2.86 s), e3 1 → **1.2** (2.5 s), e4 → **1.25** twin (2.4 s), e5 → **1.5** twin
   (2.0 s), e6 → **1.75** twin (1.71 s). Update the blurbs that quote seconds ("5 s shots", "4.5 s each", "3.5 s shots",
   "3 s shots") and the comment above e3.
3. **Grinder tiers:** g1 0.6 → **1.0** (2.5 s, base speed, keeps the cumin `offNote`), g2 1 → **2.0** (1.25 s, "much
   faster"), g3 1.65 → **2.0** plus quality: `polish: true` (the existing G10 "+1★ cap" in `gearPolish`, which forgives
   one slip). Check that `gearPolish` works on the grinder's output cup. If it only runs on the station that takes the cup,
   carry the forgiveness onto the grounds' shot and say how in the PR.
4. **Grinder hopper:** one grind makes several doses. A new `GearInfo.doses` (g1 **2**, g2 **3**, g3 **4**) and
   `Station.doses?: number`. When a grind finishes, the grinder holds `doses` grounds. Each press of E with empty hands
   takes one *at once* while any are left, and when it's empty the next press grinds again. The grinder shows the dose count
   (render: small "×3" chip, no new panel). Bots (`src/sim/bots/brain.ts`) must take from the hopper too. A grinder's
   doses go stale at closing (cleared with the day), the same as other outputs.
5. **Combos:** americano 1.5 → **1.0** s, doppio 3 → **2** s, red-eye 3 → **2** s (`RECIPES.espresso`).
6. **Keep the grinder next to the espresso machine:** when a grinder or espresso machine is bought into an empty slot,
   prefer the empty slot nearest its partner (falls back to the first empty slot).

**Numbers (one barista, cards ×1, 0.4 s walk; "shot time" = grind ÷ doses + walk + pull; ceiling = what the
machines can make per minute with two people):**

| Setup | Shot time today | /min today (1 person) | Ceiling today | Shot time new | /min new (1 person) | Ceiling new |
|---|---|---|---|---|---|---|
| **2 × Pod-o-Matic (E1)** | 6.0 s | 10.0 | 20 | 6.0 s | 10.0 | 20 |
| g1 Spice + e2 Brevelle | 10.1 s | 5.9 | 10.8 | 4.5 s (5.8 s with an empty hopper) | 13.3 | 21 |
| g2 Burr + e3 Sylvia | 7.9 s | 7.6 | 12 | 3.3 s | 18.1 | 24 |
| g3 Monolith + e4 Due (twin) | 6.4 s | 9.4 | 26.7 | 3.1 s | 19.3 | 50 |
| g3 + e5 Annihilator (twin) | 5.4 s | 11.1 | 34.3 | 2.7 s | 22.1 | 60 |
| g3 + e6 Double Trouble (twin) | 4.9 s | 12.2 | 39.6 | 2.4 s | 24.7 | 70 |

Even the cheapest grinder setup with an empty hopper (5.8 s) now beats a pod (6.0 s). The upper tiers' ceilings are far above what
customers can order, so the real limit stays the line, steaming and delivery. Run `src/sim/gearBalance.test.ts` and
report what moved.
- **Tests:** update `podsGrinder.test.ts`, `espresso.test.ts`, `gearPull.test.ts`, `gearTwin.test.ts`,
  `gearBalance.test.ts` and any other test pinned to the old seconds. Add `src/sim/hopper.test.ts` (grind once and take `doses`,
  instant takes, empty → grinds again, bots use it, closing clears it) and a test that the shot times in the table
  hold (pod x2 slower than every grinder + espresso pair).
- **UI:** the Gear shop cards (`src/ui/gearVM.ts`) show the new seconds and "Grinds N shots at once". Plain English.

### 3. Collisions + the drip pot timer — sim constants + one sim rule
**Kennedy:** a tighter collision box, and harder bumps: mostly more bounce-away, plus a bit more slowdown, so two people running to
the till stop getting stuck on each other. Bumping into customers stays as it is.
- Today (`ECONOMY` in `src/data/economy.ts`): `baristaHalfWidth: 0.35` (body vs walls and stations, `blocked()` in
  `src/sim/movement.ts`). `bump: { bodyTiles: 0.6, staggerSeconds: 0.6, staggerSpeed: 0.4, cooldownSeconds: 1.0,
  spillChance: 0.05, push: 0.15, … }` (`stepBumps` in `src/sim/bumps.ts`).
- **Change:** `baristaHalfWidth` 0.35 → **0.3**, `bodyTiles` 0.6 → **0.5**, `push` 0.15 → **0.4** (the bounce),
  `staggerSeconds` 0.6 → **0.75**, `staggerSpeed` 0.4 → **0.35**. Leave `cooldownSeconds`, `spillChance` and all the
  `customer*` values alone.
- **Unstick rule:** today `nudge()` moves each person `push` tiles in one tick, and if a wall or station blocks it they stay
  overlapped and bump again once the cooldown ends. Add a separation step in `stepBumps`: any two bodies closer than
  `bodyTiles` get moved apart along the line between them, until they're `bodyTiles` apart, whether or not they're
  bumping. Use `nudge`, so it never goes into walls or stations. If one side is blocked, the other moves the whole way.
  Show the bounce as a short slide over about 0.15 s (render interpolation is fine) rather than a jump.
- **Drip pot timer:** `pot.coldAfter` in `src/data/gear.ts` (the hot plate; `potColdAt`, `src/sim/gear.ts` ~777):
  d1 45 → **55** s, d2 60 → **75** s. d3/d4 stay `null` (never cold).
- **Tests:** `bumps.test.ts`, `movement.test.ts`, `customerBumps.test.ts` (should be unchanged), and a new
  "two people running at the till from both sides don't bump more than twice in 3 s" test. `gearDrip.test.ts` and
  `cooling.test.ts` for the new pot times.

### 4. Cold brew refill mid-day + staff supply station by the sink — sim + render + hints
**4a. Refill an empty cold brew tap mid-day.** Today a tap (`coldBrewTap`; its daily cups are `Station.batchLeft`,
filled at night by `steepMorning` in `src/sim/steep.ts`) does nothing when `batchLeft === 0`. The empty tap
also blocks the iced latte, which draws a tap cup (`tapCupRecipe`, `takeTapCup` in `src/sim/gear.ts`;
`batchOut(state)` is the "all taps empty" check). There is no separate iced coffee dispenser in the sim. The iced
drinks all come from this tap.
- **Add:** E with empty hands at an empty tap, during the day, with concentrate in stock (`supplies.concentrate`) starts a
  quick refill (`busyTicksLeft`, about **4 s**). It adds cups up to **half the tap's `tapCap`**, paying 1 concentrate per cup
  as `steepPlan` does. Event `coldbrew.refill { by, station, cups }`. With no concentrate, nothing happens, and the hint
  says "Out of cold brew. Buy more with 📦 Restock" (the day rush restock, `restock.rush`, already sells it).
- **Render/hint:** an empty tap looks empty and its hint reads "Press E to refill (4 s)" only when the refill will run.
- **Tests:** `src/sim/coldBrewRefill.test.ts` (refills, pays, no concentrate → no-op, night → no-op, iced latte works
  after refill).

**4b. Staff supply station (milk and cream) by the sink.** Today staff milk comes from the fridge (`FRIDGE_ID`, against
the left wall at (1,3), `src/sim/fridge.ts`). E with empty hands there takes a carton (`Player.tool = 'milk'`), and E at a
milk station (a steamer, a steam wand on the espresso machine, a cold brew tap) puts it out into `state.milkOut`. The sink is on the
right wall (`layoutFor(tier).sink`: stand (7,4), cart (9,4), café (11,4)). **Not found:** staff using the customer cream
and sugar bar. In the sim the condiment bar (`CONDIMENTS_ID`, `src/sim/condiments.ts`) is for customers only, and no recipe
uses it. So the problem is the long walk to the fridge, plus not knowing where to get milk. There is no separate "cream"
supply. Sweet cream (`RECIPES.coldBrewTap` `sweetCream`) and the iced latte both use `milk`.
- **Add:** a fixed counter-kind fixture `SUPPLY_ID = 'supply'` (`src/data/layout.ts`), right next to the sink (e.g. the
  tile above it). Pick a tile `layoutProblems` (`src/sim/rearrange.ts`) accepts on every tier. It's a second fridge door for
  staff: E with empty hands takes a milk carton from `supplies.milk`, the same as the fridge (`FRIDGE.carton`). The rules
  for "no fridge, no milk" don't change. Fixtures never move (C10 rule). Label it "Milk & cream". Art: a small fridge-ish
  shelf with a milk jug and a cream carton.
- **Tests:** a carton from the supply station works at the wand, the steamer and the tap (iced latte, sweet cream). No
  fridge → no carton. Layout checks pass on stand, cart and café.

### 5. Rearranging moves to the night (Gear shop tab) — sim + UI
**Kennedy:** the morning pre-open doesn't work. Mornings have jobs (start the drip, empty the old pot at the sink, get
supplies), and in the pre-open "people can walk about but not use anything" (`src/sim/rearrange.ts` header). Move the
whole rearranging system to the night, so it can be done any time then.
- **Sim:** remove the pre-open. Stop calling `beginPreOpen(state)` from `src/sim/night.ts` (~line 185), so the day starts with
  the doors open. `applyMoveStation` is gated on `inPreOpen(state)`. Change that gate to `state.phase === 'night'` (Gear run,
  connected human). Keep `planMove`, `judge`, `layoutProblems`, `validStationSpots`, `slotPos`, `keepMovesOrReset`, and the
  `station.place` / `station.refuse` events as they are. `preOpenUntil`, `openDoors`, `preopen.*` and
  `ECONOMY.preOpenSeconds` can go, or stay unused. Either is fine, but say which in the PR. The night `ready` input stays (it's the
  night's).
- **UI:** fold it into the existing **Gear shop** tab as a "Layout" section, not a new tab. Restock still opens first.
  It shows a top-down map of the bar (the back-bar slots, fixtures greyed out with their names). Click a machine, then click a
  highlighted tile (`validStationSpots`) to send `moveStation`. Esc or a second click cancels. Keyboard works too: arrows
  move, Enter picks and places. Plain words: "Click a machine, then click where it goes. Fixtures (till, sink, fridge…)
  stay put." Show the refusal reason as a short line when `station.refuse` comes back.
- Remove the day-side C10 UI: the Ready / Open doors bar, the Z/E carry hint, and the ghost outlines (`src/render/ghostSpots.ts`,
  `atCarrySpot`, fixture `preOpenCarry`). Reuse `ghostSpots` for the night map if it helps. Update
  `src/ui/preOpen.test.ts` (Grok's "ui-3.8.0 review fix-ups" there go away with the pre-open; keep the honest-hint
  rule on the map).
- **Tests:** `rearrange.test.ts` moved to night (moves work at night, refused in the day, layout kept across a gear buy),
  `night.test.ts` (no pre-open at day start), and a UI model test for the map. Fixture `nightLayout` with
  screenshots at both sizes.

### 6. Give the cashier something to do + release — sim (layout default) + UI + version bump
**Kennedy:** the cashier is idle. The till is `COUNTER` at (6,6), and ring-up is `TILL.ring` in `src/sim/till.ts`:
register 1.5 s, `ringProgress`. The back bar is five rows up at y = 1.
- **Option A (recommended): put the drip machine by the till by default.** When a drip machine (d1–d4; not the
  pour-over bars d4b/d5b) is bought, it goes on a till-side tile in the row above the till (y = 5, nearest the till that
  `layoutProblems` accepts, keeping "an idle tile by the till"). If no tile works, it falls back to a back-bar slot. The
  cashier then brews and pours drip and red-eyes (red-eye starts from a drip cup) between ring-ups, and handles the pot
  at the sink nearby (block 4's supply station is close too). Players can still move it at night (block 5), and a move
  they made is kept (`slotPos`). Sim: a front slot spot in `SLOT_POSITIONS` / `defaultSlots` or a placement rule in the
  gear buy. Pick the smaller change and explain it.
- **Option B:** the cashier hands out pastries from a pastry case at the till (pastries are already buyable on Restock).
  It's more new art and new rules, so leave it for later.
- **Build Option A.** Bots: check `src/sim/bots/brain.ts` drip steps still path to the new spot.
- **Tests:** a drip machine bought into an empty shop sits by the till on stand, cart and café. A night move overrides
  it. Bots still make drip.
- **Release (this PR only):** bump `package.json` `version` to **3.9.0**. Move every Round 5 line in `CHANGELOG.md` from
  `## Unreleased` to `## 3.9.0 — 2026-11-xx` (the date it's opened). Add a `docs/BACKLOG.md` "Round 5 (Cursor)" entry
  listing the PRs and names as built. Add a `docs/HANDOFF.md` line under "Grok → Claude log" naming every sim file
  touched in Round 5. Grok merges, tags `v3.9.0` and writes the HANDOFF "Decisions" entries.

## Not this round (on the ROADMAP)
- Co-op scaling: 3 players get more rush orders; 4 players play a 2v2 challenge. A design item only (ROADMAP "Round 5 →
  Later"). Don't build it.
- More hand-made meters (parked).

## When you're done
Leave a short summary in the last PR's description: PR numbers in order, test count, what's open, the "Sim files
touched" list across all blocks, and any questions for Kennedy.
