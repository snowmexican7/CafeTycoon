# Playtest checklist: phase 1b (co-op)

Two halves. The first runs on one machine with two browser tabs (a second tab in the same
browser counts as a second player). The second needs one friend on another network, and is
the real test of direct connections. Open the console in every tab and leave it open.

## Two tabs on one machine

- [ ] Tab A: **Host a co-op run**. The lobby shows a five-letter code and lists the host; the HUD shows "room …" once the run starts.
- [ ] Tab B: enter the code (lowercase is fine) and **Join a room**. Within a few seconds both lobbies list both names.
- [ ] Tab A: **Start the run**. Both tabs show night 1 with the same seed and two baristas in the Ready list.
- [ ] Tab B buys a card. Cash drops by its cost in both tabs and the card disappears in both.
- [ ] Tab B presses **Open the shop**. Its name shows a ✓ in both tabs; the day does not start until Tab A presses too.
- [ ] During the day, WASD in Tab B moves Sam's barista on Tab A's screen.
- [ ] Tab B makes and serves a drink. Cash rises in both tabs.
- [ ] Tab B refreshes. The title offers **Rejoin room …**; after rejoining, Sam's barista is active again mid-day, holding nothing.
- [ ] Tab A refreshes. Tab B shows "Waiting for the host to come back…". Tab A presses **Resume run**; within a few seconds Tab B's lobby hides and play continues for both.
- [ ] Esc in either tab shows the room code and both names; Tab B's pace and day-length controls are disabled.
- [ ] A typo'd code (for example `ZZZZZ`) fails after about fifteen seconds with the remedies message and returns to the title.
- [ ] At the week end, Tab B sees "Waiting for the host…" while Tab A chooses.
- [ ] Both consoles show nothing beyond the occasional public relay socket failing to open.

## One friend on another network

- [ ] Share the code over voice; they join from their home network. Note how long the join took: ______
- [ ] Repeat the buy, Ready, move, serve, and refresh items above with the friend.
- [ ] If the join never completes: note which network each of you is on, try a phone hotspot on the friend's side, and record whether that worked. That result decides whether the relay upgrade in the design doc is needed.
