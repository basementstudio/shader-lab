# Lumen Print — focused manual test

Scope: roadmap 3.4 consolidation. One effect layer that absorbs Lumen print, altered photo development (3.2) and burned false color (6.1 #1). References: 06, 07, 12, 14 (and 10 for washed false color).

## Basics

1. Add a photo, then **Lumen Print** (Core, after Gradient Map). New layers start on the **Lumen** style: plum shadows, pink/ochre mids, cream paper, soft halo, darker borders, grain.
2. **Style**: Lumen, Cyanotype, Burned (07), Sabattier (12), Washed (06), Eroded (14). A style sets every control; touching any control or the palette shows **Custom**.
3. **Palette**: the right end is the paper. Washout burns highlights into that color.
4. **Amount** 0 restores the photo.

## Controls to push

- **Tone:** Solarize folds tones past the Pivot (low Pivot → negative, high Pivot → only highlights reverse). Edge Lines adds bright rims along contours.
- **Light:** Diffusion softens, Halation glows bright areas; Spread sets their reach.
- **Surface:** Washout + Ragged Edge eat the image into paper with a torn edge; Edge Burn darkens the sheet borders; Grain / Grain Size; Seed reshuffles the noise.

## Scope, persistence and export

1. Group it with a photo and mask it (brush/ellipse): only that area prints. External layers stay untouched.
2. Save/reload, duplicate, undo a style change: settings return exactly.
3. Export PNG/video and play a video below it: output matches the canvas; grain is fixed to the sheet, not animated.

Limits: the palette is not animatable; numeric controls are. Grain does not animate over time. Eroded is the roughest style and may need tuning.
