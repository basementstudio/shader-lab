# Render-loop allocation profile (plan 007)

## Outcome

**Step 2 (unconditional micro-fix) applied and tested. Step 4 (structural
identity fast-paths) deliberately NOT applied — gated pending browser
profiling.** Per the plan, "profile-gated; the structural fix runs only if the
numbers clear the threshold" — and a stop after step 2 is an explicitly valid,
complete outcome.

## Why step 4 was not applied

Step 1 requires measuring the static-frame overhead (`buildMs + syncMs`) in a
live WebGPU editor across two 30-second scenarios (static ~10-layer scene;
animating scene), and step 3 gates step 4 on `buildMs + syncMs ≥ 0.3 ms` in
the static scenario. Step 5 then requires a six-case manual regression matrix
(slider drag, visibility toggle, layer reorder, undo, timeline playback, `.lab`
import) to guard against the classic fast-path failure mode — a stale canvas.

This work was executed in a headless automation environment with **no
WebGPU-capable browser reachable**: the chrome-devtools tooling is pinned to
the Chrome `stable` channel, which is not installed (only Chrome Canary and Arc
are present, neither launchable through the available tooling). The editor's
render loop only runs under WebGPU, so neither the profile numbers nor the
stale-canvas regression matrix could be produced.

Applying the identity fast-paths (WeakMap entry memo in `contracts.ts`,
reference-equality skip in `pipeline-manager.ts`, reverse-copy removal in
`create-webgpu-renderer.ts`) **without** the measurement that justifies them
and **without** the manual regression matrix that de-risks them would be
exactly the unsafe blind optimization the plan warns against. So they are left
as a documented follow-up rather than shipped unverified.

## What WAS applied (step 2 — unconditional, safe, unit-tested)

`parameterValuesSignature` in `src/lib/editor/parameter-schema.ts` no longer
calls `String.prototype.localeCompare` for key ordering. Parameter keys are
plain ASCII identifiers, so plain lexicographic comparison (`<` / `>`) is
equally deterministic and injective on the same inputs, and avoids ICU
collation on every comparison in a per-frame, per-layer hot path.

The comparator was extracted to a small `compareKeys` helper because the
plan's suggested inline nested ternary violates the repo's `noNestedTernary`
lint rule; behavior is identical (`-1 / 0 / +1`).

Signatures are ephemeral (compared only against the previous frame's value in
`pipeline-manager.ts`'s `layerSignatures` map, never persisted), and the only
callers of `parameterValuesSignature` / `valueSignature` are
`pipeline-manager.ts` and the tests (verified:
`grep -rn "parameterValuesSignature\|valueSignature" src/ | grep -v __tests__`
→ only the definition and `pipeline-manager.ts`), so the ordering change is
safe: it stays deterministic and the signature format is not load-bearing
anywhere else.

Tests added to `src/lib/editor/__tests__/parameter-schema.test.ts`:
- equal inputs → equal signatures (existing, still passing)
- one differing parameter → different signatures
- key insertion order does not affect the signature; exact expected string
  asserted (`a:1|b:2|c:3|z:4`)

## Follow-up for whoever has a WebGPU browser

1. Re-instrument per step 1 (temporary `performance.now()` accumulators around
   `buildRendererFrame` in `use-editor-renderer.ts` and around
   `pipeline.syncLayers([...frame.layers].reverse())` in
   `create-webgpu-renderer.ts`, once-per-second console stats), mark clearly
   `// TEMP instrumentation — plan 007`.
2. Measure Scenario A (static, ~10 mixed layers, no tracks, paused) and
   Scenario B (animating, 3+ tracks, playing) for ≥30 s each; record
   `buildMs`/`syncMs` here.
3. If Scenario A `buildMs + syncMs ≥ 0.3 ms` (or a DevTools trace shows
   GC-attributable long frames): first verify no layer-store action mutates an
   `EditorLayer` in place (WeakMap identity precondition), then apply the three
   step-4 fast-paths modeled on the existing `paramsCloneCache` WeakMap in
   `contracts.ts:65-77`, run the step-5 regression matrix, remove all
   instrumentation, and append before/after numbers here.
4. Otherwise record "below threshold — structural fix not justified" and stop.
