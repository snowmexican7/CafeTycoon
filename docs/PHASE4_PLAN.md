# Phase 4 plan: Franchise & rivals, block by block

Phase 3 shipped as **3.1.0** (the Gear Tree shipped first as 3.0.0). Phase 4 works the same way as the
overnight sprints: one dash-named branch per block (`p4-bNN-short-name`), merged into `main` with
`--no-ff` and tagged `p4-bNN`, only when `npx vitest run`, `npx tsc --noEmit` and `npm run build` are
green and the block's own Playwright check passes at 1512x982 and 1280x800. Never force-push.

Roadmap context: [`ROADMAP.md`](ROADMAP.md) (Phase 4). Open items: [`BACKLOG.md`](BACKLOG.md).

## The north star (same as Phase 3)

A simple strategy role-playing game, not an idle game. Every block adds a **night decision with a
trade-off** whose result the crew can read the next night. Everything stays deterministic (seeded
from state only) and visible: if a number changes what happens, the night screen says why. Old saves
keep loading (new `GameState` fields are optional; a snapshot bump needs a migration and a test).

## Blocks, ordered by increasing risk

| # | Block | Decision it adds | Risk |
|---|-------|------------------|------|
| 1 | *(done: tag `p4-b01`, happy hour + faster knock-offs; loyalty card and a rival second shop are follow-ups)* **Rival escalation**: from week 2 Starbuck$ grows with you (a happy-hour day, a loyalty card, a second shop at the cart/café tier), always announced a night ahead | scout and counter, or ride it out | low–medium: extends `rival.ts` |
| 2 | *(done: tag `p4-b02`, four-week season with weekly targets and a medal; the Records season board is a follow-up)* **Seasons**: a season is four weeks of Keep going with a target each week, a season board and a season-end screen; the run save already carries it across game nights | push for the target or bank cash | medium: week-end flow |
| 3 | *(done: tag `p4-b03`, one report for the one shop; per-shop tabs come with block 4)* **Manager reports**: a day report per shop (sales by drink, waits, who did what, wages vs. takings) on the night screen | read it, then staff and price | low: read-only |
| 4 | *(done: tag `p4-b04`, one off-screen branch with area fit, staff and a daily result; more shops, per-shop menus and manager crews are follow-ups)* **Second shop (franchise)**: at the café tier, open a second site in another area; it runs off-screen on a deterministic summary model (its crew, menu, area taste, rent) with a daily result line | when to expand, where | high: new economy actor |
| 5 | **Manager mode**: move hired staff and stock between shops at night; the Manager role sees both reports | who works where | high: depends on 3 and 4 |
| 6 | **Phone calls and travel**: the other shop rings with a problem during the day (a broken machine, a big order); answer it, or travel there for the rest of the day | stay or go | highest single-player risk: two live floors |
| 7 | **2v2 rival chains on a shared street**: two teams, two cafés, one customer stream; results screen | the whole game | highest: needs its own design spike first |
| 8 | **Integration**: full co-op playtests, balance, release **4.0.0** | — | integration |

### Block notes

1. Escalation steps are a pure function of the week and the crew's tier; each shows on the night's
   Heads up list the night before. Counters reuse what exists: scout, price, signature, ads.
2. Season targets scale from the crew's own week-1 score so a weak start still has a goal. The
   season board lives in Records; the week-end screen shows "Week 2 of 4".
4. The off-screen shop never runs the live floor sim; it uses expected demand (forecast × traffic ×
   menu × price curve) with seeded noise, so it is cheap, deterministic and testable.
6. Only after 4 and 5 are proven in a real game night. Travel must not break the host-authoritative
   sync (one live floor per player at a time).
7. Start with a written design and a throwaway prototype; ship behind a `?versus=1` flag first.

## Not in Phase 4

Any AI (Phase 5); the mobile night layout and the save cleanup pass (Phase 6).
