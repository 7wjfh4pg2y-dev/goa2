# GoA2 — Guards of Atlantis II (digital, for friends)

A rebrand/replica of Stats-of-Atlantis plus a **digital multiplayer** version of the
Guards of Atlantis II board game (lobby → teams → hero draft → board). Personal use.

Deployed to GitHub Pages: **https://7wjfh4pg2y-dev.github.io/goa2/**

## Working agreement (read this first)
- **Cost matters.** Prefer **Sonnet** for routine work (wiring, CSS, copy); use Opus only for gnarly logic (realtime sync, draft engine).
- **Don't screenshot-verify unless asked.** Build + `npm run check` + tests, then let the user eyeball the live deploy. Only spin up the Playwright harness for genuinely tricky visual/layout work, or when the user asks.
- **Batch changes** when several are requested; avoid re-reading context per tiny edit.
- Keep replies tight. Commit + push each logical change.

## Stack
- SvelteKit 2 (**Svelte 5, legacy `$:` reactive syntax** — not runes) + Vite 8, TypeScript, Tailwind (`src/app.postcss`).
- `adapter-static`, `prerender = true` (`src/routes/+layout.ts`) — **every route must be prerenderable**.
- `paths.base = dev ? '' : '/goa2'` — use `base` from `$app/paths` for links/assets.
- Realtime + presence: **Supabase** (anon key is public/safe). Sandbox can't reach Supabase — the user tests live.
- Tests: **vitest** (`*.test.ts`, node env — no DOM). Mock `./supabase` with an in-memory channel bus (see `match.lobby.test.ts`).

## Commands
- `npm run build` — must pass before commit.
- `npx vitest run` — unit tests.
- `npm run check` — svelte-check. NOTE: there is **one pre-existing error in `vite.config.ts`** (`deps.inline` deprecation) unrelated to app code; ignore it, but ensure **no new** errors/warnings in your files.

