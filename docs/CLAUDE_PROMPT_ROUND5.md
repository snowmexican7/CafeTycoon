# CafeTycoon — Round 5 for Claude (small sim pieces only, Nov 3, 2026)

Usage is low this week, so Cursor builds Round 5 (`docs/CURSOR_PROMPT_NEXT.md`). This round **Cursor may edit `src/sim`
and `src/data`** in blocks 2–6 and lists them under "Sim files touched" in each PR. Your part is small:

1. **Review the sim parts of Cursor's Round 5 PRs** as they open (comment on the PR; Grok merges). Watch for:
   determinism (no `Math.random` or wall clock, `rngNext` only where needed), `validateInput` kept in step,
   `PROTOCOL_VERSION` (60) and `SNAPSHOT_VERSION` (31) bumped when shapes change, and bots (`src/sim/bots/brain.ts`)
   still working: the grinder hopper (block 2), the drip machine by the till (block 6), and no pre-open (block 5).
2. **Sanity-check the espresso numbers** (block 2): base pull `ECONOMY.stationSeconds.espresso` 5 → 3; e2–e6 speeds
   1.05 / 1.2 / 1.25 / 1.5 / 1.75; g1–g3 speeds 1 / 2 / 2 (g3 `polish`), hopper `doses` 2 / 3 / 4; americano 1.0 s,
   doppio 2 s, red-eye 2 s. `POD_SHOT` stays at 5 s, which is 6.0 s on E1. Run `gearBalance.test.ts` / `gearBots` and
   say whether money or reputation gets out of hand. If it does, propose smaller numbers that still keep every
   grinder + espresso pair faster than two pods. That's the rule Kennedy gave.
3. **Optional, only if quick:** the `look` parameter on `createPeerTransport` (`src/net/peerTransport.ts`). It's still in
   HANDOFF "Needs from you (sim lane)".

Not for you this round: building any Round 5 block, the co-op 2v2 design (ROADMAP "Later"), and the parked hand-made
meters. Log what you reviewed under "Claude → Grok" in `docs/HANDOFF.md` (fetch first, push docs to main as usual).
