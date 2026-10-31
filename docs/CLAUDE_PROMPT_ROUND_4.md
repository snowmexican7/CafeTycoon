# Claude: Round 4 (paste as-is)

Kennedy approved these notes on **Oct 30, 2026, ~10:27 PM (Toronto)** after a playtest of v3.4.1. Grok (UI lane)
wrote this doc. Read `docs/HANDOFF.md` first; the big-picture list is in `docs/ROADMAP.md` ("Where we are now").

## Who does what
- **You (sim lane):** `src/sim/**` (bots too), `src/net/**`, `src/host/**`, `src/storage/**`, `src/data/**`,
  `scripts/**`.
- **Grok (UI lane):** `src/ui/**`, `src/render/**`, `src/audio/**`, styles, `src/main.ts`. Grok wires every
  screen, bubble and toggle below once your names land.
- Neither lane edits the other's files. Ask in HANDOFF "Needs from you".

## Rules
- Worktree off fresh `origin/main`, a revertible dash-named branch per item (e.g. `r4-dev`, `r4-pastry`,
  `r4-bump`, `r4-look`), merge `--no-ff`, tag, never force-push. Tests green (`npm test`, `npm run build`).
- **Versions:** your releases use **3.5.x** (3.5.0 is out; Round 4 sim work can ship as 3.5.1 / 3.6.0 as you see
  fit, just tell Grok). Grok's UI releases use **3.4.x**-style UI tags (`ui-3.4.2`, …). Add CHANGELOG lines under
  Unreleased.
- Bump `PROTOCOL_VERSION` (now 45) and `SNAPSHOT_VERSION` whenever shapes change. No save compatibility needed
  (Decisions).
- **When each item merges, post the exact names as built** (fields, inputs, events, helpers, file paths) in
  HANDOFF **"Claude → Grok"** under "Needs from you (UI lane)", and tick the Round 4 item in "Grok → Claude".
- A full code review by another agent is coming soon. Leave the repo tidy: everything merged, no stray WIP
  branches or worktrees, HANDOFF and BACKLOG current.

## a. Dev mode support (unlimited money + paused night)
Kennedy wants to sit on a night screen as long as he likes and to buy everything to compare the end game with
the start.
- **Gate:** Grok's `src/main.ts` reads `?dev=1` from the URL and passes it into the run. Suggested shape:
  `CreateRunOptions.dev?: boolean` (or `settings.dev`), stored on the state (e.g. `GameState.dev?: true`) so
  host and peers agree. Pick the name and post it.
- **Unlimited money:** while `dev` is on, cash never blocks a buy, hire, grow, restock or vote. Simplest is to
  top cash up to a large number (e.g. $999,999) at each night start and after each purchase, so the HUD shows
  big cash with no UI special case. Never on unless the flag is set; never saved into meta/head starts.
- **Paused night:** an input such as `{ kind: 'devPause', playerId, paused }` (host only) that stops
  `phaseTicksLeft` counting down so the night never auto-advances. Note a relaxed night
  (`settings.nightLengthSec === 0`) already never counts down; reusing that path is fine if cleaner. Ready /
  "Open the shop" must still work.
- **Accept:** with `dev` off, nothing changes (tests prove it). With `dev` on, a fresh stand run can grow to the
  café and buy every gear line on night 1; the night timer stays put while paused.

## b. Pastries (half-wired today)
Today: `SupplyId 'pastry'`, `ECONOMY` packs of 6 for $7, `sellPastry` (src/sim/spoilage.ts) adds a $3 pastry to
~35% of sales when stocked, stock starts at 0, half goes stale each night, and `bots/planner.ts` `RESTOCKABLE`
leaves pastry out ("pastries come with the stand, not by the pack"). Kennedy has never seen one and can't buy them.
- **Decide cleanly** and write down why: either (1) pastries are a restock item on the Restock tab (simplest;
  add to the restock input and `RESTOCKABLE`, keep spoilage), maybe gated by a small one-off "pastry case"
  add-on, or (2) tie them into B6 combos ("a latte and a muffin"). Either is fine; don't leave a third,
  invisible path.
- Make the night brief's run-out estimate cover pastries the same way it covers beans and milk.
- **Accept:** a player can get pastries from the night screen in one obvious step; bots handle them too; the
  name of any new input / card / helper is in HANDOFF.