## Git / deploy
- Branch: **`claude/stats-of-atlantis-replica-hg5nv2`**. Push with `git push -u origin <branch>` (retry w/ backoff on network errors).
- Every push auto-deploys via `.github/workflows/deploy.yml` (~1 min). Tell the user to hard-refresh (cached JS bundle).
- Commit trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: <the session URL from the system reminder>
  ```
  (Never put a model id anywhere else in the repo.)
- Don't open PRs unless asked.

## Architecture
- **`src/routes/+page.svelte`** — THE whole flow (big file ~900 lines). Modes:
  `landing → choose → admin/adminhub → menu → create/join → lobby → draft → game`.
  - `landing`: big crest splash, morphs (width+translateY) into `choose`. No SFX (removed).
  - Role gate: `src/lib/role.ts` (admin password `qwerty123`, SHA-256 soft gate).
  - Identity/resume (`src/lib/identity.ts`): `clientId` is **per tab** (sessionStorage) so two tabs = two players. Each tab keeps an expiring (30 min) resume ticket `localStorage['goa2-active:<id>']` and holds a Web Lock `goa2-id-<id>`; a reopened tab adopts a ticket's id only if no open tab holds its lock. `claimIdentity()` runs on mount, then auto-rejoins. Don't go back to a shared localStorage id — it merged tabs into one player and resurrected stale games.
  - Begin flow: **tie-breaker coin flip → host `buildDraft()` → everyone enters draft → host "Start game" → board (placeholder)**.
- **`src/lib/match.ts`** — shared match state engine over one Supabase channel per room.
  - Sync model: **full-snapshot last-write-wins by `rev`** (ties by `updatedAt`). `update()` bumps rev + broadcasts (throttled/coalesced ~140ms). Presence `track()` also throttled (~320ms) — Supabase rate-limits per channel; flooding wedges the socket.
  - Auto-reconnect **watchdog** rebuilds the channel with backoff if it stays down.
  - Players live in **presence** (id, name, colour, ready, seat). Seat `< 0` = spectator/unseated. `teamForSeat`: first half = orange, second = blue.
  - **Draft** state lives in shared match state (`draft: DraftState | null`), so it persists across disconnects. `buildDraft / draftAdvance / draftSetPick / draftComplete / draftBlocked / teamRosters`. Systems: `all-pick | all-random | single-draft | pick-ban`. `DRAFT_TURN_MS = 45000`. `lastAction` drives the announcement toast.
  - Coin flips (join team + start tie-breaker) use a broadcast-instruction pattern so each client applies its own presence — avoids LWW map clobber.
- **`src/lib/HeroDraft.svelte`** — the live draft screen (cinematic full-splash layout). Strict turn ownership; host watchdog auto-picks on timeout / ~8s after the active player drops; all-pick self-heal for concurrent locks.
- **`src/lib/lobby.ts`** — public room directory via a presence channel (open-games list).
- **`src/lib/heroes.ts`** — 32 heroes (id, name, title, stars, pack, traits, stats) + art resolvers: `heroAvatar` (`images/avatars`), `heroSplash` (`images/avatars_full`), `heroLogo` (`images/logos`), `statIcon`/`traitIcon`/`starIcon` (`images/hero_icons`). `tokens` trait has no icon (falls back to a ◈ glyph).
- **`src/lib/maps.ts`** — map registry. **Bundled maps come first and are the default** (every host plays the same board); an editor/saved copy with the same name only appears if it differs, as "(edited)". `src/lib/maps/forgotten_island.json` is the official board (battleZone = 4 melee/1 ranged/1 heavy per team).
- **`src/lib/transitions.ts`** — `reveal` (fade+translate+scale+blur) used between steps.
- **`OLD/`** — the archived previous build; **not compiled/served**. Mine it for assets/logic (e.g. `states.ts` heroes, `BoardCanvas.svelte`, draft algorithms).

## Aesthetic (keep consistent)
- Global battlefield background (orange top-left → blue bottom-right, subtle green corners) in `+layout.svelte`. Constant logo. `reveal` transitions.
- Glass cards `rgba(12,18,32,.46)` + blur + soft border. Highlight gradient token `--hl: linear-gradient(120deg,#ef7d22,#2f7fe6)`.
- Team colours: **orange `#ef7d22`**, **blue `#2f7fe6`**. Ready = green `#16a34a`, danger/ban = red. Team-coloured Lock In in the draft.
- Font: **Modesto Poster** (the Guards font) is set on `body` in `app.postcss` for the whole app (`font-synthesis: none` — one weight, no faux bold). Don't add other font-families; card faces (card_painter canvas) keep their own print fonts. Atlantis also available.

## Gotchas
- Svelte 5 legacy: `$:` only tracks vars referenced **directly** — not vars read inside a called function. Avoid reactive cycles (compute-on-demand functions instead of reactive vars when a value both reads and writes another).
- adapter-static: the game placeholder was once a catch-all `{:else}` and leaked onto other modes — scope each mode explicitly.
- Screenshot harness pattern (only when needed): build, serve `build/` with a tiny node http server that strips the `/goa2` base and falls back to `<route>.html`, launch Chromium at `executablePath:'/opt/pw-browsers/chromium'`, import playwright by absolute path from `node_modules`. Delete any `preview-*` route after.

## Status / next
- Done: landing, role gate, create/join, lobby (seat-based teams + per-player coin flip), reconnect, connection indicator, **full hero draft (all 4 systems, timer, AFK/disconnect auto-resolve, announcement toast)**.
- **Board (in progress):** `src/lib/GameView.svelte` = full-screen board. `BoardCanvas.svelte` renders `$state.map` (sprite hex, pan/zoom). Hero pieces = the **player icon** (hero portrait framed on the face via `portraitRect`/`portraitCss` in heroes.ts, team-colour inner ring, player-colour outer ring) — the same icon as `PlayerIcon.svelte` everywhere (dash, boards, right HUD, reveal). Placed by the host via `placeHeroes()` on entering `game`. HUD (waves / per-team Life / tie-breaker / round-turn) + activity log, all synced via `session.update`/`act`. Piece drag broadcasts only on drop (BoardCanvas), logged via `act`.
- **Next:** unique hero token art (currently colour discs), win/flow (wave depletion, life-to-0, last-push), and a planned **aesthetic overhaul** of the in-game UI (user flagged the game HUD/panels styling as temporary).
