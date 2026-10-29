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
