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

- Everyone can vote to close early when the day is dead: once every barista agrees, the doors lock and whoever is inside gets served.
- A sold-out board no longer makes the street empty: people still walk up, read the board and walk away, and the morning paper counts them.
- **Longer, gentler nights.** Nights last two minutes now, and a relaxed night has no clock at all: the doors open when everyone is ready, with a 30-second last call once most of the crew is.
- **A night screen that tells you what matters.** Yesterday's profit, one headline, and a few alerts with a one-tap fix.
- **The back bar has slots now:** four on the stand, five on the cart, six in the café. Any station can be lifted out or moved at night, and a small stations shop sells a second espresso machine ($45), a second grinder ($30), a steamer ($40), a cold-brew tap ($35) and a bin ($15). Take the steamer out and the lattes come off the board until it is back.
- No bin? Then whatever you drop lands on the floor. The mop matters.
- Growing keeps what you own: the stations you bought come along to the bigger shop, and the new shop's own gear is a gift on top.
- Bots know about spare machines: with two espresso machines they use whichever is free, and with no bin they drop grounds on the floor (or run them through the espresso machine when the floor is already full of mess).

## 2.1.0 — 2026-10-29 · Phase 3 preview

- **Barista roles (P3 B1).** At night each barista can take one of four roles (kept until they change it on a later night),
  one barista per role. Chef: machines run 25% faster, but half tips on drinks they hand over.
  Creator: +$0.75 craft bonus per drink handed over, but walks 15% slower. Host: +50% tips, but
  machines take 25% longer. Manager: restocks cost the whole crew 20% less, but walks 10% and
  works 10% slower. The night screen lists the roles with their perk, weakness and holder; your
  role icon shows on the ready chips and next to your name in the hands panel. Save version 10,
  network protocol 13.
- **Per-item pricing (P3 B2).** On the night menu board every drink has − and + buttons that move
  its price in $0.25 steps (from $1.00 under to $2.00 over the list price). Customers react: a
  pricier drink gets fewer orders, the whole café gets fewer walk-ins if the menu is pricey, and
  customers ordering a pricey drink lose patience sooner (cheaper drinks win orders and patience).
  Each line shows tomorrow's expected orders, the change against list price and the profit before
  tips. A total line sums the menu, and the newspaper's walk-in count follows the prices. Save
  version 11, network protocol 14.
- **Regulars with favourites (P3 B3).** Each regular comes back for one favourite drink and has
  loyalty (0–5 hearts). A fair-priced serve earns a heart (up to 6% over list counts as fair);
  every heart adds 8% to their tip. Overcharging cuts the tip (to half at 25% over) and costs a
  heart, and so does a regular storming out or their favourite being off the menu for a day. The
  night screen lists the regulars with their hearts and a warning when their favourite is off or
  pricey, and each menu line shows whose favourite it is. Save version 12, network protocol 15.
- **Tabbed night board (P3 B4).** The night screen's right side has tabs: Shop (tonight's hand,
  with the paper in one line), Menu & prices, Crew & roles, Regulars (shown once you have one,
  flagged when one is unhappy) and Paper. The left column keeps the receipt and the restock list,
  and the ready row and Open the shop stay put. Checked at 1280x800 and 1920x1080.
- **Supplies that spoil (P3 B4).** Milk and the new pastries are fresh stock: at each closing 30%
  of the leftover milk and 50% of the leftover pastries go off. The restock rows show the share and
  how much went off last night, and the receipt has a "Went off" line. Pastries come in packs of 6
  for $7 and sell on the side ($3, about one serve in three) while the case has any. A Manager
  halves spoilage, and a new Walk-in fridge card ($25) cuts it by 60%. Save v13 (adds an empty
  pastry case), protocol v16.
- **Recipe accuracy (P3 B5).** Every cup starts at 3 stars and loses one for each sloppy step:
  rushing a drink off a machine in the last 40% of its run (empty hands + E; quicker, but −1★),
  leaving a finished drink sitting on the machine for more than 8 s, or taking a cup to a station
  with no step for it (the wrong order). Marks follow the cup through machines and the pass.
  Stars scale the tip (0★ ×0.6, 1★ ×0.8, 2★ ×0.95, 3★ ×1.05), show on the served toast
  (★★☆), and the night receipt shows "Cups ★avg · N perfect"; a day averaging under 3 stars
  costs up to 0.45 rating at closing. The hand hint warns before a rush, a sat drink or a fumble.
  Save v14 (migration), protocol v17.
