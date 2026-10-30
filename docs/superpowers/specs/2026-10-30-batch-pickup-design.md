# Batch coffee, pickup counter and condiment bar: design

> **Approved by Kennedy, 2026-10-30.**

Kennedy's request, 2026-10-30. Built for Gear runs, which are the game: there are no classic runs going
forward (classic is legacy code until the crew votes to bring it back), so nothing here is bent to keep classic
behaviour identical. Sim lane: Claude. UI lane (the Grok agent) draws the new spots, numbers and boxes afterwards.

## Why

Drip coffee and cold brew are batch drinks: you make a lot at once and pour cups fast. Espresso is one at a
time. The game should feel that difference. Serving should also feel like a real café counter: customers
order at the till, wait at pickup, and take their own drinks, and the black-coffee crowd stops at a cream and
sugar bar that someone has to keep stocked. All of it adds jobs to juggle in co-op, Overcooked style.

## Decided by Kennedy

- **Cold brew is planned at night.** On the night screen the crew picks how many cups to steep for tomorrow.
  No walking to the tap.
- **Pickup replaces hand-off** in Gear runs. A customer orders at the till, moves to the pickup area, and takes
  their drink when it is set on the pickup counter. Bots learn the new flow.
- **Condiments are for drip and cold brew** only. Espresso drinks are made to order and skip the bar.
- **The condiment stock box is carried.** Bought at night, it waits in a corner; someone picks it up during the
  day and brings it to the bar. One box refills the whole bar.

## How it works

### 1. Batch drinks pour instantly

- A drip pot that has brewed holds its gear's cups (4, 8, 16, 24), shown as a number above it. Brewing the pot
  still takes its time; **pouring a cup is instant** while cups are left. A pot still goes cold on its gear's
  timer, and a cold or off cup still serves at half tip ("stale but you can serve it"). Unchanged from today
  except that nothing about a pour waits.
- The cold brew tap holds today's steeped cups, shown as a number. **Taking a cup is instant** (no 1.5 s per
  cup). Empty tap = cold brew sold out (the existing sold-out flow).

### 2. Cold brew steeped at night

- Night input `{ kind: 'steep', playerId, cups }`: how many cups the tap(s) hold tomorrow, from 0 up to the cold
  brew gear's daily cap (8, 16 or 30; two taps add up). People only, night only.
- Steeping costs one **concentrate** per cup, paid at night when the day starts (cups the crew can't pay for
  are not steeped; the morning note says so). Cold brew no longer uses concentrate per cup during the day.
- Leftover cold brew keeps one more day and counts toward tomorrow's cups (steeping tops up to the target).
  Cups older than that are poured out at closing (wasted tally).
- The choice is sticky: tomorrow repeats tonight's number unless someone changes it. A new run starts at the
  gear's full cap, so forgetting never leaves the tap empty by accident.
- Night brief: an alert when tonight's target can't be paid for, with a restock fix.

### 3. Order at the till, pick up at the counter

