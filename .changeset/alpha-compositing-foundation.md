---
"@basementstudio/shader-lab": patch
---

Preserve alpha when copying external input textures and applying effect passes. Source layers use straight-alpha source-over blending; effect passes preserve input coverage and retain their existing alpha-as-strength behavior. Opaque compositions and legacy mask semantics are unchanged.
