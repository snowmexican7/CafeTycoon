# CafeTycoon: design and roadmap

**Date:** 2026-10-28
**Status:** draft for team approval. Nothing is built yet.
**Supersedes:** `docs/reference/original-build-prompt.md` (kept for its detailed numbers).

---

## 1. What this is and why

CafeTycoon is a browser game for three or four friends who live in different places and
want something to play together one evening a week. It is a hobby project. It is not for
sale, not for the public, and it may stop after a few weeks, so everything about it is
sized to be cheap to start and cheap to abandon.

The game has two halves that take turns. **The day** is a frantic Overcooked-style co-op
scramble: customers queue, patience bars drain, and the players physically run drinks
between stations. **The night** is a timed tycoon draft: the game deals a random hand of
things you could buy for the café, and the group has a minute to argue and spend the
day's takings before the doors open again.

The reason the night is a *draft* and not a shop is the design goal that matters most:
**no two runs should play the same.** A fixed shop produces a solved build order. A dealt
hand from a large pool means every week forces different decisions, and the group has to
figure things out on the fly.

## 2. Goals, non-goals, anti-goals

**Goals**
- Four remote friends can be playing together within a minute of opening a link.
- The day is genuinely frantic and funny with two to four people.
- Runs differ: a large catalogue, a small hand each night, random scenarios and (later) events.
- Each run takes about 30 minutes, so two or three fit a game night.
- Everything that happens in a session can later be recorded for a design-analysis agent
  to read, so the game improves wave by wave.
- The game logic is plain, deterministic, testable code that humans and coding agents can
  both work on.

**Non-goals**
- Public release, accounts, matchmaking, leaderboards, monetisation, anti-cheat, mobile.
- Hand-authored levels. Variety comes from data and randomness, not level design.
- Pixel-perfect art. Readable shapes and simple sprites are the brief.

**Anti-goals** (the game has failed even if it technically works)
- A dominant strategy: "get $X, buy Y and Z, done."
- A game night that depends on one person's PC running a server, or on anyone's home
  network being configured a certain way.
- More than two online accounts across the whole roadmap, and anything that costs money
  before phase three.
- Any AI feature that can stall or break gameplay when a model is slow or wrong.

## 3. Constraints

- **Team:** the owner (snowmexican7 on GitHub), three or four friends, and AI coding agents.
  Everyone is remote. Skill levels vary, so the repo must be easy to clone and run.
- **Time:** weeks, not months. Phase one is the only phase planned in detail.
- **Accounts:** GitHub (exists) and one free Cloudflare account. Nothing else unless phase
  three proves the free models aren't good enough.
- **Hosting:** the client is a static site on GitHub Pages at
  `https://snowmexican7.github.io/CafeTycoon/`. The repo is public, so no secrets and no
  assets the team can't share.
- **Platform:** desktop browsers (current Chrome, Firefox, Safari, Edge). Keyboard controls.
- **Budget:** $0 through phase two. Phase three AI should stay under a few dollars a month.

## 4. Prior art the team has in mind

- **Overcooked** for the day: shared kitchen, carrying one thing at a time, stations that
  take time, orders with patience, chaos as the fun.
- **Roguelike item pools** (Slay the Spire, Hades, The Binding of Isaac) for the night: a
  big pool, a small random offer, synergies you discover, runs that are different every time.
- **Tycoon games** for the fantasy: a tiny stand growing into a real café, rent, reputation,
  ads, the morning paper.

## 5. The run

A run is **one café week: seven days.** Every run starts from the same empty cold brew
stand with the same cash, but a fresh random seed, so the hands, customers, and scenario
differ. Nothing carries over between runs except a line in the run history.

| Phase | Length (default) | Notes |
|---|---|---|
| Lobby | until host starts | Room code, display names, optional seed |
| Night | 60 s | Timed. Dealt hand, restock, Ready-up. Opens at 0 or when all are Ready |
| Day | 150 s | Timed. Customers arrive, players make and serve drinks |
| Closing | ~10 s | Grace period for the queue, then the day summary |
| Week end | until choice | After day seven's closing. Score screen: see score and stop, or keep going |

