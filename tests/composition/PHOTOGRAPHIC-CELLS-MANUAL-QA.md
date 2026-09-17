# Photographic Cells prototype

The first cell/block family slice from roadmap 3.2–3.3. Each cell retains the original photographic detail. Light/Dark selection uses a sample at the cell center; Random selects cells using a stable seed.

## Focused test

1. Put a photograph in a group and a colored background outside, below that group. Add **Photographic Cells** above the photo inside the group.
2. Leave **Output → Cutout**. Move **Threshold** from 0 to 1: all cells should gradually give way to the outside background. **Invert Selection** swaps which cells remain.
3. Try **Select Cells → Dark Areas**, then **Random**. Change **Cell Size**, **Cell Aspect**, **Irregularity**, and **Seed**. Photo details inside each block should remain sharp rather than becoming a single flat color.
4. Increase **Gap**, then set **Outline Width → 0.04** and choose an outline color. Gaps should reveal the external background; outlines should stay within the photo's existing coverage. Text outside the group must remain unaffected.
5. Choose **Keep Image** to retain the original photo with only the selected cell outlines over it. Set Outline Width to 0 to restore the original image in this mode.
6. Undo a setting change, save/reopen `.lab`, and export PNG. Settings, membership, and appearance should survive.

## Scope and limits

Cell Size is relative to the shorter composition edge; Cell Aspect stretches cell width. Irregularity varies row widths and staggering. This prototype uses rectangular cells; Voronoi cells, moving fragments, and automatic object segmentation are not included.

Cutout clips the current accumulated input. Use an isolated group to target one photo. The scene's background still fills final output; this does not introduce transparent-canvas export or change the legacy layer Mask mode.

Selection is based on one sample per cell, so tiny image features can disappear when cells are large. Video may change cell selection as tones cross the threshold; temporal stabilization and representative hardware/video export measurements remain follow-up validation. There is no per-cell GPU loop.

Automated tests cover 40 editor/runtime GPU cases, full-detail interiors, tone/random/inverted selection, deterministic seeds, transparent/soft gaps, colored outlines, opacity, rectangular canvases, real hydration/history, saved/reopened pixels, exported runtime config, and preview/PNG equivalence. The catalog preview uses the bundled photographic example and the new default settings.
