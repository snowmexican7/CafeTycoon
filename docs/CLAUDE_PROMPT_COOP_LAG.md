# Claude — investigate co-op guest lag (2026-11-07)

Kennedy reports that the host plays smoothly while the joined player sometimes becomes almost unplayably laggy, apparently more recently. This was not investigated during Round 6 / the bot cut / v3.10.0. Start from latest main. Investigate and measure; do not rewrite the networking stack on a hunch.

## Context and boundaries
- `docs/HANDOFF.md`, Decisions 2026-10-31, parks the per-tick `structuredClone` speed fix. Its v3.8.0 UI handoff also says none of those PRs touched it. That was a host whole-GameState copying concern, not an established diagnosis of guest lag. Verify its present implementation/history before attributing blame.
- The earlier handoff to this investigation reports cross-machine WebRTC joining was untested at v2.2.0; verify the historical testing record and explicitly distinguish actual cross-machine testing from local/synthetic tests.
- HANDOFF Decisions 2026-11-05 parks the co-op night-menu scroll jump: one person's click sends the other's screen to the top. Full menu re-render/scroll reset is only a hypothesis. Mention a possible relationship if evidence supports it; do not fix that UI issue here.
- Follow HANDOFF's lanes: Claude owns `src/sim/**`, `src/net/**`, `src/host/**`, `src/storage/**`, `src/data/**`, `scripts/**`; Grok/Cursor own UI. Preserve `docs/PLAN_BOTS_CUT_AND_WANDS.md` and the Decisions bot cut: no new bot logic.

## Investigation
1. Reproduce a host/guest session, preferably on separate machines. Record build, shop/day, player count and network conditions; compare a quiet early game with a busy, expanded shop. State any reproduction limits honestly.
2. Measure update/snapshot bytes, send frequency and burstiness, serialization/copy/apply costs, guest frame hitches and input-to-visible delay. Report representative and worst-case observations, not guesses.
3. Trace the real host/guest paths starting with `src/net/hostRoom.ts`, `peerSession.ts`, `delta.ts`, `sendGate.ts`, `protocol.ts`, `peerTransport.ts`, `roomLink.ts`, `transport.ts`, plus `src/host/**` and the Trystero/WebRTC adapter they use. Establish full-state versus delta behavior, guest replacement/application, interpolation or snapping, and any queued/bursty or overly frequent sync. These are starting points, not an asserted root cause.
4. Test whether the parked per-tick clone, growing state (stations, events, tray, milk, fans), or recent protocol changes correlate with guest hitches. Separate host cost, transport/backlog, guest application, and UI/render cost. Do not assume a good-feeling host rules out a network or host-send issue.
5. Log findings under **Claude → Grok** in `docs/HANDOFF.md`: reproduction, measurements, exact files/functions/constants/events, cause or remaining hypotheses, proposed smallest fix, and test results. Flag UI findings for Grok rather than changing them.

If the cause is clear, propose a small reversible fix with before/after measurements. Wait for approval for a large redesign. If sim/net changes are made within the approved scope, add regression tests, keep existing tests green, and document protocol/snapshot implications. Do not edit UI except the minimum required to compile after a net event rename; list every such file for Grok. Never force-push.

Not in scope: growth-order or free-layout playtest notes, bot work, night-menu scroll fixes, or a net-stack rewrite.
