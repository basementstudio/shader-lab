# Photographic Cells: regions and perimeter outlines

Roadmap 3.3.1 A+B. Open references **11 (bridge)** and **05 (white poster)** using [the visual reference guide](../../V3-VISUAL-REFERENCES.md) before judging the result. The goal is continuous photographic regions with stepped silhouettes and thin perimeter contours.

## Focused test

1. Put a photograph in a group and a white or colored background outside, below the group. Add a **new Photographic Cells** layer above the photo inside the group. New layers start with **Layout → Regions**, **Selection Source → Random**, **Gap → 0**, and **Outline → Perimeter**. Existing layers keep their previous settings; switch their layout and outline mode explicitly to try this behavior.
2. Change **Region Size** between 0.15 and 0.6. The broad patches should change scale. Then change **Cell Size** between 0.02 and 0.08: their boundaries should gain smaller/larger steps while the interior retains photographic detail. Region Size appears only in Regions layout.
3. Switch **Outline → Every Cell**, then **Perimeter**. Internal dividing lines should appear, then disappear. Perimeter should follow outer silhouettes and holes, including with Irregularity above 0. **None** hides the width/color controls and removes the outline.
4. Try **Light Areas**, **Dark Areas**, Seed and Invert Selection. Threshold 0 keeps everything; 1 clears everything before inversion. Random regions stay fixed as the underlying photo/video changes. Tone-guided selection can change as the source changes; it is not subject tracking.
5. Hold Outline Width at 0.01, Edge Softness at 0, and vary Gap from 0 to 0.5. At zero gap adjacent selected cells join. Positive gaps separate them and therefore expose individual perimeters, without adding excess stroke weight. Outlines must not fill transparent parts of the source or affect outside layers.
6. Choose **Keep Image**: the whole photograph remains and only the selected outlines appear. Switch Outline to None to recover the untouched image.
7. Undo/redo mode and size changes, save/reopen `.lab`, and export PNG. Settings, membership, orientation, and appearance should survive. Load a pre-region project with an outline: it must keep **Individual Cells / Every Cell** and its original appearance.

## Behavior and scope

Region Size is relative to the shorter composition edge and is independent of Cell Size. Regions samples a smooth field at cell centers: Random interpolates seeded lattice values; Light/Dark interpolates image-tone samples on a lattice scaled by Region Size. It produces coherent patches, not object segmentation or a guarantee of a single connected component. Cell Size still determines the geometric approximation of those patches. Tiny source details can be missed by the tone field.

Irregularity changes row widths/staggering. Perimeter finds the nearest unselected cell boundary, respecting each row's geometry; its search reach adapts to stroke width and softness. It skips distant cells before evaluating their selection. At Gap 0 it removes shared internal edges and outlines holes and the canvas boundary. Positive Gap creates real separations and uses the individual-cell contour. Very small cells with wide, soft outlines require more neighbor queries.

Cutout clips the accumulated input within its group. The scene background still fills final output; transparent-canvas export and legacy layer Mask behavior are unchanged. Rendering fallbacks and real hydration preserve missing parameters in older saved projects. New creation defaults are a separate set.

## Validation and limits

Automated coverage includes 154 editor/runtime GPU cases: prior alpha/outline-width cases plus coherent regions, independent region/cell scales, seeded repeatability, tone selection, inversion, holes, shared edges, irregular rows, tiny cells with broad soft outlines, outline modes, and source alpha. Real hydration/history, legacy partial settings, save/reopen, exported headless runtime region pixels, group isolation, and preview/PNG equivalence are checked. The runtime comparison explicitly uses render-target UV orientation.

Local browser validation covers importing a scene, uploading a photo, layout switching, conditional controls, selection and outline modes, and actual `.lab` export. Artifacts: `.context/regions-editor-ui.png`, `.context/regions-photo.png`, `.context/regions-color.png`. The latter explores existing halftone over a color field; it does not complete the poster treatment. The catalog thumbnail uses the bundled photo and the new creation defaults.

A local synthetic moving-source benchmark used Chromium **SwiftShader (software rendering)**, five timed frames after two warm-up frames, including texture upload and waiting for GPU work. At 640×480 the median pass time was about 12 ms for Random and 27 ms for Light Areas; at 1920×1080, about 55 ms and 58 ms respectively. Settings: Cell Size 0.04, Region Size 0.35, Threshold 0.5, zero gap/irregularity, Perimeter width 0.025. These are software baseline measurements, not native GPU frame-rate claims. Representative hardware and encoded video export validation remain open; tone-driven cell boundaries may pop as the threshold is crossed.

## Follow-up scope

User visual acceptance of A+B is pending. Paint selection with Reveal/Erase, Brush Size, Clear and undo comes next after feedback. Edge Scatter remains an experiment. Fine dots/color should first be composed with existing layers, with further curation against reference 05. Exact subject isolation, automatic tracking, and the full editorial composition are not delivered by this slice.
