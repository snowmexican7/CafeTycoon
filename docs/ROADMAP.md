# CafeTycoon roadmap: phases + in-game Roadmap feature spec

> Agreed order with Kennedy (2026-10-28): **phases go from easiest and lowest risk to hardest and riskiest.** AI is the hardest, so it comes late (Phase 5), and a polish phase closes it out. The machine-readable copy the game reads is `public/roadmap.json`.
> The design spec (`superpowers/specs/2026-10-28-cafetycoon-design.md`, §17) uses older numbering (P3 = AI, P4 = bigger games). This roadmap supersedes it.

## Where we are now (updated 2026-10-30, ~10:30 PM Toronto)

> **Start here.** This section is the single, current picture for anyone new to the repo (including code
> reviewers). The phase plan below is the long-range history. Details live in
> [`HANDOFF.md`](HANDOFF.md) (what each lane needs right now), [`BACKLOG.md`](BACKLOG.md) (long record and
> names as built), [`GEAR_TREE.md`](GEAR_TREE.md) (gear lines) and [`CHANGELOG.md`](../CHANGELOG.md).

### State
- **Live:** https://snowmexican7.github.io/CafeTycoon/ deploys from `main` on every push.
- **Versions:** sim release **v3.5.0** (Feedback 2 part A + balance fixes); UI release **v3.4.1** (fridge UI).
  On `main` but unreleased: B6 multi-drink orders (protocol 45).
- **Rule of thumb:** sim releases use 3.5.x, UI releases use 3.4.x-style UI tags (`ui-3.4.x`) until the next
  minor bump is agreed.
- **Gear is the game** (no classic runs), no save compatibility for now, runs start at the stand, solo starts
  with 1 bot. All rulings: HANDOFF "Decisions".

### Lanes
- **Claude (sim lane):** `src/sim/**` (bots too), `src/net/**`, `src/host/**`, `src/storage/**`, `src/data/**`,
  `scripts/**`.
- **Grok (UI lane):** `src/ui/**`, `src/render/**`, `src/audio/**`, styles, `src/main.ts`, docs like this one.
- They coordinate through `docs/HANDOFF.md` on `main`. Each change is a dash-named branch merged `--no-ff` and
  tagged; nobody force-pushes.

### Shipped recently
- **v3.4.1 (UI):** fridges for each shop size, milk cartons in hand, "Grab milk" / "Put the milk away" hints,
  "Closing soon" checklist, fridges in the night shop.
- **v3.4.0 (UI):** stand and cart each have their own look; "Grand re-opening" transition with a "What you
  gained" card; "You can afford a cart!" nudge; first-run tips (snooze / off); forecast labelled "Rough guess".
- **v3.5.0 (sim):** cups go cold, back sink and pot dumping, milk in a fridge, closing rush, solo bot count.
- **On main, unreleased (sim):** combo orders and office runs (B6): one ticket per customer, paid at the last cup.

### Now: Round 4 (Kennedy approved Oct 30, 2026, ~10:27 PM)
Sim side is in [`CLAUDE_PROMPT_ROUND_4.md`](CLAUDE_PROMPT_ROUND_4.md).