**The week runs night-first:** night 1, day 1, night 2, day 2, and so on through day 7,
whose closing summary leads straight to the score screen. That is seven hands per scored
week, and the first night is where the scenario is announced and the starting $100 gets
spent. The stand opens with a small starting stock (my guess: 20 beans, 10 milk, 15
concentrate) so the first hand doesn't have to be all restock. Seven cycles at roughly 3.7
minutes each comes to about 26 minutes, plus lobby and score, for the 30-minute target. If
cash goes negative when rent is paid at a closing, the run ends there: the score screen
shows the days completed and a negative profit. (Night-first, the starting stock, and early
bankruptcy are my calls.) Day and night lengths are host settings; the defaults are the
target to tune towards.

**Keep going (unlimited mode).** After day seven the group may continue into open-ended
weeks. Each new week multiplies rent by 1.25, traffic by 1.15, and patience by 0.95. The
run ends when the café can't pay rent. The score screen then shows weeks survived plus
profit. Unlimited mode is the same loop with a difficulty ramp, so it costs almost nothing
to build. (Numbers are my starting guess; tune them.)

**Score.** Net profit over the scored week: cash at the end of day seven minus starting
cash. Customers served and stars are shown alongside but don't feed the number. Simple to
understand, easy to compare between weeks. (My call; change it if profit alone feels wrong.)

## 6. The day

Top-down view of a small café. One to four baristas, each a coloured figure. Stations
along the walls, a counter at the front, customers queueing outside it.

**Stations (phase one set, from the original prompt)**

| Station | Takes | Gives | Base time | Consumes |
|---|---|---|---|---|
| Grinder | empty hands | Grounds | 2.5 s | 1 beans |
| Espresso machine | Grounds | Espresso | 5 s | nothing |
| Milk steamer | Espresso | Latte | 3.5 s | 1 milk |
| Cold brew tap | empty hands | Cold Brew | 1.5 s | 1 concentrate |
| Counter | a drink | money + tip | instant | nothing |
| Trash | anything held | nothing | instant | nothing |

Starting menu: Espresso $3.00, Latte $4.75, Cold Brew $4.00.

**Rules**
- A barista holds one item at a time.
- Stations keep working after you walk away; the finished item waits on the station.
- A drink handed over at the counter goes to the most impatient customer who ordered it.
  Nobody ordered it: it goes back in your hands (or, my call, you can trash it).
- Tips scale with the customer's remaining patience, up to 35% of the price.
- A customer whose patience hits zero storms out, which hurts reputation.
- When a supply hits zero, that drink leaves the menu until it's restocked at night.
- Controls: WASD or arrow keys to move, E or Space to use a station, Esc for pause/settings.

**Customers.** Arrival rate is driven by the day number, reputation, the scenario, active
ads, and the pace setting. Each customer orders one drink, weighted by the scenario and
active items. Patience is roughly 25 s at normal pace. The visible queue holds about six.

**Economy.** Start with $100 and 2.5 stars. Rent is $25 per day, paid at closing.
Reputation moves up when about 70% or more of customers are served and down otherwise,
and it scales the next day's traffic. The original prompt's numbers are the starting
point; the gate for phase one is that a seven-day run with three people is fun, so expect
to retune everything.

**Pace setting.** A 1–5 slider (Chill to Chaos) scaling arrival rate and patience, host
controlled, changeable mid-day. It's the knob that makes two players and four players both
work.

## 7. The night

The night is a single screen with a 60-second clock. Everyone sees the same thing.

- **Takings** from the day just finished, and current cash.
- **Restock**: packs of beans, milk, and concentrate, always available, fixed prices. Not
  part of the hand.
- **Tonight's hand**: five items dealt from the catalogue (section 8). Each shows name,
  cost, effect in plain words, and a line of flavour text. Buy it or don't; it's gone
  tomorrow. Buying is first come, first served against shared cash, and any player can buy
  (my call: it's chaotic and fun under a timer; if the logs show accidental double-spends,
  phase two adds a two-tap confirm).
