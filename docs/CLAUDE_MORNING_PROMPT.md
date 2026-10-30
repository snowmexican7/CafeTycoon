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
- **G8 co-op votes (optional polish):** `state.gearVote` and the `gear/vote` input are live (protocol 31). If you touch net/host: call `settleVote(state)` (sim/gear.ts) when a player disconnects so a vote can't hang; a toast on vote pass/fail would be nice. Bots must not vote.

## Sim edits made overnight (please review)
- G8: sim/gear.ts `applyGearInput` split into proposal/vote + `gearDeal`; `GameState.gearVote/gearVoteLast`; validate.ts vote case; run.ts `startDay` clears the vote; PROTOCOL_VERSION 31.

- `sim/levelUp.ts` (new), `levelUpOnServe` called from `customers.ts` serveCustomer after tallyDrink.
- `sim/stations.ts` `recipeFor`: when there are several matches, the oldest waiting ticket wins.
- `sim/gear.ts`: `gearPullMul` reweights `drawDrink`, `noteFamilyTip` gives per-family tips, and
  `gearRecipe` blocks americano on pods.
- `sim/unlocks.ts`: `unlockForDay` returns `[]` in Gear runs.
- No snapshot or protocol bumps for these: all new fields are optional.

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
