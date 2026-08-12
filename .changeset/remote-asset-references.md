---
"@basementstudio/shader-lab": patch
---

Set `crossOrigin="anonymous"` on video textures so media served from a CDN can be
uploaded as a WebGPU texture without tainting the canvas. Previously a
cross-origin video would render but break any subsequent canvas readback.
