# Plan: Blitz is today's game, Campaign is the long one

Status: **draft for Kennedy to review (2026-11-09). Not approved to build.**

Standing rules for every phase: human play only. The bot cut is final. Co-op has no bots, and a friend leaving ends the run. Solo has the robot cashier (on by default, $1/day, rings the register and nothing else). No save-compatibility work in this plan. Campaign will need a real save later; that is its own last phase, and old saves stay refused until then.

## For the player

Today every run is the same shape. You open a kerbside stand with $120 and an empty counter, buy a machine that first night, and play a week. You can keep going into a short season. That is a single sitting. This plan gives that mode a name, **Blitz**, and leaves it as the quick game.

**Campaign** is the long game. You start with a tiny cash register and a coffee pot, and that is the whole shop. Drip is what you can sell. You buy beans, then a better pot, a fridge, a grinder, an espresso machine, a steam wand, tables, and decorations, and you knock through the wall when you can afford the next size. A campaign is many evenings of the same shop, not one week you finish and score.

## How this sits on the code

Blitz is the run the game already creates.

- `src/main.ts` `runOptions` always passes `tier: 'stand'` and `gear: true` (`?gear=0` is the hidden classic escape hatch).
- `gearStart` (`src/sim/gear.ts`) sets cash from `GEAR_START` (`src/data/gear.ts`: $120, free gear `b0`, the cardboard bin) and zeroes supplies. The first night's Gear tab says "Pick your gear."
- The week is `ECONOMY.scoredWeekDays` (7). Day length defaults to 150 seconds, night to 120. After day 7 the week-end screen (`src/ui/weekEnd.ts`) offers Keep going, which starts a 4-week season (`src/sim/season.ts`, `SEASON.weeks`) and then play with no more targets.
- Growth, checkout, gear trees, the night tabs, the robot cashier, and co-op rooms stay as they are for Blitz.

Campaign is a second start on the same sim, not a second game.

- The register already exists. Every shop begins on the Ka-Ching 3000 (`src/sim/checkout.ts`, `CHECKOUT.register`, cost $0). Ring-up is 1.5 seconds (`src/sim/till.ts` `TILL.ring.register`). The robot cashier already rings that till in solo.
- The pot already exists. The cheapest drip machine is the Thrift Store Special (`d1` in `src/data/gear.ts`: $15, a 4-cup pot, lukewarm after 55 seconds). `canMake` (`src/sim/growth.ts`) already hides every drink the floor cannot make, so a pot-only bar sells drip and nothing else.
- The size ladder already exists: `TIERS` in `src/sim/growth.ts` (stand → cart → café today). Campaign climbs that ladder. The real-life order (cart, then stand, then café) is a separate plan, `docs/PLAN_GROWTH_AND_LAYOUT.md`. Campaign should ship on whichever order is live; it should not invent a fourth size.
- Furniture does not exist yet. Machines live in gear slots. Tables, decorations, and small expansions need the loose layout from that same plan. Until it lands, Campaign can still start with the pot and the register on today's fixed spots.

What is new:

- A mode on the run: Blitz or Campaign. The title screen asks. The lobby shows it so a joiner knows which game they entered.
- A Campaign start beside `gearStart`: the smallest tier, the register, one placed `d1`, the cardboard bin, a small wad of cash, and a little coffee. No "pick your gear" night. The first night opens on Restock, which it already prefers.
- A furniture catalogue that reuses the gear shop's buy / trade-in / co-op vote (`GEAR_VOTE_MIN` is $50) once placeables exist.
- A slower money curve so the café is a long way off. Blitz keeps $120 and the week.

## Data and state

Proposed shape, names to be settled when it is built:

