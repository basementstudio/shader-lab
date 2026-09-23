# Blur — focused manual test

Scope: the new Blur layer that replaces Directional Blur and Progressive Blur in the add-layer menu (both keep working in saved projects). Reference: 31 (Golden Horse depth of field).

## Depth of field

1. Add a photo with a clear near subject, **Estimate** its depth map, then add **Blur** above it. New layers start on **Depth of Field**: the nearest parts stay sharp and everything behind melts into large, smooth, grainy blur.
2. Move **Focus** (1 is nearest) to pull focus to the background; **Focus Range** widens the sharp zone; **Transition** sets how gradually blur builds.
3. Without a depth map, Depth leaves the image sharp.

## Other modes

- **Tilt-Shift** (Linear): a sharp horizontal band; move **Center** and **Band Angle**.
- **Vignette** (Radial): a sharp spot, blurred corners.
- **Soft** (Uniform) and **Luminance** (Focus is the tone threshold).
- **Invert Focus** blurs the focus zone instead.
- **Kind**: Gaussian (smooth), Lens (disc bokeh; **Highlights** turns bright spots into luminous discs), Motion (**Motion Angle**).
- **Radius** up to 400 document pixels stays smooth: no ripples, blocks or ghost copies.
- **Grain / Grain Size / Grain in Blur**: 0 spreads grain evenly, 1 keeps it to the blurred areas.

## Scope, persistence and export

1. Blur a text layer inside a group: the soft edge spreads past the letters with no dark fringe.
2. Save/reload, duplicate, undo a style change. Export PNG and video: identical to the canvas.
3. The add-layer menu no longer lists Directional Blur, Progressive Blur or Fluted Glass; an old project using them still renders them.

Limits: depth of field gathers from each pixel's own depth, so a sharp near object does not bleed over a blurred background.
