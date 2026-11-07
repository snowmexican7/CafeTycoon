# Plan: cut the bots, keep a robot cashier, and make wand upgrades ease the meters

Status: **approved by Kennedy 2026-11-06** (answers below). **Phase 1 is done and on main (2026-11-07, protocol 69,
snapshot 35).** Phase 2 is Grok's (HANDOFF); Phase 3 waits on #29. See "As built" at the end. Decisions are logged in
`docs/HANDOFF.md` (2026-11-06). The facts come from a survey of `main` at caf1cce.

## Why

Kennedy: bots "suck in almost every way imaginable". CafeTycoon is a co-op game for people. At most, a solo player
gets one **robot cashier** that only rings up customers at the till. All design and test effort goes to human play.

Separately, the steam-wand upgrades should make the hand-made latte meters **easier**, not faster.

## What bots touch today (short version)

- **Bot code:** `src/sim/bots/` is about 8,000 lines.
  - `brain.ts`: 1,627 lines, the whole bot player.
  - `planner.ts`: night advice and crew tips.
  - `roster.ts`: who the bots are, and how many.
  - `helper.ts`: "leave the person's machine alone".
  - `phone.ts`: answering the branch phone.
  - `path.ts`: grid pathfinding. **Not bot-only:** floor, spawn, messes, rogue and rearrange also use it.
- **Features that only exist through bots:**
  - crew tips voiced by a bot;
  - a bot answering the branch phone after 10 s;
  - hiring and firing bot baristas, with wages (`src/sim/staff.ts`);
  - the temp-barista card;
  - the cover bot when a person collapses from espresso;
  - bot rows in awards, stats and "who served".
- **Settings:** `Settings.bots` / `botSkill`, the solo start's `soloBots` (0–3, default 1), the lobby's bots picker
  (`defaultBots`, `parseBots`, room message fields), and `Player.bot` on the wire.
- **About 30 sim files** carry `!p.bot` guards. These become dead code once bots are gone.
- **Tests and scripts:** about 66 test files, plus `gearBalance`, `p4Smoke` and `balanceCore`, play whole days
  through bot "stand-ins". A stand-in is a bot with the 'human' personality, played by the same brain. That includes
  the `p4Smoke 7 2` crash-and-stall check run on every change.

## The plan

### Phase 1: game logic (Claude, one branch per step, each with green tests)

1. **Move shared code out of `bots/`.**
   - `path.ts` → `src/sim/path.ts`.
   - The advice engine (`planNight` and friends in `planner.ts`) → `src/sim/advice.ts`.
   - No behaviour change.
2. **Turn the bot brain into a test-only player** (`src/harness/`):
   - The game no longer calls it.
   - Scripts and tests drive their stand-ins with a `harnessStep(state)` before each `step`.
   - This keeps every automated play-through (and the `p4Smoke` check) meaningful without writing a new player.
   - The brain never ships in the game's logic again.
3. **Add the robot cashier** (solo only):
   - A small player `cashier` that walks to the till, rings the next customer and waits.
   - It never rings while a person is at the till.
   - It reuses the existing ring-up code (`tillNext`, `tillRingUp`) and the walking/path code.
   - About 150–250 lines instead of 1,627.
   - It does nothing at the self-order (Squarely) tier, where customers ring themselves.
   - Setting: `Settings.cashier?: boolean`. A solo run reads `LocalSettings.soloCashier`, default on.
4. **Remove the bot-only features:**
   - hiring and firing bot staff, and bot wages (the Strategist and Marketer hires stay);
   - the temp-barista card;
   - the espresso-collapse cover bot;
   - the helper rules;
   - bot phone answering (see open question 3 for what replaces it);
   - bot awards, stats and "bot mistake" events.
   
   Crew tips stay as **unvoiced tips**: the same advice with no bot name attached.
5. **Settings and protocol:**
   - Drop `Settings.bots` / `botSkill`, `soloBots`, the lobby bots choice and its room-message fields.
   - Keep `Player.bot` only as far as the cashier needs it.
   - Bump the protocol and snapshot; no save compatibility.
6. **Clean up** the dead `!p.bot` guards, a few files per commit.

### Phase 2: screens (Grok / Cursor)

- Remove the solo bots toggle (`ui/title.ts`), the lobby bots picker (`ui/lobby.ts`) and the bot hire cards
  (`ui/night.ts` staff card).
