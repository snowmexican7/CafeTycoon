# FB1 sim side: design decisions

Source: [`docs/FEEDBACK_PLAN_1.md`](../../FEEDBACK_PLAN_1.md) §3–4 (the binding spec), the FB1 brief,
and Kennedy's 2026-10-29 notes in `docs/BACKLOG.md`. This file records only what the plan leaves
open and what this lane decided. Every shape below is final for the UI lane unless the commit that
ships it says otherwise; each selector file repeats its shape at the top.

Branches cut from `fb1`, merged in this order with `--no-ff`: `fb1-sim-day` (tag `fb1-wp34`),
`fb1-sim-night` (`fb1-wp1s`), `fb1-sim-slots` (`fb1-wp5s`), `fb1-sim-bots` (`fb1-wp6`).
Version numbers are assigned up front so parallel branches never race:

| package | SNAPSHOT_VERSION | PROTOCOL_VERSION |
|---|---|---|
| sim-day (WP3+4) | 22 → 23 | 25 → 26 |
| sim-night (WP1-sim) | 23 → 24 | 26 → 27 |
| sim-slots (WP5) | 24 → 25 | 27 → 28 |
| sim-bots (WP6) | no state change expected; bump only if a shape changes | same |

Branch names: git cannot hold `fb1/sim-day` beside a branch called `fb1`, so the package branches
are `fb1-sim-day`, `fb1-sim-night`, `fb1-sim-slots`, `fb1-sim-bots` (tags as planned). `fb1` was cut
from `main` @ e276359 and the UI lane's WP0 (v2.1.0) was merged into it at f5e3ff8 before any sim
code landed.

## 1. WP3 close early (`fb1-sim-day`)

- **Input** `{ kind: 'closeEarly'; playerId; on: boolean }`. Validated in `validate.ts`
  (`on` must be a boolean). Applied only when `phase === 'day'`, the player is a connected human
  (bots are already filtered by `applyInput`), and at least 15 s of the day have run
  (`secondsToTicks(dayLengthSec) - phaseTicksLeft >= secondsToTicks(15)`). Otherwise ignored.
- **State** `closeVotes?: PlayerId[]` (absent = nobody). Cleared in `startDay` and `startNight`;
  a `leave` removes that player's vote.
- **Trigger** once per day tick, in `stepDay` while the doors are open, before the timer check:
  if there is at least one connected human and every connected human is in `closeVotes`, the sim
  calls a new shared `enterClosing(state)` (the exact three lines the timer uses today:
  `markBeforeGrace`, `phase = 'closing'`, grace ticks), logs `closedEarly { votes, left }` and sets
  `today.closedEarly = <seconds that were left on the clock>`. Checking per tick (not only on the
  vote input) means a vote that becomes unanimous because someone left still closes the shop.
  Solo play closes on the first vote. Rent, challenges and reputation run exactly as a normal
  closing (`finishDay` is untouched).
- **Selector** `closeEarlyState(state)` in `src/sim/closeEarly.ts`:
  ```ts
  { votes: number; needed: number; voted: PlayerId[]; open: boolean; hint: 'soldOut' | 'empty' | null }
  ```
  `needed` = connected humans; `open` = day phase and the 15 s gate has passed; `hint`:
  `'soldOut'` when the menu has drinks switched on but none can be made (`menuDrinks` non-empty,
  `availableDrinks` empty); `'empty'` when no customer is inside, no rogue, and either nothing is
  on the menu or the shop has been empty for 10 s (`state.emptySince`, a tick stamp set when the
  queue empties and cleared when someone arrives). `soldOut` wins when both apply.
- **Morning note** when yesterday closed early: "You closed early yesterday with M:SS still on the
  clock."

## 2. WP4 sold-out walk-ups (`fb1-sim-day`)

- In `spawnCustomers`, the early return for an empty `availableDrinks` becomes: if
  `menuDrinks(state)` is also empty, return (nothing on the board, nobody comes: unchanged); else
  roll one arrival exactly as a normal tick would (`baseArrivalsPerSecond × m.traffic / TICK_RATE`,
  rush hour is already inside `m.traffic`), and on a hit `tally(today, 'soldOutWalkouts')`, log
  `walkout { reason: 'soldOut' }`, and set `today.soldOutAt ??= <seconds into the day>`. No
  customer is created, `lost` is untouched, so the rating is untouched.
- With at least one drink in stock nothing changes: a test steps two identical runs 900 ticks and
  compares `JSON.stringify`. With no stock the stream now differs, by design.
- `DayStats.soldOutWalkouts?: number`, `DayStats.soldOutAt?: number`, `TallyKey` gains
  `soldOutWalkouts`. Migration 22→23: `soldOutWalkouts ??= 0` on `today` and every `days[]` entry.
- Morning note: "N people walked away from a sold-out board yesterday."
- `SimEventKind` gains `'closedEarly'` and `'walkout'`.

## 3. WP1-sim relaxed night and the night brief (`fb1-sim-night`)

