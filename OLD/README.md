# OLD — archived first build

Everything built before the "fresh start" lives here under `OLD/src/`, untouched
and ready to copy back piece by piece. It is **not** compiled or served — the
live app is the new `src/` at the repo root.

## What's in `OLD/src`

- `routes/`
  - `+layout.svelte`, `+layout.ts` — old nav + role gate wiring + page transition
  - `+page.svelte`, `+page.ts` — Catalogue (hero list)
  - `+error.svelte`
  - `[hero]/` — per-hero card pages
  - `encyclopedia/`, `builder/` (Card Builder), `draft/`, `timer/` — ported tools
  - `play/` — the Map Editor (paint hex zones, minion spawn types + facing, autosave)
  - `table/` — the Match Board (rooms, HUD, timer, waves/life, coin, log, pieces)
- `lib/`
  - `BoardCanvas.svelte` — reusable 3D hex-board renderer (zone tiles, spawn/throne
    badges, borders, pieces, zoom/pan)
  - `match.ts` — shared room state (Supabase realtime): rounds/turns, coin, waves,
    Life, timer, log, pieces, player colours
  - `maps.ts` — map registry (bundled + editor maps)
  - `role.ts`, `RoleGate.svelte` — Admin/Player gate
  - `supabase.ts` — Supabase client (public anon key)
  - `encyclopedia.ts`, `EncyclopediaCanvasCard.svelte`, `EncyclopediaFilterControls.svelte`
  - `images/`, `maps/`, `fonts/` — all assets (logo, tiles, minion emblems, maps)
- `card_painter.ts`, `heroes.json`, `new_heroes.json`, `spells.json`, `states.ts`
  — data + helpers for the catalogue / card builder

## How to bring something back

Copy the file(s) you want from `OLD/src/...` into the new `src/...`, fix the
imports, and wire it into the new layout/nav. Assets can be copied from
`OLD/src/lib/images` (or `maps`, `fonts`) as needed.