- **Taste map (P3 B6).** At night, each drink on the menu board has a row of house twists
  (cinnamon, vanilla, sea salt, honey, oat milk, or plain). Every run hides a different star
  rating for each drink+twist pair, from the run seed: each drink has exactly one 5★ combo and one
  1★ flop. You only learn a combo's stars by serving it, and from then on the chip shows them, so
  the board doubles as the crew's taste notebook. A twisted cup costs $0.20; the combo's stars scale
  the tip (1★ ×0.7 … 5★ ×1.4) and nudge the closing rating (±0.004 per cup per star from 3, capped at
  ±0.25 a day). The served toast names the twist ("· new: vanilla ★★★★★"), and the receipt lists
  new combos and the twist spend, which profit now includes. Save v15 (migration), protocol v18.
- **Signature drink (P3 B7).** A signature card on the night menu tab lets the crew name a drink
  (up to 20 characters), pick a base and a twist from the taste map (known stars shown), and set a
  premium in $0.50 steps up to $3. About one walk-in in five then asks for it by name (each premium
  step trims that share by a tenth). Signature cups sell at the premium, use the signature twist,
  and earn a star bonus: +$0.75 a cup at 4★, +$1.50 at 5★. A 2★ or worse signature costs rating
  instead (capped). The receipt shows "Signature: N sold +$X bonus", and crew cards show the name.
  Changing the base or twist makes it a new recipe; Retire takes it off the board. The 1★ twist
  risk is sharper: a flop now tips ×0.55 (was ×0.7), and a 5★ hit ×1.45 (was ×1.4).
  Save v16 (migration), protocol v19.
- **Taste seasons (P3 B8).** Tastes drift every three days (days 1–3, 4–6, 7–9). When a new season
  starts, each drink's 5★ twist slips to 4★ or 3★ and a former 4★ or 3★ twist becomes the new hit;
  the 1★ flop stays put, so a run is never a full reshuffle. The paper's new taste column warns two
  nights ahead ("Tastes turn the day after tomorrow") and, the night before, names one drink's rising
  twist. Notebook stars from an earlier season show as ~★★★★★ in grey (and "(last season)" in the
  signature picker) until someone serves that combo again, which re-learns it and lists it on the
  receipt. Save v17 (migration), protocol v20.
- **Rival café (P3 B9).** Starbuck$ has opened down the street. A Starbuck$ card under the paper
  lets one barista scout it at night ($5, once a night): you see three of its drinks for tomorrow
  with its prices next to ours, and whether it's eyeing your signature ("in 2 days"). Three days
  after a signature goes up, Starbuck$ launches a knock-off $0.50 cheaper (never below 75% of
  list), and only half as many walk-ins ask for yours. Counter-moves: price your signature at or
  under the knock-off to keep 85% of the asks (Starbuck$ cuts again every three days, down to its
  floor), or design a new signature, which it then needs another three days to copy. Copies and
  cuts are announced in the morning notes. Save v18 (migration), protocol v21.
- **Parody ads (P3 B10).** A new 📣 Ads tab at night lets one barista book tomorrow's campaign on
  one of five platforms: Palm Book (families and groups, $14), Nextdoorish (locals and regulars,
  $10), LinkedOut (commuters in a hurry, $12), Glimpse (influencers, $18) or Tik Tak (everyone,
  $16). Each comes with its own ad copy. You can switch or cancel for a full refund until the
  doors open. Results are mixed and hidden until morning: a flop does nothing (Tik Tak's flop even
  puts people off a little), a fine run brings a few more of that crowd, and a viral one brings a
  lot more, plus a small traffic bump. The morning note and the next night's receipt say how it
  landed. Save v19 (migration), protocol v22.
