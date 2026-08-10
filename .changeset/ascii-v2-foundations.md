---
"@basementstudio/shader-lab": minor
---

ASCII layer: crisp glyphs, real font selection, and a renderer-wide resolution fix.

**Renderer-wide fix**

- Post-processing ran at CSS-pixel resolution while the canvas was sized in device pixels, so on any HiDPI display the entire effect chain was rendered at half resolution and then nearest-upscaled to the canvas. Render targets are now sized in device pixels to match the canvas they are blitted to. Every effect layer gets sharper; exports were already correct and are unchanged. The headless renderer only applies this when it owns the renderer, so host-provided renderers keep producing textures at the size the host asked for.

**ASCII layer**

- Glyphs were rasterised into a 1-bit mask (`alpha > 96 ? 255 : 0`) and point-sampled with `NearestFilter`, throwing away the font's antialiasing. Glyphs are now signed distance fields generated at runtime with a Euclidean distance transform, and the coverage edge is resolved analytically per fragment. Diagonals no longer staircase and stroke weights are even.
- Sub-glyph detail was quantised to logical pixels — at `cellSize: 12` a fragment could only land on one of 12×12 positions inside the glyph, regardless of output resolution, which also meant ASCII got no benefit from a higher-resolution export. The cell-local coordinate is now continuous and resolved at render-target resolution.
- The atlas asked for a font family named `Geist Mono`, which does not exist — `next/font` exposes its generated family only through a CSS variable. Every glyph came from the OS default monospace. The family is now resolved properly, and the atlas waits for the font to load before rasterising instead of silently baking the fallback into a texture.
- Cells were square, which horizontally stretched monospace glyphs. Cell aspect now follows the font's own metrics by default, with a `cellAspect` override.
- The atlas was a single horizontal strip, so a long custom charset could exceed the maximum texture width. It is now grid-packed, and `customChars` accepts 128 characters instead of 32.
- Glyphs were centred per character from their own ink bounds, so the baseline shifted between characters. All glyphs now share one baseline derived from the font's metrics.

**New parameters**

- `fontFamily` — any of the bundled families, not just monospace.
- `fontWeight` — now numeric and constrained to the chosen family's available weights (was a fixed thin/regular/bold select).
- `renderMode` — `smooth` for antialiased SDF edges, `pixel` for hard-thresholded bitmap edges.
- `boldness` — dilates or erodes the distance field, so stroke weight is adjustable without re-rasterising.
- `cellAspect` — `0` follows the font.
- `colorMode` gains `green-terminal`, which the pass already implemented but was never exposed.

**Glyph selection moved off the fragment shader**

The layer now runs two tiny passes at grid resolution — one texel per character cell, roughly 32k texels at 1080p — before the full-resolution composite. The first box-filters the source over each cell with a 3×3 supersample; the second derives the signals and picks the character. The composite is then two texture reads. Net effect is fewer samples than before: the old shader took five full-resolution source samples per fragment just to compute `directionBias`, at every output pixel. Per-cell brightness is also measured from nine samples rather than one, so the tonal range is visibly wider.

**New glyph selection modes** (`glyphSource`)

