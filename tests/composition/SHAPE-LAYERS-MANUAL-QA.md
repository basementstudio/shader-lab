# Shape layers — focused manual test

Scope: roadmap 2.7, first stage. A **Shape** source layer draws a flat-color silhouette with editable geometry. No pen tool, no Bézier editing; the brush still paints mask coverage, not paths.

## Basics

1. Add a photo. In the layer picker, add **Shape** (sources row, star icon). A red ellipse appears centered.
2. Drag the center handle to move it, the X handle to rotate and widen, the Y handle for height. Each drag is one Undo step; Esc cancels a drag.
3. **Shape**: Ellipse, Rectangle (Corner Radius), Triangle, Polygon (Sides), Star (Points, Inner Radius), Ring (Thickness), Blades (Blades, Twist, Blade Width, Hub). Only the relevant controls show.
4. **Color** picks the fill. **Outline** above 0 draws only the edge. **Softness** feathers the edge; at 0 the edge is antialiased.

## Photographic blends (Lovedance)

1. Photo below, Shape → Blades, 4 blades, size around 0.9, color a warm red. Set Blend → Multiply or Screen: the photo shows through the silhouette in the shape's color. Try Color and Hard Light too.
2. Add a Mask → Rectangle or Brush on the Shape: the silhouette is cut where the mask says. Group the Shape with the photo and use the group mask to cut both.
3. Put a Halftone above the Shape: the dots pick up the shape color.

## Persistence and export

1. Save (.lab) and reload: shape kind, geometry, color, blend and masks return exactly.
2. Duplicate the Shape and change the copy; the original is unaffected.
3. Export PNG/video: identical to the canvas; the runtime package renders the same shape.

Limits: shapes are procedural presets; user-uploaded SVG shapes are recorded in the roadmap as the next stage of 2.7; using a Shape layer as another layer's mask is a later decision (1.4/2.7). Default color, size and the Blades curve are open to your choice.
