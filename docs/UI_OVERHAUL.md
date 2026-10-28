# CafeTycoon UI overhaul: draft plan

> Status: **Group A done** (merged to main in `0dc563e`). **Group B next** (see §11 and the constraints and ownership notes below).
> This is Kennedy Daniels' personal project, paid for personally. Work now pushes straight to `main` on his personal GitHub account (`snowmexican7`) after a fetch, rebase, and green tests.

Mockups (static HTML, screenshotted headlessly at 1280×800 @2x; the PNGs are committed in `docs/mockups/`):

| Screen | PNG |
|---|---|
| Title + roadmap drawer open | [`docs/mockups/title.png`](mockups/title.png) |
| Day scene + HUD | [`docs/mockups/day.png`](mockups/day.png) |
| Night planning | [`docs/mockups/night.png`](mockups/night.png) |

The HTML sources for these mockups live in the designer's workspace and aren't committed; ask the Video Game Designer if you need one re-shot.

---

## 1. Art direction: "toy café diorama"

- **Feel:** a warm wooden toy café seen from a slightly raised 3/4 front view, like a tabletop diorama. The goal is Overcooked-level readability in a rush with Animal Crossing-level coziness when things are calm.
- **Shapes:** chunky rounded boxes. Every object has a lighter **top face**, a darker **front face**, and a soft contact shadow, so nothing is a flat square on a grid.
- **Readability first:** each station has a distinct silhouette and color, and its nameplate sits right under it. Order bubbles show the drink icon, not text. Patience is a colored ring that goes green → amber → red.
- **No sprite pipeline for Phase 1.** Everything in the mockups uses primitives Pixi `Graphics` already has: `roundRect`, `ellipse`, `poly`, `circle`, `FillGradient`, and alpha. One person can build it without commissioning art. Sprites can replace pieces later, one station at a time.
- **Motion (cheap juice):** a 2px bob while walking, a squash on hand-off, steam puffs on the steamer, a coin pop on sale, and a toast slide-in. All of this lives in the render layer only and reads `RenderView` plus local time.

## 2. Palette (tokens)

Defined once in `src/render/theme.ts` (numbers for Pixi) and `src/ui/theme.css` (CSS vars), using the same names in both.

| Token | Hex | Use |
|---|---|---|
| espresso | `#3a2418` | ink, dark panels, outlines |
| crema | `#fff4e2` | panel paper |
| latte | `#f3dfc1` | page background, light wood |
| foam | `#fffaf2` | cards, highlights |
| caramel / caramel-dk | `#e08a3c` / `#b9651f` | primary buttons, wood floor accents |
| honey | `#f6c35b` | coins, price tags, lamp glow |
| cherry | `#e0564a` | danger, awning, P1 |
| mint / mint-dk | `#7fcfb4` / `#3f9e80` | success, join, P3 |
| sky | `#9fd0ee` | cold drinks, P2 tint |
| plum | `#8a6bbf` | AI/Phase-4, P4 |
| night / night-2 | `#241c35` / `#33294a` | night tint and HUD at night |
| lamp | `#ffcf7a` | night lamp glows |
| good / warn / bad | green / amber / red | patience ring, stock levels |

Player colors stay as the sim assigns them; the renderer maps them to a cap and name-tag color.
Radii: 10 / 16 / 24 px. Shadows are "toy" shadows: a 4px solid offset plus a soft blur (`--sh-1`, `--sh-2`).

## 3. Fonts (bundled, no CDN)

- **Fredoka** (display: logo, headings, prices, keycaps) and **Nunito** (body). Both are SIL OFL, so they're free to bundle.
- Ship them as `public/fonts/Fredoka.woff2` and `public/fonts/Nunito.woff2`, or add `@fontsource-variable/fredoka` and `@fontsource-variable/nunito` (about 60 KB total). Declare them with `@font-face` in `theme.css` and `<link rel="preload">` them in `index.html`. Pixi text, if used, waits on `document.fonts.ready`.
- The current monospace clock becomes Fredoka with tabular numerals.

## 4. Scene layering (Pixi)

The sim grid is unchanged: 12×8 tiles, `TILE = 64`, with the same station coordinates and collision. The renderer only adds margins and layers:

```
canvas = 768 × (120 wall + 512 floor + 56 front) = 768 × 688
root
 ├─ wallLayer      (static, cached)  wallpaper, shelf+jars, chalkboard menu, window, plants, wainscot
 ├─ floorLayer     (static, cached)  planks, rug, checker customer zone (y ≥ 7.15), doormat, queue rope
 ├─ stationLayer   (static base + dynamic overlay)
 │    base: cabinet (front+top face) + machine + nameplate     ← cacheAsTexture
 │    overlay: progress bar, output-item ring, focus highlight + "E" keycap
 ├─ actorLayer     (dynamic, y-sorted) players, customers, held items, order bubbles, patience rings
 ├─ fxLayer        (dynamic) steam, coin pops, hand-off sparkle
 └─ lightLayer     (static per phase) sun shafts by day; night tint + lamp glows; vignette
```

- `WALL = 120` and `FRONT = 56` are render-only offsets: `screenY = WALL + simY * TILE`. Sim code never sees them.
- **The art footprint matches collision.** Each station's cabinet fills its unit square exactly, because `movement.ts` blocks the whole tile. Machines may rise above the tile (into the wall band) but never extend sideways. Decoration such as plants, the sandwich board, and the rug goes only on non-walkable tiles or under actors.
- Actors are **y-sorted** each frame (`zIndex = y`, `sortableChildren = true`), so a player walking in front of the counter overlaps it correctly.
- **Performance:** static layers are built once and cached with `cacheAsTexture`. Only the overlay, actor, and fx layers are redrawn per frame, which replaces today's single full `Graphics.clear()` redraw. Up to 4 players and about 8 customers is trivial at 60 fps.

## 5. Station designs (see [`docs/mockups/day.png`](mockups/day.png))

| Station | Tile | Look | Busy state |
|---|---|---|---|
| Grinder | (1,1) | tall black body, glass bean hopper | hopper beans swirl, progress bar |
| Espresso | (3,1) | red boxy machine, chrome top, pressure gauge, 2 portafilters | gauge needle moves, cup fills |
| Steamer | (5,1) | steel pitcher on a wand | steam puffs |
| Cold brew tap | (8,1) | blue water-cooler jug with a "COLD" label | drips |
| Trash | (10,1) | green bin with a recycle mark | lid bounce on use |
| Counter | (6,6) | wooden pickup counter: register tablet, bell, "PICK-UP" plate | finished drink sits on the plate |

Shared station overlay:
- A progress bar above the machine, at a per-kind height.
- An output ring showing the item icon when something is ready to collect.
- When the local player is facing and in reach, the station gets a warm outline plus an **E keycap**, which replaces a floating text prompt.

## 6. Characters

- **Players:** a round head with a cap in the player's color, an apron, and the held item drawn in their hands. A name tag floats above them in the player's color. A dashed ring under the feet marks the local player only. A `connected: false` peer is drawn at 40% alpha with a "reconnecting…" tag ("ghosting"); this works once co-op adds that field.
- **Customers:** drawn from the back (facing the counter), each with a different hair and shirt color derived from their id. Above each one sits an order bubble with a drink icon and a patience ring around it.
- **Facing:** body offset and cap brim point in `facing`. Position comes from the existing `interpolate.ts`, which stays as it is.

## 7. HUD layout (day, [`docs/mockups/day.png`](mockups/day.png))