- **Pitch an idea (P3 B11).** The Ads tab is now "Ads & pitch". Once a night one barista can type a
  pitch for tomorrow (up to 140 characters), either a promo or a new item, and a three-judge panel
  scores it on the spot:
  - 👨‍🍳 Gordon Grind wants craft and quality.
  - 👵 Auntie Foam wants cozy, family and local.
  - 😎 Chad from Marketing wants deals, hype and loyalty.

  Each judge gives a score out of 10 and a one-line verdict. Naming your twists, drinks or
  signature earns bonus points. Buzzwords (crypto, NFT, synergy…) make the panel groan, though
  Chad secretly loves them. ALL CAPS, very short pitches, and repeating last night's pitch all
  cost points. 18/30 is green-lit and gives a small boost tomorrow: a promo brings about 4% more
  walk-ins and an item about 2% more tips. 24/30 or more is a standing ovation and doubles that.
  The judging is scripted keyword matching with no AI, so the same pitch always gets the same
  verdict. Save v20 (migration), protocol v23.
- **Ads tune (P3 B11).** Ads were a money sink, because a busy café can't serve the extra crowd.
  Campaigns are now about 40% cheaper: Palm Book $8, Nextdoorish $6, LinkedOut $7, Glimpse $10,
  Tik Tak $9. A fine or viral run also puts people in a tipping mood: +1.5 or +3 tip points.
- **Checkout path (P3 B12).** A new 🏪 Shopfront tab at night upgrades how customers pay, in
  order: the old 🧾 Ka-Ching 3000 register → a 🖥️ OrderBot kiosk ($40) → a 📱 "Squarely" tap
  terminal ($75). Each one is a real trade-off:
  - Register: free, no fees, a tip jar.
  - Kiosk: the line holds one more customer, waits are calmer (+12% patience) and it upsells an
    extra shot (+4% prices), but nobody tips a screen (−4 tip points) and the licence costs $2 a
    day.
  - Squarely: the screen swivels to the customer with 18% · 20% · 25%, so tips jump (+8 points)
    and tap-to-pay is quick (+5% patience), but Squarely keeps 3% of every sale.

  You can switch back to anything you own for free. The counter changes to match: a beige till,
  a card reader with an "ORDER HERE" totem, or the white swivel terminal. The receipt shows the
  "Checkout fees" line, and there's a morning note on the first day with a new checkout. The old
  Digital kiosk and Squarely terminal cards are gone from the shop; saves that owned them get the
  matching checkout instead. Save v21 (migration), protocol v24.
- **Growth path (P3 B13).** A new run now starts tiny: a ⛱️ kerbside stand on a corner of the
  lot, with plywood hoarding and a FOR LEASE sign where the rest of the café will be. At night the
  🏪 Shopfront tab has a "Grow the shop" path: stand → 🛺 coffee cart ($80) → ☕ the café ($150).
  Each tier changes the game:
  - Stand: 8 tiles of floor, a grinder, an espresso machine and a cold-brew tap (no steamer, so
    no lattes, mochas or matcha yet). The line holds 3, rent is $10 a day, and the crowd is
    commuters in a hurry: more impatient walk-ins, no groups, fewer regulars.
  - Cart: 10 tiles, adds the milk steamer, a line of 5, $17 rent, some groups and more regulars.
  - Café: the full floor, a line of 6, $25 rent, everyone. This is the game as it was.
  - Small tiers also earn less: the stand charges 25% less and gets fewer passers-by (×0.65),
    the cart 10% less (×0.85), so growing pays off rather than staying small forever.

  Growing is for good. The new floor is set up that night: the hoarding moves back, the awning
  changes colour, and the next morning opens with a "Grand re-opening" burst of confetti and a
  milestone note. The Shopfront card shows a milestone banner the night you grow. Drinks the
  shop can't make yet wait on the menu with a note saying why. Growth spend counts towards
  the week's fittings value. Saves and games from before this change count as the café and play
  exactly as before. Save v22 (migration), protocol v25.

## 2.0.1 — 2026-10-29

- **Lighter network updates.** The host now sends a full picture of the café every 5 seconds and,
  in between, only what changed. With four baristas the host's upload drops from about 4.2 to about
  0.4 Mbit/s, so rooms on slow or shared connections stay smooth. Gameplay is unchanged.
- Everyone in a room needs 2.0.1: reload the page on both sides if the game says the versions differ.

## 2.0.0 — 2026-10-29