- `ramp` — brightness to character, as before.
- `structure` — each cell's 4×4 shape is matched against every glyph's shape by cosine similarity and the closest wins, so characters trace the drawing instead of approximating its brightness. Cells flatter than `structureContrast` fall back to the ramp, since matching structure in a flat cell is meaningless.
- `contour` — a difference-of-Gaussians edge field picks a directional character (`|` `/` `-` `\`) wherever an edge is strong enough, with the ramp filling everywhere else. Difference-of-Gaussians rather than raw Sobel, because Sobel is noisy on photographic input and produces speckle.
- `contour-structure` — both, edges winning where they are strong.

`contourThreshold` and `contourStrength` control the edge gate; `contourStrength` scales the measured edge strength, so it stays monotonic across its whole range. Note that glyph indices are never interpolated — blending index 3 with index 11 would select index 7, an unrelated character — so the ramp/edge decision is deliberately a hard switch.

**Charset improvements**

- `autoSortCharset` (on by default) orders the characters by measured ink coverage in the chosen font. Without it, any charset ordered for one font reads wrong in another — a proportional face collapses the ramp toward its densest glyph. This is what makes the font picker useful rather than decorative.
- Added `shades`, `boxes`, `hex`, and `katakana` charsets. `boxes` with `structure` produces a technical-drawing look the layer previously had no way to reach.

**Behaviour notes**

- Changing charset, custom characters, font, or weight no longer recompiles the shader; atlas layout moved into uniforms.
- Project files are now version 4. An ASCII layer saved with the old string `fontWeight` is migrated to its numeric equivalent, and any parameter missing from an older file is backfilled from the layer's defaults.
- Blob tracking labels were affected by the same font-resolution bug and now use the real monospace family.

**Per-glyph size and rotation**

- `glyphScale` scales each character inside its cell from a routed signal (`glyphScaleSource`: luminance, inverse luminance, or the colour signal), with `glyphScaleMin` setting the floor. Size then carries information alongside the character itself — the two read best when driven by different things.
- `glyphRotation` rotates each character to follow the image's local gradient, so glyphs lie along the form the way engraving hatching does. Rotation is applied in aspect-corrected space, otherwise non-square cells shear the letterform.
- Both are clipped to the glyph's own cell, so scaling up or rotating never bleeds into a neighbouring character.

Per-cell edge data (angle, gradient magnitude, difference-of-Gaussians) moved into its own grid-resolution buffer.

**Break Grid — cells of different sizes**

`breakGrid` merges neighbouring cells into larger ones wherever the image is flat, so the grid itself stops being uniform: big characters across empty areas, small ones where there is detail. `breakThreshold` sets how flat a region has to be before it merges, and the maximum merge is capped at 2×, 4× or 8×.

A grid-resolution layout pass picks a merge level per cell by testing successively coarser blocks and taking the coarsest one that is flat enough. Because the test depends only on the block a cell belongs to, every cell inside a block independently reaches the same answer, so blocks stay coherent without any cross-cell communication. Glyph selection, antialiasing width and pixel-mode quantisation all scale with the merged block, so a merged character is genuinely one larger character rather than a stretched small one.

`breakGrid` goes up to 32x, and `breakBias` shifts the size distribution towards the big end by scaling the merge threshold per level — at 0 every size merges on the same rule, and high values let the largest cells win almost everywhere, which is how you get poster-scale characters. Pushed far enough it collapses the whole image to one cell size, which is a legitimate destination rather than a failure.

**Warping the lattice**

- `rowWarp` bends the rows of text by brightness, so lines curve around the subject like a contour map instead of running straight.
- `flowWarp` pushes the whole lattice along the image's edges, so the grid flows around the form rather than sitting square to the frame.

Both displace the sampling position *before* the cell grid is derived, so they deform the grid itself rather than moving glyphs within fixed cells. The displacement field is read from the per-cell luminance buffer, which is linearly filtered so the warp is smooth rather than stepping cell by cell — every other read of that buffer lands exactly on a texel centre, where linear and nearest agree. The extra samples are only compiled in when one of the two warps is non-zero.

`warpMode` chooses how the warp is applied. Liquid evaluates the displacement per fragment, so it varies inside each cell and the characters themselves stretch, shear and fold — several screen positions can map to the same grid position, which is where the swirling comes from. Rigid evaluates it once per cell, so whole characters are displaced and stay crisp while the rows curve. Liquid is the default. Under Rigid the field is quantised to the largest merged block, so a merged character cannot straddle two different displacements and tear.

Rotated characters no longer clip against their cell edge. Rotating a glyph rotates its bounding box, so the corners pushed past the cell — and since each fragment only ever evaluates its own cell's character, the overhanging part was never drawn and the glyph was cut along the cell boundary. The glyph is now scaled by the exact factor that fits its rotated box inside the cell, accounting for the cell's aspect, so rotation costs a little size instead of losing corners.

**Cell Unit — what you see is what you export**

`cellSize` is measured in pixels, but pixels of what: in the editor it was the viewport, on export it was the composition. Those differ, so the same setting produced a different number of characters across in the preview and in the export, and every composition decision made in the editor was approximate.

`cellUnit` adds a Columns option that measures the grid against the composition instead, so "80 columns" means 80 columns across the composition at any output size. Pixels remains the default, so existing projects are untouched.

Along the way the grid gained an explicit origin and cell size in canvas UV, shared by the grid passes and the composite. Previously the grid passes derived a cell from `ceil(logical / cellSize)` while the composite derived it from `cellSize` directly, which disagreed by up to one cell along the right and bottom edges. The grid also aligns a cell boundary to the composition's top-left, so the phase matches between preview and export and not just the density.
