---
"@basementstudio/shader-lab": major
---

ASCII layer rebuilt (v3), renderer-wide HiDPI fix, and no-blink shader rebuilds.

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