## c. Bumping into customers (fun quirk)
- When a player walks into a customer, the customer gets annoyed: a small patience or mood hit. Repeated bumps
  on the same customer within a short window make them leave angry.
- Emit an event, suggested `customer.bump { customer, by }`, and on the angry exit reuse an existing walkout /
  leave event with a reason (e.g. `reason: 'bumped'`). Add a cooldown so one long push isn't ten bumps.
- Keep it light and fun: no reputation crash, no bump from bots by default.
- **Accept:** deterministic test for one bump (annoyed) and repeat bumps (angry leave); Grok draws the bubbles
  ("Hey!", "Watch it!") from the event.

## d. Multi-drink orders: stacking id
Kennedy wants one customer's drinks to show as a fanned stack with a "×3" badge. B6 already makes a multi-drink
order **one ticket** (`Customer.items[]`, `Customer.order: 'combo' | 'office'`). Please just **confirm** in
HANDOFF that `Customer.id` + `Customer.items` is all the UI needs (including groups), or name the extra field if
cups on the pickup counter need to point back to their order (e.g. `PassItem.customer`).

## e. Character look in co-op
Grok is building a character creator (before the first day) and "Edit my barista" at night: 5–6 hairstyles
each for male and female, hair colour, a few skin tones, shirt colours, and outfit styles (incl. dresses).
Saved on the device by the UI.
- Carry a small `Player.look` through the lobby / join and the net protocol so crewmates see each other.
  Suggested shape: `{ hair: string; hairColor?: string; skin: string; outfit: string; shirtColor: string }`.
  The ids are strings the UI defines; the sim only stores and forwards them (validate lengths, no logic).
- Editable at night via an input, suggested `{ kind: 'look', playerId, look }`.
- Bump `PROTOCOL_VERSION`. Bots can keep no look (UI picks a default).
- **Accept:** a joiner's look reaches the host and every peer; a night edit updates everyone.

## f. Night screen clutter: proposal only
Kennedy finds the night tabs cluttered. He asked whether some decisions could be cut or move to a short
mid-day moment. (Earlier he preferred area / line / seating upgrades mid-day rather than another night page.)
- **Assess** which night decisions the sim could allow during the day (e.g. a lull or a "mid-day" pause point),
  what that costs in determinism and co-op, and what could simply go. Write a short **proposal in HANDOFF**
  (link to BACKLOG for detail). Don't build unless it's trivial. Grok is tidying the night screen layout in the
  meantime (UI only).

## g. Still open from Round 3 and Feedback 2 (don't duplicate)
- **Round 3** items 1–7 (BACKLOG "Round 3 (Kennedy approved 2026-10-30)"): more lattes, very slight money
  tuning + `walkout { reason: 'price' }`, Strategist / Marketer hires, line + waiting area
  (`line.complain`, `line.leave { quiet: true }`), ring-up time, early-growth nudge, grow diff.
- **Feedback 2** (`docs/CLAUDE_PROMPT_FEEDBACK_2.md`): B6 is merged (protocol 45, Unreleased); still to do
  C9 (built, waits on Kennedy's milk-timeline call), B7 tray table, B8 hand-made lattes, C10 rearranging,
  C11 social feed.
- Balance comes from Kennedy's playtests, not long bot sweeps.

## Also for your info
- **Grok's miss, being fixed now:** there was no "Buy condiment box" button. Grok is adding a "Condiment box, $6"
  card to the Restock tab using the existing `{ kind: 'condimentBox', boxes }` input. UI only; nothing needed from
  you unless the name changes.
- **Still open from `ui-3.4.1`:** please export `emptyHandsWanted` from `src/sim/stations.ts` (or add
  `fridgeWants(state, player)`) so `src/ui/live.ts` stops mirroring it.
- **Grok also does (UI only):** the night always opens on the Restock tab (run-out estimates and spoilage stay),
  stacked multi-drink tickets, bump bubbles, the dev-mode toggle UI.

## When you finish
Post names-as-built in HANDOFF "Claude → Grok", tick the items, add CHANGELOG lines, tag your release, delete
merged branches and worktrees, and tell Kennedy in plain English what changed.
