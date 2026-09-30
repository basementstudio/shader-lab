---
"@basementstudio/shader-lab": minor
---

Shape layers can draw an SVG: set `shape: "svg"` and give the layer an image `asset` pointing at the file. The SVG becomes a signed distance field, so its edges stay sharp at any size and Softness and Outline work as on the built-in shapes. `svgColorMode: "original"` keeps the file's colors, and `svgPalette` (a JSON map from a file color to a new color) recolors them; `"single"` fills the shape with `color`.
