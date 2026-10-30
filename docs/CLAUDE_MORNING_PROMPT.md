# Claude: morning prompt (paste as-is)

> Written overnight by the UI lane (Grok Bot) while Kennedy slept. It collects every bot, sim and net item
> the overnight Gear sprint left for you. Please read `docs/GEAR_TREE.md` (the design) and the Gear entries
> near the end of `docs/BACKLOG.md` (what was built, block by block) first.

## Goal

Make the bots good teammates in **Gear runs**. Everything in the Gear Tree now exists in the sim, but bots
were only taught the classic stations. A Gear run with bots should feel as smooth as a classic one.
Also review the overnight sim edits (listed below) and fix anything you'd do differently.

## Already done on main (no need to redo)

- Solo bots switch (`solo-bots-switch`), bots leaving your prep alone (`bot-prep-wait`), collision spills
  (`collision-spills`, tuned to 5%), planner skipping classic purchases in Gear runs, and the crewTips fixes
  (fb1-sim-fixes). They were all on main before the sprint.

## The work (bot side, all Gear-only unless noted)

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
<!-- SPRINT-APPEND: later blocks add items below this line -->
- **G6c new level-up drinks:** Doppio (espresso in hand → espresso machine again; clashes with Americano, so take it only when the oldest such ticket is yours), Sweet-cream cold brew (cold brew in hand → tap), Café au lait (drip pour in hand → steamer), Red-eye (drip pour in hand → espresso machine, not on pods). `recipeChain` resolves all four.
- **G10a Pour-over:** made from empty hands at a `drip`-kind station whose gear has `pour` set (`GEAR[s.gear].pour`). The pot drip machines on the same kind make drip instead, so pick the station by gear. `recipeChain('pourOver')` gives one `drip` step.
- **G10b crowds & snobs (optional):** snob regulars (`Regular.snob`) tip ×1.3 only for a perfect (3★, no slips) cup and ×0.5 for 1★ or less, and the arts crowd tips by stars too, so bots serving a snob or working in the arts district should favour accuracy over speed. Office/gym customers have ×0.85 patience (`areaPatienceMul`).
- **G9 twin stations:** E4–E6 put extra stations in the same slot, 0.55 tiles to the side (`Station.twin`; ids like `steamer`, `espresso-2`). `targetNodes` already finds the side tile for each, so bots can use them as ordinary stations; with E5/E6 they should split shots across both groups. Check edge slots: when the machine sits on the first or last column, the outer twin may have no walkable node (human-only), so the planner must not hang waiting for it.
- **G10 pod machine + perks (bot side):** I made two small bot edits so stand-ins could work a fresh Gear stand at all: `chainFor` skips the grind step when a pod machine covers it, and `act` 'insert' checks `gearRecipe(st, held)` before `recipeFor` (same order as `stations.ts`). Please review them in your bot tidy-up. Also worth teaching the planner: prefer the polished C5/E6 for 3★ cups, and treat a flowing D4b (`Station.flowUntil > tick`) as the fast station while it lasts. The night planner should not trade the E1 pods for E2+ before a grinder is in a slot (see scripts/gearBalance.ts for the rule).
- **G8 co-op votes (optional polish):** `state.gearVote` and the `gear/vote` input are live (protocol 31). If you touch net/host: call `settleVote(state)` (sim/gear.ts) when a player disconnects so a vote can't hang; a toast on vote pass/fail would be nice. Bots must not vote.

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
- No snapshot bumps: all new fields are optional. Protocol is 31 since G8.

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