- **Ready** button. The shop opens when everyone is Ready or the clock hits zero.

A **morning note** at the start of the next day says what's active: "Flyers are up (+10%
customers, more cold brew)", "Rainy week: everyone's grumpy."

## 8. The catalogue: items as data

Everything you can buy is a record in a data file, not code. The simulation reads the
records and applies their effects; adding an item means adding a record. This is the main
lever for replayability and the easiest place for friends and agents to contribute.

```ts
type CatalogueItem = {
  id: string;
  name: string;
  category: 'equipment' | 'pos' | 'seating' | 'decor' | 'marketing' | 'staff' | 'oddball';
  cost: number;
  rarity: 'common' | 'uncommon' | 'rare';
  duration: 'permanent' | 'tomorrow';     // ads last one day
  effects: Effect[];
  requires?: string[];                     // item ids that must be owned
  excludes?: string[];                     // can't coexist (e.g. two espresso machines)
  flavor: string;
};

type Effect =
  | { kind: 'stationSpeed'; station: StationId; mul: number }
  | { kind: 'moveSpeed'; mul: number }
  | { kind: 'price'; drink?: DrinkId; mul: number }
  | { kind: 'traffic'; mul: number }
  | { kind: 'patience'; mul: number }
  | { kind: 'tipRate'; add: number }
  | { kind: 'orderBias'; drink: DrinkId; mul: number }
  | { kind: 'supplyCost'; supply: SupplyId; mul: number }
  | { kind: 'gamble'; chance: number; win: Effect[]; lose: Effect[] };
```

**Dealing a hand.** Five items per night, drawn by the run's seeded random number
generator, weighted by rarity (common 60%, uncommon 30%, rare 10%, my starting guess).
Never deal a permanent item already owned, never deal something whose `requires` aren't met
or whose `excludes` are owned, and guarantee at least one item costing under $30 so a
broke team always has a choice.

**Phase one starter pool** (about fifteen; builder tunes costs and numbers; the first
twelve come from the original prompt):

1. Dual-boiler espresso machine (equipment, espresso +30% speed)
2. "La Mazzocca Pro" espresso machine (rare, +55%, requires the dual-boiler)
3. Flat-burr grinder (grinder +40%)
4. Auto-steam pitcher (steamer +40%)
5. Branded cups (all prices +8%)
6. Non-slip shoes (move speed +15%)
7. Digital kiosk (pos: patience +15%, tips +5%)
8. "Squarely" tap terminal (pos, rare: patience +25%, tips +20%, excludes kiosk)
9. Chirper thread (marketing, free, tomorrow: traffic +8%)
10. Campus corkboard flyers (tomorrow: traffic +10%, cold brew orders ×1.5)
11. The Daily Grind ad (tomorrow: traffic +15%, patience +10%, espresso orders ×1.5)
12. InstaGlam latte-art story (tomorrow: traffic +40%, latte orders ×2)
13. Second cold brew tap (equipment: adds a station)
14. Bulk bean deal (supplyCost beans ×0.6)
15. Mystery roaster sample (oddball gamble: 50% all prices +15% for the week, 50% patience −10%)
16. Street sign (decor, cheap: traffic +5%)

Phase two grows this to forty or more, with seating, decor, staff perks, and more gambles.
Parody brand names only, never real ones.

## 9. Scenarios and events

A **scenario** is a run-wide twist rolled at the start and announced on day one. It's a
few lines of data, like an item whose effects last the whole run. Phase one ships four:

- Normal week (no twist)
- Campus town: traffic +10%, cold brew orders ×1.5
- Rainy week: patience −15%, latte orders ×1.5
- Tourist season: traffic +25%, patience −10%, tips +10%

**Day events** (a rush at 11, a machine breaking, a health inspector, an influencer at the
door) are phase two. They give the night hand something to respond to.

**Shared seeds.** The run's seed is shown in the lobby and on the score screen, and the
lobby has an optional seed field. Two groups entering the same seed play the identical
week. It's a weekly-challenge mode for the cost of a text box, so it's in phase one.

