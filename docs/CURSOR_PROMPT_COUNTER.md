# Cursor prompt: a full-width front counter (sim + layout)

**Status, v3.11.2 (2026-11-09).** Done. The sim line is `TierLayout.frontCounter` and `blocked()` treats it as solid. The door and a right-hand flap stay open. Classic gets the same line. The counter is drawn from that line (the "don't change the render" line below is out of date: the screenshots needed the full counter). v3.11.0 had already moved pickup to (4, 6), put condiments at (5, 6), and widened the pickup so two people fit at (3, 5) and (4, 5). v3.11.1 did not touch collision. No new bot logic. No save migration; protocol 72, snapshot 37, because the collision rule changed.

Kennedy, 2026-11-05. **This is a sim/layout change, so it is not in the UI lane.** The UI half shipped in `ui-3.9.2`.

## What shipped in 3.9.2 (render only)

- In Gear runs the till (6,6), pickup (5,6) and condiment bar (4,6) now draw as **one solid serving counter**
  (`pickupModel.servingRun` + `stations.buildServingCounter`). It only covers tiles the sim already blocks.
- Classic runs still have only the till, a single one-tile stand, because that is what the sim has.
- The `officePhone` (and morningNote / priceWalkout / trayTable / hairGrid) fixtures now call `ensureCounterSpots`, the
  same as every real Gear morning. Before this, those fixtures showed a till with no pickup counter. That was the bug in
  the 1280×800 screenshot. It was added with the officePhone fixture in bdfc56f (#20), and it was never a game regression.

## What is still open (needs the sim)

There is still no real **divide** between staff and customers. Each station blocks exactly one tile
(`sim/movement.ts` `blocked`). So players and customers can walk around the front counter: the gap at (3,6), the floor
right of the till at (7..11,6), and in classic runs everything except (6,6).

## Ask

1. Add a front-counter line to the layout, `LayoutSpec.frontCounter: { y: number; x0: number; x1: number }`, per tier
   (stand, cart, café). Then make `blocked()` treat those tiles as solid for **players and customers**.
2. Keep these open: the door (1,6), the queue slots (y 7.6), the mop home, the box corner, the rogue's route out
   (rogueStart 6,7 → door), and a **staff gap/flap** so the crew can still reach the front (mop, boxes, pickups that
   need a walk-out). Choose the gap tile per tier and expose it as `frontCounter.gap`.
3. Classic runs: the till row gets the same counter line (no new stations, just solid tiles).
4. Save/load: no new state, it is layout data only. Make sure old saves and slot moves (`slotPos`) don't land a
   station inside the counter line, or that one that does still works.
5. Tests: blocked tiles, a path from the back to the door through the gap, customers queueing and leaving, the
   rogue escaping, bots still reaching every station, and the mop reaching spills in front of the counter.
6. Once `frontCounter` exists, the UI lane will draw the full-width counter from it in `buildServingCounter`
   (it already takes `x0, x1, y`). Don't change the render in this PR.

One-line prompt:

> Read docs/CURSOR_PROMPT_COUNTER.md and implement the sim/layout half: a per-tier `frontCounter` line that
> `blocked()` treats as solid, with a staff gap and the door, queue, mop and rogue routes kept open. Add tests, and
> make no render changes.
