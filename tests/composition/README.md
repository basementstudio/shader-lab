# V3 composition baselines

First slice of roadmap steps 1.1–1.2. This PR establishes regression checks before changing alpha behavior; it does not implement transparent composition, groups, or new masks.

Integration branch: `git-chad/shader-lab-v3-plan`. Parent PR: [#150](https://github.com/basementstudio/shader-lab/pull/150). Child PRs target that branch, never `main`.

## Run

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run test:composition
```

The supported baseline runner is macOS, including the dedicated `macos-14` CI job. Linux Chromium/SwiftShader currently drops its GPU instance during texture-backed shader compilation (`Instance dropped in popErrorScope`); Linux support is not verified. The existing build, lint, and type checks remain on Linux.

The runner serves a bundled harness on an ephemeral loopback port and launches the locked Playwright Chromium with an explicitly selected SwiftShader WebGPU adapter. No app server, account, or external services are required. Missing WebGPU, browser errors, shader compilation errors, missing baselines, and mismatches fail the command; tests do not silently skip or fall back to WebGL.

Actual PNGs are saved in `.context/composition-test/`. Run `bun run test:composition --update` only when deliberately capturing a reviewed baseline. Never refresh existing legacy expectations just to make an alpha change pass.

## Frozen references

Captured before renderer changes, from the renderer at `6f39a88` (the pre-V3 `origin/main` revision). Fixture JSON files retain explicit version-6 settings instead of regenerating from layer defaults. The four render fixtures are synthetic saved projects created for regression coverage, not user-supplied artworks. They use a local SVG with a transparent cutout and soft alpha edge, and the bundled Geist Mono font.

| Fixture | What it protects |
| --- | --- |
| `legacy-text-mask` | Existing text in luminance-mask mode, including its opaque black surroundings |
| `solid-text-background` | Deliberate solid text backgrounds and partial layer opacity |
| `transparent-text-screen` | Existing transparent text with an explicitly selected Screen blend |
| `contained-image-halftone` | Contained media, current black letterboxing, and partial-strength halftone |

Each fixture renders through the editor renderer, compares preview with PNG export, and reopens serialized JSON into a new renderer/device. PNG comparisons allow at most two byte values per channel for backend rounding; no pixels may exceed that tolerance. Reopen and preview/export comparisons are exact within a run. Images are also checked for opaque alpha and nontrivial content.

`legacy-blends.json` freezes 136 GPU samples across the editor and exported runtime: all 16 blend modes at three opacities, plus five mask sources, two mask modes, and inversion. The shaders are evaluated into float render targets; both implementations must match, and reference values have a tolerance of `0.00001`. These are compatibility expectations, not endorsements of the old alpha semantics.

`existing-default-project.json` is an unmodified copy of the repository's existing saved project. Parsing, serialization, reopening, viewer hydration, and the actual editor hydration/save path must retain its nine layers, two bundled assets, blend modes, masks, opacity, and parameter values. The editor check also verifies scene settings, composition dimensions, selection, timeline, audio, and the scene-replacement signal. Its video/audio and full effect stack are **not** rendered by this initial suite.

Editor hydration starts from deliberately different store state. A separate in-memory variant adds an opacity track with keyframes, tracks targeting a missing layer and parameter, and an invalid layer selection. It verifies that hydration preserves valid animation, prunes invalid tracks, clears previous timeline selection/playhead state, and saves only the surviving track. The frozen project fixture remains unchanged.

## Confirmed alpha boundaries

These findings come from source inspection and the limited GPU checks above, not a completed end-to-end alpha audit.

| Boundary | Current behavior | Required follow-up |
| --- | --- | --- |
| `blend-modes.ts` in editor and runtime | Filter mixes RGB using source alpha but returns alpha 1; masks multiply RGB or threshold to black and return alpha 1 | Distinguish source-over composition from effect interpolation; introduce true coverage masks with a compatibility path for saved masks |
| `pass-node.ts` in both renderers | Source and effect passes share composition; default opaque node materials can force alpha 1 independently of shader output | Define straight/premultiplied alpha conventions and material settings together with separate source/effect semantics |
| `media-pass.ts` | Contain mode fills out-of-bounds samples with opaque black | Preserve previous saved appearances while allowing transparent bounds in new composition behavior |
| `pipeline-manager.ts` | A single global ping-pong chain begins over an opaque base and finishes through an opaque blit | Introduce isolated group targets and their own effect scope; keep the scene background a deliberate choice |
| `scene-post-process.ts` | Scene color adjustments return alpha 1 | Preserve coverage through color grading |
| Canvas renderer creation | Editor and runtime use `alpha: false`; editor clears to alpha 1 | Carry alpha through preview/export where supported, including texture output |
| Text creation | New text defaults to mask mode and background alpha 1 | Change only new-layer defaults in phase 2; preserve saved text settings |

Changing the shared mix formula alone is insufficient: source-over applied to a filtered copy of the same translucent input can increase its coverage. True masks also change the visual meaning of existing saved masks. Resolve both before switching the pipeline to transparent targets.

## Next implementation slice

1. Define source versus effect composition, alpha representation, and a persisted compatibility strategy for saved projects and exported runtime configs.
2. Add expected-output GPU tests for empty pixels next to opaque content, partial coverage, source-over blending, effect opacity, and soft masks over colored lower layers.
3. Implement alpha behavior across render targets, materials, postprocessing, preview, and supported exports while keeping these legacy fixtures stable.
4. Extend into isolated groups, scoped masks, reordering, undo, and save/reopen tests.

Still outstanding for phase 1: the fourteen selected artistic references, broader photographs/portraits/objects and video captures, complete runtime scene/export coverage, group/mask behavior, and the short 3D feasibility checks. This suite is a starting point, not phase-1 acceptance.
