# CafeTycoon — Round 6 for Cursor (Kennedy's Nov 5 playtest notes, approved Nov 5, 2026)

**Repo:** github.com/snowmexican7/CafeTycoon · **Base:** latest `main` (v3.9.2 / a28352e or newer).
**Your role:** contributor. You code; Grok reviews and merges your PRs. Claude owns several sim blocks this
round (`docs/CLAUDE_PROMPT_ROUND6.md`) and reviews any sim files you touch.

## Before you start (required)
1. Read `docs/HANDOFF.md` (Lanes, Decisions — esp. the 2026-11-05 entry) and `docs/ROADMAP.md` "Round 6".
2. `npm ci && npm test && npx tsc --noEmit && npm run build` on a clean `main`, so you know the baseline is green.
3. Every name below was checked against `main` at a28352e (v3.9.2). If something has moved, follow the code and say so in the PR.
4. Check whether Claude has already merged Round 6 sim pieces (milk counter, machines-not-locking, open grace, patience,
   tray pressure). Rebase your branch on the latest `main` before each PR. If a Claude piece your block needs is not
   on main yet, say so in the PR and either wait or leave a clear TODO — do not invent a parallel sim API.

## Already shipped (do not redo)
- **Hairline cover (Round 5 #21):** every style covers the crown down to one shared hairline
  (`src/render/hairGeom.ts` `HEAD` / `frontHairGeom`, `src/render/layers/actors.ts` `backHair` / `frontHair`).
  **Still open:** hair is see-through (head shape shows through) and there is no long wavy style — that is block 1.
- **Round 5 espresso / hopper / bumps / cold-brew refill / supply shelf / night Layout / drip-by-till:** shipped in
  v3.9.0. The Round 5 `SUPPLY_ID` shelf still **takes a carton into hand** (same as the fridge). Round 6 reworks that
  into a stocked milk counter (Claude sim + your UI in block 4).
- **Serving counter draw (v3.9.2):** till + pickup + condiments draw as one solid counter. The sim half
  (`docs/CURSOR_PROMPT_COUNTER.md` `frontCounter` in `blocked()`) is **still open / separate** — do not fold it into
  these blocks. Leave that prompt in place.

## Rules
- **One PR per block**, each off the **latest `main`** (re-fetch first). **Never push to `main`. Never force-push.**
- **Lanes this round:** UI-lane files as usual (`src/ui`, `src/render`, `src/audio`, styles, `src/main.ts`,
  `src/dev/fixtures.ts`). Blocks 3 and 5 may also edit `src/sim/**` and `src/data/**` when the change is the small
  half Claude is not already building. List every sim, data, net or storage file under **"Sim files touched"** in the
  PR description so Claude can review. If the shape of `GameState`, `Player`, `Station` or `Customer` changes, or a
  new input or event is added, bump `PROTOCOL_VERSION` (`src/net/protocol.ts`, now **64**) and `SNAPSHOT_VERSION`
  (`src/storage/snapshotStore.ts`, now **33**) with a one-line note. No save migrations (Kennedy: saves aren't a feature yet).
- **Deterministic sim:** no `Math.random`, no wall clock. Use `rngNext(state)` only where a roll is needed. Keep
  `validateInput` (`src/sim/validate.ts`) in step with any new input.
- **Green before you open the PR:** `npm test`, `npx tsc --noEmit`, `npm run build`. Add or update tests for every
  rule you change. Say which ones moved in the PR.
- **Honest hints:** a hint may only look like "go" when pressing the key really does something in the sim right now.
- **Plain English** in everything the player sees. Short, friendly, no jargon, and **never the word "tap"** (say
  "press E", "click").
- **Big and readable at 1280×800 and 1512×982:** add a fixture in `src/dev/fixtures.ts` per new screen or state, and
  attach Playwright screenshots at both sizes. Nothing cut off, and no scrolling needed for the main action.
- **PR description:** what changed, files touched, "Sim files touched", fixtures, screenshots, test count, anything
  not done, and questions for Kennedy.
- **CHANGELOG:** one player-facing line per PR under `## Unreleased`. **The last PR (block 6) also bumps the version**
  to **3.10.0**.

## Kennedy's rulings, do not change
- The night ALWAYS opens on the Restock tab first. No new night tabs: fold new night things into an existing tab
  (`GEAR_NIGHT_TABS` in `src/ui/night.ts`: Restock · Menu · Gear shop · Extras).
- Day-HUD declutter goes in small stages Kennedy reviews. No save-compatibility work. The per-tick `structuredClone`
  speed fix is parked.
- **Updated (2026-11-05):** the hand-made jug and steam meters are **no longer parked**. Keep the fill-cup and
  steam-milk steps (FB2 B8, `src/sim/handmade.ts` `HANDMADE`, `Player.jug`, `steamPos`, syrup). Drop the wait at the
  end and the extra E to pick the drink up (block 3).
- **Not this round (ROADMAP Later only):** "I've played this before" / first-run tutorial; co-op night-menu scroll jump
  (and locking menus together); co-op look-sync wiring; `devFill` / `devSkip` buttons; grow-event UI; 4-player 2v2;
  solid `frontCounter` (use `docs/CURSOR_PROMPT_COUNTER.md` if you pick that up separately).

## Blocks (in order, one PR each)

### 1. Opaque hair + long wavy — UI/render
**Problem:** you can see the head shape through the hair — it looks like a silhouette with a haircut pasted on.
Hair must be fully opaque. Also add a **long wavy** style; the only long option today is straight `long`.

- Art: `src/render/layers/actors.ts` `backHair` / `frontHair`, `src/render/hairGeom.ts`, `src/render/lookModel.ts`
  (`HairStyle`, `HAIR_STYLES`), `src/render/lookPreview.ts`, and the espresso-egg pose in
  `src/render/layers/espresso.ts` if it draws hair.
- **Opaque:** every style, both facings (`Facing` `'up' | 'down'`), must hide the skull. Draw a solid under-cap in the
  hair colour that fully covers the head disk (`HEAD` in `hairGeom.ts`) **before** style details (spikes, curls, bangs),
  so gaps between detail shapes never show skin. No translucent fills, no `alpha < 1` on hair geometry. Check the
  creator preview (`lookPreview.ts` — today's `back.alpha = 0.9` is the whole back preview person, not hair; do not
  leave hair itself see-through anywhere).
- **Long wavy:** add `'wavy'` to `HairStyle` / `HAIR_STYLES` (label "Long wavy"). Draw longer hair with soft S-curve
  lobes or overlapping waves (still fully opaque), distinct from straight `long`. Keep `long` as "Long straight" (or
  "Long") so both show in the creator.
- Update `frontHairGeom` / `allFrontHairGeom` and any hairline tests so the new style still covers `HEAD_TOP` →
  `HEAD.hairline`.
- **Accept:** fixture `hairGrid` (or update the Round 5 one) shows every style × both facings, including wavy;
  creator screenshots at 1280×800 and 1512×982; a pure test that each style's crown is opaque coverage (geometry + no
  alpha on hair fills). Plain English creator label.

### 2. Bigger drink icons + larger UI / clearer tip bubbles — UI
**Kennedy:** drink icons a little larger; UI a bit larger; tip bubbles more intuitive. **Not** a full tutorial
(that stays on the ROADMAP Later list).

- **Drink icons:** `src/ui/icons.ts` `itemIcon(kind, size)` (default 28). Tickets use `itemIcon(it.drink, 22)` on
  stacked lines and `itemIcon(t.drink, 38)` on the main ticket (`src/ui/tickets.ts`). Bump both a notch (e.g. 22 →
  **28**, 38 → **46**, and raise the default if other call sites look small). Check pantry / menu / night drink chips
  that reuse `itemIcon` so nothing clips at 1280×800.
- **UI scale:** a light pass on day HUD and tip/hint chrome so type and hit targets read bigger at 1280×800 and
  1512×982 — prefer `src/ui/styles/hud.css`, ticket / tip styles, and first-run hint bubbles (`src/ui/hints.ts`,
  `.hint-bubble` in `grow.css`). Do **not** redesign the night board. Keep Restock opening first.
- **Tip bubbles:** `src/ui/tipsVM.ts` (`MAX_TIPS = 2`, `shortTip`, `tipIcon`) and on-floor hint bubbles. Make copy
  shorter and more actionable ("Press E to steam", "Stock milk at the fridge first") without inventing new tutorial
  gates. Honest hints only.
- **Accept:** fixtures + screenshots at both sizes for tickets (single + stacked multi-drink) and a night tip chip;
  no cut-off icons; existing tip tests updated if copy or sizes change.

### 3. Latte flow: keep jug + steam, instant drink in hand — sim (handmade) + UI
**Kennedy:** keep the intuitive fill-cup then steam-milk steps. Remove the timer at the end. Fill, steam, and the
drink is **instantly done and already in the player's hand** — no extra E to pick it up.

**Today (checked on `main`):**
- `src/sim/handmade.ts`: `HANDMADE.fillSeconds` (2), `steamSeconds` (1.2); `Player.jug`, `steamPos`, `handmadePress`,
  `jugFirst`, `afterInsert`, `stepHandmade`. Stopping the jug emits `milk.fill`; starting steam puts the shot on the
  wand and starts the meter; `stopSteam` only writes `foam` onto the cup **still on the wand**.
- `src/sim/stations.ts` `interact`: after the steamer finishes (`busyTicksLeft` → 0), `station.output` holds the latte
  until empty hands press E again. Steamer base time is `ECONOMY.stationSeconds.steamer` (3.5 s) via wand speed
  (`src/sim/gear.ts` wand helpers). That end wait + pickup is what Kennedy wants gone.
- UI meters: `src/render/handmadeModel.ts`, jug / steam floaters from Round 5 / v3.8.0.

**Change:**
1. Keep jug fill / stop and the steam-meter press (grades `fillGrade` / `steamGrade`, syrup rack unchanged).
2. When the player stops the steam meter in reach of its wand (`handmadePress` → `stopSteam`), **finish the drink
   into `player.holding` immediately** (latte or cappuccino as the recipe gives), copy `station.made` onto
   `player.made`, clear the wand's busy/output for that cup, and emit the existing `steam.result`. No sitting
   `station.output` and no second E.
3. If the meter runs out without a press, keep today's miss/scald behaviour, but still end with the cup **in hand**
   (miss grade), not left on the wand.
4. While a handmade steam is in flight, do **not** make the player wait on `ECONOMY.stationSeconds.steamer` as a
   second timer after the meter — the meter *is* the interaction. Prefer `busyTicksLeft = 0` (or a negligible busy)
   once the jug has committed the shot onto the wand, so the only timing skill is the meter.
5. Bots stay skip-meters (already); they must still end with the drink in hand / served without a stuck output.
6. UI: meters still show; when steam resolves, the cup appears in hand at once (no "Press E to take" on a finished
   handmade latte). Update dishonest hints.

**Sim files touched** (list in the PR; Claude reviews): expect `src/sim/handmade.ts`, `handmade.test.ts`, and possibly
`stations.ts` / `gear.ts` / `stations.test.ts` if the busy/output hand-off lives there.
- **Accept:** tests — fill → steam press → holding latte, wand clear, no second E; miss path still in hand; syrup
  still works; bots unaffected. Fixtures + screenshots of jug and steam meters. Protocol/snapshot bump only if
  shapes change (likely not if you only change timing / hand-off).

### 4. Milk counter UI (after Claude's milk-counter sim) — UI + hints
**Depends on Claude Round 6 milk-counter sim** (see `docs/CLAUDE_PROMPT_ROUND6.md`). Rebase on main once it lands.

**Kennedy's intent (sim will encode this):**
- Fridge holds milk (`FRIDGE_ID`, `src/sim/fridge.ts`).
- Player stocks the **milk counter** (`SUPPLY_ID`, by the sink) **from the fridge** (carton in hand → E at the
  counter puts milk out there).
- For cold milk drinks (iced latte, sweet-cream cold brew) you bring the espresso / cold brew **to the milk
  counter** and fill it there.
- Empty hands at the milk counter must **not** pick milk up as a held carton (today Round 5 made `SUPPLY_ID` a
  second fridge door via `isSupply` in `fridgeInteract`).

**Your job once the sim API exists:**
- Art and label for the stocked milk counter (jug / cream on a counter, not a mini-fridge door if the sim no longer
  treats it as one).
- Honest hints: "Press E to stock milk" only with a carton; "Bring a shot here for an iced latte" / "Bring cold brew
  for sweet cream" only when that press will work; never "Grab milk" on an empty-handed stocked counter.
- Update fixtures (`supply` / milk-counter morning) and any Round 5 copy that still says the shelf is for grabbing
  cartons.
- **Accept:** screenshots at both sizes; hint tests; no grab-carton affordance on the counter.

If Claude's sim is delayed, open the PR as UI-ready against a documented temporary hook **only if Grok says so** —
otherwise wait.

### 5. New-drink unlock replay (after the nightly receipt) — UI + tiny sim hook
**Kennedy:** after the player hits OK on the nightly profit screen, show **"New drink unlocked"** with a how-to. A
bot plays the steps in-game (e.g. Americano: grind → espresso machine → step back → interact again → serve). Watching
and learning. **Not** the full "I've played this before" tutorial (ROADMAP Later).

**Today:** Gear learns drinks mid-day in `src/sim/levelUp.ts` `levelUpOnServe` / `LEVEL_UPS` (e.g. 12 espressos →
americano). The night board lists progress in `src/ui/gearVM.ts` `levelUpVM`. The end-of-day receipt is
`src/ui/closing.ts` (`createClosing`); dismissing it goes on to the night shop (`src/main.ts`).

**Change:**
1. **Sim hook (small):** when a drink is learned during the day, record it for tonight's replay (e.g.
   `DayStats.unlocked: DrinkId[]` or `GameState.pendingUnlocks`), without removing today's unlock-on-serve behaviour
   unless Claude prefers deferring the menu flag — agree in the PR. Bump protocol/snapshot if you add fields.
