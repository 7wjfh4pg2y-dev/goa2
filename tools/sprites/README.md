# Hero sprite engine

Turns a pixel-art **base pack** into a GoA2 hero, with one shared art style and one shared animation set.

```
node tools/sprites/build.mjs [heroId …]     # → tools/sprites/out/<hero>/, out/viewer.html (git-ignored)
node tools/sprites/palette.mjs <pack dir>   # every colour of a pack, with pixel counts — for writing its materials
```

Needs ImageMagick (`convert`, `identify`).

## Pieces

- `bases/<pack>/` — the free sprite packs as downloaded, plus `base.mjs` once a pack is in use: cell size, foot line, which file feeds which animation (`idle run attack jump fall hit death`), the attack's holds / release frame / projectile, and the source colours by **material** (light → dark).
- `heroes/<id>.mjs` — one spec per hero: base pack, `palette` (material → new colours, same order), the `passes` to run in order with their params, `skip` rules, palette chips and a one-line blurb. The design notes from the card-art research go at the top.
- `lib/parts.mjs` — the passes: `hair` (segmentation), `recolor`, `hairEdge`, `studs`, `landmarks` (eye / tie / shoulder), `pauldron`, `quiver`, `strap`, `ponytail`. New gear = a new pass here, reused by every hero.
- `lib/anims.mjs` — **the** animation set (Idle, Run, Attack, Jump, Hit, Defeat + Showreel) and its timings, composed from any pack's frame counts. Shared by every hero; tested in `src/lib/sprites.test.ts`.
- `lib/engine.mjs`, `lib/pixels.mjs` — strip building, PNG I/O, patches.
- `viewer.html` + `viewer.js` — the review page (hero picker, before / after, onion skin, frame strip…), filled in by `build.mjs`.

## Rules

Same cell / baseline / facing / animation set / timings for every hero; light from the upper-left; flat 3-tone ramps per material, no anti-aliasing; Hit flashes white, Defeat flashes red; added parts never flicker (≤ 1 px against their landmark between frames). We recolour, segment and add — never redraw the pack's poses.

Silverarrow (`heroes/silverarrow.mjs`) is the reference: the engine must keep rebuilding her approved sheets pixel-identical.

## Animation studio

`node tools/sprites/studio.mjs [--reels <folder of GIFs>]` rebuilds the GM page **/studio**'s library: `static/anim/library.json` + sheets (every hero built here, the base packs' strips, and CraftPix preview GIFs cut to their stage, background cleared, packed into frame grids). Run it after adding a hero or a pack; without `--reels` the reels already in the library are kept (the GIFs aren't in the repo). The folder is `anim`, not `studio`: a folder and a page of the same name can 404.
