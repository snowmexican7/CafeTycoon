# Gear Tree: design plan (v3 "Gear Tree")

*Status: design only, 2026-10-29. Nothing here is built yet. Written from Kennedy's playtest notes and
the Gear Tree interview (same day), checked against `main` at `ca2c2ff` (v2.2.0). Numbers are a first
guess for the balance pass, not final.*

## 1. The idea in plain English

- A new run starts with **almost nothing**: a folding table, a cardboard box for a bin, and a small
  **startup fund**. The first screen of the run is **"Pick your gear"**.
- Every machine has its own **upgrade tree**, bought with money only. Cheap gear is funny and bad;
  expensive gear is fast, reliable and lets you charge more. Trees are **different lengths**: cold
  brew is short, drip branches, espresso is the long one.
- Cheap gear hurts in small, readable ways: **small batches**, **breakdowns**, **lower quality and
  price**, **more spills**, and **quirks** (drip too hot or too cold). Some gear has **rare Easter
  eggs**. Names stay silly the whole way up.
- **Drinks level up with use.** Serve enough espresso and you learn the Americano; enough lattes and
  you learn the cappuccino.
- Every run's **area has a hidden taste** (loves iced, loves espresso…). You find out from what
  customers ask for and how they tip, then **sell the gear you don't need** and lean into what sells.
- In co-op, **big buys are a vote**.
- Fresh runs only for now. Nothing carries over. Saved lobbies and long runs are later (Phase 3 B16).
- Later: the **mumbling owner** intro, who hands you the keys and wanders off mid-sentence.

## 2. What exists today (and what we keep)

Read from the code on `main`, so the plan fits it:

| Today | Where | Gear Tree use |
|---|---|---|
| Stations are bought and slotted at night: `equip` and `slot` inputs; `state.slots`, `state.equipment`, `state.equipLog`; fixed prices (espresso 45, grinder 30, steamer 40, cold-brew tap 35, bin 15) | `src/data/equipment.ts`, `src/sim/slots.ts` | **Reused as the base.** A station gains a gear tier; buying a tier is an `equip` with a gear id. |
| Slots per size: stand 4, cart 5, café 6 | `SLOT_POSITIONS` in `src/data/layout.ts` | Unchanged. Slots are the space limit that makes "sell what you don't need" matter. |
| Growth path stand → cart ($80) → café ($150), with price ×0.75 / ×0.9 / ×1 and rent $10 / $17 / $25 | `src/sim/growth.ts` | Unchanged. Growth is *where* you sell; gear is *what* you sell with. |
| Recipes are picked by what is in your hands, first match wins | `RECIPES` in `src/data/drinks.ts`, `interact` in `src/sim/stations.ts` | Reused. New drinks are new recipe rows. |
| Machine speed is `stationSeconds` ÷ `stationSpeed` modifiers | `src/data/economy.ts`, `src/sim/effects.ts` | Gear tier adds its own speed multiplier. |
| Cup quality: 3 stars minus "slip marks" | `src/sim/accuracy.ts` | Cheap gear adds a mark, so quality and tips drop without new systems. |
| Messes, spills, mop, slip chance | `src/sim/floor.ts`, `src/sim/mop.ts` | Messy gear calls `placeMess`. |
| Easter eggs: cat on a warm machine (blocks it), burnt-shot smoke | `src/sim/eggs.ts` | Breakdowns reuse the "station is blocked" pattern. Rare gear events live here. |
| Hidden taste map from the seed, no RNG used | `src/sim/taste.ts` | The area's taste uses the same hash trick. |
| Run-wide scenarios (Campus town, Rainy week, Tourist season), announced on day 1 | `src/data/scenarios.ts` | Become hidden **areas** in Gear mode. |
| Unanimous vote to close early (`closeVotes`) | `src/sim/closeEarly.ts` | Same pattern for co-op big-buy votes. |
| Upgrade cards that already are machines: Dual-boiler ($95), "La Mazzocca Pro" ($255), Flat-burr grinder, Auto-steam pitcher, Second cold-brew tap | `src/data/catalogue.ts` | **Removed from the deck in Gear mode**, since the tree replaces them. Classic mode keeps them. |
| Drinks unlock by day (iced latte day 3, mocha day 5) or by a card | `src/data/drinks.ts`, `src/sim/unlocks.ts` | In Gear mode, unlocks come from use (section 6). Card unlocks such as matcha and maple stay. |
| Bot count is already a run setting (`settings.bots`: number or `'auto'`); the co-op lobby has an Off/1/2/3 card | `src/sim/types.ts`, `src/ui/lobby.ts` | "Play solo" skips the lobby and always sends `'auto'`; that's the bots on/off gap (section 11). |

