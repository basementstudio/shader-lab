# Blob-tracking layer (plan 008) — foundation delivered, GPU stages deferred

## What this PR contains

The two **pure, browser-independent, fully unit-tested** modules that plan 008
deliberately isolates as its independently-landable foundation, plus the
readback-API confirmation from the S1.1 spike:

- `src/lib/blob-tracking/tracker.ts` — the CPU tracker (S1.2). Zero DOM/three
  imports so it runs under `bun test` and mirrors into the package unchanged.
  Motion/luminance binarization with `auto` fallback, 4-connected component
  labeling, top-N by area, persistent greedy-NN matching + EMA smoothing +
  grace despawn + monotonic ids + position-history ring, `reset()`, and the
  once-per-distinct-`time` step guard.
- `src/lib/blob-tracking/inner-effects.ts` — the inner-effect set (S2.1:
  `EFFECT_LAYER_TYPES` minus `blur`) and tolerant `parseInnerEffectParams` /
  `serializeInnerEffectParams`.
- `__tests__/tracker.test.ts` (10) + `__tests__/inner-effects.test.ts` (9),
  covering the full S1.2 and S2.1 case lists.

Both modules are unwired: nothing registers a `blob-tracking` layer yet, so the
editor's behavior is unchanged and no unverified/broken option appears in the
picker. This is the safe, reviewable slice of a multi-day feature.

## S1.1 readback spike result

`renderer.readRenderTargetPixelsAsync(renderTarget, x, y, width, height)`
exists in the installed `three@0.183.2`
(`node_modules/three/src/renderers/common/Renderer.js:2884`), returns a Promise
via `backend.copyTextureToBuffer(...)`, and matches the signature the plan
assumes. The plan's STOP condition ("API doesn't exist") does **not** trigger.
Runtime confirmation that it *resolves with plausible pixel data on the WebGPU
backend* still requires a browser (see below).

## What is deferred, and why

The remaining stages are **GPU/DOM-bound and cannot be verified in this
environment** — there is no WebGPU-capable browser reachable here (chrome
tooling is pinned to the Chrome `stable` channel, which is not installed).
Shipping them unverified would risk exactly the failure modes the plan calls
out (nondeterministic export, decoration leakage into the mask, child-pass GPU
leaks, readback throwing out of `render`). Deferred to a follow-up done at a
workstation with a WebGPU browser:

- **S1.3–S1.5**: register the layer (types/registry/factory/picker/shader-export
  unsupported list), implement `BlobTrackingPass` (analysis RTs + feedback
  swap, readback queue, SDF composite, `outputMode` mask), and verify live
  tracking + export-twice determinism.
- **S2.2–S2.4**: inner-effect child pass + sidebar section + the 22-type render
  matrix.
- **S3**: decoration overlay canvas (outlines/labels/lines/trails).
- **S4**: package mirror (`packages/shader-lab-react/**`), README, changeset,
  preview `.webp`.

The tracker's public API (`step(grid, w, h, time, config)` / `getBlobs()` /
`reset()`) is designed to be exactly what `BlobTrackingPass` and its package
mirror will consume, so this foundation is not throwaway — it unblocks and
de-risks the GPU stages.
