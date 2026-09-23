---
"@basementstudio/shader-lab": minor
---

Brush masks gain Feather: painted mask edges soften by a keyframable radius, sampled on the GPU with three rings around each pixel. Feather 0 keeps a hard painted edge; the existing default of 0.01 softens old brush masks very slightly.
