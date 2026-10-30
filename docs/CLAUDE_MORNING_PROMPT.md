# Claude: morning prompt (paste as-is)

> One consolidated prompt from the overnight sprint (Grok Bot, UI lane, 2026-10-30 00:00–06:45 Toronto).
> Read `docs/GEAR_TREE.md` (Gear design), `docs/PHASE4_PLAN.md` and the Gear / Phase 4 sections near the end
> of `docs/BACKLOG.md` first. Everything below is on `main`; nothing is waiting on a branch.

## Where things stand

- **Live: v3.2.0** (tag `v3.2.0`, "Phase 4 lite"). History: v3.0.0 Gear Tree (G11; rollback `pre-gear` / `v2.2.0`),
  v3.1.0 Phase 3 (hired staff with wages, head starts), v3.2.0 Phase 4 blocks 1–6 + season board + rival loyalty
  card. Every new run from the title or a co-op lobby is a **Gear run**; `?gear=0` still starts classic, and old
  classic saves resume as classic. Pages deploys every push to main.
- SNAPSHOT 27 (all new state is optional fields), **PROTOCOL 40**. 1053 tests in 129 files; tsc and build clean.
- After v3.2.0, Phase 6 polish only (UI/tests, no sim rules changed; live under the 3.2.0 label): P6-1 phone
  ring sound, P6-2 season week-by-week table in Records, P6-3 week strip on the week-end screen, P6-4 readable
  12px labels, P6-5 real v2.1.0/v3.1.0 save fixtures (`src/storage/*.fixture.json`, `oldSaves.test.ts`; keep
  them loading), P6-6 café-start headless run (`CAFE=1 npx tsx scripts/p4Smoke.ts 14 2`).
- Integration checks you can reuse: `npx tsx scripts/gearBalance.ts 28 3` (headless Gear runs with stand-in
  bots; `KEEP=1` plays seasons) and `npx tsx scripts/p4Smoke.ts 28 3` (scripted crew that uses the Phase 4
  inputs; a 6-day version runs in vitest as `src/p4Smoke.test.ts`).