| # | Item | Grok (UI) | Claude (sim) |
|---|------|-----------|--------------|
| 1 | **Cream and sugar restock** (missing button) | "Condiment box, $6" card on the Restock tab (input exists) | nothing |
| 2 | **Create your own barista** | Creator before the first day + "Edit my barista" at night: 5–6 hairstyles each male/female, skin tones, shirt colours, outfit styles incl. dresses, click-through arrows, saved on the device | `Player.look` through lobby/join + protocol, `{kind:'look'}` input |
| 3 | **Pastries** (half-wired, can't be bought) | Card / row once named | Make them buyable (restock or pastry case) and/or tie to combos |
| 4 | **Bumping into customers** (fun quirk) | "Hey!" / "Watch it!" bubbles, angry exit | `customer.bump {customer, by}`, patience hit, repeat bumps → angry leave |
| 5 | **Stacked multi-drink orders** | One customer's cards fan out, slightly overlapping, with a "×N" badge | Confirm `Customer.items` is enough |
| 6 | **Night opens on the Restock tab** | Always open on Restock; keep "runs out around…" and spoilage | nothing |
| 7 | **Dev mode** (`?dev=1`) | Toggle UI, pause the night timer, money display | Unlimited money + paused-night support |
| 8 | **Night screen declutter** | Reorganise / trim the night tabs | Proposal: what could move to a mid-day moment or be cut |

### Next: still open from Round 3 and Feedback 2
- **Round 3** (BACKLOG "Round 3 (Kennedy approved 2026-10-30)"), sim then UI:
  more latte demand; very slight money tuning with "Too pricey!" walkouts; Strategist and Marketer hires (the
  honest forecast becomes a paid hire); line and waiting area with "Line's too long!" and the tumbleweed;
  register ring-up time with a progress bar; small early-growth nudge; grow diff for the "What you gained" card.
  UI parts of items 6–7 shipped in v3.4.0.
- **Feedback 2** ([`CLAUDE_PROMPT_FEEDBACK_2.md`](CLAUDE_PROMPT_FEEDBACK_2.md)): B6 multi-drink orders (sim
  merged; UI tall ticket, office phone card, receipt line to do) · C9 espresso rework, wand on the machine
  (built, waits on Kennedy's milk-timeline call; then the UI "Add a wand" button) · B7 tray table · B8 hand-made
  lattes and cappuccinos · C10 station rearranging · C11 daily social feed and reviews.
- **Design review ideas** (Kennedy's Muse review, not yet approved): bigger in-world text, a slimmer or
  collapsible sidebar, one clear state per order card, a smaller FOR LEASE teaser while playing, each shop size
  pushed further apart in look.

### Later (not scheduled)
- **Café add-ons first:** a seating nook that juts out as a trapezoid with a big window; an outside queue of
  shadow figures.
- A cashier hire who entertains the line (so it can grow to 6+).
- Area upgrades in the middle of the day rather than on another screen.
- A split money pool for co-op.
- Upgrade paths per line: speed, reliability, taste, quality.
- A smart café that runs itself (top registers pair with smart machines), with conveyor belts as the Easter-egg
  win.
- 2v2 battles (maybe Phase 5).
- Mobile: a phone-browser test build first, then the App Store.

---

## Release approach
- **`main` is always the stable, playable build.** The live GitHub Pages site deploys from `main`, so game night always runs on it.
- **Every build has a version and a changelog entry** in [`CHANGELOG.md`](../CHANGELOG.md), written for players, and a git tag (`v1.0.0`, …). Numbers are `major.minor.patch`: patch for a small change (fix, number tweak, wording), minor for a big change (new feature, system, screen or content), major for a finished roadmap phase or an overhaul of something that already existed. `1.0.0` is the 2026-10-28 build. Any earlier version can be checked out from its tag.
- **Risky phase work happens on branches** and merges into `main` only when tests and the build are green and it has been playtested. Nothing in progress can break a game night. (No versioned `/vN/` paths; that would mean extra CI for the same guarantee.)

## Phases

### Phase 1: Open the doors *(done, tag `phase1-final`, v1.1.0)*
- **Aim:** a game that runs, looks decent, and that friends can actually playtest together. Big because it's the first phase, but it builds on a playable base.
- **Goals:**
  - Direct peer-to-peer co-op with room codes for 1–4 players. *(done, on main)*
  - UI overhaul Group A (café diorama scene, *done*) and Group B (HUD, night, title, menus, lobby), per [`docs/UI_OVERHAUL.md`](UI_OVERHAUL.md).
  - Roadmap drawer on the title screen, plus the suggestion flow.
  - Deployed on GitHub Pages; anyone with the link and a room code can join.
- **Done when:** 4 friends in 4 homes finish a full 7-day week to the score screen with no crash or desync, and at least 3 of them say it "looks like a real game."

### Phase 2: Busy season *(done, v2.0.0, 2026-10-29)*: gameplay dynamics + station bots
- **Why here:** lowest risk. Mostly new content on systems that already work.
- **Goals:** day events (rush hour, health inspector, a power flicker, an influencer visit) · 40+ cards with combos and synergies · better customer behaviours (impatient regulars, big group orders) · difficulty pacing across the week · sound and juice (dings, steam, coin pops, screen shake on a spill) · balance pass.
- **Telemetry (no new accounts):** the host records the run (seed, scenario, every player's inputs, a snapshot at each phase boundary) and each peer's UI events (cards hovered but not bought, button mashing, frames over 250 ms, disconnects), sent over the same peer-to-peer channel as inputs. At run end the host downloads one newline-delimited JSON file that Kennedy drops where the design-analysis agent can read it. First analysis review after the first Phase 2 game night. Details: design spec §13.
- **Scripted station bots (plain code, no AI model)** fill empty stations so 1–3 players always have a full café:
  - **Reaction delay:** a random ~0.5–2 s before starting an order.
  - **Mistakes:** ~5–10% chance of a wrong size or missed shot, which the bot notices and remakes.
  - **Real walking:** bots path around players and stations, and sometimes hesitate or yield when a player is in their way. No new player-to-player collision for humans (revisit after playtests).
  - **Personalities:** per-bot speed, accuracy and focus (fast-but-sloppy rookie, slow careful veteran).
  - **Pressure:** more mistakes during rushes.
  - **Difficulty dial:** one bot-skill setting nudges all of the above, from clumsy to sharp.
- **Done when:** the crew asks to play a second week unprompted, weeks feel different from each other, and 2 players plus 1 bot finish a week with the bot feeling helpful but not perfect. The first game night's telemetry file has been reviewed by the analysis agent.

**Phase 2 status (2026-10-29, v2.0.0).** Every goal shipped: day events, 52 cards in 8 sets with
pair and full-set bonuses, customer kinds, a week difficulty curve, sound and juice, scripted bots
with personalities and a skill dial, telemetry, and a balance pass. Later blocks
added forecasts, a bigger menu, daily challenges, Easter eggs, awards and records. The "done when" line still
needs people: a real game night (2 players plus 1 bot finishing a week, and the crew asking for a
second) and the analysis agent reading that night's telemetry file. Both carry over to the next
game night. Phase 1's "first game night" goal carries over the same way.

### Phase 3: Real-life growth *(done: v3.1.0, 2026-10-30)*
- **Why here:** saves that carry across nights are where bugs start to matter.
- **Goals:** upgrade path stand → cart → café · checkout path register → kiosk → "Squarely" tap terminal · parody ads tab (Palm Book and friends) · "Pitch an idea", scripted with a keyword judge and no AI · a layout editor to move stations between nights · saves and unlocks carried between runs.
- **Done when:** a run feels like "we started tiny and built something", every night tab that shows as locked today is live, and saves survive a refresh and a new game night with no lost progress.

**Phase 3 status (2026-10-29, v2.1.0 "Phase 3 preview").** Blocks B1–B13 shipped and are live:
barista roles, per-item pricing, regulars with favourites, supplies that spoil, recipe accuracy,
the hidden taste map, the signature drink, taste seasons, the rival Starbuck$ (scouting, copying,
undercutting), parody ads, "Pitch an idea", the checkout path and the growth path. Still to come:
- **Feedback round 1**: *delivered in v2.2.0 (2026-10-29, release candidate `v2.2.0-rc1` on `fb1`;
  goes live when Kennedy merges it).* From Kennedy's first playtest (plan in `docs/FEEDBACK_PLAN_1.md`):
  a readable night screen (three tabs, big drink cards, larger type, two-minute or relaxed nights, one
  Heads up list from the sim's night brief), bigger order tickets, close the day early, sold-out
  walk-ups, station slots with extra grinders and espresso machines (replacing the layout editor),
  and bot crew tips with personalities.
- **B15** bots become hired staff with wages (done, tag `p3-b15`) · **B16** saves and unlocks carried between runs (done, tag `p3-b16`) ·
  **B17** integration and **v3.1.0** (done, tag `v3.1.0`; the Gear Tree shipped as v3.0.0 first). **Phase 3 is complete.**
- Moved: seasons across game nights and rival escalation to Phase 4; the mobile night layout to
  Phase 6.

### Phase 4: Franchise & rivals *(next)*
- **Plan:** block by block in [`PHASE4_PLAN.md`](PHASE4_PLAN.md) (rival escalation → seasons → manager reports → a second shop → manager mode → phone calls and travel → 2v2 chains → 4.0.0).
- **Why here:** big new systems, but still deterministic code we can test.
- **Goals:** campus franchise of several cafés · manager mode (assign crews, read reports) · phone calls and travel between sites · 2v2 rival chains on a shared street, competing for the same customers · seasons across game nights.
- **Done when:** 4 players finish a 2v2 match with a results screen, and the crew plays one season across 2+ game nights without a save problem.

### Phase 5: Smart café *(hardest)*: optional AI
- **Why here:** outside services, real money, and unpredictable answers.
- **Goals:** AI modes Off / Lite / Full · LLM dialogue for customers, staff and bot personalities · AI pitch judge (scripted judge as fallback) · creative out-of-scope player actions, bounded by `clampRuling()` · a server-side backend that keeps API keys safe, with a cap per room per day.
- **Rules:** the LLM never does split-second station work; the scripted bots from Phase 2 still make the drinks. AI never blocks gameplay; every AI call has a scripted fallback, and dialogue is pre-generated during the night.
- **Budget:** total under $20/month.
- **Done when:** 1 human plus 3 AI teammates finish a week under budget, and switching AI off changes nothing else.

### Phase 6: Polish
- **Goals:** bug-fix pass from the playtest backlog · visual passes · performance on older laptops · save cleanup and migration. **No new features.**
- **Done when:** a full game night runs on the stable build with zero known crash bugs, a steady frame rate on every friend's machine, and old saves still load.

---


## In-game Roadmap feature

### Entry point
- A persistent **Roadmap** pill on the title screen (top right) with a badge showing "N new" since the player last opened it. The last-seen time is stored in `localStorage`.
- Also listed in the pause menu as "Roadmap & ideas", as a read-only view during a run.
- Clicking it opens a right-side **drawer** (see [`docs/mockups/title.png`](mockups/title.png)), which closes with Esc or a click outside it.

### Drawer contents
1. **Header:** title, a one-line pitch, and an overall progress track (6 segments, current phase % from its goals).
2. **Phases tab (default):** a vertical stepper.
   - The current phase is expanded: a goals checklist (done / in progress / to do), a **"Done when"** line, **Crew says** mood counts from reactions on that phase's feedback issue (😄 = happy, 👀 = neutral/unsure, 😕 = unhappy; other reactions are ignored), and the top 1–2 suggestions for that phase with votes.
   - The other phases are collapsed into one line each, with a status chip: **Now / Next / Planned / Suggested / Done**. Suggested phases (none right now) use a dashed chip so they visibly read as "not decided".
3. **Suggestions tab:** all suggestions sorted by 👍. There are filter chips per phase, and each row shows the title, author, phase label, vote count, and a "Vote on GitHub" link.
4. **Changelog tab:** the last 10 merged PR titles, or a hand-written `changelog` array in the JSON.
5. **Footer:** a **"+ Suggest an idea"** button with a short note explaining where ideas go.

### Data: `public/roadmap.json` (edited through PRs, shipped with the site)
```json
{
  "updated": "2026-10-28",
  "repo": "snowmexican7/CafeTycoon",
  "phases": [
    {
      "id": 1, "name": "Open the doors", "tagline": "playable co-op",
      "status": "now", "suggested": false,
      "aim": "A game that runs, looks decent, and friends can playtest together.",
      "goals": [
        { "text": "Direct co-op with room codes (1–4 players)", "state": "doing" },
        { "text": "Cozy look: café scene, HUD, menus", "state": "doing" },
        { "text": "First game night: 4 friends finish a week", "state": "todo" }
      ],
      "doneWhen": "4 friends, 4 homes, a full week, no crash.",
      "feedbackIssue": 12
    }
  ],
  "changelog": [ { "date": "2026-10-28", "text": "Phase 1b co-op plan written" } ]
}
```
`status` is one of `done | now | next | planned | suggested`. `feedbackIssue` is the number of that phase's "How's Phase N going?" issue (labels `feedback` + `phase-N`). Its reactions feed the **Crew says** counts: 😄 (`laugh`) = happy, 👀 (`eyes`) = neutral/unsure, 😕 (`confused`) = unhappy; 👍 👎 🎉 ❤️ 🚀 are ignored. Only the current phase's issue is pinned (GitHub allows at most 3 pins); the others are found by label.

### Storage options for suggestions (static GitHub Pages, budget < $20/mo)

| Option | Cost | Friends need | Pros | Cons |
|---|---|---|---|---|
| **A. GitHub Issues + issue form (recommended)** | $0 | a GitHub account | no backend; moderation, comments, notifications and votes (👍) built in; public REST API readable without auth; content lives next to the code | friends without GitHub can't post (they get a fallback); the repo must stay public with Issues on; anonymous reads are limited to 60 requests/hour per IP |
| B. GitHub Discussions + Giscus widget | $0 | GitHub account | nice threaded UI, embeddable | reading counts needs the GraphQL API with a token; heavier embed; more setup |
| C. Cloudflare Worker + KV with a crew passphrase | $0 on the free tier | nothing (passphrase) | anonymous posts; full control; reuses the planned relay account | needs someone to own a Cloudflare account; you write the moderation and anti-spam yourself |
| D. Google Form → Sheet | $0 | nothing | easiest posting | reading results back into the game needs a published sheet or an Apps Script; clunky; data lives outside the repo |
| E. P2P (Trystero) shared state | $0 | nothing | no server | doesn't persist once everyone leaves, so it's not real storage |

**Recommendation: A now, C later behind an interface.**
- **Posting:** "+ Suggest an idea" opens
  `https://github.com/snowmexican7/CafeTycoon/issues/new?template=suggestion.yml&labels=suggestion,phase-1&title=Idea:%20`
  in a new tab, with the phase prefilled from wherever the button was clicked.
- **Reading:** `GET https://api.github.com/repos/snowmexican7/CafeTycoon/issues?labels=suggestion&state=open&per_page=50` (each issue includes `reactions["+1"]`), plus `GET /issues/{feedbackIssue}` for the current phase's mood counts (other phases' feedback issues come from `GET /issues?labels=feedback&state=all`, read by their `phase-N` label). That's about 3 requests per open, cached in `localStorage` for 10 minutes, so it stays well under the 60/hour limit. If the API fails or is rate-limited, show the cached copy with "updated X min ago" and still show the phases from `roadmap.json`.
- **Fallback for friends without GitHub:** a "Copy my idea" box that copies a formatted text to the clipboard, so they can text it to Kennedy.
- **Code shape:** `src/ui/roadmap.ts` depends on an interface
  `interface SuggestionSource { list(): Promise<Suggestion[]>; mood(phase: number): Promise<Mood>; suggestUrl(phase: number): string }`
  with `GitHubIssuesSource` now and an optional `WorkerKVSource` later, so switching to C is one file.
- **No secrets** in the client, ever. Option A needs none.

### Issue form draft: `.github/ISSUE_TEMPLATE/suggestion.yml` *(draft only; adding it is a repo change that needs Kennedy's OK)*
```yaml
name: 💡 Suggest an idea
description: Ideas for CafeTycoon from the crew
title: "Idea: "
labels: ["suggestion"]
body:
  - type: dropdown
    id: phase
    attributes:
      label: Which phase is this for?
      options: ["Phase 1 – Open the doors", "Phase 2 – Busy season", "Phase 3 – Real-life growth", "Phase 4 – Franchise & rivals", "Phase 5 – Smart café (AI)", "Phase 6 – Polish", "Not sure"]
    validations: { required: true }
  - type: textarea
    id: idea
    attributes:
      label: The idea
      description: What should happen in the game? One or two sentences is perfect.
    validations: { required: true }
  - type: dropdown
    id: feel
    attributes:
      label: How do you feel about the game right now?
      options: ["😄 Loving it", "👀 It's okay / not sure", "😕 Not fun yet"]
```

### One-time GitHub setup *(needs Kennedy's approval; not done)*
- Create the labels `suggestion`, `feedback`, `phase-1` … `phase-6`.
- Create **one pinned** feedback issue for the current phase, "How's Phase 1 going?" (labels `feedback` + `phase-1`), whose body says: react 😄 if you're happy, 👀 if you're neutral or unsure, 😕 if you're unhappy. Put its number in that phase's `feedbackIssue` in `roadmap.json`.
- **When a phase finishes:** unpin its issue (it stays findable by `feedback` + `phase-N`), open and pin "How's Phase N+1 going?", and update `roadmap.json`. Only one feedback issue is pinned at a time.
- Keep the repo public with Issues enabled.
