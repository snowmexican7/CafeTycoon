# Backlog, known limitations and decisions

Things both agents and the crew should be able to find without reading chat logs. Add to
this file whenever a review defers something, or a decision is made that no other doc
records. Roadmap: [`ROADMAP.md`](ROADMAP.md). Design:
[`superpowers/specs/2026-10-28-cafetycoon-design.md`](superpowers/specs/2026-10-28-cafetycoon-design.md).

## Deferred review items

Found by the fresh-context reviews of phases 1a and 1b and judged Minor: real, but not
worth a fix before the first game night. Fix one when touching its area, or when a
playtest complains about it.

### From phase 1a (solo café)
- Cards bought during the night are not written to the saved snapshot right away, so a
  refresh in the middle of the night may not restore a just-bought card.
- A gamble card's outcome is never shown to the player; it only shows up in the numbers.
- A speed modifier reads as "+100% faster" where "twice as fast" is meant.
- Pressing Space while a button has keyboard focus both activates the button and interacts
  in the café.
- The settings store generates a fresh random token on every read when none is saved.
- The notice shown when a run is discarded is generic and doesn't say what was lost.
- Run history leaves out one-day ad items.
- One Review Focus case from the 1a plan (item 2) has no step-level test.

### From phase 1b (peer-to-peer co-op)
- A peer that rejoins with a different token over the same connection never sends a leave
  for its old token, so the old barista lingers until the host resumes.
- The per-tab identity fallback for browsers that block storage is unreachable; with
  storage blocked, identity resets on refresh.
- Sending to a peer that just left logs an unhandled promise rejection in the console.
- The host logs nothing when a friend's join fails.
- Closing the tab (as opposed to refreshing) loses both the barista and the Rejoin offer.
  The README tells players to keep playing in the same tab.

## Known limitations, accepted for now
- Peers draw the latest host snapshot directly, with no interpolation buffer, so a jittery
  connection shows jittery movement.
- No player cap and no input rate limit on the host.
- Player tokens travel inside snapshots, so a friend in the room could impersonate another
  player. Fine among friends; not fine for strangers.
- No TURN fallback. If two homes can't connect directly, the fix is the Cloudflare relay
  described in design spec §10.
- The browser console shows a failing connection to one public Nostr relay
  (relay.flashapp.me). Expected noise; the other relays carry the room.

## UI overhaul, group B: deferred and open items
- Suggestion flow: "Suggest an idea" opens a blank issue at
  https://github.com/snowmexican7/CafeTycoon/issues/new. Once Kennedy approves the suggestion
  issue template, point `SUGGEST_URL` in `src/ui/roadmapModel.ts` at it
  (`issues/new?template=…`) and create the `suggestion` label. The Suggestions tab lists open
  issues with that label, so it reads "No ideas yet" until the label exists.