**Classic mode stays.** Gear Tree ships as a new run mode ("Start from scratch") next to today's game,
so game nights always have a known-good build. Once it's tuned it can become the default.

## 3. Money scale and the startup fund

Today a run starts with **$100 cash plus about $125 of free stand stations and ~$40 of supplies**.
A stand day sells roughly 12–25 cups and nets about **$15–35** (balance run, 1 human + 1 bot,
3 weeks). The existing machine cards top out at $255.

So Gear mode uses the same scale. The top of the espresso tree is about one strong week's profit at
the café, and every tier shows a **"real-life sticker"** in its flavour text ($129 → $25,000) so it
still feels like the real ladder.

**Proposal: startup fund $120, no free stations, no free supplies.** You get the counter, a free
cardboard-box bin and the mop. Supplies come out of the same $120 at today's pack prices:
beans 10 for $8, milk 10 for $10, concentrate 10 for $9, plus new **pods 10 for $12**. Rent and
prices follow the stand as today.

### Example openings (all from $120)

| Opening | Buys | Spent | Left | How it plays |
|---|---|---|---|---|
| **A. The espresso gamble** | Brevelle "Barista Distress" $80 + spice grinder $12 + 2 bags beans $16 | $108 | **$12** | Best margins and a real upgrade path, but espresso only (no milk yet). Day 2's night is "buy beans and pray". |
| **A′. Pod life** | Pod-o-Matic 3000 $45 + 3 boxes pods $36 | $81 | $39 | Easy and no grinder, but pods cost more per cup, quality is capped at 2★ and it's a dead end (sells for $8). |
| **B. Sock & thrift** | Hanes sock $5 + Thrift Store Special drip $15 + 2 concentrate $18 + 2 beans $16 | $54 | **$66** | Two cheap drinks, one hot and one iced, both low quality. Lots of money left for a second-night upgrade (Mason jars, a frother) or a small permanent card. |
| **C. One good thing** | Mister Kaffee drip $40 + 3 beans $24 + Thermal carafe $20 (small permanent upgrade) | $84 | $36 | One reliable drink done well, with spare cash for supplies. Same idea with Mason Jar Army cold brew. |

Pods answer the "K-cup" question: the cheapest espresso needs **no grinder**, but it runs on a
pricier supply and can't make good coffee. Real espresso (tier 2+) needs a grinder and beans.

## 4. The trees

Columns: **price** = game dollars; **sell** = what you get back (night, any time); **sticker** = the
joke real-life price in the flavour text. Speed is relative to today's machine (1.0 = today).
"Mark" = one slip mark on the cup (−1★ from 3★).

### 4.1 Cold brew (short: 5 tiers)

Cold brew is made overnight in a batch, so tiers 1–3 have a **daily batch cap**: when it's gone,
cold brew shows "sold out" (the existing sold-out flow). From the keg (tier 4) up there's no cap; it
pours from concentrate packs, exactly like today's tap.

