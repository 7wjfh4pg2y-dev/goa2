# The release (`/goa2/v1/`, branch `release`)

The final, real version of the game, assembled from 1.0 plus 2.0's features —
one segment at a time, each tested here before the next. Not live: friends keep
playing 1.0 at `/goa2/` until this is finished, then `/goa2` switches to it.

How every segment goes: port it from 2.0 (adapting to 1.0's screens where they
differ) → build + tests → deploy to `/goa2/v1/` → a real test there (two tabs
or friends) → tick it off. Fixes the live game needs go into 1.0 AND here.

## Order

1. [x] Reliability — a lone host's reload rejoins; no shared colours; joins always end
2. [ ] Battle report from real games — the recorder's game events, the stats screen after a win
3. [ ] End of the game — the game-winning push sequence; the end-game polish (review it first)
4. [ ] New hero symbols on card backs; the crest on the turn cards
5. [ ] The island board — with the battle zone outline and moving effects (and their host switches)
6. [ ] Speed pass — the parts that apply to what's here by then
7. [x] The Tide look, before the game — landing (the island in its moving sea), choose / admin / GM tools, menu, Create, Join, lobby (its live board is the classic one until step 5; no board switches)
7b. [ ] The Tide look — hero select and the matchup slices
8. [ ] The in-game screen — top bar, console and roster, player boards, the Ascension deck
9. [ ] The phone in-game layout
10. [ ] Final playtest with the group → switch `/goa2` to the release
