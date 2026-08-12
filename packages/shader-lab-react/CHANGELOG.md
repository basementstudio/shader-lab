# @basementstudio/shader-lab

## 2.0.0

### Major Changes

- 992154e: ASCII layer rebuilt (v3), renderer-wide HiDPI fix, and no-blink shader rebuilds.

  **Renderer-wide fix**

  Post-processing ran at CSS-pixel resolution while the canvas was sized in device pixels, so on HiDPI displays the whole effect chain rendered at half resolution and was nearest-upscaled. Render targets are now sized in device pixels. The headless renderer only applies this when it owns the renderer, so host-provided renderers keep producing textures at the requested size.

  **No-blink shader rebuilds (all layers)**

  Structural parameter changes used to swap `colorNode` on live materials, and the pipeline manager dropped recompiling passes from the render chain — any rebuild made the layer vanish until the new pipelines compiled. Passes now precompile replacement materials on standby buffers and swap atomically; only never-compiled passes are excluded from the chain.

  **ASCII layer, rebuilt from the ground up**

  Crisp runtime-SDF glyphs (grid-packed atlas, shared baseline, analytic edge, adjustable `boldness`), grid-resolution glyph selection (a supersampled analysis pass plus an optional layout pass feed a small full-resolution composite), and a control surface reduced to 14 parameters:

  - `columns` — one grid-size control, measured against the composition so the editor and an export of any size produce the same lattice.
  - `breakGrid` (off/2x/4x/8x/16x) + `breakThreshold` — flat regions merge into larger cells. Merging and glyph placement derive from one quantized lattice, so blocks are coherent and glyphs never bleed across block boundaries.
  - `fontFamily` (all bundled families) + `fontWeight`, with per-font weight snapping. Charsets are auto-sorted by measured ink coverage; glyphs the chosen font cannot draw are filtered out, and rasterization falls back through a CJK-capable system family so the `katakana`, `boxes`, and `shades` charsets work with any font.
  - `charset` presets + `customChars` (128 chars).
  - `colorMode` (source / monochrome + `monoColor`), `bgOpacity` per-cell background in source mode.
  - `signalBlackPoint` / `signalWhitePoint` / `invert` — the only signal shaping.
  - `rowWarp` — slides whole cells along their row by brightness; glyphs stay crisp and may overlap, never shear.

  Color mode and invert compile branchlessly, so source mode selects exactly the same glyphs as monochrome. Generated shaders avoid chained vector swizzles, working around a Tint compiler regression in current Chrome Canary that killed pipeline creation. Retired atlas textures now outlive their bind groups, fixing a render-loop crash (`mipLevelCount` of undefined) when a font finished loading after boot.

  **Fonts in the package**

  The package now ships Geist Sans, Geist Mono, and BSMNT Grotesque with an importable stylesheet — `import "@basementstudio/shader-lab/fonts.css"` — that declares the `@font-face` rules and sets the CSS variables the font resolver reads. The commercially licensed families remain available in the hosted app only; hosts can enable them (or any font) by loading the font themselves and setting the matching CSS variable. See the Fonts section of the package README.

  **Removed** (breaking): `cellUnit`/`cellSize` (use `columns`), `glyphSource` structure/contour matching, `flowWarp`/`warpMode`, `glyphRotation`, `glyphScale`/`glyphScaleSource`/`glyphScaleMin`, `toneMapping`, `glyphSignalMode`/`colorSignalMode`, `signalGamma`, `presenceThreshold`/`presenceSoftness`, `shimmerAmount`/`shimmerSpeed`, `advection`/`motionScramble`/`scrambleDecay`, `directionBias`, `cellAspect` (now always follows the font), `renderMode` (always smooth), green-terminal color mode (use monochrome with a green tint), and the 32x break level. Unknown parameters in saved configs are ignored and fall back to defaults.

## 1.5.0

### Minor Changes

- 27c5f15: Blob tracking: fix exports rendering without blobs, move decorations to the GPU, and stabilise tracking.

  **Fixes**

  - Exports rendered with no blobs at all. `BlobTracker.step()` skipped any timestamp it had already seen, and the export pipeline's first render happens on a cold pipeline whose analysis reads back empty — so the tracker stepped once at time `t`, found nothing, and refused to run again at that `t` even though later prewarm renders produced good analysis. A repeated timestamp now rewinds to the state captured before the first step at that time and re-runs against the newer grid, so tracker state after `t` depends only on (state before `t`, best analysis at `t`) and not on how many times the pipeline rendered it. Live playback was unaffected and stays unchanged.
  - Track matching had no distance limit, so a detection could claim an arbitrarily distant track and swap ids. Matching is now bounded, with the reach widening while a track is missing so occlusion still re-acquires the same id.
  - Stroke colours rendered darker than the value passed in: the decoration texture never set a colour space.
  - Decorations desynced from the shapes when blobs were static and `shapeType` or `shapeScale` changed, and animating any decoration parameter bypassed the redraw throttle.

  **Performance**

  - Shape rendering no longer costs 32 texture samples per fragment regardless of `blobAmount`; the blob table is a uniform array read in a loop bounded by the live blob count, and the shape SDF is specialised per `shapeType`.
  - Outlines, centre markers, connectors, arrowheads and labels are now rendered as SDFs and glyph-atlas lookups in the shader instead of a 2D canvas re-uploaded as a texture. The canvas is only used for trails.
  - Detection reads a box-filtered downsample of the input rather than a point sample, so blobs jitter far less. Motion energy is correspondingly lower and smoother — a project with a hand-tuned `motionThreshold` may want it lowered.

  **New parameters**

  - `centerShape` — `"dot"` (default), `"cross"` or `"none"`.
  - `connectorDashed` — dashed connector lines, off by default.
  - `connectorArrows` — direction arrowheads on connectors, off by default.

  **Appearance changes**

  Existing blob-tracking layers will look different: blobs now fade in on spawn and out across the grace window instead of appearing and vanishing instantly, labels are pixel-space (`x:851 y:373`) rather than normalised and sit below the shape, `strokeColor` defaults to white, and a centre dot is drawn by default.

