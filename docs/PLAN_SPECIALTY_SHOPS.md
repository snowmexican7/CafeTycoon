# Plan: the shop becomes what you sell

Status: **draft for Kennedy to review (2026-11-09). Not approved to build.**

Standing rules: human play only. No bot logic. The robot cashier rings the till and does not take orders or suggest drinks. Co-op has no bots. No save-compatibility work. New fields bump the snapshot and old saves are refused.

## For the player

The shop picks up an identity from what you have actually been selling, over the last few days.

Sell mostly lattes and espresso and the place becomes a specialty shop. Those drinks can cost more. People who walk in ask for them. The expensive espresso machine and the good wand start to pay for themselves, because that is what the street wants from you.

Sell mostly drip and the place becomes a fast counter, in the Tim Hortons and Dunkin sense. More people, more cups of drip, and pastries matter. The urn and the pastry case are the purchase that fits.

Sell a mix and you stay a neighbourhood café. Nobody is pushed. The menu you wrote is the menu you serve.

Now and then someone wants the thing you barely make. A latte regular in a drip shop, a drip in a latte bar. You can turn them away, scramble and make it, or offer them what you are actually good at.

The Strategist and the Marketer lean into whatever identity you have earned. They do not pick it for you on night 1.

## How this sits on the code

Orders are already a weighted draw. `drawDrink` (`src/sim/customers.ts`) multiplies, for each drink on the menu:

- the forecast's `orderBias`
- the drink's own `bias`
- `demandFactor` (price against the list price; too dear and people walk out with "Too pricey!")
- `gearPullMul` (`src/sim/gear.ts`): the best machine you own in that family adds 5% per tier above 1 (`GEAR_PULL`), plus a machine's `draws` multiplier, plus the hidden area's `pull`
- `milkPush` (`src/sim/lattes.ts`): once a wand exists, latte and cappuccino are scaled toward 42% of orders (`LATTES.milkShare`), up to ×4

Families already exist (`src/data/areas.ts`): espresso, milky, iced, filter. Drip, café au lait, red eye, and pour-over are filter. Latte, cappuccino, mocha, and matcha are milky. A hidden area (`AREAS`: campus, Drizzleton, office park, arts, gym, tourist) already tilts a run toward a crowd. That tilt is chosen for you at the start. This plan's identity is earned from sales, and it stacks on top of the area rather than replacing it.

`gearAskedFor` is the cousin of the one-off customer, and it is the wrong tool to stretch. It fires when the area loves a family that is not on the menu at all (`AREA_ASK` 0.12). Those people leave, no reputation hit, and the morning note counts them. They never reach the counter. A one-off here wants a drink you do sell, just almost never.

Cups served per drink are already on the receipt: `DayStats.drinks`. Tips per family are `DayStats.tipsByFamily`. Pastries are a side sale on any served drink, 35% when the case has stock, $3 (`SPOIL.pastry` in `src/sim/spoilage.ts`, called from the serve path). Nothing groups the last few days into a shop type.

The Strategist (`src/sim/hires.ts`, $1/day) makes the night forecast honest and sets peak prices, and turns the menu toward drinks you can make (`strategistNight`). Hand prices last until the next night. The Marketer ($2/day) is a flat ×1.15 traffic (`MARKETER_TRAFFIC`). Ads (`src/sim/ads.ts`) are a separate one-night buy (Palm Book and the others) with a flop / fine / viral hash. Identity should hook the two hires. Ads can stay one-night posters.

`milkPush` will fight this plan if it stays as it is. Any shop that buys a wand is pulled to 42% lattes no matter what the last three days looked like. Specialty identity only means something if that push steps aside once an identity is active, and the identity weights take the job. A pot shop with no wand never hits `milkPush`, which is what Campaign day 1 needs.

Gear you own already pulls orders a little (`gearPullMul`). Identity pulls from what you sold. Both can apply. Buying a second espresso machine pays twice: it is faster, and, once the window fills with milk drinks, the street sends you more of them. The pull has to be gentle enough that a neighbourhood café is a stable middle, not a ledge you fall off the first day you sell eight lattes.

## Data and state

Proposed, all retunable:

- Keep the last 3 scored days of `DayStats.drinks` on the state (`soldWindow`). The receipt already has the daily map. Three days is long enough that one office run does not rename the shop, and short enough that a real change of menu shows up inside a Blitz week.
- At night start, after the window has at least one day, set `shopIdentity`: `'specialty' | 'fastCasual' | 'neighbourhood'`.
  - Specialty when espresso + milky cups are at least 55% and milky is the biggest family.
  - Fast-casual when filter cups are at least 50%.
  - Neighbourhood otherwise.
- Iced drinks (cold brew, iced latte, sweet cream) count in the denominator and do not have their own shop in this draft. A cold-brew-heavy shop stays a neighbourhood café until you say otherwise. See the questions.
- Effects while the identity holds, from the next day:
  - Specialty: `drawDrink` ×1.4 on espresso and milky. Menu prices for those families ×1.10, on top of the tier price and any machine `priceMul` (the Annihilator is already ×1.2). `milkPush` returns 1 while an identity is set.
  - Fast-casual: `drawDrink` ×1.5 on filter. Filter prices ×0.90. Pastry attach on a filter drink goes from 0.35 to 0.60. A small traffic bump, proposal ×1.08, so the day feels busier without copying the Marketer's ×1.15.
  - Neighbourhood: weights and prices as they are today, and `milkPush` stays so a mixed shop with a wand still sells lattes.
