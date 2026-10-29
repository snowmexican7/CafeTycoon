# Changelog

What changed in each build of CafeTycoon, written for the people who play it. The live
site at https://snowmexican7.github.io/CafeTycoon/ always runs the newest version listed
here; each version is also a git tag (`v1.0.0`, …).

**How versions are numbered.** Three numbers, `major.minor.patch`:

- **patch** (`1.0.0` → `1.0.1`): a small change. A fix, a tweak to a number, a wording change.
- **minor** (`1.0.1` → `1.1.0`): a big change. A new feature or system, a new screen, new content.
- **major** (`1.1.0` → `2.0.0`): a phase of the roadmap finished, or an overhaul of something
  that already existed.

Every pull request or push that changes what players see adds a line under **Unreleased**;
when a build goes out, the line moves under its version with the date.

## Unreleased

- **Events you can feel.** Each event opens with a card and its own sting: rush hour lights up a
  marquee board by the door, a power flicker really dims and stutters the lights (with a buzzing
  ballast and sparks off busy machines), the health inspector patrols the floor with a clipboard
  muttering "Hmm." (or "Tsk tsk." at a mess) while a meter shows wasted drinks and floor against
  their rules, then stamps PASSED or FAILED, and the influencer's ring light flashes the room until
  you serve them for a follower bump. The morning note now tips you off about the day's events,
  and the receipt lists them with the inspection result, fines and bonuses.
- **Messy floors you can see.** Spilled grounds pile up in little heaps and dropped drinks
  spread into puddles (cold brew ones are darker). Slipping gets a THUD!, dizzy stars and a wobble;
  the mop has a bucket in the corner, a carry pose and a wet-floor sign that follows whoever is
  mopping, and their name tag says "· mop". A Floor meter on the right says how clean it is and
  warns when an inspector would fail you. All with new sounds: splosh, slide-whistle thud, mop squeaks.
- **The rogue customer, in person.** A customer handed the wrong drink fumes in line with a red
  bubble. If you don't fix it, they sneak behind the counter in a huff (steam and all), tape off a
  machine with an OCCUPIED sign, make their own drink and leave with a "Two stars." Or they storm out
  and the door slams. The day's receipt lists rogues, wasted drinks and pratfalls.
- **Finish the customers inside.** At closing time the doors lock: nobody new comes in, but
  everyone already inside can still be served. A sign on the HUD says "Doors locked: finish up!"
  with how many are left. The day ends as soon as the shop is empty, or after 30 seconds, when
  any stragglers storm out.
- **Your seat waits for you.** Close the tab by accident, open the game again, and Rejoin puts
  you back on your own barista, not a new one. The room holds
  four people; a fifth is told the café is full.
- **Bots on or off.** The host picks Off, 1, 2 or 3 bot baristas on a card in the lobby; everyone
  else sees the choice. Bots are off by default when friends are in, and fill the empty spots
  when you play alone.

## 1.1.0 — 2026-10-28

Sound, an espresso dare, and a messier café. Three new keys: **M** mute, **Q** drink a shot,
**R** drop what you're holding.

- **Sound and music.** A lo-fi jazz loop plays through the day and a calmer one at night and on
  the menus, both looping without a seam. The grinder grinds, the espresso machine pulls, milk
  steams, cold brew pours, cups clink down, the register chings with tips, the door bell rings
  as customers come in, and the door slams when one storms out. Little jingles mark the day
  opening and closing, rush hour, the inspector, the influencer and power flickers (the music
  winds down while the lights are out), and the café gets louder as the queue fills up.
- **Sound settings** in the pause menu: master, music and effects sliders and a mute switch,
  saved in your browser. Press **M** (or the speaker button in the top bar) to mute any time.
  Sound only affects you, never your crew.
- **Drink your own espresso.** Stand at the espresso machine and press **Q** to down a shot
  (it uses a bean): +30% speed for 15 seconds, and each shot that day is stronger (up to +50%) and
  restarts the timer. You start to jitter, the screen shakes and you can hear your heart. The
  sixth shot is one too many: you collapse, an ambulance pulls up and the paramedics wheel you
  out. You're out for the rest of the day (a bot covers if there's room) and back the next
  morning with a $150 ambulance bill on the crew's tab, paid off from half of each day's profit.
  Bots don't drink.
- Press R to drop what you're holding: next to a machine it goes in the machine, at the counter
  it goes on the pass, at the bin it's binned, anywhere else it hits the floor.
- Floors get messy: grounds piles spread when walked through, spills can make you slip for a few
  seconds, and a dirty café makes customers less patient and can fail the health inspection.
  Grab the mop in the corner (E to pick up, E next to a mess to clean, R to put it back). Bots
  mop when it's quiet.
- Now and then (from day 2) a customer handed a drink gets upset. Remake it within 15 seconds or
  they walk behind the counter and make it themselves, without paying.

## 1.0.0 — 2026-10-28

The first build friends can play together. Everything below went live today.

### Playing

- A seven-day café week, about thirty minutes, then "keep going" or see your score. Each
  run is fresh: new seed, new scenario (normal week, campus town, rainy week, tourist season).
- **Days** are a scramble: customers queue at the counter, you grind, pull shots, steam milk
  and tap cold brew, and press E at a station to use it.
- **Nights** are a sixty-second draft: a hand of five cards from the catalogue (machines,
  marketing, odd gambles), a restock of beans, milk and concentrate, and rent due at dawn.
- **The pass.** Set a drink nobody wants on the counter (three slots) and pick it up or serve
  it later. Espresso goes stale in 45 seconds, latte in 60, cold brew lasts the day. Stale and
  binned drinks count as waste.
- **Day events** from day two: rush hour, a power flicker that pauses the machines, a health
  inspector who fines you at four wasted drinks, and an influencer who jumps the queue and
  brings a crowd if you serve them.
- **Customers** now vary: impatient ones tip well but leave fast, groups order two or three
  drinks, and three regulars (Ada, Ravi, June) keep coming back and hurt twice as much to lose.
- **Bot coworkers.** Play solo and Bo and Lu work beside you; two friends get one bot, three
  or more get none, and a friend who joins mid-week sends a bot home the next morning. Bots
  take a moment to react, sometimes botch a drink and remake it, step around you, and leave
  the drink you're halfway through making alone.

### Playing together

- Host a room and read out a five-letter code; friends join from the title screen. No
  accounts, no server: browsers talk to each other directly.
- Refresh and rejoin mid-run; the host can resume a saved week.

### Look

- A cozy diorama café with lamp-lit nights, chunky baristas with name tags, patience bubbles
  over customers, and coin pops when a sale lands.
- A storefront title screen with the Roadmap drawer (phases, ideas, this changelog), a pill
  HUD with order tickets and pantry jars, a cork-board night shop, and paper-card menus.

### Behind the scenes

- The host's browser records every run (nothing is uploaded). In the browser console,
  `cafetycoon.telemetry.download()` saves the log as a file for the design-analysis pass.
- A headless balance tester (`npm run balance`) plays hundreds of simulated days so numbers
  get tuned by evidence, not by hand-playing.

### Known limits in this build

- The night menu switch, pass contents, event banners, customer and bot name tags, the
  receipt details and the telemetry button exist in the game's data but are not drawn yet.
- Syrups and a flavour picker wait for a later build. Buying new machines is phase 3.
- If two homes cannot connect directly, there is no relay yet.
