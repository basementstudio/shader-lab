---
"@basementstudio/shader-lab": minor
---

Blob tracking: fix exports rendering without blobs, move decorations to the GPU, and stabilise tracking.

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
