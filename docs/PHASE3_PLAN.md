# Phase 3 plan: Real-life growth, block by block

Phase 2 shipped as 2.0.0 (hotfix 2.0.1). Phase 3 is built on the **`phase3`** branch, cut from
`v2.0.1`. **Nothing merges to `main` until Kennedy approves**; the integration block ends with a
release candidate on `phase3`, not a deploy.

Roadmap context: [`ROADMAP.md`](ROADMAP.md) (Phase 3, "Real-life growth"). Open items:
[`BACKLOG.md`](BACKLOG.md).

## The north star

**A simple strategy role-playing game, not an idle game: choices and planning beat repetition.**
Every block has to add a *decision* with a trade-off, usually made at night, whose result the crew
can read the next night. Nothing grows on its own while nobody plays; no "number goes up" for
clicking more. Every new system is deterministic (seeded RNG from state only) and visible: if a
number changes what happens, the night screen says why.

## The block workflow (same as Phase 2, different base branch)

1. `git fetch && git checkout phase3 && git pull`, then `git checkout -b p3/bNN-short-name`.
2. Green means `npx vitest run`, `npx tsc --noEmit`, `npm run build`, plus the block's own check
   (balance run, Playwright screenshots in `/workspace/overnight/p3/bNN/`).
3. Self-review: determinism, sync (snapshot or lobby carries it; protocol bump if a message shape
   changes), HUD render-once-then-patch, save compatibility (`SNAPSHOT_VERSION` bump with a
   migration whenever `GameState` changes shape).
4. `git checkout phase3 && git merge --no-ff p3/bNN-… -m "P3 Block NN: <summary>"`, tag `p3-bNN`,
   push `phase3`, the tag and the branch. Never force-push.
5. Reflection in `BACKLOG.md`, player-facing lines under **Unreleased (Phase 3, on the phase3
   branch)** in `CHANGELOG.md`.
6. Undo a block with `git revert -m 1 <merge>` on `phase3`.

## Blocks, ordered by increasing risk

Risk = how much existing state and code a block touches, and whether it affects saves across runs.
Early blocks are new modifiers on top of today's systems; late blocks change the map, the economy's
shape or what survives a run.

| # | Block | Source | Decision it adds | Risk |
|---|-------|--------|------------------|------|
| 1 | **Barista roles**: Chef, Creator, Host, Manager, each with a perk and a weakness | Kennedy | who plays which role this week | low: per-player modifiers |
| 2 | **Per-item pricing** with demand reacting to price, shown clearly at night | Kennedy | price each drink: margin vs. volume | low–medium: touches orders and pay |
| 3 | **Regulars with favourites** (they come back for one drink, tip more if it's on and priced fairly) | Kennedy | keep a favourite on the menu or not | low: extends `regulars` |
| 4 | **Supplies that spoil** (milk and cold brew go off after N days; beans keep) | Kennedy | how much to restock | medium: pantry shape |
| 5 | **Recipe-accuracy scoring** (right steps in order = stars and tips, sloppy = less) | Kennedy | rush or be careful | medium: hooks the station flow |
| 6 | **Hidden seeded taste map** with star-rated combos discovered by serving | Kennedy | which combos to explore | medium: new hidden state |
| 7 | **Signature drink & night menu designer** (pick a base and two add-ins, name it) | Kennedy | commit to one signature | medium: depends on 6 |
| 8 | **Seasonal taste shifts** (the taste map drifts by week/season; the paper hints) | Kennedy | adapt or keep the classic | medium: depends on 6 |
| 9 | **Rival "Starbuck$"**: scout them at night; they copy your best drink and undercut it | Kennedy | scout, reprice, or invent anew | medium–high: new actor, depends on 2 and 7 |
| 10 | **Parody ads tab** (Palm Book and friends: pay for reach to a customer type) | Roadmap | spend on ads vs. upgrades | medium: new night tab |
| 11 | **"Pitch an idea"** with a scripted keyword judge (no AI) | Roadmap | pitch a promo; good pitches earn a boost | medium: free text, input validation |
| 12 | **Checkout path** register → kiosk → "Squarely" tap terminal | Roadmap | buy faster checkout vs. other upgrades | medium–high: counter flow |
| 13 | **Growth path** stand → cart → café (bigger maps, more stations, higher rent) | Roadmap | when to move up | high: map and station layout |
| 14 | **Layout editor**: move stations between nights | Roadmap | where things go | high: pathing, bots, depends on 13 |
| 15 | **Bots become hired staff** with wages (hire, fire, pay daily) | Kennedy | staff cost vs. throughput | high: bots × economy |
| 16 | **Saves and unlocks carried between runs** (meta progress, survives refresh) | Roadmap | what to unlock next run | highest: persistence across runs |
| 17 | **Integration**: full playtests, balance, layout screenshots, release candidate 3.0.0 on `phase3` | — | — | integration |

### Block notes

1. **Roles.** Picked per player in the lobby or at night (one of each at most). Chef: drinks finish
   faster but the Chef can't take payment at the counter. Creator: latte art and signature bonuses,
   slower at the grinder. Host: customers wait longer and tip more near them, slower at machines.
   Manager: cheaper restocks and see tomorrow's numbers, but works slower overall. Bots get a role
   too. Shown on the HUD badge and the awards.
2. **Pricing.** Each drink's price is set at night in steps (−50% … +100% of base). Demand: the
   chance a customer orders that drink and their patience scale with a smooth curve of the price
   ratio; regulars and premium customers mind less. The night menu shows price, expected orders
   and expected profit per drink, plus yesterday's sold/refused counts.
3–8. Each adds one night decision and one line on the morning paper explaining yesterday's result.
9. The rival reads only state the players could see (your menu and prices), deterministically.
12–14. Behind a "Growth" night tab that today shows as locked.
16. Separate localStorage key with its own version and migration; a corrupt meta save never
   blocks a new run.

## Not in Phase 3

Franchises, 2v2 rivals on a shared street, seasons across game nights (Phase 4); any AI (Phase 5).
