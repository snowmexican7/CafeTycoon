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
