# Pattern motifs — focused manual test

Scope: roadmap 6.5. The Pattern layer draws your own images or SVGs, ordered from light tones to dark ones, and can keep their colors.

## Tray

1. Add a photo, then **Pattern**. Set **Preset → Custom**: the **Motifs** tray appears under Preset, empty, with a **+** tile.
2. Click **+** and pick several images or SVGs at once (for example a fresh apple through a rotten one). They land in the order picked, and **Color Mode** switches to **Motif colors**.
3. Drop more files onto the tray: it highlights while dragging and appends them. After ten motifs the **+** tile disappears and extra files are reported as skipped.
4. Drag a tile: it lifts, tilts and follows the pointer while the others slide aside. Drop it elsewhere, then Cmd+Z: the order comes back in one step. Press Esc mid-drag to cancel.
5. Focus a tile with Tab, press Alt+Right to move it, Delete to remove it. The × on hover also removes it.

## Look

1. The first motif covers the lightest parts of the image and the last the darkest; the strip under the tray reads **Light → Dark**. **Invert** reverses both the mapping and the strip.
2. **Motif colors** keeps each motif's colors, and transparent areas show the **Background** (0 is black, 1 is the photo underneath).
3. **Monochrome**, **Custom**, **Quantized** and **Source** tint each motif's silhouette: a black-ink SVG on transparency shows up; an opaque photo motif becomes a solid tile.
4. **Cell Size** redraws the motifs at the new size. Removing every motif leaves the photo untouched.
5. Bars, Candles and Shapes look as before.

## Persistence and export

1. Duplicate the layer and reorder the copy: the original keeps its order.
2. Save (.lab), reload the page: the motifs and their order return. Open the file in a fresh profile without the motif files: the layer shows `Missing motif: <file>` and keeps the others.
3. Export the React config: the Pattern layer lists `patternAssets` with one `/replace/image/...` path per motif.
