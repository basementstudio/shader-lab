# Erosion — focused manual test

Scope: roadmap 3.4 consolidation, the erosion of 6.1 #2. References: 09 (a silhouette disintegrating into speckle) and 14 (highlights eaten into paper).

## Basics

1. Add a photo, then **Erosion** (Distort, after Signal Rot). New layers start on **Disintegrate**: strong contours crumble into grainy speckle with colored crumbs thrown across the edge; flat interiors stay intact.
2. **Style**: Disintegrate (09), Paper Erosion (14, light tones dissolve into paper), Crumbled Cutout (for text and transparent images). Editing any control shows **Custom**.

## Controls to push

- **Erode From:** Edges, Light tones, Dark tones, Cutout edge (the border of transparent images or text).
- **Erode:** how much dissolves. Keyframe it from 0 to 1 to crumble the image away.
- **Edge Width, Speckle Size, Clumping, Scatter.**
- **Reveal:** Paper (with Paper Color) or Transparent. Transparent cuts real holes: inside a group they show the layers below the group.
- **Speed / Seed:** 0 freezes the crumbs; above 0 they flicker and shift.

## Cutout check

1. Group a Text layer with Erosion above it, Crumbled Cutout style, and put a photo below the group.
2. The letters crumble at their borders with holes showing the photo and crumbs scattered outward; the photo outside the letters is untouched.

## Persistence and export

Save/reload, duplicate, undo a style change: settings return exactly. Export PNG and video: identical to the canvas.

Limits: crumbs are placed per pixel block, not simulated; nothing accumulates between frames. Lumen Print's Washout also eats highlights into paper, smoothly; Erosion is the rough, fragmented version.
