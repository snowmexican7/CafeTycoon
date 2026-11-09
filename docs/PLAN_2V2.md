# Plan: 2v2, and a busier shop for 3 players

Status: **draft for Kennedy to review (2026-11-09). Not approved to build.**

This replaces the open questions in `docs/P4_B7_VERSUS_SPIKE.md` where they disagree with the bot cut. The spike's "two shops, stepped together" shape still holds. Its "bots fill an empty seat" does not.

Standing rules: human play only. The bot cut is final. A 2v2 match is four people, two teams of two. Nobody is a bot, and neither shop gets a robot cashier (the cashier is solo only). Co-op has no bots. If someone leaves, the run ends, the same as co-op today. A 3-player game is one shared shop with a heavier rush, not a 2v1 and not a bot on the empty seat. No save-compatibility work. A versus snapshot, if it ever exists, waits until saves are a real feature.

## For the player

Four friends. Two teams. Each pair runs its own shop for a week, in the same town, on the same kind of day. Customers walk up the street and pick a shop: the prices, the line, the menu, and the reputation are visible from the pavement. At night each pair plans in private. After day 7 a results screen shows both shops and who won.

Three friends keep one shop, the way co-op works now, and the street is busier: more rush hours, more people ordering two drinks, more office runs. The extra work is the point of having three pairs of hands.

Two friends, or one, stay on today's co-op and solo. Four friends who want a single café together can still host a normal room. 2v2 is a choice, not the only way to be four.

## How this sits on the code

One `GameState` is one shop: one `cash`, one `tier`, one `slots` / `slotGear`, one `customers` list, one `staff`, one score. Putting two teams inside that object means a team key on stations, players, cups, and money. The spike already rejected that. This plan does too.

The host already owns the sim. `createHostRoom` (`src/net/hostRoom.ts`) steps one state and sends it with `diff` / `applyPatch` (`src/net/delta.ts`), plus a full snapshot every `KEYFRAME_EVERY` sends. Seats stop at `ECONOMY.maxHumans` (4) in `src/net/seats.ts`. A versus room is the same room code and the same four seats, with a team on each seat, and the host holding two states.

Customers today are rolled inside the shop. `spawnCustomers` (`src/sim/customers.ts`) draws on `state.rng`, which every other system also draws on. Two shops that start from the same seed and then play differently do **not** see the same people, because a spilled cup or a gear quirk consumes a roll the other shop never consumes. A fair match needs arrivals, drink picks, the scenario, the hidden area (`gearArea`), and the day's events (`drawEvents` in `src/sim/events.ts`) to come from a roll that ignores what the baristas did. The spike's `pickCafe` hash is that idea. It is new code either way.

Two ways to use it. Kennedy picks before any of this is built.

**Same town (recommended).** One arrival roll per tick for the street. The person walks into shop A or shop B. The weight is what they can see: that shop's traffic (tier, reputation, Marketer, ads), its prices (`priceTraffic`), whether the menu can make what people want, and a penalty for a long queue (`tierInfo.queue`, the waiting area). The other shop does not spawn anyone that tick. Over a quiet day the two shops together see about as many people as one busy café, so the match is a fight for a crowd, not two cafés each as busy as solo. Starbuck$ stays off, because the other team is the rival (`src/sim/rival.ts` would double up).

**Mirrored week.** Each shop receives the same arrival list, computed from the seed and the clock, and then plays it alone. Same customers, same weather, no stealing. The scores are compared at close. It is the fairer race and the less social one. It still needs the separate roll. Running two of today's `spawnCustomers` on one seed does not produce it.

A single shared line in one building, with both teams grabbing the same tickets, is the option the roadmap called "one shared customer pool" inside one shop. It needs team ownership on every cup and station. This plan leaves it out.

The 3-player rush fits the sim that already exists. Nothing in `spawnCustomers`, `drawEvents`, or `ORDERS` looks at how many humans are connected. `eventOdds` (`src/sim/effects.ts`) can already multiply `rushHour`. Combo orders are `ORDERS.combo.chance` (0.10) and office runs are `ORDERS.office` (from day 3, half of days, cart and café only, 4–6 drinks). A 3-player room turns those knobs up. It does not add a second state, a protocol change, or a bot.

Scoring already exists for one shop. `scoreRun` is cash above the starting cash plus half the fittings (`src/sim/score.ts`). The week-end screen (`src/ui/weekEnd.ts`) shows one shop's awards. Versus shows that twice.

## Data and state

Same town, when it is built:

- `src/sim/street.ts`, pure: `Street { seed, day, phase, share }` and `stepStreet(street, shopA, shopB, inputsA, inputsB)`. Both shops open and close on the street's clock. Night ends when all four humans are ready (each shop's `ready` list, which co-op already uses).
- Arrivals: one trial per tick from a hash of `street.seed`, the day, and the tick. `pickCafe` weights the two shops. The chosen shop gets the customer through a `spawnInto` that skips that shop's own arrival roll. Drink, patience, and combo rolls for that customer also come from the street hash, so the other shop's spills cannot change who walks in.
- Each shop keeps its own `state.rng` for everything that is not the shared crowd (messes, quirks, steeping, the inspector's mood). Those may diverge. That is fine. They must not feed back into `pickCafe`.
- `StreetView`, the only thing a peer learns about the other shop during the day: display names, the running score, customers served, the queue length, and the street share. Prices and the menu cross the street in the morning, not during the other team's night. Night plans stay on the owner's state, which that team's peers already receive and the other team must not.
- Net: `hostRoom` keeps two wire baselines and sends each peer their shop's snapshot plus `StreetView`. `PROTOCOL_VERSION` bumps. The other shop's full `GameState` never goes out.
- Lobby: a seat's team is `'a' | 'b'`, two and two, chosen before the host starts. `assignSeat` still refuses a fifth human and still refuses the cashier id and any harness id.

Mirrored week, if that is the pick instead: two states, the same street hash, no `pickCafe`. Each arrival is offered to both shops. `StreetView` can hide the other score until the day ends, so the screen is a race rather than a tug-of-war.

3-player variant, one shop, no new state:

- When three humans are connected and the room is not versus, `drawEvents` weights `rushHour` higher, and `spawnCustomers` / the office draw use a higher combo chance and a higher office-day chance.
- Proposed knobs, for a playtest, not a ruling: `rushHour` weight ×1.5 inside `drawEvents` (a day still draws 0, 1, or 2 events, so rush shows up more often and the flicker and the inspector show up a little less). Combo chance 0.10 → 0.14. Office chance 0.5 → 0.65. Do not also multiply `ECONOMY.events.rushHour.traffic` (it is already ×2) or `baseArrivalsPerSecond`.
- Two players and four players in a normal room stay on today's odds. Solo stays on today's odds. The robot cashier does not count as a player.

Win rule, proposed: higher `scoreRun` after day 7. The screen also shows served, lost, walkouts, and average stars, so a shop that sold less coffee but bought the building can be understood. A tie is a shared win. The season (Keep going, four weeks) waits until a one-week match has been played. Starbuck$, street "moves", and poaching the other team's regulars wait with it.

## Screens

- **Title.** "Host a co-op run" stays one shop, up to four people. A second button, **Host a 2v2**, creates a room that will not start until both teams have two players. Three people never land in that room by accident: if the fourth does not arrive, the host can drop back to a normal co-op room (and then the 3-player rush applies) or keep waiting.
- **Lobby.** Four name rows split into two teams. The host drags, or each player picks a side that still has a seat. No bots picker, no cashier toggle. The mode (Blitz or Campaign, once that plan exists) is the host's, same for both shops, so the week is comparable. The first matches should be Blitz: same $120 start, same stand, same week. Campaign versus Campaign is a later use of the same street, not part of the first build.
- **Day HUD.** A thin bar: your score, their score, and the split of the street ("Us 54%"). In a mirrored match the bar can show only your own score until close. The shop floor is yours. You do not see their stations.
- **Night.** Your Restock, Gear, Menu, and Extras. Their prices are not on your Menu tab. The morning note can say "They opened cheaper" after both shops have locked the night, because `StreetView` updates at day start.
- **Week end.** The paper you have, twice, plus a banner with the winner. Awards stay per shop (`ceremonyHtml`). Rematch uses the same teams and a new seed.
- **Three players.** No new screen. The radio and the ticket stack get busier. A one-line morning note ("Three of you. The street noticed.") is enough so the rush does not feel like a bug.

## Build order

1. **Three-player rush.** One shop. Odds only. No protocol change if the odds are derived from the players already in the state. Playtest with three people before touching versus. This is the small piece.
2. **Street roll, no UI.** `street.ts` with a fixed `pickCafe` (or a mirror list) and tests: same seed and same inputs replay; a cheaper, shorter queue wins more of a same-town split; the sum of a same-town day is near one shop's arrival count; a mirrored day gives both shops the same order list even after one shop spills and the other does not.
3. **Hot-seat.** One browser, two shops, four local humans (or two, each playing both roles, for the developer). The share bar is on screen. Tune the weights. Still no network.
4. **Rooms.** Team seats, two baselines, `StreetView`, protocol bump. Two browsers in a room. The other team's night inputs never appear in the first team's snapshot.
5. **Results and rematch.** Week-end side by side.
6. **Four humans.** A real match. Guest lag (`docs/CLAUDE_PROMPT_COOP_LAG.md`) is measured again here, because the host steps two shops.

Phase 1 can ship alone. Phases 2–5 are the match. Do not put a `?versus=1` prototype on the live site until phase 5 has been played in a private room. The live site deploys from `main`.

## Open questions

1. Same town, or a mirrored week, or a lobby choice of both?
2. Is the win `scoreRun`, cups served, or takings? The screen can show all three either way.
3. One week, or the 4-week season once a one-week match feels right?
4. Should both shops share weather and the inspector, even in a same-town match? Recommended: yes, from the street hash, so one shop is not handed a flicker the other dodges.
5. Four friends who want one café: is "Host a co-op run" enough to keep that, with 2v2 as the other button?
6. Someone disconnects in a 2v2. The standing rule ends the run. A four-person match loses more when that happens. Is a short rejoin window worth a special case, or does the rule stay?
7. May a team see the other shop's floor during the day, or only the score bar?
8. Does the 3-player rush apply in a Campaign, or only in Blitz? Recommended: any one-shop room with three humans.

## Risks

- The host does twice the work, and a guest can already become unplayable while the host feels fine. Versus waits on that investigation before it is the default way to play with four. Building the street sim (phases 2–3) does not have to wait.
- A shared `state.rng` would let one team's play rewrite the other team's customers. The street hash exists to prevent that. Tests in phase 2 have to shake one shop (spills, buys, quirks) and show the other shop's arrival list unchanged.
- Sending a full second state "because it is easier" leaks night plans and doubles the guest's snapshot. `StreetView` is the smaller and the safer packet.
- Same-town weights can collapse into "whoever is cheaper gets everyone." The queue penalty and a floor on the share (a proposal: at least 15% of arrivals still see the quieter shop) need the phase 3 playtest.
- 3-player odds can make office runs, which are already 4–6 drinks, swamp a cart. The cart's office size is capped at 6. If the playtest drowns, lower the office chance and keep the rush-hour weight.
- Filling a missing 2v2 seat with the robot cashier or a harness player would undo the bot cut. The match waits for four people.