## 1.4.0

### Minor Changes

- 6f06d73: Add the blob-tracking effect layer: motion-first detection with automatic luminance fallback, persistent tracking with stable ids and smoothing, square/circle/diamond shape framing, one configurable inner effect rendered inside the detected shapes (`params.innerEffectType` / `params.innerEffectParams`), CCTV-style decorations (outlines, id+coordinate labels, straight or curved connecting lines, decaying trails), and a `"mask"` output mode that emits white-on-black fills for `compositeMode: "mask"`. Exports the `ShaderLabBlobInnerEffect` helper type. Decorations degrade gracefully when `document` is unavailable.

### Patch Changes

- 6f06d73: `onRuntimeError` on `<ShaderLabComposition>` is no longer called with `null` after every successful renderer initialization. It now only fires with `null` once a previously reported error has been resolved, and consecutive identical messages are not repeated. Consumers that surfaced the message without a null check no longer show a false error state.
- 6f06d73: Lint cleanup: convert type-only `three/webgpu` imports to `import type`, remove an unused suppression comment, and simplify a guard expression in the fluid runtime. No behavior changes.

## 1.3.14

### Patch Changes

- 23ae465: voxel pass - new shader effect that fakes isometric blocks

## 1.3.13

### Patch Changes

- 7257f2a: new interactive layers - fluid, magnifying, and pixel trail

## 1.3.12

### Patch Changes

- f94e6f2: Allow ShaderLabComposition to infer size from its container when composition is omitted

## 1.3.11

### Patch Changes

- 8979cdb: add sdbox3d utility for custom shader layer

## 1.3.10

### Patch Changes

- 768c7e9: ink pass updates and new standalone bloom layer

## 1.3.9

### Patch Changes

- a43c21f: improve performance on particle grid pass, and use logical dimensions fixes across several passes

## 1.3.8

### Patch Changes

- 42bff22: fix offsets in live and media passes

## 1.3.7

### Patch Changes

- 8678fd0: sync the package text runtime with the latest text layer updates and fix npm provenance publishing by declaring the repository url

## 1.3.6

### Patch Changes

- 9ad4873: Improve the timeline editor with multi-keyframe selection, marquee selection, keyboard editing shortcuts, and track toggles. Add curve editing and new easings, per keyframe.
- Sync the package text runtime with the newer text layer canvas rendering behavior, including logical-size scaling, anchor/offset placement, and background alpha support. Fix npm provenance publishing by declaring the package repository URL.

## 1.3.5

### Patch Changes

- 45227dc: minor fixes in pattern and ascii layers

## 1.3.4

### Patch Changes

- 34c1436: new circuit bent shader pass, crt version 2.0

## 1.3.3

### Patch Changes

- 72491d0: ascii pass improvements

## 1.3.2

### Patch Changes

- 95e78ee: srgb-fix

## 1.3.1

### Patch Changes

- a7eafe4: fix dithering color conversion

## 1.3.0

### Minor Changes

- fc1bf5d: Support custom shader layers running in effect mode. When `effectMode` is enabled in layer params, the shader receives `inputTexture` (the composited layers below) and skips sRGB-to-linear conversion since the input is already linear.

## 1.2.4

### Patch Changes

- 2e85f79: performance fixes

## 1.2.3

### Patch Changes

- 878a432: fix colorspace correction for media (imgs, videos...), per-layer adjustment for custom shaders

## 1.2.2

### Patch Changes

- ad9cd7d: perf improvements: -52% allocation pressure, -37% gpu overhead, -24% cpu per frame

## 1.2.1

### Patch Changes

- ab760fa: performance improvements

## 1.2.0

### Minor Changes

- adbbc04: Add directional blur, posterize, slice effect layers and more to the package

## 1.1.2

### Patch Changes

- 02e331f: new core layer effects

## 1.1.1

### Patch Changes

- 9803868: masking

## 1.1.0

### Minor Changes

- 9dbf768: high-level and advanced apis added to support other use cases

## 1.0.2

### Patch Changes

- b86e1f6: fix
- 6e5377b: fix package publishing so only @basementstudio/shader-lab is released from the workspace package

## 1.0.1

### Patch Changes

- 9a5c8d0: fix workflow

## 1.0.0

### Major Changes

- b878ba0: Publish the first release of `@basementstudio/shader-lab`.

  This package provides the Shader Lab runtime for rendering exported Shader Lab compositions in React apps.
