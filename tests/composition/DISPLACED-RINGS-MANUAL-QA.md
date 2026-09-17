# Displaced Rings prototype

This is the first ring-family slice from roadmap 3.2–3.3, awaiting the user's visual feedback. Generic circle/rectangle masks remain postponed.

## Focused test

1. Put a photograph in a group. Keep a colored background below the group and a text layer above it, outside the group.
2. Select the photo, add **Displaced Rings**, and keep it above the photo inside that group.
3. Set **Output → Cutout**, **Shape → Half-discs**, **Rings → 8**, **Rotation per Ring → 27°**, **Offset → X 0.09 / Y 0.025**, and **Gap → 0.07**.
4. Change **Rings** to **48**, then return to 8. Change Rotation per Ring and Offset.

Expected: displaced photographic arcs rotate and shift; their gaps reveal the background outside the group. External text remains intact. The 48-ring setting produces much finer fragmentation. There are no black rectangles replacing the holes.

## Additional regression checks

- Output → Distort restores the original photo between bands. Output → Cutout clears those regions. Hiding the effect or setting its layer opacity to 0 restores the input.
- Set Shape → Rings, Offset → 0/0, Gap → 0, Edge Softness → 0. Touching bands must not create translucent seams.
- Random Offset Pattern exposes Seed. Reusing a seed produces the same offsets; another seed changes them.
- Undo a count/rotation change, redo it, save `.lab`, and reopen. Group membership, controls, and appearance should survive.
- Export PNG at the composition size and compare against the preview. Scene Background Color still fills the final scene; this does not add transparent-canvas export.

## Scope and limits

The effect accepts 1–128 bands. Radius and Offset use the shorter composition edge, preserving circular geometry on rectangular canvases. Band Distribution controls relative widths. Rotation per Ring and Scale Progression apply across the sequence; rings do not yet have individual handles or parameter lists. Coverage inversion is not included.

Cutout clips the accumulated content below it in its current group. At the scene root it acts on the root composition. Use a group to isolate a photograph from lower scene layers. The existing layer-level Mask setting is separate and retains its legacy behavior.

Automated checks cover editor/runtime GPU parity, displaced color and alpha, 48 distinct bands, real editor hydration/history, runtime config export, and preview/PNG comparison. The catalog thumbnail uses the bundled photographic sample with the half-disc settings above. Representative video export, hardware performance, and full artistic-reference comparison remain to be validated; 128 is a bounded prototype limit, not a real-time performance guarantee.
