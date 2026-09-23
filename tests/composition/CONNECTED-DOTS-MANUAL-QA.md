# Connected Dots — focused manual test

Scope: roadmap 3.4 idea "Retrato de puntos conectados". Reference: 21.

## Basics

1. Put Connected Dots above a portrait. New layers start on **Portrait Graph**: loose dots in the highlights, short threads in the midtones, dense linked graphs with holes in the shadows, each dot and link colored by tone from the palette, on flat gray, like 21.
2. **Style**: Portrait Graph, Ink Blobs (black liquid masses on paper), Plexus (thin network on black), Constellation (sparse plus-shaped stars in the source colors with long thin links). Motion is not part of a style.

## Controls to push

- **Mode**: Graph, Blobs, Plexus. **Spacing**, **Jitter** (grid to organic), **Cutoff** (drops light tones so the background shows), **Invert**.
- **Dots**: Shape (circle, square, plus, ring), Min Size, Max Size.
- **Links**: Links, Link Threshold, Thin Links, Thick Links; Blobiness for Blobs; Range and Line Width for Plexus.
- **Color**: Palette by tone (each tone takes its nearest ramp stop as a flat color; up to 8 stops), Source colors, Ink. Background: Color, Image or Transparent.
- **Motion**: Drift and Speed make points wander so links form and break; Seed rearranges everything.

## Scope, persistence and export

Group it with a photo. Save/reload, duplicate, undo a style change. Export PNG and video: identical to the canvas; with Drift the export animates.

Limits: each point links only to its 8 grid neighbors, so Plexus range tops out below three spacings. Mesh (triangulated fills) and snapping points to edges are planned as a second pass.
