# Stable artboard — focused manual test

Scope: roadmap 2.8. Scene → Composition → **Aspect** now separates two modes. **Screen (adaptive)** is the old behavior: the canvas fills the window and older scenes keep it. Every other aspect is a **fixed artboard** with a real size (Size row), centered in the viewport with a pasteboard around it.

## Fixed artboard

1. Project → New blank project. It starts as a 16:9 artboard at 1920×1080, centered with a margin. Resize the window: the artboard rescales but nothing inside reframes.
2. Add a photo and a Halftone with an Ellipse mask. Drag the mask off-center, then resize the window and toggle the sidebars: the ellipse stays on the same part of the photo.
3. Scene → Composition → Aspect → 9:16. The artboard becomes portrait and the Size row reads 607×1080 (the previous artboard cropped to the new ratio). Edit Width to 1080: Height follows to 1920.
4. Aspect → Custom, then set any size, e.g. 720×960. Export PNG: the file is exactly 720×960 and matches the canvas.
5. Import public/examples/v3/color-field.lab: it opens as a 720×960 artboard and no longer reframes with the window.

## Adaptive mode

1. Aspect → Screen (adaptive): the canvas fills the viewport again and follows the window, as before.
2. Project → Open demo: it stays adaptive (the demo file says so). Undo/redo across aspect changes restores both the aspect and the size.

## Elsewhere

- The community scene page letterboxes fixed-artboard scenes inside the player instead of stretching them; adaptive scenes still fill it.
- Zoom and pan behave as before. 100% means "fit", so the artboard fills the viewport minus its margin.

Limits: zooming above 100% scales the fitted canvas visually and looks soft, as before. The optional grid (phase 8) will use this same document space.
