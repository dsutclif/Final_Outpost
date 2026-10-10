# @fo/render-3d

The 3D renderer: three.js, every model procedural (no asset files). It implements Contract 2
(`docs/PLAN.md`) with the same public shape as `@fo/render-2d`, so the client can swap renderers
behind one camera object.

## Integrating in the client

```ts
import { loadRenderer3D, type QualityTier } from "@fo/render-3d";

// three.js and the renderer load as a separate chunk only on this call; the entry module is
// three-free, so a 2D-only session never downloads them.
const r = await loadRenderer3D({ quality: settings.quality as QualityTier });
r.hudAnchor = () => ({ x: chipX, y: chipY });  // CSS px in the mount: where coins fly
r.onCoinLanded = () => hud.bumpCurrency();
r.init(manifest, skin, stageEl);               // creates its own <canvas> + DOM overlays in stageEl
// per frame, exactly like Renderer2D:
r.sync(sim.state, loop.alpha, camera);          // camera: { x, y, zoom, follow } (createCamera())
for (const e of events) r.onEvent(e);
r.resize(w, h);
r.setQuality("low" | "medium" | "high");        // settings toggle, live
r.setCoach({ key, at: { x, y }, text } | null); // coach mark (world units), DOM overlay like 2D's
r.snapCamera();                                 // jump to the hero after a scripted run
r.worldToScreen({ x, y }, height?);             // world units -> mount CSS px (both renderers have it)
// camera.lead = { x, y } | null: the follow target leans LEAD_WEIGHT toward it (nearest pad)
r.stats();                                      // { drawCalls, triangles, fps, estDrawCalls, estTriangles, quality }
r.dispose();
```

Steps for the client stream:

1. Settings "renderer: 3D" → `await loadRenderer3D(...)` and use it wherever `Renderer2D` is used
   (same `init/sync/onEvent/resize/dispose`, same `hudAnchor` / `onCoinLanded` hooks).
2. Like the 2D renderer it draws the hint pill, hazard/wave banner (same `fo-hint`/`fo-banner`
   classes and CSS), distress vignette, off-screen pointers (arrow plus icon bubble, the same set
   as 2D) and coach marks itself as DOM children of the mount (`src/scene/dom.ts`); the HUD stays
   client-side. The client wires it through `packages/client/src/render.ts` (live 2D/3D swap,
   first-launch benchmark).
3. `preloadRenderer3D()` warms the chunk (e.g. when the settings screen opens).
4. Vite code-splits the dynamic import automatically; no config change needed.
5. Optional: pick the tier with a first-launch benchmark (spec) by reading `stats().fps` for a
   few seconds on `medium` and dropping to `low` under 30.

Direct (non-lazy) use for tools and tests: `import { Renderer3D } from "@fo/render-3d/renderer"`.
Its constructor takes `{ now, dpr, content, quality, createGL }`; `createGL` lets tests inject a
fake WebGL renderer.

## Quality tiers (`src/units.ts` `TIERS`)

| Tier | Shadows | Lights | Pixel ratio | Other |
|---|---|---|---|---|
| low | none, blob shadows only | the core point light only (plus ambient) | 1 | half particles, no glow halos |
| medium | 1024 PCF from the key light (buildings cast; units use blobs) | core + key light | ≤ 1.5 | glow halos |
| high | 2048 soft PCF | core + key light | ≤ 2 | glow halos (bloom is not implemented, see open issues) |

## Units and camera

- Sim `(x, y) / FP` maps to three `(x, 0, y)`: +y in the sim (down the screen) is +z, toward the camera.
- The scene works in sim world units. Models are authored in **art metres** (hero = 1.0 tall) and
  placed with scale `ART_M = 28` world units per metre.
- Camera: 50° pitch, 40° vertical FOV, framed so `VIEW_W = 360` world units span the screen at the
  look point, leaning toward `camera.lead`; eased follow at the 2D rate with the 2D clamp (on the 2D-equivalent view rect). The
  ground extends past the map edges and falls into fog, so the top of the frame never shows void.

## Asset conventions

- One builder per canonical id in `src/assets/registry.ts` (`registerModel(id, build, anchors)`).
  Lookup: exact id, then `category.*`, then a labelled fallback crate (only the debug skin may rely
  on it; a test fails if Mars Greenhouse does).
- Builders get a `BuildCtx` (skin tokens, the shared material set, rig parts, `skin.models`, tier
  level) and return `{ root, cls, parts }`. Pivot at the ground centre of the footprint, +z faces
  the camera. `parts` names what the renderer animates (orb, spin, head, muzzle, lid, doors, lamp...).
- Geometry goes through `GeoBuilder` (`src/geom.ts`): primitives merged into one non-indexed
  vertex-coloured geometry, so a building is one draw call on the shared `std` material.
- Colours come only from the skin palette via `deriveTokens` (`src/tokens.ts`): sky, fog and storm
  are skin tokens (`palette.sky/fog/storm`); derived tokens (suits, visor, plasma, trim) are mixes
  of real tokens; `skin.look3d.saturation` nudges scene saturation (Mars: 1.14). Names come from `skin.names`.
- Anchors are `Object3D` children named `deposit, pickup, queue, interact, safe, pad, stack,
  hand_L, hand_R, head`; `getAnchor(root, name)` finds them. Per-class requirements are in
  `src/ids.ts` (`CLASS_ANCHORS`), per-id extras in the registry.
- Budgets (`TRI_BUDGET`): characters 8k, hero buildings 5k, props and scatter 500. `test/assets.test.ts`
  builds every id in every skin and enforces budget and anchors.
- Characters share one rig (`src/assets/characters.ts`): white parts posed by `poseCharacter`,
  instanced per part for the whole crowd (`Crowd`); role variants are headgear + held tool
  (`ROLE_GEAR`, overridable per skin through `skin.models[role] = "hat.*"`).
- Items, walls, dashes, rubble, particles and blob shadows are instanced batches (`Batch`).

### Adding a model for a new canonical id

1. Write a builder (usually in `assets/buildings.ts` or `assets/scatter.ts`) using `GeoBuilder`
   and palette tokens; add anchors with `anchor(root, name, x, y, z)`.
2. `registerModel("struct.new_thing", (ctx) => buildNewThing(ctx), ["interact", "pad"])`.
3. If the entity lives in a new state field, place it in `Renderer3D.sync` with `place(key, id, at)`
   (it pops in with squash-and-stretch automatically when it appears after load).
4. `pnpm check`: the asset test picks the id up from content and checks budget and anchors.

## Dev harness and asset lab

```
pnpm --filter @fo/render-3d dev        # http://127.0.0.1:5190
```

Plays the golden levels on the real sim (arrows/WASD), with level, skin and quality pickers, live
draw-call/triangle/fps stats, and the asset lab (every id, class, triangle count, anchor overlay).
Query params: `level=1..4`, `skin=`, `q=`, `mode=lab`, `full=1` (stage fills the window),
`ff=<ticks>` (fast-forward), `stage=walls` (dev-only: builds every wall section). In a throttled
browser pane `window.__fo.advance(n)` steps and renders n ticks. Uses the root vite binary; the
config is a plain object so the package does not depend on vite.
