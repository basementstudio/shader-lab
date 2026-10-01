---
"@basementstudio/shader-lab": patch
---

Render the V3 effect layers with less GPU work and no visual change: Connected Dots reads its dot sites from a per-cell pre-pass (about 9x faster at 1080p), and Displaced Rings, Glass, Blur, Plotter, Signal Rot, Outline, Photocopy, Erosion, Lumen Print, Dot Grid and Relief skip work their current settings don't use. Blob Tracking stops requesting continuous rendering once its output settles on a still image, and Annotations only re-read their Edges field when the image below changes. Outline, Flares and Relief no longer read the wrong texture when their shader compiles before the first frame.
