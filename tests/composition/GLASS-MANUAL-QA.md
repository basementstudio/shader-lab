# Glass — focused manual test

Scope: the new Glass layer that replaces Fluted Glass in the add-layer menu (Fluted Glass keeps working in saved projects). References: 26 to 30 (reeded, hammered, pyramid, reeded fern, hex).

## Basics

1. Put Glass above a photo. New layers start on **Reeded**: vertical flutes you see through, each a squeezed slice of the image, with thin bright rims between flutes.
2. **Style**: Reeded, Frosted Reeded, Hammered, Pyramid, Hex, Frosted. A style sets the pattern, lens and surface; Angle, Distance From, Light Angle and Tint stay as you set them.

## The fern look (reference 29)

1. Estimate the photo's depth map. On Glass set **Distance From: Depth** and **Distance** about 40.
2. Expect things near the camera to stay sharp and sliced into strips, and things further back to melt behind the flutes.

## Controls to push

- **Pattern / Profile (Round or Sharp) / Cell Size / Angle / Irregularity.**
- **Refraction:** low values magnify each flute or cell; 0.5 focuses it to a line; 1 mirrors it into a flipped mini image (pyramid and hex look like 28 and 30).
- **Distance** and **Distance From**: blur of the scene behind the glass.
- **Frost / Frost Size, Highlights / Light Angle, Edges, Dispersion, Tint / Tint Amount.**

## Scope, persistence and export

Group it with a photo to keep the glass on that photo. Save/reload, duplicate, undo a style change. Export PNG and video: identical to the canvas.

Limits: each cell refracts the image as a flat lens; there is no real thickness, caustics or reflection of the room.
