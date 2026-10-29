# Feedback plan 1: Kennedy's first Phase 3 playtest (2026-10-29)

> Written by the Video Game Designer agent as a local planning doc; committed to `fb1` on
> 2026-10-29 so both lanes read the same copy. Live build audited: `main` @ `e276359` (deployed by
> "Test, build, deploy" at 9:06 AM EDT), played at **1512×982** (14-inch MacBook). Screenshots and
> the capture log are in `/workspace/overnight/feedback1/` (script: `overnight/pw/live1512.mjs`).

## 1. What the live build shows (1512×982)

| Area | Measured | Kennedy's point |
|---|---|---|
| Order tickets | Panel 238 px wide. Drink name 16 px, step chips (Grind · Pull · Hand off) **10 px** | #3: step text unreadable |
| Night screen | 6 tabs + re-roll. Visible words per tab: Shop 287, **Menu 404**, Crew 232, Paper 232, Ads 409, **Shopfront 531** (≈2,100 in total). Text nodes under 12 px per tab: 12–46 (Menu 46). Smallest text **9 px** | #5: cluttered, tiny |
| Night length | 60 s (`ECONOMY.nightLengthSec`). There's no UI to change it. Ready-up exists ("Open the shop"), but it can't buy reading time | #5: too short to read |
| Sold out | `spawnCustomers` returns early when `availableDrinks` is empty, so **nobody arrives**, while rush hour still fires its banner and sting | #4: felt broken |
| Day end | No way to close early. The `closing` phase (doors locked, finish the people inside) already exists | #1: stuck for 40 s |
| Stations | Fixed per tier in `src/data/layout.ts` (stand 4 back-bar stations, cart 5, café 5, plus the counter). `hasStation` reads the tier layout, not `state.stations` | #2: slots |
| Labels | Night header reads "Night 1 · plan Tuesday, Day 2" after day 1. The title shows **v2.0.1** even though Phase 3 is live (package.json was never bumped) | — |

Files: `00-title`, `01-lobby`, `05-night1-*` (stand, night before day 1), `10-day-hud-{6,18,32,48}s`,
`11-tickets-*`, `15-closing-receipt`, `20-night2-*` (all six tabs after day 1).

## 2. Roadmap audit

`docs/ROADMAP.md` still calls Phase 3 "(next)". `public/roadmap.json` (the in-game drawer) has
Phase 3 as `next` with all six goals `todo`, even though three have shipped. Neither lists
Kennedy's approved ideas; those live only in `docs/PHASE3_PLAN.md`. WP0 fixes both.

