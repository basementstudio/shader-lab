# Grain — focused manual test

Scope: roadmap 6.6 #3. A standalone film grain layer for photos and video, instead of animating Lumen Print's grain. References: 31 (fine grain in the blurred transitions, clean blacks), 22 (visible color grain in the sky), 06 and 12 (soft, clumpy 16mm grain), 07 (coarse pushed grain).

## Basics

1. Add a photo, then **Grain** (Core, after Lumen Print). New layers start on **Fine 35mm** at Speed 1: fine monochrome grain, strongest in the midtones, pure black and white untouched.
2. **Style**: Fine 35mm, Color Negative (22), 16mm (06, 12), Pushed (07), Digital Noise (sensor noise, reaches into the blacks). Editing any look control shows **Custom**; Speed and Seed are not part of a style and stay as you set them.
3. Zoom the canvas to 200–400%: the grain should read as dark silver specks and soft clumps, not a regular pattern, square cells or white frost.

## Controls to push

- **Amount**, **Size** (document pixels), **Roughness** (soft grain to crisp, gritty grain), **Clumping** (grain gathers into patches and mottling).
- **Chroma**: 0 is monochrome; toward 1 each dye layer gets its own grain. Brightness stays the same, only the color varies.
- **Response**: 0.5 puts the grain in the midtones; drag toward 0 on a dark photo and toward 1 on a bright one.
- **Grain Blend**: Soft Light (clean blacks and whites), Overlay (punchier midtones), Add (noise everywhere, including pure black).
- **Motion**: Speed 0 holds one pattern and the canvas stops redrawing; at 1 the grain changes 24 times a second, each frame a new pattern that never slides; 0.5 is 12 a second. Seed picks another pattern.

## Scope, persistence and export

1. Put Grain over a video (for example the default aura clip): the grain changes every frame while the video plays; at Speed 0 it stays fixed over the moving picture.
2. Put Grain over a transparent PNG or text: transparent areas stay transparent.
3. Group it with a photo: layers outside the group get no grain.
4. Save/reload, duplicate, undo a style change: settings return exactly.
5. Export PNG at 1x and 2x: the grain is the same size relative to the image. Export video with Speed > 0: the grain animates in the file as on the canvas.

Limits: the grain is procedural (no scanned film plates) and has no frame-to-frame memory. Very small sizes (below 1 document pixel) at 1x show as per-pixel noise; they resolve into grain at higher export resolutions.