- "X served a Latte" toasts in the HUD need a served event from the sim (Claude's side).
- "Crew says" mood reactions on the HUD/night only show when `feedbackIssue` is set; it is
  always null today, so they stay hidden.
- Night shop Upgrades and Ads tabs (and the pitch tab) are locked "Soon" placeholders until
  phase 3 ships those systems.
- The lobby offers "Copy code" only. A join link (`?room=CODE`) needs URL-param handling in
  `main.ts` and the title screen.
- The roadmap progress bar counts a doing goal as half done. It is computed from
  `public/roadmap.json` in `src/ui/roadmapModel.ts`.

## Decisions not recorded elsewhere
- 2026-10-28: The first balance pass met every spec §11 target, so `economy.ts` is unchanged. Re-run the two commands in spec §16 ("Balance pass") after any sim change.
- 2026-10-28: Telemetry is a phase 2 goal. The roadmap rewrite had dropped it; Kennedy wants
  it. Host-recorded, downloaded as a file, no new accounts; see design spec §13.
- 2026-10-28: Saves and unlocks carried between game nights are a nice-to-have, not phase 1;
  they stay in phase 3.
- 2026-10-28: Where AI keys live (the host's browser, or a small backend) is decided in
  phase 5, not before. The design spec's default is the host's browser; the roadmap lists a
  backend as an option.
- 2026-10-28: `main` stays the stable, playable build; finished phases get git tags. No
  versioned paths.
- 2026-10-28: Ownership split, recorded in [`UI_OVERHAUL.md`](UI_OVERHAUL.md): the Video
  Game Designer agent owns `src/ui/*` and the title wiring in `src/main.ts`; Claude owns
  `src/sim`, `src/net`, `src/host`, `src/storage` and the phase 2 bots.
- Pull requests and code review start when someone other than Kennedy contributes. Until
  then both agents push straight to `main` once tests and the build pass.
- 2026-10-28: Group B UI. Seed entry, run history and the key list stay on the title
  screen but are folded down (a seed field in the footer and a "Past runs & controls"
  disclosure). The pause menu shows the roadmap read-only, with no Suggestions tab. The
  legacy dark-panel CSS in `src/style.css` is gone, and every screen now uses
  `src/ui/styles/*.css`.

## main.ts hook-ins (phase 2)

Telemetry hook-ins in `src/main.ts` (slice 7); the UI agent should expect these when merging the title wiring.

- Imports: `createTelemetry`, `withTelemetry`, `createUiBuffer`, `setUiTelemetrySink`, `uiTelemetry`, `Telemetry` from `./host/telemetry`; `PROTOCOL_VERSION` from `./net/protocol`.
- `Session` gains `telemetry` and `teleTimer`, both initialised `null` in `createSession`.
- `main()` scope: `newTelemetry(host)`, `attachTelemetry(s, tele)`, `downloadTelemetry()`, `telemetryRows()` and `lastFrameAt` helpers sit beside `interactPending`.
- `startSolo`, `startHost`, `resume`: the local transport is wrapped with `withTelemetry`, and `attachTelemetry` runs right after `createSession` (sets `s.telemetry` and the UI sink).
- `openHostRoom`: `createHostRoom` gets a fifth `hooks` argument forwarding peer tele events to `s.telemetry?.peerEvents`.
- `startPeer`: a `createUiBuffer()` feeds the UI sink, and a 2000 ms interval (`s.teleTimer`) sends `transport.sendTele(buffer.drain())`.
- `frame()`: tracks the previous frame time and records `frame.long { ms }` through `uiTelemetry.ui` when the gap exceeds 250 ms (first frame skipped).
- End of `main()`: `window.cafetycoon = { telemetry: { download, rows } }`; wire `downloadTelemetry` / `telemetryRows` to UI buttons if wanted.
- `endSession`: clears `teleTimer` and calls `setUiTelemetrySink(null)`.

## Needs UI (phase 2)

The data exists; the visuals are the UI agent's.

- `HudVM.pass`: items on the counter, plus a HUD list.
- `NightVM.menu` toggles, and the `menu` input `{ kind: 'menu', playerId, drink, on }` (night only).
- `HudVM.events`: banners and toasts for `state.log` kinds `inspection` and `influencer`.
- Customer kind tells: `Customer.kind`, `name`, `extra.length`.
- Bot tells: `Player.bot` present means a name tag "(bot)"; `bot.personality`.
- Receipt fields via `receiptViewModel(dayStats)`: wasted, fines, bonus, inspection, events, botMistakes, lostRegulars, drinks.
- Telemetry download button on the pause and week-end screens, calling `downloadTelemetry()` in `main.ts`.
- `uiTelemetry.ui(kind, data)` calls from the night screen (cards hovered or opened but not bought).
- Title or pause settings for `bots` (0 to 3 or 'auto') and `botSkill` (1 to 5), through the existing `settings` input.
- `nightViewModel.ready` now omits bots; `hudStructureKey` ignores per-tick `secondsLeft` fields (pass, events).
- Show the version from `package.json` (e.g. `v1.0.0`) on the title screen, and have the Roadmap drawer's Changelog tab read `CHANGELOG.md` (or a generated copy) instead of the short `changelog` array in `roadmap.json`.

## Needs UI (chaos pack: floor)

Shipped in Block 1 (`src/render/layers/chaos.ts`, `src/render/chaosModel.ts`), except where noted.

- piles and puddles from `HudVM.messes` (amount scales the size)
- the slip animation from `HudVM.stuns`
- the mop in its corner and in hand from `HudVM.mop`
- the cleaning progress from `HudVM.cleaning`
- a cleanliness meter from `HudVM.cleanliness`
- 4-way facing from `Player.facing`
- the R key in the controls hint

## Deferred (phase 2)

- Syrups and a flavour picker wait for Group B (sketch: a syrup station, number keys 1 to 9 to pick a flavour, flavoured orders on tickets).
- Buying and placing stations, and a one-machine start, are phase 3.
- Telemetry rows are never capped in memory; a long four-player run may reach tens of MB. Coalesce repeated move rows later.
- `frame.long` should be suppressed while `document.hidden`.
- A human standing idle within reach of a machine holding a finished drink blocks bots from collecting it; add an idle grace.
- After a host resume, bots added before friends rejoin can give a six-barista day until the next morning; trim on join.
- `tele` batches have no host-side rate limit.
- `frame.long` still logs one row covering the whole hidden period on the first frame after a tab returns (animation frames stop while hidden); add a `visibilitychange` listener in `main.ts` that resets the previous-frame timestamp. Until then, drop `frame.long` rows over a few seconds when analysing.
- Grounds abandoned as the grinder's output count as a pending drink for bot coverage, so a single espresso or latte order reads as covered until someone takes them; extend the orphan rule so a bot picks up abandoned grounds and continues the chain when an espresso/latte order is uncovered.

## Sound and music (stage 1): deferred and open items

Sound is client-only (`src/audio/`): cues come from diffing two snapshots this client already has,
so it cannot affect the sim, co-op sync or the seed. Settings live in `localStorage` under `cafetycoon.audio`.

- **Station sounds don't pause in a power flicker.** A grind or pull is scheduled for the station's
  busy time when it starts; if the power cuts out mid-pull the sound plays on. The music does
  tape-stop and muffle during the flicker. Fix: track playing station voices per station id and
  fade them when `busyTicksLeft` stops falling.
- **No positional audio.** Everything is centred; the local player's own actions are only a little
  louder (`mine`). Panning by station x position would be cheap (StereoPannerNode per voice).
- **Synth recipes are procedural, not recorded.** Grinder, espresso, steam and pour are Web Audio
  recipes tuned by ear; real CC0 recordings (freesound) would sound richer if someone finds good ones.
- **Music is generated at runtime** (about a second of OfflineAudioContext work after the first
  click). It is cheap, but there is no "pre-rendered file" fallback if a browser lacks OfflineAudioContext;
  such browsers simply get no music.
- **No per-customer-kind sounds** (regulars, VIPs) and no menu/tab switch sounds on the night screen
  beyond the generic UI click.
- **No volume ducking for stingers**: the day/night music keeps playing under event jingles.

## Espresso Easter egg (stage 2): sim touchpoints, tuning, open items

The logic is all in `src/sim/espresso.ts` (plus `espresso.test.ts`). **Claude, heads up: these are
the only lines touched in your areas**, each a one-line call into that file:

- `types.ts`: optional `Player.espresso`, `GameState.debt`, `DayStats.ambulance` / `debtPaid`; input
  kind `{ kind: 'espresso', playerId }`; log kinds `espresso.shot` / `espresso.collapse`.
- `validate.ts`: `'espresso'` added to the playerId-only case list.
- `step.ts`: `case 'espresso': drinkEspresso(...)` in `applyInput`; `stepEspresso(s)` first in `stepDay`
  (counts the boost down, freezes a collapsed player, moves them to the door once wheeled out).
- `movement.ts`: per-player speed `* espressoSpeed(p)` (1 unless boosted).
- `closing.ts`: `settleEspresso(state)` right after rent (bill goes on the tab, tab is repaid).
- `run.ts`: `espressoMorning(state)` at the end of `startDay` (collapsed player back, counters reset).
- `bots/roster.ts`: `humanCount` skips `p.espresso?.out`, so `syncBots` adds a cover bot mid-day when
  the crew has room and drops it next morning.
- Client: `KeyQ` sends the `espresso` input (src/render/keys.ts, keyboard.ts, main.ts). Old hosts
  ignore the unknown kind, so no protocol bump.

Tuning (all in `ESPRESSO`): Q within interact range of the espresso machine, day or closing, costs
1 bean (no beans, no shot). Shots 1-5 today give +30/35/40/45/50% speed for 15 s; re-drinking
refreshes the timer. Shot 6 collapses: out for the day, held item dropped, $150 ambulance bill.
The bill goes on a hospital tab (`state.debt`) at close; from the next close on, half of each
day's positive profit pays it down, never more than the cash in the till (so it can't bankrupt
anyone). No RNG involved. Bots never drink.

Open items:
- Unpaid hospital debt is not subtracted from the week score (`scoreRun` is cash-based).
- If a collapsed player disconnects and rejoins, they stay out until morning (intended).
- The cover bot only appears if the crew is under the bot cap (`bots: 'auto'` or a free bot slot).

## Phase 1 UI polish: night warnings, cash vs. score

- **Needs from sim: wages.** The night warning works out "cash after tomorrow's bills" from rent only (`rentForDay`), because there are no wages in the sim yet. When hired staff land (phase 3), expose the next day's wage bill (or a `billsForDay(state)` helper next to `rentForDay`) and `src/ui/nightWarnings.ts` will add it to `rentTomorrow`.
- Supply "low" warnings use a UI-side estimate (`expectedUse`: base arrivals × day length × traffic, split by order bias over the drinks on the menu). A supply counts as low below 75% of that (`LOW_SUPPLY_SHARE`), since some customers walk out, so a fresh run's starting stock doesn't nag. If the sim ever tracks an expected-orders number, use that instead.
- Warnings never block Ready. The structure key only includes each warning's `id:level`; titles and amounts are patched in place.

## Needs UI (chaos pack: rogue)

Shipped in Block 1 (the review in the morning notes was already there).

- the angry bubble on an upset customer (`Customer.upset`)
- the rogue walking behind the counter and out the door (`HudVM.rogue`)
- the occupied-station tell (`Station.occupiedBy`)
- the review in the morning notes
- the receipt's `rogues` line

## Chaos pack open items

- **Mopping under traffic (tuning question).** Bots only mop when no order is waiting, so on a busy floor they rarely get to it: with 2 bots on day 2, 9 of 16 seeds produced a bot clean in 4000 ticks, and a floor nobody mops hits cleanliness ~11 within a minute. Candidate tweaks: allow `shouldMop` when `cleanliness < inspectorMin` even with orders waiting, or whenever the queue is ≤ 1.
- **The tester has no chaos columns.** Add rogues, messes, cleanliness and cleans to its output.
- **Host tip (game night).** Until the UI draws piles on stations, a bot standing idle with an order waiting may mean grounds parked in a machine. Fixed in the sim (bots no longer count stray grounds as a shot and bin them); kept here for the record.

Deferred minors:
- Drop logs (`drop` events) carry no player id.
- Mop logging differs between a holder leaving and a stale holder being cleared.
- `idleNode` may pick a spill tile.
- The spill-avoiding path search runs twice when nobody is near (the "around people" pass adds nothing).
- Determinism tests compare whole states with `toEqual`.
- The mop corner sits in the queue column (layout/visual note).

## Block 0 (Phase 1 close-out, 2026-10-29 overnight)

Review of the chaos pack (tracks A and B, Claude, since `076d181`) and its final-review fixes
(`318c1e9`, `b0e7b86`, `55d8ba9`): tests, `tsc` and the build are green; no `Math.random`, `Date`
or unordered iteration in the new sim code; the rogue, floor, mop and drop logic only reads
`state.rng`. Findings:

- **Fixed:** the sim never called `pruneLog`, so `state.log` (and every snapshot) grew all day.
  `step()` now prunes every tick (`LOG_KEEP_TICKS` = 120). Telemetry and sound consume the log by
  `seq` on every snapshot (20 Hz), so nothing is lost. Tests that inspected `s.log` after long runs
  now record the kinds while stepping.
- **Fixed:** `pass.ts` and `drop.ts` hard-coded 60 ticks per second for staleness; they use
  `secondsToTicks` now.
- **Deferred (tuning):** `placeMess` refuses a new mess at the cap (12) even when the tile already
  has one it could merge into, so at the cap a drop onto an existing puddle is refused and the
  player keeps the item. Probably better to allow the merge; tests "nothing drops at the cap" and
  "slip at the cap keeps item" pin today's behaviour.
- **Deferred:** a bot's `returnMop` step relies on R preferring the mop over a held cup (it does,
  in `resolveDrop`); worth a direct test if R ever changes.