- `CreateRunOptions.mode?: 'blitz' | 'campaign'`, stored on `GameState` as `mode`. Absent means Blitz, so every current test and save stays a Blitz run.
- `campaignStart(state)` after `gearStart`, or instead of the $120 empty-bar setup when `mode === 'campaign'`:
  - Smallest tier (today `'stand'` from `main.ts`; the cart, once the growth plan lands).
  - `slotGear` holds `d1` in one slot and `b0` in the last slot. The other slots stay empty.
  - Checkout stays `{ owned: ['register'], active: 'register' }`.
  - Supplies: a starter scoop of beans so day 1 can brew. Milk, concentrate, flavour, and pastry start at 0, as a Gear run does now.
  - Cash: a proposal to playtest, not a ruling. $40 covers a few bean packs (`ECONOMY.packs.beans` is $7.20 for 10) and the $10 rent on the small tier, and does not cover a Pod-o-Matic ($45) or the Dorm Room Cube ($20) on night 1. Blitz stays at `GEAR_START.cash` (120).
- Menu: drip on, everything else off, because `canMake` is already the gate. The Strategist, once hired, already turns on drinks the bar can make (`strategistNight` in `src/sim/strategist.ts`) and leaves hand-set choices alone until the next night.
- Days and the clock stay on `Settings.dayLengthSec` / `nightLengthSec`. Campaign does not need a new clock for the first phases. "Long" comes from how many days the shop takes to grow, and later from being able to leave and come back.
- Score stays `scoreRun` (`src/sim/score.ts`): cash above the starting cash, plus half the fittings. Campaign's starting cash is the new baseline, so the pot you were given is not a pile of points.

Furniture, when the layout plan can hold it:

- A small catalogue, separate from `GEAR` machines: a table, a chair or a two-top, a plant, a picture, a menu board, a door mat. Each has a price, a sell-back, and a placeable id.
- State: a list of owned placeables and their positions, the same list the night Layout edits. Machines stay in `slotGear` until the layout plan folds them into that list.
- What they do, proposed and easy to retune: a table gives the waiting area one more browser (`ECONOMY.line.waiting` is 0 / 2 / 4 by tier today). A decoration adds a small tip or reputation bump, capped, so the shop cannot be won by buying ferns. An expansion is the existing grow (`{ kind: 'grow', tier }`), not a new size.

Pacing sketch for Kennedy to mark up:

| Moment | What you have | What it costs today |
|---|---|---|
| Day 1 | Register, Thrift Store pot, bin, drip only | Pot is free in Campaign. Beans $7.20 a pack. Rent $10. |
| First luxury | Dorm Room Cube, so milk can exist | $20, stand only (`FRIDGE_CARDS` in `src/data/fridges.ts`) |
| Espresso | Pod-o-Matic, no wand, drinks sell cheaper | $45 (`e1`) |
| Real coffee | A grinder and a wand-less home machine, or a better pot | Burr grinder $30, Mister Kaffee $40, Brevelle $80 |
| Lattes | Sylvia plus the little wand, and milk | Machine $150, wand $25 with it |
| Next size | Cart today, stand after the growth reorder | $70, then the café at $150 |
| Checkout toys | Kiosk, then Squarely | $40 and $2/day, then $75 and 3% (`CHECKOUT`) |

Blitz never walks this ladder from a pot. Blitz still hands you $120 and an empty bar on night 1.

Co-op Campaign uses one shared till, as co-op does now. The split money pool stays a separate Later idea on the roadmap. Solo Campaign includes the robot cashier. Co-op Campaign does not.

## Screens

- **Title** (`src/ui/title.ts`). Two choices above the solo / host / join buttons: **Blitz** ("A week on the stand. Pick your machines tonight.") and **Campaign** ("Start with a register and a pot. Build the café."). The robot cashier On/Off stays on solo for both. The room code and the seed stay.
- **Lobby** (`src/ui/lobby.ts`). The mode is on the room, chosen by the host, shown to everyone before the doors open. Joiners do not pick a different mode.
- **First Campaign night.** Restock, with the pot already on the floor. The Gear shop shows the pot as owned and offers the next machines. The "Pick your gear" banner (`night.ts`, the first-night note) stays on Blitz only.
- **During the day.** The shop already looks like a sidewalk stand, a park cart, or the café (`src/render/tierLook.ts`, `src/render/layers/outdoor.ts`). Campaign day 1 should read as a pot and a register on that smallest floor, which the tier art already supports once the slot only contains `d1`.
- **Receipt.** The grow offer (`src/ui/growOffer.ts`) stays the way you buy the next size. Copy changes with the mode: Blitz can still say "You can afford a cart"; Campaign says what the next room unlocks (more floor, a queue, the crowd) using `growDiff`, which already lists tiles, slots, rent, prices, and traffic.
- **Furniture.** A section on the Gear shop, or a tab after Gear, once placeables exist. Empty until the layout plan can store a position. Buying a table you cannot place yet should wait.
- **Week end.** Blitz keeps "The week is over" and Keep going. Campaign treats each size as a chapter: the same screen, with "Keep building" instead of a final score, until the player chooses to stop. The 4-week season targets stay a Blitz feature.

