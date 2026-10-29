# CafeTycoon

A small café game built for fun by a few friends, played together in the browser.
By day it's a frantic Overcooked-style scramble; by night it's a timed draft of
random upgrades, so no two runs play the same.

**Play:** https://snowmexican7.github.io/CafeTycoon/

## How to play

A run is one café week: seven days. Each **night** you have 60 seconds to spend the
day's takings on a hand of five random items and to restock beans, milk, and cold brew
concentrate, then press **Open the shop**. Each **day** customers queue at the counter
with patience bars. Grind beans, pull espresso, steam lattes, pour cold brew, and hand
drinks over before they storm out. At the end of day seven you see your score, and can
keep going into harder weeks until the café can't make rent.

- **Move:** WASD or the arrow keys
- **Use a station:** E or Space (stand next to it)
- **Drop:** R (into a machine, onto the pass, in the bin, or on the floor; puts the mop back)
- **Drink an espresso:** Q at the machine or with a shot in hand (a speed boost; the sixth shot of a day sends you to hospital)
- **Close early:** hold C (or hold the Close early button by the clock) for a second. In co-op everyone has to vote; tap again to take your vote back
- **Mute:** M
- **Pause and settings:** Esc
- The seed shown in the HUD replays the same week: enter it on the title screen.
- **The pass:** the little shelf on the counter. Press E with a drink nobody wants and it sits
  there (up to three). Press E with empty hands to serve a waiting customer from the shelf, or
  to pick up the oldest drink. Espresso goes stale after 45 seconds, latte after 60, cold brew
  lasts the day. Binned and stale drinks count as waste, and at four the health inspector
  fines you.
- **Bots:** a solo run gets two bot coworkers, two humans get one, three or more get none. A
  friend who joins mid-week replaces a bot the next morning. Bots take a moment to react,
  sometimes botch a drink and remake it, and step around you.
- **Day events** (from day 2): rush hour, power flicker, health inspector, influencer visit.
- **Messes and the mop:** grounds piles spread when walked through and spills can make you slip.
  A dirty café makes customers less patient and can fail the health inspection. The mop lives in
  the corner: E picks it up, E next to a mess cleans it, R puts it back. Bots mop when it's quiet.
- **The rogue customer** (from day 2): now and then a customer handed a drink gets upset. Remake
  it within 15 seconds or they walk behind the counter and make it themselves, without paying.
- **Customers:** impatient tippers, groups ordering two or three drinks, and three named
  regulars who come back.
- **Night menu:** the menu board at night lists each drink with its recipe and an On/Off switch.
  New drinks (iced latte, mocha, matcha, maple cold foam) join through the week or from cards.
- **Night cards:** 52 cards on three paths (⚡ Speed, ★ Quality, 📣 Reach). Two cards of a set
  give a pair bonus and three give a full-set bonus. 🌶 spicy cards come with a catch. 🎲 Re-roll
  the hand for $5, then $10, and so on; the price resets each night.
- **Forecasts and challenges:** each night *The Daily Grind* forecasts tomorrow, with its crowd,
  hot-vs-iced split and likely event. Each morning deals one or two optional daily challenges for
  a tip.
- **Score:** profit since the start of the week, plus permanent upgrades ("fittings") at half
  what you paid. The week ends with an awards ceremony. Your best weeks and lifetime totals are
  under 🏆 Records on the title screen, kept in this browser.
- **Telemetry:** the host's browser records the run and nothing is uploaded. In the browser
  console, `cafetycoon.telemetry.download()` saves an `.ndjson` file and
  `cafetycoon.telemetry.rows()` shows the rows.

## Playing together

One of you presses **Host a co-op run** and reads out the five-letter room code. The others
type it under **Join a room**. The host presses **Start the run** once everyone is in; friends
can still join later. The host's browser runs the game, so the host keeps that tab open. If
anyone refreshes, the title screen offers **Rejoin room** or **Resume run** and the game
carries on. Keep playing in the same tab: a new tab is a new barista. Connections are direct
browser-to-browser with no server; a few home or campus
networks block that, in which case a phone hotspot on the affected side usually works.

## Working on it

You need Node 24 (22.12 or newer works) and npm.

```bash
npm install
npm run dev      # local game at http://localhost:5173/CafeTycoon/
npm test         # simulation tests
npm run build    # type-check and build into dist/
npm run balance -- --weeks 10   # headless balance tester
```

Balance tester options: `--seed`, `--humans`, `--bots`, `--skill`, `--pace`, `--scenario`,
`--menu`, `--compare menus`, `--policy smart|simple|speed|quality|reach|none`,
`--compare policies`, `--summary`, `--day`, `--json`. To capture JSON without npm's banner line, run
`npx tsx scripts/balance.ts … --json` directly.

- Everyone commits to `main` and pulls before pushing. Pushing to `main` runs the tests,
  builds, and republishes the site through GitHub Actions and GitHub Pages.
- Game rules live in `src/sim` as pure functions over one plain state object, stepped at
  60 Hz with a seeded random number generator. Nothing in `src/sim` touches the DOM.
- Items and scenarios are data in `src/data`. Adding an item means adding a record.
- The simulation runs in a Web Worker (`src/host`); the page renders snapshots with
  PixiJS (`src/render`) and plain HTML overlays (`src/ui`).
- **Local multi-tab rooms:** add `?link=local` to the URL (for example
  `http://localhost:5173/CafeTycoon/?link=local`) and tabs of one browser host and join each
  other over `BroadcastChannel` instead of WebRTC. It's for testing on one machine, including
  automated browser tests where WebRTC is blocked. Real rooms never use it.
- **Version:** `package.json` is the source of truth. It's baked into the build, shown on the
  title screen under "Past runs & controls", and exposed as `window.cafetycoon.version`.
- Co-op is peer-to-peer. `src/net/roomLink.ts` is the only file that touches the networking
  library; the host bridge and the peer transport are unit-tested against a fake room.
- Never commit secrets or assets we don't have the right to share. The repo and the game
  are public.

## Where things are

- **Changelog and version numbers:** [`CHANGELOG.md`](CHANGELOG.md)
- **Roadmap:** [`docs/ROADMAP.md`](docs/ROADMAP.md)
- **UI overhaul plan:** [`docs/UI_OVERHAUL.md`](docs/UI_OVERHAUL.md)
- **Backlog, known limitations, decisions:** [`docs/BACKLOG.md`](docs/BACKLOG.md)
- **Design:** [`docs/superpowers/specs/2026-10-28-cafetycoon-design.md`](docs/superpowers/specs/2026-10-28-cafetycoon-design.md)
- **Phase 1a plan:** [`docs/superpowers/plans/2026-10-28-phase-1a-solo-cafe.md`](docs/superpowers/plans/2026-10-28-phase-1a-solo-cafe.md)
- **Playtest checklist:** [`docs/playtest-checklist.md`](docs/playtest-checklist.md)
- **Co-op playtest checklist:** [`docs/playtest-checklist-coop.md`](docs/playtest-checklist-coop.md)
- **Reference:** [`docs/reference/`](docs/reference/) holds the original build prompt and
  the stack research with verified versions and free-tier limits.
