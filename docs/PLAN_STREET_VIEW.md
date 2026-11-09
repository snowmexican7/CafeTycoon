# Plan: cars going by, and sometimes one stops

Status: **draft for Kennedy to review (2026-11-09). Not approved to build.** Kennedy's son's idea.

Standing rules: human play only. Cars are scenery and, later, a way a normal customer arrives. They are not drivers with AI, not staff, and not bots. The robot cashier stays at the till. Co-op has no bots. No save-compatibility work. The first phases add no snapshot fields.

## For the player

The view drops a little so you can see the street in front of the shop. Cars drive past. A few of them have a little bubble, the way a customer does: "That line though", "Smells good", "Is that a café yet?". They do not come in. The shop plays the same.

Later, some cars pull over. The driver gets out and walks in the door, and from then on they are an ordinary customer with an ordinary ticket. The car leaves once they are inside.

## How this sits on the code

The picture is a fixed diorama. `TILE` is 64, the wall band is `WALL` (120), and the margin under the floor is `FRONT` (56) (`src/render/theme.ts`). The scene is `WALL + LAYOUT.height * TILE + FRONT` tall (`src/render/scene.ts`). Sim positions map to the screen as `x * TILE` and `WALL + y * TILE`. Baristas and customers live on the 8-row floor. They do not walk in `FRONT`.

The stand already paints a street in that margin. `buildStand` (`src/render/layers/outdoor.ts`) draws the sidewalk, the brick strip the line waits on, a kerb, asphalt, and yellow dashes. The queue uses the strip (`STRIP_TOP`). The cart's scene is a park plaza (`buildCart`): cobbles, trees, no road. The café is indoors and hides the outdoor layer (`isOutdoor` in `src/render/tierLook.ts`).

The espresso-collapse gag already parks an ambulance in that strip (`CURB_Y` and `PARK_X` in `src/render/espressoPose.ts`). Passing cars leave that kerb clear while the gag is on screen.

Nothing in the sim is a car. Arrivals come from `spawnCustomers` (`src/sim/customers.ts`): one roll per tick against `ECONOMY.baseArrivalsPerSecond` (one every six seconds before traffic modifiers), then a drink, a kind, and a spot in the queue or the waiting area. They appear at the door's queue. A drive-up customer can be one of those arrivals wearing a different entrance. The bubble style already exists for customers ("Hey!", "Too pricey!", "Line's too long!").

Co-op sends the `GameState` and renders it. A car that is only a picture can be drawn from the run seed and `state.tick` on every screen, and it will match, with no new packet and no protocol bump. A car that becomes a customer is already in `state.customers` once `spawnCustomers` adds them. The animation is the renderer's reading of that customer. Guest lag does not grow a second sim.

The specialty-shop sign (`docs/PLAN_SPECIALTY_SHOPS.md`) is optional flavour for the bubbles. The cars do not wait for it. Until an identity exists, bubbles talk about the line, the size of the shop, and the reputation, which are on the state today (`tier`, `customers.length`, `reputation`).

## Data and state

Phases 1 and 2: none. Car position is a function of `state.seed`, `state.tick`, and a lane. Suggested shape, render-only:

- Two lanes in the band under the kerb, so a car never covers the queue.
- A handful of cars (proposal: 4), each with a loop duration and a sprite (a hatchback, a delivery van, a bike if the cart stays in the park). Position = fraction of the loop. Because the fraction comes from the tick, a guest who is a few ticks behind sees the car a few ticks behind, which matches the rest of the shop.
- Bubble text from a fixed list, picked with a hash of the seed, the day, and the car, plus a fact from the state. No model and no Phase 5 AI. Examples of the facts, not the final jokes: a long queue, an empty queue, reputation at 4 or better, the shop still a cart, a specialty sign if one exists.

Phase 3, the car that stops:

- No new entity. A fraction of arrivals (proposal: one in eight, and only when the queue has room) is tagged `Customer.arrival: 'driveUp'`. Everyone else stays a walk-up, which is the absent tag.
- The tag is set inside `spawnCustomers` from the same roll that already decided someone arrived, so drive-ups do not add extra people on top of the day's traffic. They replace the "pop in at the door" picture for that person.
- The renderer parks a car at the kerb for that customer id, plays them walking to `LAYOUT.door`, then deletes the car. After `addCustomer`, patience, drinks, combos, and payment are unchanged.
- The tag is the snapshot bump. It can wait until phase 3. Old saves are refused then, with no migration.

