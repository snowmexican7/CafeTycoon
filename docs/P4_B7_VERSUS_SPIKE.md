# P4 B7 design spike: 2v2 rival chains on a shared street

Status: **design only, no code yet** (written overnight 2026-10-30 as the plan asks: "start with a
written design and a throwaway prototype; ship behind a `?versus=1` flag first"). Nothing here is on
main as behaviour. Kennedy decides before any prototype.

## The game in one paragraph

Four friends, two teams of two. Each team runs its own café on the same street for one week (7 days,
Gear rules). One stream of customers walks the street; each walk-in picks a café by what it can see
from the pavement: prices, the menu, the queue, the café's reputation and whether it's a promo day.
At night each team plans in private (restock, gear, menu, price, a "street move"). After day 7 a
results screen compares the two: score, served, walked out, best day, awards, and who won.

## Options considered

| | A. Two `GameState`s in lockstep (**recommended**) | B. One `GameState` with teams |
|---|---|---|
| Sim changes | Small: a new `street.ts` wraps two states; the floor sim stays single-team | Huge: every station, player, customer, stat and cash field needs a team key |
| Determinism | Each café keeps its own seeded RNG; the street split uses a pure hash | One RNG shared by both teams, so one team's actions shift the other's rolls |
| Net | Host steps both; each peer gets its own team's state (same delta code) plus a small `StreetView` | One bigger state to every peer, including the other team's secrets |
| Saves | `VersusSave {a, b, street}`; each state still loads with today's code | New snapshot version, migration |
| Risk | Medium | Highest |

**Pick A.** It reuses the whole single-café sim and the delta sync, and hidden information (the other
team's night plan) is free because a peer never receives the other state.

## Shape of option A

- `src/sim/street.ts` (new, pure):
  - `Street { seed, day, phase, teams: [TeamId, TeamId], share: {a, b} }`.
  - `stepStreet(street, a, b, inputsA, inputsB)` steps both cafés one tick. Day and night timers run
    off the street, so both cafés open and close together; night ends when all four are ready.
  - **Shared stream:** today each café rolls `rngNext(state) < p` per tick in `spawnCustomers`. In
    versus the street rolls one arrival trial per tick from a street RNG with `p = base × average
    traffic`, then splits it with `pickCafe(street, a, b, tick)`: a weighted choice from each café's
    *pull* (traffic modifiers × `priceTraffic` × menu fit × reputation, with a penalty for a long
    queue), hashed so it is replayable. The chosen café gets `addCustomer` through a new
    `spawnInto(state)` that skips its own arrival roll. Classic and Gear solo play don't change.
  - Starbuck$ is off in versus (the other team *is* the rival). The rival's promo and loyalty card
    become **street moves**: at night a team may pick one move for tomorrow: happy hour (−15%
    prices, +pull), a loyalty card (one-off cost, +pull each day), or "scout" (see the other team's
    prices and menu for tomorrow). Moves are announced to the other team the next morning only.
- Net: `hostRoom` grows a "versus" mode that keeps two `lastSent` baselines (one per team) and sends
  each peer its team's state plus `StreetView {day, share, otherName, otherPrices?, events}`. Guests
  render exactly what they render today; the HUD adds a small "street share" bar. PROTOCOL bump.
- Lobby: `?versus=1` shows a team picker (2 + 2; bots fill an empty seat).
- Results: `src/ui/versusResults.ts`: the week-end screen side by side, a winner banner, awards per
  team, and "rematch".

## Milestones (each its own block, same rules)

1. **V1 street sim, no UI**: `street.ts`, `pickCafe`, `spawnInto`; tests: same seed + inputs gives
   identical runs; a café with lower prices and a shorter queue gets the larger share; neither café
   alone reproduces its solo spawn rate (sum matches the street rate within tolerance).
2. **V2 local hot-seat**: one browser runs both cafés (localLink) with bots on the other team; a
   dev fixture shows the share bar. Playtest the pull weights.
3. **V3 host and net**: per-team baselines in `hostRoom`, `StreetView`, team picker behind
   `?versus=1`. Two-tab test with the existing net test harness.
4. **V4 street moves + results screen.**
5. **V5 four-human playtest** (needs people; B8 territory).

## Open questions for Kennedy

- One week, or a season-length match (4 weeks, best of)?
- Should teams share the same weather and events? (Recommended: yes, it keeps it fair.)
- Can one team poach the other's regulars? (Fun, but needs regular identity on the street.)
- Bots: one bot per empty seat on either team is easy; a full bot team needs bot night planning
  for street moves (Claude prompt territory, not overnight work).

## Not in B7

AI personalities (Phase 5), more than two teams, cross-team trading.
