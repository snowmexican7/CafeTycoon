# CafeTycoon — Round 6 for Claude (sim lane, Nov 5, 2026)

Kennedy said go on the Nov 5 playtest notes. Cursor builds the UI / art / latte-hand-off / unlock-replay PRs
(`docs/CURSOR_PROMPT_NEXT.md`). **You own the sim pieces below** (your usual lane: `src/sim/**`, `src/data/**`,
`src/net/**`, `src/host/**`, `src/storage/**`, `scripts/**`). Keep usage light: small focused commits or PRs, green
tests, names as built logged under "Claude → Grok" in `docs/HANDOFF.md`.

**Base:** latest `main` (v3.9.2 / a28352e or newer). Protocol **64**, snapshot **33**. Bump both with a one-line note
when shapes, inputs or events change. No save migrations. Deterministic: `rngNext` only, keep `validateInput` in step.
Never force-push. Prefer merge commits / your usual sim workflow; if you open GitHub PRs, still never push straight
over `main` history.

## Already shipped (do not redo)
- Round 5 espresso speed, hopper, bumps, cold-brew refill, `SUPPLY_ID` shelf-as-second-fridge, night Layout, drip-by-till
  (v3.9.0). Hairline art (#21). Serving-counter **draw** (v3.9.2). Solid `frontCounter` in `blocked()` is still open as
  `docs/CURSOR_PROMPT_COUNTER.md` (Cursor / separate) — not part of this round unless you volunteer it.
- Hand-made jug / steam / syrup (FB2 B8, `src/sim/handmade.ts`) stays. Round 6 **refines** it (Cursor block 3): you
  **review** that PR's sim edits; you do not rebuild the meters.

## Your blocks (build these)

### 1. Machines stay usable with a drink pending
**Kennedy:** a waiting shot (or any finished cup sitting as `station.output`) must not lock the machine. Example: a
shot sits on the espresso machine, you walk up with drip for a red-eye — that press should still work. Same rule for
**every** machine so one espresso machine stays versatile.

**Today:** `src/sim/stations.ts` `interact` — empty hands take `station.output` first; a new start requires
`busyTicksLeft === 0 && output === null` (idle). Held-item recipes (americano, doppio, red-eye, iced latte on the tap,
etc. in `RECIPES` / `src/data/drinks.ts`) are refused while output sits.

**Change (proposed):** if the player is holding a cup that matches a recipe whose `takes` is that cup, allow the start
even when `output !== null`. Before (or as) the new job starts, **clear the sitting cup onto the pickup counter** (or
the nearest pass slot / counter the Gear rules already use — prefer `pass` / pickup helpers in `src/sim/pass.ts` /
`pickup.ts` / `drop.ts`) and emit a clear event (e.g. `station.clear { by, station, drink }` — pick a name and log it).
Do not destroy the cup. Busy machines (`busyTicksLeft > 0`) stay busy. Bots must still path and clear sensibly
(`src/sim/bots/brain.ts`).
- **Tests:** espresso with sitting shot + drip in hand → red-eye starts, shot lands on pickup; tap / steamer / drip
  analogues; empty hands still take output first; bots do not soft-lock.

### 2. Patience: less "walk in, order, leave"; more multi / group orders
**Kennedy:** people are too impatient. Don't make them stupidly impatient. Challenge via realistic multi / group
orders (Starbucks-style orders for several people), not faster walkouts.

**Today:** `ECONOMY.patienceSeconds` 33; pace `patience` curve; `ECONOMY.customers` mix / `impatient.patience` 0.6 /
`group`; `src/sim/customers.ts` `patienceFor`, `rollKind`, `spawnCustomers`. Multi-drink: `src/sim/orders.ts` `ORDERS`
(combo chance **0.08** from day 2, office from day 3), `Customer.items`, groups via `CustomerKind` `'group'`.

**Change:**
1. Nudge base / impatient patience **up** slightly (propose numbers; keep day-1 gentler). Do **not** crank impatience.
2. Raise multi-order pressure instead: a bit higher `ORDERS.combo.chance` and/or group mix weight, maybe slightly
   larger group size (`ECONOMY.customers.group.min/max`), without repeating the bankruptcy spike Round 5 already
   tuned away (see the comment on `ORDERS.combo.chance`). Run `gearBalance` / smoke-style checks and report.
3. Keep office runs as the big ticket (`ORDERS.office`).
- **Tests:** update pinned patience / mix tests; add a short note in HANDOFF with before/after served-lost-cash if you
  run balance scripts.

### 3. Serving-tray pressure (penalize dumping group cups on the counter)
**Kennedy:** push the serving tray. If players drop group / multi-drink cups on the pickup counter one-by-one, other
customers can take those drinks, the group order never finishes, patience runs out, and you lose the whole ticket.

**Today:** FB2 B7 `src/sim/tray.ts` — trays claim multi tickets; `trayCovers` stops that customer taking a covered
drink off the counter. `src/sim/pickup.ts` `pickupTarget` lets **any** pickup-stage customer who wants the drink take
a non-covered cup (office runs last). Groups refill patience per cup in `orders.ts` `takeItem`.

**Change:** make dumping unsafe and tray use the safe path:
1. Cups set on pickup that belong to an open multi-drink ticket (`Customer.items` / combo / office / group) stay
   stealable by other customers who want that drink (strengthen or keep `pickupTarget`; make sure singles prefer them).
2. When another customer takes that cup, the multi ticket **loses that line** (mark done or void that item without
   paying the group) **without** the group patience refill, and the thief pays as a normal single serve.
3. If the multi ticket then walkouts unfinished → lose the **whole** ticket (already `order.lost` / void trays) —
   make sure wasted cups / reputation match Kennedy's "lose all of that money" read.
4. Optional light UI event the Cursor lane can toast later (`tray.steal` or reuse `pickup.take` with enough data).
   Bots: prefer the tray table for multi tickets when one is open (`brain.ts`).
- **Tests:** two customers at pickup, group needs latte, single wants latte, group cup on counter → single takes it,
  group missing that drink; tray-covered cup is safe; unfinished group walkout pays nothing.

### 4. Milk counter stocking (rework `SUPPLY_ID`)
**Kennedy:** fridge holds milk; stock the milk counter from the fridge; for cold milk drinks (sweet cream cold brew,
iced latte) take the espresso / cold brew **to the milk counter** and fill there. Do **not** pick milk up as a held
item from that counter.

**Today:** `SUPPLY_ID` (`src/data/layout.ts`, by the sink) is a second fridge door: `isSupply` in `src/sim/fridge.ts`
`fridgeInteract` takes a carton into `tool: 'milk'`. Putting milk out uses `isMilkStation` (`steamer`, `coldBrewTap`
only) → `state.milkOut`. Iced latte / sweet cream finish on `coldBrewTap` (`RECIPES.coldBrewTap` takes espresso /
coldBrew + milk).

**Change:**
1. Empty hands at `SUPPLY_ID` never take a carton. Cartons still come from `FRIDGE_ID` only.
2. With `tool: 'milk'`, E at `SUPPLY_ID` stocks the counter (put servings out there — either reuse `milkOut` with the
   counter as the only / preferred put-out spot for cold drinks, or a dedicated `supplyMilk` / station field; pick one
   and document it). Steamer / wand hot-milk flow can keep using milk out at milk stations as today, or share the same
   pool — say which.
3. Cold finishes move to the milk counter: espresso in hand at a stocked `SUPPLY_ID` → iced latte; cold brew in hand →
   sweet cream (consume milk from the counter's stock). Adjust `RECIPES` / `recipeFor` / interact so the tap is no
   longer the only place (tap can keep pouring plain cold brew).
4. Closing / spoil / Udder-Matic / bots: update `fridge.ts`, `brain.ts`, and Round 5 `coldBrewRefill` / supply tests.
5. Bump protocol/snapshot if state shape changes.
- **Tests:** no grab from supply; fridge → supply stocks; iced latte / sweet cream at supply; empty stock → no-op +
  honest gate; steamer latte still works.

Cursor block 4 draws this once you land it.

### 5. Open grace (5–10 s) + VIP / ultra fans
**Kennedy:** a short café-open period with no regular customers so the crew can dump old coffee and stock milk. If
anyone arrives in that window, they are VIP / ultra fans: super patient, willing to wait through a longer getting-ready
stretch as a favour for showing up early.

**Today:** Round 5 removed morning pre-open; day starts with doors open and `spawnCustomers` immediately
(`src/sim/step.ts` `stepDay`, `src/sim/customers.ts`). Closing grace exists (`ECONOMY.closingGraceSeconds`); there is
no open grace. `CustomerKind` is `'normal' | 'impatient' | 'group' | 'regular' | 'influencer'`.

**Change:**
1. Add `ECONOMY.openGraceSeconds` around **8** (tunable in the 5–10 range Kennedy gave). For that many seconds after
   day start, **do not spawn regular / impatient / group / regular-kind** customers.
2. Optionally allow a rare VIP spawn in-window: new kind or flag (e.g. `kind: 'fan'` or `egg: 'fan'`) with a high
   patience mul (propose ~2–3×, tips fine), who will wait through setup. If none spawn, the window is simply empty —
   that is OK.
3. After the grace, spawning returns to normal. Influencer events stay as they are.
- **Tests:** no normal arrivals in the first N seconds; VIP (if implemented) has high patience; after grace, mix
  resumes; bots / closing soon unchanged.

### 6. Review Cursor's latte instant-in-hand sim edits
Cursor block 3 will edit `src/sim/handmade.ts` (and possibly `stations.ts`) so fill → steam ends with the drink **in
hand**, no steamer wait / second E. Comment on the PR: determinism, grades, bots, syrup, cooling `heldSince`, and no
stuck `station.output`. Propose a fix commit only if something is wrong.

## Not for you this round
- Hair / icons / tip-bubble chrome / unlock-replay presentation (Cursor).
- Full first-run tutorial / "I've played this before" (ROADMAP Later).
- Co-op night-menu scroll jump (note only).
- Solid `frontCounter` unless you take `docs/CURSOR_PROMPT_COUNTER.md` as an extra.
- Building Cursor's UI blocks.

## When you're done
Log under **Claude → Grok** in `docs/HANDOFF.md`: what landed (commit / tag), protocol/snapshot, test count, balance
notes for patience / combo chance, and any Needs for the UI lane (milk-counter draw, unlock pending field name, steal
toast event).
