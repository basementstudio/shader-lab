---
"@basementstudio/shader-lab": minor
---

Connected Dots gains Edge Snap, which pulls each point onto the strongest image edge inside its cell so dots, links and mesh triangles trace contours, and two styles that use it: Contour Graph and Facets. At 0 (the default, and for every existing style and saved project) the output is unchanged. Mesh mode now reads its points from the per-cell pre-pass, about twice as fast at 1080p with identical pixels.
