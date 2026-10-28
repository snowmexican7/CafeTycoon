# Original build prompt (reference only)

> **Status:** superseded by the design document in `docs/superpowers/specs/`.
> This is the prompt an agent wrote after the team's first planning session, pasted
> here verbatim on 2026-10-28 so its detailed numbers (stations, drinks, prices,
> upgrade lists, ad effects) stay available. Nothing in it is decided. In particular,
> the hosting plan (private repo, Cloudflare Pages, a Node/Colyseus server on the
> host's PC), the untimed night, the persistent campaign, and the specific AI model
> names and prices were all changed or are unverified. Where this file and the design
> document disagree, the design document wins.

---

# Build Prompt: "Coffee Tycoon" (working title)

You are the lead engineer and game designer for a small, private, browser-based co-op game made for a group of friends. Plan it first, then build it from scratch in small milestones. Every milestone must end in a working, tested, playable state before you start the next one.

---

## 0. How to work (read this first)

- **Plan before code.** Write `docs/PLAN.md` first: milestones, the file and package layout, the core data types, and a test plan. Stop there and wait for my approval before writing game code.
- **One milestone at a time.** Every milestone ends with green `pnpm install && pnpm build && pnpm test`, plus a short headless smoke run (Playwright) that plays the game and saves screenshots to `screenshots/`. Commit at the end of each milestone, using a clear message.
- **Don't rewrite working systems.** Extend them instead. If you have to restructure something, say why in the commit message and keep the tests passing.
- **The game rules are pure code.** All game logic goes in a `shared` package of pure TypeScript functions over plain data, with no DOM, no Node APIs, and seeded randomness. The rendering layer never changes game state. The same simulation has to run in the browser for solo play and on the server for co-op.
- **Verify, don't assume.** Before using a library version, an API, or an AI model id, check current docs (today is late October 2026). Pin versions that actually install. If something in this prompt turns out to be wrong, tell me and pick the closest correct option.
- **Keep it readable.** Three humans and several AI agents will be working in this code. Use small files, clear names, and short doc comments on public functions. Keep the README current with how to run, test, and deploy.

---

## 1. The game in one paragraph

A fast, chaotic, Overcooked-style co-op café game with a tycoon layer. **At night** (untimed) you run the business: buy equipment and POS upgrades, book ads on parody social platforms, order supplies, change the layout, and pitch creative ideas. **When morning comes, everything locks**, just like real life: no upgrades and no supply orders. **During the day** (timed) the players physically make and serve drinks at stations as customers queue up, lose patience, tip, or storm out. The game starts as a tiny cold brew stand and grows into a full local café. Phase 2 grows into managing campus and franchise locations. The first product is coffee.

## 2. Audience and scope

- **Private and friends-only.** One person hosts and the others join in a browser using a room code or link. There are no public lobbies, matchmaking, accounts, leaderboards, monetization, or anti-cheat. Don't build for those; they are out of scope.
- The team is the owner, his brother, and AI coding agents. It's a fun side project.
- **Budget:** under $20/month in total for hosting and AI. Expect about one game night a week, and $5–10 per game night is fine.
- **Graphics:** simple 2.5D (top-down or three-quarter view with shapes and basic sprites, shadows, and depth sorting). Readability beats art. It must run in a desktop browser.

## 3. Core loop

1. **Night (tycoon, untimed)**
   - Equipment upgrades
   - Point-of-sale progression
   - Marketing for tomorrow
   - Supplies
   - Layout changes (later milestone)
   - "Pitch an idea"
   - Pressing *Open the shop* locks every choice. In co-op, every player has to press Ready.
2. **Morning paper:** the day opens with short notes on what's active, for example "InstaGlam ad is live (+40% traffic)" or the result of last night's pitch.
3. **Day (action, timed):** the default is a 150-second shift representing 7 AM–3 PM. Customers arrive with order tickets and patience bars. The players carry items between stations.
4. **Closing:** the doors close, the people already in line get a short grace period, and then a summary shows sales, tips, rent, wages, profit, and the reputation change.
5. The game returns to the night phase, and the cycle repeats.

## 4. Day-phase mechanics (start set)

| Station | Takes | Gives | Base time | Uses |
|---|---|---|---|---|
| Grinder | empty hands | Grounds | 2.5 s | 1 bean |
| Espresso machine | Grounds | Espresso | 5 s | n/a |
| Milk steamer | Espresso | Latte | 3.5 s | 1 milk |
| Cold brew tap | empty hands | Cold Brew | 1.5 s | 1 concentrate |
| Hand-off counter | a drink | money + tip | instant | n/a |
| Trash | anything | nothing | instant | n/a |

Starting drinks: Espresso $3.00, Latte $4.75, Cold Brew $4.00.

The rules:
- A player holds one item at a time.
- Stations keep working when you walk away, and finished items wait on the station.
- A drink served at the counter goes to the most impatient customer who ordered that drink.
- Tips scale with remaining patience, up to 35%.
- When a supply runs out, that drink comes off the menu until you restock at night.
- Controls are WASD or the arrow keys to move, E or Space to use a station, and Esc for the pause/settings menu.

Later additions: pastries (an oven), syrups and alternative-milk modifiers, a dish pit, machine breakdowns, rush-hour events, a mobile-order shelf, and seating and ambience.

## 5. Night-phase progression (start set; tune the numbers)

- **Equipment:**
  - Espresso machine: Hand-me-down → Dual-boiler prosumer ($120, 30% faster) → "La Mazzocca Pro" ($320, 55% faster)
  - Grinder: Blade → Flat-burr ($60, 40% faster)
  - Steamer: Wand → Auto-steam pitcher ($90, 40% faster)
  - Branded cups ($50, prices +8%)
  - Non-slip staff shoes ($40, move speed +15%)
- **Point of sale (real-life progression):**
  - Cash register
  - Digital kiosk ($80: patience +15%, tips +5%)
  - "Squarely" tap terminal ($200: patience +25%, tips +20%)
- **Marketing.** Use parody platforms only, never real brand names. An ad runs for tomorrow only, and cancelling it gives a refund.

  | Platform | Ad | Cost | Effect |
  |---|---|---|---|
  | Chirper | a thread | free | +8% customers |
  | Campus corkboard | flyers | $5 | +10% customers, more cold brew orders |
  | The Daily Grind | newspaper ad | $10 | +15% customers, more patient, more espresso orders |
  | Palm Book | boosted post | $15 | +30% customers |
  | InstaGlam | latte-art story | $25 | +40% customers, lots of latte orders |

  Later: multi-day campaigns, ad fatigue, influencer visits, reviews on a "Yelpish" site, and a "TikTak" trend roll.
- **Supplies:** beans, milk, and cold-brew concentrate, bought in packs.
- **Economy:**
  - You start with $100 and 2.5 stars of reputation.
  - Rent is $25 a day, and each AI teammate costs $10 a day in wages.
  - Reputation rises if you serve about 70% or more of customers and falls if you serve fewer, and it scales the next day's traffic.
- **Growth path:** cold brew stand → small café → full local café, unlocking stations, menu items, and space.

## 6. Players, AI staff, and competition

| Humans | Setup |
|---|---|
| 1 | Solo is supported, but co-op is the main design. AI teammates fill the empty stations (0–2, set in Settings). |
| 2 | One shared café. The players pick up extra slack and can add an AI helper or hire a better one. |
| 3 | Full crew, no AI staff needed. |
| 4 | The game splits into a **2v2 competition**: two chains on one street, sharing one customer pool, with identical starting variables and different difficulties and customer tastes. The win metric is a match setting: customer count, revenue, or profit. |

AI teammates are a scripted "utility AI": claim the most impatient order, walk to the right station, make the drink, and serve it. They cost wages, so a human is always worth more. They must never deadlock, for example on a station a human left half-finished. In AI Full mode, a cheap decision-model call can choose *which* task to take, while movement and station use stay scripted.

## 7. Settings

- **Pace/chaos slider, 1–5 (Chill, Relaxed, Normal, Busy, Chaos):** scales customer arrival rate and patience (roughly ×0.6 to ×1.65). It applies instantly, even in the middle of a day.
- **Shop hours slider:** sets the day length in real time (60–300 seconds).
- **AI teammates:** 0–2.
- **AI usage mode:** Off, Lite, or Full (see section 9).
- In co-op, the host controls the settings. Solo progress and settings save to `localStorage`.

## 8. "Pitch an idea": creative freedom with guardrails

At night a player can type any idea, for example "a latte-art battle with the bakery next door" or "a free cookie with every latte." A game master turns it into a **bounded ruling**:

- **One verb from a fixed list:** discount, event, menu_special, partnership, ad_campaign, stunt, or custom.
- **Numbers inside hard limits:**
  - cost ≤ 50% of cash
  - traffic −30% to +60%
  - patience −20% to +30%
  - price ×0.7 to ×1.3
  - a 0–50% chance that the idea backfires
- **A title and one line of flavor text** for the morning paper.

A `clampRuling()` function in `shared` enforces those limits no matter who did the judging. In AI Off mode, keyword rules do the judging. In Lite or Full mode, the AI model does the judging; after a 4-second timeout or any error, the game silently falls back to the scripted judge. The same idea of a "free-text action judged into bounded game effects" will later power Phase 2 phone calls.

## 9. AI design

**Goals:** varied, natural dialogue that isn't rigidly baked in, and smart decisions, including creative actions outside the normal scope, all cheaply.

### Hard rules
1. **AI never blocks gameplay.** Scripted behavior always exists first: a line bank, a keyword judge, and a utility-AI brain. AI results replace the scripted results only when they arrive in time.
2. **Pre-generate during the night.** Customer dialogue lines for tomorrow are generated during the night phase into a pool. Daytime code only reads from the pool and falls back to the line bank when it's empty.
3. **Validate everything.** All model output goes through schema validation (structured JSON output) and clamps before it touches game state.
4. **Keys stay on the server.** The browser calls `/api/ai/*` on the host server, and the server calls the vendor. Keys go in a git-ignored `.env`.
5. **Budget caps per mode,** enforced by an AI gateway on the server that estimates spend and stops calling once a cap is reached.

### Modes
| Mode | Behaviour | Cap |
|---|---|---|
| Off | No network calls at all. Scripted lines, the keyword pitch judge, and scripted staff. | $0 |
| Lite | Small cheap model only: about 20 generated customer lines per night and short pitch rulings. | about $0.10/session |
| Full | Everything: about 80 lines per night, richer game-master rulings and phone calls, and decision-model staff choices. | about $1.00/session |

### Model plan (research from Oct 28, 2026; re-verify ids and prices before use)
- **Fast fixed-choice decisions** (which order an AI barista takes, simple customer choices): the **OpenAI Decisions API**, generally available since about Oct 22, 2026. Reported pricing is about $0.10 per 1M input tokens with output free, it accepts up to about 400 questions per call, and it reports p95 latency under 280 ms. Budget 400 ms per call, or the scripted choice is used. As a fallback, use a cheaper decision-style model on OpenRouter, reported at about $0.02–0.05 per 1M tokens.
- **Dialogue, pitch judging, and agent-style game master:** **DeepSeek V4.1 Flash**, about $0.15/$0.60 per 1M input/output tokens off-peak and $0.30/$1.20 at peak. Peak was reported as about 9 PM–midnight and 2–6 AM Toronto time, so check this, since game nights may fall in it.
- **Fallbacks:** Gemini 3.5 Flash-Lite, or Gemma 4 26B (about $0.07/$0.34 on DeepInfra). Kimi K3 or K3.1 Pro (about $2/$10) is too expensive for per-customer chat.
- **One OpenAI-compatible provider class, configured by env vars** (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL_SMALL`, `AI_MODEL_STANDARD`), so DeepSeek, Kimi, OpenRouter, Gemini/Gemma, or local Ollama can be swapped in. Use a separate small provider for the Decisions API.
- **Cost estimate:** about $0.09–0.14 per 60-minute session in Full mode, so a weekly game night costs well under $5/month.
- Show a small live "AI spend this session" readout in the settings.

## 10. Tech stack (verify current versions)

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere |
| Monorepo | pnpm workspaces: `packages/shared`, `packages/client`, `packages/server` |
| Client | Phaser 4 + Vite. Static build to `packages/client/dist`, using a relative base path. |
| Game server | Node 22 LTS + Colyseus (authoritative rooms, state sync) |
| AI gateway | Express routes on the same Node server |
| Tests | Vitest for the shared simulation. Playwright for headless smoke runs and screenshots. |
| Dev env | `.devcontainer` for GitHub Codespaces (Node 22, forwarded ports for client, preview, and server) |

`shared` is consumed as TypeScript source (no separate build step). The simulation runs at a fixed 1/60-second step with a seeded random number generator, so it is deterministic and testable.

## 11. Hosting and repo

- **Code:** a private GitHub repo. Use CI (GitHub Actions) to run install, build, and test on every push.
- **Solo/prototype:** Cloudflare Pages builds from GitHub. Use framework preset None, root = repo root, build command `pnpm build:client`, and output directory `packages/client/dist`, with `NODE_VERSION=22` and a pinned `PNPM_VERSION`. Cost: $0.
- **Co-op game night:** the host runs the server on their own PC. It runs Colyseus and the AI gateway and also serves the built client. The host shares it with **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:<port>`) or **Tailscale Funnel**; friends open the link. Cost: $0. A Codespace with a forwarded port is an alternative.
- **If it's ever always-on:** a small Fly.io VM (about $2–6/month) or a Hetzner VPS.
- **Rooms:** rooms are private (`setPrivate(true)`), friends join by room code or link, and players pick a display name. There are no accounts.

## 12. Multiplayer design

1. The host creates a room and shares the code or link.
2. The server owns the shop state and day state, runs the simulation at 60 Hz, and sends state patches at about 20 Hz.
3. Clients send inputs only: move and interact. Your own barista uses client-side prediction, and other players are interpolated.
4. **Night in co-op:** any player can propose a purchase, and the host confirms (later, a majority vote). *Open the shop* requires everyone to be Ready.
5. With **4 players**, the server runs two shop states on one street that share a customer spawn pool, for 2v2.
6. The client's game controller has the same interface for local solo and for network play, so the scenes don't change.

## 13. Phase 2: franchise mode (design outline only for now)

- **Campus map:** unlock locations such as a library kiosk, a train station, and an office lobby, each with its own demand curve and rent.
- **You become a manager more than an operator.** While you work one café, the others run on AI managers whose quality depends on who you hired.
- **Random phone calls** ("the espresso machine is leaking, what do I do?") are answered with quick choices, or with free text that the AI game master judges into bounded effects.
- **Travel** between locations costs in-game time, so who is where matters in co-op.
- **Staffing:** hire baristas with traits (fast, chatty, clumsy), and manage schedules, wages, and morale.
- **Supply chain:** bulk deals, a roaster partnership, and deliveries that can be late.
- **2v2 at scale:** two franchise empires competing for the same campus.
- More phases come later.

## 14. Milestones

- **M0, skeleton:** monorepo, CI, devcontainer, README, an empty Phaser scene deployed to Cloudflare Pages, and a server `/health` endpoint.
- **M1, solo loop:** the full day/night cycle with the station set, drinks, customers, economy, night menus, the morning paper, settings (pace slider, hours, AI teammates, AI mode stub), saving, scripted AI teammates, and the scripted pitch judge. Tests and screenshots. **Gate: it's actually fun for 3 in-game days. Tune the numbers.**
- **M2, co-op 1–3 players:** server-authoritative rooms, a host/join screen with a room code, Cloudflare Tunnel instructions, prediction and interpolation, shared night decisions with Ready-up, and AI teammates filling empty slots. Test with 2–3 browser tabs.
- **M3, real AI:** the server AI gateway, Lite and Full modes, night-time pre-generation of dialogue, AI pitch judging, decision-model staff choices, budget caps, the spend readout, and fallbacks proven by tests (simulate timeouts and malformed output).
- **M4, juice:** sound, screen shake, combo tips, rush events, machine breakdowns, and better 2.5D sprites.
- **M5, 2v2 competition:** two chains, a shared customer pool, match settings, and a results screen.
- **M6, growth path and layout editor:** stand → café upgrades, and moving stations at night.
- **M7+, Phase 2 franchise.**

## 15. Definition of done for each milestone

- `pnpm install --frozen-lockfile && pnpm build && pnpm test` pass, and CI is green.
- The headless smoke run plays through the new features with no page errors, and the screenshots are committed or attached.
- The README and `docs/` are updated (design, architecture, and how to run and host).
- A short changelog note covers what was added, known gaps, and what's next.
