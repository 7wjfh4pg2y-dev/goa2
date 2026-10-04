# The release (`/goa2/v1/`, branch `release`)

The final, real version of the game, assembled from 1.0 plus 2.0's features —
one segment at a time, each tested here before the next. Not live: friends keep
playing 1.0 at `/goa2/` until this is finished, then `/goa2` switches to it.

How every segment goes: port it from 2.0 (adapting to 1.0's screens where they
differ) → build + tests → deploy to `/goa2/v1/` → a real test there (two tabs
or friends) → tick it off. Fixes the live game needs go into 1.0 AND here.

## Order

1. [x] Reliability — a lone host's reload rejoins; no shared colours; joins always end
2. [x] Battle report from real games — the recorder's structured events (hero / minion defeats, read off the state, Undo followed; stored inside the row's `data`), `gamestats.ts` statsFromJournal, the stats screen after a win (columns: Level · Hero Kills · Deaths · Assists · Minion Kills · Coins Earned; the tide chart's kill faces never run past the band)
3. [x] End of the game — the user kept the OLD victory / defeat card (the tie-breaker coin flips onto the winners' face after a push; the two Life hearts after a Life win) and the old push splash (THE THRONE FALLS / FINAL PUSH as the arrow); 2.0's crest ceremony was too cartoony and is not in. "Battle report" (or a few seconds) opens the new report page over the card
4. [x] New hero symbols on card backs; the crest on the turn cards (the new symbols everywhere; ONE card back — `cards/CardBack.svelte`, the old colours with a faint honeycomb; the turn / round cards carry the gear-and-ice crest with the GEAR centred, sized so the ice stays inside)
5. [x] The island board — with the battle zone outline and moving effects. The host's three switches (Island / Classic, Outline, Effects) and the view controls (recenter, turn, zoom, saved views) live in ONE control centre: a Controls button (desktop: the bottom of the panel; phones: the ☰ menu) opens a wheel over the board (the board switches only for the host; Views puts the three saved views on the outer circle). Waves tested on every zone (`battle.test.ts`: through both beaches and back, each minion on its own team's spawn point, the map's role); effects off = ~1 ms/s idle (on ≈ 21)
6. [ ] Speed pass — the parts that apply to what's here by then
7. [x] The Tide look, before the game — landing (the island in its moving sea), choose / admin / GM tools, menu, Create, Join, lobby (the island as a still picture)
7b. [ ] The Tide look — hero select and the matchup slices (in: 2.0's screen with the user's changes — team-coloured pips / All / Lock in, no stat numbers, picked heroes ringed in the picker's colour, a lower bottom bar: full cards up to 3 a side, compact at 4–5; the slices loom the tie-breaker coins. Slices stay full width (the user's pick, A); no blade line on desktop; long names a touch smaller; bigger, outlined role icons)
8. [ ] The in-game screen — top bar, console and roster, player boards, the Ascension deck
9. [ ] The phone in-game layout
10. [ ] Final playtest with the group → switch `/goa2` to the release
