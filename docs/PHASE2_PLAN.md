# Phase 2 plan: Busy season, block by block

Phase 1 is closed (tag `phase1-final`). The first co-op playtest verdict: **it works, but it is
boring and repetitive** ("make coffee, serve coffee"). Phase 2 is about **variety, laughs,
strategy and co-op moments**: every day should feel a little different, something silly should
happen most days, there should be real choices at night, and the crew should have reasons to talk.

Roadmap context: [`ROADMAP.md`](ROADMAP.md) (Phase 2, "Busy season"). Open items and decisions:
[`BACKLOG.md`](BACKLOG.md).

## The block workflow

Phase 2 ships as numbered blocks, each small enough to review and to undo on its own.

1. **Start from the latest `main`:** `git fetch && git checkout -B main origin/main`, then
   `git checkout -b p2/bNN-short-name` (two digits, e.g. `p2/b03-customer-visuals`).
2. **Work on the branch.** Commit as often as useful. Fetch and rebase onto `origin/main` before
   committing a batch and before pushing (another agent may be pushing too).
3. **Green means all three:** `npx vitest run`, `npx tsc --noEmit`, `npm run build`. Plus whatever
   the block needs to be *verified*: a balance run, a Playwright smoke test against
   `vite preview`, screenshots in `/workspace/overnight/bNN/` (outside the repo).
4. **Self-review** the diff before merging: determinism (no `Math.random`, `Date`, or iteration
   over unordered sets in `src/sim`; RNG only from state), sync (anything a peer needs is in the
   snapshot or lobby message; protocol changes bump `PROTOCOL_VERSION`), the render-once-then-patch
   rule for the HUD (`hudStructureKey` changes only on structure), and save compatibility
   (`sanitizeSettings`/snapshot loading accept old saves).
5. **Merge:** `git checkout main && git merge --no-ff p2/bNN-short-name -m "Block NN: <summary>"`.
6. **Tag** the merge commit `p2-bNN` (Block 0 used `phase1-final` instead).
7. **Push** `main`, the tag and the branch. Never force-push; never rewrite pushed history.
   If a push fails with "An error occured while classifying this action", retry once; if it still
   fails, leave everything committed locally and say so in the report.
8. **Record** deferrals and decisions in `BACKLOG.md`, player-facing changes under **Unreleased**
   in `CHANGELOG.md`.

**Undo any block** with `git revert -m 1 <merge commit>` (then push). Worst case, `phase1-final` is
the known-good Phase 1 build. Blocks are written so a later block reverting cleanly does not
require reverting the earlier ones; where a block depends on another, its section says so.

## Blocks

Each block lists its aim, the main pieces, and how it is checked. Refine freely; record changes
here.

### B0 — Close Phase 1 *(done: `phase1-final`)*
Reviewed the chaos pack; ghost-player seat reclaim and a 4-human cap; finish the customers inside
at closing ("Doors locked" banner); the host's bots setting in the lobby; log pruning each tick.

### B1 — Chaos pack visuals
The chaos pack (spills, grounds, the mop, rogue customers making their own drinks, occupied
stations) has sim data and almost no art. Draw messes on the floor by kind and amount, the mop in
its corner and in hand, a rogue's walk/make/storm-out, the occupied-station tell, and the
review line in the morning notes and receipt. Source list: BACKLOG "Needs UI (chaos pack: floor)"
and "Needs UI (chaos pack: rogue)". *Check:* screenshots of every mess kind and rogue stage.

### B2 — Event visuals
Rush hour, the inspector, the influencer and power flickers are mostly a banner today. Give each
a moment in the scene: a crowd at the door, an inspector with a clipboard walking the floor, a
ring light and phone for the influencer, the lights dipping and machines sputtering in a flicker.
*Check:* a forced-event dev seed per event; screenshots.

