# Dot Grid — focused manual test

Scope: roadmap 3.4 consolidation, the dot screen of 6.1 #2. Reference: 04. Halftone is untouched: it stays the print simulation (angles, CMYK, dot gain); Dot Grid is exact and unrotated.

## Basics

1. Add a photo, then **Dot Grid** (Core, after Halftone). New layers start on **Coordinate**: pale blue paper covered in a uniform grid of tiny specks, dots growing only in dark areas, a soft blurred copy of the image underneath.
2. **Style**: Coordinate (04), Source Dots (dots in the image colors), Night (light dots on black), Pixel Grid (squares, no underlay). Editing any control shows **Custom**.

## Controls to push

- **Spacing:** grid pitch in document pixels. The grid is centered on the artboard and does not move when the window resizes.
- **Min Dot / Max Dot:** speck size on empty paper and full size in the darkest areas; above 1 dots merge.
- **Level / Contrast:** where dots start to grow and how fast. A high Level keeps light areas at the minimum speck.
- **Softness:** blurs the tone each dot reads so shapes fade out into smaller dots.
- **Shape, Invert, Ink (single color / source colors), Background, Underlay, Underlay Blur.**

## Scope, persistence and export

1. Group it with a photo and mask it: only that area becomes dots.
2. Save/reload, duplicate, undo a style change: settings return exactly.
3. Export PNG and video: identical to the canvas; the grid stays fixed while video plays underneath.

Limits: no screen angle, no CMYK, no per-dot jitter. The cross-shaped flares in 04 belong to the later Color Halos family.
