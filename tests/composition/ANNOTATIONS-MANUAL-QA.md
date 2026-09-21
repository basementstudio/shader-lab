# Annotations layer — focused manual test

Scope: roadmap 6.3, part 2. A decorative effect layer that draws instrument-style marks over the layers below: a target with concentric solid and dashed rings and a reticle, scattered dots, crosses, dashed rings and boxes, corner brackets, dashed connectors, tick rulers with a counter, short readouts, a status tag and two metadata blocks. Nothing is detected; words are yours.

## Target

1. Add a photo, then **Annotations**. Drag the target's center handle onto a point of interest; drag the outer handle to resize the rings. Each drag is one Undo step.
2. With **Placement → Edges**, enable **Snap to Strongest Edge**: the target jumps to the most contrasty spot of the image and follows it on video.
3. Turn **Target** off: only the scattered elements remain.

## Placement

1. **Seeded** scatters elements anywhere. Change **Seed** for a new arrangement, **Density** for more or fewer marks, **Drift** for slow motion over time (0 freezes them).
2. **Edges**: elements cluster along image edges. On video they redistribute as the image changes.
3. **Painted**: choose it, then **Edit Area** and paint with the brush (same brush as masks and Cells). Elements appear only inside the strokes; **Clear Area** empties it.

## Elements and text

1. Toggle each family in **Elements**; Rulers and Metadata Blocks are fixed at the frame edges, the rest scatter.
2. **Text → Preset** fills Words and Metadata; edit both freely. The first word is the status tag top-left; a blank line splits Metadata into the bottom-left and bottom-right blocks. Lowercase is drawn uppercase in the mono atlas.
3. **Style**: Scale, Stroke Width, Text Size. **Color → Palette** shows a ramp; each element picks a stop by seed. Monochrome uses the single Ink color.

## Persistence and export

1. Save (.lab), reload: seed, target, text, palette and painted area return exactly.
2. Export PNG/video: identical to the canvas; the runtime package draws the same layout.

Limits: readouts and counters are fake and change slowly with time; the edge field is a 128×72 Sobel map read back every third frame. Element budget is 320 marks and 1024 glyphs.