- **Not built:** travel to the second shop (B6), 2v2 on a shared street (B7 is a design spike only:
  `docs/P4_B7_VERSUS_SPIKE.md`; don't start V1 until Kennedy answers its open questions), Phase 5 (AI).

## Already done by you on main (don't redo)

- Solo bots switch (`d401839`), bots leaving your prep alone (`1f2f07a`, `e33a119`), Overcooked-style bumps and
  collision spills (`47b03d1`, tuned to 5% in `b0d14f4`, snapshot 27 / protocol 30 in `2929d69`), the planner
  skipping classic slot/equip purchases in Gear runs (`a7695ec`), your review of the Gear G1–G5 sim edits
  (`76c33dc`), the claimed-drink coverage test (`8cdd209`), and the fb1-sim crewTips fixes.

## Goal

Make the bots good teammates in **Gear runs**, then teach them the Phase 4 systems. Bots were only taught the
classic stations, and they ignore everything Phase 4 added. A Gear run with bots should feel as smooth as a
classic one. Also review the overnight sim edits (list below) and fix anything you'd do differently.

## The work, part 1: Gear stations (bot side, all Gear-only unless noted)

1. **Pods (E1 Pod-o-Matic).** No grinder, it uses `pods` stock. Empty hands + E = a shot. Today bots can't
   make espresso on E1. `podsCoverGrinder(state)` and `gearRecipe` in `src/sim/gear.ts` say what's allowed.
2. **Jams and dead machines (G5 quirks).** Whack a jammed machine (use it again). Don't walk to a dead
   one (the battery whisk dies until night). Use `gearBlocked(state, station, player)`.
3. **Drip pots (G4d).** Brew a pot once, then pour per cup. Prefer pouring from a pot that's still hot. Rebrew
   when it's empty or cold (`gearPotPour`, `Station.pot*` fields). Temperature misses happen. Don't loop on them.
4. **Till (G4g).** In co-op Gear runs, a free bot may stand at the till and ring up customers (speed tips).
   Never let it pin a bot that's needed at a machine.
5. **New drinks from level-ups (G6/G6b).** Americano (espresso in hand → espresso machine, not on pods),
   Cappuccino (latte in hand → steamer), plus Iced latte and Mocha now arrive by serving counts instead of
   on day 3/5. `recipeChain` resolves them. **Clash rule:** at the steamer, a latte can become mocha or
   cappuccino, and `recipeFor` picks the oldest non-upset customer's drink, so bots should carry the latte
   to the steamer only when that ticket is theirs.
6. **Multiples (G4e).** A crew can own two of the same machine. Bots should spread out across them.
7. **Optional niceties:** favour families that tip well in this area (`areaTipMul`), and drinks near a
   level-up (`levelUpProgress`).
- **P3 B15 hired staff (bot side, small):** bots now cost wages in Gear runs (`src/sim/staff.ts`: `billsForDay` = rent + wages). I switched the night planner's budget in `sim/bots/planner.ts` (`restockAdvice` default and the night plan) from `rentForDay` to `billsForDay`, please review. Optional: the planner could suggest letting a bot go when wages beat what it adds (at the stand that is often true), and bots should never send the `staff` input.
- **G6c new level-up drinks:** Doppio (espresso in hand → espresso machine again; clashes with Americano, so take it only when the oldest such ticket is yours), Sweet-cream cold brew (cold brew in hand → tap), Café au lait (drip pour in hand → steamer), Red-eye (drip pour in hand → espresso machine, not on pods). `recipeChain` resolves all four.
- **G10a Pour-over:** made from empty hands at a `drip`-kind station whose gear has `pour` set (`GEAR[s.gear].pour`). The pot drip machines on the same kind make drip instead, so pick the station by gear. `recipeChain('pourOver')` gives one `drip` step.
- **G10b crowds & snobs (optional):** snob regulars (`Regular.snob`) tip ×1.3 only for a perfect (3★, no slips) cup and ×0.5 for 1★ or less, and the arts crowd tips by stars too, so bots serving a snob or working in the arts district should favour accuracy over speed. Office/gym customers have ×0.85 patience (`areaPatienceMul`).
- **G9 twin stations:** E4–E6 put extra stations in the same slot, 0.55 tiles to the side (`Station.twin`; ids like `steamer`, `espresso-2`). `targetNodes` already finds the side tile for each, so bots can use them as ordinary stations; with E5/E6 they should split shots across both groups. Check edge slots: when the machine sits on the first or last column, the outer twin may have no walkable node (human-only), so the planner must not hang waiting for it.
- **G10 pod machine + perks (bot side):** I made two small bot edits so stand-ins could work a fresh Gear stand at all: `chainFor` skips the grind step when a pod machine covers it, and `act` 'insert' checks `gearRecipe(st, held)` before `recipeFor` (same order as `stations.ts`). Please review them in your bot tidy-up. Also worth teaching the planner: prefer the polished C5/E6 for 3★ cups, and treat a flowing D4b (`Station.flowUntil > tick`) as the fast station while it lasts. The night planner should not trade the E1 pods for E2+ before a grinder is in a slot (see scripts/gearBalance.ts for the rule).
- **G8 co-op votes (optional polish):** `state.gearVote` and the `gear/vote` input are live (protocol 31). If you touch net/host: call `settleVote(state)` (sim/gear.ts) when a player disconnects so a vote can't hang; a toast on vote pass/fail would be nice. Bots must not vote.
- **Gear polish (UI only):** rung-up customers now show a receipt above them, so a till bot (item 4) is visible to players. Also, on night 1 of a Gear run with an empty counter, crew tips suggest "Take the Espresso/Latte off the board" though nothing can be made yet. Please make crewTips skip menu advice when `unlockedDrinks(state)` is empty.
- **Integration smoke fix (bot side, small):** the browser smoke found that a grinder bought next to the Pod-o-Matic made bots grind beans the pod machine refuses, so espresso sales dropped to zero (6–7 cups/day → 0). `chainFor` now also skips the grind step when `podsOnly(state)` (sim/gear.ts: every espresso machine is a pod machine). Still open for you: in a mixed bar (E1 + E2+ with a grinder), `use(state, p, 'espresso', 'insert')` can pick the pod machine while holding grounds; the planner should route grounds to a non-pod machine.


## The work, part 2: Phase 4 (bots ignore all of it today; planner hints, not new maths)

1. **Phone calls** (`src/sim/call.ts`): bots never answer. Let a bot Manager answer `{kind:'call', take}` while
   `callRinging(state)`: fix the machine if branch staff ≥ 2, take the office order when the last branch day had
   no walk-outs. (Inputs are people-only in `validate.ts` today; widen it for bots deliberately if you do this.)
2. **Rival:** on a night where `isPromoDay(state)` and not `countered(state)`, an advice row "Match Starbuck$'s
   happy hour" (`{kind:'rivalCounter'}`); on the loyalty launch night (`loyaltyLive` and not `hasStamps`) suggest
   the Stamp card (`{kind:'stampCard'}`) when cash ≥ $30 + a day's restock.
3. **Second shop** (`src/sim/branch.ts`): suggest opening when tier is café, cash ≥ cost + a stock buffer and the
   home shop is profitable; suggest ±1 barista from `days[-1].branch` (walked > 0 → add; loss with walked 0 →
   cut). Use `branchDay(state)` for the estimate; don't change branch maths in bot code.
4. **Send stock** (manager mode): if a bot holds Manager and a branch is open, send surplus beans/milk when
   home stock > 2 packs (`branch` input `send`).
5. **Seasons / reports (optional):** `seasonNow(state)` → `{week, target, soFar}` if the planner should lean to
   cash late in a week short of its target; `reportViewModel(state).crew` gives each bot's cups and takings.
6. **Staff:** the planner could suggest letting a bot go when wages beat what it adds; bots never send `staff`.

## Sim edits made overnight (please review)

- `sim/levelUp.ts` (new), `levelUpOnServe` called from `customers.ts` serveCustomer after tallyDrink.
- `sim/stations.ts` `recipeFor`: when there are several matches, the oldest waiting ticket wins.
- `sim/gear.ts`: `gearPullMul` reweights `drawDrink`, `noteFamilyTip` gives per-family tips, and
  `gearRecipe` blocks americano on pods.
- `sim/unlocks.ts`: `unlockForDay` returns `[]` in Gear runs.
- G8: sim/gear.ts `applyGearInput` split into proposal/vote + `gearDeal`; `GameState.gearVote/gearVoteLast`; validate.ts vote case; run.ts `startDay` clears the vote; PROTOCOL_VERSION 31.
- G6c: `data/drinks.ts` 4 new drinks + recipes + `GEAR_ONLY_DRINKS`; `sim/levelUp.ts` `needs`/`levelUpGearOk`; `gearRecipe` refuses drip on pods.
- G10a: `data/gear.ts` d4b/d5b (`pour`, `requires`); `sim/gear.ts` `gearRecipe` pour branch, `gearRequiresMet`, pour-over unlock on buy, `gearPriceMul` pour-over; `sim/bots/planner.ts` `stationName` knows 'drip' (crash fix, one line).
- G10b: `data/areas.ts` crowd fields, `SNOB_GEAR`/`SNOB`; `sim/gear.ts` `areaPatienceMul`, `areaQualityTip`, `snobFamilies`, `snobTip`, and per-drink overrides in `areaTipMul`; `sim/customers.ts` `pickRegular` (snob first via `newSnob`, ordinary names now count non-snobs), area patience in `addCustomer`, and the quality/snob tip in `serveCustomer`.
- G9: `data/gear.ts` `twin`; `sim/types.ts` `Station.twin`; `sim/slots.ts` `stationsFromSlots` adds twins (`TWIN_OFFSET`); `sim/levelUp.ts` `levelUpGearOk` counts the E4 wand as a steamer.
- G10: `data/gear.ts` `polish`/`flow`/`draws`/`influencerOdds`; `data/areas.ts` `pull`/`pullDrink`; `sim/gear.ts` `gearSpeed(s, tick)`, `gearPolish`, flow roll in `gearAfterUse`, `gearPullMul` area pull, influencer odds in `applyGearPrices`; `sim/stations.ts` calls `gearPolish`; `sim/types.ts` `Station.flowUntil`; `sim/bots/brain.ts` pod chain + `gearRecipe` in `act`; new `scripts/gearBalance.ts`.
- Smoke fix: `sim/gear.ts` `podsOnly`; `sim/bots/brain.ts` `chainFor` skips the grinder when `podsOnly`.
- G11 (storage + net, please review): `storage/recordsStore.ts` records split (still version 1: `split` marker + `classic` bests; `splitRecords` moves pre-v3 bests to "Classic (retired)"; classic runs fold into `classic` only), and PROTOCOL_VERSION 32 so v2 tabs are told to refresh. `createRun` itself still defaults to classic (goldens untouched); the UI passes `gear: true`.
- P3 B15: `sim/staff.ts` (new), `closing.ts` calls `payWages` after rent, `types.ts` `DayStats.wages` + `staff` input, `validate.ts`/`step.ts` staff case, `profit.ts` and `storage/recordsStore.ts` subtract wages, `brief.ts` uses `billsForDay`. PROTOCOL_VERSION 33.
- P3 B16: `sim/perks.ts` (new, `applyPerk` called at the end of `createRun`), `types.ts` `CreateRunOptions.perk` + `GameState.perk`. Bots are unaffected.
- B17: `sim/staff.ts` `wageEach` is now paid by the hour (scaled by `settings.dayLengthSec / 150`), so quick 60 s days cost 40%. If the planner budgets wages, use `wagesForDay`/`billsForDay`, not the tier table.
- P4 B1 (tag `p4-b01`): `sim/rival.ts` adds rival happy-hour days (`isPromoDay`, `promoLevel`, `applyRivalPromo` in `computeModifiers`) and a human-only night input `{kind:'rivalCounter', on?}` (PROTOCOL 34, `Rival.counter`). Bots never send it. For the planner: on a night where `isPromoDay(state)` and not `countered(state)`, an advice row "Match Starbuck$'s happy hour" with input `{kind:'rivalCounter'}` would help solo-with-bots crews; `computeModifiers` already reflects the promo, so walk-in forecasts are right.
- P4 B2 (tag `p4-b02`): `sim/season.ts` adds `GameState.season` (PROTOCOL 35). `beginSeason` runs on the first week-end Keep going of a Gear run; `seasonWeekEnd` in `finishDay` stops at the week-end screen every 7th day until week 4 (`done`). Bots don't need to do anything (the host decides at week-end), but `seasonNow(state)` gives `{week, target, soFar}` if you want the planner to lean toward cash on the last nights of a week that is short of its target. Follow-ups: a season board in Records (fold `season.weeks` into `recordsStore` keyed like runs) and a per-player stats line per week. `KEEP=1 npx tsx scripts/gearBalance.ts 28 3` plays four-week seasons headlessly: stand-in crews hit about a third of $30–40 targets, so tune `SEASON.floor/growth` with real playtests.
- P4 B3 (tag `p4-b03`): `serveCustomer` now tallies `DayStats.waitTicks`, `takingsByDrink` and `byPlayer` (PROTOCOL 36; all optional, old days read as "—"). `src/ui/report.ts` `reportViewModel(state)` builds the night's 📋 Report drawer (`NightVM.report`). For bots: `report.crew` gives each bot's cups and takings per day, a clean signal if you want bot self-review or a 'bot of the day' line; `report.notes` are rule-based and could feed the planner's advice rows (don't duplicate them).
- P4 B4 (tag `p4-b04`): second shop. `src/sim/branch.ts` runs an off-screen branch at each closing (`settleBranch`, `DayStats.branch`, `GameState.branch`, new `branch` input open/staff/close; PROTOCOL 37). Bots ignore it today. For bots: a planner hint could suggest opening when tier is café, cash ≥ cost + a stock buffer and the home shop is profitable, and suggest ±1 barista from `days[-1].branch` (walked > 0 → add; loss with walked 0 → cut). Use `branchDay(state)` for the estimate; don't change its maths in bot code.
- P4 B5 (tag `p4-b05`): manager mode (lite). `hasManager(state)` adds `BRANCH.managerCups` (2) per barista and applies `roleSupplyCost` to branch cups; branch input `send` (+`supply`) moves up to one pack of home stock into `Branch.stockCredit` (valued at pack cost), which pays branch cups first (`DayStats.branch.fromStock`). For bots: if a bot holds Manager and a branch is open, a hint could send surplus beans/milk when home stock > 2 packs; don't touch branch maths.
- P4 B6 (tag `p4-b06`): phone calls (lite). `src/sim/call.ts`: `callFor(state, day)` (hash of seed+day, 45% of days once the branch has run a day; `machine` or `order`; rings 25–55% into the day for 25 s), `callRinging`, input `{kind:'call', take}` (people only, while ringing) → `GameState.callAnswer`; `branchDay(state, day, withCall=true)` at closing applies it (missed machine = half cups; fix = $25; order = +$30 and −10 cups) and records `DayStats.branch.call`; `settleBranch` clears `callAnswer`. HUD card `.hud-call` (`callVM` in live.ts, `callHtml` in hud.ts). Bots never answer; a hint could let a bot Manager answer (fix if branch staff ≥ 2, take orders when last day had no walk-outs). Travel to the branch (two live floors) is not built.
- P4 follow-up F1 (tag `p4-f01`): season board in Café records. `Records.seasons?` (`SeasonRecord`) upserted by `foldRecords` when `state.season` exists, best-first (`seasonOrder`), max 6; rendered as a "Season board" section in `src/ui/records.ts`. Records store version unchanged (optional field).
- P4 follow-up F2 (tag `p4-f02`): rival loyalty card. `loyaltyLive`/`hasStamps`/`applyRivalLoyalty`/`loyaltyMorning`/`applyStampCardInput` in `src/sim/rival.ts`; input `{kind:'stampCard'}`; `Rival.stamps?`; brief alert `rival:loyalty` with a Stamp card fix. Bots ignore it: a planner hint could buy the stamp card on the launch night when cash ≥ $30 + a day's restock.
- P4 B7 is a **design spike only** (tag `p4-b07-spike`): `docs/P4_B7_VERSUS_SPIKE.md`. Don't start V1 until Kennedy answers its open questions.
- P6-6 (scripts only): `scripts/gearBalance.ts` `playGear(..., start?)` sets `s.tier`/`cash` directly because `createRun` ignores a `tier` option; if you want `createRun({tier})` to work, wire it there and drop the workaround.
- No snapshot bumps: all new fields are optional (SNAPSHOT 27). Protocol is 40 since P4 F2 (39 B6, 34 B1, 35 B2, 36 B3, 37 B4, 38 B5).

## Freedom

- Change anything in `src/sim/bots/**`, and any sim helper you need, in whatever way you like.
- Retune numbers (counts, chances) if playtests say so. Keep the doc tables in sync.
- Bump snapshot/protocol if you add state (old saves must still load).

## Don't touch

- UI files (`src/ui/**`, `src/render/**`, styles), Playwright scripts, and the night tab order.
- Classic-run behaviour and goldens. Everything above is Gear-only (`state.gear === true`).
- `DRINK_IDS` order (append only: seeds hash drink indexes).

## What I (UI lane) will wire afterward

- Bot chips and toasts for any new bot behaviour you log (for example "Bo-bot whacked the Pod-o-Matic").
- Any crew-tip text you add for Gear (it shows on Tonight).
- Screenshots and a smoke at 1512x982 and 1280x800 once your branch lands.

## When you finish

One dash-named branch per piece of work, merged into main with `--no-ff` and tagged; tsc, vitest and build
green; tests for new logic; old saves still load. Add a line per change to `docs/BACKLOG.md` and the CHANGELOG
`## Unreleased` section. Release as 3.3.0 after a clean `gearBalance` + `p4Smoke` run.