**Phase 2, "Busy season", is done.** The café is busier, messier and different every day: bot
baristas, day events, forecasts and a local paper, a bigger menu, 52 night cards in sets, daily
challenges, Easter eggs, an awards ceremony and café records.

### What's new in 2.0.0, in a minute

- **Bots** fill empty spots (Off, 1, 2 or 3 in the lobby) and feel human: they hesitate, botch and
  remake drinks, mop when it's quiet and step around you.
- **Every day is different:** neighbourhood forecasts in *The Daily Grind*, rush hour, power
  flickers, the health inspector, influencers, a rogue customer, messes and the mop.
- **Night is a card shop:** 52 cards on three paths (⚡ Speed, ★ Quality, 📣 Reach), sets with pair
  and full-set bonuses, spicy cards, the weather radio, a temp to hire, and re-rolls.
- **Bigger menu:** iced latte, mocha, matcha and maple cold foam, plus flavour pumps.
- **Goals and glory:** daily challenges, combo streaks and a crew vibe meter, then an end-of-week
  awards ceremony and café records on the title screen.
- **Balanced:** cheaper upgrades, a gentle Monday and a hard Sunday, and your score counts what you
  built.
- **Your old save still works.** A run saved by 1.1.0 loads and carries on. Everyone in a room needs
  2.0.0 to play together, so refresh if a friend can't join.
- Fixed: the day's receipt no longer hides under the week-end screen after the last day or a missed rent.
- The version now shows at the bottom of **Past runs & controls** on the title screen. The controls
  list includes **R** (drop).

### Everything in 2.0.0

- **Balance pass.** Upgrades are about 20% cheaper, customers are a little more patient, and the
  hire-a-temp card is $30. The week now opens gently and day 7 is a proper finale. Your **score**
  counts permanent upgrades at half price, so investing isn't just spending. The week-end screen
  shows them as "Fittings".
- **Full sets.** Owning three cards of a set adds an extra bonus on top of the pair bonus. Cards
  tell you when they'd fill a set.
- **Tidier cards on small screens.** Card text no longer spills out of tall cards, and at about
  800 px tall the flavour text shortens so effects and set info stay readable.
- **Chattier radio.** A quiet day on the weather radio now gets its own line, including one for
  opening day.
- **End-of-week awards.** The week-end screen now holds an awards ceremony. One person is crowned
  Crew MVP, then trophies go out like Slip King, Mop Hero, Caffeine Gremlin, Hand-off Hero, Speed
  Demon, Cat Whisperer and Frequent Flyer (ambulance rides). Anyone left over gets a deadpan joke
  award, so everybody gets named. A button copies the list for your group chat.
- **Café records.** A 🏆 Records button on the title screen shows your best week, busiest day,
  lifetime totals and a hall of fame. They're kept in this browser.
- **Juice pass.** Combo streaks now count perfect serves *and* teamwork hand-offs (hat-trick at 3,
  then every 3). Big moments punch the screen and burst more particles (capped for performance).
  Wrong dumps, slips and storm-outs get clearer pops; winning a daily challenge confettis. A **crew
  vibe** meter on the HUD climbs with good play and dips with messes.

- **Easter egg pack 2.** Rare, funny gags that never sink a day: the shop cat naps on a warm station
  (pet to shoo), a regular's cup gets the wrong name (correct at the counter), a Wi-Fi camper sits
  without ordering (kick politely), burnt espresso puffs smoke (dump the shot), a latte-art fail
  floats a 2★ review card, and typing **FOAM** (or the Konami-ish arrow code) unlocks a silly
  unicorn-foam special for the day.
