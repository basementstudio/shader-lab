# Signal Rot — focused manual test

Scope: roadmap 3.4 consolidation. One effect layer that absorbs Signal rot and scanner drag (6.1 #4). Reference: 13. Distinct from Slice (blocky band offsets), CRT (display) and Circuit Bent (bent scanlines).

## Basics

1. Add a photo, then **Signal Rot** (Distort). New layers start on **Scanner Drag**: vertical held streaks with wavy fronts, sideways wobble, torn bands, white dropouts from the left edge.
2. **Style**: Scanner Drag (13), Signal Rot (animated row jitter, chroma, crushed levels), Torn Scan (large dropouts). Editing any control shows **Custom**.
3. **Streaks**: Vertical or Horizontal swaps every axis.

## Controls to push

- **Drag:** Drag and Drag Length hold the image into streaks; Stretch varies the scan speed; Wobble / Wobble Scale make the image snake.
- **Tear:** Tear shifts ragged bands; Band Size; Dropout and Dropout Color lift parts of bands off to paper.
- **Signal:** Chroma Shift, Crush, Line Noise.
- **Motion:** Speed 0 freezes the damage; above 0 it rots over time (steps 8 times a second, wobble drifts). Seed rearranges it.

## Scope, persistence and export

1. Group it with a photo: layers outside the group stay intact.
2. Save/reload, duplicate, undo a style change: settings return exactly.
3. Export PNG and video: output matches the canvas; with Speed > 0 the export animates.

Limits: every control is a remap of one frame; nothing accumulates between frames (no feedback trails). Busy photos show richer streaks than flat skies.