### B3 — Customer types, bot personalities, "X served a latte" toasts
Make the people readable: regulars, students, office workers, tourists, impatient types, big group
orders (sprites, hats, speech bubbles with their mood). Bots show their personality (rookie speed
lines, veteran's calm) and an occasional quip. Small co-op toasts: "Ben served a latte", "Bot Rory
saved Cleo's order", streaks. *Check:* toasts throttle (no spam at 4 players), HUD patching keeps
the render-once rule.

### B4 — Neighbourhood day forecasts
A forecast card each morning so days differ and the night shop has a reason: **rainy Monday**
(latte-heavy, slow start), **exam week** (students, espresso rush, late crowd), **market Saturday**
(tourists, big groups, cold brew), plus a few more. Data-driven (`src/data/forecasts.ts`),
deterministic from the run seed, shown at night so the crew can plan buys. *Check:* sim tests per
forecast; balance run stays within the spec targets.

### B5 — More drinks and menu variety
New drinks with new steps (mocha with syrup, iced latte at the ice bin, tea at the kettle, a
pastry case for pick-and-go). Menu choices at night (what to offer today) so a forecast matters.
*Depends on:* nothing; B4's forecasts get richer once it lands. *Check:* recipes table tests,
bots can make every drink, balance run.

### B6 — 40+ upgrade cards with combos and paths
Grow the night shop to 40+ cards along three paths: **speed** (faster machines, double group head),
**quality** (better beans, latte art, tips), **reach** (sandwich board, loyalty cards, delivery
window). Combos that reward a plan ("Loyalty card + Regulars' corner = regulars tip double").
Card rarity and a reroll. *Check:* every card has a test of its effect; describeEffects copy.

### B7 — Daily challenges and the difficulty curve
One optional challenge per day ("serve 5 cold brews in a row", "no spills", "beat the influencer's
mood") with a small reward. A gentler day 1–2 and a real crunch by day 6–7 (spawn rate, patience,
event odds), tuned with the balance tester. *Check:* tester output per day; challenge tests.

### B8 — Easter egg pack 2
- **The shop cat**: wanders, naps on a warm machine (it must be moved), sometimes knocks a cup off.
- **Name mix-ups**: a cup called out with a mangled name ("Kennedee?"), the wrong customer grabs it.
- **Wi-Fi camper**: one customer nurses a single drip for hours and takes a seat; shoo them nicely.
- **Burnt beans and the fire alarm**: leave grounds in the grinder too long, smoke, then an alarm
  everyone must stop (two players at the panel).
- **Latte art fail**: a rare "art" result with a caption ("is that a duck?") and a tiny tip either way.
- **Secret menu code**: a code typed at the register unlocks a silly drink for the run.
All seeded and deterministic; each one rare enough to surprise. *Check:* one test per egg; a
playtest note.

### B9 — Juice pass
Screen shake on a spill, coin pops, steam puffs, squash and stretch on hand-offs, a satisfying
serve ding streak, the closing-time shutter. Respect reduced motion. *Check:* frame time stays
under budget with 4 players and 3 bots.

### B10 — Local stats and end-of-week awards
Per-player stats for the week (served, spills, shots drunk, mops) kept locally, and funny awards on
the week-end screen ("Most likely to slip", "Espresso goblin", "The mop whisperer", "Customer
whisperer"). *Check:* awards are derived from the log and deterministic for a seed.

### B11 — Balance pass with the tester and telemetry
Re-run the tester across seeds with all new content; add chaos and forecast columns; read the first
Phase 2 telemetry file; tune `economy.ts`. *Check:* spec §11 targets met; notes in BACKLOG.

### B12 — Integration and v2.0.0
Fix what the blocks left, a full 7-day 4-player playtest (two browsers per machine is fine),
update the roadmap and changelog, bump to **2.0.0**, tag `v2.0.0`.

## Rules of thumb for every block
- The sim stays host-authoritative and deterministic. New randomness comes from `state.rng`.
- Anything new a peer must see goes in the snapshot (or the lobby message before the start).
- Trystero action names stay at 12 bytes or fewer.
- Old saves load: new settings get defaults in `sanitizeSettings`; new state fields get defaults on
  resume.
- Cozy tone: warm, a little silly, never mean.