- **Top bar:** logo · Day N with week dots · clock pill (OPEN/CLOSING plus a day progress bar) · cash with the last delta · star rating · ROOM code pill (shown only in co-op) · crew avatars (initials in player colors, + for an open slot) · pause.
- **Left gutter:** ORDERS tickets (drink icon, price, recipe step chips, patience bar). The ticket closest to walking out gets a red border.
- **Right gutter:** PANTRY stock jars (low stock shown in red), a chalkboard MENU with prices, and a MORNING NOTE sticky with last night's card effect.
- **Bottom:** holding slot (what I'm carrying), context hint ("E Grind beans · 2.1 s"), and key hints.
- **Toasts:** these slide in under the top bar ("Bro served a Latte +$4.75 · tip $1.10").
- The **stage** gets a wooden frame and scales to fit between the gutters. On narrow screens the gutters collapse into the top bar.

## 8. Night layout ([`docs/mockups/night.png`](mockups/night.png))

- The café behind the board is dimmed and night-tinted, and the header floats over it: Night N · weekday, a countdown ring, cash, and the room pill.
- The cork/dotted **planning board** holds:
  - a **Receipt** for yesterday (sales, tips, rent, profit, plus served/walked/rating chips);
  - **Restock** rows with low-stock highlighting;
  - **tabs**: Tonight's hand (active), plus Upgrades, Ads, and Pitch an idea, which show as locked "Phase 3" chips for now;
  - **index cards** with a category ribbon, a price coin, an illustration, an effect box, flavor text, and a duration tag. A bought card gets a BOUGHT stamp, and an unaffordable card shows "Need $X more".
- **Footer:** ready pills per player and an **Open the shop** button. This uses the existing night view-model plus the ready state that co-op adds.

## 9. Title screen with the roadmap entry ([`docs/mockups/title.png`](mockups/title.png))

- The background is a storefront illustration (awning, warm windows, string lights, sandwich board) drawn as SVG/CSS in the DOM. This screen doesn't need Pixi.
- **Title card (left):**
  - name and day length fields;
  - a 5-step **pace** selector (Chill → Chaos);
  - **Host a co-op run**, **Join room [code]**, and **Play solo**. The host/join controls come from the co-op work; the overhaul only styles them.
  - the last run and seed.
- **Roadmap pill (top right, always visible)** with an unread badge. It opens the **roadmap drawer**: phases stepper, Suggestions tab, Changelog tab, and a "+ Suggest an idea" button. See [`docs/ROADMAP.md`](ROADMAP.md) for the full spec.

## 10. File-by-file change list (mapped to their code)

| File | Change | Touches co-op files? | When |
|---|---|---|---|
| `src/render/theme.ts` (new) | palette, radii, `WALL`/`FRONT`, station look table | no | **now** |
| `src/render/layers/wall.ts`, `floor.ts`, `stations.ts`, `actors.ts`, `fx.ts`, `light.ts` (new) | draw functions split from `scene.ts` | no | **now** |
| `src/render/scene.ts` | keep the `Scene` class and its `update(view)` signature; delegate to the layers; keep exports `TILE` and `SCENE_BACKGROUND` | no | **now** |
| `src/render/app.ts` | canvas height `WALL + LAYOUT.height*TILE + FRONT`; nothing else | no | **now** |
| `src/render/interpolate.ts`, `keyboard.ts`, `keys.ts` | **unchanged** | n/a | n/a |
| `public/fonts/*` or `@fontsource-variable/*` | bundle Fredoka and Nunito | no (package.json only if using fontsource) | **now** |
| `src/ui/theme.css` (new) | tokens, `.btn`, `.chip`, `.paper`, `@font-face` | no | **now** |
| `src/main.ts` | **one line**: `import './ui/theme.css'` | yes (co-op edits main.ts) | now, as a trivial merge, or after |
| `index.html` | font preload `<link>`s; keep every existing `#id` | yes (co-op adds `#lobby`) | **after co-op merges** |
| `src/style.css` | restyle using tokens; keep every class and `data-action` selector the code uses | yes | **after** |
| `src/ui/hud.ts` | new markup structure (gutters, pills); same `render(vm)`, `toast()` API | yes (`setRoom`) | **after** |
| `src/ui/title.ts` | title card markup plus the roadmap button hook | yes (host/join/rejoin) | **after** |
| `src/ui/night.ts` | receipt, cards, ready footer | low | **after** |
| `src/ui/pause.ts`, `closing.ts`, `weekEnd.ts`, `lobby.ts` | restyle | pause and lobby yes | **after** |
| `src/ui/viewModels.ts` | **additive only** (for example optional `stockLow`, `category`); never rename fields | yes | **after**, and only if needed |
| `src/ui/roadmap.ts` (new) | roadmap drawer: fetch `roadmap.json`, issues, reactions; cache | no | **after** (it hooks into title.ts) |
| `public/roadmap.json` (new) | phase content (see [`docs/ROADMAP.md`](ROADMAP.md)) | no | after |
| `.github/ISSUE_TEMPLATE/suggestion.yml` (new) | suggestion issue form | no | after, **with user approval** (it's a repo change) |
| `src/sim/**`, `src/net/**`, `src/host/**`, `src/storage/**` | **never touched** by the overhaul | n/a | n/a |

## 11. Step order (each step is one small, reviewable commit on `main`)

**Group A: safe while co-op is in progress (render only)** *(all done, merged to main in `0dc563e`)*
1. ✅ **Done** (`0dc563e`) `ui/theme-tokens`: add `render/theme.ts` and `ui/theme.css` plus the fonts. No visual change yet. Tests stay green.
2. ✅ **Done** (`0dc563e`) `ui/scene-layers`: split `scene.ts` into layer modules while keeping today's flat look (a pure refactor). Add a snapshot test that `Scene.update` runs on a sample view.
3. ✅ **Done** (`0dc563e`) `ui/wall-floor`: add the wall band, front margin, and floor art; `app.ts` height change; cache the static layers.
4. ✅ **Done** (`0dc563e`) `ui/stations`: draw the cabinets and machines, progress bars, output rings, and focus plus E keycap.
5. ✅ **Done** (`0dc563e`) `ui/actors`: draw players and customers, y-sorting, order bubbles, and patience rings.
6. ✅ **Done** (`0dc563e`) `ui/night-light`: add the night tint, lamps, and the small fx (steam, coins).

**Group B: next (co-op is on main; fetch, rebase, then start)** *(owner: Video Game Designer, see Ownership below)*
7. `ui/hud`: gutters, pills, and toasts on the new `hud.ts` (including co-op's `setRoom`).
8. `ui/night-screen`: receipt, cards, and ready footer.
9. `ui/title`: title card around co-op's host/join and the storefront background.
10. `ui/menus`: pause, lobby, closing, and week-end.
11. `feat/roadmap`: roadmap drawer, `roadmap.json`, and the issue template (the template needs the user's OK).

Each step ends with `npm test`, `npm run build`, and a quick manual playtest. A step is about 1–3 files and should be reviewable in 10 minutes.

### Group B constraints (from the co-op work; must hold for every restyle)
- The HUD and night overlays are **DOM built from view models**. They are rebuilt only when `hudStructureKey` / `nightStructureKey` change; the clock and cash are **patched in place**. This was the fix for dropped clicks when the overlays re-rendered at 20 Hz.
- Any restyle must keep **render-once-then-patch**: new markup goes in the structural render; anything that changes every tick (clock, cash, timers, progress) is patched on existing nodes, never by rebuilding `innerHTML`. If a new field must trigger a rebuild, add it to the structure key on purpose.
- `src/ui/viewModels.test.ts` must stay green. View-model changes stay additive and optional.

### Ownership (both agents push straight to `main`)
- **Video Game Designer** owns the Group B UI work: `src/ui/*` overlay markup and styles (HUD, night shop, title, menus, lobby restyle, roadmap drawer) plus the title-screen wiring in `src/main.ts`.
- **Claude** (Kennedy's local agent) owns `src/sim/**`, `src/net/**`, `src/host/**`, `src/storage/**`, and the Phase 2 scripted station bots in `src/sim`.
- Whoever needs to edit the other's area says so first. Both run `git fetch` (and rebase) before each piece of work, never force-push, and push only with tests and the build green.

## 12. Risks when merging with co-op

| Risk | Mitigation |
|---|---|
| Both sides edit `title.ts`, `hud.ts`, `pause.ts`, `index.html`, `style.css`, `main.ts` | Co-op is merged; the Ownership note above says who edits what, and both agents fetch and rebase before each piece of work |
| Restyle breaks a selector or `data-action` the co-op code queries | Keep every existing id, class, and `data-action`; add new classes alongside them. Grep for `querySelector` and `data-action` before each Group B PR |
| View-model changes collide with co-op's additions (room, peers, ready) | `viewModels.ts` changes are additive and optional only |
| Canvas height change breaks input or pointer math | The game is keyboard-only today; any future pointer code must subtract `WALL` (documented in `theme.ts`) |
| Peers' positions jitter, which the new art makes more visible | Keep using `interpolate.ts`; actors only read interpolated positions |
| Disconnected-peer state is undefined in the art | Draw at 40% alpha when `connected === false`, and treat a missing field as connected |
| Performance on older laptops | Static layers are cached and only the dynamic layers redraw; no filters except a single cheap vignette |
| Fonts load late and the text reflows | Preload the fonts and wait for `document.fonts.ready` before showing the title |
| Art implies tiles are blocked when they aren't, or the reverse | Art footprint equals the collision unit square, and decoration stays off walkable tiles |

## 13. Notes for the user

- **How changes land:** Kennedy approved pushing straight to `main`. Each agent fetches and rebases first, runs the tests and build, and never force-pushes, so neither overwrites the other. Risky phase work goes on a branch and merges only when green and playtested (see the release approach in [`docs/ROADMAP.md`](ROADMAP.md)).
- Nothing in this plan needs paid services. Fonts are free (OFL), the roadmap storage uses GitHub Issues ($0), and there is no new account.