## 10. Multiplayer

Everyone is remote, so something must connect the browsers. The design keeps all game
logic in the browsers and uses the smallest possible thing in the middle.

**Roles.** The player who creates the room is the **host**. The host's browser runs the
authoritative simulation. Every other browser is a **peer** that sends inputs and renders
what the host says is true. Solo play is the host alone, same code path.

**Where the host's simulation runs.** In a **Web Worker**, not on the page's main thread.
Browsers throttle a background tab's timers to about once a second, and the host will
alt-tab to voice chat; in a Worker the day keeps running. The host's own renderer consumes
snapshots from the Worker exactly as a peer consumes them from the network, so there is one
rendering path. (My call; cheap on day one, painful to retrofit later.)

**Relay.** A Cloudflare Worker with one Durable Object per room. It knows nothing about the
game. A peer's message goes to the host; a host's message goes to every peer. Room codes
are five letters. When the host disconnects, the relay tells everyone to wait, and closes
the room only if the host hasn't returned within two minutes (see "Joining and dropping").
The relay is the only backend, and it is the thing that later grows into the log sink
(phase two) and the AI gateway (phase three).

**Traffic.**
- Peers send input (movement vector, interact press) when it changes, capped at 20 a second.
- The host steps the simulation at a fixed 60 Hz and broadcasts a full state snapshot at
  20 Hz. State is small (a handful of baristas, stations, and customers), so plain JSON is
  fine for phase one; measure before optimising.
- Peers render by interpolating between the last two snapshots with about a 100 ms buffer.
- **No client-side prediction in phase one.** A peer's own barista moves when the host
  says so, so a peer feels their own latency. For friends on home broadband this is
  typically 50–150 ms. The design accepts this for phase one and lists prediction as the
  first phase-two item if it feels bad. (My call, to keep phase one small.)

**Free-tier budget.** Cloudflare counts a WebSocket message into a Durable Object as
1/20th of a request and outgoing messages as free. Three peers sending at most 20 inputs a
second plus the host sending 20 snapshots a second is about 80 incoming messages a second,
or roughly 7,000 requests over a 30-minute run against a daily allowance of 100,000. Active
time is about 225 GB-seconds per run against 13,000 a day. Three runs a night fits with room
to spare, provided the relay uses the WebSocket Hibernation API so idle rooms cost nothing.

**Joining and dropping.** A player may join at any time; a new barista appears at the door.
Late joiners get the full state on arrival. Every player has a **player token**, a random id
the browser keeps in `localStorage`, so a player is a token rather than a connection:

- A **peer drops** (tab closed, network blip): the relay tells the host, the barista freezes
  in place still holding whatever it held, and if the same token comes back within the run
  it gets that barista back. The host may remove a frozen barista from the pause menu.
- The **host drops**: the room goes into a "waiting for host" state for two minutes. Peers
  see that message; the simulation is paused. If the host's token reconnects in time (a
  refresh, say), it reclaims the room, restores the run from its own snapshot (section 11),
  resends full state, and play continues. After two minutes the relay closes the room and
  tells everyone.

(My call. It makes "a refresh mid-run resumes" true for everyone, not just the host, at the
cost of the relay tracking tokens and a two-minute timer.)

**Night in co-op.** Shared cash, anyone can buy, Ready-up as in section 7.

**Why not peer-to-peer with no relay?** Direct browser-to-browser connections fail for a
meaningful share of home networks and there's no fix without a server anyway. The relay
costs one free account and makes "it just connects" true.

**Why not a server-run simulation?** It would mean running the game loop inside the
Worker, which fights the free plan's CPU limits and moves game code out of the browser
where it's easiest to test and debug. Host-authoritative is enough for friends.

## 11. Persistence and saves

- **Nothing carries over between runs.** No campaign save, no save-format migrations.
- **Snapshot for crash protection.** The host's browser writes the full game state to
  `localStorage` at every phase boundary (and every ~10 s during the day). Reopening the
  page within two minutes offers to resume the run and reclaim the room under the same code
  (section 10).
