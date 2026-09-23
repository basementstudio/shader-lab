# Relief — focused manual test

Scope: roadmap 6.1 #5, engraved relief. Reference: 15 (silver plate). The user asked for both emboss and deboss.

## Basics

1. Add a photo, then **Relief** (Core, after Dot Grid). New layers start on **Silver Plate**: a silver surface, the image embossed with bright rims top left and shadows bottom right, a radial engraved burst that fades out at the center, stippled grain.
2. **Relief**: switch **Emboss** / **Deboss**. The lit and shaded rims swap; deboss reads as pressed into the surface.
3. **Style**: Silver Plate (15), Letterpress (deboss, paper), Blind Emboss (white paper), Gold Foil, Source Relief (lights the photo's own colors). A style sets everything except Height From.

## Height and light

- **Height From:** Luminance (bright is raised), Depth (the depth map of the Image layer below; Estimate one first), Cutout (text and transparent images raised by their shape).
- **Depth / Bevel:** steepness and rim width. Wide bevels look rounded.
- **Light Angle / Elevation / Ambient:** 135 is top left; a low elevation rakes across the surface.

## Surface and engraving

- **Surface:** Color (single material) or Source colors; Specular / Shininess for metal; Grain / Grain Size.
- **Engrave:** None, Parallel lines (with Line Angle) or Radial burst; Engrave Depth, Line Spacing. Lines cut deeper in dark areas.

## Letterpress check

Group a Text layer with Relief above it, Height From Cutout, Deboss, Surface Source colors: the letters look pressed in, shadowed on the top-left inner walls.

## Persistence and export

Save/reload, duplicate, undo a style change: settings return exactly. Export PNG and video: identical to the canvas.

Limits: one light, no cast shadows. With Cutout, the rim outside the shape falls outside its coverage; put the text over a paper layer and use Luminance to press into a sheet.
