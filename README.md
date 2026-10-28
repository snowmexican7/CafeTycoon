# CafeTycoon

A small café game built for fun by a few friends, played together in the browser.
By day it's a frantic Overcooked-style scramble; by night it's a timed draft of
random upgrades, so no two runs play the same.

**Play:** https://snowmexican7.github.io/CafeTycoon/

## How to play

A run is one café week: seven days. Each **night** you have 60 seconds to spend the
day's takings on a hand of five random items and to restock beans, milk, and cold brew
concentrate, then press **Open the shop**. Each **day** customers queue at the counter
with patience bars. Grind beans, pull espresso, steam lattes, pour cold brew, and hand
drinks over before they storm out. At the end of day seven you see your score, and can
keep going into harder weeks until the café can't make rent.

- **Move:** WASD or the arrow keys
- **Use a station:** E or Space (stand next to it)
- **Pause and settings:** Esc
- The seed shown in the HUD replays the same week: enter it on the title screen.

Phase one is solo. Online co-op for two to four friends is next.

## Working on it

You need Node 24 (22.12 or newer works) and npm.

```bash
npm install
npm run dev      # local game at http://localhost:5173/CafeTycoon/
npm test         # simulation tests
npm run build    # type-check and build into dist/
```

- Everyone commits to `main` and pulls before pushing. Pushing to `main` runs the tests,
  builds, and republishes the site through GitHub Actions and GitHub Pages.
- Game rules live in `src/sim` as pure functions over one plain state object, stepped at
  60 Hz with a seeded random number generator. Nothing in `src/sim` touches the DOM.
- Items and scenarios are data in `src/data`. Adding an item means adding a record.
- The simulation runs in a Web Worker (`src/host`); the page renders snapshots with
  PixiJS (`src/render`) and plain HTML overlays (`src/ui`).
- Never commit secrets or assets we don't have the right to share. The repo and the game
  are public.

## Where things are

- **Design and roadmap:** [`docs/superpowers/specs/2026-10-28-cafetycoon-design.md`](docs/superpowers/specs/2026-10-28-cafetycoon-design.md)
- **Phase 1a plan:** [`docs/superpowers/plans/2026-10-28-phase-1a-solo-cafe.md`](docs/superpowers/plans/2026-10-28-phase-1a-solo-cafe.md)
- **Playtest checklist:** [`docs/playtest-checklist.md`](docs/playtest-checklist.md)
- **Reference:** [`docs/reference/`](docs/reference/) holds the original build prompt and
  the stack research with verified versions and free-tier limits.
