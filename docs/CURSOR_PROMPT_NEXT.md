# CafeTycoon — next run for Cursor (after v3.8.0)

**Repo:** github.com/snowmexican7/CafeTycoon · **Base:** latest `main` (v3.8.0 or newer).
**Your role:** contributor. You code; Grok reviews and merges your PRs; Claude owns the sim.

## Before you start (required)
1. Read `docs/HANDOFF.md` in full (Lanes, Decisions, "Claude → Grok / Needs from you (UI lane)", "Grok → Claude").
   The exact event, state and helper names for every block below are there and in `docs/BACKLOG.md`.
2. Read `docs/ROADMAP.md` "Where we are now" and BACKLOG "3.8.0: Cursor's blocks 1–6" (what Grok changed in your PRs).
3. `npm ci && npm test && npm run build` on a clean `main` so you know the baseline is green (1,862 tests).

## How your last run went (v3.8.0)
All six PRs (#13–#18) were merged with merge commits, none needed a blocking review. Grok's fix-ups, so you don't
redo them: the C10 set-down hint is green only on an outline (`atCarrySpot`); the syrup picker stays shut in the
pre-open (the sim ignores `syrup` then); "Open anyway?" counts a missing machine (`canMake`); the hires receipt line
is "incl. specialists" under Wages (`wages` already includes `hireWages`, so a minus line double-counted); waiting
browsers stand just inside the door, not behind the bar; "Tray cleared" instead of "voided"; no "tap" anywhere.

## Rules
- **One PR per block below**, each branched off the **latest `main`** (re-fetch before each branch; rebase your
  *unmerged* branch on main if it moves, but never rewrite anything already pushed for review that Grok has commented on
  without saying so).
- **Never push to `main`. Never force-push.** Branch names may keep the `cursor/...-e03d` form.
- **Lanes:** stay in the UI lane (`src/ui`, `src/render`, `src/audio`, `src/ui/styles`, `src/main.ts`,
  `src/dev/fixtures.ts`). If a block truly needs a sim change (`src/sim`, `net`, `host`, `storage`, `data`,
  `scripts`), do **not** make it: write it up in the PR description under "Needs from Claude" so it can go in HANDOFF.
- **Green before you open the PR:** `npm test`, `npx tsc --noEmit`, `npm run build` all pass. Add tests for every
  view-model / hint / model you add (follow `src/ui/pickupHints.test.ts`, `src/ui/hireCards.test.ts`).
- **Honest hints:** a hint may only show the green "go" look if pressing the key really does something in the sim
  right now. Check the sim function (e.g. `src/sim/tray.ts setDown/putDown`, `src/sim/pass.ts`) before writing one.
- **Plain English** in everything the player sees: short, friendly, no jargon or debug words ("Do bot!" style tags
  are out). Player-facing CHANGELOG line per PR under "## Unreleased" (Grok sets the version at release).
- **Readable at 1280x800 and 1512x982:** add a fixture in `src/dev/fixtures.ts` for each new screen/state and
  attach Playwright screenshots at both sizes to the PR. Nothing cut off, no scroll needed for the main action.
- **PR description:** what changed, files touched, the fixture name(s), screenshots, anything not done, and any
  "Needs from Claude".
- Don't bump the version, tag, or edit HANDOFF "Decisions" — Grok does those at merge time. You *may* add a line
  under "Grok → Claude" describing what your PR did.

## Blocks (suggested order; one PR each)

### 1. What's left of blocks 1–6 (polish)
- **Feed phone below the fold:** on Tonight the café phone sits in the day card under "Tomorrow" and is cut off at
  1280x800 and 1512x982 (fixture `dayFeed`). Make the first two posts visible without scrolling, e.g. use the empty
  space in the Heads-up card. Keep the night opening on Restock.
- **Overlapping floaters at the wand:** in `handmade`, "Milk right on the line", "Foam perfect!" and "Ben added caramel
  syrup" stack on each other. Stagger or queue floaters per player.
- **Syrup key chip:** the hint chip reads "12"; show "1 · 2" (or two chips).
- **Night headline:** `customers` in the `viewModels.ts` night headline is still uncapped; cap it like the brief
  (`serveCapacity`) so the two numbers agree.
- **Ghost outlines:** the full-floor `validStationSpots` search draws a lot of outlines (fixture `preOpenCarry`).
  Consider dimming the far ones or showing only the nearest few. Hint honesty stays as it is.

### 2. Grok's fix-ups to keep (don't undo)
- Keep the behaviours listed in "How your last run went". Tests guard them: `src/ui/preOpen.test.ts` "ui-3.8.0 review
  fix-ups", `src/ui/reviewFixes.test.ts` ("incl. specialists", `makeable` needs a machine),
  `src/render/waitingModel.test.ts` (browsers on the customers' side).

### 3. B6 leftovers (`fb2-b6`)
- **Tall combo ticket:** `Customer.items: { drink, done, by?, … }[]` and `Customer.order: 'combo' | 'office'`; a tall
  ticket with a tick per item (groups have no `order`).
- **Office phone card:** from `office.call { at }`, with a countdown to `at` (`GameState.office { day, at, called?,
  came? }`).
- **Receipt line:** `DayStats.office` (`'served' | 'lost'`) and `DayStats.officeExtra`.
- Also the add-on ask bubble ("…and a latte for my friend") from `order.addon { customer, drink }` (Round 3 item 1).

### 4. Claude-pending UI (only if the sim has landed it; check HANDOFF "Grok → Claude / Needs from you")
- **Look sync in co-op:** when `createPeerTransport` (`src/net/peerTransport.ts`) takes a `look` parameter, pass the
  saved look through it in `src/main.ts` instead of the current workaround. Not landed as of v3.8.0; skip if still open.
- **Pastries:** any new pastry fields or events Claude adds after v3.8.0 (the Restock tab already lists the jar).
  Nothing pending as of v3.8.0.
- **`canAddSyrup` / `canSetDown`:** if Claude exports them, switch `src/render/handmadeModel.ts` and
  `src/ui/live.ts` to call them instead of mirroring the sim's gates.

### Kennedy's rulings (2026-10-31), do not change
- The night ALWAYS opens on Restock first (no "pick gear" first-night tab).
- Day-HUD declutter goes in small stages Kennedy reviews. Don't do more of it unless a block above asks.
- No save-compatibility work (saves aren't a feature yet).
- The per-tick `structuredClone` speed fix is parked. Don't touch it.

## When you're done
Leave a short summary (PR numbers in order, what's open, any "Needs from Claude") in the last PR's description.
Grok will review in order, merge with merge commits, release and tag.