- **Run history.** After each run, the host's browser appends one record: date, player
  names, seed, scenario, days completed, score, items bought. Shown on the title screen.
  Phase two moves this into the relay's storage so any host sees the same history.
- Settings (pace, day length, display name) live in each player's `localStorage`.

## 12. Determinism and randomness

The simulation is a set of pure functions over a plain state object, stepped at a fixed
1/60 s. All randomness goes through one seeded generator held in the state. Rendering never
touches the state or the generator. Consequences:

- Seed + inputs = a complete replay. This is what makes phase-two telemetry cheap.
- Unit tests can run thousands of days in milliseconds and assert on outcomes.
- Shared seeds give identical weeks.

## 13. Telemetry (phase two, designed now so phase one doesn't block it)

The owner wants to see what players actually do, so a design-analysis agent can review
each wave and suggest changes. Phase one does not record anything, but it must not make
recording hard later, which the determinism above guarantees.

**What gets recorded (phase two)**
- From the host: seed, scenario, every input from every player, and a state snapshot at
  each phase boundary. This is the replay.
- From each browser: UI events the simulation can't see. Night-screen items hovered or
  opened but not bought. Button mashing (four or more presses of the same key within a
  second with no state change). Long frames over 250 ms. Disconnects and reconnects.
  Pitched-idea text once that feature exists.
- A generated end-of-run summary: served vs lost customers per day, money per drink,
  items offered vs bought, idle time per player, frustration counts per player.

**Where it goes.** Each browser batches events and sends them to the relay, which appends
them to the room's storage. At run end the host triggers a flush. A small authenticated
endpoint lets the owner download a wave's logs as newline-delimited JSON for the analysis
agent. Friends-only, so there's no consent flow beyond a line in the README.

## 14. AI (phase three, principles fixed now)

The end goal includes AI: varied customer chatter, a game master that turns a typed idea
into a bounded rule, maybe AI teammates. The original prompt's hard rules stand:

1. **AI never blocks gameplay.** Scripted behaviour exists first; model output replaces it
   only when it arrives in time and passes validation.
2. **Pre-generate at night**, read from a pool by day.
3. **Validate and clamp everything** before it touches state. The pitch-an-idea limits in
   the original prompt (section 8 there) are the template.
4. **Keys stay in the Worker.** The browser never holds a model key.
5. **Budget caps** enforced in the Worker, with a spend readout in settings.

**Account plan.** Phase three starts on Cloudflare's own built-in models (Workers AI), which the
existing account already includes at 10,000 free "neurons" a day across a range of current
open models, so no new account is needed to find out
whether AI makes the game better. Only if those models are too weak for dialogue and
judging does the team add one aggregator account that fronts every vendor at once. The
specific model names and prices in the original prompt are unverified and should be
treated as nothing more than a hint of what to look at.

**Pitch an idea** itself does not need AI: phase two ships it with a keyword judge so the
mechanic exists and the team can feel it before any model is involved.

## 15. Technical design

**Language and tools:** TypeScript throughout. Vite builds the client. Vitest tests the
simulation. A single npm package, not a workspace monorepo: fewer moving parts for a team
of friends, and the Worker is one folder with its own small config. `npm`, not `pnpm`, so
nobody has to install a second tool. Versions were checked on 2026-10-28 (see
`docs/reference/2026-10-28-stack-research.md`): PixiJS 8 (8.22), Vite 8, Vitest 5, Node 24
LTS (Vitest 5 needs Node 22.12 or newer), wrangler 4. Pin exact patch versions at scaffolding
time.

**Rendering:** PixiJS 8 rather than a full game engine. The brief is shapes
and simple sprites over a simulation we write ourselves, so a renderer is enough and keeps
the bundle small and the code explicit. Menus, the lobby, the night screen, and the score
screen are ordinary HTML and CSS layered over the canvas, which is faster to build and
easier to log than canvas-drawn UI. (My call. Phaser 4 is stable as of April 2026, currently 4.2.1, and is the alternative if the
team wants scenes, tweens, and audio batteries included; Phaser 3 is frozen at 3.90.)

