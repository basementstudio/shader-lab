# V3 composition baselines

Regression coverage for roadmap steps 1.1–1.3 and 2.1. The first PR establishes legacy baselines; its stacked successors add transparent media bounds, alpha-aware composition, isolated groups, editor controls/persistence, and transparent text defaults. Transparent scene/export backgrounds remain outstanding. Basic shape masks are postponed; tailored coverage modes will be developed alongside selected artistic effects.

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
| `blend-modes.ts` in editor and runtime | Sources combine coverage; color effects preserve input coverage; Displaced Rings transforms it. Legacy masks still darken RGB and return alpha 1 | Introduce true coverage masks with a compatibility path for saved masks |
| `pass-node.ts` in both renderers | Roles are derived from layer kind/Effect Mode; initial and replacement materials preserve computed straight alpha | Audit individual effect algorithms, particularly spatial effects, as group composition is introduced |
| `media-pass.ts` | Contain mode now supports transparent out-of-bounds samples, defaulting on for new layers; absent settings retain black | Broader alpha composition remains separate from this source-boundary fix |
| `pipeline-manager.ts` | The root begins over an opaque base (or a runtime input texture); groups render children against independent transparent targets and are connected to editor organization/history/persistence/runtime configs | Add coverage masks and verify representative large grouped scenes; keep the scene background a deliberate choice |
| `scene-post-process.ts` | Scene color adjustments now retain input alpha | Verify grading together with future transparent canvas/export support |
| Canvas renderer creation | Editor and runtime use `alpha: false`; editor clears to alpha 1 | Carry alpha through preview/export where supported, including texture output |
| Text creation | New text uses Normal/filter composition and background alpha 0. Saved text retains its settings; absent background alpha hydrates to the old solid fallback | Continue typography usability work; keep old text fixtures stable |

The source/effect distinction prevents repeated filtering from increasing coverage. True masks still change the visual meaning of existing saved masks and require an explicit compatibility path before switching the editor to transparent targets.

## Next implementation slice

1. Validate the Displaced Rings prototype with the [focused manual test](DISPLACED-RINGS-MANUAL-QA.md). The user confirmed the transparent-text and focused group checks; retain the broader [group checklist](GROUPS-MANUAL-QA.md) for final regression.
2. Refine the selected ring direction after visual feedback, then continue the roadmap. Basic circle/rectangle masks remain postponed; Blob Tracking's quality and tailored-mask review is low priority (roadmap 6.3).
3. Carry alpha through transparent scene backgrounds, preview, and supported exports while keeping these legacy fixtures stable.

## Transparent text defaults

New text uses Normal blending, filter composition, full layer opacity, and background opacity 0. Letters remain opaque and editable through Text Color; set Background Opacity to 1 for a deliberate solid background. Existing mask/Screen choices and explicit background opacity values survive hydration. A saved text layer missing `backgroundAlpha` receives 1 before new defaults are filled, matching the unchanged editor/runtime renderer fallback. The file format remains version 7.

`transparent-text.mjs` exercises real editor hydration for old/missing and explicit settings, save/reopen, runtime config export, preview/PNG equality, and 18 editor/runtime text-pass pixel checks. It verifies opaque colored glyphs, transparent empty regions over a translucent blue input, soft edges without dark fringes, partial layer opacity, and optional solid backgrounds. `new-transparent-text.png` shows the new default over a blue scene; frozen legacy fixtures are unchanged.

## Isolated group renderer foundation

The internal `RendererFrame.layers` contract accepts a tree of existing renderable layers and `CompositionGroup` nodes. Frames use top-first sidebar order at every level; pipeline synchronization reverses every sibling list into paint order. The first renderer slice established this foundation; the editor integration below builds on it.

Each group clears its own targets to transparent, processes only its children, and composites the combined result into its parent. Group opacity and blend mode apply once to that result. Empty and effect-only groups do not modify the parent; hidden parents suppress rendering and export preparation throughout their subtree. Children retain their pass instances when reparented, preserving media/simulation state. Removed groups dispose their own targets and material without disposing surviving children.

Nesting is bounded to eight group levels. Duplicate IDs and excessive depth are rejected before pipeline synchronization mutates live passes. Each group owns two full-resolution RGBA16F targets (about 32 MiB at 1920×1080), reused across frames and resized with the output. This is not an unlimited group-count or performance guarantee; pooling and representative large-scene measurements remain follow-up work.

`groups.mjs` exercises actual editor/runtime pipelines with gradient sources and threshold effects, covering effect isolation, overlap, group versus child opacity, nested/sibling scope, visibility, ordering, reparenting, resize, cleanup, animation discovery, export preparation, and external runtime input alpha. The editor entry-point test renders a nested photographic group with transparent bounds and compares preview with PNG export, saving `isolated-groups.png`. Existing flat saved projects and frozen baselines remain unchanged.