- `sanitizeSettings` accepts `nightLengthSec === 0` (relaxed); any other value still clamps to
  30..600. `ECONOMY.nightLengthSec` 60 → 120 and `settingsStore` default 120. Existing browsers
  keep their stored 60 until the UI lane adds the night-length choice (the UI's `main.ts` passes
  the stored value; not this lane's file).
- **Relaxed night**: `startNight` sets `phaseTicksLeft = 0` and `lastCall = undefined`.
  `stepNight` with `nightLengthSec === 0` never decrements `phaseTicksLeft`; it opens when every
  connected human is ready (as today). **Last call**: once `ready × 2 > connected humans` (and not
  everyone is ready), `state.lastCall = secondsToTicks(30)` starts and counts down; at 0 the day
  starts. Once started it keeps running even if more people join. With zero connected humans the
  last call starts at once (bounded fallback instead of a hang; the balance tester never uses
  relaxed nights).
- **Selector** `nightClock(state)` in `src/sim/night.ts`:
  ```ts
  { mode: 'timed' | 'relaxed'; secondsLeft: number | null; lastCallSecondsLeft: number | null; ready: PlayerId[]; needed: number }
  ```
- **Selector** `nightBrief(state)` in `src/sim/brief.ts`:
  ```ts
  interface NightAlert { id: string; kind: 'cash' | 'stock' | 'soldOut' | 'spoil' | 'grow' | 'checkout' | 'rival' | 'signature';
                         severity: 'info' | 'warn' | 'danger'; text: string; fix?: NightFix }
  type NightFix = DistributiveOmit<PlayerInput, 'playerId'>   // the UI adds its own playerId
  nightBrief(state): { profit: number | null; headline: string; alerts: NightAlert[] }
  ```
  `profit` = yesterday's `profitOf` (moved from `src/ui/viewModels.ts` into `src/sim/profit.ts`;
  the UI file keeps a re-export, a one-line edit listed in the report) or `null` on the first
  night. `headline`: first night "Opening night: stock up, then open the shop."; later
  "Yesterday: +$12.84 from 23 cups, 2 walked out." Alerts, sorted danger → warn → info, then by
  the order below; the UI shows the first three:
  1. `cash` danger "You'll be $X short on rent" / warn "Only $X spare after rent" (the
     `nightWarnings` maths, re-implemented in sim; the UI file is left as is).
  2. `stock` danger "<Supply> is out" fix `restock 1 pack`; warn "<Supply> runs out around
     2 PM" fix `restock` with enough packs to cover the day. Run-out estimate: expected use per
     supply over the day (the `expectedUse` maths) → fraction of the day → clock text with the day
     mapped to 8 AM–6 PM (`dayClock(fraction)` exported for the UI).
  3. `soldOut` warn "You sold out at 2:10 PM yesterday and N people walked away" with the same
     restock fix, when `days.at(-1).soldOutWalkouts > 0`.
  4. `spoil` info "About N milk and M pastries will go off tonight" when the expected spoilage
     rounds to at least 1.
  5. `grow` info "You can grow to the cart ($80)" fix `grow`, when the next tier is affordable.
  6. `checkout` info "You can afford the kiosk ($40)" fix `checkout`, when affordable.
  7. `rival` warn "Starbuck$ sells a knock-off of <name> for $X, you charge $Y" when the copy is
     live and undercuts; fix `price`-free (the signature input is too big for a chip).
  8. `signature` info "Your signature has no premium" when a signature exists with premium 0.
  Pure, deterministic, no RNG.

## 4. WP5 station slots (`fb1-sim-slots`)

- **Slots** are fixed back-bar positions per tier (`SLOT_POSITIONS` in `src/data/layout.ts`):
  stand `(1,1) (3,1) (5,1) (7,1)`; cart `(1,1) (3,1) (5,1) (7,1) (9,1)`; café
  `(1,1) (3,1) (5,1) (8,1) (10,1) (11,1)`. The café keeps today's five positions (they are not on
  an even grid) and gains a sixth, empty by default, at the end of the bar. The counter is not a
  slot and stays where it is.
- **State** `slots?: (StationKind | null)[]` (one entry per slot) and `equipment?: StationKind[]`
  (owned, unplaced). Default slots are the tier layout's stations in slot order, so
  `stationsFromSlots(tier, slots)` reproduces today's `state.stations` exactly: same order, same
  positions, ids `grinder`, `espresso`, … for the first of a kind and `grinder-2`, … for the next.
  The counter is appended last. Migration 24→25: `slots = defaultSlots(tier)`, `equipment = []`.
- **Rebuild points**: `createRun`, `applyGrowInput` (slots reset to the new tier's defaults;
  stations that were placed beyond the old defaults move to `equipment`), and the two new inputs
  below. Stations are never rebuilt at `startDay`, so an unchanged run keeps identical state.