**Repo layout**

```
src/
  sim/        pure game logic: state, step(), catalogue, scenarios, rng, scoring. No DOM.
  net/        relay client, host and peer roles, message types, snapshot interpolation
  render/     PixiJS scene, sprites, HUD, input capture
  ui/         HTML overlays: title, lobby, night screen, closing summary, score, settings
  main.ts
worker/       Cloudflare Worker + Durable Object relay (own tsconfig and wrangler config)
data/         catalogue.json, scenarios.json (or .ts modules with the same shape)
docs/
.github/workflows/   ci.yml (test + build), pages.yml (deploy client), worker.yml (deploy relay)
```

**The simulation contract.** `step(state, inputs, dt) -> state` with no side effects, plus
small pure helpers (`dealHand`, `applyEffects`, `scoreWeek`). Everything in `src/sim` is
unit tested; nothing in it imports from `render`, `ui`, `net`, or the DOM.

**The relay contract.** WebSocket messages `{ t: 'join' | 'input' | 'snapshot' | 'event' |
'peerLeft' | 'hostAway' | 'hostBack' | 'closed', ... }`, each carrying the sender's player token.
The Durable Object forwards game messages without parsing them; the only state it keeps is
the room's host token, the connected tokens, and a two-minute timer that starts when the
host disconnects. Rooms close when that timer runs out or the host ends the run.

**Testing.** Phase one: Vitest for `src/sim` (dealing rules, station timing, patience and
tips, economy, scoring, determinism given a seed) and for the relay's forwarding logic. A
written manual checklist for the multiplayer smoke test (two browser tabs plus one friend).
Playwright headless runs and screenshots are phase two.

**Deploy.**
- GitHub Pages switches from "deploy from branch" to a GitHub Actions workflow that runs
  the Vite build with base path `/CafeTycoon/` and publishes `dist/`. Current action majors:
  checkout v7, setup-node v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5.
- The Worker deploys from a second workflow using `cloudflare/wrangler-action@v4` (4.1.3 or
  newer; 4.1.0 and 4.1.1 are broken), with the Cloudflare API token and account id stored as
  GitHub repository secrets. The owner creates the token once in the Cloudflare dashboard from
  the "Edit Cloudflare Workers" template scoped to the one account; Durable Object bindings
  need no extra permission.
- The client reads the relay URL from a build-time constant.

## 16. Accounts and services across the whole roadmap

| Account | Needed from | Used for | Cost | Replaced later? |
|---|---|---|---|---|
| GitHub (exists) | now | code, CI, Pages hosting of the client, secrets for deploy | $0 | no |
| Cloudflare | phase 1 | Worker + Durable Object relay; phase 2 log and history storage; phase 3 built-in AI models and the AI gateway | $0 free plan (whether sign-up asks for a card is unconfirmed; check when creating it) | no |
| AI aggregator (e.g. OpenRouter) | phase 3, **only if** Cloudflare's built-in models disappoint | stronger dialogue and judging models | a few $/month | no |

Two accounts, possibly ever. Nothing in the plan is set up and then thrown away.

## 17. Roadmap

Phases, not dates. Each phase ends with a game night and, from phase two on, a log review
by the analysis agent. "Wave" in the owner's words equals one phase's game-night-and-review.

**Phase 1: bare bones, playable, online.** The thing in this document's sections 5–12 with
the starter pool and four scenarios. Done when four friends in four homes finish a seven-day
run to the score screen without a crash, a refresh mid-run resumes, the simulation tests pass
in CI, and both deploys happen automatically on push.

**Phase 2: tycoon depth and telemetry.**
- Catalogue to 40+ items; seating, decor, staff perks, gambles; synergies that reward
  noticing.
- Day events (rush, breakdown, inspector, influencer).
- Pitch an idea, with the keyword judge and the clamp from the original prompt.
- Telemetry per section 13, the download endpoint, and the first analysis-agent review.
- Run history in the relay's storage.
- Client-side prediction if phase-one logs or complaints say input lag hurts.
- Playwright smoke run and screenshots in CI.
- First pass of juice: sound effects, a little screen shake, a combo-tip indicator.

