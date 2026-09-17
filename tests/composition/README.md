# V3 composition baselines

Regression coverage for roadmap steps 1.1–1.2. The first PR establishes legacy baselines; its stacked successors add transparent media bounds and alpha-aware source/effect composition. Transparent scene/export backgrounds, groups, and new masks remain outstanding.

Integration branch: `git-chad/shader-lab-v3-plan`. Parent PR: [#150](https://github.com/basementstudio/shader-lab/pull/150). The first child, [#151](https://github.com/basementstudio/shader-lab/pull/151), targets integration. Each subsequent stacked PR targets the preceding feature branch, never `main`.

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

## Transparent media bounds

New image and video layers expose **Transparent Borders** when Fit is **Contain**. It defaults on; disabling it restores black borders. Saved layers without `transparentBounds` are migrated to `false` before new defaults are applied. Runtime configs that omit it also keep black borders. Cover mode is unchanged, including its existing edge sampling. No saved fixture or visual baseline is refreshed for this change.

`media-bounds.mjs` renders the editor and runtime MediaPass with both the SVG and bundled video over a colored input texture. It checks legacy/missing, explicit solid, transparent, partial-opacity, scaled/offset, and Cover cases. It also checks new-layer defaults, migration, save/reopen, shader-config export, and preview/PNG export against explicit pixel expectations. Rendered transparent/solid examples are saved alongside the baseline artifacts.

This change reveals lower content at empty media bounds; it does not make the scene canvas or exported PNG background transparent. The existing scene background, mask semantics, and global effect scope remain unchanged.

## Confirmed alpha boundaries

### Source/effect composition foundation

The shared compositor now treats source layers as straight-alpha source-over and effect layers as coverage-preserving color filters. Source blending follows the [W3C general blending/compositing formula](https://www.w3.org/TR/compositing-1/#blending), including backdrop coverage when applying blend modes. Zero-coverage output is finite and tiny nonzero coverage does not darken RGB. The opaque-backdrop path retains the previous RGB expression.

Effect output alpha continues to control effect strength (`layer opacity × effect alpha`); it does not add new coverage over the input. The layer kind determines this role, with custom shaders in Effect Mode treated as effects. This is the initial policy: spatial effects still need per-effect evaluation of displaced/blurred coverage before claiming complete alpha support.

Pass materials (including asynchronously replaced materials), texture copies, and scene grading retain alpha instead of forcing it opaque. Materials use `NoBlending` because the shader has already computed the final pixel; another GPU blend would apply alpha twice. Internal textures use straight RGB and alpha. Runtime callers supplying premultiplied input need to convert it to straight alpha first.

`alpha-compositing.mjs` checks analytic source-over examples, all blend modes against empty backdrops, finite empty pixels, tiny alpha, source/effect opacity, adjacent transparent/opaque pixels, repeated filtering, actual pass material creation/replacement, scene grading, and the headless runtime pipeline. It checks source/effect role selection using real gradient and posterize layers over a translucent external texture. All legacy PNGs and mask samples remain unchanged.

These findings come from source inspection and the limited GPU checks above, not a completed end-to-end alpha audit.

| Boundary | Current behavior | Required follow-up |
| --- | --- | --- |
| `blend-modes.ts` in editor and runtime | Sources combine coverage; effects preserve input coverage. Legacy masks still darken RGB and return alpha 1 | Introduce true coverage masks with a compatibility path for saved masks |
| `pass-node.ts` in both renderers | Roles are derived from layer kind/Effect Mode; initial and replacement materials preserve computed straight alpha | Audit individual effect algorithms, particularly spatial effects, as group composition is introduced |
| `media-pass.ts` | Contain mode now supports transparent out-of-bounds samples, defaulting on for new layers; absent settings retain black | Broader alpha composition remains separate from this source-boundary fix |
| `pipeline-manager.ts` | A single global ping-pong chain begins over an opaque base; texture copies now retain alpha, including external runtime inputs | Introduce isolated group targets and their own effect scope; keep the scene background a deliberate choice |
| `scene-post-process.ts` | Scene color adjustments now retain input alpha | Verify grading together with future transparent canvas/export support |
| Canvas renderer creation | Editor and runtime use `alpha: false`; editor clears to alpha 1 | Carry alpha through preview/export where supported, including texture output |
| Text creation | New text defaults to mask mode and background alpha 1 | Change only new-layer defaults in phase 2; preserve saved text settings |

The source/effect distinction prevents repeated filtering from increasing coverage. True masks still change the visual meaning of existing saved masks and require an explicit compatibility path before switching the editor to transparent targets.

## Next implementation slice

1. Define a persisted compatibility strategy for true coverage masks in saved projects and exported runtime configs.
2. Extend the alpha tests with soft masks over colored lower layers and per-effect spatial behavior.
3. Carry alpha through transparent scene backgrounds, preview, and supported exports while keeping these legacy fixtures stable.
4. Extend into isolated groups, scoped masks, reordering, undo, and save/reopen tests.

Still outstanding for phase 1: the fourteen selected artistic references, broader photographs/portraits/objects and video captures, complete runtime scene/export coverage, group/mask behavior, and the short 3D feasibility checks. This suite is a starting point, not phase-1 acceptance.
