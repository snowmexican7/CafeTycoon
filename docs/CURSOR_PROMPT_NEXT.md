# CafeTycoon — next run for Cursor (after v3.7.2)

**Repo:** github.com/snowmexican7/CafeTycoon · **Base:** latest `main` (v3.7.2, merge 14a60dc or newer).
**Your role:** contributor. You code; Grok reviews and merges your PRs; Claude owns the sim.

## Before you start (required)
1. Read `docs/HANDOFF.md` in full (Lanes, Decisions, "Claude → Grok / Needs from you (UI lane)", "Grok → Claude").
   The exact event, state and helper names for every block below are there and in `docs/BACKLOG.md`.
2. Read `docs/ROADMAP.md` "Where we are now", and your own review `docs/reviews/composer-2026-10-31.md`.
3. `npm ci && npm test && npm run build` on a clean `main` so you know the baseline is green (1,806 tests).

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

### 1. C10 rearranging UI (`fb2-c10`, protocol 59)
- Pre-open timer from `preOpenUntil - tick` (60 ticks/s); the day clock is frozen meanwhile.
- **Ready** button (sends `ready`; `GameState.ready`) and host-only **Open doors** (`openDoors`).
- Pick up a machine with Z/E (local only), ghost outline from `validStationSpots(state, id)` computed once on
  pick-up (not every frame); set down sends `moveStation { station, to }`.
- Feedback: `station.place` (machine's new spot), `station.refuse` (buzz), `station.reset` (note that the layout
  went back to default after a grow or gear change).
- During pre-open, hide or grey the E / jug / steam / syrup prompts (they do nothing then).

### 2. B8 hand-made lattes (`fb2-b8`, protocol 58)
- Jug meter with the three marks (`Player.jug`) and the steam meter (`steamPos`).
- Recipe icons over the cup in hand (`heldRecipe`); tray cups keep `TrayCup.made`.
- **Syrup picker** at the rack (`SYRUP_ID 'syrups'`, art already exists from PR #7): vanilla / caramel choice that
  sends `{ kind: 'syrup', playerId, flavour }`. Then (and only then) turn the syrup-rack hint in `src/ui/live.ts`
  green.
- Tickets show double shot, syrup and asks (`Customer.shots/syrup`, `items[].shots/syrup`).
- Popups + sounds for `milk.fill`, `steam.result`, `syrup.add`, `syrup.miss`.

### 3. B7 tray table, the rest (`fb2-b7`, protocol 57)
- Live list over the table (`state.tray.items`, done ticks, customer name/number).
- Tray in hand (`tool === 'tray'`, `Player.tray`); tray coaster with the customer's name on a pickup slot
  (`PassItem.tray`); per-cup cooling via `trayCool`.
- Refuse bubble on `tray.refuse`; small cues for `tray.claim/add/pick/put/take/spill/void`.

### 4. C11 social feed (`fb2-c11`, protocol 55)
- Night phone feed from `dayReviews(state)`; day pop-up posts from `review.post { name, text, sentiment, stars }`;
  week card from `weekRating(state)` (don't parse `week.rating`'s JSON). Fans: `GameState.fans`, `DayStats.fansDelta`.

### 5. Ring-up bar + waiting area (Round 3 items 5 and 4)
- Ring-up bar over the till from `state.ringUp` / `ringProgress(state)` (self-order beat when `ringUp.by === ''`);
  optional cues for `till.start` / `till.cancel`.
- Waiting-area art for `state.waiting` (stand 0 / cart 2 / café 4); "Line's too long!" bubble on `line.complain`;
  tumbleweed on `line.leave { quiet: true }`; optional receipt line from `DayStats.lineLeft`.

### 6. Review fixes (from your review; agreed by Grok)
- Morning note auto-dismisses (fades after a few seconds or on first move) instead of needing a click.
- Replace the vague "Nothing here!" with what's actually wrong (e.g. "Needs a cup first", "Machine is busy").
- Rename/hide debug-looking tags such as "Do bot!".
- Hires leftovers: "Rough guess" mark on the forecast when `forecastIsRough(state)`, "Set by Strategist" marks on
  `strategist.set`, receipt line from `DayStats.hireWages`.
- Move the Strategist/Marketer hire cards higher on the night screen so they show without scrolling at 1512x982 and 1280x800.
- Price walkout leftovers: door walker for `walkout { reason: 'price' }`, optional `DayStats.priceWalkouts` line.
- **Do not** start these without Kennedy's OK (they are waiting on him): soft "Open anyway?" gate, first-night tab
  change, Day-HUD declutter, save-compat notice, the `structuredClone` perf change (sim lane;
  plan only).

## When you're done
Leave a short summary (PR numbers in order, what's open, any "Needs from Claude") in the last PR's description.
Grok will review in order, merge with merge commits, release and tag.
