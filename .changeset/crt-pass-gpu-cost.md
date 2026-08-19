---
"@basementstudio/shader-lab": minor
---

Replace three.js `BloomNode` with a shared Jimenez-style bloom, and cut the CRT
layer's GPU cost by ~3.3x.

**Bloom.** All six bloom-using passes (crt, bloom, pattern, ink, halftone,
particle-grid) each instantiated their own `BloomNode`, which renders a fixed
5-mip chain of large separable Gaussians (11 to 43 taps) every frame regardless
of `bloomRadius` — the radius only reweighted the mips, it never reduced cost.
They now share a single `DualFilterBloom`: the Call of Duty: Advanced Warfare
progressive downsample/upsample (13-tap downsample, 9-tap tent upsample,
additive accumulation). `bloomRadius` now controls how many mip levels actually
render, so a small radius is genuinely cheaper.

Measured on an M-series GPU at 1512x949 with DPR 2, CRT layer with bloom on:
p50 frame time 24.9ms -> 17.6ms, which is the vsync floor (bloom's marginal cost
8.2ms -> 0.9ms). The glow is also no longer subject to three's `nodeFrame`
frame-id race, which could silently omit it from exported frames.

The bloom result is normalised by active level count and clamped, because CRT
feeds its output back through the persistence buffer (~0.091 per frame) and an
unbounded additive chain makes that loop diverge to white. `bloomIntensity` is
also capped at 2 (was 8) on all six layers: above that the wash itself saturates
at high radius. The cap is enforced in the compositor as well as the slider,
because the layer store writes params through without clamping, so saved
projects, MCP writes and audio modulation would otherwise bypass it. The ink
layer's default drops from 6.19 to 2 for the same reason.

**CRT.** The pass was rendering its full fragment program twice per frame — once
to the pipeline target and once more to the temporal-history target. History is
now filled with a GPU texture copy. The shader graph is also specialized per
`crtMode` at build time instead of evaluating all three mask models and blending
by a 1.0/0.0 weight, which removes 32 of 48 source texture fetches in slot-mask
and aperture-grille modes and drops the phosphor mask from 27 rounded-phosphor
evaluations to 9. `crtMode` is now structural and no longer keyframeable.

CRT layer cost 12.50ms -> 3.76ms. Slot-mask output is pixel-identical; the other
two modes differ by at most 1/255 on under 0.04% of pixels, from floating-point
reassociation in the platform shader compiler.

Also adds an opt-in preview render scale (Quality / Balanced / Performance) that
scales the live viewport only — exports always render at full quality.
