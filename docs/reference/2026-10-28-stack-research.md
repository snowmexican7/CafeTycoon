# Stack research, 2026-10-28

Facts checked against current documentation on 2026-10-28 by a research agent, for the
design document in `docs/superpowers/specs/`. GitHub release pages omit the year for
current-year releases; dates marked "(inferred)" showed only day and month. Re-check
anything here before relying on it after a few months.

## Rendering

| Item | Finding | Source |
|---|---|---|
| PixiJS stable | v8.22.0, released 1 Oct 2026 (inferred); npm `latest` = 8.22.0 | https://github.com/pixijs/pixijs/releases , https://registry.npmjs.org/pixi.js |
| Phaser 4 | Stable. 4.0.0 shipped 10 Apr 2026 (inferred); latest 4.2.1 (9 Jul 2026); npm `latest` = 4.2.1 | https://github.com/phaserjs/phaser/releases , https://registry.npmjs.org/phaser |
| Phaser 3 | Frozen at 3.90.0 (23 May 2025) | https://github.com/phaserjs/phaser/releases |
| Vite compatibility | Both fine. PixiJS recommends its Vite template (wrap boot code in an async function). Phaser's `template-vite-ts` is Vite-based but pinned to Vite 6.3.1 | https://pixijs.com/8.x/guides/getting-started/quick-start , https://github.com/phaserjs/template-vite-ts |

## Build, test, runtime

| Item | Finding | Source |
|---|---|---|
| Vite | 8.3.5; `engines.node: ^20.19.0 \|\| >=22.12.0` | https://registry.npmjs.org/vite/latest |
| Vitest | 5.0.5; `engines.node: ^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` (Node 20 dropped) | https://registry.npmjs.org/vitest/latest |
| Node LTS | v26 becomes Active LTS on 2026-10-28; v24 "Krypton" moved to Maintenance 2026-10-20; v22 "Jod" in Maintenance until 2027-04-30. Practical pick: Node 24 now, 26 soon | https://github.com/nodejs/release , https://nodejs.org/en/about/previous-releases |
| wrangler | 4.154.0, requires Node >= 22 | https://registry.npmjs.org/wrangler/latest |

## Cloudflare free plan

**Workers Free:** 100,000 requests/day (reset 00:00 UTC; over the limit returns Error 1027),
10 ms CPU per invocation, 100 Workers per account, 50 subrequests per invocation, 64 MiB
script size.
Sources: https://developers.cloudflare.com/workers/platform/limits/ ,
https://developers.cloudflare.com/workers/platform/pricing/

**Durable Objects on Free:** available since 7 Apr 2025, SQLite-backed only (KV-backed is
Paid-only). Limits: 100,000 DO requests/day, 13,000 GB-s duration/day, 5 M rows read/day,
100,000 rows written/day, 5 GB total storage, 100 DO classes per account. Per-object storage
limit is inconsistent across the docs (10 GB in the table, 1 GB in the FAQ). Exceeding a limit
makes that operation type fail.
Sources: https://developers.cloudflare.com/durable-objects/platform/pricing/ ,
https://developers.cloudflare.com/durable-objects/platform/limits/ ,
https://developers.cloudflare.com/changelog/2025-04-07-durable-objects-free-tier/

**WebSockets and Hibernation on Free:** no plan gating found. Billing: opening a WebSocket
counts as 1 request; incoming messages are billed 20:1 (20 messages = 1 request); outgoing
messages are free; duration is not billed while hibernation-eligible. Calling `accept()`
without the Hibernation API bills duration for the whole connection, so use the Hibernation
API. A Durable Object gets a 30 s CPU budget per request or message, separate from the
Worker's 10 ms.
Sources: https://developers.cloudflare.com/durable-objects/platform/pricing/ ,
https://developers.cloudflare.com/durable-objects/best-practices/websockets/

**Credit card at sign-up:** not stated on any official Cloudflare page found. Third-party
guides say none is needed. Unconfirmed.

**KV Free:** 100,000 reads/day, 1,000 writes/day, 1,000 deletes/day, 1,000 list ops/day,
1 GB storage. Source: https://developers.cloudflare.com/kv/platform/pricing/

**Workers AI Free:** 10,000 Neurons/day (reset 00:00 UTC; calls fail once exhausted). Paid
is $0.011 per 1,000 Neurons beyond that. Text models include Llama 3.x and 4 Scout,
gpt-oss-20b/120b, Qwen3, Gemma 4, Mistral Small 3.1, DeepSeek V4, GLM 4.7/5.x, Nemotron 3.
Rate limit 300 requests/min for non-gated text models. Since 28 Jul 2026 a few models
(`kimi-k2.6`, `kimi-k2.7-code`, `glm-5.2`) return 403 on Free; many others stay free.
Sources: https://developers.cloudflare.com/workers-ai/platform/pricing/ ,
https://developers.cloudflare.com/workers-ai/models/ ,
https://developers.cloudflare.com/workers-ai/platform/limits/ ,
https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/

**Realtime TURN (not used by the design):** first 1,000 GB/month of egress free, shared
between SFU and TURN, then $0.05/GB. Credentials must be minted server-side.
Sources: https://developers.cloudflare.com/realtime/sfu/platform/pricing/ ,
https://developers.cloudflare.com/realtime/turn/generate-credentials/

## Peer-to-peer fallback (not used by the design)

Trystero 0.26.0, published 4 Oct 2026, actively maintained. Signalling strategies: Nostr
(default), BitTorrent, MQTT, Supabase, Firebase, IPFS, plus a self-hosted WebSocket relay.
Sources: https://registry.npmjs.org/trystero/latest , https://github.com/dmotz/trystero

## GitHub Actions

Vite's static-deploy guide shows a Pages workflow with checkout, setup-node, configure-pages,
upload-pages-artifact, and deploy-pages, with permissions `contents: read`, `pages: write`,
`id-token: write`. Current majors: actions/checkout v7 (7.0.1), actions/setup-node v7 (7.1.0),
actions/configure-pages v6, actions/upload-pages-artifact v5 (5.0.0), actions/deploy-pages v5
(5.0.1). GitHub's own docs page lags behind these.
Sources: https://vite.dev/guide/static-deploy , the actions' GitHub release pages,
https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

cloudflare/wrangler-action v4.1.3 (24 Sep 2026, inferred); v4 defaults to Wrangler 4. Avoid
4.1.0 and 4.1.1 (broken publish).
Sources: https://github.com/cloudflare/wrangler-action/releases ,
https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/

## Cloudflare API token for deploys

Cloudflare recommends the "Edit Cloudflare Workers" token template scoped to one account. It
grants Workers Scripts Write, Workers KV Storage Write, Workers R2 Storage Write, Workers Tail
Read, Workers Routes Write (zone), Account Settings Read, User Details Read, User Memberships
Read. There is no separate Durable Objects permission; bindings and migrations deploy under
Workers Scripts Write. A minimal custom token is probably Workers Scripts Write plus Account
Settings Read (plus User Details Read for `wrangler whoami`), but no official statement of
the exact minimum was found.
Source: https://developers.cloudflare.com/fundamentals/api/reference/template/
