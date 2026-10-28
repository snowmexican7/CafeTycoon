# CafeTycoon

A small café game built for fun by a few friends, played together in the browser.
By day it's a frantic Overcooked-style scramble; by night it's a timed draft of
random upgrades, so no two runs play the same.

**Play:** https://snowmexican7.github.io/CafeTycoon/

## Where things are

- **Design and roadmap:** [`docs/superpowers/specs/2026-10-28-cafetycoon-design.md`](docs/superpowers/specs/2026-10-28-cafetycoon-design.md)
  is the source of truth for what the game is, what phase one includes, and which
  accounts and services the whole roadmap needs.
- **Reference:** [`docs/reference/`](docs/reference/) holds the original build prompt
  (superseded, kept for its numbers) and the stack research with verified versions and
  free-tier limits.

## Working on it

- You need Node 24 (22.12 or newer works). Clone the repo, then `npm install`.
- `npm run dev` starts the game locally, `npm test` runs the simulation tests, `npm run build`
  type-checks and builds the site into `dist/`.
- Push to `main` and GitHub Actions runs the tests, builds, and republishes the site.
- Pull before you push.
- Never commit secrets or assets we don't have the right to share. The repo and the game
  are public.