**Phase 3: AI.**
- Customer chatter pre-generated at night from Cloudflare's built-in models.
- AI pitch judge with the scripted fallback.
- AI-authored catalogue items and scenarios, generated offline and reviewed by a human
  before they enter the data files.
- Optional AI teammates for one- and two-player sessions.
- Budget caps and the spend readout. Add an aggregator account only if needed.

**Phase 4: bigger games.**
- 2v2: two cafés on one street sharing a customer pool, match settings, results screen.
- Growth path (stand to café) and a night-time layout editor.
- Longer run formats for when the team wants an evening-long game.
- Meta-unlocks across runs, if the team still wants them after living with fresh runs.
- The franchise outline from the original prompt, if the game is still alive.

## 18. Phase one scope, precisely

**In**
- Title screen with run history; lobby with room code, display names, optional seed, pace
  and day-length settings (host only).
- Day phase: the six stations, three drinks, three supplies, customers with patience, tips,
  reputation, rent, the morning note.
- Night phase: 60 s timer, takings, restock, five-item hand from the ~16-item pool,
  Ready-up.
- Four scenarios.
- Seven-day week, score screen, keep-going with the ramp.
- Host-authoritative co-op for 1–4 via the Cloudflare relay, with the simulation in a Web
  Worker on the host; late join; player tokens; peer reconnection; host refresh resume within
  two minutes.
- Vitest coverage of `src/sim`; CI; Pages and Worker deploys from Actions; README with
  how to play, host, and develop.

**Out** (all later phases)
- Telemetry and logs. Day events. Pitch an idea. AI of any kind. Client prediction. Sound.
  2v2. Layout changes. Any persistence across runs beyond the history line.

## 19. Calls I made that the team should feel free to reverse

1. PixiJS plus HTML overlays, not Phaser.
2. One npm package, not a pnpm monorepo.
3. Night is timed at 60 s; any player can buy directly from shared cash.
4. No client-side prediction in phase one.
5. Seven-day week, score equals net profit, unlimited-mode ramp of ×1.25 rent / ×1.15
   traffic / ×0.95 patience per week.
6. Hand of five; rarity weights 60/30/10; one guaranteed cheap item.
7. Sixteen-item starter pool and four scenarios as listed.
8. Late join allowed any time. Host disconnect ends the session.
9. Snapshot and run history in the host's `localStorage` for phase one.
10. Seed field in the lobby in phase one.
11. Telemetry, Playwright, and sound deferred to phase two.
12. The week runs night-first (seven hands); the stand starts with a small stock; a run ends
    early if rent can't be paid.
13. Players are tokens, not connections: a dropped peer's barista freezes and can be
    reclaimed; a dropped host has two minutes to come back before the room closes.
14. On the host, the simulation runs in a Web Worker so an alt-tabbed host doesn't freeze
    the game for everyone.

## 20. Left to the builder

- Exact balance numbers everywhere above; the phase-one gate is "fun for a week with three
  people," not any specific figure.
- Café layout and station placement, collision model, sprite style within "shapes and
  simple sprites," HUD layout.
- Snapshot format, interpolation details, relay message framing, room-code generation,
  reconnection handling details.
- Test organisation and the manual multiplayer checklist.
- Exact patch versions to pin at scaffolding time.

## 21. Verified facts behind this document

Checked against current documentation on 2026-10-28 and recorded with sources in
`docs/reference/2026-10-28-stack-research.md`: PixiJS, Phaser, Vite, Vitest, and Node
versions; Cloudflare Workers free-plan limits; Durable Objects on the free plan (SQLite-backed,
WebSockets with hibernation, request and duration allowances); Workers AI free allocation;
GitHub Actions versions for Pages; wrangler and the wrangler action; the API token template.
Two things could not be confirmed from an official source: whether Cloudflare asks for a card
at sign-up, and the exact minimum token permissions (the template is the safe answer).
