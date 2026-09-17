# Photographic Cells: painted reveal

Roadmap 3.3.1 C. Visual target: reference **11, bridge** in [the reference guide](../../V3-VISUAL-REFERENCES.md): directed photographic silhouettes, stepped boundaries, thin perimeter, generous negative space. This adds manual direction; it does not add subject tracking or finish the poster's fine-dot treatment.

## Focused acceptance

1. Above a photograph, select **Photographic Cells → Layout → Paint**, **Output → Cutout**, **Gap → 0**, **Outline → Perimeter**. Choosing Paint starts editing automatically and shows the faint source guide. After Done Painting, use Edit Paint to resume. Switching to another layout exits editing.
2. With **Reveal**, drag across a subject. Expect full photographic detail inside connected stepped blocks, a fine perimeter, and no internal grid lines. Choose **Done Painting**: the faint guide disappears.
3. Edit again, choose **Erase**, and remove a small part. Undo once restores that entire stroke; redo reapplies it. **Clear Paint** clears the mask and can be undone. Escape during a stroke cancels it. Opening/dismissing Export does not exit Paint mode.
4. Space-drag to pan and use the usual zoom controls. The brush stays under the pointer. Change Cell Size: the steps change, while the painted area remains. Switch to Regions and back: the painting is retained. Duplicate the layer: the copy retains its painting.
5. Save/reopen `.lab` and export PNG. Only the finished reveal should appear, with the same orientation and contours, even if Paint editing was active when exporting. The guide and uncommitted stroke are editor-only.
6. Try a short video beneath the layer. The image should keep moving inside the stationary painted reveal. Painting does **not** follow a moving subject. Check responsiveness at your normal canvas resolution with Rings enabled and disabled.

## Automated checks

- `bun run check`
- `bun run test:composition`: paint coordinate orientation, automatic-control independence, inversion, contour seams, source alpha, guide removal, clear/malformed masks, changing source frames without mask uploads, editor/runtime parity, brush interpolation/erase/roundtrip, viewport extent expansion, actual hydration, history, duplication, mode/size retention and exported runtime/PNG parity.
- With the dev server running: `bun tests/composition/cell-paint-ui.mjs` (`SHADER_LAB_URL` overrides localhost:55000). Uses actual file import/photo upload, pointer gestures, undo/redo, clear, Escape, pan/zoom with a coordinate assertion, and `.lab` download/reopen. Artifacts are under `.context/paint-*`.
- Optional bounded video benchmark: `bun tests/composition/effect-video-performance.mjs`. Writes `.context/effect-video-performance.json` with adapter, decoded video dimensions and pass timings. No CI performance threshold.

## Implementation and limits

Coverage is a 512×512 binary mask, stored as versioned bit-packed base64 (under 44 KB per layer), rather than a growing list of strokes. A stroke visits only its bounding rectangle and interpolates between pointer samples. Draft publication is coalesced to animation frames; only the completed stroke enters project state/history. A single 256 KB single-channel GPU texture is reused, decoded/uploaded only when the mask string changes. Source video/animation remains live independently of that mask.

The mask is centered in the same shorter-edge coordinates as the cell grid. Viewport expansion preserves that coordinate system and resamples coverage only when another stroke needs a larger extent. Extreme aspect ratios or many successive viewport expansions can reduce mask precision; this is a directed cellular reveal, not a high-resolution general-purpose paint document. Export resolution does not rerasterize brush strokes. Clear resets the stored extent.

The initial video baseline uses Chromium's **SwiftShader software adapter**, decoded `aura.mp4` frames uploaded through CanvasTexture, two warm-up frames and five timed frames per scenario. It includes upload, render submission and queue completion, excluding the wait for the next video frame. Direct external VideoTexture import failed on this test adapter, so this does not measure the app's native video upload path. At 1080p the pre-paint baseline measured roughly 491 ms Rings, 45 ms Random Regions, 71 ms Light Regions and 543 ms Rings + Random Regions. Rings is the main cost in **this software test**, not a diagnosis of the user's Mac. Native GPU sustained playback/interaction, thermal behavior and encoded video export remain part of roadmap 7.2; future 3D needs its own moving-scene cases.


With Paint included in the same bounded software run (578×720 decoded video), median pass times were:

| Output | Rings | Random Regions | Light Regions | Paint | Rings + Regions | Rings + Paint |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 640×480 | 84 ms | 13 ms | 24 ms | 19 ms | 86 ms | 87 ms |
| 1920×1080 | 503 ms | 49 ms | 77 ms | 48 ms | 535 ms | 534 ms |

These masks have different shapes/coverage, so this is a workload baseline, not a claim that Paint accelerates Regions. The combined 1080p samples peaked near 697 ms (Regions) and 586 ms (Paint). Native hardware measurement remains necessary.