### Phase 2 (v2.0.0 / 2.0.1)
| Item | State | Notes / where the rest lives |
|---|---|---|
| Day events (rush, inspector, flicker, influencer) + visuals | Done | Rush-while-sold-out bug → WP4 |
| 40+ cards, combos, sets, re-roll | Done | 52 cards, 8 sets |
| Customer kinds, groups, toasts | Done | |
| Week difficulty curve, daily challenges | Done | |
| Sound and juice | Done | |
| Scripted bots: delay, mistakes, pathing, personalities, skill dial | Done | No "hurried" personality → WP6 |
| Telemetry (host log + peer UI events → JSONL) | Partial | Pipeline done. Nobody has read a real game night's file yet (needs a game night) |
| Forecasts (Daily Grind) | Done | |
| More drinks (B5) | Partial | 4 drinks built from existing stations. The planned kettle (tea), ice bin and pastry case stations were never built. Pastries came later as a supply → could become slot equipment in WP5 |
| Easter egg pack 2 | Done | The fire alarm became "dump the shot", not the planned two-player panel → BACKLOG |
| Awards, stats, records | Done | |
| Balance pass | Done | |
| "Done when": 2 players + 1 bot finish a week; crew asks for a 2nd week | Not done | Needs a real game night (carried over, as is P1's first game night) |

### Phase 3 (P3 B1–B13 on main)
| Item | Source | State | Where the rest lives |
|---|---|---|---|
| Barista roles | Kennedy | Done (B1) | Bots never take roles → P3 B15 (hired staff) |
| Per-item pricing | Kennedy | Done (B2) | Bots and the planner never price → WP6 |
| Regulars with favourites | Kennedy | Done (B3) | |
| Supplies that spoil | Kennedy | Done (B4) | |
| Recipe accuracy | Kennedy | Done (B5) | Bots never rush → hurried bots (WP6) |
| Hidden taste map | Kennedy | Done (B6) | |
| Signature designer | Kennedy | Partial (B7) | One twist, not "base + two add-ins". Multi-twist → P3 backlog after the feedback round. Stand still offers latte → WP1 |
| Seasons | Kennedy | Partial (B8) | In-run taste seasons done. Seasons across game nights → P4 |
| Scouting + rival copying (Starbuck$) | Kennedy | Done (B9) | Bots never scout → WP6. Rival escalation / walk-in pressure → P4 rivals |
| Forecasts | Kennedy | Done (P2 B4) | |
| Parody ads tab | Roadmap | Done (B10) | Rotating ad copy → UI backlog |
| Pitch an idea (scripted judge) | Roadmap | Done (B11) | AI judge → P5 |
| Checkout path | Roadmap | Done (B12) | Real pay-time speed → backlog |
| Growth path stand → cart → café | Roadmap | Done (B13) | Bots never grow → WP6. Journey on the week-end screen → WP1b |
| Upgrade trade-offs | Kennedy | Partial | Spicy cards, checkout and ads have trade-offs. Kennedy's station-slot swap is the real version → **WP5** |
| Layout editor (P3 B14) | Roadmap | Not done | **Replaced by WP5 station slots** (a constrained layout editor) |
| Bots as hired staff with wages (P3 B15) | Kennedy | Not done | P3 B15, after the feedback round; builds on WP6's planner |
| Saves and unlocks carried between runs (P3 B16) | Roadmap | Not done | P3 B16 |
| Easter eggs | Kennedy | Done (2 packs + the espresso egg) | |
| Integration / RC (P3 B17) | — | Not done | → v3.0.0 |

### Later phases (unchanged, all not started)
- **P4 Franchise & rivals:** campus franchise, manager mode, phone/travel, 2v2 rival chains, seasons across game nights, rival escalation.
- **P5 Smart café (AI):** AI modes, LLM dialogue, AI pitch judge, creative actions, key-safe backend.
- **P6 Polish:** bug pass, visuals, older-laptop performance, save cleanup, and the **mobile night layout** (moved here from the P3 still-needs list).

## 3. Release and branch plan

- **WP0 (UI lane, first, ~30 min, needs Kennedy's OK for the tag push):**
  - Version what's live: bump `package.json` to **2.1.0**. Turn CHANGELOG's "Unreleased (Phase 3, on the phase3 branch)" into "2.1.0 — 2026-10-29 · Phase 3 preview".
  - Merge `origin/phase3` into `main` (only the `p3-b13` merge commit `eec126c` is missing; the tree is identical) so `phase3 ⊂ main`.
  - Tag **`v2.1.0`**. This is the stable rollback point before any feedback work.
  - Update `ROADMAP.md` and `roadmap.json`: Phase 3 `now`, its goals marked, Kennedy's ideas added as goals.
- **Integration branch `fb1`**, cut from `v2.1.0`. Each package gets its own branch: `fb1/ui-night`, `fb1/sim-night`, `fb1/ui-day`, `fb1/sim-day`, `fb1/sim-slots`, `fb1/ui-slots`, `fb1/sim-bots`.
  - Claude merges its branches into `fb1` first, the UI follows (it consumes the sim's selectors). Use `--no-ff` and tag `fb1-wpN`. Never force-push.
  - `fb1` → `main` via PR only after Kennedy plays it. **Two releases:**
    - **v2.2.0 "Readable nights"** = WP1–WP4 (small, fast, playtest it on the MacBook).
    - **v2.3.0 "Station slots"** = WP5 + WP6.
- **After that, the remaining P3 blocks** branch from `main` as `p3/b15-hired-staff` and `p3/b16-meta-saves` (integration branch `phase3`, with `main` merged in first). B17 integration → **v3.0.0**.
- **Versions:** each sim package bumps `SNAPSHOT_VERSION` (22 →) with a migration and `PROTOCOL_VERSION` (25 →) whenever an input or snapshot shape changes. Claude's branches own both numbers, so no two packages race on them: WP3/4 take one bump together, WP1-sim the next, WP5 the next.
- **Ownership boundary:**
  - **UI lane** (the Video Game Designer agent): `src/ui`, `src/render`, `src/audio`, `src/ui/styles`, `src/main.ts` wiring, `src/ui/viewModels.ts`, docs.
  - **Claude lane:** `src/sim` (including bots), `src/net`, `src/host`, `src/storage`, `src/data` (UI may edit copy strings only), `scripts/`.
  - **The seam:** Claude exposes pure, tested selectors in `src/sim/` (below), and the UI never reaches into sim internals.

## 4. Work packages, in order

### WP1 · Night readability redesign *(first; UI lane + Claude WP1-sim)*
**Goal:** read the night in 10 seconds, decide in 60, never squint.

**UI approach:**
1. **Six tabs + re-roll → three tabs.**
   - **Tonight:** an at-a-glance summary.
   - **Menu:** one big card per drink.
   - **Spend:** the shop cards, Ads, Shopfront (growth and checkout) and Re-roll, with filter chips.
   - **Crew & roles** moves into a strip of avatar chips on Tonight.
   - **Paper and rival** become a headline on Tonight, with "Read the paper ▸" opening a drawer.
2. **Tonight** (the default tab):
   - One big profit number from yesterday (+$12.84, 40 px). The receipt collapses behind ▸.
   - Tomorrow's forecast as a headline + icon.
   - Up to **3 alert chips**, each with a one-tap fix: "Beans run out ~2 PM → +10 $8", "Can grow to cart ($80)", "Milk spoils tonight".
   - Crew role chips and the Scout button.
3. **Menu:** one card per drink, about 280 px wide.
   - Icon 48 px, name 22 px, price 28 px with big −/+ buttons, an On/Off switch, and "~5 orders · $7 profit" at 16 px.
   - Stock state ("SOLD OUT", "low"), drawn from the shared stock selector.
   - Twists collapse into "Twists ▸". The signature is one card with Edit. Explainer paragraphs become a one-time "How pricing works ⓘ" popover.
   - Fix: the stand must not offer latte in the signature base list, and the chalkboard must not list it.
4. **Type scale tokens** in `night.css`: `--fs-xs 13px` (floor, nothing smaller), `--fs-s 15px`, `--fs-m 18px`, `--fs-l 22px`, `--fs-xl 28px`, `--fs-hero 40px`, scaled with `clamp()` between 1280 and 1920 widths.
   - **Word budget:** ≤120 visible words per tab by default; details go behind ▸ or ⓘ.
   - Header: "After Day 1 · planning Day 2".
5. **Automated guard:** a Playwright check (extend `live1512.mjs` into `nightcheck.mjs`) at 1280×800, 1512×982 and 1920×1080. It fails on any visible night text under 12 px, words per tab over 160, or board overflow. Run it on every UI package.
6. **Lobby/title choice "Night length":** 1:00 / **2:00 (new default)** / 3:00 / **Relaxed** (no clock). A ready strip shows who is ready.
7. *(WP1b, small)* The week-end screen shows the growth journey (stand d1 → cart d4 → café d9).

**Claude WP1-sim:**
- `nightLengthSec: 0` = relaxed: no countdown, and the doors open when every connected human is ready. Once more than half are ready, a **30 s "last call"** starts, so one AFK friend can't stall the room.
- Default `ECONOMY.nightLengthSec` 60 → 120.
- `validate.ts` accepts 0. Settings and lobby sync, a protocol bump, and tests.
- **`nightBrief(state)`** selector: `{ profit, headline, alerts: NightAlert[] }`, where each alert carries `{ kind, severity, text, fix?: Input }` (low stock with the hour it runs out, spoil tonight, can grow, can afford checkout, rival copied you, unpriced signature). It's deterministic and tested, and reuses `nightWarnings` maths (move that maths into sim if needed; `nightWarnings.ts` stays UI-facing).

### WP2 · Order tickets *(UI lane only)*
- Tickets get bigger: panel 280–300 px at 1512 width, drink name 20 px, price 18 px, patience bar 8 px, "IN A HURRY" tag 13 px.
- **Step chips hidden by default.** Click or tap a ticket to toggle its steps (16 px chips, with the *next* step highlighted).
- New setting "Recipe hints: On click (default) / Always / Off". Day 1 of a new run shows them for the first ticket only.
- At most 4 tickets show, then "+2 more".
- Guard: no ticket text under 13 px at 1512×982.

### WP3 · End the day early *(Claude, then UI)*
**Claude:**
- New input `{ kind: 'closeEarly', playerId, on: boolean }`, day phase only, humans only, from 15 s into the day.
- When every connected human has `on`, the sim enters the existing `closing` phase: doors lock, the people inside are served or leave, then the night. Solo = instant. Bots never vote and never block.
- Rent is still due, challenges are judged as they stand, and the log gets a `closedEarly` entry plus a morning-note line.
- Selector **`closeEarlyState(state)`**: `{ votes, needed, hint: 'soldOut' | 'empty' | null }`. `empty` = no customers inside and none expected for 10 s, or doors effectively idle.
- Tests: determinism, vote resets at day start, refusals.

**UI:**
- A **press-and-hold "Close early" button** (1.2 s ring fill) in the HUD's day-timer pill, plus hold-C on the keyboard.
- Shows "2/3 want to close". Pulses when `hint` is set ("Sold out. Close early?").

### WP4 · Sold out and rush hour *(Claude, then UI)*
**Claude:**
- When the menu has items switched on but **all are out of stock**, arrivals still roll. A walk-up reaches the door, reads the board and leaves: a "sold out" walkout counted in `today.soldOutWalkouts`, with no rating hit.
- With at least one drink in stock, today's behaviour is unchanged (RNG stream identical, tested).
- A rush that fires while sold out now *visibly* brings a crowd that walks away.
- Morning note: "9 people walked away from a sold-out board".
- `nightBrief` gets a "you sold out at 2:10 PM" alert next to the restock fix.
- Snapshot migration: `soldOutWalkouts ??= 0`.

**UI:**
- A "Sold out!" bubble and walk-away for walk-ups, and a SOLD OUT stamp on the chalkboard and the HUD menu panel.
- The rush banner variant reads "Rush hour, and you're sold out!"
- Receipt line.

### WP5 · Station slots *(Claude, then UI; replaces P3 B14 layout editor; v2.3.0)*
**Claude:**
- Each tier has back-bar **slots**: stand 4, cart 5, café **6** (the café's extra slot is a reason to grow). `state.slots: (StationKind | null)[]` sets the stations at the start of each day.
- Station ids become `grinder`, `grinder-2`, …
- `hasStation`, `unlockedDrinks`, recipes and `stationSpeed` all read `state.stations`, not the tier layout. Swapping out the steamer takes lattes off the board, with that reason shown.
- Night input `{ kind: 'slot', playerId, index, station: StationKind | null }`: free to rearrange, humans only.
- **Equipment** you own but haven't placed sits in `state.equipment`. New cards: "Second espresso machine" $45, "Second grinder" $30 (and later the pastry case).
- **No trash can:** binning becomes "drop on the floor", which makes a mess (reuses `drop.ts` / mess kinds), so the mop matters.
- Bots pick the nearest free station of a kind, and their paths handle duplicates.
- Migration: `slots` derived from the tier layout. A café run's stream is identical when the slots match the default.
- Balance: 40-week runs of default vs "2× espresso, no cold brew" vs "no trash".

**UI:**
- A **Slots strip** on the Spend → Shopfront card: N big slot tiles; drag or click to swap; spare equipment below; warnings ("No steamer: lattes off the menu", "No bin: drops make a mess").
- The render draws duplicate stations and empty slots.

### WP6 · Bots that use the new systems *(Claude; UI only shows advice)*
- **Hurried personality** (`'hurried'` in `BOT_PERSONALITIES`): faster, pulls cups early when the queue is 3 or more, so more accuracy slips. Skill dial applies. Assigned into the roster mix.
- **Night planner** `src/sim/bots/planner.ts`: `planNight(state): Advice[]` covering restock, pricing (per-drink margin vs volume), twists (try one untried, keep 4–5★), signature, scouting, countering a rival copy, grow / checkout / slot changes.
  - Pure and deterministic.
  - Used three ways:
    1. Balance policy `--policy planner`.
    2. **Crew tips** at night: up to 2 advice chips from bot crewmates, which the UI shows on Tonight (humans still decide and spend).
    3. All-bot test runs.
  - Bots still never spend the crew's money in a real game until P3 B15 (hired staff).
- Balance: 40 weeks with `planner` vs `smart` and `taste`. Growth days for the planner.

## 5. Remaining Phase 3 after the feedback round
1. **B15 Hired staff with wages:** bots become hires with a daily wage, a role and a personality (including hurried); the planner drives their night votes.
2. **B16 Saves and unlocks between runs:** meta save under its own key and version.
3. **Backlog to fold in where it fits:**
   - Multi-twist signatures.
   - Rotating ad copy and a pitch award.
   - Stacking tuning (ads + influencer).
   - Real checkout pay time.
   - Stale-signature receipt line.
   - Fixture "DAY 0" header.
   - Word-salad pitch penalty.
   - Green-lit menu items.
   - The chaos sign start per tier.
   - Separate records for stand-start runs.
4. **B17 Integration:** full 4-player week, nightcheck guard, balance, **v3.0.0**, Kennedy's approval.
5. **Needs people:** a game night with telemetry read by the analysis agent (P1/P2 "done when").

## 6. Ready-to-paste Claude prompt
The brief handed to Claude on 2026-10-29 (the same text was in the designer agent's REPORT) is
summarised in section 4 above: four sim packages, `fb1/sim-day` (tag `fb1-wp34`), `fb1/sim-night`
(`fb1-wp1s`), `fb1/sim-slots` (`fb1-wp5s`), `fb1/sim-bots` (`fb1-wp6`), each cut from `fb1`,
merged with `--no-ff`, pushed at every milestone, never merged to `main`.
