---
"@basementstudio/shader-lab": minor
---

Add the blob-tracking effect layer: motion-first detection with automatic luminance fallback, persistent tracking with stable ids and smoothing, square/circle/diamond shape framing, one configurable inner effect rendered inside the detected shapes (`params.innerEffectType` / `params.innerEffectParams`), CCTV-style decorations (outlines, id+coordinate labels, straight or curved connecting lines, decaying trails), and a `"mask"` output mode that emits white-on-black fills for `compositeMode: "mask"`. Exports the `ShaderLabBlobInnerEffect` helper type. Decorations degrade gracefully when `document` is unavailable.
