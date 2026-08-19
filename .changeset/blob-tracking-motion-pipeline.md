---
"@basementstudio/shader-lab": major
---

Blob tracking: motion pipeline rebuild, instanced decorations, motion mask.

**Breaking:** `sensitivity` on the blob-tracking layer is inverted. It was fed
straight in as a luma cutoff, so raising it detected *less*; it now reads
high-is-more-sensitive. Hosts passing this parameter directly should use
`1 - previousValue`. Editor project files are migrated automatically (v5).

**Breaking:** the `innerEffectMask` parameter is removed. Where the inner effect
renders is now decided by `outputMode` — `"decorated"` puts it inside the blob
shapes, `"motion"` puts it inside the motion mask.

Added
- `outputMode: "motion"` emits a full-detail motion mask, or the inner effect
  carried by that mask's alpha when one is set, so effects can be confined to
  whatever is moving and stay transparent elsewhere.
- `motionMaskThreshold` and `motionPersistence` parameters.
- Per-blob velocity estimation. Track matching now predicts ahead, which stops
  ids swapping when two subjects cross, and boxes are led by their velocity to
  cancel the asynchronous readback latency.

Changed
- Blob boxes use both extents instead of collapsing them, so they hug their
  subject rather than always drawing square.
- Detection is resolution-independent: a luma pyramid replaces a fixed-offset
  tap pattern whose behaviour depended on output resolution.
- Decorations are rasterised as instanced quads instead of full-screen SDF
  loops, so each pixel only shades primitives that cover it.
- Trails are a GPU feedback buffer rather than a 2D canvas re-uploaded each
  frame.
- The layer emits a real alpha instead of pre-mixing against its input, so an
  unlit mask leaves it transparent and blend modes apply only where it is lit.

Fixed
- `dispose()` no longer leaks the label atlas and glyph index texture.
- A failed analysis readback logs once instead of silently leaving the layer
  with no blobs forever.