## Build order

Each phase is playable on its own. None of them migrate old saves. `SNAPSHOT_VERSION` (35) and `PROTOCOL_VERSION` (70) bump when the state or the wire changes, and older snapshots keep being turned away.

1. **Name Blitz.** Title, lobby, and week-end copy. `mode: 'blitz'` on new runs. No sim change. The game plays exactly as it does now.
2. **Campaign start.** `campaignStart`: pot, bin, register, small cash, drip only, smallest tier. Solo cashier and co-op rooms work because they already key off solo versus a room, not off the shop's contents. First night is Restock. Still one sitting, still no save.
3. **Pacing pass.** Kennedy plays the first several Campaign days. Adjust the starter cash, the bean scoop, and rent if the pot shop goes broke before it is fun, or if espresso arrives on day 2. This phase is numbers in `campaignStart` and `TIERS`, plus the receipt copy.
4. **Furniture shop, after loose layout.** Tables and decorations as placeables, with the small effects above. Co-op votes on the expensive ones through the gear vote that already exists.
5. **Chapters.** Campaign week-end copy and a soft goal per size ("the stand is yours when you can pay for it"), still inside one sitting.
6. **Saves, later, when saves are a real feature.** A Campaign run should still be there after a refresh and after you come back another night. `src/storage/snapshotStore.ts` already writes one snapshot and refuses any other `SNAPSHOT_VERSION`. That phase is the one that decides how a Campaign save works. It does not include a migration for today's snapshots, for Blitz snapshots, or for anything written before it. Blitz can stay a session.

## Open questions

1. Is $40 and a free Thrift Store pot the right poor start, or should the pot cost its $15 so day 1 is "buy the pot or sell nothing"?
2. Should Campaign days stay 150 seconds, or run longer so one in-game day feels like a shift?
3. How many in-game days should the pot shop last before a careful player can afford the next size? A week, or several weeks?
4. Does the 4-week season stay Blitz-only?
5. Can a Campaign be co-op from the first phase, or is the first Campaign solo until furniture and saves exist?
6. Do tables and decorations change the sim (waiting room, tips), or are the first ones cosmetic while the machines do the work?
7. The growth reorder (cart, then stand, then café) changes which floor Campaign starts on. Should that land before Campaign's start, or may Campaign begin on today's stand and follow the rename later?

## Risks

- A pot and $10 rent can bankrupt the shop before the player learns it. Phase 3 exists so the numbers move after a playtest, not before.
- `milkPush` (`src/sim/lattes.ts`) leans orders toward lattes once a wand exists. It does nothing on a pot-only menu, because those drinks are not on the board. The moment Campaign buys a wand, the shop starts to feel like today's café. The specialty-shop plan (`docs/PLAN_SPECIALTY_SHOPS.md`) is what keeps a drip shop a drip shop after that.
- Gear balance scripts and `p4Smoke` play today's $120 stand. Campaign needs its own smoke start. Those scripts use the test-only player in `src/harness/`. That player stays in the harness. It does not come back into the game.
- Furniture that blocks the door or the queue is the layout plan's problem. Campaign should not add placeables before that plan's rules exist.
- Calling Campaign "long" before phase 6 is a single long sitting. The save is what makes it a game you return to. Shipping phase 2 without saying that on the title would oversell it.