- Remove the bot name tags and 🤖 marks, the "bot oops" cue, and the bot rows in "who served" and the week-end screen.
- Crew-tip chips lose their bot voice.
- Add a "Robot cashier" on/off to the solo start, and draw the cashier.

### Phase 3: wand upgrades ease the meters (after Cursor's PR #29 merges, since it reworks `handmade.ts`)

| Wand | Jug fill | Steam meter perfect window |
|---|---|---|
| Little wand (E3 add-on) | Even speed (today) | ±0.08 (today) |
| Proper wand (E4 add-on) | Fast–slow–fast, mild | ±0.15 |
| Built in, The Annihilator (E5) | Fast–slow–fast, strong | ±0.20 |
| Built in, Double Trouble (E6) | Strongest slow middle | ±0.25, almost always green |

- The **slow middle centres on the line the ticket asks for** (cappuccino ≈ 0.35, latte 0.6, large 0.85), not on the
  jug's halfway point. That way a quick press lands on it.
- Implementation: a pure `fillLevel(t, wand, line)` easing curve and a `steamWindow(wand)` in `handmade.ts`, both
  with named constants. `steamPos` and the UI meters read them, so the drawn meter matches the rule.
- Wand speed stops mattering for people's lattes, which already finish in hand as of #29. The upgrade is now purely
  "easier to get perfect".
- Tests: each tier's window, the curve hitting each line, and determinism.

## Order and size

1. Phase 1 steps 1–2 first (no player-visible change, protects the tests).
2. Then step 3 (cashier), then steps 4–6.
3. Phase 2 follows step 5.
4. Phase 3 can run any time after #29 merges; it's independent of the bot work.

Rough size: Phase 1 is the biggest (several days of agent work, mostly test churn). Phase 3 is small.

**Risk:** solo play gets harder once the bot crew is gone. Today a solo café is balanced around one person plus bots
and wages. The robot cashier softens it, and Kennedy's playtests decide the rest.

## Kennedy's answers (2026-11-06)

1. **Robot cashier:** solo only, on by default with an off switch. Free or a very low daily charge — Claude's call:
   **$1 a day** on the receipt (a named constant, easy to set to 0).
2. **Co-op:** no bots at all, not even to cover a friend who drops out; the run is simply over then.
3. **Phone:** it's a coffee game, not an answering-the-phone game. **Cut the answering mechanic**: no `call` input, no
   bot answering. Calls stay only as heads-ups that come through (like the office run's ring). The branch-call outcomes
   (take an order / fix a machine) go away with it.
4. **Hired bot baristas, the temp card and bot wages:** removed. They'd need a full rework to come back.
5. **Tests:** keep the old bot brain as a test-only player (`src/harness/`), so the automated play-throughs and the
   `p4Smoke` check keep working. It never runs in the game.

Phase 1 step 4 therefore also removes `call.ts` answering (`applyBotCall`, the `call` input, `callAnswer`, branch-call
outcomes), keeping the office-run heads-up.

## Open questions for Kennedy

1. **Robot cashier:** solo only, free and on by default (with an off switch)? Or a hire with a small wage?
2. **Co-op:** no bots at all, not even to cover a friend who drops out mid-day?
3. **Branch phone:** with no bot to answer, should an unanswered call just ring out (that branch loses the order),
   or should the robot cashier answer it in solo?
4. **Hired bot baristas and the temp card:** remove entirely, along with the bot wage economy?
5. **Tests:** keep the old bot brain as a test-only player (recommended: cheapest, and keeps the safety net), or
   write a new, simpler scripted player?

## As built (Phase 1, 2026-11-07)

- Step 2 used a hook instead of a "harnessStep before step": `step.ts` exposes `setBotDriver`, and `installHarness()`
  plugs the old brain in at the same point in the tick, so every bot-driven test plays exactly as before.
- Robot cashier: `src/sim/cashier.ts`. It steps aside for a person with empty hands standing on or straight beside the
  till spot (not diagonal, not someone collapsed), comes back 2 s after they leave, and keeps ringing through the closing
  grace. $1 a day goes on the wages line.
- Branch phone: the branch decides its own call when it first rings (takes an office order if nobody walked out of the
  branch yesterday; fixes a broken machine with 2+ staff). The ring still shows for its whole window.
- `DayStats.byPlayer` ("who served what") is people-only. Removing the temp card changes which cards can be dealt.