- Claude's own open items are in "Chaos pack open items" above.

Decisions:

- **Closing.** At 0:00 the doors lock (no new arrivals); everyone inside can still be served. The
  day ends when the shop is empty (customers and the rogue) or after `ECONOMY.closingGraceSeconds`
  (30 s); leftovers storm out and count as lost. The closing phase lasts at least
  `closingMinSeconds` (1 s) so the banner and receipt always show. The HUD shows "Doors locked:
  finish up! N left"; the banner's presence is structural, the count is patched.
- **Seats.** A peer offers the seat this browser last played in that room (`prev`, from
  `localStorage` `cafetycoon.seat.<CODE>`); the host gives it back only if it is a human seat that
  is away (not live, not the host). Without one, an away seat with the same name (trimmed,
  case-insensitive) is reclaimed. Otherwise a new seat if fewer than 4 humans, else the room is full
  (`hello.reject = 'full'`, "The café is full"). A live seat is never handed to a second
  connection. The host tells the peer its seat with a new `seat` message (protocol 4). Peers leave
  the room on `pagehide` so a closed tab shows as away quickly. The peer's room (for "Rejoin") is
  now per browser too.
- **Known seat risks (accepted):** two people with the same name, one of them away, can swap into
  each other's seat by the name match; a duplicated browser tab copies `sessionStorage`, so both
  copies claim the same token and the later connection wins (the earlier one is replaced). Both
  need the same browser or the same name; fine for game night.
- **Bots setting.** Off or 1–3, picked by the host on a paper card in the lobby (peers see it
  read-only). Until the host picks: Off with 2+ humans, auto (fill to three baristas) for a lone
  host. Saved in `state.settings.bots` with the run; the roster, morning sync and the espresso
  cover bot read it. Bots never take a spot behind the counter a human would need (max 4
  baristas), so with 4 humans the card says no bot fits.
- **Deferred:** a host-only Bots row in the pause menu (the sim already accepts a `settings`
  input with `bots` and applies it next morning; only the UI row is missing).
- **Dev hook:** `window.cafetycoon.peek` (`state()`, `me()`) is a read-only copy of the latest
  snapshot for smoke scripts and playtests.

## Block 1 reflection (chaos pack visuals)

Shipped: grounds heaps and lumpy puddles (cold brew/espresso darker) that grow in, ripple when
they spread and shrink away when mopped; THUD! + dust + swirly eyes, orbiting stars and a wobble on
a slip; the mop bucket in its corner, a carry pose and a scrub swing, a wet-floor sign that hops to
whoever is mopping, a scrub progress ring; the Floor meter card (patched in place, never in the
structure key); the rogue (anger vein and steam, a sneaking crouch, "Move it! 4s", OCCUPIED tape on
their station, "Two stars." on the way out, speed lines and SLAM! with a swinging door and a small
screen jolt); the upset customer's red shaking bubble; receipt lines for wasted drinks, pratfalls
and rogues; 12 new cues (slide-whistle thud, splosh, scatter, mop clack/squeak, sneaky pizzicato,
smug ta-da, door slam). A dev-only fixtures page (`fixtures.html?f=floor|rogue|slam|receipt`,
served by `vite`, not in the build) drives screenshots.

What could be better:
- A puddle is often hidden under the barista standing on it; a thin highlight ring around messes
  near a player would help. Messes on the rug read a little less well than on planks.
- The rogue mostly walks up the screen, so we see their back: the anger vein carries it, but a side
  view would sell the sneak better.
- The comic texts use `Math.random` for tilt (visual only, but two clients tilt differently).
- The door slam draws a temporary door: the room has no real front door yet (B6 decor could add one).

What's missing (deferred):
- Blame: "Cleo slipped on Ben's latte!" needs the mess's owner in the sim (`Mess.by`). Small sim
  change; parked for B10 (awards) where it pays off most.
- Grounds footprints when someone walks through a heap (purely visual trail).

Co-op fun:
- Folded in now: the name tag reads "Ben · mop" so the crew knows who to shout for, and the
  receipt counts the day's **pratfalls** (`DayStats.slips`, a tally only).
