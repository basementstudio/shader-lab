# Displaced Rings prototype

This is the first ring-family slice from roadmap 3.2–3.3, with its visual direction confirmed by the user. Generic circle/rectangle masks remain postponed.

## Focused test

1. Put a photograph in a group. Keep a colored background below the group and a text layer above it, outside the group.
2. Select the photo, add **Displaced Rings**, and keep it above the photo inside that group.
3. Set **Output → Cutout**, **Shape → Half-discs**, **Rings → 8**, **Radius → 0.8**, **Rotation per Ring → 27°**, **Offset → X 0.09 / Y 0.025**, and **Gap → 0.07**.
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

## User-curated new-layer defaults

New rings use Distort, Half-discs, 22 rings, radius 2, 45° rotation per ring, and zero offset/gap. Other controls retain their defaults. Saved explicit settings are unchanged. Missing saved fields use the old defaults (Rings, 8, radius 0.9, 12°, offset 0.045/0, gap 0.04), matching unchanged runtime fallbacks. The photographic stress-test thumbnail retains its original explicit 8-band setup.


## Reference 16 pass: shapes, jitter and lines (September 23, 2026)

The user found the layer "missing something" against reference 16. Rereading 16: every band is the same photograph turned by its own irregular angle (not a regular spiral), band widths are uneven, and thin concentric hairlines on every boundary continue across the whole black poster past the photograph. The blue-on-black photo is a separate treatment.

1. Put Rings, a Threshold (dark #050507, light #2f7bff) and a photo in a group over a near-black background. Rings: Output Cutout, Cut Full, Rotation per Ring 0, **Rotation Jitter** about 38 degrees, **Width Jitter** about 0.6, Radius about 1.1.
2. **Lines: Edges and beyond**, Line Width about 1.25, blue. Expect concentric hairlines on every band edge that keep repeating across the canvas.
3. **Shape: Square / Triangle / Polygon (Sides)**: bands become rotated frames; each band's outline turns with it. Use Lines: Band edges for a calmer look with polygons.
4. Change **Seed**: rotations and widths reshuffle.

New controls default to off (Circle, no jitter, no lines), so existing layers keep their look. The dot texture in the darks of 16 can come from Dot Grid or Pattern inside the group.
