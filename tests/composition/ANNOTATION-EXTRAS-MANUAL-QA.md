# Annotations: regions, connected dots and rotation — focused manual test

Scope: roadmap 6.6 item 5. Three additions to the Annotations layer: **Placement → Regions**, the **Connected Dots** element family, and element rotation (**Rotation Jitter**, **Align to Edges**). All start off; a layer saved before them looks exactly the same.

## Regions

1. Add a photo, then **Annotations**, and choose **Placement → Regions**. A caption says regions are areas of similar tone and color; nothing is recognized.
2. Boxes, corner brackets or dashed boxes frame the smaller regions, each tagged `WORD NN` (the number is the region's id). Regions that span the frame, like a sky or a ground band, get no box.
3. Dots sit on region outlines; crosses sit on outlines or centers; dashed and solid rings sit on region centers; loose labels sit on outlines. With **Palette**, every region keeps one color for all its marks.
4. With **Target** on, connectors run from the target to region centers. **Snap to Strongest Edge** is available here too.
5. Change **Seed**: the marks change, the regions do not. Change **Density**: more or fewer marks per region.
6. Put a video below and play it: regions follow the image, and their marks glide with it instead of jumping or blinking. A region that appears gets a new number; the others keep theirs.

## Connected Dots

1. **Elements → Connected Dots**: small constellations of dots linked to their nearest neighbours, with one ringed hub and, if Labels is on, a short `WORD 123` tag.
2. It respects Placement: anywhere with Seeded, along contrast with Edges, on outlines with Regions, inside your strokes with Painted.
3. Turning it on does not move any other mark. Density changes how many constellations appear. Drift moves each constellation as a whole.

## Rotation

1. **Rotation Jitter** (Placement group) turns rings, crosses and boxes by a seeded angle; 0 is upright. Box labels stay horizontal and follow the turned box's top edge. Text, rulers and metadata blocks never turn.
2. **Align to Edges** appears only with Edges or Regions. With Edges, boxes and crosses turn along the local edge; with Regions, boxes wrap each region along its long axis. Jitter adds on top.

## Persistence and export

1. Undo each change in one step; duplicate the layer and edit the copy: the original is untouched.
2. Save (.lab) and reopen: placement, the three new controls and the layout return exactly.
3. Export PNG/video and the runtime package: same marks as the canvas.

Limits: regions come from a 128×72 field of tone and color (the same field Edges reads), re-segmented only when the image below changes, at most every third frame; up to 16 regions. Segmentation takes about 3 ms of CPU per update. On a flat or noisy image regions can be few or ragged. Element budget stays 320 marks; connected dots are drawn last, so they are the first to be dropped when the budget runs out.