## Editor groups and version-7 persistence

Editor layers remain a flat list in top-first preorder. Group layers have `kind/type: "group"`; each child has a `parentId` reference. Group children are contiguous after their parent, IDs are unique, and the renderer's eight-level limit applies to edits and imported files. Project parsing and direct editor hydration reject malformed hierarchy before changing stores. Existing flat version-1–6 files remain readable; new saves use version 7.

The sidebar supports grouping selected siblings, adding layers to the selected group, nested lists, collapse/expand, rename, visibility, duplication, deletion, and subtree reordering. Properties provides group opacity/blend and a Group selector for moving layers between groups. Keyboard shortcuts are Cmd/Ctrl+G and Cmd/Ctrl+Shift+G. Handle dragging supports reordering and reparenting: group centers accept children, row edges mark before/after destinations, and the left gutter selects an ancestor level. The tree stays in place until the drop commits ordering and membership together; groups carry their complete subtrees. Escape, lost pointer capture, and releases outside the list cancel. The layer menu’s Move up/down actions and Properties Group selector remain keyboard alternatives.

History retains group hierarchy and selections. Duplicates get new group/child IDs, remapped child animation tracks and audio links. Deleting a group removes its descendants and their track/audio references. Ungroup lifts children to the former parent's level and removes the group's own settings. Collapse is organizational and does not affect the image.

`editor-groups.mjs` tests these store operations, actual history restoration, grouping depth/cycle rejection, version-7 save → **applyLabProjectFile** → save, child/group animation, malformed imports, and hidden-parent frame construction. It exports a real `ShaderLabConfig` and renders it through the headless runtime, then compares grouped editor preview/PNG output and a fresh saved-project render. The saved group is collapsed to verify that collapse does not suppress rendering. Coverage masks remain separate work.

Still outstanding for phase 1: the fourteen selected artistic references, broader photographs/portraits/objects and video captures, complete runtime scene/export coverage, group/mask behavior, and the short 3D feasibility checks. This suite is a starting point, not phase-1 acceptance.

## Displaced Rings prototype

`displaced-rings.mjs` exercises the new effect in both renderers with exact pixel parity: identity at 1/8/48/128 rings, touching-band coverage, antialiased cutout edges, half-discs, opacity, empty gaps, seeded displacement, and rotation of asymmetric color/alpha. A 512×384 case explicitly counts 48 separated radial bands. Its logged wall time includes readback on SwiftShader and is not a real-time GPU performance claim.

The test also restores history, saves and hydrates through `applyLabProjectFile`, renders exported runtime configuration, checks cutouts inside a group over an external background, and compares preview/PNG and reopened pixels. A bundled photograph supplies a nonblank visual artifact. Original compatibility fixtures remain frozen.

This effect uses the new `transform` composition role: layer opacity interpolates premultiplied original/transformed pixels, including their coverage; zero opacity restores the input. Other effects retain their existing roles. Cutout starts with transparent coverage and composites transformed bands; Distort retains the original image between bands. Samples outside the input image are transparent. Scene background/export alpha policy is unchanged. Legacy layer Mask mode retains its old semantics; use Output → Cutout for these holes.

See [controls, scope, and remaining visual checks](DISPLACED-RINGS-MANUAL-QA.md). Broader video/export and hardware performance checks remain pending.

## Group drag regression coverage

`layer-drops.mjs` (included in the composition suite) covers atomic ordering/membership updates, collapsed targets, subtree moves, cycles, locked layers/groups, maximum nesting, no-op drops, history restoration, and real project hydration.

With the editor running, execute `SHADER_LAB_URL=http://localhost:55000 bun tests/composition/group-drag-ui.mjs` for actual pointer gestures, destination feedback, nested/outdent drops, cancellation, undo/redo, and .lab download/import. It uses an isolated browser context; artifacts go to `.context/group-drag-test/`.

## Photographic Cells prototype and curated ring defaults

`photographic-cells.mjs` adds 40 editor/runtime GPU cases for full-resolution photographic interiors, light/dark/random selection, inversion, deterministic seeds, alpha/soft edges, outlines, opacity, parameter extremes, and cell proportions on rectangular compositions. It exercises actual `applyLabProjectFile` hydration, history restore, exported headless runtime configuration, group isolation, save/reopen, and preview/PNG comparison. Artifacts include `cell-cutout.png` and `photographic-cells-preview.png`; the latter supplies the catalog thumbnail. See [the focused manual test and limits](PHOTOGRAPHIC-CELLS-MANUAL-QA.md).

`displaced-rings.mjs` now verifies the user's new-layer defaults and preservation of missing saved fields before default filling. Renderer fallbacks and all frozen compatibility fixtures remain unchanged.