- **Input** `{ kind: 'slot'; playerId; index: number; station: StationKind | null }`: night only,
  connected human, `index` within the tier's slot count, `station` not `'counter'`. Placing a kind
  takes one from `equipment` (refused if none); whatever the slot held goes to `equipment`;
  `null` empties the slot into `equipment`. Rearranging is free. Any station can be removed,
  including the grinder and the bin (Kennedy's call: everything is removable).
- **Input** `{ kind: 'equip'; playerId; station: StationKind }`: buy a station at a fixed price
  from `EQUIPMENT` (`src/data/equipment.ts`): espresso machine $45, grinder $30, steamer $40,
  cold-brew tap $35, bin $15. Night only, connected human, cash in hand. The new station goes into
  the first empty slot, else into `equipment`. Prices count in `fittingsValue` at half, like cards.
  This replaces the plan's two dealt cards: cards in the deck change every seed's hands (the
  rule "unchanged runs keep their stream" would break), and a fixed stations shop is what Kennedy
  asked for.
- **Reads from `state.stations`**: `hasStation`, `canMake` (the café shortcut goes), and through
  them `unlockedDrinks`, `menuDrinks`, `uselessAtTier`. Removing the steamer takes lattes, mochas,
  matcha and the special off the board; the `menu` selector gains `reasonOff(state, drink)`
  (`'noStation' | 'noStock' | 'off' | null`) so the UI can say why.
- **No bin**: a human's R key already drops to the floor when no station is in range. Bots gain a
  `floor` step with action `'drop'`: walk to the nearest walkable node with no station within
  reach and no spill, then queue a drop. `dropPlan` and the botched-drink path use it whenever
  no `trash` station exists. A missing bin therefore means grounds piles and spills.
- **Bots with duplicates**: `use(kind, action)` resolves to a concrete station id at plan time:
  the idle station of that kind (not busy, no output, not claimed by another bot's plan) nearest
  the bot, else the first of the kind. The `take` that follows an `insert` keeps the same id. At
  `insert` time, if the station is busy and another idle station of the kind exists, the step pair
  re-targets. `rogue.pickStation` prefers any free station of the drink's kind; `canDrinkEspresso`
  checks any espresso machine in range.
- **Balance**: the tester gains `--layout default | twinEspresso | noColdBrew | noTrash` (applied to
  slots at run start) so the three runs the plan asks for are one flag each.

## 5. WP6 hurried bots and the night planner (`fb1-sim-bots`)

- **Hurried**: `Personality` gains `'hurried'`; `ECONOMY.bots.personalities.hurried =
  { speed 1.15, reaction 0.85, mistake 0.08, preps false }`; `ECONOMY.bots.hurriedQueue = 3`.
  In `act` for a `take` step, a hurried bot with a busy station whose run is in its last 40%
  (`busyTicksLeft <= busyTotal × ACCURACY.earlyShare`) and `customers.length >= hurriedQueue`
  presses use, which is the existing early pull (one star off, `cup.early` log). Roster:
  `BOT_IDS` and names grow to four, `BOT_PERSONALITIES = ['steady', 'hurried', 'rookie',
  'veteran']`, so any game with two or more bots has a hurried one. Runs with bots change their
  stream by design (the roster is the feature); runs with `bots: 0` are untouched.
- **Planner** `src/sim/bots/planner.ts`, pure and RNG-free:
  ```ts
  interface Advice { id: string; kind: 'restock' | 'price' | 'twist' | 'signature' | 'scout' | 'rival' | 'grow' | 'checkout' | 'slot' | 'equip' | 'menu';
                     text: string; input: NightFix; priority: number }
  planNight(state): Advice[]          // sorted by priority, highest first
  crewTips(state, max = 2): (Advice & { by: PlayerId })[]   // the top advice, attributed round-robin to bot crewmates
  ```
  Rules, each one deterministic: restock to the day's expected use plus a margin (the tester's
  target maths moves into the planner); price each drink at the step that maximises
  `priceForecast` profit within −2..+4; twists: set a known 4–5★ twist, drop a known ≤2★ one,
  otherwise try the first untried twist on the best-selling drink; signature: propose the best
  known ≥4★ combo at premium 2 when none exists; scout from day 2 when cash covers rent plus $20;
  when the rival's copy undercuts, match its price (menu step, then premium); grow when cash
  covers the cost plus the rent reserve; otherwise checkout when affordable; place unplaced
  equipment into an empty slot; suggest a second espresso machine when yesterday lost more than
  it served at a one-machine bar and cash covers it. The planner never reads hidden state
  (`comboStars`, `adOutcome`).
- **Tester** `--policy planner`: at stage 0 every advice is applied by `applyAdvice` in
  `scripts/balanceCore.ts`, which mirrors the sim's apply functions the way `tasteNight` and
  `growNight` already do (the tester has no human player). Card buys still come from
  `smartNightInputs`. Advice never spends money in a real game.

## 6. Reversible calls made by this lane

- `closeEarlyState` carries `voted` and `open` beyond the plan's `{ votes, needed, hint }`.
- The `'empty'` hint uses "empty for 10 s" rather than an arrival forecast; a forecast would
  almost never fire under normal traffic.
- `nightBrief.profit` is `null` on the first night rather than 0.
- The day clock maps the open day to 8 AM–6 PM; the UI owns the HUD clock and may remap.
- `nightWarnings.ts` (UI) is not edited; its maths is duplicated in `src/sim/brief.ts` until the
  UI lane re-points it.