- One-off: after the identity exists, a small chance (proposal 8% of arrivals) the drink is drawn from the menu's light side, the families under 15% of the window, instead of from the identity weights. The customer is tagged (`Customer.oneOff: true`) and the ticket says so. They still pay and still wait.
- What you do with them:
  - **Turn away.** A button on that ticket, or a key at the till, before the drink is made. They leave. No reputation hit, same idea as `gearAskedFor`. The cup is not lost and not wasted.
  - **Scramble.** Do nothing special. Make the drink with the normal recipe. Their patience is the normal patience. The ticket label is the only pressure.
  - **Substitute.** At the till, offer your top seller in that identity (the latte, or the drip). On accept, the ticket's drink changes before anyone makes it. On decline, they become a turn-away. This is the only one that edits an order, so it is its own phase.
- Strategist, when hired and an identity is set: the morning note names it ("The street thinks you're a latte shop"). Peak prices use the specialty premium or the fast-casual discount instead of a single curve. The Strategist does not turn off the other drinks. You can still override until the next night, which is the rule you already have.
- Marketer, when hired and an identity is set: the ×1.15 traffic stays, and those extra people order from the identity's families. A neighbourhood café's Marketer stays the flat bump you have now. The hire card says which one you are buying.

Blitz and Campaign both use this. A Blitz player who buys a wand on night 1 can become a specialty shop by mid-week. A Campaign player who keeps the pot becomes fast-casual without buying an espresso machine. The hidden area still adds its own tilt, so an office-park Campaign and an arts-district Campaign do not feel identical.

## Screens

- **The shop.** A small sign on the wall or the cart, from the identity: "Latte bar", "Quick cup", "Neighbourhood café". Neighbourhood can stay unsigned until the window has a day of data, so day 1 does not label you.
- **Night, Menu tab.** One line under the forecast: how the last three days split, and the name. With a Strategist, the line is the honest version and the prices they set show the premium or the discount, the way "Set by Strategist" already marks their prices.
- **Hire cards** (`night.ts` staff cards). Strategist blurb gains "Prices the shop you've become." Marketer blurb gains "Sends people who want what you already sell." Wages stay $1 and $2.
- **Tickets.** A one-off ticket wears a tag ("Not your usual") the way a fan ticket wears "Early bird". Turn away and, later, Substitute are buttons on that ticket. Scramble is just making the drink.
- **Receipt.** A line for the identity and, on a fast-casual day, the pastry count you already track (`DayStats.pastries`) sits next to it.
- **Street notebook.** The area crowd ("Commuters: impatient, love filter") stays. The identity is yours; the area is the neighbourhood you rolled. Showing both stops the sign from feeling random.

## Build order

1. **Name only.** Record `soldWindow`, compute the identity at night, show the sign and the Menu line. Orders, prices, and pastries do not change. You can play a week and see whether the label matches the shop you thought you ran.
2. **Weights and prices.** The multipliers above. `milkPush` steps aside when an identity is set. "Too pricey!" still uses `demandFactor`, so a specialty premium can drive walkouts if it is too high. That is the playtest.
3. **Fast-casual pastries.** Attach chance on filter drinks only. The case still has to be stocked. An empty case changes nothing.
4. **One-offs, turn away and scramble.** Tagged customers. Turn away logs a walk-on with no reputation hit. Scramble is the default if you ignore the button.
5. **Substitute.** Ticket edit at the till, before the drink is started.
6. **Hires.** Strategist prices and the Marketer's extra crowd follow the identity. Hire cards updated in the same phase so the UI does not promise a behaviour the sim lacks.

Phase 1 can ship alone. Phases 2 and 3 are the game. Phases 4–6 are the conversations at the counter and the staff.

## Open questions

1. Are the three identities enough? A cold-brew shop (the Hanes Method through the Slow Tower) is a real Gear path and would fall through to neighbourhood under the draft.
2. Is three days the right window for a 7-day Blitz, and should Campaign use a longer window so one odd day does not rename a shop you have run for a month?
3. Is +10% / −10% the right price, or should specialty be a tip bonus instead of a higher sticker, so "Too pricey!" does not punish the fantasy?
4. Should a one-off be rarer in Campaign (you are allowed to be a drip shop) and a bit more common in Blitz (the week should show you the choice)?
5. Does turning someone away ever cost reputation if you do it all day? Draft: no, matching `gearAskedFor`. A daily cap (proposal: the sixth turn-away starts to cost) is the alternative.
6. Should the Strategist be allowed to rename you, or only to price the identity you already earned? Draft: they never set the identity. Sales do.
7. Do co-op partners share one identity (one till, one window)? Draft: yes. There is one menu and one `DayStats`.

## Risks

- `milkPush`, `gearPullMul`, area `pull`, and a new identity multiplier can stack into a shop that only receives one drink. Phase 2 should cap the combined weight (the identity multiplier applies, and `milkPush` is off, so the stack is one system plus the smaller gear and area pulls). A test that builds a latte window and still sees drip orders belongs in that phase.
- Specialty prices plus `priceMul` on the Annihilator (×1.2) plus the tier can overshoot. The premium should apply to the menu price before the machine's multiplier, and the playtest should watch `priceWalkouts`.
- Classifying from drinks served, not from drinks ordered, means a shop that fails every latte looks like a drip shop. That is the honest reading (you sold drip) and it can feel unfair. The window can count orders placed instead of cups served. Question for the playtest of phase 1, which shows the label before it changes anything.
- One-off customers who are slow to leave will clog a three-person queue on the cart. Turn away has to be available before they are rung up, and scramble has to use the normal patience so they are not a second office run.
- The Marketer's extra crowd ordering only specialty drinks makes the identity stickier, which is what you want, and makes it harder to switch. The three-day window is the way back. If phase 6 makes switching impossible, drop the Marketer's bias and keep the flat ×1.15.
- None of this adds a bot to recommend drinks. The Strategist's note is the same unvoiced night text the hire already produces.