| Tier | Name | Price | Sell | Sticker | Batch / speed | Downsides | Quirks and rare events |
|---|---|---|---|---|---|---|---|
| C1 | **The Hanes Method**: a clean sock from Walmart. *"I hope nobody sees how we did this."* | $5 | $0 | $4.97 (3-pack) | 8 cups/day | 1 mark (sock lint) | 2%/day: a customer asks "is that… a sock?" (−0.05 rating). 0.5%/day: **Lucky Sock**, all cold brew 5★ today. Selling it: "Nobody wants the sock." |
| C2 | **Mason Jar Army** | $25 | $8 | $30 | 16 cups/day | none big | 3%/day a jar cracks: spill on the tap tile. |
| C3 | **The Big Orange Bucket** (hardware-store bucket + filter bag) | $55 | $20 | $40 | 30 cups/day | none | Rare: a health-inspector event goes worse if he sees the bucket. |
| C4 | **Kegerator Tap** | $110 | $55 | $600 | No cap, 1.5 s pour (today's tap) | none | Rare: the keg "burps" (a funny sound; nothing else). |
| C5 | **The Slow Tower of Patience** (Kyoto drip tower) | $220 | $110 | $1,200 | No cap, quality +1★ cap, cold brew ×1.25 price | none | Draws iced-lovers (+10% iced orders). Rare: a customer stares at it for a whole minute, then orders two. |

### 4.2 Drip (branches at tier 3)

**New station and new drink.** Drip coffee is hot, cheap (list $2.50) and uses beans with **no
grinder**: it's pre-ground supermarket coffee, which keeps opening B cheap. You press E once to brew a
**pot**; then each press pours a cup instantly until the pot is empty. Pots go cold if they sit.

| Tier | Name | Price | Sell | Sticker | Pot / brew time | Downsides | Quirks and rare events |
|---|---|---|---|---|---|---|---|
| D1 | **Thrift Store Special**. *"It powers on and heats up. That's about it."* | $15 | $2 | $6 | 4 cups, 20 s; goes cold in 45 s | 12% of pots too hot or too cold | Too hot/cold: a complaint line, half tip. Rare: the coffee tastes faintly of 1997 (a fossil tea bag); the clock flashes 12:00 forever. |
| D2 | **Mister Kaffee 12-Cup** | $40 | $15 | $35 | 8 cups, 14 s; cold in 60 s | 5% temp misses | Rare: auto-off kicks in mid-rush. |
| D3 | **The Office Urn** (batch brewer) | $85 | $40 | $400 | 16 cups, 12 s; thermal, never goes cold | 2% temp misses | Rare: someone from "accounting" walks in for a free refill. |
| **Branch (pick one first; you can buy the other later if you have a slot)** | | | | | | | |
| D4a | **Twin-Batch Fetch-O** | $160 | $80 | $2,500 | Two pots at once, 10 s | none | Draws commuters (impatient mix up). |
| D4b | **Pour-Over Bar** (V60 cone + gooseneck kettle) | $70 | $30 | $120 | No pot: one handmade cup, 8 s | slow | **Unlocks the Pour-over drink** ($4.50 list, +1★ cap). 3%: the gooseneck pours on your shoe (spill). Rare: **flow state**, double speed for 20 s. |
| D5b | **The Pour-Over Lab** (3 cones + a Chemex) | $150 | $75 | $600 | Three cups at once, 7 s | none | Draws regulars and snobs; pour-over ×1.15 price. |

### 4.3 Espresso (the long one: 6 tiers)

| Tier | Name | Price | Sell | Sticker | Speed | Needs | Downsides | Quirks and rare events |
|---|---|---|---|---|---|---|---|---|
| E1 | **Pod-o-Matic 3000** | $45 | $8 | $129 | 6 s, one at a time | Pods (no grinder) | 2★ cap, espresso drinks ×0.85 price, jams 4% (whack it) | Rare: a mysterious "descale" light nobody understands. Egg: a handsome stranger whispers "what else?" |
| E2 | **Brevelle "Barista Distress"** | $80 | $35 | $700 | 5.5 s | Grinder + beans | No steam wand, 3% portafilter slips (spill) | Rare: makes a noise like a goose. |
| E3 | **Sylvia the Prosumer** (single boiler) | $150 | $75 | $1,800 | 5 s (today's machine) | Grinder | First shot of the day is slow (warming up) | 5%: a sour shot (1 mark) unless the barista "temperature surfs" (taps E twice; tuning is later). |
| E4 | **Double Trouble** (dual boiler) | $260 | $130 | $3,000 | 4.5 s | Grinder | none | **Espresso and steam in one slot** (section 5). Rare: both boilers hum in harmony, +tips for 30 s. |
| E5 | **La Marzipana Due** (two-group commercial) | $450 | $225 | $18,000 | 4.5 s, **two shots at once** | Grinder | none | ×1.1 price on espresso drinks; draws regulars. |
| E6 | **The Annihilator** | $800 | $400 | $25,000+ | 3.5 s, two groups, +1★ cap | Grinder | Very loud | ×1.2 price; influencer event odds ×1.5. Rare: so loud the café cat leaves for the day. |

### 4.4 The helpers (short trees)

| Tree | Tier | Name | Price | Sell | What it does |
|---|---|---|---|---|---|
| Grinder | G1 | **Spice grinder** *(still smells of cumin)* | $12 | $2 | 4 s. 5%: a cumin note (complaint, 1 mark). |
| | G2 | **Burr grinder** | $30 | $12 | Today's grinder, 2.5 s. |
| | G3 | **The Monolith** (flat burr) | $90 | $45 | 1.5 s, +quality. Replaces the Flat-burr grinder card. |
| Steamer | S1 | **Battery whisk from the dollar store** | $10 | $0 | 6 s, 1 mark on milk drinks; batteries die once a day (dead until night). |
| | S2 | **Milk frother jug** | $25 | $8 | 4.5 s. |
| | S3 | **Steam wand station** | $40 | $15 | Today's steamer, 3.5 s. Optional once you own Double Trouble: keep it as a second wand or sell it. |
| Bin | B0 | **Cardboard box** | free | $0 | Today's bin. |

## 5. Steamer and espresso in one machine

Kennedy's rule: the solo espresso machine has no steam; cheap espresso needs a separate steamer;
the dual boiler lets one person do both at once.

**Proposal: the dual boiler has two sides.** In the sim it's two stations sharing one slot: a group
head on the left (espresso recipes) and a steam wand on the right (steamer recipes), about half a tile
apart. You use whichever side you're facing or standing nearer to. Because stations already keep
working after you walk away, one barista can start a shot, step to the wand and steam milk while the
shot pulls. No new buttons, existing recipes, and bots already understand "an espresso station and a
steamer". The two-group machines (E5/E6) are the same idea with two group heads.

- **What it costs:** slot positions get a small left/right offset for twin stations, and the render
  draws one machine sprite for the pair.
- **Rejected for now:** a hold-E or tap-choice menu ("shot or latte?"). It's a new control and clashes
  with the planned hold-E tuning. **Later rework note:** if two sides feel fiddly at 1280×800,
  revisit with a ticket-driven choice (the machine makes what the oldest matching ticket needs).

## 6. Drinks that level up with use

The game counts every drink served this run. Hitting a count unlocks the next drink (permanently for
the run), with a morning note ("You've pulled 12 shots. Somebody asked for it watered down: Americano
unlocked"). In Gear mode this replaces the day-3 and day-5 unlocks.

| Serve this | This many | Unlocks | Made how (one-button rule kept) | Needs |
|---|---|---|---|---|
| Espresso | 12 | **Americano** | Espresso in hand at the espresso machine (hot-water tap), 1.5 s | E2+ |
| Espresso | 30 | **Doppio** (double, pricier) | Grinder twice, then pull | E3+ |
| Latte | 12 | **Cappuccino** | Latte in hand at the steamer again (extra foam) | Steamer |
| Latte | 25 | **Mocha** | As today (latte + cocoa at the steamer) | Steamer, flavour |
| Espresso + Cold brew | 10 each | **Iced latte** | As today | Both trees |
| Cold brew | 15 | **Sweet-cream cold brew** | Cold brew in hand at the tap (milk) | Any tap |
| Drip | 12 | **Café au lait** | Drip in hand at the steamer | Steamer |
| Drip | 20 | **Red-eye** | Drip in hand at the espresso machine (shot on top) | E2+ |
| (buy D4b) | — | **Pour-over** | At the Pour-Over Bar | D4b |

Matcha and maple cold foam stay card unlocks.

**Recipe clash to solve (Claude):** at the steamer, a latte in hand could become a mocha *or* a
cappuccino. Proposed fix: when two recipes match, pick the one the oldest waiting ticket needs, and
fall back to the first match. Same rule for the espresso machine (grounds → shot, shot → Americano,
drip → Red-eye don't clash, so it's only the steamer today).

**Seeds:** new drinks are appended to the end of `DRINK_IDS`, so the taste map (which hashes the
drink's index) keeps every existing seed's ladders.

## 7. The area's hidden taste

Each Gear-mode run rolls a hidden **area** from the seed (a pure hash, like `taste.ts`, so it doesn't
use the sim's random stream). An area tilts four drink families: **espresso**, **milky**, **iced** and
**filter** (drip and pour-over), and sets the crowd.

| Area | Loves | Meh | Crowd |
|---|---|---|---|
| Campus town *(today's scenario)* | Iced ×1.5 | Filter | Students, low tips |
| Drizzleton *(was Rainy week)* | Milky ×1.5 | Iced | Grumpy, patient for lattes |
| Office park | Filter ×1.5, fast | Pour-over (too slow) | Commuters, impatient |
| Arts district | Espresso and pour-over ×1.4 | Drip | Snobs: pay more, notice quality |
| Gym strip | Iced and espresso, no sugar | Mocha, milky | Early and in a hurry |
| Tourist season *(today's scenario)* | Everything a bit | — | Crowds, big tips |

**How you find out** (nothing is shown up front):
1. **Asked-for orders.** Sometimes a walk-in asks for a family you don't serve ("No iced? Next
   time."). They leave without costing rating, and the morning note counts them: "3 people asked for
   something iced yesterday."
2. **Tips.** Drinks in a loved family tip ×1.2; meh families tip ×0.85. The day's receipt shows tips
   per family.
3. **The street notebook.** A card on the night screen fills in one star rating per family once you've
   served 10 of it ("Iced: ★★★★☆ on this street").

**Gear pulls customers.** Your best tier in a family adds about 5% to that family's orders per tier
above 1, and the top tiers add "snob" regulars. So buying in is how you lean into the area, and
**selling** (night, any time, at the sell price) is how you leave a family behind and free a slot.

## 8. Co-op: voting on big buys

- A **big buy** is any gear costing $50 or more, growing the shop, or selling gear worth $50 or more.
  Supplies and anything under $50 are instant, as today.
- Tapping Buy on a big item opens a **proposal** on everyone's night screen: "Mo wants Double Trouble
  ($260). Yes / No".
- It passes on a **majority of connected humans**. The proposer counts as a yes, and a tie fails. With
  one human it passes instantly. Bots don't vote.
- Cash is checked when it passes. One open proposal at a time. Proposals lapse when the night ends.
- Sim shape (same pattern as close-early): `state.proposal?: { by, item, yes: PlayerId[], no: PlayerId[] }`
  plus inputs `propose`, `vote` and `sell`.

## 9. Mapping onto the code: reused, new, and whose lane

**Lanes:** UI = `src/ui`, `src/render`, `src/audio`, `main.ts`, view-models, `index.html`, docs.
Claude = `src/sim`, `src/net`, `src/host`, `src/storage`, `src/data`, scripts and bots.

| Piece | Reused | New | Lane |
|---|---|---|---|
| Gear catalogue | `EQUIPMENT` shape | `src/data/gear.ts`: `GearId` → kind, tier, tree, price, sell, speed, batch, marks, break/spill/temp chances, price mul, flavour, sticker | Claude |
| Gear on stations | `Station`, `slots`, `equipment`, `equipLog` | `Station.gear?`, `equipment` holds gear ids; classic stations map to "classic" gear with today's exact numbers; snapshot migration | Claude |
| Buy, upgrade, sell | `equip` and `slot` inputs | `equip` takes a gear id; new `sell` input; `fittingsValue` uses sell values | Claude |
| Run mode + Night 0 | `createRun`, night phase, ready votes | `CreateRunOptions.mode: 'classic' \| 'gear'`; Gear runs start in the **night phase on day 0** with the $120 fund and an empty bar, so "Pick your gear" is the night shop with only Gear + Supplies | Claude (sim), UI (screen) |
| Pods supply | `SupplyId`, packs, restock | `pods` supply; E1 recipe takes empty hands, uses pods | Claude |
| Drip station | `RECIPES`, `stepStations`, sold-out flow, pass stale times | `drip` station kind, pot state (cups left, warm ticks), `drip` drink | Claude (sim + bots), UI (sprite, ticket) |
| Batch caps | sold-out flow, `reasonOff` | per-day cup counter on cold-brew gear | Claude |
| Downsides | accuracy marks, `placeMess`, egg "blocked station", eggs one-shots | per-use break/spill/temp rolls, "whack it" unjam (3 presses), rare events table | Claude (sim), UI (toasts, sprites, sounds) |
| Dual boiler / two groups | `stationsFromSlots` | twin stations per slot with offsets | Claude (sim), UI (one sprite per pair) |
| Drink level-ups | `unlockDrink`, morning notes | served counters per drink, thresholds in data, ticket-aware recipe pick | Claude |
| Area taste | `taste.ts` hash, scenarios, `orderBias`/`orderTag` effects | `area` from seed, asked-for walk-outs, family tips, notebook selector | Claude (sim), UI (notebook card, receipt rows) |
| Co-op votes | `closeVotes` pattern | `proposal`, `propose`/`vote` inputs | Claude (sim/net), UI (proposal banner) |
| Gear tab | Stations tab (`stationsVM.ts`), night board | Tree view per machine: owned / next / locked, sell button, sticker + flavour | UI |
| Cards | catalogue | Gear mode removes the five machine cards from the deck | Claude |
| Balance | `scripts/balance.ts` | `--mode gear` and an "opening" policy per example opening | Claude |

## 10. Build order (small, revertible, lowest risk first)

Each block is its own branch and merge, with tests green, tsc and build clean, and a screenshot pass.
Nothing changes Classic mode until G11.

| Block | What | Lane | Risk |
|---|---|---|---|
| **G0** | This doc + backlog pointers | UI | none |
| **G1** | Gear data + `Station.gear`; every classic station = classic gear with identical numbers; migration. **Classic runs replay to the cent.** | Claude | low |
| **G2** | Gear stats wired (speed, marks, price mul, batch caps); `equip` by gear id; `sell` input; `mode: 'gear'` + Night 0 with the $120 fund. Cold brew, espresso, grinder, steamer trees as data. | Claude | low–med |
| **G3** | Gear tab (tree view, buy, upgrade, sell) + the "Pick your gear" Night 0 screen; Gear mode toggle on the title | UI | low |
| **G4** | Pods + Pod-o-Matic; drip station, pots and drip drink; bots learn drip | Claude, then UI sprites | med |
| **G5** | Downsides: breakdowns + whack, temp complaints, messy spills, rare events | Claude, then UI toasts | med |
| **G6** | Drink level-ups + the ticket-aware recipe pick | Claude, UI tickets | med |
| **G7** | Area taste: hidden areas, asked-for notes, family tips, notebook | Claude, UI notebook | med |
| **G8** | Co-op big-buy votes | Claude (sim/net), UI banner | med |
| **G9** | Dual boiler and two-group twin stations | Claude, UI sprite | med–high |
| **G10** | Pour-over branch, Kyoto tower, top tiers; full balance pass at 1, 2 and 4 players | Claude | med |
| **G11** | Release: Gear mode default for new runs (Classic stays selectable) → **v3.0.0** | both | — |

Playable checkpoints: after G3 you can play a Gear run with cold brew + espresso. After G5 it has the
full cheap-gear comedy. Each later block can ship as a 2.x minor on its own.

## 11. Tonight-ish backlog (not part of the Gear Tree build)

- **Bots on/off + count in single player** (UI lane). The sim already takes `settings.bots`
  (`0`–`4` or `'auto'`) and the co-op lobby shows Off/1/2/3, but **Play solo** goes straight in with
  `'auto'`. Add the same picker to the solo start and pass it through `runOptions` in `main.ts`.
  Zero bots = a full chaos solo run.
- **Collision spills** (Claude lane). Players don't collide today (bots yield; "nobody collides").
  First, bodies bump. Then a bump while carrying a cup has a chance to spill (Kennedy's guess: about
  60%): the cup is lost and a puddle lands via `placeMess`. Bots bump too.
- **Bots trashing someone else's prep** (Claude lane). Bots pick up grounds or shots a human
  prepped (or pulled for them) and bin them when no ticket matches. A bot should not take an item a
  human started in the last N seconds, and should wait longer before binning.

## 12. Later (noted, not planned)

- The **mumbling owner** intro: hands you the keys, explains half of it, wanders off.
- **Tune a station** (hold E for grind, temp, shot time): pairs with E3's temperature surfing.
- **Saved lobbies / long runs** and carry-over between runs (Phase 3 B16).
- Hired staff with wages (Phase 3 B15) interacts with gear: a pro barista on a Pod-o-Matic is wasted.
- Buyable and movable mop bucket.

## 13. Open questions for Kennedy

1. **Startup fund $120, supplies not free.** Is "espresso gamble leaves $12" the right amount of
   pain, or should day 1 come with a free starter bag of beans?
2. **Pods.** Is a pod machine (no grinder, pricey pods, 2★ cap) the right cheapest espresso, or
   should the cheapest real espresso already need a grinder?
3. **Dual boiler as two sides** of one machine (no new buttons). OK, or would you rather a choice
   button at the machine?
4. **Gear mode vs Classic.** Ship Gear as a second mode first (safe for game nights) and make it the
   default at v3.0.0. And should the Gear Tree come **before** wages and saves (B15/B16)?
5. Smaller: are $50 and "majority" the right lines for co-op votes? Should the level-up counts (12
   espresso → Americano) be faster for short game nights?