2. **UI:** after the closing receipt's OK (before or as night opens — pick one and say which), if anything is pending,
   show a "New drink unlocked" card with the drink name/icon (`DRINK_INFO`) and a short "How to make it" line from
   `DRINK_INFO[d].ticket` / `LEVEL_UPS[].text`.
3. **Replay:** drive a bot (or a scripted ghost barista) through the recipe chain on the real floor for a few seconds
   (`recipeChain` in `src/data/drinks.ts`, bot brain in `src/sim/bots/brain.ts`). Prefer replaying against the current
   shop layout. Esc / click skips. One drink at a time if several unlocked.
4. Plain English; never "tap". Big and readable at both sizes.
- **Accept:** fixture with a pending americano unlock; screenshots of the card + mid-replay; tests for the pending
  list clearing after the replay; sim files listed for Claude.

### 6. Release 3.10.0 — version bump + docs
- Bump `package.json` `version` to **3.10.0**.
- Move every Round 6 line in `CHANGELOG.md` from `## Unreleased` to `## 3.10.0 — 2026-11-xx` (date you open it).
- Add a `docs/BACKLOG.md` "Round 6 (Cursor)" entry listing the PRs and names as built.
- Add a `docs/HANDOFF.md` line under "Grok → Claude log" naming every sim file touched in Round 6 Cursor PRs.
- Grok merges, tags `v3.10.0`, and writes the HANDOFF "Decisions" follow-ups.

## Parallel / separate (not in these six blocks)
- **`docs/CURSOR_PROMPT_COUNTER.md`:** solid `frontCounter` in the sim. Still open as of v3.9.2. Do it as its own PR
  if you pick it up; do not block Round 6 on it.
- **Claude's Round 6 sim blocks** (machines stay usable with a pending cup; patience + more multi/group orders; tray
  steal pressure; milk-counter stocking; open grace + VIP fans): you do not build these unless a tiny UI follow-up is
  listed after they land. Read `docs/CLAUDE_PROMPT_ROUND6.md`.

## When you're done
Leave a short summary in the last PR's description: PR numbers in order, test count, what's open, the "Sim files
touched" list across all blocks, and any questions for Kennedy.