- Next: a "Butterfingers" / "Pratfall champion" award at the week end (B10); letting a player
  carry the wet-floor sign to fence off a puddle for the bots (B5 bots already path round spills).

## Block 2 reflection (event visuals)

Shipped: an intro card per event (title, one line of crew advice, tone colour) over the back wall,
and a chip per active event under the top bar (seconds patched in place); power flicker dims and
stutters the whole room (`flickerDarkness`), busy machines spark, a ballast buzz repeats every
`BUZZ_TICKS` while it lasts; the inspector walks a fixed patrol with a clipboard, scribbles at
stops, mutters (or "Tsk tsk." near a mess), and the chip carries a scrutiny meter (wasted n/4,
floor %, "looking good / hmm… / would fail!"), then a PASSED/FAILED stamp card; the influencer has
a selfie-stick ring light that flashes the room, floating likes, and a "Posted! +2.5k followers"
card when served; rush hour lights a marquee board by the door. Stings: brassy run, "dun dun
dunnn", glitter gliss, ballast buzz, layered on the existing samples. Morning notes foreshadow
the day's drawn events (`EVENT_FORESHADOW`, sim/describe). Receipt: today's events, inspection
verdict with the fine, influencer bonus.

What could be better:
- The receipt's "today's profit" is sales + tips − rent, so a FAILED −$15 line or a +$10 bonus
  doesn't add up on the card. For Claude (economy): show profit net of fines and bonus, or label it.
- The inspector is render-only: they walk through baristas and the sim has no body for them.
- The intro card briefly covers the menu chalkboard; fine for 3 s, but a smaller card on narrow
  screens would help.
- Night-screen forecast for *tomorrow* isn't possible without the sim drawing the schedule a day
  early (it rolls at `startDay`, after night inputs). Kept to the morning note so the RNG order is
  unchanged. A forecast item ("Weather radio": see tomorrow's events) could be a night-shop card.

What's missing (deferred):
- The influencer's order ticket isn't marked in the Orders list yet (moved to B3 with the other
  customer kinds).
- A rush-hour "line out the door" visual when the queue is full.

Co-op fun:
- Shipped: the intro cards tell the crew how to split up ("one grinds, one steams, one serves"),
  and the inspector's "Tsk tsk." at a mess is a cue for whoever has the mop.
- Folded into B3: when the influencer is served, the whole crew strikes a pose for the photo
  (flash, sparkles over every barista, "Say latte!").
- Later: a "Weather radio" night card that reveals tomorrow's events, so planning becomes a team
  decision at the shop.

## Block 3 reflection (customer and bot personality visuals)

Shipped: customer tells drawn per kind in `Actors` (impatient stopwatch, foot tap and sweat drop;
group companions that leave as their drinks are served plus a ×N pill; regular's name tag with a
heart; influencer ring light from B2); ticket tags in the Orders list (`ticketTag`, part of
`ordersKey`); bots with a white "Name · bot" tag in their colour and a personality look and emote
(`botLook`: rookie NEW sticker + sweat drop, steady headphones + hum, veteran shades + espresso),
dashed crew avatars with a gear badge; away humans greyed with "· away" and z z z; a new sim log
entry `served` `{by, item, amount, kind, cid, perfect, left, name?}` (log only; `PERFECT_PATIENCE`
0.75) driving stacked serve toasts in the server's colour (max 4), confetti and "Perfect!",
hearts and "Ada's usual!", a bot's "Oops!", and the influencer group photo (flash, sparkles over
every barista, "Say latte!"). The old "+$" earnings pop is replaced by the toasts.

Performance: Scene + HUD update measured on the fixtures page (`cost.mjs`): median 0.3 ms per
frame, 0.5 ms with everything at once (p95 0.7 ms). Four headless browsers on software GL ran at
~9 fps both on `phase1-final` and on this block, so no measurable regression from the new layers.
Caps: 4 toasts, 140 confetti/heart/star bits, 80 chaos particles, 8 comic texts; idle Graphics are
not redrawn.

What could be better:
- With four people serving fast, the toast stack sits over the counter and can hide a drink on the
  pass for a moment. A side column (right of the counter) or merging "Ana ×3" would be calmer.
