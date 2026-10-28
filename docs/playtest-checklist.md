# Playtest checklist: phase 1a (solo)

**Run on 2026-10-28 against the first deploy of main (b5d3c89).** Items marked with a note
were verified by tests or in the dev-server build rather than on the live site; the next
human playtest should take those by hand.

Run this on the live site, https://snowmexican7.github.io/CafeTycoon/, in one browser.
Tick each box as you go. Open the browser console first and leave it open: the last
line asks whether it stayed clean.

- [x] Title screen shows, with past runs (or "No runs yet").
- [x] Enter seed `1234`, keep pace 3 and 150 s, press **Start solo run**.
- [x] The first night shows a 60 s countdown, $100, five cards, and the restock buttons.
- [x] Buy the cheapest card. Cash drops by its cost and the card disappears.
- [x] Press **Open the shop**. The day starts, and the toast shows the scenario note and the item you bought.
- [x] WASD moves the barista; it stops at walls and at stations. *(verified in the dev server build, 2026-10-28)*
- [x] Stand next to the grinder and press E. Beans drop by one and a progress bar fills. *(verified in the dev server build, 2026-10-28)*
- [x] Press E again when it finishes: the barista holds grounds (small brown circle). *(verified in the dev server build, 2026-10-28)*
- [x] Grounds into the espresso machine, espresso into the steamer: milk drops by one and a latte comes out. *(verified in the dev server build, 2026-10-28)*
- [x] Serve a drink to a matching customer at the counter: cash goes up and the customer leaves. *(verified in the dev server build, 2026-10-28)*
- [x] Let a customer's patience run out: they vanish, and the closing summary counts them as stormed out.
- [x] Buy beans down to zero (or trash grounds until beans run out): Espresso and Latte go strikethrough in the HUD and no customer orders them. *(covered by unit tests; not yet played on the live site)*
- [x] Press Esc mid-day and change the pace to 5. New customers arrive faster; the queue fills.
- [x] Refresh the page mid-day. The title shows **Resume run**; resuming continues the same day with the same cash.
- [x] The closing summary shows served, stormed out, sales, tips, rent, profit, and the reputation change.
- [x] Night 2 shows yesterday's takings and a different hand.
- [x] Reach day 7 (or set day length to 60 s to get there faster). The week-end screen shows the score and the seed. *(covered by unit tests; not yet played on the live site)*
- [x] Press **Keep going**. Night 8 starts, the HUD says "week 2", and rent on the next closing is higher. *(covered by unit tests; not yet played on the live site)*
- [x] Press Esc, **Quit to title**, then **Resume run**: the run continues. *(covered by unit tests; not yet played on the live site)*
- [x] Finish with **See score & stop** (or go bankrupt). The run appears at the top of past runs.
- [x] Start a new run with no seed: the scenario or the first hand differs from the seeded run. *(covered by unit tests; not yet played on the live site)*
- [x] The browser console shows no errors for the whole session.

Co-op has its own list: [`docs/playtest-checklist-coop.md`](playtest-checklist-coop.md).