- **Daily challenges.** Each morning the paper deals 1–2 optional goals for the day ("Serve 8
  perfect drinks", "Keep the floor above 80%", "No storm-outs", "Sell 5 matchas", "Clear before
  close", …). Hit one and the receipt ticks it with a tip; a small chip on the HUD tracks progress
  live.
- **Week difficulty curve.** Day 1 is a warm-up and day 7 is the finale: traffic, patience and how
  many events show up ramp gently across the week on top of the existing week-to-week ramp, so the
  first day teaches and Sunday squeezes without feeling unfair.

- **A real card shop.** 52 night cards now (33 new), each on a path: **⚡ Speed**, **★ Quality** or
  **📣 Reach**, with a rarity ribbon (common, uncommon, rare). Each night you're offered **4 cards**,
  always from at least two paths and always with one cheap card.
- **Card sets.** Many cards belong to a set (Espresso bar, Milk lab, Cold bar, Cosy corner, Kerb
  appeal, Craft, Crew kit, Full menu). Own two of a set and its bonus kicks in. The card shows your
  progress and says when buying it would complete the set; active sets show as chips in the shop.
- **Spicy cards 🌶.** Cheap or powerful cards with a catch, written in red: Watered-down milk, Cheap
  beans, Surge pricing, a Turbo grinder that's fast but rough, a Delivery app, Two-for-one and more.
- **Weather radio.** A $40 card that tunes in each night and tells you on the paper what tomorrow's
  surprises will be and roughly when ("rush hour around midday").
- **Hire a temp.** A $35 one-day card: Robin (temp) joins your crew as a rookie barista tomorrow
  and leaves at closing (only if there's room).
- **Re-roll.** Don't like the hand? 🎲 Re-roll it for $5, then $10, $15… The price resets every night.

- **A bigger menu.** Four new drinks made from the stations you already have: the **iced
  latte** (a shot over cold milk at the tap, joins the menu on day 3), the **mocha** (a latte back
  on the steamer for a pump of cocoa, day 5), the **matcha latte** (one whisk at the steamer) and
  **maple cold foam**, the seasonal special (a tap pour topped with foam). The matcha and the
  special come from new night cards (Matcha whisk, Seasonal board); a Cocoa tin brings the mocha
  early. Fancy drinks cost more and their customers wait a little longer for them.
- **Flavour pumps.** A cheap new supply used by the mocha, matcha and special; you get a starter
  bottle when the first flavour drink arrives, and it only shows up in the pantry once you need it.
- **New on the menu.** The night before a drink arrives, the shop board shows it with its price,
  what it is and its recipe ticket. Order tickets on the HUD list every step (Grind, Pull, Steam,
  Cocoa, Hand off), and the menu board at night lists each drink with its recipe and an On/Off
  switch.
- **Orders follow the paper.** Exam week wants iced lattes and matcha, a cold snap wants mochas,
  payday splurges on mochas and the special, and Market Saturday loves the special.
- **Neighbourhood days.** Every day has its own forecast, so no two days play alike: a rainy
  Monday (hot drinks fly, a slow soggy start), exam week (students camp with cold brews and take a
  queue spot), Market Saturday (a big impatient crowd, rush hour likely), payday (big tips at
  lunch), a heat wave (iced drinks spike, the power may flicker), the office next door closed (a
  quiet day), plus cold snaps, street festivals, roadworks, commuter crushes and lazy Sundays.
  Each week is dealt so the same kind of day never comes twice in a row.
- **The Daily Grind.** At night the shop board opens with tomorrow's local paper: the headline,
  what it means, a crew tip, about how many walk-ins to expect, the hot-vs-iced split, which event
  is likely, and a rumour about the day after. The day's forecast also sits by the day counter
  and in the morning note.
- **Receipts add up.** The closing card and last night's receipt now count fines and bonuses in
  the profit, with a clear "Net profit (after rent, fines and bonuses)" line.
- Saves from the previous version carry over (the forecast is filled in); friends need the same
  version to play together.

- **Who's who, at a glance.** Customers in a hurry carry a stopwatch and tap their feet, groups
  bring their friends (and a ×3 on the bubble), regulars wear a name tag and get hearts when you
  hand them their usual, and the order tickets say so too ("Ada · regular", "In a hurry",
  "Group · 2 more after this", "Influencer · bonus", "Wrong drink!"). Bot baristas are labelled
  "Bo · bot" with a personality: the rookie has a NEW sticker and sweats, the steady one hums in
  headphones, the veteran wears shades and sips an espresso. A friend who drops out shows as
  "· away" with z z z.
- **Every serve gets a shout-out.** "Dev served a latte +$6.10" pops over the counter in your
  colour. Perfect serves (served with plenty of patience left) throw confetti, three in a row is a
  hat trick, a drink one of you parked and another handed over gets a "teamwork!" cheer, and serving
  the influencer makes the whole crew pose for the photo.
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