- Group companions are drawn once at arrival; a group that grew (it can't today) would not update.
- "Perfect" is a fixed 75 % patience: it may want tuning with the tester in B11.

What's missing (deferred):
- Emotes reacting to the game (a bot sweating harder in a rush, a veteran's thumbs-up after a
  perfect serve) rather than on a timer.
- Bot speech lines ("On it!", "Behind you!"): B5 bot personalities.

Co-op fun:
- Folded in now: a **teamwork!** cheer when one barista parks a drink on the pass and another
  serves it (`crewBursts` remembers who parked what), a **hat trick** shout-out for three perfect
  serves in a row, and the influencer **group photo**.
- Next: count hand-offs and perfect streaks per player for the week-end awards (B10: "Best
  passer", "Mr. Perfect"), and a crew high-five emote when a rush hour ends with nobody lost.

## Block 4 reflection (neighbourhood days)

Shipped: 12 seeded neighbourhood forecasts (`src/data/forecasts.ts`) in six families (calm, wet,
busy, quiet, money, hot) with weekday rules (Market only on Saturday, lazy Sunday only on Sunday,
exam week Mon–Thu, payday Thu–Fri, office closed / roadworks / commuter crush on weekdays).
`weekPlan(seed, week)` deals each week with its own seeded RNG (never touches `state.rng`), with
a backtracking search so no forecast repeats in a week and no family runs two days in a row (also
across Sunday → Monday). Forecasts feed `computeModifiers`: order tags (hot/iced), customer mix,
event odds, queue length, tips, patience, arrivals and a traffic shape over the day (slow start,
late crowd, lunch peak, morning rush). Events now draw their kind with the forecast's odds while
consuming the same single RNG draw, so event days still schedule exactly as before. The night
shop opens with **The Daily Grind** newspaper (headline, crew tip, expected walk-ins, hot/iced
split, likely event, rumour for the day after); the HUD shows a forecast chip. Save v4 with a
migration from v3, protocol v5. Quick fix in the same block: the receipt's profit includes fines,
bonuses and tab paid, with a net line.

Balance (20 weeks, `npm run balance`): mean final cash **$323.68**, loss rate **29.4 %**, 0/20
bankrupt, vs. baseline $334.78 / 28.9 %. A touch harder on average, well within noise.

What could be better:
- The paper's walk-in count is the base estimate; it does not yet include owned cards or
  reputation, so a strong crew sees "~11" and gets 16. Fine for planning, but could be exact.
- The bot crew ignores the forecast (it preps cold brew on a rainy day). B5's brain changes are a
  good place to make "prep for the paper" a bot trait.
- Forecast effects stack with scenario effects multiplicatively; a heat wave + "summer" scenario
  could push iced orders very high. Not seen in the tester, but worth a cap in B11 tuning.

What's missing (deferred):
- A weekly preview (the whole week's papers at Sunday night) for long-range planning.
- Forecast-specific decor in the scene (rain on the window, market stalls outside).
- Ordering supplies by forecast in the balance bot (it restocks to a flat target).

Co-op fun:
- Folded in now: the rumour line ("Day after: …") so the crew argues about whether to save cash
  tonight for tomorrow's market crowd; a crew tip on every paper.
- Next: let one player "read the paper aloud" (a ping on the paper that highlights it for everyone)
  and a stamp when the crew stocked what the paper suggested.

## Block 5 reflection (menu variety)

Shipped: four new drinks built from the existing stations in new combinations, all data-driven in
`src/data/drinks.ts` (recipes per station, `recipeChain`, `suppliesFor`, `DRINK_INFO` with icon,
ticket, blurb, order bias and patience). Iced latte = espresso shot into the tap (+milk); mocha =
latte back into the steamer (+flavour); matcha = empty hands at the steamer (+milk, +flavour);
maple cold foam = cold brew into the steamer (+milk, +flavour). Iced latte unlocks on day 3, mocha
on day 5; matcha and the special only via cards (Matcha whisk $25, Seasonal board $30), Cocoa tin
$15 brings the mocha early. Cards that would teach nothing are not dealt. One cheap new supply,
flavour pumps (starter bottle on first unlock, hidden until needed). Forecasts nudge the new
drinks. The bot brain derives its chains from the recipes, so bots make every drink. UI: recipe
chips on order tickets, a "New on the menu" banner the night before, a menu board with On/Off at
night, SVG + Pixi icons, spill tints. Save v5 (migration from v4: unlocked from the day, menu keys,
flavour 0, zeroed drink counts), protocol v6.

Balance (20 weeks, menu "all" so every drink is ordered as it unlocks): first run **$296.84 /
35.0 %** — too hard (the steamer is now shared by five drinks). Folded in a fix: fancy drinks buy
patience (iced latte ×1.15, special ×1.2, mocha ×1.3) and lower order weights for mocha/special.
Final: mean final cash **$310.22**, loss rate **32.5 %**, 0/20 bankrupt (B4: $323.68 / 29.4 %).
Slightly harder, by design a little: the menu is wider and more complex; not a cliff.

What could be better:
- The steamer is the new bottleneck (latte, mocha ×2, matcha, special). A second steamer card in
  B6 (or a "Dual wand" upgrade) is the natural answer and a good Speed-path card.
- The wall chalkboard in the scene still lists the three classics; it is drawn once. Make it
  redraw from the menu (deferred: needs a render-layer refresh hook).
- The "New on the menu" banner pushes the hand down on small screens; the hand scrolls but the
  cards can sit below the fold on 800 px tall windows. Consider a compact chip row.
- Balance bot restocks flavour to a flat 10; forecast-aware restock still deferred (from B4).

What's missing (deferred):
- Audio cue for a new drink (a little bell on the banner).
- Customers who ask for "the special" by name with a speech-bubble line.
- More seasonal specials rotating by week (pumpkin spice in a fall scenario).

Co-op fun:
- Mocha is a natural hand-off drink (one player pulls the latte, the other does cocoa), and the
  menu board lets the crew argue about turning the slow mocha off on a Market Saturday.
- Next: a "signature drink" vote at night where each player picks one to push (tips bonus).

## Block 6 reflection (upgrade cards)

Shipped: the catalogue grew from 19 to 52 cards, all data in `src/data/catalogue.ts`, each with a
`path` (speed / quality / reach), rarity and an optional `set`. 33 new cards across the three paths,
including a Second steam wand for the B5 steamer bottleneck, Roaster partner (rare), Pop-up stall
(rare, one day), and seven spicy cards whose downsides render in red (`splitEffects`). Eight sets in
`src/data/cardSets.ts`, each "own 2 → bonus", folded into `computeModifiers` after owned/tomorrow
cards; the card shows have/need, the bonus, and "Completes …" when buying it would finish the set.
New effect kinds: `quality` (reputation per day), `temp` (one-day rookie barista "Robin (temp)",
via `syncTemp`, removed at night, never past 4 players) and `reveal` (Weather radio). The radio
pre-rolls tomorrow's events with `drawEvents` (same RNG draws as `scheduleEvents`, so owning the
radio never changes what happens, proven over seeds 1–12) and the paper prints a radio line. Hand is
4 cards, at least two paths, cheap-card guarantee kept; paid re-roll ($5 + $5 per re-roll that
night, seeded, never re-deals the current hand or tonight's buys). Save v6 (migration: rerolls 0),
protocol v7. 469 tests (+22).

Balance (20 weeks): mean final cash **$293.55**, loss rate **34.3 %**, 0/20 bankrupt (B5: $310.22 /
32.5 %). About 5 % less cash; not a cliff. Checked the obvious suspect: a tester that skips spicy
cards does *no* better ($280.50 / 33.2 %), so the spicy cards are fair trades; the dip comes from the
smaller, wider hand (4 of 52 instead of 5 of 19, so the tester's "cheapest permanent" rule lands on
weaker Reach/Quality cards more often). Real players pick; left as is.

What could be better:
- The balance bot buys blindly (cheapest permanent). A path- and set-aware buyer would measure the
  real ceiling; it should also try re-rolls and the radio.
- Hire-a-temp at $35 competes with re-rolls on early nights; in Playwright, four re-rolls left too
  little cash to hire. Consider $30 or a re-roll cap note.
- The radio's day-1 report is always "a quiet day" (the grand opening has no events) — true but dull.
- Card faces are dense at 800 px tall: set box + flavour text can clip. A hover/expand view would help.
- Synergy is only pairs. Three-of-a-set tiers would make long runs more interesting.

Deferred:
- Selling or scrapping owned cards; card upgrades (level 2); a "locked" card you can hold to next night.
- Per-player hands / voting on buys (everyone currently shares one hand).
- Radio accuracy upgrades (exact times) and a rumour-busting card.

Co-op fun:
- Re-rolls are a group argument ("one more roll!") with a visible, rising price, and sets give the
  crew a shared plan across nights ("we need one more Cold bar card").
- The temp is a fun surprise: a fourth body at the counter for one hectic day, then gone.

## Block 7 reflection (daily challenges + day curve)

Shipped: 15 optional daily goals in `src/data/challenges.ts` (perfect serves, floor %, no
storm-outs / spills, serve N, sell N of a drink, clear before grace, serve the influencer). Dealt
1–2 per night onto the paper (`dealChallenges` at `startNight`, pruned after events at `startDay`),
tracked live on HUD chips, settled at closing for a tip + `challenge.won` log / cheer. A soft
day-of-week curve (`DAY_CURVE`) multiplies traffic and patience and shifts 0/1/2-event schedule
weights so Mon is a warm-up and Sun is the finale, stacked on the existing week ramp. Challenge
deals use a derived RNG (seed ⊕ day) so they never perturb event / radio / customer draws. Snapshot
v7 (`challenges: []` migration) / protocol v8. 481 tests (+12).

Balance (20 weeks): mean final cash **$338.38**, loss rate **36.9 %**, 0/20 bankrupt (B6: $293.55 /
34.3 %). Cash up ~15 % (challenge tips + slightly softer early-week traffic), loss rate up ~2.6 pp
from the late-week squeeze. Day 1 cash in the sample weeks is healthier; day 7 still pays without
bankrupting the bot. Left as is — the curve is doing what it should.

What could be better:
- Challenge pool on day 1 is only three goals; a couple more warm-up goals (e.g. "serve 6", "buy
  one supply") would keep the paper from feeling samey across opening weeks.
- Floor challenges start `have` at 100 and watermark down; a day that never ticks (test shortcuts)
  can free-win at settle. Fine in real play; worth a "touched" flag if we ever skip days.
- HUD chips don't celebrate the win with the B3 cheer / confetti yet — just a ✓. Wire into the
  juice pass (B9).
- The balance bot ignores challenges (never steers toward them), so the tip income is a lower bound
  of what a crew chasing goals would earn.

Deferred:
- Multi-day / weekly meta-challenges ("hit 3 daily goals this week").
- Player-picked challenge from a larger offered set.
- Difficulty options that scale or disable the day curve.

Co-op fun:
- Optional goals give the crew a shared plan for the day without punishing a miss, and the receipt
  tick is a nice group high-five. The Sunday finale curve makes "we survived the week" land.

## Block 8 reflection (Easter egg pack 2)

Shipped all six approved gags in `src/data/eggs.ts` + `src/sim/eggs.ts`:
- **Shop cat** — rare nap on espresso/steamer after a brew; blocks the station; pet/shoo or wait.
- **Name mix-ups** — rare mangled cup name on a regular; they refuse the first serve until remade
  or you correct the name at the counter (empty hands).
- **Wi-Fi camper** — rare day≥2 arrival who takes a seat, never orders; quiet leave or polite kick.
- **Burnt beans / smoke** — espresso left on the machine too long → soft alarm + smoke puff; dump
  the shot to clear (one waste).
- **Latte art fail** — rare steamed drink gets a floating 2★ review card and a tiny tip joke.
- **Secret menu** — type FOAM or UUDDLRLRBA to unlock today's special as "🦄 Unicorn foam"; first
  serve pays a small bonus tip.

Egg rolls use a derived RNG (seed ⊕ day ⊕ tick ⊕ salt) so they never perturb customers / events /
bots — same pattern as B7 challenges. Snapshot v8 / protocol v9. Light visuals (cat loaf, smoke
puffs, laptop bubble, wrong-name tag, comic bursts) and cue ids wired to existing synths. 493 tests.

What could be better:
- Cat / smoke / camper are one-shot per day; a second gentle roll late-day could keep long days
  funny without stacking pressure.
- Secret menu forces `special` onto the unlocked list for the day — fine mechanically, but the
  silly label is only in the log/burst today; HUD drink name still says "Special".
- Latte-art tip is paid even when the drink later goes stale on the pass (the gag fires at finish).
- No dedicated meow / smoke synth yet — reused oops/buzz/hmph.

Deferred / didn't fit cleanly:
- A "pet the cat" happiness buff (kept shoo-only so the gag stays optional).
- Camper ordering after being ignored long enough (kept never-orders).
- Multiplayer-only secret codes per seat.

Co-op fun:
- Catching the cat, correcting "Kennedee", and kicking the camper are great shared bits; the secret
  code is a table-side whisper. None of them punish a busy crew hard enough to sink the day.

## Block 9 reflection (juice pass)

Shipped as client-side juice on top of B3 cheers — no save/protocol bump (vibe and combo live in
`CrewMemory` like the hat-trick streak):
- **Combo streaks** — perfect serves *and* pass hand-offs share one counter; hat-trick at 3, then
  every 3 (`STREAK_AT`). Resets on slip, storm-out, bot oops, trash, name-mix refuse, or a non-perfect
  serve.
- **Screen punch** — `Chaos.punch` jolts the stage on streak / teamwork / storm / challenge / selfie.
- **Particle bursts** — denser confetti + sparkles on perfects, combos, challenges; FX bits capped at
  100 (was 140); chaos particles already capped at 80.
- **Fail feedback** — pops for storm-outs (`today.lost` delta), slips, dumped drinks, wrong-name
  refuse; challenge wins get a cheer + confetti (closes the B7 HUD gap).
- **Crew vibe meter** — 0..100 on a HUD pill (Buzzing / Steady / Rough) with a combo ×N chip when
  the streak is ≥2.

493→~502 tests (+3 juice). Determinism untouched (visual-only).

What could be better:
- Vibe is per-client memory, so a late joiner starts at 55 mid-day; fine for friends, not for a
  shared scoreboard.
- Storm detection via `today.lost` can fire when the queue is cleared at closing — a tiny "closing
  flush" suppress would quiet that.
- Wrong-*order* (serving the wrong recipe) still isn't a distinct fail; trash is the proxy.
- Particle look is still simple dots/stars; a dedicated juice sprite sheet would sell the punch.

Deferred:
- Shared host-authoritative vibe (would need a snapshot field).
- Accessibility option to reduce motion / disable screen punch.
- Per-player vibe contributions in co-op.

Co-op fun:
- Hand-off combos make parking a drink for a teammate feel as juicy as serving it yourself, and the
  shared vibe meter is a quick glance at "are we cooking or are we drowning".

## Block 10 reflection (local stats + end-of-week awards)

Shipped:
- **Per-player crew stats** (`src/sim/stats.ts`, `state.crew`): serves, perfect, tips brought in,
  hand-offs, slips, messes, mopped, espressos, collapses, rescues (rogue remakes + fixed name
  mix-ups), cat pets, campers shooed, alarms stopped, binned, cards bought, re-rolls, idle. They're
  counted from the sim log on every tick, before `pruneLog` (the log only keeps 120 ticks, so
  nothing can be worked out afterwards). Drop logs and `rogue.remade` now say who did it (`by`).
- **Awards ceremony** on the week-end screen (`src/sim/awards.ts`, `src/ui/weekEnd.ts`):
  - A Crew MVP podium, then up to 9 more trophies: Speed Demon, Slip King, Mop Hero, Caffeine
    Gremlin, Hand-off Hero, Cat Whisperer, Agent of Chaos, Customer Whisperer, Frequent Flyer,
    Wi-Fi Bouncer, Fire Marshal, Latte Laureate, Tip Magnet, Bin Diver, Shopaholic, Professional
    Gambler, and Best Supporting Bot.
  - Every person who goes home without a trophy gets a deadpan joke award (Professional Statue,
    Vibes Manager, …).
  - There's a "walked out %" chip and a **Copy awards for the group chat** button.
  - The card is two columns (about 940 px wide) and fits 1280x800 without scrolling.
- **Lifetime records** (`src/storage/recordsStore.ts`, key `cafetycoon.records`, `src/ui/records.ts`):
  - Best week, busiest day (most served), best day profit, weeks run, longest run, walked-out %,
    lifetime totals, a hall of fame and recent MVPs.
  - Opened from a 🏆 Records pill beside Roadmap on the title screen.
- Snapshot v9 (a migration adds an empty `crew`); protocol v10.

Decisions (made overnight, Kennedy can overrule):
- Stats cover the **whole run**, not just a week, because the week-end only happens once (after day
  7) and unlimited play keeps going.
- Bots get stats and can win trophies, but the **MVP always goes to a person**. Bots get "Best
  Supporting Bot" instead. MVP score = serves×3 + perfect×2 + hand-offs×2 + mopped×2 + rescues×3 +
  alarms×2 + campers − messes.
- Nobody holds **more than two trophies** (MVP included), and the award list order is the
  priority. That keeps the ceremony on one screen and spreads the glory around, so a strong player
  can lose "Latte Laureate" to the runner-up.
- Records live **per browser**: peers record the week too, so everyone has their own wall. A run
  counts once (keyed by seed and host); stopping later only adds the new days. Joke and bot awards
  stay out of the hall of fame.
- Saves migrated from v8 start counting from the moment they're loaded, so their earlier days
  don't credit anyone.

504 tests (+8: stats, awards, records).

What could be better:
- Ties go to whoever joined first. A shared trophy ("Ana & Ben") would feel fairer.
- "Speed Demon" is really "most serves", not speed. Per-serve timing would need a new log field.
- Records are lost if you clear the site data, and there's no export or import.
- Idle is tracked but not used for anything yet. A "Professional Statue" award based on real idle
  time could replace the random joke award.

Deferred:
- Per-day awards on the closing receipt ("today's Slip King").
- An award screenshot or share-card generator.

Co-op fun:
- The ceremony is the screenshot moment. It's built so everyone gets named, the clumsy friend is
  crowned Slip King, and the copy button drops the whole list into the group chat.

## Block 11 reflection (balance pass + telemetry)

Shipped:
- **A smarter balance tester** (`scripts/balanceCore.ts`, `npm run balance -- --policy smart`).
  Night policies: `smart` (default), `simple` (the old cheapest-permanent buyer), `speed`,
  `quality`, `reach` and `none`.
  - Smart follows the path it already owns most of and values set completions and the third card of
    a set. It hires the temp from day 4 and buys the radio early.
  - It re-rolls when the hand is weak and there's spare cash, keeps a rent reserve, and scales
    restocks by the forecast's traffic.
  - `--compare policies` runs every policy on the same seeds. `--summary` prints a per-policy table
    (score, loss %, loss by day 1..7, re-rolls, challenges won) and a card ownership vs score table.
    `scripts/balanceSummary.ts` merges JSON reports from parallel runs.
- **Three-of-a-set tier** (B6 note). Every set has a third-card bonus on top of the pair, for
  example Espresso bar gives espresso a further ×1.08. Card faces say "Fills the X set!", "X ✓ full
  set" and name the bonus.
- **Fittings count in the score.** The week's score is now cash profit plus the permanent cards at
  half price (`ECONOMY.fittingsResale`). The week-end money split shows a FITTINGS column.
- **Economy tuning:**
  - Permanent cards costing $20 or more are 20% cheaper (rounded to $5).
  - Hire-a-temp costs $30 (B6 note).
  - Base patience is 33 s (was 25).
  - The day-7 finale curve is traffic ×1.3, patience ×0.8 and event bias 0.22.
- **Radio** (B6 note). A quiet report now has character: an opening-day line, or one of three lines
  that rotate by day (deterministic).
- **Card faces at 800 px tall** (B6 note):
  - The hand grid rows now size to their content, which fixes text spilling out of tall spicy
    cards. That was a real bug.
  - Below 820 px tall, flavour text is clamped to two lines and hidden when a set box needs the
    room. The full text stays in a tooltip.
  - The art is slightly shorter.
- **Telemetry summary:** forecasts per day, challenges dealt and won, re-rolls per night, egg
  counts, awards with winners, and the score. Snapshot rows no longer carry the sim log (it's
  already recorded row by row), which keeps files small.
- Protocol v11, because rules and costs changed and mixed builds would disagree. The snapshot
  shape didn't change, so it stays at v9.

Balance numbers (56 seeds; 2 humans, 1 bot, skill 3, pace 3; `/workspace/overnight/b11/r4*.txt`):

| policy  | score  | mean cash | loss  | profitable | loss by day 1..7     |
|---------|--------|-----------|-------|------------|----------------------|
| smart   | 291.10 | $272.26   | 27.7% | 100%       | 12/19/24/30/30/37/33 |
| simple  | 347.90 | $386.20   | 28.4% |            |                      |
| quality | 370.10 | $362.37   | 24.2% |            |                      |
| reach   | 313.67 | $347.02   | 30.5% |            |                      |
| none    | 347.07 | $447.07   | 31.0% |            |                      |

- Three bots alone (smart): score 191, loss 35.8%, profitable in 96% of weeks.
- Hard settings (skill 2, pace 4): score 276, loss 37.3%.
- Before tuning: smart lost 35% of customers and buying nothing lost 38.8%. Buying nothing also
  out-scored smart by about $200.
- B7 baseline: $338 and 36.9% lost.

Decisions:
- **Buying nothing was the dominant strategy.** Fixed with fittings resale, cheaper cards and
  higher patience. "None" still banks the most *cash*, but it now loses more customers than any
  buyer, and quality and simple out-score it.
- The day curve now reads as a warm-up (12% lost on day 1) and a finale (33–37% on days 6–7).
- **No dominant card:** ownership lifts are within about ±$90 and confounded (rich runs buy more).
- Smart re-rolls 2.9 times a week. Its score trails simple and quality because it spends more on
  re-rolls and temps, which aren't resold. That's acceptable: the targets are "winnable but tight"
  and "no dominant strategy", not "the tester maximises".

What could be better:
- Bot crews aren't station-limited, so speed cards barely help them. The sim undervalues the speed
  path, and human playtests should judge it.
- The tester doesn't react to events mid-day, or use the radio beyond buying it.
- Card lift analysis needs a controlled experiment (force-own one card) rather than correlation.

Deferred:
- A force-own `--card X` A/B mode in the balance CLI.
- Hover or expand to read full card text at small heights.

Final-code check (8 seeds per policy, `/workspace/overnight/b11/bal/r5.txt`): smart 319.77 / 26.6%,
simple 356.70 / 27.9%, speed 318.87 / 24.4%, quality 422.88 / 24.1%, reach 307.18 / 29.8%, none
361.03 / 30.7%. Quality leads on a small sample (370 vs 348 for none over 56 seeds). Watch it in
playtests; a nerf of Quality's reputation cards is the first lever if it holds.

## Block 12 reflection (Phase 2 integration, 2.0.0)

Shipped:
- **Version 2.0.0**, baked into the build from `package.json` (`__APP_VERSION__`). It shows at
  the bottom of *Past runs & controls* and as `window.cafetycoon.version`.
- **A real Phase 1 save fixture** (`src/storage/phase1-save.fixture.json`, a v3 envelope from
  `phase1-final`). A test loads it, plays night → day → night, scores the run and re-saves it at the
  current snapshot version.
- **`?link=local`** (`src/net/localLink.ts`): a dev-only BroadcastChannel room link, so several
  tabs of one browser can play a real room without WebRTC. The default is still Trystero/nostr.
- **A perf probe** (`scripts/perf4.ts`, `npx tsx scripts/perf4.ts`): a week with four stand-in
  baristas, timing `step()` and measuring snapshot size.
- Docs: a "What's new" section in the CHANGELOG, README, ROADMAP (Phase 1 and Phase 2 done, Phase
  3 next) and `public/roadmap.json`. R (drop) is in the controls help.

Review findings:
- **Determinism:** there's no `Math.random`, `Date.now` or `performance.now` in `src/sim` or
  `src/data`. Every draw goes through the seeded RNG.
- **localStorage keys:** all of them are `cafetycoon.*` (audio, history, records, roadmap.seen,
  room, room.host, room.peer, run, seat.*, settings, tab). They don't conflict.
- **Sync:** four local-link tabs stay within about 12 ticks (≈0.2 s at 60 Hz) of the host.
- **Perf** (4 baristas, a 120 s day, a whole week): `step()` takes p50 0.10 ms, p99 0.26 ms and at
  most 6.6 ms. Snapshots average 8.5 KB and peak at 11.3 KB of JSON. There are at most 6 customers
  on screen.
- **Bandwidth:** 20 Hz × 3 peers × about 8.5 KB comes to about 510–680 KB/s (4–5 Mbit/s) of host
  upload. That's fine on home broadband but heavy on a phone hotspot.

Decisions:
- **This box's Chrome has a managed policy** (`WebRtcIPHandling: disable_non_proxied_udp`). WebRTC
  gathers no ICE candidates, so real-network rooms can't connect here. I didn't override the
  policy. Instead I added the local link, which uses the same sim and messages with a different
  transport. Real-network play is left for the human game night.
- The multi-tab playtest caps animation frames in the harness, because software GL can't draw four
  Pixi canvases. That's a test-only change; the game itself is unchanged.

Deferred:
- Delta or binary snapshots, or a lower peer snapshot rate, to cut host upload. This is the first
  lever if game night shows lag.
- A real-network smoke test from a machine without the WebRTC policy.
- Phase 2's game night and the telemetry review carry over (see ROADMAP).

Playtests (built game, Playwright, `/workspace/overnight/b12/`):
- **Host + 3 peers** (4 tabs, `?link=local`, 60 s days, every tab mashing keys). Peers stayed 0–12
  ticks behind the host and there were no page errors. Four random key-mashers serve nobody, so
  the café missed rent after day 2. The missed-rent screen, the awards (all joke awards) and
  Records showed correctly on every tab (`week-4p/`).
- **Solo with 2 bots** (60 s days). A full week reached the week-end ceremony with no page errors.
  Days served/lost: 9/0, 10/4, 6/2, 6/4, 7/5, 2/14, 3/6. The bots served 43 between them. The
  harness didn't keep milk and cold brew stocked, so day 6 ran dry (`week-solo/`).
- **Bug found and fixed:** after the last day or a missed rent, the day's receipt ("On to the night
  shop") was stacked under the week-end screen. It now only shows when night follows.
- **Harness lesson:** every tab gets the closing receipt each night and has to dismiss it. In the
  first runs, the blocked clicks looked like hangs.
- **Layout:** 1280x800 and 1920x1080 (`layout/`) show no overflow. The title shows v2.0.0.
  - At 1920x1080 the right column leaves a gap between Floor and the Menu board. That's cosmetic
    and deferred.

## Hotfix 2.0.1 reflection (lighter network updates)

- **What shipped.** `src/net/delta.ts`: a structural JSON patch (`r` replace, `o` object keys and
  deletions, `a` array slots plus length) diffed against what the peers already hold, with floats
  rounded to 3 decimals on the wire. The host sends a keyframe on join, on a peer's `resync` and
  every 100 sends (5 s); everything else is a `snapd` delta. Protocol 11 → 12 (`seq` on `snap`,
  new `snapd` and `resync` actions); an old tab gets the usual "different version" message.
- **Numbers (scripts/perf4.ts, a 4-barista week, 20 Hz):** full snapshot avg 8,676 B → delta avg
  744 B (keyframes included), max single delta 3.9 KB. Host upload with 3 peers 4.16 → 0.36 Mbit/s.
  Diffing costs about 0.1 ms per send on the host. Days played identically (same served/lost).
- **Where the bytes were:** `players` (3 KB, mostly bot brain fields, changing every tick),
  `stations`, `customers` and `pass`. Static data (`days`, `crew`, `owned`, `menu`, forecast…) was
  about half of every snapshot and now goes only when it changes, which falls out of the diff for free.
- **What went well.** A generic diff instead of hand-picked fields means new state in Phase 3 is
  covered with no extra work. The end-to-end host → peer test drops a delta mid-day and checks the
  peer heals via `resync`.
- **What to watch.** A rewritten array is sent whole when that is smaller; bot `path`/`plan` arrays
  are the biggest remaining churn. If a bigger café pushes deltas up, strip bot brain fields
  (render never reads them) before diffing. Real-network P2P is still untested from this box.

## P3 Block 01 reflection (barista roles)

- **What shipped.** `src/sim/roles.ts`: Chef, Creator, Host and Manager, each a perk paired with a
  weakness, as plain multipliers in one table (machine time, walk speed, tips, a flat craft bonus,
  restock cost). A `role` input is night-only and one-holder-per-role, so two baristas can't race
  for the same role. The four roles hook into existing code paths (stations, movement, customers,
  night restock), so they need no new state beyond `Player.role`. Save v10 (no-op migration),
  protocol v13.
- **Checks.** Six new tests (pick/swap/drop, day lock and validation, machine time, tips and craft,
  Manager discount, walk speed): 529 tests in total. A 3-tab local-link run picked three roles
  from the night screen; the night sync check (now including roles) said `same` on every tab.
- **What went well.** The perks are visible numbers, which leaves the strategy decision to the
  players. A Host on the register and a Chef on the machines is an obvious plan, but the Chef's
  tip penalty punishes a Chef who also runs the pass.
- **What to watch / deferred.**
  - Bots never take roles; when bots become hired staff (B15) they could come with one.
  - The role list makes the night's left column longer. At 1280x800 it scrolls under Restock.
    A compact two-column grid would fit better once pricing (B2) adds more to that column.
  - The balance numbers are first guesses. A playtest should show whether the Creator's
    +$0.75 beats the Host's +50% tips at higher prices.
