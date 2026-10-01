# Edge Scatter and editorial studies

Dev server: http://localhost:55000/tools/shader-lab. [Editable studies and recipes](../../public/examples/v3/README.md).

1. Save your current work. Import `public/examples/v3/color-field.lab` through Export → Project → Import .lab. Select **Stepped regions**.
2. Set **Edge Scatter** to **0**, then **0.65**, then **1**. Expect progressively rougher stepped edges and occasional small detached cells, with larger color patches retained. The fine dots stay inside the selected area; text and technical marks stay untouched. Zero restores the exact original edge.
3. Undo and redo once, then save/reopen the project. Expect the same amount and pattern. Switch Layout to Individual Cells: Scatter is hidden and ignored. Return to Regions: the saved value remains.
4. Import `painted-flora.lab`. Compare Scatter 0 and 0.5. Expect edge changes without shifting the photo or erasing the stored Paint strokes. Edit Paint, make a stroke, choose Done, and undo. The pink outline should follow the selected perimeter without internal grid seams at Gap 0.
5. Optional moving-source check: replace the photo with a video in the same group, or enable animation on the color study's Gradient. Random/Paint coverage and its scatter should stay fixed while imagery moves inside. Light/Dark selection is tone-driven, not tracking, and can change cells over time.

Automated coverage adds 38 editor/runtime GPU cases: bounded edge changes, fixed cell geometry, seeded determinism, zero/missing reset, complement/invert, source detail/alpha, Perimeter, Keep Image, individual-mode compatibility, tone/irregular/gapped regions, and live source changes without paint reupload or graph rebuild. The broader Cells suite covers actual `applyLabProjectFile` hydration, history, duplication, save/reopen, runtime frame/PNG parity and older project defaults. The new field is included in these paths.

`editorial-studies-ui.mjs` checks the real controls, conditional visibility, undo/redo, actual .lab download/reimport, and both bundled example scenes. Native GPU heat/sustained playback and encoded export remain pending; software measurements do not close those requirements.
