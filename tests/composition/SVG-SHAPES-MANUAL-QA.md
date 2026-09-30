# SVG shapes — focused manual test

Scope: roadmap 2.7 and 6.6. A Shape layer can draw an uploaded SVG with sharp edges, Softness, Outline and editable colors.

## Source

1. Add a photo, then a **Shape** layer. Set **Shape → SVG** and click **Choose SVG**. Pick a logo: it appears at the center in its own colors, sized to the logo's proportions, and the file name shows under **SVG**.
2. **Replace** swaps the file and keeps position, rotation and blend.
3. An SVG that only has `width`/`height` (no `viewBox`) and one with holes (`fill-rule="evenodd"`) both draw correctly. Text inside an SVG draws with the browser's fonts; convert it to outlines for exact results.

## Look

1. Drag the corner handles far larger than the file: the outer edge stays sharp. Rotate with the handle.
2. **Softness** feathers the edge without a dark fringe; **Outline** draws only the edge, in the layer **Color**.
3. **SVG Colors → Original** lists the file's colors under **File colors**. Change one: only that color changes, and changing it back matches the file again. **Reset** restores all of them. Shapes without a fill show up as black and can be recolored too.
4. **SVG Colors → Single color** fills every part with **Color**.
5. Set **Blend → Multiply** or **Screen** over the photo for a double exposure (reference 20).

## Persistence and export

1. Undo each change; duplicate the layer and recolor the copy: the original keeps its colors.
2. Save (.lab) and reload: the SVG, its colors and its placement return. Open the file without the SVG: the layer shows `Missing asset: <file>`.
3. Export the React config: the Shape layer has `asset` with a `/replace/image/<file>.svg` path.
