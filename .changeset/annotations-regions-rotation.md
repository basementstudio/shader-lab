---
"@basementstudio/shader-lab": minor
---

Annotations can place marks by image regions, draw connected dots and turn individual elements. Placement → Regions groups the image below into areas of similar tone and color from the same low-resolution field Edges already reads, then frames regions with boxes, traces their outlines with dots and tags them with labels; region ids persist across video frames so marks follow the image instead of flickering. Connected Dots adds small constellations of dots linked to their nearest neighbours. Rotation Jitter turns rings, crosses and boxes by a seeded angle, and Align to Edges turns them along the image edges or each region's long axis. All new controls default to off, so existing annotations render exactly as before.