The road band is a render margin. `FRONT` grows by about one tile (64px) so a car is fully on screen under the kerb. The sim floor stays 8 rows. `layoutFor` widths stay. Pathfinding stays off the road.

Which shops get a road:

- Cart on the sidewalk (the growth plan's recommendation): the road is there from day 1.
- Stand: the same road, a bit more of it, since the floor is wider.
- Café: the indoor room stays. A strip of street shows past the door, or through the front window, using the same cars. The café does not become an outdoor scene.
- If the cart remains a park plaza, phase 1 draws the road on the stand and the café door only, and the cart gets cyclists on the path. See the questions.

## Screens

- **The play view.** A deeper bottom margin. The HUD stays where it is. Cars move in the new band. Bubbles sit above the cars, short, and expire. They use the customer-bubble look so they feel like the game, and they stay low so they do not cover tickets.
- **Night.** The cars can keep drifting, quieter, or the street can be empty. Recommended: a slower loop and no bubbles at night, so the night board stays the focus. The Layout map does not include the road. You cannot place a machine on it.
- **Co-op.** Each peer draws from the shared tick. There is no "whose car" . A drive-up in phase 3 is a customer on the one shop, or on the shop `pickCafe` chose if 2v2 same-town exists (`docs/PLAN_2V2.md`). The other team's street is not on your screen.
- **No new buttons** in phases 1 and 2. You cannot honk back. Phase 3 adds no button either: the driver is in line, and you serve them or you don't, like anyone else.

## Build order

1. **The band and the cars.** Grow `FRONT`. Draw the loops on the stand (and the cart, if it has a sidewalk). No bubbles, no sim, no protocol. A solo day and a co-op day should show the same cars for the same seed and tick. The queue, the door, and the tickets stay usable at 1280×800, which is the size the night Layout was already checked against.
2. **Bubbles.** Scripted lines from the queue, the tier, and reputation. Still no sim change. If they clutter the counter, they get a cap (one bubble at a time) before any further phase.
3. **Café and cart coverage.** The window or the door strip for the café. The park alternative for the cart, if the growth plan left the cart in the plaza.
4. **A car stops.** `arrival: 'driveUp'` on some existing arrivals. Park, walk to the door, become the customer you already know how to serve. Snapshot bump, no migration.

Phase 1 is the whole of the idea a player sees first. Phase 4 is the follow-through. 2v2 does not need to exist first. Specialty shops make the bubbles richer and are not required.

## Open questions

1. Should the cart be on a road from day 1? This plan says yes if the growth reorder puts the cart on the sidewalk. If the cart stays in the park, do you want bikes there instead of cars?
2. How chatty are the bubbles? Draft: one at a time, a few seconds, and silent when the queue is already shouting.
3. Do drive-ups replace some walk-ins (draft: yes, one in eight, so the day is not harder), or are they extra customers?
4. Does a drive-up ever order for "the car" as a combo (the game already has a combo blurb about a spouse in the car, `ORDERS.combo`)? Draft: no. They join the normal line. A car-side order is a later idea.
5. Should the street be visible in a 2v2 match, or only in a one-shop game? Draft: your own shop's street, in every mode.
6. Is the café window worth the art, or is the stand and the cart enough for the first version?

## Risks

- The queue stands on the bottom of the floor. A short `FRONT` puts car roofs through people's feet. Phase 1 has to be checked at the resolutions you play, including the shorter window, before bubbles are added.
- Bubbles plus "Too pricey!", bumps, and ticket toasts can stack into noise. The cap in phase 2 is the escape hatch. Drive-by lines must not look like orders.
- Drawing cars from the tick keeps co-op honest only if both peers render the same function. Putting car coordinates into `GameState` would bloat every delta for scenery. Leave them out.
- A drive-up who walks through the counter because the door animation ignores `blocked` will look broken even though the sim is fine. The walk is a render path from the kerb to the door, not a sim path across the bar.
- Guest lag: a peer who is behind sees the car behind. That is acceptable for scenery. It is not a reason to skip the lag investigation, and this plan does not claim to help it.
- Phase 5 AI dialogue is out of scope. The lines ship as a list in the render layer.
