# Color Halos — focused manual test

Scope: roadmap 6.1 #3. References: 08 (gradient-mapped halos around type and a star) and 04 (cross-shaped flares).

## Basics

1. Group a big dark Text layer with Color Halos above it, over a photo or a pale background. New layers start on **Gradient Maps**: crisp letters on top, a red/orange core and a blue outer rim spreading beyond the letters, like 08.
2. **Style**: Gradient Maps (08), Aura (light shapes glow purple to white), Cross Flare (04: orange cross streaks from small bright points, soft halos round dark shapes), Contour Bands (flat banded contours). Editing any control or the ramp shows **Custom**.
3. **Halo ramp**: the left end colors the outer edge, the right end the core.

## Controls to push

- **Glow From:** Dark shapes, Light shapes, Cutout (text and transparent images).
- **Threshold:** keeps the paper itself from tinting.
- **Spread / Intensity / Fade:** size, how far the inner colors reach, softness of the outer edge.
- **Bands:** 0 smooth; higher values give flat contour bands with clean edges.
- **Keep Shape:** draws the crisp original over its halo; off lets the shape melt into the halo, like the star in 08.
- **Cross Flare:** Flare, Flare Length, Flare Threshold, Flare Color. Only small bright points flare; large bright areas do not.

## Persistence and export

Save/reload, duplicate, undo a style change: settings return exactly. Export PNG and video: identical to the canvas.

Limits: the halo field is computed at reduced resolution and upsampled, so it is always smooth; very fine detail does not get its own halo. Cross flares need small light points in the image.