- The counter becomes two spots: the **till** (where the queue orders, as the G4g till today) and the **pickup
  counter** next to it (today's 3-slot pass, grown to 4 slots).
- A customer waits in the till queue with their usual patience. A barista at the till rings them up (use, as
  today); they pay then and move to the **pickup area**, where their patience bar refills partly (half) and
  keeps running.
- Drinks set on the pickup counter (use while holding a drink, as putting on the pass today) are taken by the
  customer who has waited longest for that drink. They tip on pickup (speed tip from the till, stars, twists,
  all as today), then leave, or stop at the condiment bar first.
- Nobody rung up yet means nobody at pickup: an unrung queue just waits. A drink on the pickup counter with no
  customer for it sits there and goes stale on today's pass timers.
- Hand-serving to a customer directly goes away in Gear runs (the till/pickup flow replaces it).

### 4. The condiment bar and its stock box

- A **condiment bar** fixture next to the pickup counter (not a slot; free, every Gear shop has one). It holds
  **20 servings**, shown as a number.
- About **60% of drip and cold brew customers** want cream, milk, sugar or sweetener. After pickup they use one
  serving. If the bar is empty they take it black: tip ×0.8 and a grumble line (tallied as black coffees).
- **Stock box:** on the night screen, "Condiment box" costs **$6** and arrives in the morning in a corner of the
  floor (more than one stack there). A barista picks one up (hands full, like the mop) and uses the bar: it
  refills to 20. A box left unused stays for tomorrow.
- Night brief: an alert when the bar will likely run dry tomorrow (servings vs expected drip/cold brew orders),
  with a buy-a-box fix.

### 5. Waiting longer for made-to-order drinks

Kennedy, 2026-10-30: batch drinks should come fast and their customers should expect that; espresso drinks,
lattes, pour-over and anything one-at-a-time take longer, so their customers should wait longer, or the kitchen
can't keep up.

- Gear runs get their own patience table by drink, replacing the small "fancy drinks wait a little" multiplier
  (`DRINK_INFO[d].wait`) there. (Classic is legacy; it may keep the old multiplier or share this table, whichever
  is simpler.)
- Base patience stays 33 s, then (Claude's call, tune by playtest):

  | Drinks | Patience |
  |---|---|
  | Drip, cold brew | ×0.9 (a touch less than today: it's poured, not made) |
  | Sweet-cream cold brew, café au lait | ×1.0 |
  | Espresso, americano | ×1.3 |
  | Doppio, red-eye, latte, iced latte, matcha | ×1.4 |
  | Cappuccino, mocha, maple cold foam | ×1.5 |
  | Pour-over | ×1.7 (handmade, one cup at a time) |

- These multiply with the existing ones (impatient customers, groups, area crowds, prices), and a group waits as
  long as its slowest order, as today. Customers waiting at pickup keep their drink's pace.

### 6. Bots

- A bot puts finished drinks on the pickup counter instead of handing them over, rings up the queue when it is
  free (the till item in the morning prompt), and carries a stock box to an empty bar when idle.
- The planner suggests the steep number (expected cold brew orders, within the cap and cash) and condiment boxes.

## Events for the UI

`till.rung` (exists), `pickup.take { drink, customer, by }`, `condiment.use { customer }`, `condiment.black
{ customer }`, `condiment.refill { by }`, `steep { cups, paid }`. State: `Customer.stage: 'order' | 'pickup'`,
`Station.potLeft` (exists), tap `batchLeft` (exists), `condiments.servings`, `condimentBoxes` (count in the corner).

## Calls Claude made (check these)

- Pickup counter = today's pass, grown to 4 slots; the till is today's counter spot.
- Patience refills by half when a customer moves to pickup.
- 20 servings per bar, 60% of drip/cold brew customers want them, black coffee = tip ×0.8.
- Box $6; boxes wait in the corner and keep.
- Cold brew: 1 concentrate per cup at night; leftovers keep one day; sticky choice; new runs start full.
- Condiment bar is a fixed fixture, not a slot.
- The Gear patience table above (×0.9 for batch drinks up to ×1.7 for pour-over).

## Not now

Customers taking the wrong drink, names on cups, and Overcooked-style custom recipe orders (later, as Kennedy
said; noted in docs/BACKLOG.md). Walking animations are the UI's.

## Builder's questions, settled by Claude (2026-10-30)

A fresh reviewer read this design as a builder would. Its questions and the answers (all reversible):

1. **Money.** A customer pays at pickup (sale and tip together, as `serveCustomer` does today); the till only
   rings them up and starts the speed-tip clock. Someone who gives up at pickup never paid and counts as lost,
   exactly as an unserved customer today (regulars, influencer and rating bookkeeping unchanged). Still at
   pickup at closing = lost, as today.
2. **Which drinks.** Condiments: plain **drip** and plain **cold brew** only (the drinks people doctor
   themselves). Steeped cups: every recipe that takes cold brew from the tap draws from the same steeped cups
   (cold brew, sweet-cream cold brew, iced latte, maple cold foam), so demand for the steep number counts all
   of them.
3. **Existing runs and saves.** Every Gear run uses the new flow, including Gear saves loaded mid-run (a
   migration puts queued customers in the `order` stage, adds an empty condiment bar with 20 servings, and sets
   the steep target to the gear's cap). Classic legacy runs need no special care: if sharing the new flow is
   simpler than keeping hand-serve there, share it. Tests that assume hand-serve are updated, classic goldens
   included where the change reaches them.
4. **Patience at ring-up.** Ringing up refills patience by +50% of the customer's max (capped at max), replacing
   the G4g till's +25%. The speed-tip clock runs from ring-up to pickup.
5. **Special customers.** Groups ring up once, take each drink as it lands, pay per drink, and leave when all
   are taken. Upset customers (the rogue remake window) wait at pickup like anyone else and take the remade
   drink there; the till skips them as today. Wi-Fi campers never order; the till skips them and the existing
   shoo works at the till. Influencers and regulars go through the normal flow. The name mix-up egg fires at
   pickup.
6. **Layout.** The till keeps the counter's id and spot. The pickup counter sits right next to it, the
   condiment bar next to pickup, and the box corner near the mop's home, per tier; exact tiles are the
   builder's, with two rules: every spot has a walkable tile in front, and nothing blocks the queue lane. Empty
   hands can still take a drink back off the pickup counter. Bots path to the new spots like any station.
7. **Steeping.** The night number is a total target for tomorrow. Leftovers count first; concentrate is charged
   only for the top-up. Cups pour oldest first. Two taps pool the target, filled in slot order up to each tap's
   cap. The cracked-jar quirk removes cups after steeping; the lucky sock is unchanged.
