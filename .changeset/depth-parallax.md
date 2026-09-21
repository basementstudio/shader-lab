---
"@basementstudio/shader-lab": patch
---

Image layers accept a grayscale depth map as a second asset (`depthAsset` in the runtime config) and gain Depth controls: invert, range, focus plane, orbit/sway/nod/dolly camera motion with amount and speed, a keyframable camera offset, stretched or transparent edges, march quality and a depth preview. The pass marches depth layers from near to far with binary refinement so nearer content covers what is behind it. Layers without a depth map keep the previous shader. An **Estimate** button generates the depth map in the browser with Depth Anything V2 Small (transformers.js in a Web Worker, WebGPU with a WASM fallback) and attaches it as a local asset.
